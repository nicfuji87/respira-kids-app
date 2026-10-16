import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/primitives/button';
import { Card, CardContent, CardHeader } from '@/components/primitives/card';
import { Skeleton } from '@/components/primitives/skeleton';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useAdminMetrics } from '@/hooks/useAdminMetrics';
import { useCalendarFormData } from '@/hooks/useCalendarData';
import { ConsultationsToEvolve } from '@/components/composed/ConsultationsToEvolve';
import { CurrentAppointments } from '@/components/composed/CurrentAppointments';
import { ProfessionalFilter } from '@/components/composed/ProfessionalFilter';
import { WeekBirthdays } from '@/components/composed/WeekBirthdays';
import { PediatraRelacionamentoManager } from '@/components/domain/relacionamento';
import { AppointmentDetailsManager } from '@/components/domain/calendar/AppointmentDetailsManager';
import { fetchAgendamentoById } from '@/lib/calendar-services';
import type {
  UpcomingAppointment,
  ConsultationToEvolve,
} from '@/lib/professional-dashboard-api';
import type { SupabaseAgendamentoCompletoFlat } from '@/types/supabase-calendar';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/composed/PageHeader';

// AI dev note: AdminDashboard é específico para role admin da clínica Respira Kids
// Interface completa de gestão com métricas, notificações e ações rápidas
// Integrado com Supabase para dados reais de todos os profissionais
// Com filtros por profissional para todos os componentes

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface AdminDashboardProps {}

export const AdminDashboard: React.FC<AdminDashboardProps> = () => {
  const [selectedProfessionals, setSelectedProfessionals] = useState<string[]>(
    []
  );
  const [isAppointmentDetailsOpen, setIsAppointmentDetailsOpen] =
    useState(false);
  const [selectedAppointmentData, setSelectedAppointmentData] =
    useState<SupabaseAgendamentoCompletoFlat | null>(null);

  const { user } = useAuth();

  // Hook para dados do calendário (locais de atendimento)
  const { formData } = useCalendarFormData();

  const {
    loading,
    error,
    refreshAll,
    upcomingAppointments,
    currentWindowAppointments,
    consultationsToEvolve,
    setProfessionalFilters,
  } = useAdminMetrics({
    startDate: new Date(
      new Date().setMonth(new Date().getMonth() - 1)
    ).toISOString(),
    endDate: new Date().toISOString(),
  });

  // Atualizar filtros quando seleção de profissionais mudar
  useEffect(() => {
    setProfessionalFilters({
      agendamentos: selectedProfessionals,
      consultas: selectedProfessionals,
    });
  }, [selectedProfessionals, setProfessionalFilters]);

  // AI dev note: Função para saudação dinâmica baseada no horário
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  // AI dev note: Extrair primeiro nome do usuário
  const firstName = (user?.pessoa?.nome || 'Usuário').split(' ')[0];

  // Função para buscar dados completos do agendamento
  const fetchAppointmentDetails = useCallback(
    async (
      appointmentId: string
    ): Promise<SupabaseAgendamentoCompletoFlat | null> => {
      try {
        const data = await fetchAgendamentoById(appointmentId);
        return data;
      } catch (error) {
        console.error('Erro ao buscar detalhes do agendamento:', error);
        return null;
      }
    },
    []
  );

  // Função para lidar com clique em consulta
  const handleAppointmentClick = useCallback(
    async (item: UpcomingAppointment | ConsultationToEvolve) => {
      const appointmentData = await fetchAppointmentDetails(item.id);
      if (appointmentData) {
        setSelectedAppointmentData(appointmentData);
        setIsAppointmentDetailsOpen(true);
      }
    },
    [fetchAppointmentDetails]
  );

  const handleAppointmentDetailsClose = () => {
    setIsAppointmentDetailsOpen(false);
    setSelectedAppointmentData(null);
  };

  const handleAppointmentDetailsSave = async () => {
    try {
      // O AppointmentDetailsManager já tem sua própria lógica de salvamento
      // Aqui podemos adicionar refresh dos dados se necessário
      refreshAll(); // Atualizar dados após salvar
    } catch (error) {
      console.error('Erro ao salvar alterações do agendamento:', error);
    }
  };

  const handleEvolutionClick = useCallback(
    async (consultationId: string) => {
      const appointmentData = await fetchAppointmentDetails(consultationId);
      if (appointmentData) {
        setSelectedAppointmentData(appointmentData);
        setIsAppointmentDetailsOpen(true);
      }
    },
    [fetchAppointmentDetails]
  );

  // AI dev note: Preparar dados das métricas principais
  const evolutionCount = consultationsToEvolve?.length || 0;

  // AI dev note: Skeleton loading para o estado inicial
  if (loading && !upcomingAppointments) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 md:gap-4">
          <div>
            <Skeleton className="h-8 w-64" />
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <Skeleton className="h-9 w-24" />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-12" />
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* AI dev note: Saudação + ações; o filtro de profissional fica na mesma
          faixa (antes era uma linha própria com ícone + rótulo redundantes) */}
      <PageHeader
        title={`${getGreeting()}, ${firstName}!`}
        actions={
          <>
            <ProfessionalFilter
              selectedProfessionals={selectedProfessionals}
              onSelectionChange={setSelectedProfessionals}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={refreshAll}
              disabled={loading}
            >
              <RefreshCw className={loading ? 'animate-spin' : ''} />
              {loading ? 'Atualizando...' : 'Atualizar'}
            </Button>
          </>
        }
      />

      {/* AI dev note: Atendimentos Atuais - janela de 3 atendimentos (anterior, atual, próximo) */}
      {/* Inclui "Ver mais atendimentos" para expandir os próximos */}
      <CurrentAppointments
        appointments={currentWindowAppointments}
        upcomingAppointments={upcomingAppointments || []}
        loading={loading}
        error={error}
        onAppointmentClick={handleAppointmentClick}
        userRole="admin"
      />

      {/* AI dev note: Relacionamento com pediatras - meta estratégica de admin */}
      <PediatraRelacionamentoManager maxItems={15} />

      {/* AI dev note: Aniversários da semana */}
      <WeekBirthdays maxItems={20} />

      {/* AI dev note: Consultas para evolução — o componente já é um Card com
          título e "Ver mais"; antes vinha dentro de outro Card com outro título
          e um scroll fixo de 600px. */}
      <ConsultationsToEvolve
        title="Consultas para Evolução"
        count={evolutionCount}
        consultations={consultationsToEvolve || []}
        loading={loading}
        onConsultationClick={handleAppointmentClick}
        onCreateEvolutionClick={handleEvolutionClick}
        maxItems={10}
      />

      {/* AI dev note: AppointmentDetailsManager já abre o próprio Dialog —
          envolver em outro Dialog mostrava dois modais empilhados. */}
      {selectedAppointmentData && (
        <AppointmentDetailsManager
          isOpen={isAppointmentDetailsOpen}
          appointment={selectedAppointmentData}
          onClose={handleAppointmentDetailsClose}
          onSave={handleAppointmentDetailsSave}
          userRole="admin"
          locaisAtendimento={formData.locaisAtendimento || []}
        />
      )}
    </div>
  );
};
