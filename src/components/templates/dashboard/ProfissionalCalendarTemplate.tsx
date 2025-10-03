import React, { useState, useMemo } from 'react';
import { CalendarTemplate } from './CalendarTemplate';
import { CalendarFilters } from '@/components/composed/CalendarFilters';
import { cn } from '@/lib/utils';
import type { CalendarEvent, CalendarView } from '@/types/calendar';

// AI dev note: Template específico para profissionals - sem painéis de estatísticas
export interface ProfissionalUser {
  id: string;
  name: string;
  email: string;
  role: 'profissional';
  specialization?: string;
  registrationNumber?: string;
}

export interface ProfissionalCalendarTemplateProps {
  currentUser: ProfissionalUser;
  events: CalendarEvent[];
  onEventSave: (event: Omit<CalendarEvent, 'id'> & { id?: string }) => void;
  initialView?: 'month' | 'week' | 'day' | 'agenda';
  initialDate?: Date;
  className?: string;
  showOnlyMyEvents?: boolean;

  // AI dev note: External state control (repassado do CalendarTemplateWithData)
  externalCurrentDate?: Date;
  externalCurrentView?: CalendarView;
  onExternalDateChange?: (date: Date) => void;
  onExternalViewChange?: (view: CalendarView) => void;

  // Permissions - passed from parent to avoid hardcoded overrides
  canCreateEvents?: boolean;
  canEditEvents?: boolean;
  canDeleteEvents?: boolean;
  canViewAllEvents?: boolean;

  // Navigation handlers
  onPatientClick?: (patientId: string | null) => void;
  onProfessionalClick?: (professionalId: string) => void;
}

export const ProfissionalCalendarTemplate =
  React.memo<ProfissionalCalendarTemplateProps>(
    ({
      currentUser,
      events,
      onEventSave,
      initialView = 'day', // Profissional typically prefers day view
      initialDate = new Date(),
      className,
      showOnlyMyEvents = true,
      // AI dev note: External state control
      externalCurrentDate,
      externalCurrentView,
      onExternalDateChange,
      onExternalViewChange,
      canCreateEvents = false,
      canEditEvents = true,
      canDeleteEvents = true,
      canViewAllEvents = false,
      onPatientClick,
      onProfessionalClick,
    }) => {
      // AI dev note: Estados para filtros completos
      const [selectedPatient, setSelectedPatient] = useState<string>('');
      const [selectedTipoServico, setSelectedTipoServico] =
        useState<string>('all');
      const [selectedStatusConsulta, setSelectedStatusConsulta] =
        useState<string>('all');
      const [selectedStatusPagamento, setSelectedStatusPagamento] =
        useState<string>('all');

      // AI dev note: Filtrar eventos do profissional com todos os filtros disponíveis
      const getFilteredEvents = useMemo(() => {
        let filteredEvents = [...events];

        // AI dev note: Filtrar para mostrar apenas eventos do próprio profissional
        if (showOnlyMyEvents) {
          filteredEvents = filteredEvents.filter((event) => {
            const metadata = event.metadata as {
              profissionalId?: string;
              [key: string]: unknown;
            };
            return (
              metadata?.profissionalId === currentUser.id ||
              event.attendees?.includes(currentUser.email)
            );
          });
        }

        // AI dev note: Filtrar por paciente se selecionado
        if (selectedPatient) {
          filteredEvents = filteredEvents.filter((event) => {
            const metadata = event.metadata as { pacienteId?: string };
            return metadata?.pacienteId === selectedPatient;
          });
        }

        // AI dev note: Filtrar por tipo de serviço
        if (selectedTipoServico && selectedTipoServico !== 'all') {
          filteredEvents = filteredEvents.filter((event) => {
            const metadata = event.metadata as { tipoServicoId?: string };
            return metadata?.tipoServicoId === selectedTipoServico;
          });
        }

        // AI dev note: Filtrar por status de consulta
        if (selectedStatusConsulta && selectedStatusConsulta !== 'all') {
          filteredEvents = filteredEvents.filter((event) => {
            const metadata = event.metadata as {
              appointmentData?: { status_consulta_id?: string };
            };
            return (
              metadata?.appointmentData?.status_consulta_id ===
              selectedStatusConsulta
            );
          });
        }

        // AI dev note: Filtrar por status de pagamento
        if (selectedStatusPagamento && selectedStatusPagamento !== 'all') {
          filteredEvents = filteredEvents.filter((event) => {
            const metadata = event.metadata as {
              appointmentData?: { status_pagamento_id?: string };
            };
            return (
              metadata?.appointmentData?.status_pagamento_id ===
              selectedStatusPagamento
            );
          });
        }

        return filteredEvents;
      }, [
        events,
        showOnlyMyEvents,
        currentUser.id,
        currentUser.email,
        selectedPatient,
        selectedTipoServico,
        selectedStatusConsulta,
        selectedStatusPagamento,
      ]);

      const handleEventSave = (
        event: Omit<CalendarEvent, 'id'> & { id?: string }
      ) => {
        // Add professional metadata
        const professionalEvent = {
          ...event,
          metadata: {
            ...event.metadata,
            profissionalId: currentUser.id,
            createdBy: currentUser.id,
            createdAt: new Date(),
          },
        };

        onEventSave(professionalEvent);
      };

      // AI dev note: Função para limpar todos os filtros
      const clearFilters = () => {
        setSelectedPatient('');
        setSelectedTipoServico('all');
        setSelectedStatusConsulta('all');
        setSelectedStatusPagamento('all');
      };

      return (
        <div
          className={cn(
            'profissional-calendar-template w-full h-full flex flex-col',
            className
          )}
        >
          {/* AI dev note: Filtros completos reutilizáveis (sem filtro de profissional) */}
          <CalendarFilters
            selectedProfessional="all"
            selectedPatient={selectedPatient}
            selectedTipoServico={selectedTipoServico}
            selectedStatusConsulta={selectedStatusConsulta}
            selectedStatusPagamento={selectedStatusPagamento}
            onProfessionalChange={() => {}}
            onPatientChange={setSelectedPatient}
            onTipoServicoChange={setSelectedTipoServico}
            onStatusConsultaChange={setSelectedStatusConsulta}
            onStatusPagamentoChange={setSelectedStatusPagamento}
            onClearFilters={clearFilters}
            showProfessionalFilter={false}
            eventCount={getFilteredEvents.length}
          />

          {/* Main Calendar */}
          <div className="flex-1 min-h-0">
            <CalendarTemplate
              events={getFilteredEvents}
              onEventSave={handleEventSave}
              initialView={initialView}
              initialDate={initialDate}
              externalCurrentDate={externalCurrentDate}
              externalCurrentView={externalCurrentView}
              onExternalDateChange={onExternalDateChange}
              onExternalViewChange={onExternalViewChange}
              className="w-full max-w-none"
              userRole={currentUser.role}
              onPatientClick={onPatientClick}
              onProfessionalClick={onProfessionalClick}
              canCreateEvents={canCreateEvents}
              canEditEvents={canEditEvents}
              canDeleteEvents={canDeleteEvents}
              canViewAllEvents={canViewAllEvents}
            />
          </div>
        </div>
      );
    }
  );
