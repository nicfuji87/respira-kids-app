// AI dev note: Saídas feitas à mão no app do Inter (Pix e contas pagas) lançadas no financeiro.
//
// O Inter não avisa por webhook o que é pago pelo app, então esta função lê o extrato
// (/banking/v2/extrato/completo, só leitura) e passa cada saída para a mesma regra das saídas do
// Asaas: fn_asaas_saida_registrar com banco 'inter', idempotente por 'inter:<idTransacao>'.
//
// Quem chama: o pg_cron 'inter-saidas' (x-cron-token = Vault email_boletos_token), a cada 30 min
// das 7h às 22h30. Body: {dias:N} (padrão 3), {desde:'AAAA-MM-DD'}, {carga:true} registra sem
// aviso no grupo, {simular:true} só devolve o que seria registrado. Esta função nunca move dinheiro.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  createClient,
  type SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { obterExtrato, type TransacaoExtrato } from '../_shared/inter.ts';
import { validarArrecadacao, validarLinha } from '../_shared/boleto.ts';

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, 'public', any>;
// deno-lint-ignore no-explicit-any
type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const so = (v: unknown) => {
  const s = String(v ?? '').trim();
  return s ? s : null;
};

function bancoDaLinha(linha: string | null): string | null {
  const d = String(linha ?? '').replace(/\D/g, '');
  return (validarLinha(d) ?? validarArrecadacao(d))?.banco ?? null;
}

// O que não é despesa: aplicação automática e pagamento da fatura do cartão (as compras do
// cartão são lançadas uma a uma; a fatura lançada de novo seria despesa em dobro).
function ignorar(t: TransacaoExtrato): string | null {
  const tudo = `${t.tipoTransacao} ${t.titulo ?? ''} ${t.descricao ?? ''}`;
  if (/INVESTIMENTO|APLICA[CÇ][AÃ]O|RESGATE/i.test(tudo)) return 'investimento';
  if (/Pagamento Fatura/i.test(t.descricao ?? '')) return 'fatura do cartão';
  return null;
}

// transação do extrato → o que o banco entende
function deTransacao(t: TransacaoExtrato, conta: string, origem: string) {
  const dt = (t.detalhes ?? {}) as Record<string, unknown>;
  const transferencia = ['PIX', 'TRANSFERENCIA'].includes(
    String(t.tipoTransacao).toUpperCase()
  );
  const linha = so(dt.linhaDigitavel) ?? so(dt.codBarras);
  return {
    banco: 'inter',
    asaas_id: `inter:${t.idTransacao}`,
    tipo: transferencia ? 'transferencia' : 'conta',
    conta_bancaria_id: conta,
    valor: Number(t.valor),
    data: String(t.dataTransacao).slice(0, 10),
    favorecido: transferencia
      ? (so(dt.nomeRecebedor) ?? so(dt.nomeFavorecido) ?? so(t.descricao))
      : (so(dt.nomeDestinatario) ??
        so(dt.empresaEmissora) ??
        so(dt.detalheDescricao) ??
        so(t.descricao)),
    // nas contas pagas o cpfCnpj do extrato é o da própria BC, não o do favorecido
    favorecido_doc: transferencia
      ? (so(dt.cpfCnpjRecebedor) ?? so(dt.cpfCnpjFavorecido))
      : null,
    descricao: transferencia ? so(dt.descricaoPix) : so(t.titulo),
    linha_digitavel: linha,
    banco_codigo: linha ? bancoDaLinha(linha) : null,
    origem,
    payload: t,
  };
}

async function contaInter(admin: Admin): Promise<string> {
  const { data, error } = await admin
    .from('contas_bancarias')
    .select('id')
    .eq('banco_codigo', '077')
    .eq('ativo', true)
    .limit(1)
    .single();
  if (error || !data) throw new Error('Conta do Inter não cadastrada');
  return data.id as string;
}

async function conferir(
  admin: Admin,
  desde: string,
  ate: string,
  origem: string,
  simular: boolean
) {
  const conta = await contaInter(admin);
  const resumo: Record<string, unknown>[] = [];
  for (let pagina = 0; pagina < 20; pagina++) {
    const e = await obterExtrato(desde, ate, pagina, 50);
    for (const t of e.transacoes ?? []) {
      if (String(t.tipoOperacao).toUpperCase() !== 'D') continue;
      const motivo = ignorar(t);
      if (motivo) {
        resumo.push({
          valor: t.valor,
          data: t.dataTransacao,
          ignorado: motivo,
        });
        continue;
      }
      const p = deTransacao(t, conta, origem);
      if (simular) {
        resumo.push({ ...p, payload: undefined });
        continue;
      }
      try {
        const { data, error } = await admin.rpc('fn_asaas_saida_registrar', {
          p,
        });
        if (error) throw new Error(error.message);
        resumo.push({ valor: p.valor, data: p.data, ...(data as Json) });
      } catch (err) {
        resumo.push({
          valor: p.valor,
          data: p.data,
          erro: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (e.ultimaPagina || pagina + 1 >= (e.totalPaginas ?? 1)) break;
  }
  return resumo;
}

// data de hoje em Brasília (o extrato do Inter é por dia local)
const hojeBR = () =>
  new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const tokenCron = req.headers.get('x-cron-token');
  const { data: esperado } = await admin.rpc('fn_email_boletos_token');
  if (!tokenCron || !esperado || tokenCron !== esperado)
    return json({ error: 'Token inválido' }, 401);

  const corpo = (await req.json().catch(() => ({}))) as Json;
  try {
    const ate = hojeBR();
    const dias = Math.min(Math.max(Number(corpo.dias) || 3, 1), 89);
    const desde =
      (corpo.desde && /^\d{4}-\d{2}-\d{2}$/.test(corpo.desde)
        ? corpo.desde
        : null) ??
      new Date(Date.parse(ate) - dias * 86_400_000).toISOString().slice(0, 10);
    const resumo = await conferir(
      admin,
      desde,
      ate,
      corpo.carga ? 'carga' : 'conferencia',
      corpo.simular === true
    );
    return json({ ok: true, desde, ate, saidas: resumo });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[inter-saidas]', msg);
    return json({ error: msg }, 500);
  }
});
