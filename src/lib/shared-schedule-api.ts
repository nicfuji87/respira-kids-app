// AI dev note: API para gerenciamento de agendas compartilhadas
// CRUD de agendas, slots, seleções e integração com agendamentos

import { supabase } from './supabase';
import { createAgendamento } from './calendar-services';
import { nanoid } from 'nanoid';
import type {
  AgendaCompartilhada,
  AgendaCompartilhadaStats,
  AgendaCompartilhadaCompleta,
  AgendaSlot,
  AgendaSlotComSelecao,
  CreateAgendaCompartilhada,
  UpdateAgendaCompartilhada,
  AddSlotsData,
  CreateAgendaSelecao,
  AgendaPublicaInfo,
  ServicoDetalhado,
  LocalDetalhado,
  EmpresaDetalhada,
  ApiResponse,
  CreateAgendaResponse,
  AgendaCompartilhadaFilters,
} from '@/types/shared-schedule';
import type { CreateAgendamento } from '@/types/supabase-calendar';

// ============================================
// CRIAR AGENDA COMPARTILHADA
// ============================================

export async function createSharedSchedule(
  data: CreateAgendaCompartilhada
): Promise<ApiResponse<CreateAgendaResponse>> {
  try {
    // 1. Criar agenda principal
    const { data: agenda, error: agendaError } = await supabase
      .from('agendas_compartilhadas')
      .insert({
        profissional_id: data.profissional_id,
        token: data.token,
        titulo: data.titulo,
        data_inicio: data.data_inicio,
        data_fim: data.data_fim,
        criado_por: data.criado_por,
      })
      .select()
      .single();

    if (agendaError) throw agendaError;

    // 2. Adicionar serviços
    if (data.servicos_ids.length > 0) {
      const servicos = data.servicos_ids.map((id) => ({
        agenda_id: agenda.id,
        tipo_servico_id: id,
      }));

      const { error: servicosError } = await supabase
        .from('agenda_servicos')
        .insert(servicos);

      if (servicosError) throw servicosError;
    }

    // 3. Adicionar locais
    if (data.locais_ids.length > 0) {
      const locais = data.locais_ids.map((id) => ({
        agenda_id: agenda.id,
        local_id: id,
      }));

      const { error: locaisError } = await supabase
        .from('agenda_locais')
        .insert(locais);

      if (locaisError) throw locaisError;
    }

    // 4. Adicionar empresas
    if (data.empresas_ids.length > 0) {
      const empresas = data.empresas_ids.map((id) => ({
        agenda_id: agenda.id,
        empresa_id: id,
      }));

      const { error: empresasError } = await supabase
        .from('agenda_empresas')
        .insert(empresas);

      if (empresasError) throw empresasError;
    }

    // 5. Adicionar slots
    if (data.slots_data_hora.length > 0) {
      const slots = data.slots_data_hora.map((data_hora) => ({
        agenda_id: agenda.id,
        data_hora,
      }));

      const { error: slotsError } = await supabase
        .from('agenda_slots')
        .insert(slots);

      if (slotsError) throw slotsError;
    }

    // 6. Gerar link completo
    const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;
    const link = `${appUrl}/#/agenda/${data.token}`;

    return {
      data: { agenda, link },
      error: null,
      success: true,
    };
  } catch (error) {
    console.error('Erro ao criar agenda compartilhada:', error);
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      success: false,
    };
  }
}

// ============================================
// ATUALIZAR AGENDA COMPARTILHADA
// ============================================

export async function updateSharedSchedule(
  agendaId: string,
  updates: UpdateAgendaCompartilhada
): Promise<ApiResponse<AgendaCompartilhada>> {
  try {
    // 1. Atualizar dados básicos
    const basicUpdates: Partial<AgendaCompartilhada> = {};
    if (updates.titulo !== undefined) basicUpdates.titulo = updates.titulo;
    if (updates.data_inicio !== undefined)
      basicUpdates.data_inicio = updates.data_inicio;
    if (updates.data_fim !== undefined)
      basicUpdates.data_fim = updates.data_fim;
    if (updates.ativo !== undefined) basicUpdates.ativo = updates.ativo;

    if (Object.keys(basicUpdates).length > 0) {
      const { error: updateError } = await supabase
        .from('agendas_compartilhadas')
        .update(basicUpdates)
        .eq('id', agendaId);

      if (updateError) throw updateError;
    }

    // 2. Atualizar serviços (se fornecido)
    if (updates.servicos_ids !== undefined) {
      // Deletar existentes
      await supabase.from('agenda_servicos').delete().eq('agenda_id', agendaId);

      // Inserir novos
      if (updates.servicos_ids.length > 0) {
        const servicos = updates.servicos_ids.map((id) => ({
          agenda_id: agendaId,
          tipo_servico_id: id,
        }));

        const { error: servicosError } = await supabase
          .from('agenda_servicos')
          .insert(servicos);

        if (servicosError) throw servicosError;
      }
    }

    // 3. Atualizar locais (se fornecido)
    if (updates.locais_ids !== undefined) {
      await supabase.from('agenda_locais').delete().eq('agenda_id', agendaId);

      if (updates.locais_ids.length > 0) {
        const locais = updates.locais_ids.map((id) => ({
          agenda_id: agendaId,
          local_id: id,
        }));

        const { error: locaisError } = await supabase
          .from('agenda_locais')
          .insert(locais);

        if (locaisError) throw locaisError;
      }
    }

    // 4. Atualizar empresas (se fornecido)
    if (updates.empresas_ids !== undefined) {
      await supabase.from('agenda_empresas').delete().eq('agenda_id', agendaId);

      if (updates.empresas_ids.length > 0) {
        const empresas = updates.empresas_ids.map((id) => ({
          agenda_id: agendaId,
          empresa_id: id,
        }));

        const { error: empresasError } = await supabase
          .from('agenda_empresas')
          .insert(empresas);

        if (empresasError) throw empresasError;
      }
    }

    // 5. Buscar agenda atualizada
    const { data: agenda, error: fetchError } = await supabase
      .from('agendas_compartilhadas')
      .select('*')
      .eq('id', agendaId)
      .single();

    if (fetchError) throw fetchError;

    return {
      data: agenda,
      error: null,
      success: true,
    };
  } catch (error) {
    console.error('Erro ao atualizar agenda compartilhada:', error);
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      success: false,
    };
  }
}

// ============================================
// DELETAR AGENDA COMPARTILHADA
// ============================================

export async function deleteSharedSchedule(
  agendaId: string
): Promise<ApiResponse<void>> {
  try {
    const { error } = await supabase
      .from('agendas_compartilhadas')
      .delete()
      .eq('id', agendaId);

    if (error) throw error;

    return {
      data: null,
      error: null,
      success: true,
    };
  } catch (error) {
    console.error('Erro ao deletar agenda compartilhada:', error);
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      success: false,
    };
  }
}

// ============================================
// BUSCAR AGENDA POR TOKEN (Público)
// ============================================

export async function fetchSharedScheduleByToken(
  token: string
): Promise<ApiResponse<AgendaCompartilhadaCompleta>> {
  try {
    // 1. Buscar agenda com stats
    const { data: agendaStats, error: agendaError } = await supabase
      .from('vw_agendas_compartilhadas_stats')
      .select('*')
      .eq('token', token)
      .eq('ativo', true)
      .single();

    if (agendaError) throw agendaError;
    if (!agendaStats) throw new Error('Agenda não encontrada');

    // 2. Buscar serviços disponibilizados
    const { data: servicosIds } = await supabase
      .from('agenda_servicos')
      .select('tipo_servico_id')
      .eq('agenda_id', agendaStats.id);

    const servicosIdsArray = servicosIds?.map((s) => s.tipo_servico_id) || [];

    const { data: servicos } = await supabase
      .from('tipo_servicos')
      .select('id, nome, descricao, duracao_minutos, valor, cor, ativo')
      .in('id', servicosIdsArray)
      .eq('ativo', true);

    // 3. Buscar locais disponibilizados
    const { data: locaisIds } = await supabase
      .from('agenda_locais')
      .select('local_id')
      .eq('agenda_id', agendaStats.id);

    const locaisIdsArray = locaisIds?.map((l) => l.local_id) || [];

    const { data: locais } = await supabase
      .from('locais_atendimento')
      .select('id, nome, tipo_local, ativo')
      .in('id', locaisIdsArray)
      .eq('ativo', true);

    // 4. Buscar empresas disponibilizadas
    const { data: empresasIds } = await supabase
      .from('agenda_empresas')
      .select('empresa_id')
      .eq('agenda_id', agendaStats.id);

    const empresasIdsArray = empresasIds?.map((e) => e.empresa_id) || [];

    const { data: empresas } = await supabase
      .from('pessoa_empresas')
      .select('id, razao_social, nome_fantasia, cnpj, ativo')
      .in('id', empresasIdsArray)
      .eq('ativo', true);

    // 5. Buscar apenas slots disponíveis
    const { data: slots } = await supabase
      .from('agenda_slots')
      .select('*')
      .eq('agenda_id', agendaStats.id)
      .eq('disponivel', true)
      .order('data_hora', { ascending: true });

    const agendaCompleta: AgendaCompartilhadaCompleta = {
      ...agendaStats,
      servicos: (servicos || []) as ServicoDetalhado[],
      locais: (locais || []) as LocalDetalhado[],
      empresas: (empresas || []) as EmpresaDetalhada[],
      slots: (slots || []) as AgendaSlot[],
    };

    return {
      data: agendaCompleta,
      error: null,
      success: true,
    };
  } catch (error) {
    console.error('Erro ao buscar agenda por token:', error);
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      success: false,
    };
  }
}

// ============================================
// LISTAR AGENDAS POR PROFISSIONAL
// ============================================

export async function listSharedSchedulesByProfessional(
  profissionalId: string,
  filters?: AgendaCompartilhadaFilters
): Promise<ApiResponse<AgendaCompartilhadaStats[]>> {
  try {
    let query = supabase
      .from('vw_agendas_compartilhadas_stats')
      .select('*')
      .eq('profissional_id', profissionalId)
      .order('created_at', { ascending: false });

    if (filters?.ativo !== undefined) {
      query = query.eq('ativo', filters.ativo);
    }

    if (filters?.data_inicio) {
      query = query.gte('data_fim', filters.data_inicio);
    }

    if (filters?.data_fim) {
      query = query.lte('data_inicio', filters.data_fim);
    }

    const { data, error } = await query;

    if (error) throw error;

    return {
      data: (data || []) as AgendaCompartilhadaStats[],
      error: null,
      success: true,
    };
  } catch (error) {
    console.error('Erro ao listar agendas:', error);
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      success: false,
    };
  }
}

// ============================================
// ADICIONAR SLOTS
// ============================================

export async function addSlotsToSchedule(
  data: AddSlotsData
): Promise<ApiResponse<AgendaSlot[]>> {
  try {
    const slots = data.slots_data_hora.map((data_hora) => ({
      agenda_id: data.agenda_id,
      data_hora,
    }));

    const { data: newSlots, error } = await supabase
      .from('agenda_slots')
      .insert(slots)
      .select();

    if (error) throw error;

    return {
      data: (newSlots || []) as AgendaSlot[],
      error: null,
      success: true,
    };
  } catch (error) {
    console.error('Erro ao adicionar slots:', error);
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      success: false,
    };
  }
}

// ============================================
// REMOVER SLOTS (apenas disponíveis)
// ============================================

export async function removeSlots(
  slotIds: string[]
): Promise<ApiResponse<void>> {
  try {
    const { error } = await supabase
      .from('agenda_slots')
      .delete()
      .in('id', slotIds)
      .eq('disponivel', true); // Só remove se disponível

    if (error) throw error;

    return {
      data: null,
      error: null,
      success: true,
    };
  } catch (error) {
    console.error('Erro ao remover slots:', error);
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      success: false,
    };
  }
}

// ============================================
// BUSCAR SLOTS COM SELEÇÕES (para edição)
// ============================================

export async function fetchSlotsWithSelections(
  agendaId: string
): Promise<ApiResponse<AgendaSlotComSelecao[]>> {
  try {
    const { data: slots, error: slotsError } = await supabase
      .from('agenda_slots')
      .select('*')
      .eq('agenda_id', agendaId)
      .order('data_hora', { ascending: true });

    if (slotsError) throw slotsError;

    // Buscar seleções para slots ocupados
    const { data: selecoes } = await supabase
      .from('agenda_selecoes')
      .select(
        `
        slot_id,
        paciente:pessoas!agenda_selecoes_paciente_id_fkey(nome),
        responsavel:pessoas!agenda_selecoes_responsavel_id_fkey(nome),
        servico:tipo_servicos(nome),
        local:locais_atendimento(nome),
        empresa:pessoa_empresas(razao_social)
      `
      )
      .eq('agenda_id', agendaId);

    const slotsComSelecao: AgendaSlotComSelecao[] = (slots || []).map(
      (slot) => {
        const selecao = selecoes?.find((s) => s.slot_id === slot.id);

        if (selecao) {
          return {
            ...slot,
            selecao: {
              paciente_nome: (selecao.paciente as unknown as { nome: string })
                ?.nome,
              responsavel_nome: (
                selecao.responsavel as unknown as { nome: string }
              )?.nome,
              servico_nome: (selecao.servico as unknown as { nome: string })
                ?.nome,
              local_nome: (selecao.local as unknown as { nome: string })
                ?.nome || null,
              empresa_nome: (
                selecao.empresa as unknown as { razao_social: string }
              )?.razao_social,
            },
          };
        }

        return slot;
      }
    );

    return {
      data: slotsComSelecao,
      error: null,
      success: true,
    };
  } catch (error) {
    console.error('Erro ao buscar slots com seleções:', error);
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      success: false,
    };
  }
}

// ============================================
// SELECIONAR SLOT E CRIAR AGENDAMENTO
// ============================================

export async function selectSlotAndCreateAppointment(
  selecaoData: CreateAgendaSelecao,
  statusAgendadoId: string,
  statusPendentePagamentoId: string
): Promise<ApiResponse<{ agendamento_id: string; selecao_id: string }>> {
  try {
    // 1. Buscar dados do slot
    const { data: slot, error: slotError } = await supabase
      .from('agenda_slots')
      .select('agenda_id, data_hora, disponivel')
      .eq('id', selecaoData.slot_id)
      .single();

    if (slotError) throw slotError;
    if (!slot?.disponivel) throw new Error('Slot não disponível');

    // 2. Buscar agenda para pegar profissional_id
    const { data: agenda, error: agendaError } = await supabase
      .from('agendas_compartilhadas')
      .select('profissional_id')
      .eq('id', slot.agenda_id)
      .single();

    if (agendaError) throw agendaError;

    // 3. Buscar valor do serviço
    const { data: servico, error: servicoError } = await supabase
      .from('tipo_servicos')
      .select('valor')
      .eq('id', selecaoData.tipo_servico_id)
      .single();

    if (servicoError) throw servicoError;

    // 4. Criar agendamento com referência à agenda compartilhada
    const agendamentoData: CreateAgendamento & { agenda_compartilhada_id?: string } = {
      data_hora: slot.data_hora,
      paciente_id: selecaoData.paciente_id,
      profissional_id: agenda.profissional_id,
      tipo_servico_id: selecaoData.tipo_servico_id,
      local_id: selecaoData.local_id,
      status_consulta_id: statusAgendadoId,
      status_pagamento_id: statusPendentePagamentoId,
      valor_servico: servico.valor,
      observacao: 'Agendamento via agenda compartilhada',
      agendado_por: selecaoData.responsavel_id,
      empresa_fatura: selecaoData.empresa_id,
      agenda_compartilhada_id: slot.agenda_id, // AI dev note: Rastrear origem
    };

    const agendamentoCriado = await createAgendamento(agendamentoData);

    // 5. Criar registro de seleção
    const { data: selecao, error: selecaoError } = await supabase
      .from('agenda_selecoes')
      .insert({
        ...selecaoData,
        agendamento_id: agendamentoCriado.id,
      })
      .select()
      .single();

    if (selecaoError) throw selecaoError;

    return {
      data: {
        agendamento_id: agendamentoCriado.id,
        selecao_id: selecao.id,
      },
      error: null,
      success: true,
    };
  } catch (error) {
    console.error('Erro ao selecionar slot:', error);
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      success: false,
    };
  }
}

// ============================================
// GERAR TOKEN ÚNICO
// ============================================

export function generateUniqueToken(): string {
  return nanoid(10);
}

// ============================================
// VALIDAR SE TOKEN ESTÁ DISPONÍVEL
// ============================================

export async function isTokenAvailable(
  token: string
): Promise<ApiResponse<boolean>> {
  try {
    const { data, error } = await supabase
      .from('agendas_compartilhadas')
      .select('id')
      .eq('token', token)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found

    return {
      data: !data, // true se não existe
      error: null,
      success: true,
    };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      success: false,
    };
  }
}

