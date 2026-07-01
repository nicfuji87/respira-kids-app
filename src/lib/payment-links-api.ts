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
import { generateChargeDescription } from './charge-description';
import type {
  PagamentoLinkPublico,
  PagamentoLinkStatus,
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

    // AI dev note: O link vale 30 dias a partir da criação (regra do negócio). O
    // vencimento e a expiração andam juntos: assim, se o cliente pagar em qualquer
    // dia dentro da janela, o dueDate enviado ao Asaas (= link.vencimento) ainda
    // está no futuro — não cria cobrança já vencida. Passado o prazo, geramos outro.
    const vencimento =
      input.vencimento || format(addDays(new Date(), 30), 'yyyy-MM-dd');
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

// ============================================================================
// PRÉ-FATURAS (links de pagamento AINDA NÃO gerados no Asaas)
// ----------------------------------------------------------------------------
// AI dev note: Uma "pré-fatura" é um pagamento_links ativo SEM id_asaas (o cliente
// ainda não escolheu a forma, logo nenhuma cobrança existe no Asaas). Inclui os
// status 'pendente' E 'expirado': o confirm-payment-link marca o link como
// 'expirado' quando o cliente o abre depois do vencimento (ver index.ts) — esses
// ficam presos em limbo e são JUSTAMENTE os que a secretaria precisa enxergar para
// reativar/reenviar ou apagar. Ao contrário de faturas (faturas-api.ts),
// editar/excluir uma pré-fatura NÃO toca no Asaas — é gestão puramente interna.
// ============================================================================

export interface PreFaturaAgendamento {
  id: string;
  data_hora: string;
  servico_nome: string;
  valor_servico: number;
  profissional_nome: string;
}

export interface PreFaturaResumo {
  id: string;
  token: string;
  url: string;
  paciente_id: string;
  paciente_nome: string;
  empresa_id: string;
  empresa_nome: string;
  responsavel_cobranca_id: string;
  responsavel_nome: string;
  valor_base: number;
  descricao: string | null;
  vencimento: string | null;
  expira_em: string | null;
  criado_em: string;
  status: PagamentoLinkStatus;
  // AI dev note: expirado = já passou de expira_em. O link fica inutilizável para
  // o cliente até ser reativado (editar itens reativa e estende o prazo).
  expirado: boolean;
  qtd_consultas: number;
  agendamentos: PreFaturaAgendamento[];
}

// === LISTAR PRÉ-FATURAS (não geradas no Asaas) ===
export async function fetchPreFaturas(filtros?: {
  startDate?: string;
  endDate?: string;
  pacienteId?: string;
}): Promise<ApiResponse<PreFaturaResumo[]>> {
  try {
    let query = supabase
      .from('pagamento_links')
      .select(
        `id, token, paciente_id, empresa_id, responsavel_cobranca_id,
         valor_base, descricao, vencimento, expira_em, criado_em, status`
      )
      .eq('ativo', true)
      .in('status', ['pendente', 'expirado'])
      .is('id_asaas', null)
      .order('criado_em', { ascending: false });

    if (filtros?.pacienteId)
      query = query.eq('paciente_id', filtros.pacienteId);
    if (filtros?.startDate) query = query.gte('criado_em', filtros.startDate);
    if (filtros?.endDate)
      query = query.lte('criado_em', filtros.endDate + 'T23:59:59');

    const { data: links, error } = await query;
    if (error) {
      return {
        success: false,
        error: `Erro ao carregar pré-faturas: ${error.message}`,
      };
    }

    if (!links || links.length === 0) {
      return { success: true, data: [] };
    }

    // Nomes de pessoas (paciente + responsável) e empresas em lote
    const pessoaIds = [
      ...new Set(
        links.flatMap((l) => [l.paciente_id, l.responsavel_cobranca_id])
      ),
    ].filter(Boolean);
    const empresaIds = [...new Set(links.map((l) => l.empresa_id))].filter(
      Boolean
    );

    const [{ data: pessoas }, { data: empresas }, { data: agendamentos }] =
      await Promise.all([
        supabase.from('pessoas').select('id, nome').in('id', pessoaIds),
        supabase
          .from('pessoa_empresas')
          .select('id, razao_social, nome_fantasia')
          .in('id', empresaIds),
        supabase
          .from('agendamentos')
          .select(
            'id, data_hora, valor_servico, tipo_servico_id, profissional_id, pagamento_link_id'
          )
          .in(
            'pagamento_link_id',
            links.map((l) => l.id)
          )
          .eq('ativo', true),
      ]);

    const pessoaNome = new Map(
      (pessoas || []).map((p) => [p.id, p.nome as string])
    );
    const empresaNome = new Map(
      (empresas || []).map((e) => [
        e.id,
        (e.nome_fantasia || e.razao_social || 'Empresa') as string,
      ])
    );

    // Nomes de serviço e profissional dos agendamentos vinculados
    const servicoIds = [
      ...new Set((agendamentos || []).map((a) => a.tipo_servico_id)),
    ].filter(Boolean);
    const profIds = [
      ...new Set((agendamentos || []).map((a) => a.profissional_id)),
    ].filter(Boolean);
    const [{ data: servicos }, { data: profs }] = await Promise.all([
      servicoIds.length
        ? supabase.from('tipo_servicos').select('id, nome').in('id', servicoIds)
        : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
      profIds.length
        ? supabase.from('pessoas').select('id, nome').in('id', profIds)
        : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    ]);
    const servicoNome = new Map(
      (servicos || []).map((s) => [s.id, s.nome as string])
    );
    const profNome = new Map(
      (profs || []).map((p) => [p.id, p.nome as string])
    );

    const agsPorLink = new Map<string, PreFaturaAgendamento[]>();
    (agendamentos || []).forEach((a) => {
      const arr = agsPorLink.get(a.pagamento_link_id) || [];
      arr.push({
        id: a.id,
        data_hora: a.data_hora,
        servico_nome: servicoNome.get(a.tipo_servico_id) || 'Atendimento',
        valor_servico: Number(a.valor_servico || 0),
        profissional_nome: profNome.get(a.profissional_id) || 'Profissional',
      });
      agsPorLink.set(a.pagamento_link_id, arr);
    });

    const preFaturas: PreFaturaResumo[] = links.map((l) => {
      const ags = (agsPorLink.get(l.id) || []).sort(
        (a, b) =>
          new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime()
      );
      return {
        id: l.id,
        token: l.token,
        url: montarUrlPagamento(l.token),
        paciente_id: l.paciente_id,
        paciente_nome: pessoaNome.get(l.paciente_id) || 'Paciente',
        empresa_id: l.empresa_id,
        empresa_nome: empresaNome.get(l.empresa_id) || 'Empresa',
        responsavel_cobranca_id: l.responsavel_cobranca_id,
        responsavel_nome:
          pessoaNome.get(l.responsavel_cobranca_id) || 'Responsável',
        valor_base: Number(l.valor_base || 0),
        descricao: l.descricao,
        vencimento: l.vencimento,
        expira_em: l.expira_em,
        criado_em: l.criado_em,
        status: l.status as PagamentoLinkStatus,
        expirado:
          l.status === 'expirado' ||
          (!!l.expira_em && new Date(l.expira_em) < new Date()),
        qtd_consultas: ags.length,
        agendamentos: ags,
      };
    });

    return { success: true, data: preFaturas };
  } catch (error) {
    console.error('❌ Erro ao buscar pré-faturas:', error);
    return { success: false, error: 'Erro inesperado ao carregar pré-faturas' };
  }
}

// === AGENDAMENTOS ELEGÍVEIS PARA ADICIONAR À PRÉ-FATURA ===
// AI dev note: Espelha a regra de geração da pré-cobrança (FinancialConsultationsList):
// mesmo responsável de cobrança e empresa, ainda não faturado nem pago/cancelado.
// Inclui os que já estão NESTE link (para pré-seleção) e os livres (sem link).
export async function fetchAgendamentosElegiveisParaPreFatura(
  responsavelCobrancaId: string,
  empresaId: string,
  linkId: string
): Promise<ApiResponse<PreFaturaAgendamento[]>> {
  try {
    // IDs já reservados a QUALQUER link (para excluir os de outros links)
    const { data: reservados } = await supabase
      .from('agendamentos')
      .select('id, pagamento_link_id')
      .not('pagamento_link_id', 'is', null)
      .eq('ativo', true);
    const idsDesteLink = new Set(
      (reservados || [])
        .filter((r) => r.pagamento_link_id === linkId)
        .map((r) => r.id)
    );
    const idsOutrosLinks = new Set(
      (reservados || [])
        .filter((r) => r.pagamento_link_id !== linkId)
        .map((r) => r.id)
    );

    const { data, error } = await supabase
      .from('vw_agendamentos_completos')
      .select(
        `id, data_hora, servico_nome, valor_servico, profissional_nome,
         status_pagamento_codigo, fatura_id, responsavel_cobranca_id,
         empresa_fatura_id, ativo`
      )
      .eq('responsavel_cobranca_id', responsavelCobrancaId)
      .eq('empresa_fatura_id', empresaId)
      .eq('ativo', true)
      .is('fatura_id', null)
      .not('status_pagamento_codigo', 'in', '("pago","cancelado")')
      .order('data_hora', { ascending: false });

    if (error) {
      return {
        success: false,
        error: `Erro ao buscar agendamentos: ${error.message}`,
      };
    }

    const elegiveis = (data || [])
      // Mantém: os deste link (pré-selecionados) OU livres (não reservados a outro link)
      .filter((a) => idsDesteLink.has(a.id) || !idsOutrosLinks.has(a.id))
      .map((a) => ({
        id: a.id,
        data_hora: a.data_hora,
        servico_nome: a.servico_nome || 'Atendimento',
        valor_servico: Number(a.valor_servico || 0),
        profissional_nome: a.profissional_nome || 'Profissional',
      }));

    return { success: true, data: elegiveis };
  } catch (error) {
    console.error('❌ Erro ao buscar agendamentos elegíveis:', error);
    return { success: false, error: 'Erro inesperado ao buscar agendamentos' };
  }
}

// === EDITAR PRÉ-FATURA (recalcula valor/descrição, sem tocar no Asaas) ===
export async function editarPreFatura(
  linkId: string,
  updates: {
    agendamentosParaAdicionar: string[];
    agendamentosParaRemover: string[];
  },
  userId: string
): Promise<ApiResponse<PreFaturaResumo>> {
  try {
    const permErro = await assertSecretariaOuAdmin(userId);
    if (permErro) return { success: false, error: permErro };

    // 1. Buscar o link e validar que ainda é uma pré-fatura editável
    const { data: link, error: linkErr } = await supabase
      .from('pagamento_links')
      .select(
        `id, status, id_asaas, paciente_id, empresa_id, taxas_snapshot, vencimento`
      )
      .eq('id', linkId)
      .single();

    if (linkErr || !link) {
      return { success: false, error: 'Pré-fatura não encontrada' };
    }
    // Pendente OU expirado podem ser editados. Uma vez com id_asaas (confirmada
    // no Asaas), vira fatura e sai daqui.
    if (!['pendente', 'expirado'].includes(link.status) || link.id_asaas) {
      return {
        success: false,
        error:
          'Esta cobrança já foi gerada no Asaas e não pode ser editada como pré-fatura',
      };
    }

    // 2. Montar o conjunto final de agendamentos (atuais - remover + adicionar), dedupe
    const { data: atuais } = await supabase
      .from('agendamentos')
      .select('id')
      .eq('pagamento_link_id', linkId)
      .eq('ativo', true);

    const finalIds = Array.from(
      new Set(
        [
          ...(atuais || []).map((a) => a.id),
          ...updates.agendamentosParaAdicionar,
        ].filter((id) => !updates.agendamentosParaRemover.includes(id))
      )
    );

    if (finalIds.length === 0) {
      return {
        success: false,
        error:
          'A pré-fatura ficaria sem nenhuma consulta. Para removê-la use "Excluir".',
      };
    }

    // 3. Buscar dados dos agendamentos finais (para valor + descrição)
    const { data: agsView } = await supabase
      .from('vw_agendamentos_completos')
      .select(
        `id, data_hora, servico_nome, valor_servico, profissional_nome,
         profissional_id, tipo_servico_id, paciente_nome, paciente_id`
      )
      .in('id', finalIds);

    const consultationData = (agsView || []).map((a) => ({
      id: a.id,
      data_hora: a.data_hora,
      servico_nome: a.servico_nome || 'Atendimento',
      valor_servico: Number(a.valor_servico || 0),
      profissional_nome: a.profissional_nome || 'Profissional',
      profissional_id: a.profissional_id,
      tipo_servico_id: a.tipo_servico_id,
    }));

    const novoValorBase = consultationData.reduce(
      (sum, a) => sum + a.valor_servico,
      0
    );

    // Descrição via função centralizada (já com dedupe interno)
    const { data: pacienteData } = await supabase
      .from('pessoas')
      .select('nome, cpf_cnpj')
      .eq('id', link.paciente_id)
      .maybeSingle();

    const novaDescricao = await generateChargeDescription(consultationData, {
      nome: pacienteData?.nome || 'Paciente',
      cpf_cnpj: pacienteData?.cpf_cnpj || '',
    });

    // Recalcular as opções de pagamento (PIX/cartão) com o snapshot de taxas do link
    const opcoes = calcularOpcoesPagamento(
      novoValorBase,
      link.taxas_snapshot as TaxasCartaoConfig
    );

    // AI dev note: Reativação — se o link estava 'expirado' (cliente abriu depois do
    // prazo), editar reabre a cobrança: volta para 'pendente' e renova a janela de 30
    // dias. Renovamos vencimento E expira_em juntos para o dueDate enviado ao Asaas
    // (= link.vencimento) continuar no futuro e não nascer vencido.
    const reativar = link.status === 'expirado';
    const novoVencimento = reativar
      ? format(addDays(new Date(), 30), 'yyyy-MM-dd')
      : undefined;
    const novaExpiraEm = novoVencimento
      ? new Date(`${novoVencimento}T23:59:59`).toISOString()
      : undefined;

    // 4. Atualizar o link
    const { error: updLinkErr } = await supabase
      .from('pagamento_links')
      .update({
        valor_base: novoValorBase,
        descricao: novaDescricao,
        opcoes_snapshot: opcoes,
        ...(reativar
          ? {
              status: 'pendente',
              vencimento: novoVencimento,
              expira_em: novaExpiraEm,
            }
          : {}),
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', linkId);

    if (updLinkErr) {
      return {
        success: false,
        error: `Erro ao atualizar pré-fatura: ${updLinkErr.message}`,
      };
    }

    // 5. Status de pagamento (pendente/cobranca_gerada)
    const { data: statuses } = await supabase
      .from('pagamento_status')
      .select('id, codigo')
      .in('codigo', ['pendente', 'cobranca_gerada']);
    const statusPendenteId = statuses?.find((s) => s.codigo === 'pendente')?.id;
    const statusCobrancaId = statuses?.find(
      (s) => s.codigo === 'cobranca_gerada'
    )?.id;

    // 6. Desvincular removidos (voltam a "pendente" e livres)
    if (updates.agendamentosParaRemover.length > 0) {
      await supabase
        .from('agendamentos')
        .update({
          pagamento_link_id: null,
          cobranca_gerada_em: null,
          cobranca_gerada_por: null,
          ...(statusPendenteId
            ? { status_pagamento_id: statusPendenteId }
            : {}),
          atualizado_por: userId === 'system' ? null : userId,
        })
        .in('id', updates.agendamentosParaRemover);
    }

    // 7. Vincular adicionados (reservam a "cobrança gerada")
    if (updates.agendamentosParaAdicionar.length > 0) {
      await supabase
        .from('agendamentos')
        .update({
          pagamento_link_id: linkId,
          cobranca_gerada_em: new Date().toISOString(),
          cobranca_gerada_por: userId === 'system' ? null : userId,
          ...(statusCobrancaId
            ? { status_pagamento_id: statusCobrancaId }
            : {}),
          atualizado_por: userId === 'system' ? null : userId,
        })
        .in('id', updates.agendamentosParaAdicionar);
    }

    // Retornar o resumo atualizado
    const lista = await fetchPreFaturas();
    const atualizada = lista.data?.find((p) => p.id === linkId);
    return { success: true, data: atualizada };
  } catch (error) {
    console.error('❌ Erro ao editar pré-fatura:', error);
    return { success: false, error: 'Erro inesperado ao editar pré-fatura' };
  }
}

// === EXCLUIR PRÉ-FATURA (libera as consultas) ===
// AI dev note: Soft-delete do link (pendente OU expirado) e as consultas voltam a
// "pendente", livres para uma nova cobrança. Sem Asaas. Não reusa
// cancelarLinkPagamento porque aquele só cancela status='pendente' — precisamos
// cobrir os expirados-em-limbo também.
export async function excluirPreFatura(
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
      .in('status', ['pendente', 'expirado']);

    if (linkError) {
      return {
        success: false,
        error: `Erro ao excluir pré-fatura: ${linkError.message}`,
      };
    }

    // Liberar as consultas reservadas (voltam a "pendente")
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
    console.error('❌ Erro ao excluir pré-fatura:', error);
    return { success: false, error: 'Erro inesperado ao excluir pré-fatura' };
  }
}
