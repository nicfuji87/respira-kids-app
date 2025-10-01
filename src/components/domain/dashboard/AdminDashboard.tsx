import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { ScrollArea } from '@/components/primitives/scroll-area';
import { Skeleton } from '@/components/primitives/skeleton';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import {
  Clock,
  AlertTriangle,
  RefreshCw,
  Filter,
  Stethoscope,
} from 'lucide-react';
import { useAdminMetrics } from '@/hooks/useAdminMetrics';
import { UserMetrics } from '@/components/composed/UserMetrics';
import { ProfessionalMetrics } from '@/components/composed/ProfessionalMetrics';
import { ConsultationsToEvolve } from '@/components/composed/ConsultationsToEvolve';
import { AppointmentsList } from '@/components/composed/AppointmentsList';
import { ProfessionalFilter } from '@/components/composed/ProfessionalFilter';
import { AppointmentDetailsManager } from '@/components/domain/calendar/AppointmentDetailsManager';
import { fetchAgendamentoById } from '@/lib/calendar-services';
import type {
  UpcomingAppointment,
  ConsultationToEvolve,
} from '@/lib/professional-dashboard-api';
import type { SupabaseAgendamentoCompletoFlat } from '@/types/supabase-calendar';
import { useAuth } from '@/hooks/useAuth';

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

  const {
    loading,
    error,
    refreshAll,
    upcomingAppointments,
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
  const upcomingCount = upcomingAppointments?.length || 0;
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

      {/* AI dev note: Header dinâmico com saudação personalizada */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 md:gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-roxo-titulo respira-text-gradient">
            {getGreeting()}, {firstName}!
          </h1>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={refreshAll}
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
        </div>
      </div>

      {/* AI dev note: Filtro de profissional para toda a interface */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filtrar por profissional:</span>
        </div>
        <ProfessionalFilter
          selectedProfessionals={selectedProfessionals}
          onSelectionChange={setSelectedProfessionals}
        />
      </div>

      {/* AI dev note: Seção de métricas detalhadas */}
      <div className="grid gap-6 lg:grid-cols-2">
        <UserMetrics metrics={null} loading={loading} />
        <ProfessionalMetrics metrics={null} />
      </div>

      {/* AI dev note: Seção de listas e agendamentos */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {/* Lista de Próximas Consultas */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Próximas Consultas
                {upcomingCount > 0 && (
                  <Badge variant="secondary">{upcomingCount}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <AppointmentsList
                  appointments={upcomingAppointments || []}
                  loading={loading}
                  onAppointmentClick={handleAppointmentClick}
                  maxItems={10}
                  userRole="admin"
                />
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Consultas para Evolução */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Stethoscope className="h-5 w-5" />
                Consultas para Evolução
                {evolutionCount > 0 && (
                  <Badge variant="destructive">{evolutionCount}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[200px]">
                <ConsultationsToEvolve
                  consultations={consultationsToEvolve || []}
                  loading={loading}
                  onConsultationClick={handleAppointmentClick}
                  onCreateEvolutionClick={handleEvolutionClick}
                  maxItems={50} // Mostrar até 50 consultas inicialmente
                />
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* AI dev note: Modal de detalhes do agendamento */}
      <Dialog
        open={isAppointmentDetailsOpen}
        onOpenChange={setIsAppointmentDetailsOpen}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Detalhes do Agendamento</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[80vh]">
            {selectedAppointmentData && (
              <AppointmentDetailsManager
                isOpen={isAppointmentDetailsOpen}
                appointment={selectedAppointmentData}
                onClose={handleAppointmentDetailsClose}
                onSave={handleAppointmentDetailsSave}
                userRole="admin"
                locaisAtendimento={[]}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
