// AI dev note: Cria a cobrança Pix (Banco Inter) de uma venda de produto.
// Sem nota fiscal e sem passar por `faturas` — a cobrança mora em produto_vendas.
//
// Dois caminhos de pagamento saem daqui, sobre a MESMA cobrança:
//   1. QR na tela da recepção (a app desenha a partir do pix_copia_cola)
//   2. Link no WhatsApp (#/pagamento-produto/:token), enfileirado pro n8n
//
// Quem paga baixa o estoque é o webhook (inter-webhook-pix), não esta função.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { criarCobrancaPix } from '../_shared/inter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const EXPIRACAO_SEGUNDOS = 3 * 24 * 60 * 60; // 3 dias

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function gerarToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function somenteDigitos(v: string | null | undefined): string {
  return (v ?? '').replace(/\D/g, '');
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ---- quem está chamando? (só admin/secretaria vendem) ----
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '').trim();
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

    const podeVender =
      pessoa &&
      ['admin', 'secretaria'].includes(pessoa.role as string) &&
      pessoa.ativo &&
      pessoa.is_approved &&
      !pessoa.bloqueado;

    if (!podeVender) {
      return json({ error: 'Sem permissão para gerar cobrança' }, 403);
    }

    // ---- venda ----
    const { venda_id } = (await req.json()) as { venda_id?: string };
    if (!venda_id) return json({ error: 'venda_id é obrigatório' }, 400);

    const { data: venda, error: vendaErr } = await admin
      .from('produto_vendas')
      .select(
        'id, status, valor_total, paciente_id, responsavel_cobranca_id, inter_txid, pix_copia_cola, cobranca_token, ativo'
      )
      .eq('id', venda_id)
      .single();

    if (vendaErr || !venda) return json({ error: 'Venda não encontrada' }, 404);
    if (!venda.ativo) return json({ error: 'Venda inativa' }, 400);
    if (venda.status === 'pago') {
      return json({ error: 'Esta venda já está paga' }, 409);
    }

    // já tem cobrança viva: devolve a mesma, não cria outra (evita cobrança dupla)
    if (venda.inter_txid && venda.pix_copia_cola) {
      return json({
        reaproveitada: true,
        txid: venda.inter_txid,
        pix_copia_cola: venda.pix_copia_cola,
        token: venda.cobranca_token,
      });
    }

    const valor = Number(venda.valor_total);
    if (!(valor > 0)) {
      return json({ error: 'Valor da venda inválido' }, 400);
    }

    const chavePix = Deno.env.get('INTER_CHAVE_PIX');
    if (!chavePix) {
      return json({ error: 'INTER_CHAVE_PIX não configurada' }, 500);
    }

    // ---- descrição + devedor ----
    const { data: itens } = await admin
      .from('produto_venda_itens')
      .select('quantidade, produto:produto_id (nome)')
      .eq('venda_id', venda.id);

    const descricaoItens = (itens ?? [])
      .map((i) => {
        const p = i.produto as unknown as { nome?: string } | null;
        return `${i.quantidade}x ${p?.nome ?? 'Produto'}`;
      })
      .join(', ');

    const { data: responsavel } = await admin
      .from('pessoas')
      .select('nome, cpf_cnpj')
      .eq('id', venda.responsavel_cobranca_id)
      .single();

    const doc = somenteDigitos(responsavel?.cpf_cnpj as string | null);

    const cobranca = await criarCobrancaPix({
      chave: chavePix,
      valor,
      expiracaoSegundos: EXPIRACAO_SEGUNDOS,
      solicitacaoPagador: descricaoItens
        ? `Respira Kids - ${descricaoItens}`
        : 'Respira Kids - produtos',
      devedor: responsavel?.nome
        ? {
            nome: responsavel.nome as string,
            cpf: doc.length === 11 ? doc : undefined,
            cnpj: doc.length === 14 ? doc : undefined,
          }
        : undefined,
    });

    if (!cobranca?.txid || !cobranca.pixCopiaECola) {
      return json(
        { error: 'Inter não devolveu txid/copia-e-cola', detalhe: cobranca },
        502
      );
    }

    const token = venda.cobranca_token ?? gerarToken();
    const expiraEm = new Date(
      Date.now() + EXPIRACAO_SEGUNDOS * 1000
    ).toISOString();

    const { error: upErr } = await admin
      .from('produto_vendas')
      .update({
        inter_txid: cobranca.txid,
        pix_copia_cola: cobranca.pixCopiaECola,
        pix_expira_em: expiraEm,
        cobranca_token: token,
        status: 'aguardando_pagamento',
      })
      .eq('id', venda.id);

    if (upErr) {
      // a cobrança existe no Inter mas não conseguimos guardar: não pode ficar órfã
      return json(
        {
          error: 'Cobrança criada no Inter mas falhou ao gravar na venda',
          txid: cobranca.txid,
          detalhe: upErr.message,
        },
        500
      );
    }

    // ---- webhook pro n8n mandar o link no WhatsApp (não bloqueia a resposta) ----
    const linkPublico = `${Deno.env.get('APP_PUBLIC_URL') ?? 'https://respirakids.com.br'}/#/pagamento-produto/${token}`;

    const { error: whErr } = await admin.from('webhook_queue').insert({
      evento: 'venda_produto_criada',
      payload: {
        tipo: 'venda_produto_criada',
        timestamp: new Date().toISOString(),
        webhook_id: crypto.randomUUID(),
        data: {
          venda_id: venda.id,
          paciente_id: venda.paciente_id,
          responsavel_cobranca_id: venda.responsavel_cobranca_id,
          valor_total: valor,
          itens_descricao: descricaoItens,
          link_pagamento: linkPublico,
          pix_copia_cola: cobranca.pixCopiaECola,
          expira_em: expiraEm,
        },
      },
      status: 'pendente',
      tentativas: 0,
      max_tentativas: 3,
    });
    if (whErr) console.warn('Falha ao enfileirar webhook:', whErr.message);

    return json({
      reaproveitada: false,
      txid: cobranca.txid,
      pix_copia_cola: cobranca.pixCopiaECola,
      token,
      link_pagamento: linkPublico,
      expira_em: expiraEm,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[inter-criar-cobranca-produto]', msg);
    return json({ error: msg }, 500);
  }
});
