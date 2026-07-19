import React, { useState, useCallback } from 'react';
import {
  addDays,
  startOfDay,
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
import { SharedSchedulesList } from '@/components/domain/calendar/SharedSchedulesList';
import { BloqueioAgendaDialog } from '@/components/domain/calendar/BloqueioAgendaDialog';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/primitives/tabs';

import type { CalendarEvent, CalendarView } from '@/types/calendar';
import type { AgendaBloqueioComProfissional } from '@/types/agenda-bloqueios';
import type { SupabaseAgendamentoCompletoFlat } from '@/types/supabase-calendar';
import type { AppointmentUpdateData } from '@/components/domain/calendar/AppointmentDetailsManager';
import { useCalendarFormData } from '@/hooks/useCalendarData';
import { updateAgendamentoDetails } from '@/lib/calendar-services';
import { useToast } from '@/components/primitives/use-toast';

// AI dev note: CalendarTemplate combina componentes Domain do calendário
// Template base que gerencia estado e comunicação entre componentes
// Inclui tab para Agenda Compartilhada

export interface CalendarTemplateProps {
  // Events data
  events: CalendarEvent[];
  onEventSave: (event: Omit<CalendarEvent, 'id'> & { id?: string }) => void;

  // AI dev note: Recarrega os eventos no hook useCalendarData (propagado desde
  // CalendarTemplateWithData). Chamado após criar/editar/mudar status de consulta.
  onRefreshNeeded?: () => void;

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

  // Shared Schedules (only for admin with pode_atender = true)
  profissionalId?: string;
  userId?: string;
  showSharedSchedulesTab?: boolean;
}

export const CalendarTemplate = React.memo<CalendarTemplateProps>(
  ({
    events,
    // onEventSave, // AI dev note: Temporariamente comentado para evitar double update
    onRefreshNeeded,

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

    // Shared Schedules
    profissionalId,
    userId,
    showSharedSchedulesTab = false,
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
    const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false);
    const [blockToEdit, setBlockToEdit] =
      useState<AgendaBloqueioComProfissional | null>(null);
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

      setCurrentDate(newDate);
    }, [currentView, currentDate, setCurrentDate]);

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

      setCurrentDate(newDate);
    }, [currentView, currentDate, setCurrentDate]);

    const handleTodayClick = useCallback(() => {
      setCurrentDate(new Date());
    }, [setCurrentDate]);

    const handleDateChange = useCallback(
      (date: Date) => {
        setCurrentDate(date);
      },
      [setCurrentDate]
    );

    const handleViewChange = useCallback(
      (view: CalendarView) => {
        setCurrentView(view);
      },
      [setCurrentView]
    );

    // Event handlers
    const handleEventClick = useCallback(
      (event: CalendarEvent) => {
        // Bloqueios abrem o diálogo de bloqueio (em edição), não o de consulta
        if (event.metadata?.type === 'bloqueio') {
          const bloqueio = (
            event.metadata as { bloqueio?: AgendaBloqueioComProfissional }
          ).bloqueio;
          setBlockToEdit(bloqueio ?? null);
          setIsBlockDialogOpen(true);
          return;
        }
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

    const handleBlockAgendaClick = useCallback(() => {
      setBlockToEdit(null);
      setIsBlockDialogOpen(true);
    }, []);

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

    const handleAppointmentFormSave = useCallback(() => {
      // AI dev note: Recarrega os eventos do calendário para o novo
      // agendamento aparecer sem precisar de F5 (bug P0 corrigido).
      onRefreshNeeded?.();
    }, [onRefreshNeeded]);

    // Filter events based on current view and date
    // AI dev note: Mesmo filtro em dev e produção — o que se testa é o que roda.
    const getFilteredEvents = useCallback(() => {
      if (!events || events.length === 0) {
        return [];
      }

      let filteredEvents: CalendarEvent[] = [];

      switch (currentView) {
        case 'month':
          filteredEvents = events.filter((event) => {
            const eventDate = new Date(event.start);
            const sameMonth = eventDate.getMonth() === currentDate.getMonth();
            const sameYear =
              eventDate.getFullYear() === currentDate.getFullYear();
            return sameMonth && sameYear;
          });
          break;
        case 'week': {
          const weekStart = startOfWeek(currentDate, {
            weekStartsOn: 1,
            locale: ptBR,
          });
          const weekEnd = endOfWeek(currentDate, {
            weekStartsOn: 1,
            locale: ptBR,
          });
          filteredEvents = events.filter((event) => {
            const eventDate = new Date(event.start);
            return eventDate >= weekStart && eventDate <= weekEnd;
          });
          break;
        }
        case 'day':
          filteredEvents = events.filter((event) => {
            const eventDate = new Date(event.start);
            return eventDate.toDateString() === currentDate.toDateString();
          });
          break;
        case 'agenda': {
          // AI dev note: Mostrar o dia inteiro a partir do INÍCIO do dia atual
          // (startOfDay), não do horário atual. Usar currentDate cru escondia as
          // consultas já passadas de hoje (ex.: manhã sumia após o meio-dia).
          const inicioDoDia = startOfDay(currentDate);
          filteredEvents = events
            .filter((event) => {
              const eventDate = new Date(event.start);
              return eventDate >= inicioDoDia;
            })
            .sort(
              (a, b) =>
                new Date(a.start).getTime() - new Date(b.start).getTime()
            );
          break;
        }
        default:
          filteredEvents = events;
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
        {/* Tabs: Agenda vs Agenda Compartilhada */}
        {showSharedSchedulesTab && profissionalId && userId ? (
          <Tabs defaultValue="calendar" className="w-full">
            <TabsList className="mb-3 md:mb-4">
              <TabsTrigger value="calendar">Agenda</TabsTrigger>
              <TabsTrigger value="shared-schedules">
                Agenda Compartilhada
              </TabsTrigger>
            </TabsList>

            <TabsContent value="calendar" className="mt-0">
              {/* Calendar Header */}
              <div className="mb-3 md:mb-4">
                <CalendarHeader
                  currentDate={currentDate}
                  currentView={currentView}
                  onPrevious={handlePreviousClick}
                  onNext={handleNextClick}
                  onToday={handleTodayClick}
                  onDateChange={handleDateChange}
                  onViewChange={handleViewChange}
                  onNewEvent={canCreateEvents ? handleNewEventClick : undefined}
                  onBlockAgenda={
                    canCreateEvents ? handleBlockAgendaClick : undefined
                  }
                />
              </div>

              {/* Calendar Content */}
              <div className="w-full max-w-none">{renderCurrentView()}</div>
            </TabsContent>

            <TabsContent value="shared-schedules" className="mt-0">
              <SharedSchedulesList
                profissionalId={profissionalId}
                userId={userId}
              />
            </TabsContent>
          </Tabs>
        ) : (
          <>
            {/* Calendar Header */}
            <div className="mb-3 md:mb-4">
              <CalendarHeader
                currentDate={currentDate}
                currentView={currentView}
                onPrevious={handlePreviousClick}
                onNext={handleNextClick}
                onToday={handleTodayClick}
                onDateChange={handleDateChange}
                onViewChange={handleViewChange}
                onNewEvent={canCreateEvents ? handleNewEventClick : undefined}
                onBlockAgenda={
                  canCreateEvents ? handleBlockAgendaClick : undefined
                }
              />
            </div>

            {/* Calendar Content - expandido para largura total */}
            <div className="w-full max-w-none">{renderCurrentView()}</div>
          </>
        )}

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
                await updateAgendamentoDetails(data);

                // Show success toast
                toast({
                  title: 'Agendamento atualizado',
                  description: 'As alterações foram salvas com sucesso',
                  variant: 'default',
                });

                // AI dev note: Não trigger handleEventSave para evitar double update
                // O updateAgendamentoDetails já salvou tudo necessário.
                // Recarregar os eventos para refletir edição/mudança de status
                // no calendário sem F5 (bug P0 corrigido).
                onRefreshNeeded?.();
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

        {/* Bloquear Agenda Modal - Indisponibilidade de profissional/clínica */}
        <BloqueioAgendaDialog
          isOpen={isBlockDialogOpen}
          onClose={() => {
            setIsBlockDialogOpen(false);
            setBlockToEdit(null);
          }}
          initialDate={currentDate}
          editBloqueio={blockToEdit}
        />
      </div>
    );
  }
);

CalendarTemplate.displayName = 'CalendarTemplate';
