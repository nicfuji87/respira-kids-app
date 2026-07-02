/* eslint-disable @typescript-eslint/no-explicit-any */
// AI dev note: Geração EM MASSA de pré-cobranças no SERVIDOR.
// Fase 2 (criação) + Fase 3a (envio pausado) + Fase 3b (worker de criação em blocos).
//
// FLUXO:
//  - ENTRY (chamado pela UI, com JWT do usuário): valida auth (admin/secretaria), SEMEIA o
//    log-fila (1 linha por item, status 'processando', com o PAYLOAD do item) e volta NA
//    HORA. Lote <= INLINE_MAX (60): cria INLINE aqui (reusa processarChunkWorker, sem
//    depender do cron). Lote maior: só dá um "kick" e o worker/cron drena em blocos.
//  - WORKER (mode:'worker', cutucado pelo cron process-payment-generation-job via pg_net):
//    reivindica UM bloco (fn_claim_geracao_chunk, SKIP LOCKED = atômico), cria cada link de
//    forma IDEMPOTENTE e enfileira o WhatsApp SEGURADO. Uma rodada = um bloco; quem continua
//    é o cron (1/min) — 300-400 drena em blocos sem estourar tempo nem empilhar workers.
//
// ENVIO não sai aqui: entra held (pacing='lote', proximo_retry no futuro). Quem libera é
// fn_liberar_envio_lote (janela 8-20h BRT, 5-9 min, teto 80/dia). Avulso (criarLinkPagamento,
// 1 paciente) é PISTA EXPRESSA em paralelo — não passa por esta fila.
//
// AUTH: verify_jwt fica true. A UI manda o JWT do usuário; o cron manda a ANON KEY (JWT
// válido) — ambos passam. O ENTRY faz auth manual (getUser + role); o WORKER pula a auth de
// usuário (suas entradas vêm SÓ da fila do banco, semeada por um ENTRY já autenticado).
//
// IMPORTANTE: fee math (calcularOpcoesPagamento/gerarTaxasCartaoPadrao) é CÓPIA VERBATIM de
// src/lib/payment-fees.ts — se mudar lá, mude aqui. Asaas REUSADO via asaas-simulate-payment.
// dryRun (dormante, sem botão): faz tudo menos criar/reservar/enviar — grava 'simulado'.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Itens criados por rodada do worker (~2s/item por causa do Asaas -> folga vs. timeout)
const CHUNK = 15;
// Corte inline vs. worker: lote com ATÉ INLINE_MAX itens é criado INLINE aqui na edge
// (sem depender do cron/worker); acima disso, entrega pro worker/cron drenar em blocos.
// Bem abaixo do limite prático de ~150 do waitUntil da edge.
const INLINE_MAX = 60;

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

// Linha reivindicada da fila (retorno de fn_claim_geracao_chunk)
interface ChunkRow {
  id: string; // id da linha de log
  payload: ItemLote;
  criado_por: string;
  dry_run: boolean;
  pagamento_link_id: string | null;
  paciente_id: string;
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
    const body = await req.json().catch(() => ({}));

    // ===================== WORKER =====================
    // Cutucado pelo cron (ou auto-encadeado). Sem auth de usuário: só drena a fila.
    if (body?.mode === 'worker') {
      const n = await processarChunkWorker(supabase);
      return json({ success: true, worker: true, processados: n });
    }

    // ===================== ENTRY (UI) =====================
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

    const itens: ItemLote[] = Array.isArray(body?.itens) ? body.itens : [];
    const dryRun: boolean = body?.dryRun === true;
    if (itens.length === 0)
      return json({ success: false, error: 'Lote vazio' }, 400);

    const loteId = crypto.randomUUID();

    // 2. Semear a FILA: uma linha por item, com o PAYLOAD (o worker recria a partir daqui).
    const seed = itens.map((it) => ({
      lote_id: loteId,
      paciente_id: it.pacienteId,
      paciente_nome: it.pacienteNome || null,
      valor_base: it.valorBase,
      status: 'processando',
      criado_por: pessoaId,
      payload: it,
      dry_run: dryRun,
    }));
    await supabase.from('pagamento_link_geracao_log').insert(seed);

    // 3. Responde NA HORA e cria em segundo plano (EdgeRuntime.waitUntil):
    //  - lote <= INLINE_MAX: DRENA INLINE aqui, reusando a MESMA lógica do worker
    //    (processarChunkWorker) — sem depender do cron. O cron segue de backstop (SKIP
    //    LOCKED = nunca duplica). maxIter limita o tempo caso outro lote seja semeado junto.
    //  - lote grande: só dá um kick e deixa o worker/cron drenar em blocos.
    if (itens.length <= INLINE_MAX) {
      const maxIter = Math.ceil(itens.length / CHUNK) + 1;
      // @ts-expect-error EdgeRuntime é global no runtime do Supabase
      EdgeRuntime.waitUntil(
        (async () => {
          let iter = 0;
          let n = 0;
          do {
            n = await processarChunkWorker(supabase);
            iter++;
          } while (n >= CHUNK && iter < maxIter);
        })()
      );
    } else {
      // @ts-expect-error EdgeRuntime é global no runtime do Supabase
      EdgeRuntime.waitUntil(kickWorker(supabase));
    }

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

// Dispara uma rodada do worker (fire-and-forget). Usado pelo entry pra começar já
// (sem esperar o próximo tick do cron).
async function kickWorker(supabase: any): Promise<void> {
  try {
    await supabase.functions.invoke('generate-payment-links-bulk', {
      body: { mode: 'worker' },
    });
  } catch (e) {
    console.warn('⚠️ Falha ao cutucar worker:', e);
  }
}

// Reivindica e processa UM bloco da fila. Se pegou bloco cheio, re-chama (cron é o backstop).
async function processarChunkWorker(supabase: any): Promise<number> {
  const { data: rows, error } = await supabase.rpc('fn_claim_geracao_chunk', {
    p_limit: CHUNK,
  });
  if (error) {
    console.error('❌ Erro no claim da fila:', error.message);
    return 0;
  }
  const itens: ChunkRow[] = rows || [];
  if (itens.length === 0) return 0;

  const { data: statusCobranca } = await supabase
    .from('pagamento_status')
    .select('id')
    .eq('codigo', 'cobranca_gerada')
    .single();

  for (const row of itens) {
    await processarItem(supabase, statusCobranca, row);
  }

  // Uma rodada = UM bloco. Quem continua é o cron (process-payment-generation-job, 1/min)
  // — sem auto-encadeamento pra não empilhar workers concorrentes. Criar a 15/min é de
  // sobra: o ENVIO sai a 80/dia (fn_liberar_envio_lote), então a criação não é o gargalo.
  return itens.length;
}

// Cria UM link a partir da linha reivindicada. Idempotente: se a linha já tem
// pagamento_link_id (recuperação de crash), não recria — só finaliza.
async function processarItem(
  supabase: any,
  statusCobranca: { id: string } | null,
  row: ChunkRow
): Promise<void> {
  const logId = row.id;
  const item = row.payload;
  const userId = row.criado_por;
  const dryRun = row.dry_run === true;

  const marcar = async (fields: Record<string, unknown>) => {
    await supabase
      .from('pagamento_link_geracao_log')
      .update({ ...fields, atualizado_em: new Date().toISOString() })
      .eq('id', logId);
  };

  try {
    // IDEMPOTÊNCIA: link já criado pra esta linha (crash entre criar e finalizar) =>
    // não recria (evita cobrança duplicada). Melhor "não reenviar" do que "duplicar".
    if (row.pagamento_link_id) {
      await marcar({ status: 'sucesso' });
      return;
    }

    if (!item || !(item.valorBase > 0))
      throw new Error('Valor deve ser maior que zero');
    if (!item.agendamentoIds?.length)
      throw new Error('Nenhuma consulta no item');

    // Idempotência das consultas: ainda precisam estar livres (não faturadas/reservadas).
    const { data: ags } = await supabase
      .from('agendamentos')
      .select('id, ativo, fatura_id, pagamento_link_id')
      .in('id', item.agendamentoIds);
    const invalidas = (ags || []).filter(
      (a: any) => !a.ativo || a.fatura_id || a.pagamento_link_id
    );
    if (!ags || ags.length === 0) throw new Error('Consultas não encontradas');
    if (invalidas.length > 0)
      throw new Error(
        'Consulta(s) já faturada(s) ou já reservada(s) a outra cobrança'
      );

    // Taxas (empresa -> Asaas ao vivo -> imposto) + opções (fee math verbatim)
    const { data: empresa } = await supabase
      .from('pessoa_empresas')
      .select('taxas_cartao')
      .eq('id', item.empresaId)
      .single();
    const taxasConfig: TaxasCartaoConfig =
      (empresa?.taxas_cartao as TaxasCartaoConfig) || gerarTaxasCartaoPadrao();
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

    // Tomador da NFS-e
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
    const expiraEm = new Date(`${dataExpiracao}T23:59:59-03:00`).toISOString();

    // === DRY RUN: não grava nada, só registra o que SERIA gerado ===
    if (dryRun) {
      await marcar({
        status: 'simulado',
        valor_base: item.valorBase,
        erro: `PIX ${opcoes.pix.total} | ${opcoes.cartao.length} opções de cartão | venc ${vencimento}`,
      });
      return;
    }

    // Inserir o link (idêntico ao criarLinkPagamento)
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

    // Carimba o link na fila JÁ (recuperação: se cair agora, o reprocesso não duplica).
    await marcar({ pagamento_link_id: link.id, token: link.token });

    // Reservar as consultas (guarda: só as ainda livres)
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
    if (updErr) console.warn('⚠️ Erro ao reservar consultas:', updErr.message);

    // Enfileirar o WhatsApp SEGURADO (pacing='lote' + proximo_retry no futuro).
    // Quem controla o ritmo/janela/teto é fn_liberar_envio_lote (NÃO aqui).
    const url = `https://app.respirakidsbrasilia.com.br/#/pagamento/${link.token}`;
    const HELD_ATE = new Date(Date.now() + 100 * 365 * 86400000).toISOString();
    await supabase.from('webhook_queue').insert({
      evento: 'pagamento_link_criado',
      payload: {
        tipo: 'pagamento_link_criado',
        timestamp: new Date().toISOString(),
        webhook_id: crypto.randomUUID(),
        data: {
          pacing: 'lote',
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
      proximo_retry: HELD_ATE,
    });

    await marcar({ status: 'sucesso' });
  } catch (e) {
    await marcar({
      status: 'erro',
      erro: e instanceof Error ? e.message : 'Erro desconhecido',
    });
  }
}
