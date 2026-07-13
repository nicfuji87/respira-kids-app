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
  CreateAgendamento,
  UpdateAgendamento,
} from '@/types/supabase-calendar';
import {
  fetchUserCalendarEvents,
  fetchTiposServico,
  fetchConsultaStatus,
  fetchPagamentoStatus,
  fetchLocaisAtendimento,
  fetchProfissionais,
  fetchPacientes,
  fetchProfissionaisAutorizados,
  createAgendamento,
  updateAgendamento,
  deleteAgendamento,
} from '@/lib/calendar-services';
import {
  mapAgendamentoToCalendarEvent,
  mapCalendarEventToAgendamento,
  calculateCalendarPermissions,
} from '@/lib/calendar-mappers';
import { fetchBloqueiosAsEvents } from '@/lib/agenda-bloqueios-api';
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
  initialDate: Date = new Date() // AI dev note: Sempre usa data atual como padrão
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
        const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
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
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 DEBUG: useCalendarData.fetchEvents - INICIO', {
        'user existe': !!user,
        'user.pessoa existe': !!user?.pessoa,
        'user.pessoa.id': user?.pessoa?.id || 'UNDEFINED',
        'user.pessoa.nome': user?.pessoa?.nome || 'UNDEFINED',
        'user.pessoa.role': user?.pessoa?.role || 'UNDEFINED',
        'user.email': user?.email || 'UNDEFINED',
        'user completo': user,
      });
    }

    if (!user?.pessoa?.id) {
      if (process.env.NODE_ENV === 'development') {
        console.log(
          '❌ DEBUG: useCalendarData.fetchEvents - ABORTADO - user.pessoa.id não disponível',
          {
            user,
            'user?.pessoa': user?.pessoa,
            razão: !user
              ? 'user é null/undefined'
              : !user.pessoa
                ? 'user.pessoa é null/undefined'
                : 'user.pessoa.id é null/undefined',
          }
        );
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
        console.log(
          '🔍 DEBUG: useCalendarData.fetchEvents - CHAMANDO fetchUserCalendarEvents',
          {
            'user.pessoa.id': user.pessoa.id,
            'user.pessoa.nome': user.pessoa.nome,
            'user.pessoa.role': user.pessoa?.role,
            view: view,
            currentDate: currentDate.toISOString(),
            'dateRange.start': dateRange.start.toISOString(),
            'dateRange.end': dateRange.end.toISOString(),
            'range em dias': Math.ceil(
              (dateRange.end.getTime() - dateRange.start.getTime()) /
                (1000 * 60 * 60 * 24)
            ),
            filters: filters,
          }
        );
      }

      const calendarEvents = await fetchUserCalendarEvents(
        filters,
        user.pessoa.id,
        user.pessoa?.role as 'admin' | 'profissional' | 'secretaria'
      );

      if (process.env.NODE_ENV === 'development') {
        console.log(
          '🔍 DEBUG: useCalendarData.fetchEvents - RESPOSTA fetchUserCalendarEvents',
          {
            'calendarEvents.length': calendarEvents.length,
            'calendarEvents existe': !!calendarEvents,
            'é array': Array.isArray(calendarEvents),
            'primeiros 3 eventos': calendarEvents.slice(0, 3).map((event) => ({
              id: event.id,
              title: event.title,
              start: event.start.toISOString(),
              end: event.end.toISOString(),
              color: event.color,
              'metadata.profissionalId': event.metadata?.profissionalId,
              'metadata.pacienteId': event.metadata?.pacienteId,
            })),
          }
        );
      }

      // AI dev note: Sempre mostra os eventos encontrados, sem redirecionamento automático
      // Isso permite que o usuário navegue livremente para qualquer período

      if (process.env.NODE_ENV === 'development') {
        console.log('📅 DEBUG: useCalendarData.fetchEvents - SETANDO EVENTS', {
          eventsCount: calendarEvents.length,
          dateRange: {
            start: dateRange.start.toISOString(),
            end: dateRange.end.toISOString(),
            'range em dias': Math.ceil(
              (dateRange.end.getTime() - dateRange.start.getTime()) /
                (1000 * 60 * 60 * 24)
            ),
          },
          view: view,
          currentDate: currentDate.toISOString(),
        });
      }

      // AI dev note: Mesclar bloqueios de agenda (eventos cinza) no mesmo range.
      // Falha ao buscar bloqueios NÃO pode derrubar o calendário de consultas.
      let bloqueioEvents: CalendarEvent[] = [];
      try {
        const role = user.pessoa?.role as
          | 'admin'
          | 'profissional'
          | 'secretaria';
        bloqueioEvents = await fetchBloqueiosAsEvents({
          from: dateRange.start.toISOString(),
          to: dateRange.end.toISOString(),
          profissionalId: role === 'profissional' ? user.pessoa.id : undefined,
          incluirClinica: role === 'profissional',
        });
      } catch (bloqErr) {
        console.error('❌ Erro ao buscar bloqueios de agenda:', bloqErr);
      }

      setEvents([...calendarEvents, ...bloqueioEvents]);
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
  }, [user, dateRange, view, currentDate]);

  // AI dev note: Único useEffect para buscar eventos - reage a mudanças de user, dateRange, view, currentDate
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 DEBUG: useCalendarData.useEffect - DEPENDÊNCIAS', {
        'user existe': !!user,
        'user.pessoa existe': !!user?.pessoa,
        'user.pessoa.id': user?.pessoa?.id || 'UNDEFINED',
        'fetchEvents será chamado': !!user?.pessoa?.id,
        'dateRange.start': dateRange.start.toISOString(),
        'dateRange.end': dateRange.end.toISOString(),
        view: view,
        currentDate: currentDate.toISOString(),
      });
    }

    // AI dev note: Só buscar eventos se user.pessoa.id estiver disponível
    if (user?.pessoa?.id) {
      fetchEvents();
    } else {
      if (process.env.NODE_ENV === 'development') {
        console.log(
          '⏳ DEBUG: useCalendarData.useEffect - AGUARDANDO user.pessoa.id'
        );
      }
      // Limpar eventos se user não está disponível
      setEvents([]);
      setLoading(false);
    }
  }, [
    fetchEvents,
    user,
    user?.pessoa?.id,
    dateRange.start,
    dateRange.end,
    view,
    currentDate,
  ]);

  // AI dev note: Recarrega quando bloqueios de agenda mudam (criados/editados/
  // removidos no BloqueioAgendaDialog dispara window 'bloqueios:changed').
  useEffect(() => {
    const handler = () => {
      if (user?.pessoa?.id) fetchEvents();
    };
    window.addEventListener('bloqueios:changed', handler);
    return () => window.removeEventListener('bloqueios:changed', handler);
  }, [fetchEvents, user?.pessoa?.id]);

  // AI dev note: Handlers para mudança de data/vista
  const handleViewChange = useCallback(
    (newView: CalendarView) => {
      if (process.env.NODE_ENV === 'development') {
        console.log('🔄 DEBUG: useCalendarData.handleViewChange', {
          oldView: view,
          newView: newView,
        });
      }
      setView(newView);
    },
    [view]
  );

  const handleDateChange = useCallback(
    (newDate: Date) => {
      if (process.env.NODE_ENV === 'development') {
        console.log('🔄 DEBUG: useCalendarData.handleDateChange', {
          oldDate: currentDate.toISOString(),
          newDate: newDate.toISOString(),
          oldMonth: currentDate.getMonth(),
          newMonth: newDate.getMonth(),
          oldYear: currentDate.getFullYear(),
          newYear: newDate.getFullYear(),
          dateChanged: currentDate.getTime() !== newDate.getTime(),
        });
      }
      setCurrentDate(newDate);
    },
    [currentDate]
  );

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
        // AI dev note: Buscar permissões para secretária
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
export const useCalendarStats = () => {
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
  }, [user]);

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
        ) as CreateAgendamento;
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
