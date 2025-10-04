import React from 'react';
import { Button } from '@/components/primitives/button';
import {
  ProfessionalMetrics,
  AppointmentsList,
  ConsultationsToEvolve,
  MaterialRequestCard,
  FaturamentoChart,
} from '@/components/composed';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfessionalMetrics } from '@/hooks/useProfessionalMetrics';
import type {
  UpcomingAppointment,
  ConsultationToEvolve,
  MaterialRequest,
} from '@/lib/professional-dashboard-api';

// AI dev note: ProfessionalDashboard - Componente Domain que combina Composed
// Dashboard específico para role profissional com dados reais do Supabase

interface ProfessionalDashboardProps {
  professionalId: string;
  professionalName: string;
  onAppointmentClick?: (appointment: UpcomingAppointment) => void;
  onConsultationClick?: (consultation: ConsultationToEvolve) => void;
  onCreateEvolutionClick?: (consultationId: string) => void;
  onMaterialRequestClick?: (request: MaterialRequest) => void;
  onCreateMaterialRequest?: () => void;
  className?: string;
  userRole?: 'admin' | 'profissional' | 'secretaria' | null;
}

export const ProfessionalDashboard = React.memo<ProfessionalDashboardProps>(
  ({
    professionalId,
    professionalName,
    onAppointmentClick,
    onConsultationClick,
    onCreateEvolutionClick,
    onMaterialRequestClick,
    onCreateMaterialRequest,
    className,
    userRole,
  }) => {
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

    // Hook para métricas do profissional
    const {
      metrics,
      upcomingAppointments,
      consultationsToEvolve,
      materialRequests,
      loading,
      error,
      lastUpdate,
      refreshAll,
    } = useProfessionalMetrics({
      professionalId,
      startDate,
      endDate,
      autoRefresh: true,
      refreshInterval: 5, // 5 minutos - Otimizado para melhor performance
    });

    const handleRefresh = async () => {
      await refreshAll();
    };

    return (
      <div className={cn('space-y-6', className)}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Bem-vindo, {professionalName}!
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {/* Botão de refresh */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              {loading ? 'Atualizando...' : 'Atualizar'}
            </Button>
          </div>
        </div>

        {/* Métricas principais */}
        <ProfessionalMetrics
          metrics={metrics}
          loading={loading}
          error={error}
        />

        {/* Gráfico de faturamento */}
        <FaturamentoChart />

        {/* Grid principal */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Próximos agendamentos */}
          <AppointmentsList
            appointments={upcomingAppointments}
            loading={loading}
            error={error}
            onAppointmentClick={onAppointmentClick}
            userRole={userRole}
            maxItems={5}
          />

          {/* Solicitação de material */}
          <MaterialRequestCard
            requests={materialRequests}
            loading={loading}
            error={error}
            onRequestClick={onMaterialRequestClick}
            onCreateRequest={onCreateMaterialRequest}
          />
        </div>

        {/* Consultas a evoluir */}
        <div id="consultations-to-evolve">
          <ConsultationsToEvolve
            consultations={consultationsToEvolve}
            loading={loading}
            error={error}
            onConsultationClick={onConsultationClick}
            onCreateEvolutionClick={onCreateEvolutionClick}
            userRole={userRole}
            maxItems={5} // Mostrar 5 consultas inicialmente, com botão "Ver mais"
          />
        </div>

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

ProfessionalDashboard.displayName = 'ProfessionalDashboard';
