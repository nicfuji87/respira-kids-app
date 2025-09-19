import React, { useCallback } from 'react';
import { Button } from '@/components/primitives/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Skeleton } from '@/components/primitives/skeleton';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import {
  Clock,
  AlertTriangle,
  RefreshCw,
  Calendar,
  Activity,
  Stethoscope,
} from 'lucide-react';
import { useSecretariaMetrics } from '@/hooks/useSecretariaMetrics';
import { AppointmentsList } from '@/components/composed/AppointmentsList';
import { ConsultationsToEvolve } from '@/components/composed/ConsultationsToEvolve';
import { cn } from '@/lib/utils';
import type {
  UpcomingAppointment,
  ConsultationToEvolve,
} from '@/lib/secretaria-dashboard-api';

// AI dev note: SecretariaDashboard - Componente Domain específico para role secretaria
// Interface operacional focada em quantidades e alertas, sem valores financeiros globais
// Filtra dados apenas pelos profissionais autorizados via permissoes_agendamento
// Reutiliza componentes Composed existentes com adaptações para permissões

interface SecretariaDashboardProps {
  secretariaId: string;
  secretariaName: string;
  onAppointmentClick?: (appointment: UpcomingAppointment) => void;
  onConsultationClick?: (consultation: ConsultationToEvolve) => void;
  onCreateEvolutionClick?: (consultationId: string) => void;
  className?: string;
  userRole?: 'admin' | 'profissional' | 'secretaria' | null;
}

export const SecretariaDashboard = React.memo<SecretariaDashboardProps>(
  ({
    secretariaId,
    secretariaName,
    onAppointmentClick,
    onConsultationClick,
    onCreateEvolutionClick,
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

    // Hook para métricas da secretaria
    const {
      metrics,
      upcomingAppointments,
      consultationsToEvolve,
      volumeComparativo,
      loading,
      error,
      lastUpdate,
      refreshAll,
    } = useSecretariaMetrics({
      secretariaId,
      startDate,
      endDate,
      autoRefresh: true,
      refreshInterval: 30, // 30 minutos - mais frequente para secretaria
    });

    // Função para saudação personalizada
    const getGreeting = () => {
      const now = new Date();
      const hour = now.getHours();

      if (hour < 12) return 'Bom dia';
      if (hour < 18) return 'Boa tarde';
      return 'Boa noite';
    };

    // Extrair primeiro nome
    const firstName = secretariaName.split(' ')[0];

    const handleRefresh = async () => {
      await refreshAll();
    };

    const handleAppointmentClick = useCallback(
      (appointment: UpcomingAppointment) => {
        onAppointmentClick?.(appointment);
      },
      [onAppointmentClick]
    );

    const handleConsultationClick = useCallback(
      (consultation: ConsultationToEvolve) => {
        onConsultationClick?.(consultation);
      },
      [onConsultationClick]
    );

    const handleCreateEvolutionClick = useCallback(
      (consultationId: string) => {
        onCreateEvolutionClick?.(consultationId);
      },
      [onCreateEvolutionClick]
    );

    // Loading state
    if (loading && !metrics) {
      return (
        <div className={cn('space-y-6', className)}>
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-9 w-24" />
          </div>

          {/* Métricas skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="pb-2">
                  <div className="h-4 bg-muted rounded w-3/4"></div>
                </CardHeader>
                <CardContent>
                  <div className="h-8 bg-muted rounded w-1/2 mb-2"></div>
                  <div className="h-3 bg-muted rounded w-full"></div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Lists skeleton */}
          <div className="grid gap-6 lg:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-6 bg-muted rounded w-48"></div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {Array.from({ length: 3 }).map((_, j) => (
                    <div key={j} className="h-16 bg-muted rounded"></div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className={cn('space-y-6', className)}>
        {error && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* AI dev note: Header personalizado para secretaria */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 md:gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-roxo-titulo respira-text-gradient">
              {getGreeting()}, {firstName}!
            </h1>
            <p className="text-sm text-muted-foreground">
              Dashboard operacional - Secretaria
            </p>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={loading}
              className="gap-2 text-xs md:text-sm"
            >
              <RefreshCw
                className={`h-3 w-3 md:h-4 md:w-4 ${
                  loading ? 'animate-spin' : ''
                }`}
              />
              {loading ? 'Atualizando...' : 'Atualizar'}
            </Button>
            {lastUpdate && (
              <span className="text-xs text-muted-foreground hidden sm:block">
                Última atualização: {lastUpdate.toLocaleTimeString('pt-BR')}
              </span>
            )}
          </div>
        </div>

        {/* AI dev note: Métricas operacionais (sem valores financeiros) */}
        {metrics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Consultas do Mês */}
            <Card className="bg-azul-respira/5 border-azul-respira/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-azul-respira flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Consultas do Mês
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-azul-respira">
                  {metrics.consultasNoMes}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  {metrics.comparativos.consultasVariacao.tipo ===
                    'crescimento' && (
                    <span className="text-green-600">
                      +{metrics.comparativos.consultasVariacao.absoluta} vs mês
                      anterior
                    </span>
                  )}
                  {metrics.comparativos.consultasVariacao.tipo === 'queda' && (
                    <span className="text-red-600">
                      {metrics.comparativos.consultasVariacao.absoluta} vs mês
                      anterior
                    </span>
                  )}
                  {metrics.comparativos.consultasVariacao.tipo ===
                    'estavel' && (
                    <span className="text-gray-600">
                      Estável vs mês anterior
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Próximos Agendamentos */}
            <Card className="bg-green-50 border-green-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-green-700 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Próximos 7 Dias
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-700">
                  {metrics.proximosAgendamentos}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Agendamentos confirmados
                </div>
              </CardContent>
            </Card>

            {/* Consultas a Evoluir */}
            <Card className="bg-amber-50 border-amber-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-amber-700 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Pendentes Evolução
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-700">
                  {metrics.consultasAEvoluir}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Consultas finalizadas
                </div>
              </CardContent>
            </Card>

            {/* Profissionais Autorizados */}
            <Card className="bg-purple-50 border-purple-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-purple-700 flex items-center gap-2">
                  <Stethoscope className="h-4 w-4" />
                  Profissionais
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-700">
                  {metrics.profissionaisAutorizados}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Autorizados para você
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* AI dev note: Seção de listas operacionais */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Próximos Agendamentos */}
          <AppointmentsList
            appointments={upcomingAppointments}
            loading={loading}
            title="Próximos Agendamentos"
            emptyMessage="Nenhum agendamento nos próximos 7 dias"
            onAppointmentClick={handleAppointmentClick}
            userRole={userRole}
            showProfessionalName={true} // Secretaria vê nome do profissional
            showValues={false} // Secretaria não vê valores
          />

          {/* Consultas Pendentes de Evolução */}
          <ConsultationsToEvolve
            consultations={consultationsToEvolve}
            loading={loading}
            title="Consultas Pendentes de Evolução"
            emptyMessage="Nenhuma consulta pendente de evolução"
            onConsultationClick={handleConsultationClick}
            onCreateEvolutionClick={handleCreateEvolutionClick}
            userRole={userRole}
            showProfessionalName={true} // Secretaria vê nome do profissional
            showValues={false} // Secretaria não vê valores
          />
        </div>

        {/* AI dev note: Gráfico de volume operacional (sem valores $) */}
        {volumeComparativo && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Volume de Atendimentos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-azul-respira">
                    {volumeComparativo.resumoAno.totalConsultas}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Total no Ano
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {volumeComparativo.resumoAno.totalComEvolucao}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Com Evolução
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-amber-600">
                    {volumeComparativo.resumoAno.totalPendentesEvolucao}
                  </div>
                  <div className="text-sm text-muted-foreground">Pendentes</div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground text-center">
                {metrics?.observacao}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }
);

SecretariaDashboard.displayName = 'SecretariaDashboard';
