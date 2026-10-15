// AI dev note: Comprovante de um Pix enviado pelo Inter (SÓ LEITURA, não move dinheiro).
//
// Quem chama: o fluxo de avisos da @ju no n8n (service role) depois que o Pix pedido
// no grupo de notas é pago, ou um admin logado. Consulta o Pix pelo codigoSolicitacao
// guardado em inter_pagamentos.resposta, grava em inter_pagamentos.comprovante e devolve
// o essencial (recebedor, documento, banco, E2E, data/hora) para a Ju postar no grupo.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { consultarPixEnviado } from '../_shared/inter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// O formato da resposta do Inter varia entre versões; procura o campo onde estiver.
function achar(obj: unknown, nomes: string[]): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (nomes.includes(k) && v !== null && v !== '' && typeof v !== 'object')
      return v;
  }
  for (const v of Object.values(obj as Record<string, unknown>)) {
    const achado = achar(v, nomes);
    if (achado !== undefined) return achado;
  }
  return undefined;
}

// Primeiro subobjeto com um destes nomes (o recebedor vem num bloco próprio; o
// pagador, noutro — buscar "nome" solto pegaria a clínica).
function bloco(obj: unknown, nomes: string[]): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (nomes.includes(k) && v && typeof v === 'object') return v;
  }
  for (const v of Object.values(obj as Record<string, unknown>)) {
    const achado = bloco(v, nomes);
    if (achado !== undefined) return achado;
  }
  return undefined;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const jwt = (req.headers.get('Authorization') ?? '')
      .replace('Bearer ', '')
      .trim();
    if (!jwt) return json({ error: 'Não autenticado' }, 401);

    if (jwt !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
      const { data: u } = await admin.auth.getUser(jwt);
      if (!u?.user) return json({ error: 'Sessão inválida' }, 401);
      const { data: p } = await admin
        .from('pessoas')
        .select('role, ativo')
        .eq('auth_user_id', u.user.id)
        .single();
      if (!p || p.role !== 'admin' || !p.ativo) {
        return json({ error: 'Apenas admin' }, 403);
      }
    }

    const { inter_pagamento_id } = (await req.json()) as {
      inter_pagamento_id?: string;
    };
    if (!inter_pagamento_id)
      return json({ error: 'inter_pagamento_id obrigatório' }, 400);

    const { data: pag } = await admin
      .from('inter_pagamentos')
      .select('id, tipo, status, valor, chave_pix, resposta, comprovante')
      .eq('id', inter_pagamento_id)
      .single();
    if (!pag || pag.tipo !== 'pix' || pag.status !== 'sucesso') {
      return json({ error: 'Pix não encontrado ou não concluído' }, 404);
    }

    const codigo = (pag.resposta as Record<string, unknown> | null)
      ?.codigoSolicitacao as string | undefined;
    if (!codigo) return json({ error: 'Pix sem codigoSolicitacao' }, 422);

    const bruto = await consultarPixEnviado(codigo);
    const rec = bloco(bruto, ['recebedor', 'favorecido', 'destinatario']);

    const comprovante = {
      codigo_solicitacao: codigo,
      e2e: achar(bruto, ['endToEndId', 'endToEnd', 'e2eId', 'e2e']) ?? null,
      recebedor:
        (rec
          ? achar(rec, ['nome', 'nomeRecebedor', 'nomeFavorecido'])
          : achar(bruto, ['nomeRecebedor', 'nomeFavorecido'])) ?? null,
      documento:
        (rec
          ? achar(rec, ['cpfCnpj', 'documento'])
          : achar(bruto, ['cpfCnpjRecebedor'])) ?? null,
      banco:
        (rec
          ? achar(rec, ['nomeBanco', 'banco', 'instituicao', 'nomeInstituicao'])
          : null) ?? null,
      data_hora:
        achar(bruto, [
          'dataHoraMovimento',
          'dataHoraSolicitacao',
          'dataPagamento',
          'dataOperacao',
        ]) ?? null,
      situacao: achar(bruto, ['status', 'situacao', 'tipoRetorno']) ?? null,
      valor: pag.valor,
      chave: pag.chave_pix,
      bruto,
    };

    await admin
      .from('inter_pagamentos')
      .update({ comprovante })
      .eq('id', pag.id);

    // "bruto" fica no banco; para quem chama, só o essencial
    const resumo: Record<string, unknown> = { ...comprovante };
    delete resumo.bruto;
    return json({ ok: true, comprovante: resumo });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[inter-pix-comprovante]', msg);
    return json({ error: msg }, 500);
  }
});
