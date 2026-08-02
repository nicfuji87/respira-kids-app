// AI dev note: Pagamento de boleto/DARF e transferência Pix pela conta do Inter.
//
// ESTA FUNÇÃO TIRA DINHEIRO DA CONTA. Pix enviado não volta. As travas abaixo
// não são burocracia — são o que separa um bug de um prejuízo:
//
//   1. Só admin. Secretaria não paga, nem por engano.
//   2. Teto por operação e teto por dia, conferidos NO SERVIDOR (o cliente pode
//      mentir; o servidor não pergunta).
//   3. `confirmacao` textual obrigatória: uma requisição malformada ou um replay
//      não passa sem ela.
//   4. Auditoria gravada ANTES da chamada ao banco. Se a função morrer no meio,
//      sobra o rastro — o pior cenário é dinheiro sair sem registro nenhum.
//
// Limites via secret (INTER_LIMITE_UNITARIO / INTER_LIMITE_DIARIO). Os defaults
// são deliberadamente baixos: é melhor a primeira operação grande falhar e
// alguém ajustar conscientemente do que um teto alto passar despercebido.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { pagarBoleto, pagarDarf, enviarPix } from '../_shared/inter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const LIMITE_UNITARIO_PADRAO = 2000;
const LIMITE_DIARIO_PADRAO = 5000;
const CONFIRMACAO_ESPERADA = 'CONFIRMO O PAGAMENTO';

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface Requisicao {
  tipo?: 'boleto' | 'darf' | 'pix';
  valor?: number;
  confirmacao?: string;
  descricao?: string;
  // boleto
  codigo_barras?: string;
  data_pagamento?: string;
  // pix
  chave?: string;
  favorecido?: string;
  // darf
  darf?: Record<string, unknown>;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  let auditoriaId: string | null = null;

  try {
    // ---- quem está mandando? só admin ----
    const jwt = (req.headers.get('Authorization') ?? '')
      .replace('Bearer ', '')
      .trim();
    if (!jwt) return json({ error: 'Não autenticado' }, 401);

    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return json({ error: 'Sessão inválida' }, 401);
    }

    const { data: pessoa } = await admin
      .from('pessoas')
      .select('id, role, ativo, bloqueado, is_approved')
      .eq('auth_user_id', userData.user.id)
      .single();

    if (
      !pessoa ||
      pessoa.role !== 'admin' ||
      !pessoa.ativo ||
      !pessoa.is_approved ||
      pessoa.bloqueado
    ) {
      return json({ error: 'Apenas admin pode fazer pagamentos' }, 403);
    }

    const body = (await req.json()) as Requisicao;
    const { tipo, valor, confirmacao, descricao } = body;

    // ---- validações duras ----
    if (!tipo || !['boleto', 'darf', 'pix'].includes(tipo)) {
      return json({ error: "tipo deve ser 'boleto', 'darf' ou 'pix'" }, 400);
    }
    if (confirmacao !== CONFIRMACAO_ESPERADA) {
      return json(
        {
          error: `Confirmação ausente. Envie confirmacao="${CONFIRMACAO_ESPERADA}".`,
        },
        400
      );
    }
    if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) {
      return json({ error: 'Valor inválido' }, 400);
    }

    const limiteUnitario = Number(
      Deno.env.get('INTER_LIMITE_UNITARIO') ?? LIMITE_UNITARIO_PADRAO
    );
    const limiteDiario = Number(
      Deno.env.get('INTER_LIMITE_DIARIO') ?? LIMITE_DIARIO_PADRAO
    );

    if (valor > limiteUnitario) {
      return json(
        {
          error: `Valor acima do teto por operação (R$ ${limiteUnitario.toFixed(2)}). Ajuste INTER_LIMITE_UNITARIO se for intencional.`,
        },
        422
      );
    }

    const { data: totalHoje } = await admin.rpc('fn_inter_total_pago_hoje');
    const jaPago = Number(totalHoje ?? 0);
    if (jaPago + valor > limiteDiario) {
      return json(
        {
          error: `Teto diário estourado. Já saíram R$ ${jaPago.toFixed(2)} hoje e o limite é R$ ${limiteDiario.toFixed(2)}.`,
        },
        422
      );
    }

    if (tipo === 'boleto' && !body.codigo_barras) {
      return json({ error: 'codigo_barras é obrigatório para boleto' }, 400);
    }
    if (tipo === 'pix' && !body.chave) {
      return json({ error: 'chave é obrigatória para Pix' }, 400);
    }
    if (tipo === 'darf' && !body.darf) {
      return json({ error: 'darf é obrigatório' }, 400);
    }

    // ---- auditoria ANTES de tocar no banco ----
    const { data: auditoria, error: audErr } = await admin
      .from('inter_pagamentos')
      .insert({
        tipo,
        valor,
        descricao: descricao ?? null,
        codigo_barras: body.codigo_barras ?? null,
        chave_pix: body.chave ?? null,
        favorecido: body.favorecido ?? null,
        status: 'enviando',
        solicitado_por: pessoa.id,
      })
      .select('id')
      .single();

    if (audErr || !auditoria) {
      // sem trilha de auditoria não se paga: preferimos falhar aqui
      return json(
        {
          error: 'Não foi possível registrar a auditoria; pagamento cancelado.',
        },
        500
      );
    }
    auditoriaId = auditoria.id as string;

    // ---- a chamada que move o dinheiro ----
    let resposta: Record<string, unknown>;
    if (tipo === 'boleto') {
      resposta = await pagarBoleto({
        codBarraLinhaDigitavel: body.codigo_barras!,
        valorPagar: valor,
        dataPagamento: body.data_pagamento,
      });
    } else if (tipo === 'darf') {
      resposta = await pagarDarf(body.darf!);
    } else {
      resposta = await enviarPix({
        valor,
        chave: body.chave!,
        descricao,
      });
    }

    await admin
      .from('inter_pagamentos')
      .update({
        status: 'sucesso',
        resposta,
        concluido_em: new Date().toISOString(),
      })
      .eq('id', auditoriaId);

    return json({ ok: true, auditoria_id: auditoriaId, resposta });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[inter-pagar]', msg);

    // fechar a trilha importa mais que a resposta: sem isso o valor continuaria
    // contando no teto diário como se estivesse em voo para sempre
    if (auditoriaId) {
      await admin
        .from('inter_pagamentos')
        .update({
          status: 'erro',
          erro: msg.slice(0, 1000),
          concluido_em: new Date().toISOString(),
        })
        .eq('id', auditoriaId);
    }

    return json({ error: msg, auditoria_id: auditoriaId }, 500);
  }
});
