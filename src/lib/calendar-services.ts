// AI dev note: Serviços para integração do calendário com Supabase
// CRUD de agendamentos, filtros por usuário/role, busca por período

import { supabase } from './supabase';
import type {
  SupabaseAgendamentoCompleto,
  SupabaseAgendamentoCompletoFlat,
  SupabasePessoa,
  SupabaseTipoServico,
  SupabaseConsultaStatus,
  SupabasePagamentoStatus,
  SupabaseLocalAtendimento,
  CalendarFilters,
  CreateAgendamento,
  UpdateAgendamento,
  CalendarStats,
} from '@/types/supabase-calendar';
import {
  mapAgendamentoToCalendarEvent,
  mapAgendamentoFlatToCompleto,
  calculateCalendarStats,
} from './calendar-mappers';
import type { CalendarEvent } from '@/types/calendar';

// AI dev note: Busca agendamentos usando a view vw_agendamentos_completos
export const fetchAgendamentosFromView = async (
  filters: CalendarFilters
): Promise<SupabaseAgendamentoCompleto[]> => {
  let query = supabase
    .from('vw_agendamentos_completos')
    .select('*')
    .gte('data_hora', filters.startDate.toISOString())
    .lte('data_hora', filters.endDate.toISOString())
    .eq('ativo', true)
    .order('data_hora', { ascending: true });

  // Aplicar filtros específicos
  if (filters.profissionalId) {
    query = query.eq('profissional_id', filters.profissionalId);
  }

  if (filters.pacienteId) {
    query = query.eq('paciente_id', filters.pacienteId);
  }

  if (filters.tipoServicoId) {
    query = query.eq('tipo_servico_id', filters.tipoServicoId);
  }

  if (filters.statusConsultaId) {
    query = query.eq('status_consulta_id', filters.statusConsultaId);
  }

  if (filters.statusPagamentoId) {
    query = query.eq('status_pagamento_id', filters.statusPagamentoId);
  }

  if (filters.localId) {
    query = query.eq('local_atendimento_id', filters.localId);
  }

  console.log('🔍 DEBUG: Query Supabase na view sendo executada', {
    'filters.startDate': filters.startDate.toISOString(),
    'filters.endDate': filters.endDate.toISOString(),
    'filters.profissionalId': filters.profissionalId,
    view: 'vw_agendamentos_completos',
  });

  const { data, error } = await query;

  if (error) {
    console.error('Erro ao buscar agendamentos da view:', error);
    throw error;
  }

  console.log('🔍 DEBUG: Resultado da query na view', {
    'data.length': data?.length || 0,
    data: data,
  });

  // Converter estrutura flat da view para estrutura aninhada
  const agendamentos = (data as SupabaseAgendamentoCompletoFlat[]).map(
    mapAgendamentoFlatToCompleto
  );

  return agendamentos;
};

// AI dev note: Busca agendamentos com joins completos para o período especificado - FUNÇÃO ORIGINAL (BACKUP)
export const fetchAgendamentos = async (
  filters: CalendarFilters
): Promise<SupabaseAgendamentoCompleto[]> => {
  let query = supabase
    .from('agendamentos')
    .select(
      `
      *,
      paciente:pessoas!agendamentos_paciente_id_fkey (
        id, nome, email, telefone, role, foto_perfil,
        is_approved, profile_complete, ativo
      ),
      profissional:pessoas!agendamentos_profissional_id_fkey (
        id, nome, email, telefone, role, foto_perfil,
        especialidade, registro_profissional, bio_profissional,
        is_approved, profile_complete, ativo
      ),
      tipo_servico:tipo_servicos (
        id, nome, descricao, duracao_minutos, valor, cor, ativo
      ),
      local_atendimento:locais_atendimento (
        id, nome, tipo_local, ativo
      ),
      status_consulta:consulta_status (
        id, codigo, descricao, cor
      ),
      status_pagamento:pagamento_status (
        id, codigo, descricao, cor
      ),
      agendado_por_pessoa:pessoas!agendamentos_agendado_por_fkey (
        id, nome, email
      )
    `
    )
    .gte('data_hora', filters.startDate.toISOString())
    .lte('data_hora', filters.endDate.toISOString())
    .eq('ativo', true)
    .order('data_hora', { ascending: true });

  // Aplicar filtros específicos
  if (filters.profissionalId) {
    query = query.eq('profissional_id', filters.profissionalId);
  }

  if (filters.pacienteId) {
    query = query.eq('paciente_id', filters.pacienteId);
  }

  if (filters.tipoServicoId) {
    query = query.eq('tipo_servico_id', filters.tipoServicoId);
  }

  if (filters.statusConsultaId) {
    query = query.eq('status_consulta_id', filters.statusConsultaId);
  }

  if (filters.statusPagamentoId) {
    query = query.eq('status_pagamento_id', filters.statusPagamentoId);
  }

  if (filters.localId) {
    query = query.eq('local_id', filters.localId);
  }

  console.log('🔍 DEBUG: Query Supabase sendo executada', {
    'filters.startDate': filters.startDate.toISOString(),
    'filters.endDate': filters.endDate.toISOString(),
    'filters.profissionalId': filters.profissionalId,
    querySQL: 'agendamentos com filtros aplicados',
  });

  const { data, error } = await query;

  if (error) {
    console.error('Erro ao buscar agendamentos:', error);
    throw error;
  }

  console.log('🔍 DEBUG: Resultado da query Supabase', {
    'data.length': data?.length || 0,
    data: data,
  });

  return data as SupabaseAgendamentoCompleto[];
};

// AI dev note: Helper para buscar eventos e converter para CalendarEvent
export const fetchCalendarEvents = async (
  filters: CalendarFilters
): Promise<CalendarEvent[]> => {
  const agendamentos = await fetchAgendamentosFromView(filters);
  return agendamentos.map(mapAgendamentoToCalendarEvent);
};

// AI dev note: Busca agendamentos baseado nas permissões do usuário
export const fetchUserAgendamentos = async (
  filters: CalendarFilters,
  userId: string,
  userRole: 'admin' | 'profissional' | 'secretaria'
): Promise<SupabaseAgendamentoCompleto[]> => {
  console.log('🔍 DEBUG: fetchUserAgendamentos chamado', {
    filters,
    userId,
    userRole,
  });

  // AI dev note: Null-safety check para userRole
  if (!userRole || typeof userRole !== 'string') {
    throw new Error(`Role inválido ou não definido: ${userRole}`);
  }

  switch (userRole) {
    case 'admin':
      // Admin pode ver todos os agendamentos
      return fetchAgendamentosFromView(filters);

    case 'profissional': {
      // Profissional vê apenas seus próprios agendamentos
      const profissionalFilters = {
        ...filters,
        profissionalId: userId,
      };
      console.log('🔍 DEBUG: Filtros para profissional', profissionalFilters);
      return fetchAgendamentosFromView(profissionalFilters);
    }

    case 'secretaria': {
      // Secretária vê agendamentos dos profissionais autorizados
      const profissionaisAutorizados =
        await fetchProfissionaisAutorizados(userId);
      const agendamentosPorProfissional = await Promise.all(
        profissionaisAutorizados.map((profId) =>
          fetchAgendamentosFromView({ ...filters, profissionalId: profId })
        )
      );

      // Combinar e ordenar por data
      const todosAgendamentos = agendamentosPorProfissional
        .flat()
        .sort(
          (a, b) =>
            new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime()
        );

      return todosAgendamentos;
    }

    default:
      throw new Error(`Role não suportado: ${userRole}`);
  }
};

// AI dev note: Busca profissionais que a secretária pode gerenciar
export const fetchProfissionaisAutorizados = async (
  secretariaId: string
): Promise<string[]> => {
  const { data, error } = await supabase
    .from('permissoes_agendamento')
    .select('id_profissional')
    .eq('id_secretaria', secretariaId)
    .eq('ativo', true);

  if (error) {
    console.error('Erro ao buscar profissionais autorizados:', error);
    throw error;
  }

  return data?.map((p) => p.id_profissional) || [];
};

// AI dev note: Cria novo agendamento
export const createAgendamento = async (
  agendamento: CreateAgendamento
): Promise<SupabaseAgendamentoCompleto> => {
  const { data, error } = await supabase
    .from('agendamentos')
    .insert([agendamento])
    .select(
      `
      *,
      paciente:pessoas!agendamentos_paciente_id_fkey (*),
      profissional:pessoas!agendamentos_profissional_id_fkey (*),
      tipo_servico:tipo_servicos (*),
      local_atendimento:locais_atendimento (*),
      status_consulta:consulta_status (*),
      status_pagamento:pagamento_status (*),
      agendado_por_pessoa:pessoas!agendamentos_agendado_por_fkey (*)
    `
    )
    .single();

  if (error) {
    console.error('Erro ao criar agendamento:', error);
    throw error;
  }

  return data;
};

// AI dev note: Atualiza agendamento existente
export const updateAgendamento = async (
  id: string,
  updates: UpdateAgendamento
): Promise<SupabaseAgendamentoCompleto> => {
  const { data, error } = await supabase
    .from('agendamentos')
    .update(updates)
    .eq('id', id)
    .select(
      `
      *,
      paciente:pessoas!agendamentos_paciente_id_fkey (*),
      profissional:pessoas!agendamentos_profissional_id_fkey (*),
      tipo_servico:tipo_servicos (*),
      local_atendimento:locais_atendimento (*),
      status_consulta:consulta_status (*),
      status_pagamento:pagamento_status (*),
      agendado_por_pessoa:pessoas!agendamentos_agendado_por_fkey (*)
    `
    )
    .single();

  if (error) {
    console.error('Erro ao atualizar agendamento:', error);
    throw error;
  }

  return data;
};

// AI dev note: Deleta agendamento (soft delete)
export const deleteAgendamento = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('agendamentos')
    .update({ ativo: false })
    .eq('id', id);

  if (error) {
    console.error('Erro ao deletar agendamento:', error);
    throw error;
  }
};

// AI dev note: Busca dados auxiliares para formulários
export const fetchTiposServico = async (): Promise<SupabaseTipoServico[]> => {
  const { data, error } = await supabase
    .from('tipo_servicos')
    .select('*')
    .eq('ativo', true)
    .order('nome');

  if (error) {
    console.error('Erro ao buscar tipos de serviço:', error);
    throw error;
  }

  return data || [];
};

export const fetchConsultaStatus = async (): Promise<
  SupabaseConsultaStatus[]
> => {
  const { data, error } = await supabase
    .from('consulta_status')
    .select('*')
    .order('descricao');

  if (error) {
    console.error('Erro ao buscar status de consulta:', error);
    throw error;
  }

  return data || [];
};

export const fetchPagamentoStatus = async (): Promise<
  SupabasePagamentoStatus[]
> => {
  const { data, error } = await supabase
    .from('pagamento_status')
    .select('*')
    .order('descricao');

  if (error) {
    console.error('Erro ao buscar status de pagamento:', error);
    throw error;
  }

  return data || [];
};

export const fetchLocaisAtendimento = async (): Promise<
  SupabaseLocalAtendimento[]
> => {
  const { data, error } = await supabase
    .from('locais_atendimento')
    .select('*')
    .eq('ativo', true)
    .order('nome');

  if (error) {
    console.error('Erro ao buscar locais de atendimento:', error);
    throw error;
  }

  return data || [];
};

// AI dev note: Busca profissionais ativos para seleção
export const fetchProfissionais = async (): Promise<SupabasePessoa[]> => {
  const { data, error } = await supabase
    .from('pessoas')
    .select('*')
    .eq('role', 'profissional')
    .eq('ativo', true)
    .eq('is_approved', true)
    .order('nome');

  if (error) {
    console.error('Erro ao buscar profissionais:', error);
    throw error;
  }

  return data || [];
};

// AI dev note: Busca pacientes ativos para seleção
export const fetchPacientes = async (): Promise<SupabasePessoa[]> => {
  const { data, error } = await supabase
    .from('pessoas')
    .select('*')
    .in('role', ['paciente', null]) // Pacientes podem não ter role definido
    .eq('ativo', true)
    .order('nome');

  if (error) {
    console.error('Erro ao buscar pacientes:', error);
    throw error;
  }

  return data || [];
};

// AI dev note: Calcula estatísticas do calendário
export const fetchCalendarStats = async (
  filters: CalendarFilters,
  userId: string,
  userRole: 'admin' | 'profissional' | 'secretaria'
): Promise<CalendarStats> => {
  const agendamentos = await fetchUserAgendamentos(filters, userId, userRole);
  return calculateCalendarStats(agendamentos);
};

// AI dev note: Busca próximos agendamentos para dashboard
export const fetchProximosAgendamentos = async (
  userId: string,
  userRole: 'admin' | 'profissional' | 'secretaria',
  limit: number = 5
): Promise<SupabaseAgendamentoCompleto[]> => {
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const filters: CalendarFilters = {
    startDate: now,
    endDate: endOfDay,
  };

  const agendamentos = await fetchUserAgendamentos(filters, userId, userRole);
  return agendamentos.slice(0, limit);
};
