import React, { useState } from 'react';
import { Bell, Activity } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import {
  FaturamentoChart,
  AppointmentsList,
  ConsultationsToEvolve,
  MaterialRequestCard,
  ProfessionalFilter,
} from '@/components/composed';
import { AppointmentDetailsManager } from '@/components/domain/calendar';
import { cn } from '@/lib/utils';
import { useAdminMetrics } from '@/hooks/useAdminMetrics';
import { useCalendarFormData } from '@/hooks/useCalendarData';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchAgendamentoById,
  updatePaymentStatus,
  updateNfeLink,
} from '@/lib/calendar-services';
import type {
  UpcomingAppointment,
  ConsultationToEvolve,
} from '@/lib/professional-dashboard-api';
import type { SupabaseAgendamentoCompletoFlat } from '@/types/supabase-calendar';
import type { AppointmentUpdateData } from '@/components/domain/calendar/AppointmentDetailsManager';

// AI dev note: AdminDashboard é específico para role admin da clínica Respira Kids
// Interface completa de gestão com métricas, notificações e ações rápidas
// Integrado com Supabase para dados reais de todos os profissionais
// Com filtros por profissional para todos os componentes

interface AdminDashboardProps {
  className?: string;
  onNavigateToModule?: (module: string) => void;
}

export const AdminDashboard = React.memo<AdminDashboardProps>(
  ({ className, onNavigateToModule }) => {
    const { user } = useAuth();
    const { formData } = useCalendarFormData();

    // Estados para modal de detalhes do agendamento
    const [isAppointmentDetailsOpen, setIsAppointmentDetailsOpen] =
      useState(false);
    const [selectedAppointmentData, setSelectedAppointmentData] =
      useState<SupabaseAgendamentoCompletoFlat | null>(null);

    // Calcular datas para métricas (mês atual)
    const getPeriodDates = () => {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      const monthStart = new Date(currentYear, currentMonth, 1);
      const monthEnd = new Date(currentYear, currentMonth + 1, 0);
      return {
        startDate: monthStart.toISOString().split('T')[0],
        endDate: monthEnd.toISOString().split('T')[0],
      };
    };

    const { startDate, endDate } = getPeriodDates();

    // Hook para métricas administrativas (todos os profissionais)
    const {
      metrics,
      upcomingAppointments,
      consultationsToEvolve,
      materialRequests,
      faturamentoComparativo,
      loading,
      error,
      lastUpdate,
      refreshAll,
      professionalFilters,
      setProfessionalFilters,
      appointmentsLimit,
      setAppointmentsLimit,
      hasMoreAppointments,
    } = useAdminMetrics({
      startDate,
      endDate,
      autoRefresh: true,
      refreshInterval: 60, // 1 hora
    });

    const handleModuleClick = (module: string) => {
      if (onNavigateToModule) {
        onNavigateToModule(module);
      }
    };

    const handleLoadMoreAppointments = () => {
      setAppointmentsLimit(appointmentsLimit + 10);
    };

    // Handlers para clique em agendamentos e consultas
    const handleAppointmentClick = async (appointment: UpcomingAppointment) => {
      console.log('Admin Dashboard - Clicou no agendamento:', appointment);

      setIsAppointmentDetailsOpen(true);

      try {
        const appointmentDetails = await fetchAgendamentoById(appointment.id);
        if (appointmentDetails) {
          setSelectedAppointmentData(appointmentDetails);
        } else {
          // Se não conseguir buscar os dados, fechar o modal
          setIsAppointmentDetailsOpen(false);
          console.error('Não foi possível carregar os detalhes do agendamento');
        }
      } catch (error) {
        console.error('Erro ao abrir detalhes do agendamento:', error);
        setIsAppointmentDetailsOpen(false);
      }
    };

    const handleConsultationClick = async (
      consultation: ConsultationToEvolve
    ) => {
      console.log('Admin Dashboard - Clicou na consulta:', consultation);

      setIsAppointmentDetailsOpen(true);

      try {
        const appointmentDetails = await fetchAgendamentoById(consultation.id);
        if (appointmentDetails) {
          setSelectedAppointmentData(appointmentDetails);
        } else {
          // Se não conseguir buscar os dados, fechar o modal
          setIsAppointmentDetailsOpen(false);
          console.error('Não foi possível carregar os detalhes da consulta');
        }
      } catch (error) {
        console.error('Erro ao abrir detalhes da consulta:', error);
        setIsAppointmentDetailsOpen(false);
      }
    };

    const handleCreateEvolutionClick = async (consultationId: string) => {
      console.log('Admin Dashboard - Criar evolução para:', consultationId);

      setIsAppointmentDetailsOpen(true);

      try {
        const appointmentDetails = await fetchAgendamentoById(consultationId);
        if (appointmentDetails) {
          setSelectedAppointmentData(appointmentDetails);
        } else {
          // Se não conseguir buscar os dados, fechar o modal
          setIsAppointmentDetailsOpen(false);
          console.error(
            'Não foi possível carregar os detalhes da consulta para evolução'
          );
        }
      } catch (error) {
        console.error(
          'Erro ao abrir detalhes da consulta para evolução:',
          error
        );
        setIsAppointmentDetailsOpen(false);
      }
    };

    // Handlers do modal de detalhes do agendamento
    const handleAppointmentDetailsClose = () => {
      setIsAppointmentDetailsOpen(false);
      setSelectedAppointmentData(null);
    };

    const handleAppointmentDetailsSave = async (
      data: AppointmentUpdateData
    ) => {
      try {
        console.log(
          'Admin Dashboard - Salvando alterações do agendamento:',
          data
        );
        // O AppointmentDetailsManager já tem sua própria lógica de salvamento
        // Aqui podemos adicionar refresh dos dados se necessário
        refreshAll(); // Atualizar dados após salvar
      } catch (error) {
        console.error('Erro ao salvar alterações do agendamento:', error);
      }
    };

    // Handlers para ações de pagamento
    const handlePaymentAction = async (appointmentId: string) => {
      try {
        console.log(
          '🔄 Admin Dashboard - Ação de pagamento para agendamento:',
          appointmentId
        );

        // Buscar ID do status "pago"
        const pagoStatusId = 'bb982df2-56ca-4520-870f-659f7581ab0a';

        await updatePaymentStatus(appointmentId, pagoStatusId);

        // Recarregar dados do agendamento se necessário
        if (selectedAppointmentData?.id === appointmentId) {
          const updatedAppointment = await fetchAgendamentoById(appointmentId);
          setSelectedAppointmentData(updatedAppointment);
        }

        // Atualizar dados do dashboard
        refreshAll();
      } catch (error) {
        console.error('Erro na ação de pagamento:', error);
      }
    };

    const handleNfeAction = async (appointmentId: string, linkNfe?: string) => {
      try {
        if (linkNfe) {
          // Se já tem NFe, visualizar
          console.log('👁️ Admin Dashboard - Visualizando NFe:', linkNfe);
          window.open(linkNfe, '_blank');
        } else {
          // Se não tem NFe, emitir
          console.log(
            '📄 Admin Dashboard - Emitindo NFe para agendamento:',
            appointmentId
          );

          // TODO: Implementar integração com sistema de NFe
          const mockNfeLink = `https://nfe.exemplo.com/${appointmentId}`;

          await updateNfeLink(appointmentId, mockNfeLink);

          // Recarregar dados do agendamento se necessário
          if (selectedAppointmentData?.id === appointmentId) {
            const updatedAppointment =
              await fetchAgendamentoById(appointmentId);
            setSelectedAppointmentData(updatedAppointment);
          }

          // Atualizar dados do dashboard
          refreshAll();
        }
      } catch (error) {
        console.error('Erro na ação de NFe:', error);
      }
    };

    // Handlers para navegação de pessoas
    const handlePatientClick = (patientId: string | null) => {
      if (patientId && onNavigateToModule) {
        onNavigateToModule(`pacientes/${patientId}`);
      }
    };

    const handleProfessionalClick = (professionalId: string) => {
      if (onNavigateToModule) {
        onNavigateToModule(`pessoa/${professionalId}`);
      }
    };

    return (
      <>
        <div className={cn('space-y-6 p-6', className)}>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-roxo-titulo respira-text-gradient">
                Dashboard Administrativo
              </h1>
              <p className="text-muted-foreground mt-1">
                Visão geral da Clínica Respira Kids
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" className="gap-2">
                <Bell className="h-4 w-4" />
                {(metrics?.aprovacoesPendentes || 0) +
                  (materialRequests?.length || 0)}{' '}
                pendentes
              </Button>
              <Button
                size="sm"
                className="respira-gradient"
                onClick={() => handleModuleClick('reports')}
              >
                <Activity className="h-4 w-4 mr-2" />
                Relatório Geral
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={refreshAll}
                disabled={loading}
                className="gap-2"
              >
                {loading ? 'Atualizando...' : 'Atualizar'}
              </Button>
            </div>
          </div>

          {/* Error State */}
          {error && (
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <p className="text-destructive text-sm">{error}</p>
              </CardContent>
            </Card>
          )}

          {/* Gráfico de Faturamento Anual com Filtro */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle>Gráfico Anual de Faturamento</CardTitle>
                  <CardDescription>
                    Faturamento consolidado por mês com comparativo anual
                  </CardDescription>
                </div>
                <ProfessionalFilter
                  selectedProfessionals={professionalFilters.faturamento}
                  onSelectionChange={(professionalIds) =>
                    setProfessionalFilters({ faturamento: professionalIds })
                  }
                  placeholder="Filtrar por profissional..."
                />
              </div>
            </CardHeader>
            <CardContent>
              <FaturamentoChart
                data={faturamentoComparativo}
                loading={loading}
                error={error}
              />
            </CardContent>
          </Card>

          {/* Grid de Componentes do Dashboard */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Próximos Agendamentos com Filtro */}
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <CardTitle>Próximos Agendamentos</CardTitle>
                      <CardDescription>
                        Consultas agendadas para os próximos 7 dias
                      </CardDescription>
                    </div>
                  </div>
                  <ProfessionalFilter
                    selectedProfessionals={professionalFilters.agendamentos}
                    onSelectionChange={(professionalIds) =>
                      setProfessionalFilters({ agendamentos: professionalIds })
                    }
                    placeholder="Filtrar por profissional..."
                  />
                </div>
              </CardHeader>
              <CardContent>
                <AppointmentsList
                  appointments={upcomingAppointments}
                  loading={loading}
                  error={error}
                  onAppointmentClick={handleAppointmentClick}
                />
                {hasMoreAppointments && (
                  <div className="mt-4 text-center">
                    <Button
                      variant="ghost"
                      onClick={handleLoadMoreAppointments}
                      disabled={loading}
                    >
                      Ver mais agendamentos
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Solicitação de Material */}
            <MaterialRequestCard
              requests={materialRequests}
              loading={loading}
              error={error}
              onRequestClick={(request) => {
                console.log('Solicitação clicada:', request);
                handleModuleClick('stock');
              }}
              onCreateRequest={() => {
                console.log('Criar nova solicitação');
                handleModuleClick('stock');
              }}
            />
          </div>

          {/* Consultas a Evoluir com Filtro */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle>Consultas a Evoluir</CardTitle>
                  <CardDescription>
                    Consultas finalizadas que precisam de relatório de evolução
                  </CardDescription>
                </div>
                <ProfessionalFilter
                  selectedProfessionals={professionalFilters.consultas}
                  onSelectionChange={(professionalIds) =>
                    setProfessionalFilters({ consultas: professionalIds })
                  }
                  placeholder="Filtrar por profissional..."
                />
              </div>
            </CardHeader>
            <CardContent>
              <ConsultationsToEvolve
                consultations={consultationsToEvolve}
                loading={loading}
                error={error}
                onConsultationClick={handleConsultationClick}
                onCreateEvolutionClick={handleCreateEvolutionClick}
                userRole={
                  user?.pessoa?.role as
                    | 'admin'
                    | 'profissional'
                    | 'secretaria'
                    | null
                }
              />
            </CardContent>
          </Card>

          {/* Footer com informações */}
          {lastUpdate && (
            <div className="text-center text-xs text-muted-foreground">
              Última atualização:{' '}
              {new Intl.DateTimeFormat('pt-BR', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              }).format(lastUpdate)}
            </div>
          )}
        </div>

        {/* Modal de detalhes do agendamento */}
        <AppointmentDetailsManager
          isOpen={isAppointmentDetailsOpen}
          onClose={handleAppointmentDetailsClose}
          appointment={selectedAppointmentData}
          userRole={
            user?.pessoa?.role as 'admin' | 'profissional' | 'secretaria' | null
          }
          locaisAtendimento={formData.locaisAtendimento || []}
          isLoadingLocais={false}
          onSave={handleAppointmentDetailsSave}
          onPaymentAction={handlePaymentAction}
          onNfeAction={handleNfeAction}
          onPatientClick={handlePatientClick}
          onProfessionalClick={handleProfessionalClick}
        />
      </>
    );
  }
);

AdminDashboard.displayName = 'AdminDashboard';
