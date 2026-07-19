// AI dev note: API para gerenciamento de faturas/cobranças ASAAS
// Estrutura híbrida com compatibilidade para sistema existente

import { supabase } from './supabase';
import {
  updateAsaasPayment,
  cancelAsaasPayment,
  getAsaasPayment,
  scheduleAsaasInvoice,
  authorizeAsaasInvoice,
  cancelAsaasInvoicesByPayment,
  determineApiKeyFromEmpresa,
} from './asaas-api';
import { generateChargeDescription } from './charge-description';
import { criarLinkPagamento } from './payment-links-api';
import type {
  Fatura,
  FaturaComDetalhes,
  CriarFaturaInput,
  AtualizarFaturaInput,
  FaturaFiltros,
  FaturaMetricas,
} from '@/types/faturas';
import type { UpdatePaymentRequest } from '@/types/asaas';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// AI dev note: Eventos de webhook disparados quando uma fatura/cobrança é manipulada.
// O n8n consome `webhook_queue`. Mantemos um evento por tipo de manipulação.
export type FaturaWebhookEvento =
  | 'fatura_criada'
  | 'fatura_atualizada'
  | 'fatura_cancelada'
  | 'fatura_ajustada';

// AI dev note: Enfileira webhook padrão sempre que uma fatura é manipulada.
// Segue o MESMO formato dos demais webhooks de cliente (evento + payload com
// tipo/timestamp/webhook_id/data). Busca a fatura fresca do banco para montar o
// payload completo. NUNCA lança: falha ao enfileirar não pode quebrar a operação
// principal (a cobrança no ASAAS já foi efetivada).
async function enfileirarWebhookFatura(
  evento: FaturaWebhookEvento,
  faturaId: string,
  userId: string,
  extra?: Record<string, unknown>
): Promise<void> {
  try {
    const { data: fatura } = await supabase
      .from('faturas')
      .select(
        `id, id_asaas, status, valor_total, descricao, vencimento,
         paciente_id, responsavel_cobranca_id, empresa_id,
         link_nfe, status_nfe, pago_em, ativo`
      )
      .eq('id', faturaId)
      .single();

    if (!fatura) {
      console.warn(
        '⚠️ Webhook de fatura não enfileirado: fatura não encontrada',
        faturaId
      );
      return;
    }

    const { error } = await supabase.from('webhook_queue').insert({
      evento,
      payload: {
        tipo: evento,
        timestamp: new Date().toISOString(),
        webhook_id: crypto.randomUUID(),
        data: {
          ...fatura,
          acao: evento,
          usuario_id: userId === 'system' ? null : userId,
          ...(extra || {}),
        },
      },
      status: 'pendente',
      tentativas: 0,
      max_tentativas: 3,
    });

    if (error) {
      console.warn('⚠️ Falha ao enfileirar webhook de fatura:', error);
    } else {
      console.log(`📤 Webhook ${evento} enfileirado para fatura`, faturaId);
    }
  } catch (e) {
    console.warn('⚠️ Erro inesperado ao enfileirar webhook de fatura:', e);
  }
}

// AI dev note: Mapeia o status do pagamento no ASAAS para o status local da fatura.
// Usado pela re-sincronização manual. `deleted` (404 ou payment.deleted) => cancelado.
function mapAsaasStatusToFatura(
  asaasStatus?: string,
  deleted?: boolean
): 'pago' | 'pendente' | 'atrasado' | 'cancelado' | 'estornado' {
  if (deleted) return 'cancelado';
  switch ((asaasStatus || '').toUpperCase()) {
    case 'RECEIVED':
    case 'CONFIRMED':
    case 'RECEIVED_IN_CASH':
      return 'pago';
    case 'OVERDUE':
      return 'atrasado';
    case 'REFUNDED':
    case 'REFUND_REQUESTED':
    case 'REFUND_IN_PROGRESS':
    case 'CHARGEBACK_REQUESTED':
    case 'CHARGEBACK_DISPUTE':
    case 'AWAITING_CHARGEBACK_REVERSAL':
      return 'estornado';
    case 'PENDING':
    case 'AWAITING_RISK_ANALYSIS':
    default:
      return 'pendente';
  }
}

// === BUSCAR FATURAS COM DETALHES ===
export async function fetchFaturasPorPaciente(
  pacienteId: string,
  limit?: number,
  filtros?: { periodo_inicio?: string; periodo_fim?: string }
): Promise<ApiResponse<FaturaComDetalhes[]>> {
  try {
    console.log('🔍 Buscando faturas do paciente:', pacienteId);

    // Buscar IDs de agendamentos do paciente para filtrar faturas
    const { data: agendamentos } = await supabase
      .from('agendamentos')
      .select('fatura_id')
      .eq('paciente_id', pacienteId)
      .not('fatura_id', 'is', null);

    if (!agendamentos || agendamentos.length === 0) {
      console.log('ℹ️ Paciente não possui faturas');
      return {
        success: true,
        data: [],
      };
    }

    const faturaIds = [
      ...new Set(agendamentos.map((a) => a.fatura_id).filter(Boolean)),
    ];

    if (faturaIds.length === 0) {
      return {
        success: true,
        data: [],
      };
    }

    // Query otimizada usando a view completa
    let query = supabase
      .from('vw_faturas_completas')
      .select('*')
      .in('id', faturaIds)
      .order('criado_em', { ascending: false });

    // Aplicar filtros de período se fornecidos
    if (filtros?.periodo_inicio) {
      query = query.gte('criado_em', filtros.periodo_inicio);
    }
    if (filtros?.periodo_fim) {
      query = query.lte('criado_em', filtros.periodo_fim);
    }

    if (limit) {
      query = query.limit(limit);
    }

    const { data: faturasData, error } = await query;

    if (error) {
      console.error('❌ Erro ao buscar faturas:', error);
      return {
        success: false,
        error: `Erro ao carregar faturas: ${error.message}`,
      };
    }

    // Debug log para verificar dados da view
    if (process.env.NODE_ENV === 'development' && faturasData?.length) {
      console.log(
        '🔍 Debug dados da view:',
        faturasData.map((f) => ({
          id: f.id.substring(0, 8),
          status: f.status,
          link_nfe: f.link_nfe,
          status_nfe: f.status_nfe,
          valor: f.valor_total,
        }))
      );
    }

    // Mapear para interface FaturaComDetalhes
    const faturasComDetalhes: FaturaComDetalhes[] = (faturasData || []).map(
      (fatura) => ({
        ...fatura,
        consultas_periodo:
          fatura.periodo_inicio && fatura.periodo_fim
            ? {
                inicio: fatura.periodo_inicio,
                fim: fatura.periodo_fim,
              }
            : undefined,
        url_asaas: `https://www.asaas.com/i/${fatura.id_asaas.replace('pay_', '')}`,
        // Garantir que campos NFe sejam preservados
        link_nfe: fatura.link_nfe,
        status_nfe: fatura.status_nfe,
      })
    );

    console.log('✅ Faturas encontradas:', faturasComDetalhes.length);

    // Debug log para verificar campos NFe
    if (process.env.NODE_ENV === 'development') {
      faturasComDetalhes.forEach((f) => {
        if (f.status === 'pago') {
          console.log('🔍 Debug fatura paga:', {
            id: f.id.substring(0, 8),
            status: f.status,
            link_nfe: f.link_nfe,
            status_nfe: f.status_nfe,
            valor: f.valor_total,
          });
        }
      });
    }
    return {
      success: true,
      data: faturasComDetalhes,
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao buscar faturas:', error);
    return {
      success: false,
      error: 'Erro inesperado ao carregar faturas',
    };
  }
}

// === BUSCAR FATURAS GERAL (TODOS OS PACIENTES) ===
export async function fetchFaturasGeral(filtros?: {
  startDate?: string;
  endDate?: string;
}): Promise<ApiResponse<FaturaComDetalhes[]>> {
  try {
    console.log('🔍 Buscando faturas gerais com filtros:', filtros);

    let query = supabase
      .from('vw_faturas_completas')
      .select('*')
      .order('created_at', { ascending: false });

    // Aplicar filtros de data se fornecidos
    if (filtros?.startDate) {
      query = query.gte('created_at', filtros.startDate);
    }
    if (filtros?.endDate) {
      query = query.lte('created_at', filtros.endDate + 'T23:59:59');
    }

    const { data: faturasData, error } = await query;

    if (error) {
      console.error('❌ Erro ao buscar faturas:', error);
      throw error;
    }

    // Mapear para interface FaturaComDetalhes
    const faturasComDetalhes: FaturaComDetalhes[] = (faturasData || []).map(
      (fatura) => ({
        ...fatura,
        consultas_periodo:
          fatura.periodo_inicio && fatura.periodo_fim
            ? {
                inicio: fatura.periodo_inicio,
                fim: fatura.periodo_fim,
              }
            : undefined,
        url_asaas: fatura.id_asaas
          ? `https://www.asaas.com/i/${fatura.id_asaas.replace('pay_', '')}`
          : undefined,
        link_nfe: fatura.link_nfe,
        status_nfe: fatura.status_nfe,
      })
    );

    console.log('✅ Faturas gerais encontradas:', faturasComDetalhes.length);

    return {
      success: true,
      data: faturasComDetalhes,
    };
  } catch (error) {
    console.error('❌ Erro ao buscar faturas gerais:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

// === BUSCAR TODAS AS FATURAS COM FILTROS ===
export async function fetchFaturas(
  filtros: FaturaFiltros = {}
): Promise<ApiResponse<PaginatedResponse<FaturaComDetalhes>>> {
  try {
    const {
      paciente_id,
      empresa_id,
      responsavel_id,
      status,
      periodo_inicio,
      periodo_fim,
      limit = 10,
      offset = 0,
    } = filtros;

    let query = supabase
      .from('faturas')
      .select(
        `
        *,
        empresa:pessoa_empresas!empresa_id(razao_social, nome_fantasia),
        responsavel:pessoas!responsavel_cobranca_id(nome, cpf_cnpj),
        criador:pessoas!criado_por(nome)
      `,
        { count: 'exact' }
      )
      .eq('ativo', true);

    // Aplicar filtros
    if (empresa_id) {
      query = query.eq('empresa_id', empresa_id);
    }

    if (responsavel_id) {
      query = query.eq('responsavel_cobranca_id', responsavel_id);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (periodo_inicio) {
      query = query.gte('criado_em', periodo_inicio);
    }

    if (periodo_fim) {
      query = query.lte('criado_em', periodo_fim);
    }

    // Se filtrar por paciente, buscar faturas relacionadas
    if (paciente_id) {
      const { data: agendamentos } = await supabase
        .from('agendamentos')
        .select('fatura_id')
        .eq('paciente_id', paciente_id)
        .not('fatura_id', 'is', null);

      const faturaIds = [
        ...new Set(agendamentos?.map((a) => a.fatura_id).filter(Boolean) || []),
      ];

      if (faturaIds.length === 0) {
        return {
          success: true,
          data: {
            data: [],
            total: 0,
            page: Math.floor(offset / limit) + 1,
            limit,
            totalPages: 0,
          },
        };
      }

      query = query.in('id', faturaIds);
    }

    // Ordenação e paginação
    query = query
      .order('criado_em', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('❌ Erro ao buscar faturas:', error);
      return {
        success: false,
        error: `Erro ao carregar faturas: ${error.message}`,
      };
    }

    const totalPages = Math.ceil((count || 0) / limit);

    return {
      success: true,
      data: {
        data: data || [],
        total: count || 0,
        page: Math.floor(offset / limit) + 1,
        limit,
        totalPages,
      },
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao buscar faturas:', error);
    return {
      success: false,
      error: 'Erro inesperado ao carregar faturas',
    };
  }
}

// === CRIAR NOVA FATURA ===
export async function criarFatura(
  faturaData: CriarFaturaInput,
  userId: string
): Promise<ApiResponse<Fatura>> {
  try {
    console.log('🆕 Criando nova fatura:', faturaData);

    // Criar fatura
    const { data: novaFatura, error: faturaError } = await supabase
      .from('faturas')
      .insert({
        id_asaas: faturaData.id_asaas,
        valor_total: faturaData.valor_total,
        // AI dev note: líquido/serviço (receita). Sem repasse => igual ao bruto.
        valor_servico: faturaData.valor_servico ?? faturaData.valor_total,
        descricao: faturaData.descricao,
        empresa_id: faturaData.empresa_id,
        responsavel_cobranca_id: faturaData.responsavel_cobranca_id,
        // AI dev note: tomador da NFS-e; quando ausente, NULL => usa responsavel_cobranca_id
        tomador_nfe_id: faturaData.tomador_nfe_id ?? null,
        paciente_id: faturaData.paciente_id, // AI dev note: Incluir paciente_id na criação da fatura
        vencimento: faturaData.vencimento,
        dados_asaas: faturaData.dados_asaas || {},
        observacoes: faturaData.observacoes,
        origem: faturaData.origem ?? 'atendimento',
        criado_por: userId === 'system' ? null : userId,
      })
      .select()
      .single();

    if (faturaError) {
      console.error('❌ Erro ao criar fatura:', faturaError);
      return {
        success: false,
        error: `Erro ao criar fatura: ${faturaError.message}`,
      };
    }

    // Atualizar agendamentos para referenciar a fatura
    if (faturaData.agendamento_ids.length > 0) {
      const { error: updateError } = await supabase
        .from('agendamentos')
        .update({
          fatura_id: novaFatura.id,
          cobranca_gerada_em: new Date().toISOString(),
          cobranca_gerada_por: userId === 'system' ? null : userId,
          atualizado_por: userId === 'system' ? null : userId,
        })
        .in('id', faturaData.agendamento_ids);

      if (updateError) {
        console.error('⚠️ Erro ao vincular agendamentos:', updateError);
        // Não falha a operação, mas loga o erro
      }
    }

    console.log('✅ Fatura criada com sucesso:', novaFatura.id);

    // AI dev note: Dispara webhook de manipulação (cobrança criada) para o n8n.
    await enfileirarWebhookFatura('fatura_criada', novaFatura.id, userId, {
      agendamento_ids: faturaData.agendamento_ids,
    });

    return {
      success: true,
      data: novaFatura,
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao criar fatura:', error);
    return {
      success: false,
      error: 'Erro inesperado ao criar fatura',
    };
  }
}

// === ATUALIZAR FATURA ===
export async function atualizarFatura(
  faturaId: string,
  updates: AtualizarFaturaInput,
  userId: string
): Promise<ApiResponse<Fatura>> {
  try {
    console.log('📝 Atualizando fatura:', faturaId);

    const { data, error } = await supabase
      .from('faturas')
      .update({
        ...updates,
        atualizado_por: userId === 'system' ? null : userId,
      })
      .eq('id', faturaId)
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao atualizar fatura:', error);
      return {
        success: false,
        error: `Erro ao atualizar fatura: ${error.message}`,
      };
    }

    console.log('✅ Fatura atualizada:', faturaId);
    return {
      success: true,
      data,
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao atualizar fatura:', error);
    return {
      success: false,
      error: 'Erro inesperado ao atualizar fatura',
    };
  }
}

// === BUSCAR AGENDAMENTOS ELEGÍVEIS PARA EDIÇÃO DE FATURA ===
export async function fetchAgendamentosElegiveisParaFatura(
  responsavelCobrancaId: string,
  faturaId?: string
): Promise<
  ApiResponse<
    Array<{
      id: string;
      data_hora: string;
      servico_nome: string;
      valor_servico: number;
      profissional_nome: string;
      paciente_nome: string;
    }>
  >
> {
  try {
    console.log('🔍 Buscando agendamentos elegíveis para fatura');

    let query = supabase
      .from('vw_agendamentos_completos')
      .select(
        `
        id,
        data_hora,
        servico_nome,
        valor_servico,
        profissional_nome,
        paciente_nome,
        status_consulta_codigo,
        status_pagamento_codigo,
        possui_evolucao,
        fatura_id,
        responsavel_cobranca_id
      `
      )
      .eq('responsavel_cobranca_id', responsavelCobrancaId)
      .eq('status_consulta_codigo', 'finalizado')
      .eq('possui_evolucao', 'sim')
      .in('status_pagamento_codigo', ['pendente', 'cobranca_gerada'])
      .eq('ativo', true);

    // Incluir agendamentos sem fatura OU da fatura atual sendo editada
    if (faturaId) {
      query = query.or(`fatura_id.is.null,fatura_id.eq.${faturaId}`);
    } else {
      query = query.is('fatura_id', null);
    }

    query = query.order('data_hora', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('❌ Erro ao buscar agendamentos elegíveis:', error);
      return {
        success: false,
        error: `Erro ao buscar agendamentos: ${error.message}`,
      };
    }

    const agendamentos = (data || []).map((item) => ({
      id: item.id,
      data_hora: item.data_hora,
      servico_nome: item.servico_nome || 'Serviço não especificado',
      valor_servico: parseFloat(item.valor_servico || '0'),
      profissional_nome:
        item.profissional_nome || 'Profissional não especificado',
      paciente_nome: item.paciente_nome || 'Paciente não especificado',
    }));

    console.log('✅ Agendamentos elegíveis encontrados:', agendamentos.length);
    return {
      success: true,
      data: agendamentos,
    };
  } catch (error) {
    console.error(
      '❌ Erro inesperado ao buscar agendamentos elegíveis:',
      error
    );
    return {
      success: false,
      error: 'Erro inesperado ao buscar agendamentos',
    };
  }
}

// === EDITAR FATURA EXISTENTE ===
export async function editarFatura(
  faturaId: string,
  updates: {
    agendamentosParaAdicionar: string[];
    agendamentosParaRemover: string[];
    novoValorTotal?: number;
    novaDescricao?: string;
    novoVencimento?: string;
  },
  userId: string
): Promise<ApiResponse<Fatura>> {
  try {
    console.log('📝 Iniciando edição da fatura:', faturaId);

    // Validar se usuário tem permissão (admin ou secretaria podem editar faturas)
    if (userId !== 'system') {
      const { data: userData, error: userError } = await supabase
        .from('pessoas')
        .select('role')
        .eq('id', userId)
        .single();

      if (
        userError ||
        !userData ||
        !['admin', 'secretaria'].includes(userData.role)
      ) {
        console.error(
          '❌ Usuário sem permissão para editar faturas:',
          userData?.role
        );
        return {
          success: false,
          error: 'Apenas administradores e secretárias podem editar faturas',
        };
      }
    }

    // 1. Buscar fatura atual
    const { data: faturaAtual, error: buscarError } = await supabase
      .from('faturas')
      .select(
        `
        id, 
        status, 
        id_asaas, 
        valor_total, 
        descricao, 
        vencimento, 
        empresa_id,
        responsavel_cobranca_id,
        dados_asaas
      `
      )
      .eq('id', faturaId)
      .single();

    if (buscarError || !faturaAtual) {
      console.error('❌ Fatura não encontrada:', buscarError);
      return {
        success: false,
        error: `Fatura não encontrada: ${buscarError?.message}`,
      };
    }

    // 2. Validar se fatura pode ser editada
    if (!['pendente', 'atrasado'].includes(faturaAtual.status)) {
      return {
        success: false,
        error: `Fatura com status "${faturaAtual.status}" não pode ser editada`,
      };
    }

    // 3. Calcular novos valores se necessário
    let novoValorTotal = updates.novoValorTotal || faturaAtual.valor_total;
    let novaDescricao = updates.novaDescricao || faturaAtual.descricao;

    // Se não foram fornecidos valores, calcular baseado nos agendamentos
    if (!updates.novoValorTotal || !updates.novaDescricao) {
      // Buscar agendamentos atuais da fatura
      const { data: agendamentosAtuais } = await supabase
        .from('vw_agendamentos_completos')
        .select(
          `
          id, 
          valor_servico, 
          servico_nome, 
          tipo_servico_id,
          data_hora, 
          paciente_nome,
          paciente_id,
          profissional_nome,
          profissional_id,
          responsavel_cobranca_id,
          responsavel_cobranca_nome
        `
        )
        .eq('fatura_id', faturaId);

      // Buscar novos agendamentos a serem adicionados
      let novosAgendamentos: Array<Record<string, unknown>> = [];
      if (updates.agendamentosParaAdicionar.length > 0) {
        const { data } = await supabase
          .from('vw_agendamentos_completos')
          .select(
            `
            id, 
            valor_servico, 
            servico_nome, 
            tipo_servico_id,
            data_hora, 
            paciente_nome,
            paciente_id,
            profissional_nome,
            profissional_id,
            responsavel_cobranca_id,
            responsavel_cobranca_nome
          `
          )
          .in('id', updates.agendamentosParaAdicionar);
        novosAgendamentos = data || [];
      }

      // Filtrar agendamentos que serão removidos
      const agendamentosFinaisBrutos = [
        ...(agendamentosAtuais || []).filter(
          (a) => !updates.agendamentosParaRemover.includes(a.id)
        ),
        ...novosAgendamentos,
      ];

      // AI dev note: BLINDAGEM CONTRA COBRANÇA DUPLICADA - dedupe por id. Um
      // agendamento já vinculado à fatura que também venha em "adicionar" não pode
      // entrar 2x, senão valor_total (reduce) e descrição dobram.
      const idsFatura = new Set<string>();
      const agendamentosFinais = agendamentosFinaisBrutos.filter((a) => {
        const aId = a.id as string | undefined;
        if (!aId) return true;
        if (idsFatura.has(aId)) return false;
        idsFatura.add(aId);
        return true;
      });

      // Calcular novo valor total
      novoValorTotal = agendamentosFinais.reduce(
        (sum, a) => sum + parseFloat(a.valor_servico || '0'),
        0
      );

      // Gerar nova descrição usando função centralizada
      if (agendamentosFinais.length > 0) {
        const firstAgendamento = agendamentosFinais[0];

        // Mapear para formato esperado pela função de descrição
        const consultationData = agendamentosFinais.map((a) => ({
          id: a.id,
          data_hora: a.data_hora,
          servico_nome: a.servico_nome || 'Atendimento',
          valor_servico: parseFloat(a.valor_servico || '0'),
          profissional_nome: a.profissional_nome || 'Profissional',
          profissional_id: a.profissional_id,
          tipo_servico_id: a.tipo_servico_id,
        }));

        const patientData = {
          nome: firstAgendamento.paciente_nome || 'Paciente',
          cpf_cnpj: '', // Será buscado pela função automaticamente via profissional_id
        };

        // Buscar CPF do paciente se necessário
        if (firstAgendamento.paciente_id) {
          const { data: pacienteData } = await supabase
            .from('pessoas')
            .select('cpf_cnpj')
            .eq('id', firstAgendamento.paciente_id)
            .single();

          if (pacienteData?.cpf_cnpj) {
            patientData.cpf_cnpj = pacienteData.cpf_cnpj;
          }
        }

        try {
          novaDescricao = await generateChargeDescription(
            consultationData,
            patientData
          );
        } catch (error) {
          console.warn('⚠️ Erro ao gerar descrição, usando fallback:', error);
          // Fallback para descrição simples
          const consultasPorTipo = agendamentosFinais.reduce(
            (acc: Record<string, number>, a) => {
              const agendamento = a as Record<string, unknown> & {
                servico_nome?: string;
              };
              const servico =
                agendamento.servico_nome || 'Serviço não especificado';
              acc[servico] = (acc[servico] || 0) + 1;
              return acc;
            },
            {}
          );

          const descricaoServicos = Object.entries(consultasPorTipo)
            .map(
              ([servico, qtd]) =>
                `${qtd as number} ${servico}${(qtd as number) > 1 ? 's' : ''}`
            )
            .join(', ');

          novaDescricao = `${descricaoServicos} - ${firstAgendamento.paciente_nome || 'Paciente'}`;
        }
      }
    }

    // 4. Obter API key da empresa
    const apiConfig = await determineApiKeyFromEmpresa(faturaAtual.empresa_id);
    if (!apiConfig) {
      return {
        success: false,
        error: 'Empresa não possui API key do ASAAS configurada',
      };
    }

    // 5. Atualizar cobrança no ASAAS
    console.log('🔄 Atualizando cobrança no ASAAS...');
    const updatePaymentData: UpdatePaymentRequest = {
      billingType: 'PIX',
      value: novoValorTotal,
      dueDate: updates.novoVencimento || faturaAtual.vencimento,
      description: novaDescricao,
    };

    const asaasResult = await updateAsaasPayment(
      faturaAtual.id_asaas,
      updatePaymentData,
      apiConfig
    );

    if (!asaasResult.success) {
      console.error(
        '❌ Erro ao atualizar cobrança no ASAAS:',
        asaasResult.error
      );
      return {
        success: false,
        error: `Erro no ASAAS: ${asaasResult.error}`,
      };
    }

    console.log('✅ Cobrança atualizada no ASAAS');

    // 6. Atualizar fatura no Supabase
    const { data: faturaAtualizada, error: updateError } = await supabase
      .from('faturas')
      .update({
        valor_total: novoValorTotal,
        descricao: novaDescricao,
        vencimento: updates.novoVencimento || faturaAtual.vencimento,
        dados_asaas: {
          ...((faturaAtual.dados_asaas as Record<string, unknown>) || {}),
          updated_at: new Date().toISOString(),
          updated_payment_data: asaasResult.data,
        },
        atualizado_por: userId === 'system' ? null : userId,
      })
      .eq('id', faturaId)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Erro ao atualizar fatura no Supabase:', updateError);
      return {
        success: false,
        error: `Erro ao atualizar fatura: ${updateError.message}`,
      };
    }

    // 7. Desvincular agendamentos removidos
    if (updates.agendamentosParaRemover.length > 0) {
      // Buscar ID do status "pendente"
      const { data: statusPendente, error: statusError } = await supabase
        .from('pagamento_status')
        .select('id')
        .eq('codigo', 'pendente')
        .single();

      if (statusError || !statusPendente) {
        console.warn('⚠️ Erro ao buscar status pendente:', statusError);
        // Continua a operação mesmo com erro, apenas não atualiza o status
      }

      const { error: unlinkError } = await supabase
        .from('agendamentos')
        .update({
          fatura_id: null,
          id_pagamento_externo: null,
          cobranca_gerada_em: null,
          cobranca_gerada_por: null,
          status_pagamento_id: statusPendente?.id || null,
          atualizado_por: userId === 'system' ? null : userId,
        })
        .in('id', updates.agendamentosParaRemover);

      if (unlinkError) {
        console.warn('⚠️ Erro ao desvincular agendamentos:', unlinkError);
      } else {
        console.log(
          `✅ ${updates.agendamentosParaRemover.length} agendamentos desvinculados e status retornado para pendente`
        );
      }
    }

    // 8. Vincular novos agendamentos
    if (updates.agendamentosParaAdicionar.length > 0) {
      const { error: linkError } = await supabase
        .from('agendamentos')
        .update({
          fatura_id: faturaId,
          id_pagamento_externo: faturaAtual.id_asaas,
          cobranca_gerada_em: new Date().toISOString(),
          cobranca_gerada_por: userId === 'system' ? null : userId,
          atualizado_por: userId === 'system' ? null : userId,
        })
        .in('id', updates.agendamentosParaAdicionar);

      if (linkError) {
        console.warn('⚠️ Erro ao vincular novos agendamentos:', linkError);
      } else {
        console.log(
          `✅ ${updates.agendamentosParaAdicionar.length} agendamentos vinculados`
        );
      }
    }

    console.log('🎉 Fatura editada com sucesso');

    // AI dev note: Dispara webhook de manipulação (cobrança atualizada) para o n8n.
    await enfileirarWebhookFatura('fatura_atualizada', faturaId, userId, {
      agendamentos_adicionados: updates.agendamentosParaAdicionar,
      agendamentos_removidos: updates.agendamentosParaRemover,
    });

    return {
      success: true,
      data: faturaAtualizada,
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao editar fatura:', error);
    return {
      success: false,
      error: 'Erro inesperado ao editar fatura',
    };
  }
}

// === EXCLUIR FATURA EXISTENTE ===
export async function excluirFatura(
  faturaId: string,
  userId: string,
  // AI dev note: skipWebhook evita disparar o webhook 'fatura_cancelada' ao n8n.
  // Usado pelo "refazer cobrança" (re-emissão): não é um cancelamento de verdade —
  // um novo link é enviado logo em seguida, então avisar "cobrança cancelada" ao
  // cliente confundiria. Callers normais mantêm o webhook (default false).
  options?: { skipWebhook?: boolean }
): Promise<ApiResponse<boolean>> {
  try {
    console.log('🗑️ Iniciando exclusão da fatura:', faturaId);

    // Validar se usuário tem permissão (admin ou secretaria podem excluir faturas)
    if (userId !== 'system') {
      const { data: userData, error: userError } = await supabase
        .from('pessoas')
        .select('role')
        .eq('id', userId)
        .single();

      if (
        userError ||
        !userData ||
        !['admin', 'secretaria'].includes(userData.role)
      ) {
        console.error(
          '❌ Usuário sem permissão para excluir faturas:',
          userData?.role
        );
        return {
          success: false,
          error: 'Apenas administradores e secretárias podem excluir faturas',
        };
      }
    }

    // 1. Buscar fatura atual
    const { data: faturaAtual, error: buscarError } = await supabase
      .from('faturas')
      .select(
        `
        id, 
        status, 
        id_asaas, 
        empresa_id
      `
      )
      .eq('id', faturaId)
      .single();

    if (buscarError || !faturaAtual) {
      console.error('❌ Fatura não encontrada:', buscarError);
      return {
        success: false,
        error: `Fatura não encontrada: ${buscarError?.message}`,
      };
    }

    // 2. Validar se fatura pode ser excluída
    if (faturaAtual.status === 'pago') {
      return {
        success: false,
        error: 'Faturas pagas não podem ser excluídas',
      };
    }

    // 3. Obter API key da empresa
    const apiConfig = await determineApiKeyFromEmpresa(faturaAtual.empresa_id);
    if (!apiConfig) {
      return {
        success: false,
        error: 'Empresa não possui API key do ASAAS configurada',
      };
    }

    // 4. Cancelar cobrança no ASAAS
    console.log('🔄 Cancelando cobrança no ASAAS...');
    const asaasResult = await cancelAsaasPayment(
      faturaAtual.id_asaas,
      apiConfig
    );

    if (!asaasResult.success) {
      console.error(
        '❌ Erro ao cancelar cobrança no ASAAS:',
        asaasResult.error
      );
      return {
        success: false,
        error: `Erro no ASAAS: ${asaasResult.error}`,
      };
    }

    console.log('✅ Cobrança cancelada no ASAAS');

    // 5. Buscar ID do status "pendente"
    console.log('🔍 Buscando ID do status "pendente"...');
    const { data: statusPendente, error: statusError } = await supabase
      .from('pagamento_status')
      .select('id')
      .eq('codigo', 'pendente')
      .single();

    if (statusError || !statusPendente) {
      console.error('❌ Erro ao buscar status pendente:', statusError);
      return {
        success: false,
        error: 'Erro ao buscar status de pagamento pendente',
      };
    }

    console.log('✅ Status pendente encontrado:', statusPendente.id);

    // 6. Desvincular agendamentos e retornar status para pendente
    console.log('🔗 Desvinculando agendamentos da fatura...');
    const { error: unlinkError } = await supabase
      .from('agendamentos')
      .update({
        fatura_id: null,
        id_pagamento_externo: null,
        cobranca_gerada_em: null,
        cobranca_gerada_por: null,
        status_pagamento_id: statusPendente.id,
        atualizado_por: userId === 'system' ? null : userId,
      })
      .eq('fatura_id', faturaId);

    if (unlinkError) {
      console.error('❌ Erro ao desvincular agendamentos:', unlinkError);
      return {
        success: false,
        error: `Erro ao desvincular agendamentos: ${unlinkError.message}`,
      };
    }

    console.log(
      '✅ Agendamentos desvinculados e status retornado para pendente'
    );

    // 7. Excluir fatura (soft delete)
    const { error: deleteError } = await supabase
      .from('faturas')
      .update({
        ativo: false,
        observacoes: `Fatura excluída em ${new Date().toLocaleString('pt-BR')} por admin`,
        atualizado_por: userId === 'system' ? null : userId,
      })
      .eq('id', faturaId);

    if (deleteError) {
      console.error('❌ Erro ao excluir fatura:', deleteError);
      return {
        success: false,
        error: `Erro ao excluir fatura: ${deleteError.message}`,
      };
    }

    // AI dev note: se a fatura nasceu de um link de pagamento, cancelar o
    // pagamento_links órfão. Senão ele fica 'confirmado' apontando para a fatura
    // excluída e reaparece como "aguardando pagamento" no funil de pré-cobranças
    // (vw_pre_cobrancas_completa), além de sumir dos detalhes do paciente. As
    // consultas já foram soltas acima, então o link não tem mais função.
    const { error: linkOrfaoError } = await supabase
      .from('pagamento_links')
      .update({
        status: 'cancelado',
        ativo: false,
        atualizado_em: new Date().toISOString(),
      })
      .eq('fatura_id', faturaId)
      .eq('ativo', true);
    if (linkOrfaoError) {
      console.warn(
        '⚠️ Fatura excluída, mas falha ao cancelar o link de pagamento órfão:',
        linkOrfaoError
      );
    }

    console.log('🎉 Fatura excluída com sucesso');

    // AI dev note: Dispara webhook de manipulação (cobrança cancelada) para o n8n.
    // Suprimido no "refazer cobrança" (o novo link já avisa o cliente).
    if (!options?.skipWebhook) {
      await enfileirarWebhookFatura('fatura_cancelada', faturaId, userId);
    }

    return {
      success: true,
      data: true,
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao excluir fatura:', error);
    return {
      success: false,
      error: 'Erro inesperado ao excluir fatura',
    };
  }
}

// === REFAZER COBRANÇA (trocar forma de pagamento) ===
// AI dev note: O cliente quer trocar a forma de pagamento depois que a cobrança já
// foi gerada (ex.: gerou PIX e quer cartão, ou escolheu 6x mas saiu à vista). O Asaas
// NÃO deixa trocar o método (billingType) nem o parcelamento de uma cobrança existente,
// e o valor MUDA conforme o método (o cartão embute o repasse). Então a única forma é
// CANCELAR a cobrança atual (se NÃO paga) e GERAR UM NOVO link, reenviando ao cliente
// para ele re-escolher. Cobrança PAGA não pode ser trocada (seria caso de estorno).
// Reaproveita excluirFatura (cancela no Asaas + solta as consultas p/ "pendente" +
// soft-delete) e criarLinkPagamento (novo link + reserva as consultas + reenvia WhatsApp).
export async function refazerCobranca(
  faturaId: string,
  userId: string
): Promise<ApiResponse<{ token: string; url: string }>> {
  try {
    // 1. Carregar a fatura e validar elegibilidade
    const { data: fatura, error } = await supabase
      .from('faturas')
      .select(
        `id, status, id_asaas, ativo, empresa_id, paciente_id,
         responsavel_cobranca_id, descricao, valor_servico`
      )
      .eq('id', faturaId)
      .single();

    if (error || !fatura) {
      return { success: false, error: 'Fatura não encontrada' };
    }
    if (!fatura.ativo) {
      return { success: false, error: 'Esta fatura não está ativa' };
    }
    if (fatura.status === 'pago') {
      return {
        success: false,
        error:
          'Cobrança já paga não pode ter a forma trocada. Para devolver o valor, faça um estorno.',
      };
    }
    if (!fatura.id_asaas) {
      return {
        success: false,
        error: 'Esta fatura não tem cobrança no Asaas. Use "Editar".',
      };
    }

    // 2. Capturar as consultas vinculadas ANTES de cancelar (excluirFatura as solta)
    const { data: ags } = await supabase
      .from('agendamentos')
      .select('id, valor_servico')
      .eq('fatura_id', faturaId)
      .eq('ativo', true);
    const agendamentoIds = (ags || []).map((a) => a.id as string);
    if (agendamentoIds.length === 0) {
      return {
        success: false,
        error: 'Nenhuma consulta vinculada a esta cobrança para refazer.',
      };
    }
    const valorBase =
      (ags || []).reduce((s, a) => s + Number(a.valor_servico || 0), 0) ||
      Number(fatura.valor_servico || 0);

    // 3. Cancelar a cobrança atual (Asaas + solta consultas p/ pendente + soft-delete).
    // skipWebhook: não avisar "cobrança cancelada" — o novo link reenviado já comunica.
    const cancelou = await excluirFatura(faturaId, userId, {
      skipWebhook: true,
    });
    if (!cancelou.success) {
      return {
        success: false,
        error: `Não foi possível cancelar a cobrança atual: ${cancelou.error}`,
      };
    }

    // 4. Gerar o novo link (reserva as consultas de novo e reenvia o link ao cliente)
    const novo = await criarLinkPagamento(
      {
        agendamentoIds,
        pacienteId: fatura.paciente_id,
        responsavelId: fatura.responsavel_cobranca_id,
        empresaId: fatura.empresa_id,
        valorBase,
        descricao: fatura.descricao || 'Cobrança Respira Kids',
      },
      userId
    );

    if (!novo.success || !novo.data) {
      return {
        success: false,
        error: `A cobrança foi cancelada, mas houve falha ao gerar o novo link (${novo.error}). Gere uma nova cobrança para o paciente manualmente.`,
      };
    }

    return {
      success: true,
      data: { token: novo.data.token, url: novo.data.url },
    };
  } catch (error) {
    console.error('❌ Erro ao refazer cobrança:', error);
    return { success: false, error: 'Erro inesperado ao refazer a cobrança' };
  }
}

// === AJUSTE MANUAL DE FATURA (sem ASAAS) ===
// AI dev note: Usado quando o webhook ASAAS -> n8n -> Supabase falhou e os
// parâmetros locais ficaram dessincronizados. NÃO chama o ASAAS (assume que o
// ASAAS já está correto). Permite corrigir status/valor/vencimento/descrição e,
// opcionalmente, desvincular as consultas (reabrindo-as para uma nova cobrança).
export interface AjusteManualFaturaInput {
  status?: 'pago' | 'pendente' | 'atrasado' | 'cancelado' | 'estornado';
  valor_total?: number;
  vencimento?: string; // YYYY-MM-DD
  descricao?: string;
  pago_em?: string | null;
  observacoes?: string;
  // Quando true: marca a fatura como inativa e desvincula os agendamentos,
  // que voltam para "pendente" e ficam livres para uma nova cobrança.
  desvincularConsultas?: boolean;
}

export async function ajustarFaturaManual(
  faturaId: string,
  ajuste: AjusteManualFaturaInput,
  userId: string
): Promise<ApiResponse<Fatura>> {
  try {
    console.log('🛠️ Ajuste manual da fatura:', faturaId, ajuste);

    // Validar permissão (admin ou secretaria)
    if (userId !== 'system') {
      const { data: userData, error: userError } = await supabase
        .from('pessoas')
        .select('role')
        .eq('id', userId)
        .single();

      if (
        userError ||
        !userData ||
        !['admin', 'secretaria'].includes(userData.role)
      ) {
        return {
          success: false,
          error:
            'Apenas administradores e secretárias podem ajustar faturas manualmente',
        };
      }
    }

    const { data: faturaAtual, error: buscarError } = await supabase
      .from('faturas')
      .select('id, status, ativo')
      .eq('id', faturaId)
      .single();

    if (buscarError || !faturaAtual) {
      return {
        success: false,
        error: `Fatura não encontrada: ${buscarError?.message}`,
      };
    }

    const cancelar =
      ajuste.desvincularConsultas || ajuste.status === 'cancelado';

    // Montar update apenas com os campos fornecidos
    const updateData: Record<string, unknown> = {
      atualizado_por: userId === 'system' ? null : userId,
    };
    if (ajuste.status !== undefined) updateData.status = ajuste.status;
    if (ajuste.valor_total !== undefined)
      updateData.valor_total = ajuste.valor_total;
    if (ajuste.vencimento !== undefined)
      updateData.vencimento = ajuste.vencimento;
    if (ajuste.descricao !== undefined) updateData.descricao = ajuste.descricao;
    if (ajuste.pago_em !== undefined) updateData.pago_em = ajuste.pago_em;
    if (ajuste.observacoes !== undefined)
      updateData.observacoes = ajuste.observacoes;
    if (cancelar) {
      updateData.ativo = false;
      if (ajuste.status === undefined) updateData.status = 'cancelado';
    }

    const { data: faturaAtualizada, error: updateError } = await supabase
      .from('faturas')
      .update(updateData)
      .eq('id', faturaId)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Erro ao ajustar fatura:', updateError);
      return {
        success: false,
        error: `Erro ao ajustar fatura: ${updateError.message}`,
      };
    }

    // Desvincular agendamentos quando cancelar/desvincular (sem tocar no ASAAS)
    if (cancelar) {
      const { data: statusPendente } = await supabase
        .from('pagamento_status')
        .select('id')
        .eq('codigo', 'pendente')
        .single();

      const { error: unlinkError } = await supabase
        .from('agendamentos')
        .update({
          fatura_id: null,
          id_pagamento_externo: null,
          cobranca_gerada_em: null,
          cobranca_gerada_por: null,
          status_pagamento_id: statusPendente?.id || null,
          atualizado_por: userId === 'system' ? null : userId,
        })
        .eq('fatura_id', faturaId);

      if (unlinkError) {
        console.warn(
          '⚠️ Erro ao desvincular agendamentos no ajuste manual:',
          unlinkError
        );
      }

      // AI dev note: cancelar também o link de pagamento órfão (mesma razão do
      // excluirFatura) — evita link 'confirmado' apontando para fatura excluída,
      // que reaparece como "aguardando" no funil de pré-cobranças.
      await supabase
        .from('pagamento_links')
        .update({
          status: 'cancelado',
          ativo: false,
          atualizado_em: new Date().toISOString(),
        })
        .eq('fatura_id', faturaId)
        .eq('ativo', true);
    }

    // Dispara webhook de manipulação (ajuste manual) para o n8n
    await enfileirarWebhookFatura('fatura_ajustada', faturaId, userId, {
      ajuste_manual: true,
      campos_ajustados: Object.keys(ajuste),
    });

    console.log('✅ Fatura ajustada manualmente:', faturaId);
    return { success: true, data: faturaAtualizada };
  } catch (error) {
    console.error('❌ Erro inesperado ao ajustar fatura manualmente:', error);
    return { success: false, error: 'Erro inesperado ao ajustar fatura' };
  }
}

// === RE-SINCRONIZAR FATURA COM O ASAAS ===
// AI dev note: Consulta o estado atual da cobrança no ASAAS (fonte da verdade) e
// atualiza a fatura local. Resolve o caso de webhook perdido sem precisar editar à
// mão. Se a cobrança não existe mais no ASAAS (404), trata como cancelada e
// desvincula as consultas. NÃO cria/edita nada no ASAAS — apenas lê.
export interface RessincronizarFaturaResult {
  statusAnterior: string;
  statusAtual: string;
  notFound: boolean;
  asaas?: {
    status?: string;
    value?: number;
    dueDate?: string;
    description?: string;
  };
}

export async function ressincronizarFaturaAsaas(
  faturaId: string,
  userId: string
): Promise<ApiResponse<RessincronizarFaturaResult>> {
  try {
    console.log('🔁 Re-sincronizando fatura com o ASAAS:', faturaId);

    // Validar permissão (admin ou secretaria)
    if (userId !== 'system') {
      const { data: userData, error: userError } = await supabase
        .from('pessoas')
        .select('role')
        .eq('id', userId)
        .single();

      if (
        userError ||
        !userData ||
        !['admin', 'secretaria'].includes(userData.role)
      ) {
        return {
          success: false,
          error:
            'Apenas administradores e secretárias podem re-sincronizar faturas',
        };
      }
    }

    const { data: fatura, error: buscarError } = await supabase
      .from('faturas')
      .select('id, status, id_asaas, empresa_id')
      .eq('id', faturaId)
      .single();

    if (buscarError || !fatura) {
      return {
        success: false,
        error: `Fatura não encontrada: ${buscarError?.message}`,
      };
    }

    if (!fatura.id_asaas) {
      return {
        success: false,
        error: 'Fatura não possui cobrança no ASAAS para sincronizar',
      };
    }

    const apiConfig = await determineApiKeyFromEmpresa(fatura.empresa_id);
    if (!apiConfig) {
      return {
        success: false,
        error: 'Empresa não possui API key do ASAAS configurada',
      };
    }

    const result = await getAsaasPayment(fatura.id_asaas, apiConfig);

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Falha ao consultar cobrança no ASAAS',
      };
    }

    const statusAnterior: string = fatura.status;

    // Cobrança excluída no ASAAS => cancelar localmente e desvincular consultas
    if (result.notFound || !result.data) {
      await ajustarFaturaManual(
        faturaId,
        {
          status: 'cancelado',
          desvincularConsultas: true,
          observacoes: `Sincronizado com ASAAS em ${new Date().toLocaleString(
            'pt-BR'
          )}: cobrança não existe mais no ASAAS (cancelada).`,
        },
        userId
      );

      return {
        success: true,
        data: {
          statusAnterior,
          statusAtual: 'cancelado',
          notFound: true,
        },
      };
    }

    const payment = result.data as {
      status?: string;
      deleted?: boolean;
      value?: number;
      dueDate?: string;
      description?: string;
      paymentDate?: string;
      clientPaymentDate?: string;
      confirmedDate?: string;
    };

    const novoStatus = mapAsaasStatusToFatura(payment.status, payment.deleted);

    const updateData: Record<string, unknown> = {
      status: novoStatus,
      atualizado_por: userId === 'system' ? null : userId,
    };
    if (typeof payment.value === 'number')
      updateData.valor_total = payment.value;
    if (payment.dueDate) updateData.vencimento = payment.dueDate;
    if (payment.description) updateData.descricao = payment.description;
    if (novoStatus === 'pago') {
      updateData.pago_em =
        payment.paymentDate ||
        payment.clientPaymentDate ||
        payment.confirmedDate ||
        new Date().toISOString();
    }
    if (novoStatus === 'cancelado') updateData.ativo = false;

    const { error: updateError } = await supabase
      .from('faturas')
      .update(updateData)
      .eq('id', faturaId);

    if (updateError) {
      return {
        success: false,
        error: `Erro ao atualizar fatura: ${updateError.message}`,
      };
    }

    // Se virou cancelado pelo ASAAS, desvincular consultas (sem tocar no ASAAS)
    if (novoStatus === 'cancelado') {
      const { data: statusPendente } = await supabase
        .from('pagamento_status')
        .select('id')
        .eq('codigo', 'pendente')
        .single();

      await supabase
        .from('agendamentos')
        .update({
          fatura_id: null,
          id_pagamento_externo: null,
          cobranca_gerada_em: null,
          cobranca_gerada_por: null,
          status_pagamento_id: statusPendente?.id || null,
          atualizado_por: userId === 'system' ? null : userId,
        })
        .eq('fatura_id', faturaId);
    }

    await enfileirarWebhookFatura('fatura_ajustada', faturaId, userId, {
      ressincronizado_asaas: true,
      status_anterior: statusAnterior,
      status_atual: novoStatus,
    });

    console.log('✅ Fatura re-sincronizada com o ASAAS:', {
      faturaId,
      statusAnterior,
      statusAtual: novoStatus,
    });

    return {
      success: true,
      data: {
        statusAnterior,
        statusAtual: novoStatus,
        notFound: false,
        asaas: {
          status: payment.status,
          value: payment.value,
          dueDate: payment.dueDate,
          description: payment.description,
        },
      },
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao re-sincronizar fatura:', error);
    return {
      success: false,
      error: 'Erro inesperado ao re-sincronizar fatura',
    };
  }
}

// === EMITIR NFE PARA FATURA ===
export async function emitirNfeFatura(
  faturaId: string,
  userId: string
): Promise<ApiResponse<{ invoiceId: string; link_nfe?: string }>> {
  try {
    console.log('📄 Iniciando emissão de NFe para fatura:', faturaId);

    // Validar se usuário tem permissão (admin ou secretaria podem emitir NFe)
    if (userId !== 'system') {
      const { data: userData, error: userError } = await supabase
        .from('pessoas')
        .select('role')
        .eq('id', userId)
        .single();

      if (
        userError ||
        !userData ||
        !['admin', 'secretaria'].includes(userData.role)
      ) {
        console.error(
          '❌ Usuário sem permissão para emitir NFe:',
          userData?.role
        );
        return {
          success: false,
          error:
            'Apenas administradores e secretárias podem emitir notas fiscais',
        };
      }
    }

    // 1. Buscar fatura
    const { data: fatura, error: faturaError } = await supabase
      .from('faturas')
      .select(
        `
        id, 
        status, 
        id_asaas, 
        valor_total,
        descricao,
        empresa_id,
        link_nfe
      `
      )
      .eq('id', faturaId)
      .single();

    if (faturaError || !fatura) {
      console.error('❌ Fatura não encontrada:', faturaError);
      return {
        success: false,
        error: `Fatura não encontrada: ${faturaError?.message}`,
      };
    }

    // 2. Validar se fatura pode ter NFe emitida
    if (fatura.status !== 'pago') {
      return {
        success: false,
        error: 'Apenas faturas pagas podem ter NFe emitida',
      };
    }

    if (fatura.link_nfe && fatura.link_nfe !== 'erro') {
      return {
        success: false,
        error: 'Fatura já possui NFe ou está em processamento',
      };
    }

    // AI dev note: Quando a fatura está em estado de erro (ex: erro de RPS),
    // precisamos limpar as invoices antigas no ASAAS antes de reemitir, caso
    // contrário ficariam invoices órfãs/duplicadas no ASAAS.
    const isRetryAfterError = fatura.link_nfe === 'erro';

    // 3. Marcar como sincronizando
    await supabase
      .from('faturas')
      .update({
        link_nfe: 'sincronizando',
        status_nfe: null,
        atualizado_por: userId === 'system' ? null : userId,
      })
      .eq('id', faturaId);

    // 4. Obter API key da empresa
    const apiConfig = await determineApiKeyFromEmpresa(fatura.empresa_id);
    if (!apiConfig) {
      // Reverter status
      await supabase
        .from('faturas')
        .update({
          link_nfe: 'erro',
          status_nfe: 'Empresa sem API key configurada',
        })
        .eq('id', faturaId);

      return {
        success: false,
        error: 'Empresa não possui API key do ASAAS configurada',
      };
    }

    // 4.1. Se está reemitindo após erro, cancelar invoices antigas no ASAAS
    if (isRetryAfterError && fatura.id_asaas) {
      console.log(
        '♻️ Reemissão após erro: cancelando invoices antigas no ASAAS para payment',
        fatura.id_asaas
      );
      const cancelResult = await cancelAsaasInvoicesByPayment(
        fatura.id_asaas,
        apiConfig
      );

      if (!cancelResult.success) {
        console.error(
          '❌ Falha ao cancelar invoices antigas no ASAAS:',
          cancelResult.error
        );
        await supabase
          .from('faturas')
          .update({
            link_nfe: 'erro',
            status_nfe: `Falha ao cancelar NFe anterior: ${cancelResult.error || 'erro desconhecido'}`,
            atualizado_por: userId === 'system' ? null : userId,
          })
          .eq('id', faturaId);

        return {
          success: false,
          error:
            cancelResult.error ||
            'Não foi possível cancelar a nota fiscal anterior para reemissão',
        };
      }

      const cancelData = cancelResult.data as
        | { results?: unknown[]; totalProcessed?: number }
        | undefined;
      console.log(
        '✅ Invoices antigas tratadas no ASAAS:',
        cancelData?.totalProcessed ?? 0
      );
    }

    try {
      // 5. Agendar nota fiscal
      // AI dev note: invoicePayload fica em uma const para podermos reaproveitar
      // numa eventual nova tentativa após limpar invoices órfãs no ASAAS.
      const invoicePayload = {
        serviceDescription: fatura.descricao || 'Serviços de fisioterapia',
        observations: '',
        value: fatura.valor_total,
        deductions: 0,
        effectiveDate: new Date().toISOString().split('T')[0],
        municipalServiceId: '290448',
        municipalServiceName:
          'Terapia ocupacional, fisioterapia e fonoaudiologia.',
        updatePayment: false,
        taxes: {
          retainIss: false,
          iss: 2, // 2% ISS
          cofins: 0,
          csll: 0,
          inss: 0,
          ir: 0,
          pis: 0,
        },
      };

      console.log('📋 Agendando nota fiscal...');
      let scheduleResult = await scheduleAsaasInvoice(
        fatura.id_asaas,
        invoicePayload,
        apiConfig
      );

      // AI dev note: O ASAAS rejeita o agendamento quando JÁ EXISTE uma invoice
      // para o payment ("Já existe uma nota fiscal agendada para essa cobrança").
      // Isso acontece com invoices órfãs (ex: webhook de NFe que nunca chegou e
      // deixou o link_nfe defasado, ou emissão anterior interrompida). Mesmo que
      // a fatura não esteja marcada como 'erro', limpamos as invoices existentes
      // no ASAAS e tentamos agendar novamente UMA vez, deixando o botão
      // "Emitir NFe" auto-curável em um único clique.
      const invoiceAlreadyExists =
        !scheduleResult.success &&
        /j[áa]\s*existe|already\s*exist|agendada para essa cobran/i.test(
          scheduleResult.error || ''
        );

      if (invoiceAlreadyExists && !isRetryAfterError && fatura.id_asaas) {
        console.log(
          '♻️ Já existe NFe para essa cobrança. Limpando invoices órfãs e reagendando...'
        );
        const autoCancelResult = await cancelAsaasInvoicesByPayment(
          fatura.id_asaas,
          apiConfig
        );

        if (!autoCancelResult.success) {
          throw new Error(
            autoCancelResult.error ||
              'Não foi possível cancelar a nota fiscal existente para reemissão'
          );
        }

        console.log('✅ Invoices órfãs tratadas. Reagendando nota fiscal...');
        scheduleResult = await scheduleAsaasInvoice(
          fatura.id_asaas,
          invoicePayload,
          apiConfig
        );
      }

      if (!scheduleResult.success) {
        throw new Error(scheduleResult.error || 'Erro ao agendar nota fiscal');
      }

      const scheduleData = scheduleResult.data as { id: string };
      console.log('✅ Nota fiscal agendada:', scheduleData.id);

      // 6. Emitir nota fiscal
      console.log('📤 Emitindo nota fiscal...');
      const authorizeResult = await authorizeAsaasInvoice(
        scheduleData.id,
        apiConfig
      );

      if (!authorizeResult.success) {
        throw new Error(authorizeResult.error || 'Erro ao emitir nota fiscal');
      }

      console.log('✅ Nota fiscal emitida com sucesso');

      // 7. Atualizar fatura com link da NFe (será atualizado por webhook)
      await supabase
        .from('faturas')
        .update({
          link_nfe: 'sincronizando', // Manter sincronizando até webhook confirmar
          status_nfe: 'Emitida com sucesso - aguardando link',
          atualizado_por: userId === 'system' ? null : userId,
        })
        .eq('id', faturaId);

      const authorizeData = authorizeResult.data as {
        pdfUrl?: string;
        linkToVisualize?: string;
      };
      return {
        success: true,
        data: {
          invoiceId: scheduleData.id,
          link_nfe: authorizeData.pdfUrl || authorizeData.linkToVisualize,
        },
      };
    } catch (error) {
      console.error('❌ Erro no processo de emissão:', error);

      // Marcar como erro
      const errorMessage =
        error instanceof Error ? error.message : 'Erro desconhecido na emissão';
      await supabase
        .from('faturas')
        .update({
          link_nfe: 'erro',
          status_nfe: errorMessage,
          atualizado_por: userId === 'system' ? null : userId,
        })
        .eq('id', faturaId);

      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro no processo de emissão de NFe',
      };
    }
  } catch (error) {
    console.error('❌ Erro inesperado ao emitir NFe:', error);
    return {
      success: false,
      error: 'Erro inesperado ao emitir NFe',
    };
  }
}

// === BUSCAR MÉTRICAS DE FATURAS ===
export async function fetchFaturaMetricas(
  pacienteId?: string
): Promise<ApiResponse<FaturaMetricas>> {
  try {
    let query = supabase
      .from('faturas')
      .select('id, valor_total, valor_servico, status, vencimento')
      .eq('ativo', true);

    // Se filtrar por paciente
    if (pacienteId) {
      const { data: agendamentos } = await supabase
        .from('agendamentos')
        .select('fatura_id')
        .eq('paciente_id', pacienteId)
        .not('fatura_id', 'is', null);

      const faturaIds = [
        ...new Set(agendamentos?.map((a) => a.fatura_id).filter(Boolean) || []),
      ];

      if (faturaIds.length === 0) {
        return {
          success: true,
          data: {
            total_faturas: 0,
            valor_total: 0,
            valor_servico: 0,
            valor_acrescimo: 0,
            valor_pendente: 0,
            valor_pago: 0,
            valor_atrasado: 0,
            faturas_vencendo: 0,
          },
        };
      }

      query = query.in('id', faturaIds);
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ Erro ao buscar métricas:', error);
      return {
        success: false,
        error: `Erro ao carregar métricas: ${error.message}`,
      };
    }

    // Calcular métricas
    const metricas = (data || []).reduce(
      (acc, fatura) => {
        acc.total_faturas++;
        acc.valor_total += fatura.valor_total;
        // AI dev note: serviço = receita; acréscimo = repasse de cartão (não é receita).
        // valor_pago/pendente/atrasado seguem o BRUTO (é o que o cliente deve/pagou).
        const servico = fatura.valor_servico ?? fatura.valor_total;
        acc.valor_servico += servico;
        acc.valor_acrescimo += Math.max(0, fatura.valor_total - servico);

        switch (fatura.status) {
          case 'pago':
            acc.valor_pago += fatura.valor_total;
            break;
          case 'pendente':
            acc.valor_pendente += fatura.valor_total;
            break;
          case 'atrasado':
            acc.valor_atrasado += fatura.valor_total;
            break;
        }

        // Verificar se vence nos próximos 7 dias
        if (fatura.vencimento && fatura.status !== 'pago') {
          const vencimento = new Date(fatura.vencimento);
          const hoje = new Date();
          const diasParaVencimento =
            (vencimento.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24);

          if (diasParaVencimento <= 7 && diasParaVencimento >= 0) {
            acc.faturas_vencendo++;
          }
        }

        return acc;
      },
      {
        total_faturas: 0,
        valor_total: 0,
        valor_servico: 0,
        valor_acrescimo: 0,
        valor_pendente: 0,
        valor_pago: 0,
        valor_atrasado: 0,
        faturas_vencendo: 0,
      }
    );

    return {
      success: true,
      data: metricas,
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao buscar métricas:', error);
    return {
      success: false,
      error: 'Erro inesperado ao carregar métricas',
    };
  }
}
