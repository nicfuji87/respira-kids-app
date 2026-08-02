// AI dev note: Recebe o callback de Pix recebido do Banco Inter e marca a venda paga
// (fn_registrar_pix_recebido), o que dispara o trigger de baixa de estoque.
//
// Pública de propósito (verify_jwt=false): o Inter não manda JWT do Supabase.
// A defesa é outra: só age sobre um txid que NÓS criamos e gravamos na venda. Um
// txid desconhecido não faz nada. O valor pago fica registrado para conferência.
//
// O Inter reenvia até 4x (20/30/60/120 min) se a resposta não for sucesso, então
// respondemos 200 sempre que o payload for compreendido — inclusive para evento
// repetido (a RPC é idempotente). 200 aqui significa "recebi", não "era válido".

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

interface PixRecebido {
  txid?: string;
  endToEndId?: string;
  valor?: string;
  horario?: string;
}

// Enfileira o aviso de pagamento confirmado para o n8n mandar no WhatsApp.
// Best-effort de propósito: nunca lança. A venda já está paga e o estoque já
// baixou — se o aviso falhar, o prejuízo é o cliente não receber um "obrigado",
// e devolver erro aqui faria o Inter reenviar o callback inteiro sem necessidade.
async function avisarPagamentoConfirmado(
  admin: ReturnType<typeof createClient>,
  vendaId: string
): Promise<void> {
  try {
    const { data: venda } = await admin
      .from('produto_vendas')
      .select(
        'id, paciente_id, responsavel_cobranca_id, valor_total, itens:produto_venda_itens (quantidade, produto:produto_id (nome))'
      )
      .eq('id', vendaId)
      .single();
    if (!venda) return;

    const itens = (venda.itens ?? []) as unknown as {
      quantidade: number;
      produto: { nome?: string } | null;
    }[];
    const descricao = itens
      .map((i) => `${i.quantidade}x ${i.produto?.nome ?? 'Produto'}`)
      .join(', ');

    await admin.from('webhook_queue').insert({
      evento: 'venda_produto_paga',
      payload: {
        tipo: 'venda_produto_paga',
        timestamp: new Date().toISOString(),
        webhook_id: crypto.randomUUID(),
        data: {
          venda_id: venda.id,
          paciente_id: venda.paciente_id,
          responsavel_cobranca_id: venda.responsavel_cobranca_id,
          valor_total: Number(venda.valor_total),
          itens_descricao: descricao,
        },
      },
      status: 'pendente',
      tentativas: 0,
      max_tentativas: 3,
    });
  } catch (e) {
    console.warn('[inter-webhook-pix] falha ao enfileirar aviso:', e);
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok');
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  let bruto = '';
  try {
    bruto = await req.text();
    const corpo = JSON.parse(bruto) as
      | { pix?: PixRecebido[] }
      | PixRecebido[]
      | PixRecebido;

    // o Inter manda { pix: [...] }; aceitamos as outras formas por robustez
    const lista: PixRecebido[] = Array.isArray(corpo)
      ? corpo
      : Array.isArray((corpo as { pix?: PixRecebido[] })?.pix)
        ? (corpo as { pix: PixRecebido[] }).pix
        : [corpo as PixRecebido];

    const resultados: unknown[] = [];

    for (const pix of lista) {
      if (!pix?.txid) {
        resultados.push({ ok: false, motivo: 'sem_txid' });
        continue;
      }

      const { data, error } = await admin.rpc('fn_registrar_pix_recebido', {
        p_txid: pix.txid,
        p_e2eid: pix.endToEndId ?? null,
        p_valor: pix.valor ? Number(pix.valor) : null,
      });

      if (error) {
        console.error(
          '[inter-webhook-pix] RPC falhou:',
          error.message,
          pix.txid
        );
        // devolver erro faz o Inter reenviar — é o que queremos num erro nosso
        return new Response(
          JSON.stringify({ error: 'Falha ao processar', txid: pix.txid }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }

      console.log('[inter-webhook-pix] processado:', JSON.stringify(data));
      resultados.push(data);

      // avisa o cliente que o Pix caiu — só na primeira vez (o Inter reenvia
      // o mesmo evento) e nunca bloqueando: o estoque já baixou, e falhar em
      // notificar não pode fazer o Inter reenviar tudo de novo.
      const r = data as {
        ok?: boolean;
        ja_processado?: boolean;
        venda_id?: string;
      };
      if (r?.ok && !r.ja_processado && r.venda_id) {
        await avisarPagamentoConfirmado(admin, r.venda_id);
      }
    }

    return new Response(JSON.stringify({ recebido: true, resultados }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(
      '[inter-webhook-pix] payload inválido:',
      msg,
      bruto.slice(0, 500)
    );
    // payload que não entendemos não melhora com retry: encerra com 200
    return new Response(JSON.stringify({ recebido: true, ignorado: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
