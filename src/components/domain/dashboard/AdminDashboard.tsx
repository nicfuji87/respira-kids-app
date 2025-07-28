import React from 'react';
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
import { cn } from '@/lib/utils';
import { useAdminMetrics } from '@/hooks/useAdminMetrics';

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

    return (
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
                onAppointmentClick={(appointment) => {
                  console.log('Agendamento clicado:', appointment);
                  handleModuleClick('agenda');
                }}
              />
              {upcomingAppointments.length >= appointmentsLimit && (
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
              onConsultationClick={(consultation) => {
                console.log('Consulta clicada:', consultation);
                handleModuleClick('patients');
              }}
              onCreateEvolutionClick={(consultationId) => {
                console.log('Criar evolução:', consultationId);
                handleModuleClick('patients');
              }}
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
    );
  }
);

AdminDashboard.displayName = 'AdminDashboard';
