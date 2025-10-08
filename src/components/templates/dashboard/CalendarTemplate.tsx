import React, { useState, useCallback } from 'react';
import {
  addDays,
  startOfWeek,
  endOfWeek,
  addWeeks,
  addMonths,
  subMonths,
  subWeeks,
  subDays,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

import {
  CalendarHeader,
  MonthView,
  WeekView,
  DayView,
  AgendaView,
  AppointmentDetailsManager,
  AppointmentFormManager,
} from '@/components/domain/calendar';

import type { CalendarEvent, CalendarView } from '@/types/calendar';
import type { SupabaseAgendamentoCompletoFlat } from '@/types/supabase-calendar';
import type { AppointmentUpdateData } from '@/components/domain/calendar/AppointmentDetailsManager';
import { useCalendarFormData } from '@/hooks/useCalendarData';
import { updateAgendamentoDetails } from '@/lib/calendar-services';
import { useToast } from '@/components/primitives/use-toast';

// AI dev note: CalendarTemplate combina componentes Domain do calendário
// Template base que gerencia estado e comunicação entre componentes

export interface CalendarTemplateProps {
  // Events data
  events: CalendarEvent[];
  onEventSave: (event: Omit<CalendarEvent, 'id'> & { id?: string }) => void;

  // View configuration
  initialView?: CalendarView;
  initialDate?: Date;

  // AI dev note: External state control (usado por CalendarTemplateWithData)
  externalCurrentDate?: Date;
  externalCurrentView?: CalendarView;
  onExternalDateChange?: (date: Date) => void;
  onExternalViewChange?: (view: CalendarView) => void;

  // Layout
  className?: string;

  // Permissions
  canCreateEvents?: boolean;
  canEditEvents?: boolean;
  canDeleteEvents?: boolean;
  canViewAllEvents?: boolean;

  // Features
  showDatePicker?: boolean;
  showViewToggle?: boolean;
  showCreateButton?: boolean;
  showEventManager?: boolean;

  // Appointment Details (for medical appointments)
  userRole?: 'admin' | 'profissional' | 'secretaria' | null;
  locaisAtendimento?: Array<{
    id: string;
    nome: string;
    tipo_local: string;
    ativo: boolean;
  }>;
  isLoadingLocais?: boolean;
  onPatientClick?: (patientId: string | null) => void;
  onProfessionalClick?: (professionalId: string) => void;
  onNfeAction?: (appointmentId: string, linkNfe?: string) => void;
}

export const CalendarTemplate = React.memo<CalendarTemplateProps>(
  ({
    events,
    // onEventSave, // AI dev note: Temporariamente comentado para evitar double update

    initialView = 'month',
    initialDate = new Date(), // AI dev note: Sempre abre na data atual

    // AI dev note: External state control
    externalCurrentDate,
    externalCurrentView,
    onExternalDateChange,
    onExternalViewChange,

    canCreateEvents = true,
    canEditEvents = true,
    canDeleteEvents = true,
    canViewAllEvents = true,

    className,
    showEventManager = true,
    userRole,
    locaisAtendimento = [],
    isLoadingLocais = false,
    onPatientClick,
    onProfessionalClick,
    onNfeAction,
  }) => {
    // AI dev note: These permissions are received but will be used in future implementations
    void canDeleteEvents;
    void canViewAllEvents;

    // AI dev note: Use external state when available, otherwise use local state
    const [localCurrentDate, setLocalCurrentDate] = useState<Date>(initialDate);
    const [localCurrentView, setLocalCurrentView] =
      useState<CalendarView>(initialView);

    const currentDate = externalCurrentDate ?? localCurrentDate;
    const currentView = externalCurrentView ?? localCurrentView;
    const setCurrentDate = onExternalDateChange ?? setLocalCurrentDate;
    const setCurrentView = onExternalViewChange ?? setLocalCurrentView;

    const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
      null
    );
    const [isEventManagerOpen, setIsEventManagerOpen] = useState(false);
    const [isAppointmentFormOpen, setIsAppointmentFormOpen] = useState(false);
    const [newEventDate, setNewEventDate] = useState<Date | undefined>();
    const [newEventTime, setNewEventTime] = useState<string | undefined>();

    // Load form data for locations
    const { formData } = useCalendarFormData();

    // Toast notifications
    const { toast } = useToast();

    // Navigation handlers
    const handlePreviousClick = useCallback(() => {
      let newDate: Date;
      switch (currentView) {
        case 'month':
          newDate = subMonths(currentDate, 1);
          break;
        case 'week':
          newDate = subWeeks(currentDate, 1);
          break;
        case 'day':
          newDate = subDays(currentDate, 1);
          break;
        case 'agenda':
          newDate = subWeeks(currentDate, 1);
          break;
        default:
          newDate = currentDate;
      }

      if (process.env.NODE_ENV === 'development') {
        console.log('🔄 DEBUG: CalendarTemplate.handlePreviousClick', {
          'usando estado externo': !!onExternalDateChange,
          oldDate: currentDate.toISOString(),
          newDate: newDate.toISOString(),
          view: currentView,
        });
      }
      setCurrentDate(newDate);
    }, [currentView, currentDate, setCurrentDate, onExternalDateChange]);

    const handleNextClick = useCallback(() => {
      let newDate: Date;
      switch (currentView) {
        case 'month':
          newDate = addMonths(currentDate, 1);
          break;
        case 'week':
          newDate = addWeeks(currentDate, 1);
          break;
        case 'day':
          newDate = addDays(currentDate, 1);
          break;
        case 'agenda':
          newDate = addWeeks(currentDate, 1);
          break;
        default:
          newDate = currentDate;
      }

      if (process.env.NODE_ENV === 'development') {
        console.log('🔄 DEBUG: CalendarTemplate.handleNextClick', {
          'usando estado externo': !!onExternalDateChange,
          oldDate: currentDate.toISOString(),
          newDate: newDate.toISOString(),
          view: currentView,
        });
      }
      setCurrentDate(newDate);
    }, [currentView, currentDate, setCurrentDate, onExternalDateChange]);

    const handleTodayClick = useCallback(() => {
      const today = new Date();
      if (process.env.NODE_ENV === 'development') {
        console.log('🔄 DEBUG: CalendarTemplate.handleTodayClick', {
          'usando estado externo': !!onExternalDateChange,
          today: today.toISOString(),
        });
      }
      setCurrentDate(today);
    }, [setCurrentDate, onExternalDateChange]);

    const handleDateChange = useCallback(
      (date: Date) => {
        if (process.env.NODE_ENV === 'development') {
          console.log('🔄 DEBUG: CalendarTemplate.handleDateChange', {
            'usando estado externo': !!onExternalDateChange,
            oldDate: currentDate.toISOString(),
            newDate: date.toISOString(),
            oldMonth: currentDate.getMonth(),
            newMonth: date.getMonth(),
          });
        }
        setCurrentDate(date);
      },
      [setCurrentDate, currentDate, onExternalDateChange]
    );

    const handleViewChange = useCallback(
      (view: CalendarView) => {
        if (process.env.NODE_ENV === 'development') {
          console.log('🔄 DEBUG: CalendarTemplate.handleViewChange', {
            'usando estado externo': !!onExternalViewChange,
            oldView: currentView,
            newView: view,
          });
        }
        setCurrentView(view);
      },
      [setCurrentView, currentView, onExternalViewChange]
    );

    // Event handlers
    const handleEventClick = useCallback(
      (event: CalendarEvent) => {
        if (canEditEvents) {
          setSelectedEvent(event);
          setIsEventManagerOpen(true);
        }
      },
      [canEditEvents]
    );

    const handleNewEventClick = useCallback(() => {
      if (canCreateEvents) {
        const today = new Date();
        const defaultDate = currentView === 'agenda' ? today : currentDate;
        setNewEventDate(defaultDate);
        setNewEventTime(undefined);
        setIsAppointmentFormOpen(true);
      }
    }, [canCreateEvents, currentDate, currentView]);

    const handleTimeSlotClick = useCallback(
      (time: string, date: Date) => {
        if (canCreateEvents) {
          setNewEventDate(date);
          setNewEventTime(time);
          setIsAppointmentFormOpen(true);
        }
      },
      [canCreateEvents]
    );

    // AI dev note: handleEventSave temporariamente comentado para evitar double update flow
    // const handleEventSave = useCallback(
    //   (eventData: Omit<CalendarEvent, 'id'> & { id?: string }) => {
    //     onEventSave(eventData);
    //     setIsEventManagerOpen(false);
    //     setSelectedEvent(null);
    //   },
    //   [onEventSave]
    // );

    const handleEventManagerClose = useCallback(() => {
      setIsEventManagerOpen(false);
      setSelectedEvent(null);
    }, []);

    const handleAppointmentFormClose = useCallback(() => {
      setIsAppointmentFormOpen(false);
      setNewEventDate(undefined);
      setNewEventTime(undefined);
    }, []);

    const handleAppointmentFormSave = useCallback((appointmentId: string) => {
      console.log('Novo agendamento criado:', appointmentId);
      // Callback para refresh ou outras ações após criação
      // O refresh será gerenciado pelo componente pai
    }, []);

    // Filter events based on current view and date
    const getFilteredEvents = useCallback(() => {
      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 DEBUG: CalendarTemplate.getFilteredEvents - ENTRADA', {
          'events.length': events?.length || 0,
          currentView: currentView,
          currentDate: currentDate.toISOString(),
          'currentDate.getMonth()': currentDate.getMonth(),
          'currentDate.getFullYear()': currentDate.getFullYear(),
          'primeiros 3 eventos':
            events?.slice(0, 3).map((e) => ({
              id: e.id,
              title: e.title,
              start: e.start.toISOString(),
              'start.getMonth()': new Date(e.start).getMonth(),
              'start.getFullYear()': new Date(e.start).getFullYear(),
            })) || [],
        });
      }

      if (!events || events.length === 0) {
        if (process.env.NODE_ENV === 'development') {
          console.log(
            '🔍 DEBUG: CalendarTemplate.getFilteredEvents - SEM EVENTOS'
          );
        }
        return [];
      }

      let filteredEvents: CalendarEvent[] = [];

      switch (currentView) {
        case 'month':
          // AI dev note: SIMPLIFICAÇÃO TEMPORÁRIA - useCalendarData já busca range correto
          // Remover filtro duplo que pode estar causando perda de eventos
          if (process.env.NODE_ENV === 'development') {
            console.log(
              '🔧 DEBUG: FILTRO SIMPLIFICADO - useCalendarData já filtrou por range, passando eventos direto'
            );
            filteredEvents = events; // Passar todos os eventos que chegaram do useCalendarData
          } else {
            // Manter filtro original em produção até confirmar que funciona
            filteredEvents = events.filter((event) => {
              const eventDate = new Date(event.start);
              const sameMonth = eventDate.getMonth() === currentDate.getMonth();
              const sameYear =
                eventDate.getFullYear() === currentDate.getFullYear();
              return sameMonth && sameYear;
            });
          }
          break;
        case 'week': {
          if (process.env.NODE_ENV === 'development') {
            filteredEvents = events; // Simplificado para debug
          } else {
            const weekStart = startOfWeek(currentDate, { locale: ptBR });
            const weekEnd = endOfWeek(currentDate, { locale: ptBR });
            filteredEvents = events.filter((event) => {
              const eventDate = new Date(event.start);
              return eventDate >= weekStart && eventDate <= weekEnd;
            });
          }
          break;
        }
        case 'day':
          if (process.env.NODE_ENV === 'development') {
            filteredEvents = events; // Simplificado para debug
          } else {
            filteredEvents = events.filter((event) => {
              const eventDate = new Date(event.start);
              return eventDate.toDateString() === currentDate.toDateString();
            });
          }
          break;
        case 'agenda': {
          if (process.env.NODE_ENV === 'development') {
            filteredEvents = events; // Simplificado para debug
          } else {
            // Show upcoming events from current date
            filteredEvents = events
              .filter((event) => {
                const eventDate = new Date(event.start);
                return eventDate >= currentDate;
              })
              .sort(
                (a, b) =>
                  new Date(a.start).getTime() - new Date(b.start).getTime()
              );
          }
          break;
        }
        default:
          filteredEvents = events;
      }

      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 DEBUG: CalendarTemplate.getFilteredEvents - SAÍDA', {
          'filteredEvents.length': filteredEvents.length,
          'eventos filtrados': filteredEvents.slice(0, 3).map((e) => ({
            id: e.id,
            title: e.title,
            start: e.start.toISOString(),
          })),
          view: currentView,
        });
      }

      return filteredEvents;
    }, [events, currentView, currentDate]);

    // Render current view
    const renderCurrentView = () => {
      const filteredEvents = getFilteredEvents();

      switch (currentView) {
        case 'month':
          return (
            <MonthView
              currentDate={currentDate}
              events={filteredEvents}
              onEventClick={handleEventClick}
              onTimeSlotClick={handleTimeSlotClick}
              onDateChange={handleDateChange}
            />
          );
        case 'week':
          return (
            <WeekView
              currentDate={currentDate}
              events={filteredEvents}
              onEventClick={handleEventClick}
              onTimeSlotClick={handleTimeSlotClick}
              userRole={userRole}
            />
          );
        case 'day':
          return (
            <DayView
              currentDate={currentDate}
              events={filteredEvents}
              onEventClick={handleEventClick}
              onTimeSlotClick={handleTimeSlotClick}
              userRole={userRole}
            />
          );
        case 'agenda':
          return (
            <AgendaView
              currentDate={currentDate}
              events={filteredEvents}
              onEventClick={handleEventClick}
            />
          );
        default:
          return null;
      }
    };

    return (
      <div className={cn('w-full max-w-none', className)}>
        {/* Calendar Header */}
        <div className="mb-4">
          <CalendarHeader
            currentDate={currentDate}
            currentView={currentView}
            onPrevious={handlePreviousClick}
            onNext={handleNextClick}
            onToday={handleTodayClick}
            onDateChange={handleDateChange}
            onViewChange={handleViewChange}
            onNewEvent={canCreateEvents ? handleNewEventClick : undefined}
          />
        </div>

        {/* Calendar Content - expandido para largura total */}
        <div className="w-full max-w-none">{renderCurrentView()}</div>

        {/* Appointment Details Modal - Para editar agendamentos existentes */}
        {showEventManager && (
          <AppointmentDetailsManager
            isOpen={isEventManagerOpen}
            onClose={handleEventManagerClose}
            appointment={
              selectedEvent?.metadata?.appointmentData as
                | SupabaseAgendamentoCompletoFlat
                | undefined
            }
            userRole={userRole || null}
            locaisAtendimento={formData.locaisAtendimento || locaisAtendimento}
            isLoadingLocais={isLoadingLocais}
            onSave={async (data: AppointmentUpdateData) => {
              // AI dev note: Bypass específico para AppointmentDetailsManager - usar updateAgendamentoDetails diretamente
              try {
                console.log(
                  '[DEBUG] CalendarTemplate - AppointmentDetailsManager onSave:',
                  data
                );
                const updatedAppointment = await updateAgendamentoDetails(data);
                console.log(
                  '[DEBUG] CalendarTemplate - Agendamento atualizado:',
                  updatedAppointment
                );

                // Show success toast
                toast({
                  title: 'Agendamento atualizado',
                  description: 'As alterações foram salvas com sucesso',
                  variant: 'default',
                });

                // AI dev note: Não trigger handleEventSave para evitar double update
                // O updateAgendamentoDetails já salvou tudo necessário
                // Apenas fechar o modal e refresh será feito pelo parent
                handleEventManagerClose();
              } catch (error) {
                console.error(
                  '[ERROR] CalendarTemplate - Erro ao salvar appointment details:',
                  error
                );

                // Tratar erro RLS especificamente
                let errorMessage =
                  'Não foi possível salvar as alterações. Tente novamente.';

                if (
                  error &&
                  typeof error === 'object' &&
                  'code' in error &&
                  error.code === '42501'
                ) {
                  errorMessage =
                    'Você não tem permissão para salvar evolução. Contate o administrador.';
                } else if (error instanceof Error) {
                  errorMessage = error.message;
                }

                // Show error toast
                toast({
                  title: 'Erro ao salvar',
                  description: errorMessage,
                  variant: 'destructive',
                });
              }
            }}
            onNfeAction={onNfeAction}
            onPatientClick={onPatientClick}
            onProfessionalClick={onProfessionalClick}
          />
        )}

        {/* Appointment Form Modal - Para criar novos agendamentos */}
        <AppointmentFormManager
          isOpen={isAppointmentFormOpen}
          onClose={handleAppointmentFormClose}
          initialDate={newEventDate}
          initialTime={newEventTime}
          onSave={handleAppointmentFormSave}
        />
      </div>
    );
  }
);

CalendarTemplate.displayName = 'CalendarTemplate';
