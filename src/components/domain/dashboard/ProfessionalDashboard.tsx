import React from 'react';
import { Button } from '@/components/primitives/button';
import {
  ProfessionalMetrics,
  CurrentAppointments,
  ConsultationsToEvolve,
  WeekBirthdays,
} from '@/components/composed';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfessionalMetrics } from '@/hooks/useProfessionalMetrics';
import type {
  UpcomingAppointment,
  ConsultationToEvolve,
  MaterialRequest,
  CurrentWindowAppointment,
} from '@/lib/professional-dashboard-api';
import { PageHeader } from '@/components/composed/PageHeader';

// AI dev note: ProfessionalDashboard - Componente Domain que combina Composed
// Dashboard específico para role profissional com dados reais do Supabase
// Gráfico de faturamento foi movido para Financeiro > Gráfico Anual

interface ProfessionalDashboardProps {
  professionalId: string;
  professionalName: string;
  onAppointmentClick?: (appointment: UpcomingAppointment) => void;
  onCurrentAppointmentClick?: (appointment: CurrentWindowAppointment) => void;
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
    onCurrentAppointmentClick,
    onConsultationClick,
    onCreateEvolutionClick,
    // onMaterialRequestClick / onCreateMaterialRequest: ver nota no render
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
      currentWindowAppointments,
      consultationsToEvolve,
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
        <PageHeader
          title={`Bem-vindo, ${professionalName}!`}
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={loading}
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              {loading ? 'Atualizando...' : 'Atualizar'}
            </Button>
          }
        />

        {/* AI dev note: Atendimentos Atuais - janela de 3 atendimentos (anterior, atual, próximo) */}
        {/* Inclui "Ver mais atendimentos" para expandir os próximos */}
        <CurrentAppointments
          appointments={currentWindowAppointments}
          upcomingAppointments={upcomingAppointments}
          loading={loading}
          error={error}
          onAppointmentClick={onCurrentAppointmentClick || onAppointmentClick}
          userRole={userRole}
        />

        {/* Métricas principais */}
        <ProfessionalMetrics
          metrics={metrics}
          loading={loading}
          error={error}
        />

        {/* Aniversários da semana */}
        <WeekBirthdays maxItems={20} />

        {/* AI dev note: MaterialRequestCard (solicitação de material) fora do
            dashboard enquanto a funcionalidade não existe — o card só mostrava
            "Funcionalidade em Desenvolvimento" e dois botões sem efeito.
            Props materialRequests/onMaterialRequestClick/onCreateMaterialRequest
            seguem aceitas para religar quando ficar pronta. */}

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
            showValues={false}
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
