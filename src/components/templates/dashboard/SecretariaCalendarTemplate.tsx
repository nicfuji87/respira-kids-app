import React, { useState, useMemo } from 'react';
import { CalendarTemplate } from './CalendarTemplate';
import { CalendarFilters } from '@/components/composed/CalendarFilters';
import type { CalendarEvent, CalendarView } from '@/types/calendar';

// AI dev note: SecretariaCalendarTemplate combina CalendarTemplate
// Template para secretárias com permissões para visualizar profissionais autorizados

export interface SecretariaUser {
  id: string;
  name: string;
  email: string;
  role: 'secretaria';
  avatar?: string;
  authorizedProfessionals?: string[];
}

export interface SecretariaCalendarTemplateProps {
  // User info
  currentUser: SecretariaUser;

  // Events data
  events: CalendarEvent[];
  onEventSave: (event: Omit<CalendarEvent, 'id'> & { id?: string }) => void;

  // View configuration
  initialView?: CalendarView;
  initialDate?: Date;

  // AI dev note: External state control (repassado do CalendarTemplateWithData)
  externalCurrentDate?: Date;
  externalCurrentView?: CalendarView;
  onExternalDateChange?: (date: Date) => void;
  onExternalViewChange?: (view: CalendarView) => void;

  // Layout
  className?: string;

  // Secretaria features
  availableProfessionals?: {
    id: string;
    name: string;
    specialization?: string;
  }[];

  // Permissions - passed from parent to avoid hardcoded overrides
  canCreateEvents?: boolean;
  canEditEvents?: boolean;
  canDeleteEvents?: boolean;
  canViewAllEvents?: boolean;

  // Navigation handlers
  onPatientClick?: (patientId: string | null) => void;
  onProfessionalClick?: (professionalId: string) => void;
}

export const SecretariaCalendarTemplate =
  React.memo<SecretariaCalendarTemplateProps>(
    ({
      currentUser,
      events,
      onEventSave,
      initialView = 'week', // Secretaria typically prefers week view
      initialDate = new Date(),
      availableProfessionals = [],
      // AI dev note: External state control
      externalCurrentDate,
      externalCurrentView,
      onExternalDateChange,
      onExternalViewChange,
      canCreateEvents = true,
      canEditEvents = true,
      canDeleteEvents = false, // Default for secretaria
      canViewAllEvents = false,
      onPatientClick,
      onProfessionalClick,
    }) => {
      // AI dev note: Estados para filtros completos (igual ao admin)
      const [selectedProfessional, setSelectedProfessional] =
        useState<string>('all');
      const [selectedPatient, setSelectedPatient] = useState<string>('');
      const [selectedTipoServico, setSelectedTipoServico] =
        useState<string>('all');
      const [selectedStatusConsulta, setSelectedStatusConsulta] =
        useState<string>('all');
      const [selectedStatusPagamento, setSelectedStatusPagamento] =
        useState<string>('all');

      // Get authorized professionals
      const getAuthorizedProfessionals = () => {
        if (!currentUser.authorizedProfessionals) {
          return availableProfessionals;
        }

        return availableProfessionals.filter((prof) =>
          currentUser.authorizedProfessionals?.includes(prof.id)
        );
      };

      // AI dev note: Filtrar eventos com todos os filtros disponíveis
      const getFilteredEvents = useMemo(() => {
        let filteredEvents = [...events];

        // AI dev note: Filtrar por profissional se selecionado
        if (selectedProfessional && selectedProfessional !== 'all') {
          filteredEvents = filteredEvents.filter((event) => {
            const metadata = event.metadata as { profissionalId?: string };
            return metadata?.profissionalId === selectedProfessional;
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
        selectedProfessional,
        selectedPatient,
        selectedTipoServico,
        selectedStatusConsulta,
        selectedStatusPagamento,
      ]);

      const handleEventSave = (
        event: Omit<CalendarEvent, 'id'> & { id?: string }
      ) => {
        // Secretaria can save events for authorized professionals
        const secretariaEvent = {
          ...event,
          attendees: event.attendees || [],
          // Add secretaria metadata
          scheduledBy: currentUser.id,
          scheduledAt: new Date(),
        };

        onEventSave(secretariaEvent);
      };

      // AI dev note: Função para limpar todos os filtros
      const clearFilters = () => {
        setSelectedProfessional('all');
        setSelectedPatient('');
        setSelectedTipoServico('all');
        setSelectedStatusConsulta('all');
        setSelectedStatusPagamento('all');
      };

      // Converter profissionais para o formato esperado pelo CalendarFilters
      const professionalsList = getAuthorizedProfessionals().map((prof) => ({
        id: prof.id,
        name: prof.name,
      }));

      return (
        <div className="secretaria-calendar-template w-full h-full flex flex-col">
          {/* AI dev note: Filtros completos reutilizáveis */}
          <CalendarFilters
            selectedProfessional={selectedProfessional}
            selectedPatient={selectedPatient}
            selectedTipoServico={selectedTipoServico}
            selectedStatusConsulta={selectedStatusConsulta}
            selectedStatusPagamento={selectedStatusPagamento}
            onProfessionalChange={setSelectedProfessional}
            onPatientChange={setSelectedPatient}
            onTipoServicoChange={setSelectedTipoServico}
            onStatusConsultaChange={setSelectedStatusConsulta}
            onStatusPagamentoChange={setSelectedStatusPagamento}
            onClearFilters={clearFilters}
            showProfessionalFilter={true}
            availableProfessionals={professionalsList}
            eventCount={getFilteredEvents.length}
          />

          {/* Calendário expandido para ocupar todo espaço restante */}
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
              canCreateEvents={canCreateEvents}
              canEditEvents={canEditEvents}
              canDeleteEvents={canDeleteEvents}
              canViewAllEvents={canViewAllEvents}
              showEventManager={true}
              userRole={currentUser.role}
              onPatientClick={onPatientClick}
              onProfessionalClick={onProfessionalClick}
              className="w-full max-w-none"
            />
          </div>
        </div>
      );
    }
  );

SecretariaCalendarTemplate.displayName = 'SecretariaCalendarTemplate';
