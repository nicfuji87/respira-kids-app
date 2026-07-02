/* eslint-disable @typescript-eslint/no-explicit-any */
// AI dev note: Geração EM MASSA de pré-cobranças no SERVIDOR (Fase 2). A tela monta o
// lote (validações + descrição — que ficam no cliente pra reusar generateChargeDescription
// sem re-portar) e chama esta função, que RESPONDE NA HORA e processa em segundo plano
// (EdgeRuntime.waitUntil): cria cada link igual ao criarLinkPagamento (payment-links-api.ts),
// espaçando os envios de WhatsApp 5–9 min (anti-ban). Grava o resultado por paciente em
// pagamento_link_geracao_log (a tela acompanha por lote_id).
//
// IMPORTANTE: o cálculo de taxas/parcelas (calcularOpcoesPagamento / gerarTaxasCartaoPadrao)
// é CÓPIA VERBATIM de src/lib/payment-fees.ts — se mudar lá, mude aqui. A chamada ao Asaas
// é REUSADA (invoca a edge function asaas-simulate-payment), não re-implementada.
//
// dryRun=true: faz tudo (validação + taxas + Asaas + cálculo) MENOS criar/reservar/enviar —
// grava 'simulado' no log com o que SERIA gerado. Rede de segurança pra validar sem risco.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ===================== Tipos (espelham types/payment-links.ts) =====================
interface TaxaFaixaCartao {
  min: number;
  max: number;
  mdr: number;
  antecipacao_mes: number;
  meses?: number | null;
}
interface TaxasCartaoConfig {
  max_parcelas: number;
  pix: { percent: number; fixo: number };
  cartao: { fixo: number; faixas: TaxaFaixaCartao[] };
  imposto?: { percent: number };
}
interface OpcaoCartao {
  parcelas: number;
  valor_parcela: number;
  total: number;
}
interface OpcoesPagamento {
  valor_base: number;
  pix: { total: number };
  cartao: OpcaoCartao[];
}

interface ItemLote {
  agendamentoIds: string[];
  pacienteId: string;
  pacienteNome?: string;
  responsavelId: string;
  empresaId: string;
  valorBase: number;
  descricao: string;
  vencimento?: string; // YYYY-MM-DD
}

// ============ Fee math — CÓPIA VERBATIM de src/lib/payment-fees.ts ============
const round2 = (v: number): number =>
  Math.round((v + Number.EPSILON) * 100) / 100;
const ceil2 = (v: number): number =>
  Math.ceil((v - Number.EPSILON) * 100) / 100;

function mesesAntecipacao(n: number, mesesOverride?: number | null): number {
  if (typeof mesesOverride === 'number' && mesesOverride > 0)
    return mesesOverride;
  return (n + 1) / 2;
}
function faixaParaParcela(
  taxas: TaxasCartaoConfig,
  n: number
): TaxaFaixaCartao | undefined {
  return taxas.cartao.faixas.find((f) => n >= f.min && n <= f.max);
}
function calcularOpcoesPagamento(
  valorBase: number,
  taxas: TaxasCartaoConfig
): OpcoesPagamento {
  if (!(valorBase > 0)) {
    throw new Error('valorBase deve ser maior que zero');
  }
  const pixTotal = ceil2(
    valorBase * (1 + (taxas.pix?.percent || 0) / 100) + (taxas.pix?.fixo || 0)
  );
  const maxParcelas = Math.max(1, taxas.max_parcelas || 1);
  const fixoCartao = taxas.cartao?.fixo || 0;
  const fracaoImposto = Math.max(0, (taxas.imposto?.percent || 0) / 100);
  const cartao: OpcaoCartao[] = [];
  for (let n = 1; n <= maxParcelas; n++) {
    const faixa = faixaParaParcela(taxas, n);
    if (!faixa) continue;
    const meses = mesesAntecipacao(n, faixa.meses);
    const fracaoTaxa = faixa.mdr / 100 + (faixa.antecipacao_mes / 100) * meses;
    const denom = 1 - fracaoTaxa - fracaoImposto;
    if (denom <= 0) continue;
    const bruto = ceil2((valorBase * (1 - fracaoImposto) + fixoCartao) / denom);
    cartao.push({
      parcelas: n,
      total: bruto,
      valor_parcela: round2(bruto / n),
    });
  }
  return { valor_base: round2(valorBase), pix: { total: pixTotal }, cartao };
}
function gerarTaxasCartaoPadrao(): TaxasCartaoConfig {
  return {
    max_parcelas: 6,
    pix: { percent: 0, fixo: 0 },
    imposto: { percent: 0 },
    cartao: {
      fixo: 0.49,
      faixas: [
        { min: 1, max: 1, mdr: 2.99, antecipacao_mes: 1.15, meses: 1 },
        { min: 2, max: 6, mdr: 3.49, antecipacao_mes: 1.6, meses: null },
      ],
    },
  };
}

// ============ refreshTaxasFromAsaas — port fiel (reusa asaas-simulate-payment) ============
async function refreshTaxasFromAsaas(
  supabase: any,
  empresaId: string,
  valorBase: number,
  taxas: TaxasCartaoConfig
): Promise<TaxasCartaoConfig> {
  try {
    const installmentCounts = Array.from(
      new Set(taxas.cartao.faixas.map((f) => f.min))
    );
    const { data, error } = await supabase.functions.invoke(
      'asaas-simulate-payment',
      { body: { empresaId, value: valorBase, installmentCounts } }
    );
    if (error || !data?.success || !Array.isArray(data.results)) return taxas;
    const byCount = new Map<
      number,
      { feePercentage: number | null; operationFee: number | null }
    >();
    for (const r of data.results) byCount.set(r.installmentCount, r);
    const fixoAsaas = byCount.get(1)?.operationFee;
    return {
      ...taxas,
      cartao: {
        ...taxas.cartao,
        fixo: typeof fixoAsaas === 'number' ? fixoAsaas : taxas.cartao.fixo,
        faixas: taxas.cartao.faixas.map((f) => {
          const r = byCount.get(f.min);
          return typeof r?.feePercentage === 'number'
            ? { ...f, mdr: r.feePercentage }
            : f;
        }),
      },
    };
  } catch {
    return taxas;
  }
}

// Token url-safe (~21 chars). Índice de token não é único; colisão é astronômica.
function gerarToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
    .slice(0, 21);
}

function ymd(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS')
    return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST')
    return json({ success: false, error: 'Method not allowed' }, 405);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    // 1. Autenticação: o chamador precisa ser admin ou secretaria
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
    } = await supabase.auth.getUser(token);
    if (!user) return json({ success: false, error: 'Não autenticado' }, 401);

    // AI dev note: pessoas.id != auth.users.id — a ligação é pessoas.auth_user_id.
    // criado_por/cobranca_gerada_por usam o ID DA PESSOA (perfil.id), não o auth id.
    const { data: perfil } = await supabase
      .from('pessoas')
      .select('id, role')
      .eq('auth_user_id', user.id)
      .single();
    if (!perfil || !['admin', 'secretaria'].includes(perfil.role)) {
      return json(
        { success: false, error: 'Sem permissão para gerar cobranças' },
        403
      );
    }
    const pessoaId = perfil.id as string;

    const body = await req.json();
    const itens: ItemLote[] = Array.isArray(body?.itens) ? body.itens : [];
    const dryRun: boolean = body?.dryRun === true;
    if (itens.length === 0)
      return json({ success: false, error: 'Lote vazio' }, 400);

    const loteId = crypto.randomUUID();

    // 2. Semear o log (uma linha 'processando' por paciente) para a tela ver o total já
    const seed = itens.map((it) => ({
      lote_id: loteId,
      paciente_id: it.pacienteId,
      paciente_nome: it.pacienteNome || null,
      valor_base: it.valorBase,
      status: 'processando',
      criado_por: pessoaId,
    }));
    const { data: logRows } = await supabase
      .from('pagamento_link_geracao_log')
      .insert(seed)
      .select('id, paciente_id');

    // Mapa paciente_id -> id da linha de log (para atualizar depois)
    const logIdPorPaciente = new Map<string, string>();
    (logRows || []).forEach((r: any) => {
      if (!logIdPorPaciente.has(r.paciente_id))
        logIdPorPaciente.set(r.paciente_id, r.id);
    });

    // 3. Responde NA HORA; processa em segundo plano
    // @ts-expect-error EdgeRuntime é global no runtime do Supabase
    EdgeRuntime.waitUntil(
      processarLote(supabase, pessoaId, loteId, itens, dryRun, logIdPorPaciente)
    );

    return json({ success: true, loteId, total: itens.length, dryRun });
  } catch (error) {
    console.error('❌ [generate-payment-links-bulk] Erro:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erro inesperado',
      },
      500
    );
  }
});

async function processarLote(
  supabase: any,
  userId: string,
  loteId: string,
  itens: ItemLote[],
  dryRun: boolean,
  logIdPorPaciente: Map<string, string>
): Promise<void> {
  const t0 = Date.now();
  let acumuladoMs = 0;

  const { data: statusCobranca } = await supabase
    .from('pagamento_status')
    .select('id')
    .eq('codigo', 'cobranca_gerada')
    .single();

  const marcar = async (
    logId: string | undefined,
    fields: Record<string, unknown>
  ) => {
    if (!logId) return;
    await supabase
      .from('pagamento_link_geracao_log')
      .update({ ...fields, atualizado_em: new Date().toISOString() })
      .eq('id', logId);
  };

  try {
    for (const item of itens) {
      const logId = logIdPorPaciente.get(item.pacienteId);
      try {
        if (!(item.valorBase > 0))
          throw new Error('Valor deve ser maior que zero');
        if (!item.agendamentoIds?.length)
          throw new Error('Nenhuma consulta no item');

        // 3a. Idempotência: as consultas ainda precisam estar livres (não faturadas,
        // não reservadas a outro link). Evita cobrança duplicada se o estado mudou.
        const { data: ags } = await supabase
          .from('agendamentos')
          .select('id, ativo, fatura_id, pagamento_link_id')
          .in('id', item.agendamentoIds);
        const invalidas = (ags || []).filter(
          (a: any) => !a.ativo || a.fatura_id || a.pagamento_link_id
        );
        if (!ags || ags.length === 0)
          throw new Error('Consultas não encontradas');
        if (invalidas.length > 0)
          throw new Error(
            'Consulta(s) já faturada(s) ou já reservada(s) a outra cobrança'
          );

        // 3b. Taxas (empresa -> Asaas ao vivo -> imposto) + opções (fee math verbatim)
        const { data: empresa } = await supabase
          .from('pessoa_empresas')
          .select('taxas_cartao')
          .eq('id', item.empresaId)
          .single();
        const taxasConfig: TaxasCartaoConfig =
          (empresa?.taxas_cartao as TaxasCartaoConfig) ||
          gerarTaxasCartaoPadrao();
        const taxasAsaas = await refreshTaxasFromAsaas(
          supabase,
          item.empresaId,
          item.valorBase,
          taxasConfig
        );
        const { data: aliquotaData } = await supabase.rpc(
          'fn_aliquota_imposto_repasse',
          {}
        );
        const taxas: TaxasCartaoConfig = {
          ...taxasAsaas,
          imposto: { percent: Number(aliquotaData) || 0 },
        };
        const opcoes = calcularOpcoesPagamento(item.valorBase, taxas);

        // 3c. Tomador da NFS-e
        const { data: pacienteTomador } = await supabase
          .from('pessoas')
          .select('tomador_nfe_id')
          .eq('id', item.pacienteId)
          .maybeSingle();
        const tomadorId = pacienteTomador?.tomador_nfe_id || item.responsavelId;

        const hoje = new Date();
        const vencimento =
          item.vencimento || ymd(new Date(hoje.getTime() + 1 * 86400000));
        const dataExpiracao = ymd(new Date(hoje.getTime() + 30 * 86400000));
        const expiraEm = new Date(
          `${dataExpiracao}T23:59:59-03:00`
        ).toISOString();
        const agendarEnvioEm = new Date(t0 + acumuladoMs).toISOString();

        // === DRY RUN: não grava nada, só registra o que SERIA gerado ===
        if (dryRun) {
          await marcar(logId, {
            status: 'simulado',
            valor_base: item.valorBase,
            erro: `PIX ${opcoes.pix.total} | ${opcoes.cartao.length} opções de cartão | venc ${vencimento}`,
          });
          acumuladoMs += (300 + Math.random() * 240) * 1000;
          continue;
        }

        // 3d. Inserir o link (idêntico ao criarLinkPagamento)
        const novoToken = gerarToken();
        const { data: link, error: linkError } = await supabase
          .from('pagamento_links')
          .insert({
            token: novoToken,
            paciente_id: item.pacienteId,
            responsavel_cobranca_id: item.responsavelId,
            tomador_nfe_id: tomadorId,
            empresa_id: item.empresaId,
            valor_base: item.valorBase,
            descricao: item.descricao,
            vencimento,
            status: 'pendente',
            taxas_snapshot: taxas,
            opcoes_snapshot: opcoes,
            expira_em: expiraEm,
            criado_por: userId,
          })
          .select('id, token')
          .single();
        if (linkError || !link)
          throw new Error(`Erro ao criar link: ${linkError?.message}`);

        // 3e. Reservar as consultas (guarda: só as ainda livres)
        const { error: updErr } = await supabase
          .from('agendamentos')
          .update({
            pagamento_link_id: link.id,
            cobranca_gerada_em: new Date().toISOString(),
            cobranca_gerada_por: userId,
            ...(statusCobranca?.id
              ? { status_pagamento_id: statusCobranca.id }
              : {}),
          })
          .in('id', item.agendamentoIds)
          .is('fatura_id', null)
          .is('pagamento_link_id', null);
        if (updErr)
          console.warn('⚠️ Erro ao reservar consultas:', updErr.message);

        // 3f. Enfileirar o WhatsApp com espaçamento anti-ban (proximo_retry)
        const url = `https://app.respirakidsbrasilia.com.br/#/pagamento/${link.token}`;
        await supabase.from('webhook_queue').insert({
          evento: 'pagamento_link_criado',
          payload: {
            tipo: 'pagamento_link_criado',
            timestamp: new Date().toISOString(),
            webhook_id: crypto.randomUUID(),
            data: {
              pagamento_link_id: link.id,
              token: link.token,
              url,
              paciente_id: item.pacienteId,
              responsavel_cobranca_id: item.responsavelId,
              tomador_nfe_id: tomadorId,
              empresa_id: item.empresaId,
              valor_base: item.valorBase,
              descricao: item.descricao,
              vencimento,
            },
          },
          status: 'pendente',
          tentativas: 0,
          max_tentativas: 3,
          proximo_retry: agendarEnvioEm,
        });

        await marcar(logId, {
          status: 'sucesso',
          token: link.token,
          pagamento_link_id: link.id,
        });

        // Próximo envio só avança em sucesso (falha não consome janela)
        acumuladoMs += (300 + Math.random() * 240) * 1000;
      } catch (e) {
        await marcar(logId, {
          status: 'erro',
          erro: e instanceof Error ? e.message : 'Erro desconhecido',
        });
      }
    }
  } catch {
    // Falha inesperada do lote: marca o que sobrou como erro (evita polling infinito)
    await supabase
      .from('pagamento_link_geracao_log')
      .update({
        status: 'erro',
        erro: 'Falha no processamento do lote',
        atualizado_em: new Date().toISOString(),
      })
      .eq('lote_id', loteId)
      .eq('status', 'processando');
  }
}
