// AI dev note: API do fluxo de link público de pagamento (PIX x Cartão com repasse).
// - criarLinkPagamento: secretaria/admin gera o link (intent) e reserva as consultas.
//   NÃO cria cobrança no Asaas ainda (isso acontece no aceite do cliente).
// - fetchLinkPublico: leitura pública por token (RPC SECURITY DEFINER).
// - confirmarPagamento: cliente escolhe a forma -> edge function confirm-payment-link.
// - cancelarLinkPagamento: libera as consultas reservadas.

import { supabase } from './supabase';
import { nanoid } from 'nanoid';
import { addDays, format } from 'date-fns';
import {
  calcularOpcoesPagamento,
  gerarTaxasCartaoPadrao,
} from './payment-fees';
import type {
  PagamentoLinkPublico,
  TaxasCartaoConfig,
  FormaPagamento,
  ConfirmarPagamentoResult,
} from '@/types/payment-links';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CriarLinkPagamentoInput {
  agendamentoIds: string[];
  pacienteId: string;
  responsavelId: string;
  empresaId: string;
  valorBase: number;
  descricao: string;
  vencimento?: string; // YYYY-MM-DD (default: hoje + 3 dias)
}

export interface LinkPagamentoCriado {
  id: string;
  token: string;
  url: string;
}

// Monta a URL pública do link (hash router).
export function montarUrlPagamento(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/#/pagamento/${token}`;
}

// Atualiza MDR e tarifa fixa do cartão com as taxas REAIS do Asaas da empresa
// (via edge function asaas-simulate-payment). Mantém antecipação/estrutura da config.
// Em qualquer falha, retorna a config original (degradação graciosa).
async function refreshTaxasFromAsaas(
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
  } catch (e) {
    console.warn('⚠️ Falha ao atualizar taxas via Asaas, usando config:', e);
    return taxas;
  }
}

// Alíquota de imposto repassada ao cliente no cartão (gross-up). É a MAIOR entre as
// empresas ativas (preço uniforme em qualquer CNPJ — decisão do dono), NÃO a da empresa
// que emite. A margem/recolhimento usa a alíquota real por empresa. Falha => 0.
async function fetchAliquotaImpostoRepasse(): Promise<number> {
  try {
    const { data, error } = await supabase.rpc(
      'fn_aliquota_imposto_repasse',
      {}
    );
    if (error || data == null) return 0;
    return Number(data) || 0;
  } catch {
    return 0;
  }
}

async function assertSecretariaOuAdmin(userId: string): Promise<string | null> {
  if (userId === 'system') return null;
  const { data, error } = await supabase
    .from('pessoas')
    .select('role')
    .eq('id', userId)
    .single();
  if (error || !data || !['admin', 'secretaria'].includes(data.role)) {
    return 'Apenas administradores e secretárias podem gerar links de pagamento';
  }
  return null;
}

// === CRIAR LINK (intent) ===
export async function criarLinkPagamento(
  input: CriarLinkPagamentoInput,
  userId: string
): Promise<ApiResponse<LinkPagamentoCriado>> {
  try {
    const permErro = await assertSecretariaOuAdmin(userId);
    if (permErro) return { success: false, error: permErro };

    if (!(input.valorBase > 0)) {
      return {
        success: false,
        error: 'Valor da cobrança deve ser maior que zero',
      };
    }
    if (!input.agendamentoIds?.length) {
      return { success: false, error: 'Nenhuma consulta selecionada' };
    }

    // Taxas da empresa (fallback: padrão)
    const { data: empresa } = await supabase
      .from('pessoa_empresas')
      .select('taxas_cartao')
      .eq('id', input.empresaId)
      .single();

    const taxasConfig: TaxasCartaoConfig =
      (empresa?.taxas_cartao as TaxasCartaoConfig) || gerarTaxasCartaoPadrao();

    // Atualiza MDR/tarifa fixa com as taxas reais do Asaas da empresa (fallback: config)
    const taxasAsaas = await refreshTaxasFromAsaas(
      input.empresaId,
      input.valorBase,
      taxasConfig
    );

    // Imposto repassado no cartão (gross-up): MAIOR alíquota entre as empresas ativas,
    // pra o cliente ver o mesmo % em qualquer CNPJ. Congelada no snapshot. A margem usa
    // a alíquota real por empresa (fn_aliquota_imposto_bruto).
    const aliquotaImposto = await fetchAliquotaImpostoRepasse();
    const taxas: TaxasCartaoConfig = {
      ...taxasAsaas,
      imposto: { percent: aliquotaImposto },
    };

    const opcoes = calcularOpcoesPagamento(input.valorBase, taxas);

    // AI dev note: Resolver o tomador da NFS-e (em nome de quem a nota é emitida =
    // customer Asaas). Vem da configuração do paciente (pessoas.tomador_nfe_id);
    // quando ausente, cai no responsável de cobrança (pagador) — comportamento padrão.
    const { data: pacienteTomador } = await supabase
      .from('pessoas')
      .select('tomador_nfe_id')
      .eq('id', input.pacienteId)
      .maybeSingle();
    const tomadorId = pacienteTomador?.tomador_nfe_id || input.responsavelId;

    const vencimento =
      input.vencimento || format(addDays(new Date(), 3), 'yyyy-MM-dd');
    const expiraEm = new Date(`${vencimento}T23:59:59`).toISOString();
    const token = nanoid();

    // Inserir o link
    const { data: link, error: linkError } = await supabase
      .from('pagamento_links')
      .insert({
        token,
        paciente_id: input.pacienteId,
        responsavel_cobranca_id: input.responsavelId,
        tomador_nfe_id: tomadorId,
        empresa_id: input.empresaId,
        valor_base: input.valorBase,
        descricao: input.descricao,
        vencimento,
        status: 'pendente',
        taxas_snapshot: taxas,
        opcoes_snapshot: opcoes,
        expira_em: expiraEm,
        criado_por: userId === 'system' ? null : userId,
      })
      .select('id, token')
      .single();

    if (linkError || !link) {
      return {
        success: false,
        error: `Erro ao criar link de pagamento: ${linkError?.message}`,
      };
    }

    // Reservar as consultas (status "cobrança gerada" + vínculo ao link)
    const { data: statusCobranca } = await supabase
      .from('pagamento_status')
      .select('id')
      .eq('codigo', 'cobranca_gerada')
      .single();

    const { error: updateError } = await supabase
      .from('agendamentos')
      .update({
        pagamento_link_id: link.id,
        cobranca_gerada_em: new Date().toISOString(),
        cobranca_gerada_por: userId === 'system' ? null : userId,
        ...(statusCobranca?.id
          ? { status_pagamento_id: statusCobranca.id }
          : {}),
      })
      .in('id', input.agendamentoIds);

    if (updateError) {
      console.error('⚠️ Erro ao reservar consultas no link:', updateError);
      // Não falha a operação principal — o link já existe.
    }

    const url = montarUrlPagamento(link.token);

    // Enfileirar webhook para o n8n enviar o link ao cliente (WhatsApp)
    const { error: webhookError } = await supabase
      .from('webhook_queue')
      .insert({
        evento: 'pagamento_link_criado',
        payload: {
          tipo: 'pagamento_link_criado',
          timestamp: new Date().toISOString(),
          webhook_id: crypto.randomUUID(),
          data: {
            pagamento_link_id: link.id,
            token: link.token,
            url,
            paciente_id: input.pacienteId,
            responsavel_cobranca_id: input.responsavelId,
            tomador_nfe_id: tomadorId,
            empresa_id: input.empresaId,
            valor_base: input.valorBase,
            descricao: input.descricao,
            vencimento,
          },
        },
        status: 'pendente',
        tentativas: 0,
        max_tentativas: 3,
      });

    if (webhookError) {
      console.warn('⚠️ Falha ao enfileirar webhook do link:', webhookError);
    }

    return { success: true, data: { id: link.id, token: link.token, url } };
  } catch (error) {
    console.error('❌ Erro inesperado ao criar link de pagamento:', error);
    return {
      success: false,
      error: 'Erro inesperado ao criar link de pagamento',
    };
  }
}

// === LEITURA PÚBLICA (por token) ===
export async function fetchLinkPublico(
  token: string
): Promise<ApiResponse<PagamentoLinkPublico>> {
  try {
    const { data, error } = await supabase.rpc('get_pagamento_link_publico', {
      p_token: token,
    });
    if (error) {
      return { success: false, error: error.message };
    }
    if (!data) {
      return { success: false, error: 'Link não encontrado' };
    }
    return { success: true, data: data as PagamentoLinkPublico };
  } catch (error) {
    console.error('❌ Erro ao buscar link público:', error);
    return { success: false, error: 'Erro ao carregar o link de pagamento' };
  }
}

// === CONFIRMAR FORMA (cliente) ===
export async function confirmarPagamento(
  token: string,
  forma: FormaPagamento,
  parcelas: number = 1
): Promise<ApiResponse<ConfirmarPagamentoResult>> {
  try {
    const successUrl = montarUrlPagamento(token);
    const { data, error } = await supabase.functions.invoke(
      'confirm-payment-link',
      { body: { token, forma, parcelas, successUrl } }
    );
    if (error) {
      return { success: false, error: 'Erro ao confirmar o pagamento' };
    }
    if (!data?.success) {
      return {
        success: false,
        error: data?.error || 'Erro ao confirmar o pagamento',
      };
    }
    return {
      success: true,
      data: {
        forma: data.forma,
        invoiceUrl: data.invoiceUrl,
        pix: data.pix,
      },
    };
  } catch (error) {
    console.error('❌ Erro ao confirmar pagamento:', error);
    return {
      success: false,
      error: 'Erro inesperado ao confirmar o pagamento',
    };
  }
}

// === CANCELAR LINK (libera as consultas reservadas) ===
export async function cancelarLinkPagamento(
  linkId: string,
  userId: string
): Promise<ApiResponse<boolean>> {
  try {
    const permErro = await assertSecretariaOuAdmin(userId);
    if (permErro) return { success: false, error: permErro };

    const { error: linkError } = await supabase
      .from('pagamento_links')
      .update({
        status: 'cancelado',
        ativo: false,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', linkId)
      .eq('status', 'pendente');

    if (linkError) {
      return {
        success: false,
        error: `Erro ao cancelar link: ${linkError.message}`,
      };
    }

    // Liberar consultas reservadas (voltam a "pendente")
    const { data: statusPendente } = await supabase
      .from('pagamento_status')
      .select('id')
      .eq('codigo', 'pendente')
      .single();

    await supabase
      .from('agendamentos')
      .update({
        pagamento_link_id: null,
        cobranca_gerada_em: null,
        cobranca_gerada_por: null,
        ...(statusPendente?.id
          ? { status_pagamento_id: statusPendente.id }
          : {}),
      })
      .eq('pagamento_link_id', linkId);

    return { success: true, data: true };
  } catch (error) {
    console.error('❌ Erro ao cancelar link de pagamento:', error);
    return { success: false, error: 'Erro inesperado ao cancelar link' };
  }
}
