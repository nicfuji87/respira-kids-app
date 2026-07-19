import React, { useState, useMemo } from 'react';
import { CalendarTemplate } from './CalendarTemplate';
import { cn } from '@/lib/utils';
import type { CalendarEvent, CalendarView } from '@/types/calendar';
import { CalendarFilters } from '@/components/composed/CalendarFilters';
import { Card } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Filter, X } from 'lucide-react';

// AI dev note: Template específico para admins - sem painéis de estatísticas
// Admins que fazem atendimentos (pode_atender=true) têm acesso a Agendas Compartilhadas
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'admin';
  podeAtender?: boolean; // Se true, mostra tab de Agenda Compartilhada
}

export interface AdminCalendarTemplateProps {
  currentUser: AdminUser;
  events: CalendarEvent[];
  onEventSave: (event: Omit<CalendarEvent, 'id'> & { id?: string }) => void;
  // AI dev note: Refresh dos eventos após criar/editar consulta (repassado ao CalendarTemplate)
  onRefreshNeeded?: () => void;
  initialView?: 'month' | 'week' | 'day' | 'agenda';
  initialDate?: Date;
  className?: string;
  showAllProfessionals?: boolean;
  showSystemEvents?: boolean;

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

export const AdminCalendarTemplate = React.memo<AdminCalendarTemplateProps>(
  ({
    currentUser,
    events,
    onEventSave,
    onRefreshNeeded,
    initialView = 'month',
    initialDate = new Date(),
    className,
    showAllProfessionals = true,
    showSystemEvents = true,
    // AI dev note: External state control
    externalCurrentDate,
    externalCurrentView,
    onExternalDateChange,
    onExternalViewChange,
    canCreateEvents = true,
    canEditEvents = true,
    canDeleteEvents = true,
    canViewAllEvents = true,
    onPatientClick,
    onProfessionalClick,
  }) => {
    // AI dev note: Estados para filtros do admin - suporta multi-seleção
    const [selectedProfessional, setSelectedProfessional] =
      useState<string>('all');
    const [selectedPatient, setSelectedPatient] = useState<string>('');
    const [selectedTipoServico, setSelectedTipoServico] = useState<string[]>(
      []
    );
    const [selectedLocal, setSelectedLocal] = useState<string[]>([]);
    const [selectedStatusConsulta, setSelectedStatusConsulta] = useState<
      string[]
    >([]);
    const [selectedStatusPagamento, setSelectedStatusPagamento] = useState<
      string[]
    >([]);
    // AI dev note: Estado do filtro por Empresa de Faturamento (multi-seleção)
    const [selectedEmpresa, setSelectedEmpresa] = useState<string[]>([]);

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

      // AI dev note: Filtrar por tipo de serviço (multi-seleção)
      if (selectedTipoServico.length > 0) {
        filteredEvents = filteredEvents.filter((event) => {
          const metadata = event.metadata as { tipoServicoId?: string };
          return (
            metadata?.tipoServicoId &&
            selectedTipoServico.includes(metadata.tipoServicoId)
          );
        });
      }

      // AI dev note: Filtrar por local de atendimento (multi-seleção)
      if (selectedLocal.length > 0) {
        filteredEvents = filteredEvents.filter((event) => {
          const metadata = event.metadata as {
            appointmentData?: { local_id?: string };
          };
          return (
            metadata?.appointmentData?.local_id &&
            selectedLocal.includes(metadata.appointmentData.local_id)
          );
        });
      }

      // AI dev note: Filtrar por status de consulta (multi-seleção)
      if (selectedStatusConsulta.length > 0) {
        filteredEvents = filteredEvents.filter((event) => {
          const metadata = event.metadata as {
            appointmentData?: { status_consulta_id?: string };
          };
          return (
            metadata?.appointmentData?.status_consulta_id &&
            selectedStatusConsulta.includes(
              metadata.appointmentData.status_consulta_id
            )
          );
        });
      }

      // AI dev note: Filtrar por status de pagamento (multi-seleção)
      if (selectedStatusPagamento.length > 0) {
        filteredEvents = filteredEvents.filter((event) => {
          const metadata = event.metadata as {
            appointmentData?: { status_pagamento_id?: string };
          };
          return (
            metadata?.appointmentData?.status_pagamento_id &&
            selectedStatusPagamento.includes(
              metadata.appointmentData.status_pagamento_id
            )
          );
        });
      }

      // AI dev note: Filtrar por empresa de faturamento (multi-seleção).
      // O ID da empresa vem em metadata.appointmentData.empresa_fatura_id
      // (vw_agendamentos_completos -> mapAgendamentoFlatToCalendarEvent).
      if (selectedEmpresa.length > 0) {
        filteredEvents = filteredEvents.filter((event) => {
          const metadata = event.metadata as {
            appointmentData?: { empresa_fatura_id?: string };
          };
          return (
            metadata?.appointmentData?.empresa_fatura_id &&
            selectedEmpresa.includes(metadata.appointmentData.empresa_fatura_id)
          );
        });
      }

      if (!showAllProfessionals) {
        // Filter to specific professionals if needed
        // Implementation would depend on specific requirements
      }

      if (!showSystemEvents) {
        // Filter out system events if needed
        filteredEvents = filteredEvents.filter(
          (event) => !event.metadata?.isSystemEvent
        );
      }

      return filteredEvents;
    }, [
      events,
      selectedProfessional,
      selectedPatient,
      selectedTipoServico,
      selectedLocal,
      selectedStatusConsulta,
      selectedStatusPagamento,
      selectedEmpresa,
      showAllProfessionals,
      showSystemEvents,
    ]);

    const handleEventSave = (
      event: Omit<CalendarEvent, 'id'> & { id?: string }
    ) => {
      const adminEvent = {
        ...event,
        metadata: {
          ...event.metadata,
          createdBy: currentUser.id,
          createdAt: new Date(),
        },
      };

      onEventSave(adminEvent);
    };

    // AI dev note: Função para limpar todos os filtros
    const clearFilters = () => {
      setSelectedProfessional('all');
      setSelectedPatient('');
      setSelectedTipoServico([]);
      setSelectedLocal([]);
      setSelectedStatusConsulta([]);
      setSelectedStatusPagamento([]);
      setSelectedEmpresa([]);
    };

    return (
      <div className={cn('admin-calendar-template w-full', className)}>
        {/* AI dev note: Seção de filtros reutilizável para admin */}
        <CalendarFilters
          selectedProfessional={selectedProfessional}
          selectedPatient={selectedPatient}
          selectedTipoServico={selectedTipoServico}
          selectedLocal={selectedLocal}
          selectedStatusConsulta={selectedStatusConsulta}
          selectedStatusPagamento={selectedStatusPagamento}
          selectedEmpresa={selectedEmpresa}
          onProfessionalChange={setSelectedProfessional}
          onPatientChange={setSelectedPatient}
          onTipoServicoChange={(value) =>
            setSelectedTipoServico(Array.isArray(value) ? value : [])
          }
          onLocalChange={(value) =>
            setSelectedLocal(Array.isArray(value) ? value : [])
          }
          onStatusConsultaChange={(value) =>
            setSelectedStatusConsulta(Array.isArray(value) ? value : [])
          }
          onStatusPagamentoChange={(value) =>
            setSelectedStatusPagamento(Array.isArray(value) ? value : [])
          }
          onEmpresaChange={(value) =>
            setSelectedEmpresa(Array.isArray(value) ? value : [])
          }
          onClearFilters={clearFilters}
          showProfessionalFilter={true}
          eventCount={getFilteredEvents.length}
        />

        {/* Main Calendar */}
        <div>
          {getFilteredEvents.length === 0 &&
          (selectedProfessional !== 'all' ||
            selectedPatient !== '' ||
            selectedTipoServico.length > 0 ||
            selectedLocal.length > 0 ||
            selectedStatusConsulta.length > 0 ||
            selectedStatusPagamento.length > 0 ||
            selectedEmpresa.length > 0) ? (
            <Card className="flex items-center justify-center">
              <div className="text-center space-y-4 p-8">
                <Filter className="h-12 w-12 text-muted-foreground mx-auto" />
                <div>
                  <h3 className="text-lg font-medium">
                    Nenhum evento encontrado
                  </h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    Não há eventos que correspondam aos filtros selecionados.
                  </p>
                </div>
                <Button variant="outline" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-2" />
                  Limpar filtros
                </Button>
              </div>
            </Card>
          ) : (
            <CalendarTemplate
              events={getFilteredEvents}
              onEventSave={handleEventSave}
              onRefreshNeeded={onRefreshNeeded}
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
              profissionalId={
                currentUser.podeAtender ? currentUser.id : undefined
              }
              userId={currentUser.id}
              showSharedSchedulesTab={currentUser.podeAtender === true}
            />
          )}
        </div>
      </div>
    );
  }
);
