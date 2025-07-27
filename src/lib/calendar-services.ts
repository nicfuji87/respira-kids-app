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

  console.log('🔍 DEBUG: Query Supabase na view para CalendarEvents', {
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

  console.log('🔍 DEBUG: Resultado da query na view para CalendarEvents', {
    'data.length': data?.length || 0,
    data: data,
  });

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

// AI dev note: Busca eventos do calendário baseado nas permissões do usuário - retorna CalendarEvent diretamente
export const fetchUserCalendarEvents = async (
  filters: CalendarFilters,
  userId: string,
  userRole: 'admin' | 'profissional' | 'secretaria'
): Promise<CalendarEvent[]> => {
  console.log('🔍 DEBUG: fetchUserCalendarEvents chamado', {
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
      return fetchAgendamentosFromViewAsEvents(filters);

    case 'profissional': {
      // Profissional vê apenas seus próprios agendamentos
      const profissionalFilters = {
        ...filters,
        profissionalId: userId,
      };
      console.log('🔍 DEBUG: Filtros para profissional', profissionalFilters);
      return fetchAgendamentosFromViewAsEvents(profissionalFilters);
    }

    case 'secretaria': {
      // Secretária vê agendamentos dos profissionais autorizados
      const profissionaisAutorizados =
        await fetchProfissionaisAutorizados(userId);

      if (profissionaisAutorizados.length === 0) {
        console.log('🔍 DEBUG: Secretária sem profissionais autorizados');
        return [];
      }

      // Buscar agendamentos para cada profissional autorizado
      const agendamentosPromises = profissionaisAutorizados.map(
        (profissionalId) => {
          const secretariaFilters = {
            ...filters,
            profissionalId,
          };
          return fetchAgendamentosFromViewAsEvents(secretariaFilters);
        }
      );

      const agendamentosArrays = await Promise.all(agendamentosPromises);
      const agendamentos = agendamentosArrays.flat();

      console.log('🔍 DEBUG: Agendamentos para secretária', {
        profissionaisAutorizados,
        totalAgendamentos: agendamentos.length,
      });

      return agendamentos;
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

// AI dev note: Busca profissionais baseado em permissões do usuário
// Admin: vê todos os profissionais | Secretaria: vê apenas autorizados | Profissional: vê apenas a si mesmo
export const fetchProfissionaisForUser = async (
  userId: string,
  userRole: 'admin' | 'profissional' | 'secretaria'
): Promise<SupabasePessoa[]> => {
  console.log(
    '📡 [fetchProfissionaisForUser] Iniciando busca com parâmetros:',
    {
      userId: userId,
      userRole: userRole,
      timestamp: new Date().toISOString(),
    }
  );

  switch (userRole) {
    case 'admin': {
      console.log(
        '👑 [fetchProfissionaisForUser] Executando query para ADMIN - buscar todos os profissionais'
      );

      // Admin vê todos os profissionais aprovados e com perfil completo
      const { data, error } = await supabase
        .from('pessoas')
        .select('*')
        .eq('role', 'profissional')
        .eq('ativo', true)
        .eq('is_approved', true)
        .eq('profile_complete', true)
        .order('nome');

      console.log('📊 [fetchProfissionaisForUser] Resultado query ADMIN:', {
        'data.length': data?.length || 0,
        error: error,
        primeiros_3_profissionais:
          data
            ?.slice(0, 3)
            .map((p) => ({ id: p.id, nome: p.nome, role: p.role })) || [],
      });

      if (error) {
        console.error(
          '❌ [fetchProfissionaisForUser] Erro ao buscar profissionais para admin:',
          error
        );
        throw error;
      }

      const result = data || [];
      console.log(
        '✅ [fetchProfissionaisForUser] ADMIN - retornando',
        result.length,
        'profissionais'
      );
      return result;
    }

    case 'secretaria': {
      console.log(
        '📋 [fetchProfissionaisForUser] Executando query para SECRETARIA - buscar permissões primeiro'
      );

      // Secretaria vê apenas profissionais autorizados via permissoes_agendamento
      // Primeiro, buscar IDs dos profissionais autorizados
      const { data: permissoes, error: permissoesError } = await supabase
        .from('permissoes_agendamento')
        .select('id_profissional')
        .eq('id_secretaria', userId)
        .eq('ativo', true);

      console.log('🔐 [fetchProfissionaisForUser] Permissões da secretaria:', {
        'permissoes.length': permissoes?.length || 0,
        permissoes: permissoes,
        permissoesError: permissoesError,
      });

      if (permissoesError) {
        console.error(
          '❌ [fetchProfissionaisForUser] Erro ao buscar permissões da secretaria:',
          permissoesError
        );
        throw permissoesError;
      }

      const profissionaisAutorizados =
        permissoes?.map((p) => p.id_profissional) || [];

      console.log(
        '🎯 [fetchProfissionaisForUser] IDs de profissionais autorizados:',
        profissionaisAutorizados
      );

      // Se não há permissões, retorna array vazio
      if (profissionaisAutorizados.length === 0) {
        console.log(
          '⚠️ [fetchProfissionaisForUser] SECRETARIA sem permissões - retornando array vazio'
        );
        return [];
      }

      // Buscar dados completos dos profissionais autorizados com perfil completo
      const { data, error } = await supabase
        .from('pessoas')
        .select('*')
        .eq('role', 'profissional')
        .eq('ativo', true)
        .eq('is_approved', true)
        .eq('profile_complete', true)
        .in('id', profissionaisAutorizados)
        .order('nome');

      console.log(
        '📊 [fetchProfissionaisForUser] Resultado query SECRETARIA:',
        {
          'data.length': data?.length || 0,
          error: error,
          profissionais:
            data?.map((p) => ({ id: p.id, nome: p.nome, role: p.role })) || [],
        }
      );

      if (error) {
        console.error(
          '❌ [fetchProfissionaisForUser] Erro ao buscar profissionais para secretaria:',
          error
        );
        throw error;
      }

      const result = data || [];
      console.log(
        '✅ [fetchProfissionaisForUser] SECRETARIA - retornando',
        result.length,
        'profissionais'
      );
      return result;
    }

    case 'profissional': {
      console.log(
        '👨‍⚕️ [fetchProfissionaisForUser] Executando query para PROFISSIONAL - buscar apenas a si mesmo'
      );

      // Profissional vê apenas a si mesmo
      const { data, error } = await supabase
        .from('pessoas')
        .select('*')
        .eq('id', userId)
        .eq('role', 'profissional')
        .eq('ativo', true)
        .eq('is_approved', true)
        .single();

      console.log(
        '📊 [fetchProfissionaisForUser] Resultado query PROFISSIONAL:',
        {
          data: data ? { id: data.id, nome: data.nome, role: data.role } : null,
          error: error,
        }
      );

      if (error) {
        if (error.code === 'PGRST116') {
          console.log(
            '⚠️ [fetchProfissionaisForUser] PROFISSIONAL não encontrado - retornando array vazio'
          );
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
      console.log(
        '✅ [fetchProfissionaisForUser] PROFISSIONAL - retornando',
        result.length,
        'profissionais'
      );
      return result;
    }

    default:
      console.error('❌ [fetchProfissionaisForUser] Role inválido:', userRole);
      throw new Error(`Role inválido: ${userRole}`);
  }
};

// AI dev note: Busca pacientes com responsáveis usando view unificada
// View pacientes_com_responsaveis_view inclui nomes dos responsáveis para busca
// Permite buscar por nome do paciente OU nome do responsável, sempre selecionando o paciente
export const fetchPacientes = async (): Promise<SupabasePessoa[]> => {
  console.log(
    '🔄 [DEBUG] fetchPacientes - iniciando query na view pacientes_com_responsaveis_view'
  );

  // AI dev note: Nova view que inclui dados de responsáveis para busca unificada
  // Campo nomes_responsaveis contém responsáveis concatenados com ' | '
  const { data, error } = await supabase
    .from('pacientes_com_responsaveis_view')
    .select('*')
    .eq('tipo_pessoa_codigo', 'paciente')
    .eq('ativo', true)
    .order('nome');

  if (error) {
    console.error('❌ [DEBUG] fetchPacientes - erro na view unificada:', error);
    throw error;
  }

  const pacientes = data || [];
  console.log(
    '✅ [DEBUG] fetchPacientes - query view unificada concluída, total de pacientes:',
    pacientes.length
  );

  if (pacientes.length > 0) {
    console.log(
      '📋 [DEBUG] fetchPacientes - primeiros 5 pacientes com responsáveis:'
    );
    pacientes.slice(0, 5).forEach((p, index) => {
      console.log(
        `  ${index + 1}. ID: ${p.id} | Nome: "${p.nome}" | Responsáveis: "${p.nomes_responsaveis || 'nenhum'}"`
      );
    });

    // Verificar se a view retorna campos específicos de responsável legal e financeiro
    console.log(
      '🔍 [DEBUG] Verificando se view retorna campos específicos de responsáveis:'
    );
    const primeiroComResponsavel = pacientes.find((p) => p.nomes_responsaveis);
    if (primeiroComResponsavel) {
      console.log(
        '📋 [DEBUG] Primeiro paciente com responsável - campos disponíveis:'
      );
      console.log(
        `  responsavel_legal_nome: "${primeiroComResponsavel.responsavel_legal_nome || 'não disponível'}"`
      );
      console.log(
        `  responsavel_legal_email: "${primeiroComResponsavel.responsavel_legal_email || 'não disponível'}"`
      );
      console.log(
        `  responsavel_financeiro_nome: "${primeiroComResponsavel.responsavel_financeiro_nome || 'não disponível'}"`
      );
      console.log(
        `  responsavel_financeiro_email: "${primeiroComResponsavel.responsavel_financeiro_email || 'não disponível'}"`
      );
      console.log(
        `  nomes_responsaveis (concatenado): "${primeiroComResponsavel.nomes_responsaveis}"`
      );
    }

    // Teste específico para "henrique" - busca em pacientes E responsáveis
    const henriqueMatches = pacientes.filter((p) => {
      const nomeMatch = p.nome && p.nome.toLowerCase().includes('henrique');
      const responsavelMatch =
        p.nomes_responsaveis &&
        p.nomes_responsaveis.toLowerCase().includes('henrique');
      return nomeMatch || responsavelMatch;
    });
    console.log(
      '🔍 [DEBUG] fetchPacientes - pacientes/responsáveis com "henrique":',
      henriqueMatches.length
    );
    if (henriqueMatches.length > 0) {
      console.log(
        '👥 [DEBUG] fetchPacientes - matches encontrados (pacientes + responsáveis):'
      );
      henriqueMatches.forEach((p, index) => {
        const matchType = p.nome?.toLowerCase().includes('henrique')
          ? 'paciente'
          : 'responsável';
        console.log(
          `  ${index + 1}. "${p.nome}" via ${matchType} | Responsáveis: "${p.nomes_responsaveis || 'nenhum'}"`
        );
      });
    }
  } else {
    console.log(
      '⚠️ [DEBUG] fetchPacientes - nenhum paciente retornado da view unificada'
    );
    console.log(
      'ℹ️ [DEBUG] fetchPacientes - verificar se usuário tem permissão para ver pacientes'
    );
  }

  // AI dev note: View retorna estrutura compatível + campo nomes_responsaveis
  // Interface PatientSelect pode usar nomes_responsaveis para busca expandida
  return pacientes as SupabasePessoa[];
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
export const updateAgendamentoDetails = async (appointmentData: {
  id: string;
  data_hora?: string;
  local_id?: string;
  valor_servico?: number;
  status_consulta_id?: string;
  tipo_servico_id?: string;
  observacao?: string;
}): Promise<SupabaseAgendamentoCompletoFlat> => {
  const { id, ...updateFields } = appointmentData;

  // AI dev note: Remover campos undefined E strings vazias para evitar erro UUID
  const cleanUpdateFields = Object.fromEntries(
    Object.entries(updateFields).filter(
      ([, value]) => value !== undefined && value !== ''
    )
  );

  console.log('[DEBUG] updateAgendamentoDetails - id:', id);
  console.log(
    '[DEBUG] updateAgendamentoDetails - campos limpos:',
    cleanUpdateFields
  );

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
  console.log(
    '[DEBUG] updatePaymentStatus - id:',
    agendamentoId,
    'status:',
    statusPagamentoId
  );

  const { error } = await supabase
    .from('agendamentos')
    .update({ status_pagamento_id: statusPagamentoId })
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
  console.log('[DEBUG] updateNfeLink - id:', agendamentoId, 'link:', linkNfe);

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
export const processManualPayment = async (
  agendamentoId: string
): Promise<void> => {
  console.log(
    '🔄 Processando pagamento manual para agendamento:',
    agendamentoId
  );
  // TODO: Implementar integração com sistema de pagamento
  // Por enquanto, apenas log
  throw new Error('Funcionalidade de pagamento manual ainda não implementada');
};

export const issueNfe = async (agendamentoId: string): Promise<string> => {
  console.log('📄 Emitindo NFe para agendamento:', agendamentoId);
  // TODO: Implementar integração com sistema de NFe
  // Por enquanto, apenas log
  throw new Error('Funcionalidade de emissão de NFe ainda não implementada');
};

export const viewNfe = async (linkNfe: string): Promise<void> => {
  console.log('👁️ Visualizando NFe:', linkNfe);
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

    // Inserir nova evolução
    const { data, error } = await supabase
      .from('relatorio_evolucao')
      .insert({
        id_agendamento: evolucaoData.id_agendamento,
        tipo_relatorio_id: tipoEvolucaoId,
        conteudo: evolucaoData.conteudo,
        criado_por: evolucaoData.criado_por,
      })
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
