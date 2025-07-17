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

  // Layout
  className?: string;

  // Permissions
  canCreateEvents?: boolean;
  canEditEvents?: boolean;

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
  onPaymentAction?: (appointmentId: string) => void;
  onNfeAction?: (appointmentId: string, linkNfe?: string) => void;
}

export const CalendarTemplate = React.memo<CalendarTemplateProps>(
  ({
    events,
    // onEventSave, // AI dev note: Temporariamente comentado para evitar double update

    initialView = 'month',
    initialDate = new Date(),
    canCreateEvents = true,
    canEditEvents = true,

    className,
    showEventManager = true,
    userRole,
    locaisAtendimento = [],
    isLoadingLocais = false,
    onPatientClick,
    onProfessionalClick,
    onPaymentAction,
    onNfeAction,
  }) => {
    // State management
    const [currentDate, setCurrentDate] = useState<Date>(initialDate);
    const [currentView, setCurrentView] = useState<CalendarView>(initialView);
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
      setCurrentDate((prevDate) => {
        switch (currentView) {
          case 'month':
            return subMonths(prevDate, 1);
          case 'week':
            return subWeeks(prevDate, 1);
          case 'day':
            return subDays(prevDate, 1);
          case 'agenda':
            return subWeeks(prevDate, 1);
          default:
            return prevDate;
        }
      });
    }, [currentView]);

    const handleNextClick = useCallback(() => {
      setCurrentDate((prevDate) => {
        switch (currentView) {
          case 'month':
            return addMonths(prevDate, 1);
          case 'week':
            return addWeeks(prevDate, 1);
          case 'day':
            return addDays(prevDate, 1);
          case 'agenda':
            return addWeeks(prevDate, 1);
          default:
            return prevDate;
        }
      });
    }, [currentView]);

    const handleTodayClick = useCallback(() => {
      setCurrentDate(new Date());
    }, []);

    const handleDateChange = useCallback((date: Date) => {
      setCurrentDate(date);
    }, []);

    const handleViewChange = useCallback((view: CalendarView) => {
      setCurrentView(view);
    }, []);

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
        setNewEventDate(currentDate);
        setNewEventTime(undefined);
        setIsAppointmentFormOpen(true);
      }
    }, [canCreateEvents, currentDate]);

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
      if (!events || events.length === 0) return [];

      switch (currentView) {
        case 'month':
          return events.filter((event) => {
            const eventDate = new Date(event.start);
            return (
              eventDate.getMonth() === currentDate.getMonth() &&
              eventDate.getFullYear() === currentDate.getFullYear()
            );
          });
        case 'week': {
          const weekStart = startOfWeek(currentDate, { locale: ptBR });
          const weekEnd = endOfWeek(currentDate, { locale: ptBR });
          return events.filter((event) => {
            const eventDate = new Date(event.start);
            return eventDate >= weekStart && eventDate <= weekEnd;
          });
        }
        case 'day':
          return events.filter((event) => {
            const eventDate = new Date(event.start);
            return eventDate.toDateString() === currentDate.toDateString();
          });
        case 'agenda': {
          // Show upcoming events from current date
          return events
            .filter((event) => {
              const eventDate = new Date(event.start);
              return eventDate >= currentDate;
            })
            .sort(
              (a, b) =>
                new Date(a.start).getTime() - new Date(b.start).getTime()
            );
        }
        default:
          return events;
      }
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
      <div className={cn('w-full h-full flex flex-col', className)}>
        {/* Calendar Header */}
        <div className="flex-shrink-0 mb-4">
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

        {/* Calendar Content */}
        <div className="flex-1 min-h-0">{renderCurrentView()}</div>

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
            onPaymentAction={onPaymentAction}
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
