// AI dev note: API para gerenciamento de faturas/cobranças ASAAS
// Estrutura híbrida com compatibilidade para sistema existente

import { supabase } from './supabase';
import {
  updateAsaasPayment,
  cancelAsaasPayment,
  scheduleAsaasInvoice,
  authorizeAsaasInvoice,
  determineApiKeyFromEmpresa,
} from './asaas-api';
import { generateChargeDescription } from './charge-description';
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
        descricao: faturaData.descricao,
        empresa_id: faturaData.empresa_id,
        responsavel_cobranca_id: faturaData.responsavel_cobranca_id,
        vencimento: faturaData.vencimento,
        dados_asaas: faturaData.dados_asaas || {},
        observacoes: faturaData.observacoes,
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

    // Validar se usuário tem permissão (apenas admin pode editar faturas)
    if (userId !== 'system') {
      const { data: userData, error: userError } = await supabase
        .from('pessoas')
        .select('role')
        .eq('id', userId)
        .single();

      if (userError || !userData || userData.role !== 'admin') {
        console.error(
          '❌ Usuário sem permissão para editar faturas:',
          userData?.role
        );
        return {
          success: false,
          error: 'Apenas administradores podem editar faturas',
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
      const agendamentosFinais = [
        ...(agendamentosAtuais || []).filter(
          (a) => !updates.agendamentosParaRemover.includes(a.id)
        ),
        ...novosAgendamentos,
      ];

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
      const { error: unlinkError } = await supabase
        .from('agendamentos')
        .update({
          fatura_id: null,
          id_pagamento_externo: null,
          cobranca_gerada_em: null,
          cobranca_gerada_por: null,
          atualizado_por: userId === 'system' ? null : userId,
        })
        .in('id', updates.agendamentosParaRemover);

      if (unlinkError) {
        console.warn('⚠️ Erro ao desvincular agendamentos:', unlinkError);
      } else {
        console.log(
          `✅ ${updates.agendamentosParaRemover.length} agendamentos desvinculados`
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
  userId: string
): Promise<ApiResponse<boolean>> {
  try {
    console.log('🗑️ Iniciando exclusão da fatura:', faturaId);

    // Validar se usuário tem permissão (apenas admin pode excluir faturas)
    if (userId !== 'system') {
      const { data: userData, error: userError } = await supabase
        .from('pessoas')
        .select('role')
        .eq('id', userId)
        .single();

      if (userError || !userData || userData.role !== 'admin') {
        console.error(
          '❌ Usuário sem permissão para excluir faturas:',
          userData?.role
        );
        return {
          success: false,
          error: 'Apenas administradores podem excluir faturas',
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

    // 5. Desvincular agendamentos
    console.log('🔗 Desvinculando agendamentos da fatura...');
    const { error: unlinkError } = await supabase
      .from('agendamentos')
      .update({
        fatura_id: null,
        id_pagamento_externo: null,
        cobranca_gerada_em: null,
        cobranca_gerada_por: null,
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

    console.log('✅ Agendamentos desvinculados');

    // 6. Excluir fatura (soft delete)
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

    console.log('🎉 Fatura excluída com sucesso');
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

// === EMITIR NFE PARA FATURA ===
export async function emitirNfeFatura(
  faturaId: string,
  userId: string
): Promise<ApiResponse<{ invoiceId: string; link_nfe?: string }>> {
  try {
    console.log('📄 Iniciando emissão de NFe para fatura:', faturaId);

    // Validar se usuário tem permissão (apenas admin pode emitir NFe)
    if (userId !== 'system') {
      const { data: userData, error: userError } = await supabase
        .from('pessoas')
        .select('role')
        .eq('id', userId)
        .single();

      if (userError || !userData || userData.role !== 'admin') {
        console.error(
          '❌ Usuário sem permissão para emitir NFe:',
          userData?.role
        );
        return {
          success: false,
          error: 'Apenas administradores podem emitir notas fiscais',
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

    try {
      // 5. Agendar nota fiscal
      console.log('📋 Agendando nota fiscal...');
      const scheduleResult = await scheduleAsaasInvoice(
        fatura.id_asaas,
        {
          serviceDescription: fatura.descricao || 'Serviços de fisioterapia',
          observations: 'Emissão automática - Respira Kids',
          value: fatura.valor_total,
          deductions: 0,
          effectiveDate: new Date().toISOString().split('T')[0],
          municipalServiceCode: '0701', // Código padrão fisioterapia
          municipalServiceName: 'Fisioterapia',
          externalReference: `RK-${faturaId.substring(0, 8)}`,
          updatePayment: false,
          taxes: {
            retainIss: false,
            iss: 5.0, // 5% ISS padrão
          },
        },
        apiConfig
      );

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
      .select('id, valor_total, status, vencimento')
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
