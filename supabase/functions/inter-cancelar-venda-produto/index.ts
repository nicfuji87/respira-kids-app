// AI dev note: Cancela uma venda de produto. Dois cenários, consequências distintas:
//
//   aguardando_pagamento -> cancela a cobrança Pix no Inter. Nada de dinheiro
//                           envolvido, estoque nem foi baixado.
//   pago                 -> devolve as unidades ao estoque SEMPRE, mas só devolve
//                           o dinheiro se quem chamou pedir explicitamente
//                           (devolver_pix: true).
//
// O estorno é opt-in de propósito: cancelar uma venda por engano não pode disparar
// uma transferência. Sem a flag, a venda fica cancelada com o estoque de volta e o
// dinheiro pendente de devolução manual — situação recuperável. O contrário não é.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { cancelarCobrancaPix, devolverPix } from '../_shared/inter.ts';

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

// id da devolução: até 35 chars alfanuméricos, serve de chave de idempotência
function gerarIdDevolucao(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return (
    'dev' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  );
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const jwt = (req.headers.get('Authorization') ?? '')
      .replace('Bearer ', '')
      .trim();
    if (!jwt) return json({ error: 'Não autenticado' }, 401);

    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user)
      return json({ error: 'Sessão inválida' }, 401);

    const { data: pessoa } = await admin
      .from('pessoas')
      .select('id, role, ativo, bloqueado, is_approved')
      .eq('auth_user_id', userData.user.id)
      .single();

    const podeCancelar =
      pessoa &&
      ['admin', 'secretaria'].includes(pessoa.role as string) &&
      pessoa.ativo &&
      pessoa.is_approved &&
      !pessoa.bloqueado;
    if (!podeCancelar) return json({ error: 'Sem permissão' }, 403);

    // devolver dinheiro é privilégio de admin, não de secretaria
    const { venda_id, motivo, devolver_pix } = (await req.json()) as {
      venda_id?: string;
      motivo?: string;
      devolver_pix?: boolean;
    };
    if (!venda_id) return json({ error: 'venda_id é obrigatório' }, 400);
    if (devolver_pix && pessoa.role !== 'admin') {
      return json({ error: 'Apenas admin pode devolver o pagamento' }, 403);
    }

    const { data: venda, error: vErr } = await admin
      .from('produto_vendas')
      .select('id, status, valor_total, inter_txid, pago_e2eid, pago_valor')
      .eq('id', venda_id)
      .single();
    if (vErr || !venda) return json({ error: 'Venda não encontrada' }, 404);
    if (venda.status === 'cancelado') {
      return json({ ja_cancelada: true, venda_id });
    }

    const avisos: string[] = [];
    let estorno: { e2eid?: string; valor?: number } = {};

    // ---- caso 1: ainda não paga -> cancelar a cobrança no Inter ----
    if (venda.status !== 'pago' && venda.inter_txid) {
      try {
        await cancelarCobrancaPix(venda.inter_txid);
      } catch (e) {
        // cobrança já expirada/removida não impede o cancelamento interno
        avisos.push(
          `Não foi possível cancelar a cobrança no Inter: ${
            e instanceof Error ? e.message : String(e)
          }`
        );
      }
    }

    // ---- caso 2: paga e pediram devolução -> devolver o Pix ----
    if (venda.status === 'pago' && devolver_pix) {
      if (!venda.pago_e2eid) {
        return json(
          {
            error:
              'Venda paga sem EndToEndId registrado — devolução precisa ser feita manualmente no Inter',
          },
          422
        );
      }
      const valor = Number(venda.pago_valor ?? venda.valor_total);
      const idDevolucao = gerarIdDevolucao();
      const resp = await devolverPix(venda.pago_e2eid, idDevolucao, valor);
      estorno = { e2eid: venda.pago_e2eid, valor };
      avisos.push(`Devolução solicitada: ${resp?.status ?? 'enviada'}`);
    } else if (venda.status === 'pago') {
      avisos.push(
        'Estoque devolvido. O dinheiro NÃO foi estornado — faça a devolução manualmente ou chame de novo com devolver_pix.'
      );
    }

    // ---- estado interno (devolve estoque se estava paga) ----
    const { data: resultado, error: rpcErr } = await admin.rpc(
      'fn_cancelar_venda_produto',
      {
        p_venda_id: venda_id,
        p_motivo: motivo ?? null,
        p_estorno_e2eid: estorno.e2eid ?? null,
        p_estorno_valor: estorno.valor ?? null,
      }
    );
    if (rpcErr) return json({ error: rpcErr.message }, 500);

    return json({ ...(resultado as object), avisos });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[inter-cancelar-venda-produto]', msg);
    return json({ error: msg }, 500);
  }
});
