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
  SupabaseRelatorioEvolucaoCompleto,
  SupabaseRelatorioEvolucao,
  SaveEvolucaoData,
  UpdateEvolucaoData,
} from '@/types/supabase-calendar';
import {
  mapAgendamentoToCalendarEvent,
  mapAgendamentoFlatToCompleto,
  mapAgendamentoFlatToCalendarEvent,
  calculateCalendarStats,
} from './calendar-mappers';
import type { CalendarEvent } from '@/types/calendar';

// AI dev note: Busca agendamentos usando a view vw_agendamentos_completos e retorna CalendarEvent diretamente
export const fetchAgendamentosFromViewAsEvents = async (
  filters: CalendarFilters
): Promise<CalendarEvent[]> => {
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

  const { data, error } = await query;

  if (error) {
    console.error('Erro ao buscar agendamentos da view:', error);
    throw error;
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('🔍 DEBUG: Resultado da query na view para CalendarEvents', {
      'data.length': data?.length || 0,
      dateRange: {
        start: filters.startDate.toISOString(),
        end: filters.endDate.toISOString(),
      },
      hasData: (data?.length || 0) > 0,
      firstEvent:
        data && data.length > 0
          ? {
              id: data[0].id,
              data_hora: data[0].data_hora,
              profissional_nome: data[0].profissional_nome,
              paciente_nome: data[0].paciente_nome,
            }
          : null,
      data: data,
    });
  }

  // Converter estrutura flat da view diretamente para CalendarEvent
  const calendarEvents = (data as SupabaseAgendamentoCompletoFlat[]).map(
    mapAgendamentoFlatToCalendarEvent
  );

  return calendarEvents;
};

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

  if (process.env.NODE_ENV === 'development') {
    console.log('🔍 DEBUG: Query Supabase na view sendo executada', {
      'filters.startDate': filters.startDate.toISOString(),
      'filters.endDate': filters.endDate.toISOString(),
      'filters.profissionalId': filters.profissionalId,
      view: 'vw_agendamentos_completos',
    });
  }

  const { data, error } = await query;

  if (error) {
    console.error('Erro ao buscar agendamentos da view:', error);
    throw error;
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('🔍 DEBUG: Resultado da query na view', {
      'data.length': data?.length || 0,
      data: data,
    });
  }

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
      ),
      criado_por_pessoa:pessoas!agendamentos_criado_por_fkey (
        id, nome
      ),
      atualizado_por_pessoa:pessoas!agendamentos_atualizado_por_fkey (
        id, nome
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

// AI dev note: Busca eventos do calendário baseado nas permissões do usuário - retorna CalendarEvent diretamente
export const fetchUserCalendarEvents = async (
  filters: CalendarFilters,
  userId: string,
  userRole: 'admin' | 'profissional' | 'secretaria'
): Promise<CalendarEvent[]> => {
  if (process.env.NODE_ENV === 'development') {
    console.log('🔍 DEBUG: fetchUserCalendarEvents chamado', {
      filters,
      userId,
      userRole,
      dateRange: {
        start: filters.startDate.toISOString(),
        end: filters.endDate.toISOString(),
        rangeInDays: Math.ceil(
          (filters.endDate.getTime() - filters.startDate.getTime()) /
            (1000 * 60 * 60 * 24)
        ),
      },
    });
  }

  // AI dev note: Null-safety check para userRole
  if (!userRole || typeof userRole !== 'string') {
    throw new Error(`Role inválido ou não definido: ${userRole}`);
  }

  switch (userRole) {
    case 'admin': {
      // Admin pode ver todos os agendamentos
      if (process.env.NODE_ENV === 'development') {
        console.log(
          '🔍 DEBUG: Buscando eventos para ADMIN (sem filtro de profissional)',
          {
            'filters.startDate': filters.startDate.toISOString(),
            'filters.endDate': filters.endDate.toISOString(),
            'filters sem profissionalId': !filters.profissionalId,
            userId: userId,
          }
        );

        // AI dev note: BYPASS TEMPORÁRIO - teste direto na view sem filtros para debug
        console.log(
          '🧪 DEBUG: BYPASS TEMPORÁRIO - testando query direta na view'
        );
        try {
          const { data: rawData, error: rawError } = await supabase
            .from('vw_agendamentos_completos')
            .select(
              'id, data_hora, paciente_nome, profissional_nome, servico_nome'
            )
            .gte('data_hora', filters.startDate.toISOString())
            .lte('data_hora', filters.endDate.toISOString())
            .eq('ativo', true)
            .limit(10); // Aumentar limite de debug

          console.log('🧪 DEBUG: BYPASS RESULT', {
            'rawData?.length': rawData?.length || 0,
            rawError: rawError,
            'primeiros 3 raw': rawData?.slice(0, 3) || [],
            'auth user': await supabase.auth.getUser(),
          });
        } catch (bypassError) {
          console.log('🧪 DEBUG: BYPASS ERROR', bypassError);
        }
      }

      const adminEvents = await fetchAgendamentosFromViewAsEvents(filters);
      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 DEBUG: Eventos retornados para ADMIN', {
          eventsCount: adminEvents.length,
          'primeiros 3 eventos': adminEvents.slice(0, 3).map((e) => ({
            id: e.id,
            title: e.title,
            start: e.start.toISOString(),
          })),
        });
      }
      return adminEvents;
    }

    case 'profissional': {
      // Profissional vê apenas seus próprios agendamentos
      const profissionalFilters = {
        ...filters,
        profissionalId: userId,
      };
      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 DEBUG: Buscando eventos para PROFISSIONAL', {
          profissionalFilters,
          filteredByProfissional: userId,
        });
      }
      const profissionalEvents =
        await fetchAgendamentosFromViewAsEvents(profissionalFilters);
      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 DEBUG: Eventos retornados para PROFISSIONAL', {
          eventsCount: profissionalEvents.length,
          'filtrado por userId': userId,
          'primeiros 3 eventos': profissionalEvents.slice(0, 3).map((e) => ({
            id: e.id,
            title: e.title,
            start: e.start.toISOString(),
          })),
        });
      }
      return profissionalEvents;
    }

    case 'secretaria': {
      // Secretária vê eventos dos profissionais autorizados
      const profissionaisAutorizados =
        await fetchProfissionaisAutorizados(userId);

      if (profissionaisAutorizados.length === 0) {
        return [];
      }

      // Usar query única com filtro IN para melhor performance
      let query = supabase
        .from('vw_agendamentos_completos')
        .select('*')
        .in('profissional_id', profissionaisAutorizados)
        .gte('data_hora', filters.startDate.toISOString())
        .lte('data_hora', filters.endDate.toISOString())
        .eq('ativo', true)
        .order('data_hora', { ascending: true });

      // Aplicar outros filtros se fornecidos
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

      const { data, error } = await query;

      if (error) {
        console.error('Erro ao buscar eventos da secretaria:', error);
        throw error;
      }

      // Converter para CalendarEvent
      const calendarEvents = (data || []).map(
        mapAgendamentoFlatToCalendarEvent
      );
      return calendarEvents;
    }

    default:
      throw new Error(`Role não suportado: ${userRole}`);
  }
};

// AI dev note: Busca agendamentos baseado nas permissões do usuário
export const fetchUserAgendamentos = async (
  filters: CalendarFilters,
  userId: string,
  userRole: 'admin' | 'profissional' | 'secretaria'
): Promise<SupabaseAgendamentoCompleto[]> => {
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
      return fetchAgendamentosFromView(profissionalFilters);
    }

    case 'secretaria': {
      // Secretária vê agendamentos dos profissionais autorizados
      const profissionaisAutorizados =
        await fetchProfissionaisAutorizados(userId);

      if (profissionaisAutorizados.length === 0) {
        return [];
      }

      // Usar query única com filtro IN para melhor performance
      let query = supabase
        .from('vw_agendamentos_completos')
        .select('*')
        .in('profissional_id', profissionaisAutorizados)
        .gte('data_hora', filters.startDate.toISOString())
        .lte('data_hora', filters.endDate.toISOString())
        .eq('ativo', true)
        .order('data_hora', { ascending: true });

      // Aplicar outros filtros se fornecidos
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

      const { data, error } = await query;

      if (error) {
        console.error('Erro ao buscar agendamentos da secretaria:', error);
        throw error;
      }

      // Converter estrutura flat da view para estrutura aninhada
      const agendamentos = (data || []).map(mapAgendamentoFlatToCompleto);
      return agendamentos;
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

// AI dev note: Cria novo agendamento usando view para evitar problemas de join
export const createAgendamento = async (
  agendamento: CreateAgendamento
): Promise<SupabaseAgendamentoCompleto> => {
  // 1. Inserir o agendamento básico
  const { data: newAgendamento, error: insertError } = await supabase
    .from('agendamentos')
    .insert([agendamento])
    .select('id')
    .single();

  if (insertError) {
    console.error('Erro ao criar agendamento:', insertError);
    throw insertError;
  }

  // 2. Buscar o agendamento completo usando a view
  const { data: agendamentoCompleto, error: fetchError } = await supabase
    .from('vw_agendamentos_completos')
    .select('*')
    .eq('id', newAgendamento.id)
    .single();

  if (fetchError) {
    console.error('Erro ao buscar agendamento criado:', fetchError);
    throw fetchError;
  }

  // 3. Mapear da estrutura flat da view para a estrutura aninhada
  return mapAgendamentoFlatToCompleto(agendamentoCompleto);
};

// AI dev note: Atualiza agendamento existente
export const updateAgendamento = async (
  id: string,
  updates: UpdateAgendamento
): Promise<SupabaseAgendamentoCompleto> => {
  // AI dev note: Remover campos undefined E strings vazias para evitar erro UUID
  const cleanUpdates = Object.fromEntries(
    Object.entries(updates).filter(
      ([, value]) => value !== undefined && value !== ''
    )
  ) as UpdateAgendamento;

  const { data, error } = await supabase
    .from('agendamentos')
    .update(cleanUpdates)
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
// Inclui tanto role='profissional' quanto pessoas com pode_atender=true (ex: admins habilitados)
export const fetchProfissionais = async (): Promise<SupabasePessoa[]> => {
  const { data, error } = await supabase
    .from('pessoas')
    .select('*')
    .or('role.eq.profissional,pode_atender.eq.true')
    .eq('ativo', true)
    .eq('is_approved', true)
    .order('nome');

  if (error) {
    console.error('Erro ao buscar profissionais:', error);
    throw error;
  }

  return data || [];
};

// AI dev note: Busca profissionais baseado em permissões do usuário
// Admin: vê todos os profissionais | Secretaria: vê apenas autorizados | Profissional: vê apenas a si mesmo
export const fetchProfissionaisForUser = async (
  userId: string,
  userRole: 'admin' | 'profissional' | 'secretaria'
): Promise<SupabasePessoa[]> => {
  switch (userRole) {
    case 'admin': {
      // Admin vê todos os profissionais aprovados e com perfil completo
      // Inclui tanto role='profissional' quanto pessoas com pode_atender=true
      const { data, error } = await supabase
        .from('pessoas')
        .select('*')
        .or('role.eq.profissional,pode_atender.eq.true')
        .eq('ativo', true)
        .eq('is_approved', true)
        .eq('profile_complete', true)
        .order('nome');

      if (error) {
        console.error(
          '❌ [fetchProfissionaisForUser] Erro ao buscar profissionais para admin:',
          error
        );
        throw error;
      }

      const result = data || [];
      return result;
    }

    case 'secretaria': {
      // Secretaria vê apenas profissionais autorizados via permissoes_agendamento
      // Primeiro, buscar IDs dos profissionais autorizados
      const { data: permissoes, error: permissoesError } = await supabase
        .from('permissoes_agendamento')
        .select('id_profissional')
        .eq('id_secretaria', userId)
        .eq('ativo', true);

      if (permissoesError) {
        console.error(
          '❌ [fetchProfissionaisForUser] Erro ao buscar permissões da secretaria:',
          permissoesError
        );
        throw permissoesError;
      }

      const profissionaisAutorizados =
        permissoes?.map((p) => p.id_profissional) || [];

      // Se não há permissões, retorna array vazio
      if (profissionaisAutorizados.length === 0) {
        return [];
      }

      // Buscar dados completos dos profissionais autorizados com perfil completo
      // Inclui tanto role='profissional' quanto pessoas com pode_atender=true
      const { data, error } = await supabase
        .from('pessoas')
        .select('*')
        .or('role.eq.profissional,pode_atender.eq.true')
        .eq('ativo', true)
        .eq('is_approved', true)
        .eq('profile_complete', true)
        .in('id', profissionaisAutorizados)
        .order('nome');

      if (error) {
        console.error(
          '❌ [fetchProfissionaisForUser] Erro ao buscar profissionais para secretaria:',
          error
        );
        throw error;
      }

      const result = data || [];
      return result;
    }

    case 'profissional': {
      // Profissional vê apenas a si mesmo
      // Inclui tanto role='profissional' quanto pessoas com pode_atender=true
      const { data, error } = await supabase
        .from('pessoas')
        .select('*')
        .eq('id', userId)
        .or('role.eq.profissional,pode_atender.eq.true')
        .eq('ativo', true)
        .eq('is_approved', true)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Não encontrado - retorna array vazio
          return [];
        }
        console.error(
          '❌ [fetchProfissionaisForUser] Erro ao buscar profissional:',
          error
        );
        throw error;
      }

      const result = data ? [data] : [];
      return result;
    }

    default:
      console.error('❌ [fetchProfissionaisForUser] Role inválido:', userRole);
      throw new Error(`Role inválido: ${userRole}`);
  }
};

// AI dev note: BUSCA SERVER-SIDE - Busca pacientes via RPC com suporte a busca sem acentos
// BUSCA FLEXÍVEL:
// - Ignora acentos (ex: "Nicolas" encontra "Nícolas")
// - Palavras podem estar em qualquer ordem (ex: "Fujimoto Henrique" encontra "Henrique Fujimoto")
// - Busca pelo nome do paciente OU dados dos responsáveis (nome, telefone, CPF)
export const searchPacientes = async (
  searchTerm: string
): Promise<SupabasePessoa[]> => {
  // Se termo vazio ou muito curto, retorna vazio
  if (!searchTerm || searchTerm.trim().length < 2) {
    return [];
  }

  // Usar função RPC que faz busca com unaccent (ignora acentos)
  const { data, error } = await supabase.rpc('fn_search_pacientes', {
    termo_busca: searchTerm.trim(),
    limite: 50,
  });

  if (error) {
    console.error('❌ searchPacientes - erro na busca:', error);
    throw error;
  }

  return (data || []) as SupabasePessoa[];
};

// AI dev note: Busca um paciente específico pelo ID (para exibir nome do selecionado)
export const fetchPacienteById = async (
  id: string
): Promise<SupabasePessoa | null> => {
  if (!id) return null;

  const { data, error } = await supabase
    .from('pacientes_com_responsaveis_view')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('❌ [DEBUG] fetchPacienteById - erro:', error);
    return null;
  }

  return data as SupabasePessoa;
};

// AI dev note: Função legada mantida para compatibilidade
// DEPRECATED: Use searchPacientes para busca server-side
export const fetchPacientes = async (): Promise<SupabasePessoa[]> => {
  console.warn(
    '⚠️ fetchPacientes está deprecated. Use searchPacientes para busca server-side.'
  );

  const { data, error } = await supabase
    .from('pacientes_com_responsaveis_view')
    .select('*')
    .eq('tipo_pessoa_codigo', 'paciente')
    .eq('ativo', true)
    .order('nome')
    .limit(100); // Limite reduzido - não deve ser usado para busca completa

  if (error) {
    console.error('❌ [DEBUG] fetchPacientes - erro:', error);
    throw error;
  }

  return (data || []) as SupabasePessoa[];
};

// AI dev note: BACKUP - Função original comentada para rollback seguro
/*
export const fetchPacientesOriginal = async (): Promise<SupabasePessoa[]> => {
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
*/

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

// AI dev note: Busca um agendamento específico da view por ID
export const fetchAgendamentoById = async (
  agendamentoId: string
): Promise<SupabaseAgendamentoCompletoFlat | null> => {
  const { data, error } = await supabase
    .from('vw_agendamentos_completos')
    .select('*')
    .eq('id', agendamentoId)
    .eq('ativo', true)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows returned
      return null;
    }
    console.error('Erro ao buscar agendamento por ID:', error);
    throw error;
  }

  return data as SupabaseAgendamentoCompletoFlat;
};

// AI dev note: Atualiza um agendamento específico (para AppointmentDetailsManager)
// profissional_id só pode ser alterado por admin e é registrado no audit log
export const updateAgendamentoDetails = async (appointmentData: {
  id: string;
  data_hora?: string;
  local_id?: string;
  valor_servico?: number;
  status_consulta_id?: string;
  status_pagamento_id?: string;
  tipo_servico_id?: string;
  observacao?: string;
  empresa_fatura?: string;
  profissional_id?: string;
}): Promise<SupabaseAgendamentoCompletoFlat> => {
  const { id, profissional_id, ...updateFields } = appointmentData;

  // AI dev note: Remover campos undefined E strings vazias para evitar erro UUID
  const cleanUpdateFields = Object.fromEntries(
    Object.entries(updateFields).filter(
      ([, value]) => value !== undefined && value !== ''
    )
  ) as Record<string, unknown>;

  // AI dev note: Adicionar atualizado_por (pegar do usuário atual)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let pessoaId: string | null = null;
  let pessoaRole: string | null = null;

  if (user) {
    const { data: pessoa } = await supabase
      .from('pessoas')
      .select('id, role')
      .eq('auth_user_id', user.id)
      .single();

    if (pessoa) {
      cleanUpdateFields.atualizado_por = pessoa.id;
      pessoaId = pessoa.id;
      pessoaRole = pessoa.role;
    }
  }

  // AI dev note: Tratar mudança de profissional separadamente
  // Apenas admin pode alterar profissional_id e a mudança é registrada no audit log
  if (profissional_id) {
    if (pessoaRole !== 'admin') {
      throw new Error(
        'Apenas administradores podem alterar o profissional responsável'
      );
    }

    // Buscar o profissional_id atual para comparar
    const { data: currentAppointment, error: fetchError } = await supabase
      .from('agendamentos')
      .select('profissional_id')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('Erro ao buscar agendamento atual:', fetchError);
      throw fetchError;
    }

    const profissionalAnterior = currentAppointment?.profissional_id;

    // Só registrar auditoria e atualizar se houve mudança real
    if (profissionalAnterior !== profissional_id) {
      // Buscar nomes dos profissionais para o log de auditoria
      const { data: profissionais } = await supabase
        .from('pessoas')
        .select('id, nome')
        .in('id', [profissionalAnterior, profissional_id].filter(Boolean));

      const nomeProfissionalAnterior =
        profissionais?.find((p) => p.id === profissionalAnterior)?.nome ||
        'N/A';
      const nomeProfissionalNovo =
        profissionais?.find((p) => p.id === profissional_id)?.nome || 'N/A';

      // Registrar no audit log
      const { error: auditError } = await supabase
        .from('agendamento_audit_log')
        .insert({
          agendamento_id: id,
          campo_alterado: 'profissional_id',
          valor_anterior: `${profissionalAnterior} (${nomeProfissionalAnterior})`,
          valor_novo: `${profissional_id} (${nomeProfissionalNovo})`,
          alterado_por: pessoaId,
        });

      if (auditError) {
        console.error('Erro ao registrar auditoria:', auditError);
        // Não falhar a operação por erro de auditoria, apenas logar
      }

      // Adicionar profissional_id aos campos de atualização
      cleanUpdateFields.profissional_id = profissional_id;
    }
  }

  const { error } = await supabase
    .from('agendamentos')
    .update(cleanUpdateFields)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Erro ao atualizar agendamento:', error);
    throw error;
  }

  // Buscar dados completos da view
  const updatedAppointment = await fetchAgendamentoById(id);
  if (!updatedAppointment) {
    throw new Error('Agendamento atualizado não encontrado');
  }

  return updatedAppointment;
};

// AI dev note: Atualiza status de pagamento de um agendamento
export const updatePaymentStatus = async (
  agendamentoId: string,
  statusPagamentoId: string
): Promise<SupabaseAgendamentoCompletoFlat> => {
  // AI dev note: Adicionar atualizado_por
  const updateData: { status_pagamento_id: string; atualizado_por?: string } = {
    status_pagamento_id: statusPagamentoId,
  };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: pessoa } = await supabase
      .from('pessoas')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    if (pessoa) {
      updateData.atualizado_por = pessoa.id;
    }
  }

  const { error } = await supabase
    .from('agendamentos')
    .update(updateData)
    .eq('id', agendamentoId);

  if (error) {
    console.error('Erro ao atualizar status de pagamento:', error);
    throw error;
  }

  // Buscar dados completos da view
  const updatedAppointment = await fetchAgendamentoById(agendamentoId);
  if (!updatedAppointment) {
    throw new Error('Agendamento atualizado não encontrado');
  }

  return updatedAppointment;
};

// AI dev note: Atualiza link da NFe de um agendamento
export const updateNfeLink = async (
  agendamentoId: string,
  linkNfe: string
): Promise<SupabaseAgendamentoCompletoFlat> => {
  const { error } = await supabase
    .from('agendamentos')
    .update({ link_nfe: linkNfe })
    .eq('id', agendamentoId);

  if (error) {
    console.error('Erro ao atualizar link da NFe:', error);
    throw error;
  }

  // Buscar dados completos da view
  const updatedAppointment = await fetchAgendamentoById(agendamentoId);
  if (!updatedAppointment) {
    throw new Error('Agendamento atualizado não encontrado');
  }

  return updatedAppointment;
};

// AI dev note: Stubs para ações de pagamento (implementação futura)
export const processManualPayment = async (): Promise<void> => {
  // TODO: Implementar integração com sistema de pagamento
  // Por enquanto, apenas log
  throw new Error('Funcionalidade de pagamento manual ainda não implementada');
};

export const issueNfe = async (): Promise<string> => {
  // TODO: Implementar integração com sistema de NFe
  // Por enquanto, apenas log
  throw new Error('Funcionalidade de emissão de NFe ainda não implementada');
};

export const viewNfe = async (linkNfe: string): Promise<void> => {
  // Abrir NFe em nova aba
  window.open(linkNfe, '_blank');
};

// AI dev note: Funções para gerenciar relatórios de evolução
export const fetchTipoEvolucaoId = async (): Promise<string> => {
  const { data, error } = await supabase
    .from('relatorios_tipo')
    .select('id')
    .eq('codigo', 'evolucao')
    .single();

  if (error || !data) {
    console.error('Erro ao buscar tipo de relatório evolucao:', error);
    throw new Error('Tipo de relatório "evolução" não encontrado');
  }

  return data.id;
};

export const fetchRelatoriosEvolucao = async (
  agendamentoId: string
): Promise<SupabaseRelatorioEvolucaoCompleto[]> => {
  const { data, error } = await supabase
    .from('relatorio_evolucao')
    .select(
      `
      *,
      criado_por_pessoa:pessoas!relatorio_evolucao_criado_por_fkey(nome),
      atualizado_por_pessoa:pessoas!relatorio_evolucao_atualizado_por_fkey(nome),
      tipo_relatorio:relatorios_tipo(*)
    `
    )
    .eq('id_agendamento', agendamentoId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Erro ao buscar relatórios de evolução:', error);
    throw error;
  }

  // Mapear para interface esperada
  return (data || []).map((item) => ({
    ...item,
    criado_por_nome: item.criado_por_pessoa?.nome || null,
    atualizado_por_nome: item.atualizado_por_pessoa?.nome || null,
  }));
};

export const saveRelatorioEvolucao = async (
  evolucaoData: SaveEvolucaoData
): Promise<SupabaseRelatorioEvolucao> => {
  try {
    // Buscar ID do tipo "evolucao"
    const tipoEvolucaoId = await fetchTipoEvolucaoId();

    console.log('[DEBUG] saveRelatorioEvolucao - dados:', evolucaoData);
    console.log(
      '[DEBUG] saveRelatorioEvolucao - tipoEvolucaoId:',
      tipoEvolucaoId
    );

    // Inserir nova evolução com dados estruturados JSONB e colunas de analytics
    const insertData: Record<string, unknown> = {
      id_agendamento: evolucaoData.id_agendamento,
      tipo_relatorio_id: tipoEvolucaoId,
      conteudo: evolucaoData.conteudo,
      criado_por: evolucaoData.criado_por,
      // AI dev note: Campos JSONB para evolução estruturada
      tipo_evolucao: evolucaoData.tipo_evolucao || null,
      evolucao_respiratoria: evolucaoData.evolucao_respiratoria || null,
      evolucao_motora_assimetria:
        evolucaoData.evolucao_motora_assimetria || null,
    };

    // AI dev note: Adiciona colunas de analytics para dashboard se fornecidas
    if (evolucaoData.analytics) {
      const a = evolucaoData.analytics;
      Object.assign(insertData, {
        tosse_tipo: a.tosse_tipo,
        chiado: a.chiado,
        cansaco_respiratorio: a.cansaco_respiratorio,
        temperatura_aferida: a.temperatura_aferida,
        nivel_alerta: a.nivel_alerta,
        tolerancia_manuseio: a.tolerancia_manuseio,
        choro_atendimento: a.choro_atendimento,
        spo2_antes: a.spo2_antes,
        spo2_com_suporte: a.spo2_com_suporte,
        ritmo_respiratorio: a.ritmo_respiratorio,
        dispneia_presente: a.dispneia_presente,
        classificacao_clinica: a.classificacao_clinica,
        murmurio_vesicular: a.murmurio_vesicular,
        sibilos: a.sibilos,
        roncos: a.roncos,
        estertores: a.estertores,
        tecnica_afe: a.tecnica_afe,
        tecnica_vibrocompressao: a.tecnica_vibrocompressao,
        tecnica_rta: a.tecnica_rta,
        tecnica_epap: a.tecnica_epap,
        tecnica_aspiracao: a.tecnica_aspiracao,
        aspiracao_tipo: a.aspiracao_tipo,
        peep_valor: a.peep_valor,
        spo2_depois: a.spo2_depois,
        melhora_padrao_respiratorio: a.melhora_padrao_respiratorio,
        eliminacao_secrecao: a.eliminacao_secrecao,
        reducao_desconforto: a.reducao_desconforto,
        ausculta_melhorou: a.ausculta_melhorou,
        manter_fisioterapia: a.manter_fisioterapia,
        frequencia_sugerida: a.frequencia_sugerida,
        alta_completa: a.alta_completa,
        alta_parcial: a.alta_parcial,
        encaminhamento_medico: a.encaminhamento_medico,
      });
    }

    const { data, error } = await supabase
      .from('relatorio_evolucao')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Erro ao salvar relatório de evolução:', error);
      throw error;
    }

    console.log('[DEBUG] saveRelatorioEvolucao - sucesso:', data);
    return data;
  } catch (error) {
    console.error('Erro ao salvar evolução:', error);
    throw error;
  }
};

export const updateRelatorioEvolucao = async (
  evolucaoData: UpdateEvolucaoData
): Promise<SupabaseRelatorioEvolucao> => {
  try {
    console.log('[DEBUG] updateRelatorioEvolucao - dados:', evolucaoData);

    // Atualizar evolução existente
    const { data, error } = await supabase
      .from('relatorio_evolucao')
      .update({
        conteudo: evolucaoData.conteudo,
        atualizado_por: evolucaoData.atualizado_por,
        updated_at: new Date().toISOString(),
      })
      .eq('id', evolucaoData.id)
      .select()
      .single();

    if (error) {
      console.error('Erro ao atualizar relatório de evolução:', error);
      throw error;
    }

    console.log('[DEBUG] updateRelatorioEvolucao - sucesso:', data);
    return data;
  } catch (error) {
    console.error('Erro ao atualizar evolução:', error);
    throw error;
  }
};
