// AI dev note: Saídas do Asaas (Pix/transferência e pagamento de conta) lançadas no financeiro.
//
// Quem chama:
//   * o webhook do Asaas ("Respira Kids · saídas", eventos TRANSFER_DONE e BILL_PAID), com o
//     header asaas-access-token = Vault asaas_saidas_token e ?conta=<contas_bancarias.id>;
//   * o pg_cron (x-cron-token = Vault email_boletos_token), body {conferir:true, dias:N}: lista as
//     saídas pela API (só leitura) para pegar o que o webhook perdeu. {carga:true, desde} = carga
//     inicial, registrada sem aviso no grupo;
//     {simular:true} só devolve o que seria registrado, sem gravar.
// A decisão (baixa em conta aberta, transferência interna, retirada, pré-lançamento) é toda do
// banco: fn_asaas_saida_registrar, idempotente pelo id do Asaas. Esta função nunca move dinheiro.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  createClient,
  type SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { validarArrecadacao, validarLinha } from '../_shared/boleto.ts';

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, 'public', any>;
// deno-lint-ignore no-explicit-any
type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const ASAAS = 'https://api.asaas.com/v3';

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const dia = (s: unknown) => (s ? String(s).slice(0, 10) : null);

function bancoDaLinha(linha: string | null): string | null {
  const d = String(linha ?? '').replace(/\D/g, '');
  return (validarLinha(d) ?? validarArrecadacao(d))?.banco ?? null;
}

// evento/listagem do Asaas → o que o banco entende
function deTransferencia(t: Json, conta: string, origem: string) {
  const ba = t.bankAccount ?? {};
  return {
    asaas_id: String(t.id),
    tipo: 'transferencia',
    conta_bancaria_id: conta,
    valor: Number(t.value),
    data: dia(t.effectiveDate) ?? dia(t.transferDate) ?? dia(t.dateCreated),
    favorecido: ba.ownerName ?? t.account?.name ?? null,
    favorecido_doc: ba.cpfCnpj ?? null,
    descricao: t.description ?? null,
    origem,
    payload: t,
  };
}

function deConta(b: Json, conta: string, origem: string) {
  return {
    asaas_id: String(b.id),
    tipo: 'conta',
    conta_bancaria_id: conta,
    valor: Number(b.value),
    data: dia(b.paymentDate) ?? dia(b.scheduleDate),
    favorecido: b.companyName ?? null,
    favorecido_doc: null,
    descricao: b.description ?? null,
    linha_digitavel: b.identificationField ?? b.barCode ?? null,
    banco_codigo: bancoDaLinha(b.identificationField ?? null),
    origem,
    payload: b,
  };
}

async function registrar(admin: Admin, p: Record<string, unknown>) {
  const { data, error } = await admin.rpc('fn_asaas_saida_registrar', { p });
  if (error) throw new Error(error.message);
  return data as Json;
}

async function asaasGet(token: string, caminho: string): Promise<Json> {
  const r = await fetch(`${ASAAS}${caminho}`, {
    headers: { access_token: token, 'User-Agent': 'RespiraKids/1.0' },
    signal: AbortSignal.timeout(30_000),
  });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok)
    throw new Error(
      `Asaas ${caminho.split('?')[0]} (${r.status}): ${JSON.stringify(corpo).slice(0, 200)}`
    );
  return corpo;
}

// conferência / carga: lista o que saiu desde `desde` em cada conta Asaas com chave
async function conferir(
  admin: Admin,
  desde: string,
  origem: string,
  simular = false
) {
  const resumo: Record<string, unknown>[] = [];
  const { data: contas } = await admin
    .from('contas_bancarias')
    .select('id, asaas_empresa_id')
    .not('asaas_empresa_id', 'is', null)
    .eq('ativo', true);
  for (const c of contas ?? []) {
    const { data: emp } = await admin
      .from('pessoa_empresas')
      .select('api_token_externo')
      .eq('id', c.asaas_empresa_id)
      .single();
    const token = emp?.api_token_externo as string | undefined;
    if (!token) continue;

    for (let offset = 0; offset < 500; offset += 100) {
      const r = await asaasGet(
        token,
        `/transfers?limit=100&offset=${offset}&dateCreated%5Bge%5D=${desde}`
      );
      for (const t of r.data ?? []) {
        if (t.status !== 'DONE') continue;
        if (simular) {
          resumo.push(deTransferencia(t, c.id, origem));
          continue;
        }
        try {
          const x = await registrar(admin, deTransferencia(t, c.id, origem));
          resumo.push({ id: t.id, valor: t.value, ...x });
        } catch (e) {
          resumo.push({ id: t.id, erro: e instanceof Error ? e.message : e });
        }
      }
      if (!r.hasMore) break;
    }
    for (let offset = 0; offset < 500; offset += 100) {
      const r = await asaasGet(token, `/bill?limit=100&offset=${offset}`);
      let antigas = 0;
      for (const b of r.data ?? []) {
        const quando = dia(b.paymentDate) ?? dia(b.scheduleDate) ?? '';
        if (quando < desde) {
          antigas++;
          continue;
        }
        if (b.status !== 'PAID') continue;
        if (simular) {
          resumo.push(deConta(b, c.id, origem));
          continue;
        }
        try {
          const x = await registrar(admin, deConta(b, c.id, origem));
          resumo.push({ id: b.id, valor: b.value, ...x });
        } catch (e) {
          resumo.push({ id: b.id, erro: e instanceof Error ? e.message : e });
        }
      }
      // a lista vem do mais novo para o mais velho: página só com antigas encerra
      if (!r.hasMore || antigas === (r.data ?? []).length) break;
    }
  }
  return resumo;
}

serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  const corpo = (await req.json().catch(() => ({}))) as Json;

  // ---- cron: conferência pela API
  const tokenCron = req.headers.get('x-cron-token');
  if (tokenCron) {
    const { data: esperado } = await admin.rpc('fn_email_boletos_token');
    if (!esperado || tokenCron !== esperado)
      return json({ error: 'Token inválido' }, 401);
    try {
      const dias = Math.min(Math.max(Number(corpo.dias) || 3, 1), 60);
      const desde =
        (corpo.desde && /^\d{4}-\d{2}-\d{2}$/.test(corpo.desde)
          ? corpo.desde
          : null) ??
        new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);
      const resumo = await conferir(
        admin,
        desde,
        corpo.carga ? 'carga' : 'conferencia',
        corpo.simular === true
      );
      return json({ ok: true, desde, saidas: resumo });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  }

  // ---- webhook do Asaas
  const { data: esperado } = await admin.rpc('fn_asaas_saidas_token');
  if (!esperado || req.headers.get('asaas-access-token') !== esperado)
    return json({ error: 'Token inválido' }, 401);
  const conta = new URL(req.url).searchParams.get('conta');
  if (!conta) return json({ error: 'conta ausente' }, 400);

  // sempre 200 depois de autenticado: erro aqui pausaria a fila de webhooks do Asaas; o que
  // falhar a conferência diária pega de novo
  try {
    const evento = String(corpo.event ?? '');
    let r: Json = { ignorado: evento };
    if (evento === 'TRANSFER_DONE' && corpo.transfer)
      r = await registrar(
        admin,
        deTransferencia(corpo.transfer, conta, 'webhook')
      );
    else if (evento === 'BILL_PAID' && corpo.bill)
      r = await registrar(admin, deConta(corpo.bill, conta, 'webhook'));
    return json({ ok: true, ...r });
  } catch (e) {
    console.error('[asaas-saidas]', e instanceof Error ? e.message : e);
    return json({
      ok: false,
      erro: e instanceof Error ? e.message : String(e),
    });
  }
});
