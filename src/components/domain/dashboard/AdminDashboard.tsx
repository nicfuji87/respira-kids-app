import React, { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/primitives/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/primitives/dialog';
import { ScrollArea } from '@/components/primitives/scroll-area';
import { Skeleton } from '@/components/primitives/skeleton';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import {
  CalendarDays,
  Clock,
  DollarSign,
  UserPlus,
  AlertTriangle,
  FileText,
  RefreshCw,
  Filter,
  Users2,
  Stethoscope,
  Package,
} from 'lucide-react';
import { useAdminMetrics } from '@/hooks/useAdminMetrics';
import { UserMetrics } from '@/components/composed/UserMetrics';
import { ProfessionalMetrics } from '@/components/composed/ProfessionalMetrics';
import { RecentConsultations } from '@/components/composed/RecentConsultations';
import { ConsultationsToEvolve } from '@/components/composed/ConsultationsToEvolve';
import { AppointmentsList } from '@/components/composed/AppointmentsList';
import { MaterialRequestCard } from '@/components/composed/MaterialRequestCard';
import { ProfessionalFilter } from '@/components/composed/ProfessionalFilter';
import { AppointmentDetailsManager } from '@/components/domain/calendar/AppointmentDetailsManager';
import {
  updatePaymentStatus,
  updateNfeLink,
} from '@/lib/calendar-services';
import type {
  UpcomingAppointment,
  ConsultationToEvolve,
} from '@/lib/professional-dashboard-api';
import type { SupabaseAgendamentoCompletoFlat } from '@/types/supabase-calendar';


// AI dev note: AdminDashboard é específico para role admin da clínica Respira Kids
// Interface completa de gestão com métricas, notificações e ações rápidas
// Integrado com Supabase para dados reais de todos os profissionais
// Com filtros por profissional para todos os componentes

interface AdminDashboardProps {
  onModuleClick: (moduleId: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onModuleClick,
}) => {
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<
    string | null
  >(null);
  const [isAppointmentDetailsOpen, setIsAppointmentDetailsOpen] =
    useState(false);
  const [selectedAppointmentData, setSelectedAppointmentData] = useState<
    SupabaseAgendamentoCompletoFlat | null
  >(null);

  const {
    loading,
    error,
    refreshAll,
    upcomingAppointments,
    consultationsToEvolve,
    materialRequests,
    user,
  } = useAdminMetrics(selectedProfessionalId);

  // AI dev note: Função para saudação dinâmica baseada no horário
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  // AI dev note: Extrair primeiro nome do usuário
  const firstName = (user?.pessoa?.nome || 'Usuário').split(' ')[0];

  const handleModuleClick = useCallback(
    (moduleId: string) => {
      onModuleClick(moduleId);
    },
    [onModuleClick]
  );

  // Função para extrair dados de agendamento de diferentes tipos
  const extractAppointmentData = useCallback(
    (
      item: UpcomingAppointment | ConsultationToEvolve
    ): SupabaseAgendamentoCompletoFlat => {
      if ('agendamento_id' in item) {
        // É do tipo UpcomingAppointment
        return {
          id: item.agendamento_id,
          data_agendamento: item.data_agendamento,
          horario_inicio: item.horario_inicio,
          horario_fim: item.horario_fim,
          observacoes: item.observacoes,
          preco_sessao: item.preco_sessao,
          paciente_id: item.paciente_id,
          paciente_nome: item.paciente_nome,
          profissional_id: item.profissional_id,
          profissional_nome: item.profissional_nome,
          servico_id: item.servico_id,
          servico_nome: item.servico_nome,
          responsavel_legal_nome: item.responsavel_legal_nome,
          responsavel_legal_email: item.responsavel_legal_email,
          responsavel_legal_telefone: item.responsavel_legal_telefone,
          responsavel_financeiro_nome: item.responsavel_financeiro_nome,
          responsavel_financeiro_email: item.responsavel_financeiro_email,
          responsavel_financeiro_telefone: item.responsavel_financeiro_telefone,
          nomes_responsaveis: item.nomes_responsaveis,
          idade_paciente: item.idade_paciente,
          status_consulta_id: item.status_consulta_id || null,
          status_consulta_nome: item.status_consulta_nome || null,
          status_pagamento_id: item.status_pagamento_id || null,
          status_pagamento_nome: item.status_pagamento_nome || null,
          local_atendimento_id: item.local_atendimento_id || null,
          local_atendimento_nome: item.local_atendimento_nome || null,
          link_nfe: item.link_nfe || null,
        };
      } else {
        // É do tipo ConsultationToEvolve
        return {
          id: item.id,
          data_agendamento: item.data_agendamento,
          horario_inicio: item.horario_inicio,
          horario_fim: item.horario_fim,
          observacoes: item.observacoes,
          preco_sessao: item.preco_sessao,
          paciente_id: item.paciente_id,
          paciente_nome: item.paciente_nome,
          profissional_id: item.profissional_id,
          profissional_nome: item.profissional_nome,
          servico_id: item.servico_id,
          servico_nome: item.servico_nome,
          responsavel_legal_nome: item.responsavel_legal_nome,
          responsavel_legal_email: item.responsavel_legal_email,
          responsavel_legal_telefone: item.responsavel_legal_telefone,
          responsavel_financeiro_nome: item.responsavel_financeiro_nome,
          responsavel_financeiro_email: item.responsavel_financeiro_email,
          responsavel_financeiro_telefone: item.responsavel_financeiro_telefone,
          nomes_responsaveis: item.nomes_responsaveis,
          idade_paciente: item.idade_paciente,
          status_consulta_id: item.status_consulta_id || null,
          status_consulta_nome: item.status_consulta_nome || null,
          status_pagamento_id: item.status_pagamento_id || null,
          status_pagamento_nome: item.status_pagamento_nome || null,
          local_atendimento_id: item.local_atendimento_id || null,
          local_atendimento_nome: item.local_atendimento_nome || null,
          link_nfe: item.link_nfe || null,
        };
      }
    },
    []
  );

  const handleAppointmentClick = useCallback(
    (consultation: UpcomingAppointment | ConsultationToEvolve) => {
      const appointmentData = extractAppointmentData(consultation);
      setSelectedAppointmentData(appointmentData);
      setIsAppointmentDetailsOpen(true);
    },
    [extractAppointmentData]
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
    (consultationId: string) => {
      handleModuleClick(`patients/${consultationId}?tab=evolution`);
    },
    [handleModuleClick]
  );

  // AI dev note: Componente reutilizável para métricas de card
  const MetricCard = ({
    title,
    value,
    icon: Icon,
    description,
    onClick,
    className = '',
  }: {
    title: string;
    value: string | number;
    icon: React.ComponentType<any>;
    description?: string;
    onClick?: () => void;
    className?: string;
  }) => (
    <Card
      className={`cursor-pointer hover:shadow-md transition-shadow ${className}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between space-y-0 pb-2">
          <div className="text-sm font-medium">{title}</div>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );

  // AI dev note: Preparar dados das métricas principais
  const upcomingCount = upcomingAppointments?.length || 0;
  const evolutionCount = consultationsToEvolve?.length || 0;
  const materialRequestsCount = materialRequests?.length || 0;

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
          selectedProfessionalId={selectedProfessionalId}
          onProfessionalChange={setSelectedProfessionalId}
          showAllOption
        />
      </div>

      {/* AI dev note: Cards de métricas principais */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Próximas Consultas"
          value={upcomingCount}
          icon={CalendarDays}
          description="Próximas 24h"
          onClick={() => handleModuleClick('calendar')}
        />
        <MetricCard
          title="Evoluções Pendentes"
          value={evolutionCount}
          icon={FileText}
          description="Necessitam evolução"
          onClick={() => handleModuleClick('patients')}
        />
        <MetricCard
          title="Solicitações de Material"
          value={materialRequestsCount}
          icon={Package}
          description="Pendentes de aprovação"
          onClick={() => handleModuleClick('stock')}
        />
        <MetricCard
          title="Total de Pacientes"
          value="267"
          icon={Users2}
          description="Cadastrados"
          onClick={() => handleModuleClick('patients')}
        />
      </div>

      {/* AI dev note: Seção de métricas detalhadas */}
      <div className="grid gap-6 lg:grid-cols-2">
        <UserMetrics />
        <ProfessionalMetrics selectedProfessionalId={selectedProfessionalId} />
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
                  onPaymentStatusUpdate={updatePaymentStatus}
                  onNfeLinkUpdate={updateNfeLink}
                  emptyMessage="Nenhuma consulta nas próximas 24 horas"
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
                  onEvolutionClick={handleEvolutionClick}
                  emptyMessage="Todas as consultas estão em dia!"
                />
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Solicitação de Material */}
              <MaterialRequestCard
            requests={materialRequests}
            loading={loading}
            error={error}
                                onRequestClick={() => {
                  handleModuleClick('stock');
                }}
                onCreateRequest={() => {
              
              handleModuleClick('stock');
            }}
          />
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
                appointmentData={selectedAppointmentData}
                onClose={handleAppointmentDetailsClose}
                onSave={handleAppointmentDetailsSave}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
