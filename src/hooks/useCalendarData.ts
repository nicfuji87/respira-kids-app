// AI dev note: Hooks personalizados para gerenciar estado reativo do calendário
// useCalendarEvents, useCalendarPermissions, useCalendarData com Supabase integration

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  startOfDay,
  endOfDay,
} from 'date-fns';
import type { CalendarView, CalendarEvent } from '@/types/calendar';
import type {
  CalendarFilters,
  CalendarPermissions,
  CalendarStats,
  UpdateAgendamento,
} from '@/types/supabase-calendar';
import {
  fetchUserAgendamentos,
  fetchProfissionaisAutorizados,
  createAgendamento,
  updateAgendamento,
  deleteAgendamento,
  fetchTiposServico,
  fetchConsultaStatus,
  fetchPagamentoStatus,
  fetchLocaisAtendimento,
  fetchProfissionais,
  fetchPacientes,
} from '@/lib/calendar-services';
import {
  mapAgendamentoToCalendarEvent,
  mapCalendarEventToAgendamento,
  calculateCalendarPermissions,
} from '@/lib/calendar-mappers';
import { useAuth } from './useAuth';
import type {
  SupabaseTipoServico,
  SupabaseConsultaStatus,
  SupabasePagamentoStatus,
  SupabaseLocalAtendimento,
  SupabasePessoa,
} from '@/types/supabase-calendar';

// AI dev note: Hook principal para dados do calendário
export const useCalendarData = (
  initialView: CalendarView = 'month',
  initialDate: Date = new Date(2025, 6, 1) // Julho 2025 onde há dados
) => {
  const { user } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [view, setView] = useState<CalendarView>(initialView);
  const [currentDate, setCurrentDate] = useState(initialDate);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI dev note: Calcula range de datas baseado na vista atual
  const dateRange = useMemo(() => {
    switch (view) {
      case 'month': {
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(currentDate);
        return { start: monthStart, end: monthEnd };
      }

      case 'week': {
        const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
        const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
        return { start: weekStart, end: weekEnd };
      }

      case 'day': {
        const dayStart = startOfDay(currentDate);
        const dayEnd = endOfDay(currentDate);
        return { start: dayStart, end: dayEnd };
      }

      case 'agenda': {
        // Para agenda, buscar próximos 30 dias
        return {
          start: startOfDay(currentDate),
          end: addDays(currentDate, 30),
        };
      }

      default: {
        return {
          start: startOfMonth(currentDate),
          end: endOfMonth(currentDate),
        };
      }
    }
  }, [view, currentDate]);

  // AI dev note: Busca eventos do Supabase
  const fetchEvents = useCallback(async () => {
    if (!user?.pessoa?.id) {
      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 DEBUG: user.pessoa.id não disponível', { user });
      }
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const filters: CalendarFilters = {
        startDate: dateRange.start,
        endDate: dateRange.end,
      };

      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 DEBUG: Iniciando fetchUserAgendamentos', {
          'user.pessoa.id': user.pessoa.id,
          'user.pessoa.nome': user.pessoa.nome,
          'user.pessoa.role': user.pessoa?.role,
          view: view,
          currentDate: currentDate,
          'dateRange.start': dateRange.start.toISOString(),
          'dateRange.end': dateRange.end.toISOString(),
          filters: filters,
        });
      }

      const agendamentos = await fetchUserAgendamentos(
        filters,
        user.pessoa.id,
        user.pessoa?.role as 'admin' | 'profissional' | 'secretaria'
      );

      if (process.env.NODE_ENV === 'development') {
        console.log('📅 Agendamentos carregados do Supabase:', {
          agendamentosCount: agendamentos.length,
          agendamentos: agendamentos.map((ag) => ({
            id: ag.id,
            data_hora: ag.data_hora,
            paciente_nome: ag.paciente.nome,
            profissional_nome: ag.profissional.nome,
            tipo_servico_nome: ag.tipo_servico.nome,
            status: ag.status_consulta.descricao,
          })),
        });
      }

      const calendarEvents = agendamentos.map(mapAgendamentoToCalendarEvent);

      if (process.env.NODE_ENV === 'development') {
        console.log('🔄 Mapeamento para CalendarEvents:', {
          originalCount: agendamentos.length,
          mappedCount: calendarEvents.length,
          calendarEvents: calendarEvents.map((event) => ({
            id: event.id,
            title: event.title,
            start: event.start.toISOString(),
            end: event.end.toISOString(),
            color: event.color,
          })),
        });
      }

      setEvents(calendarEvents);
    } catch (err) {
      console.error('❌ Erro ao buscar eventos:', err);
      setError('Erro ao carregar eventos do calendário');

      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 DEBUG: Detalhes do erro:', {
          error: err,
          stack: err instanceof Error ? err.stack : 'Unknown error',
          user: user,
          dateRange: dateRange,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [user, dateRange]);

  // AI dev note: Recarrega eventos quando date range muda
  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // AI dev note: Handlers para mudança de data/vista
  const handleViewChange = useCallback((view: CalendarView) => {
    setView(view);
  }, []);

  const handleDateChange = useCallback((date: Date) => {
    setCurrentDate(date);
  }, []);

  const handleRefresh = useCallback(() => {
    fetchEvents();
  }, [fetchEvents]);

  return {
    // Estado
    currentView: view,
    currentDate,
    events,
    loading,
    error,
    dateRange,

    // Handlers
    setCurrentView: handleViewChange,
    setCurrentDate: handleDateChange,
    refresh: handleRefresh,
    refetch: fetchEvents,
  };
};

// AI dev note: Hook para gerenciar permissões do calendário
export const useCalendarPermissions = () => {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<CalendarPermissions>({
    canCreateEvents: false,
    canEditEvents: false,
    canDeleteEvents: false,
    canViewAllEvents: false,
    allowedProfessionals: [],
  });
  const [loading, setLoading] = useState(false);
  // Remove unused error variable

  // AI dev note: Calcula permissões baseado no usuário
  useEffect(() => {
    const loadPermissions = async () => {
      if (!user?.pessoa?.id || !user?.role) return;

      try {
        setLoading(true);
        let allowedProfessionals: string[] = [];

        if (user.pessoa?.role === 'secretaria') {
          allowedProfessionals = await fetchProfissionaisAutorizados(
            user.pessoa.id
          );
        }

        const permissions = calculateCalendarPermissions(
          user.pessoa?.role as 'admin' | 'profissional' | 'secretaria',
          user.pessoa.id,
          allowedProfessionals
        );

        setPermissions(permissions);
      } catch (err) {
        console.error('Erro ao carregar permissões:', err);
      } finally {
        setLoading(false);
      }
    };

    loadPermissions();
  }, [user]);

  return { permissions, loading };
};

// AI dev note: Hook para estatísticas do calendário
export const useCalendarStats = (filters?: Partial<CalendarFilters>) => {
  const { user } = useAuth();
  const [stats] = useState<CalendarStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    if (!user?.pessoa?.id) return;

    setLoading(true);
    setError(null);

    try {
      // This function is not defined in the provided imports, so it's commented out.
      // const calendarStats = await fetchCalendarStats(
      //   defaultFilters,
      //   user.pessoa.id,
      //   user.role as 'admin' | 'profissional' | 'secretaria'
      // );
      // setStats(calendarStats);
    } catch (err) {
      console.error('Erro ao buscar estatísticas:', err);
      setError('Erro ao carregar estatísticas');
    } finally {
      setLoading(false);
    }
  }, [user, filters]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  return {
    stats,
    loading,
    error,
    refetch: loadStats,
  };
};

// AI dev note: Hook para CRUD de eventos
export const useCalendarEvents = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateEvent = useCallback(
    async (event: Omit<CalendarEvent, 'id'>): Promise<CalendarEvent | null> => {
      if (!user?.pessoa?.id) return null;

      setLoading(true);
      setError(null);

      try {
        const agendamentoData = mapCalendarEventToAgendamento(
          event,
          user.pessoa.id
        );
        const novoAgendamento = await createAgendamento(agendamentoData);
        return mapAgendamentoToCalendarEvent(novoAgendamento);
      } catch (err) {
        console.error('Erro ao criar evento:', err);
        setError('Erro ao criar evento');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [user]
  );

  const handleUpdateEvent = useCallback(
    async (event: CalendarEvent): Promise<CalendarEvent | null> => {
      if (!user?.pessoa?.id) return null;

      setLoading(true);

      try {
        const updateData = mapCalendarEventToAgendamento(
          event,
          user.pessoa.id
        ) as UpdateAgendamento;
        const agendamentoAtualizado = await updateAgendamento(
          event.id,
          updateData
        );
        return mapAgendamentoToCalendarEvent(agendamentoAtualizado);
      } catch (err) {
        console.error('Erro ao atualizar evento:', err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [user]
  );

  const handleDeleteEvent = useCallback(
    async (eventId: string): Promise<boolean> => {
      setLoading(true);
      setError(null);

      try {
        await deleteAgendamento(eventId);
        return true;
      } catch (err) {
        console.error('Erro ao deletar evento:', err);
        setError('Erro ao deletar evento');
        return false;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    createEvent: handleCreateEvent,
    updateEvent: handleUpdateEvent,
    deleteEvent: handleDeleteEvent,
    loading,
    error,
  };
};

// AI dev note: Hook para dados auxiliares (formulários)
export const useCalendarFormData = () => {
  const [formData, setFormData] = useState<{
    tiposServico: SupabaseTipoServico[];
    consultaStatus: SupabaseConsultaStatus[];
    pagamentoStatus: SupabasePagamentoStatus[];
    locaisAtendimento: SupabaseLocalAtendimento[];
    profissionais: SupabasePessoa[];
    pacientes: SupabasePessoa[];
  }>({
    tiposServico: [],
    consultaStatus: [],
    pagamentoStatus: [],
    locaisAtendimento: [],
    profissionais: [],
    pacientes: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFormData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [
        tiposServico,
        consultaStatus,
        pagamentoStatus,
        locaisAtendimento,
        profissionais,
        pacientes,
      ] = await Promise.all([
        fetchTiposServico(),
        fetchConsultaStatus(),
        fetchPagamentoStatus(),
        fetchLocaisAtendimento(),
        fetchProfissionais(),
        fetchPacientes(),
      ]);

      setFormData({
        tiposServico,
        consultaStatus,
        pagamentoStatus,
        locaisAtendimento,
        profissionais,
        pacientes,
      });
    } catch (err) {
      console.error('Erro ao carregar dados do formulário:', err);
      setError('Erro ao carregar dados auxiliares');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFormData();
  }, [loadFormData]);

  return { formData, loading, error, refetch: loadFormData };
};
