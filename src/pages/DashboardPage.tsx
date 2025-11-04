import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import {
  Calendar,
  Users,
  FileText,
  Activity,
  Clock,
  CheckCircle,
} from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import { CalendarTemplateWithData } from '@/components/templates/dashboard/CalendarTemplateWithData';
import {
  ProfessionalDashboard,
  AdminDashboard,
  SecretariaDashboard,
} from '@/components/domain';
import { AppointmentDetailsManager } from '@/components/domain/calendar';
import { fetchAgendamentoById, updateNfeLink } from '@/lib/calendar-services';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { useCalendarFormData } from '@/hooks/useCalendarData';
import type {
  UpcomingAppointment,
  ConsultationToEvolve,
} from '@/lib/professional-dashboard-api';
import type { SupabaseAgendamentoCompletoFlat } from '@/types/supabase-calendar';

// AI dev note: DashboardPage com dados reais do Supabase
// Página principal do dashboard com métricas e calendário

interface DashboardMetrics {
  agendamentosHoje: number;
  pacientesAtivos: number;
  sessoesMes: number;
  faturamentoMes: number;
  proximosAgendamentos: Array<{
    paciente: string;
    horario: string;
    servico: string;
    status: string;
  }>;
}

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // AI dev note: TODOS os hooks devem ser chamados ANTES da renderização condicional
  // para respeitar a "Rules of Hooks" do React

  // Estados para dashboard legado (sempre inicializados)
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    agendamentosHoje: 0,
    pacientesAtivos: 0,
    sessoesMes: 0,
    faturamentoMes: 0,
    proximosAgendamentos: [],
  });
  const [loading, setLoading] = useState(true);

  // Estados para modal de detalhes do agendamento
  const [isAppointmentDetailsOpen, setIsAppointmentDetailsOpen] =
    useState(false);
  const [selectedAppointmentData, setSelectedAppointmentData] =
    useState<SupabaseAgendamentoCompletoFlat | null>(null);

  // Dados do usuário
  const userRole = user?.pessoa?.role;
  const professionalId = user?.pessoa?.id;
  const professionalName = user?.pessoa?.nome || 'Profissional';
  const secretariaId = user?.pessoa?.id;
  const secretariaName = user?.pessoa?.nome || 'Secretaria';

  // Hook para dados do calendário (locais de atendimento)
  const { formData } = useCalendarFormData();

  // Handler para navegação
  const handleNavigateToAgenda = () => {
    navigate('/agenda');
  };

  const handleNavigateToPacientes = () => {
    navigate('/pacientes');
  };

  const handleNavigateToRelatorios = () => {
    navigate('/relatorios');
  };

  // Handlers específicos do dashboard profissional
  const handleAppointmentClick = async (appointment: UpcomingAppointment) => {
    setIsAppointmentDetailsOpen(true);

    try {
      const appointmentDetails = await fetchAgendamentoById(appointment.id);
      if (appointmentDetails) {
        setSelectedAppointmentData(appointmentDetails);
      } else {
        // Se não conseguir buscar os dados, fechar o modal e navegar para agenda
        setIsAppointmentDetailsOpen(false);
        navigate('/agenda');
      }
    } catch (error) {
      console.error('Erro ao abrir detalhes do agendamento:', error);
      setIsAppointmentDetailsOpen(false);
      navigate('/agenda');
    }
  };

  const handleConsultationClick = async (
    consultation: ConsultationToEvolve
  ) => {
    setIsAppointmentDetailsOpen(true);

    try {
      const appointmentDetails = await fetchAgendamentoById(consultation.id);
      if (appointmentDetails) {
        setSelectedAppointmentData(appointmentDetails);
      } else {
        // Se não conseguir buscar os dados, fechar o modal e navegar para paciente
        setIsAppointmentDetailsOpen(false);
        navigate(`/pacientes/${consultation.id}`);
      }
    } catch (error) {
      console.error('Erro ao abrir detalhes da consulta:', error);
      setIsAppointmentDetailsOpen(false);
      navigate(`/pacientes/${consultation.id}`);
    }
  };

  const handleCreateEvolutionClick = async (consultationId: string) => {
    setIsAppointmentDetailsOpen(true);

    try {
      const appointmentDetails = await fetchAgendamentoById(consultationId);
      if (appointmentDetails) {
        setSelectedAppointmentData(appointmentDetails);
      } else {
        // Se não conseguir buscar os dados, fechar o modal e navegar para paciente
        setIsAppointmentDetailsOpen(false);
        navigate(`/pacientes/${consultationId}?tab=evolucao`);
      }
    } catch (error) {
      console.error('Erro ao abrir detalhes da consulta para evolução:', error);
      setIsAppointmentDetailsOpen(false);
      navigate(`/pacientes/${consultationId}?tab=evolucao`);
    }
  };

  const handleMaterialRequestClick = () => {
    // Navegar para detalhes da solicitação
  };

  const handleCreateMaterialRequest = () => {
    // Abrir modal ou navegar para formulário
  };

  // Handlers do modal de detalhes do agendamento
  const handleAppointmentDetailsClose = () => {
    setIsAppointmentDetailsOpen(false);
    setSelectedAppointmentData(null);
  };

  const handleAppointmentDetailsSave = async () => {
    try {
      // O AppointmentDetailsManager já tem sua própria lógica de salvamento
      // Aqui podemos adicionar refresh dos dados se necessário
    } catch (error) {
      console.error('Erro ao salvar alterações do agendamento:', error);
    }
  };

  // AI dev note: Handler unificado para navegação de qualquer pessoa (paciente, responsável, profissional)
  const handlePersonClick = (personId: string | null) => {
    if (personId) {
      navigate(`/pessoa/${personId}`);
    }
  };

  const handleNfeAction = async (appointmentId: string, linkNfe?: string) => {
    try {
      if (linkNfe) {
        // Se já tem NFe, visualizar

        window.open(linkNfe, '_blank');
      } else {
        // Se não tem NFe, emitir

        // TODO: Implementar integração com sistema de NFe
        // Por enquanto, simular um link de NFe
        const mockNfeLink = `https://nfe.exemplo.com/${appointmentId}`;

        await updateNfeLink(appointmentId, mockNfeLink);

        // Recarregar dados do agendamento se necessário
        if (selectedAppointmentData?.id === appointmentId) {
          const updatedAppointment = await fetchAgendamentoById(appointmentId);
          setSelectedAppointmentData(updatedAppointment);
        }
      }
    } catch (error) {
      console.error('Erro na ação de NFe:', error);
    }
  };

  // useEffect para dashboard legado (sempre executado, mas só atualiza se necessário)
  useEffect(() => {
    // Só carregar métricas se NÃO for profissional
    if (userRole !== 'profissional') {
      const loadMetrics = async () => {
        setTimeout(() => {
          setMetrics({
            agendamentosHoje: 3,
            pacientesAtivos: 5,
            sessoesMes: 24,
            faturamentoMes: 3850.0,
            proximosAgendamentos: [
              {
                paciente: 'Ana Silva',
                horario: '09:00',
                servico: 'Fisioterapia Respiratória',
                status: 'agendado',
              },
              {
                paciente: 'Maria Oliveira',
                horario: '14:00',
                servico: 'Fisioterapia Respiratória',
                status: 'agendado',
              },
              {
                paciente: 'Maria Oliveira',
                horario: '10:00 (Seg)',
                servico: 'Fisioterapia Neurológica',
                status: 'agendado',
              },
            ],
          });
          setLoading(false);
        }, 1000);
      };

      loadMetrics();
    } else {
      // Para profissional, marcar como não loading
      setLoading(false);
    }
  }, [userRole]);

  // RENDERIZAÇÃO CONDICIONAL (após todos os hooks)

  // Dashboard específico para profissional
  if (userRole === 'profissional' && professionalId) {
    return (
      <>
        <ProfessionalDashboard
          professionalId={professionalId}
          professionalName={professionalName}
          onAppointmentClick={handleAppointmentClick}
          onConsultationClick={handleConsultationClick}
          onCreateEvolutionClick={handleCreateEvolutionClick}
          onMaterialRequestClick={handleMaterialRequestClick}
          onCreateMaterialRequest={handleCreateMaterialRequest}
          userRole={userRole}
        />

        {/* Modal de detalhes do agendamento */}
        <AppointmentDetailsManager
          isOpen={isAppointmentDetailsOpen}
          onClose={handleAppointmentDetailsClose}
          appointment={selectedAppointmentData}
          userRole={userRole}
          locaisAtendimento={formData.locaisAtendimento || []}
          isLoadingLocais={false}
          onSave={handleAppointmentDetailsSave}
          onNfeAction={handleNfeAction}
          onPatientClick={handlePersonClick}
          onProfessionalClick={handlePersonClick}
        />
      </>
    );
  }

  // Dashboard específico para admin
  if (userRole === 'admin') {
    return (
      <>
        <AdminDashboard />

        {/* Modal de detalhes do agendamento */}
        <AppointmentDetailsManager
          isOpen={isAppointmentDetailsOpen}
          onClose={handleAppointmentDetailsClose}
          appointment={selectedAppointmentData}
          userRole={userRole}
          locaisAtendimento={formData.locaisAtendimento || []}
          isLoadingLocais={false}
          onSave={handleAppointmentDetailsSave}
          onNfeAction={handleNfeAction}
          onPatientClick={handlePersonClick}
          onProfessionalClick={handlePersonClick}
        />
      </>
    );
  }

  // Dashboard específico para secretaria
  if (userRole === 'secretaria' && secretariaId) {
    return (
      <>
        <SecretariaDashboard
          secretariaId={secretariaId}
          secretariaName={secretariaName}
          onAppointmentClick={handleAppointmentClick}
          onConsultationClick={handleConsultationClick}
          onCreateEvolutionClick={handleCreateEvolutionClick}
          userRole={userRole}
        />

        {/* Modal de detalhes do agendamento */}
        <AppointmentDetailsManager
          isOpen={isAppointmentDetailsOpen}
          onClose={handleAppointmentDetailsClose}
          appointment={selectedAppointmentData}
          userRole={userRole}
          locaisAtendimento={formData.locaisAtendimento || []}
          isLoadingLocais={false}
          onSave={handleAppointmentDetailsSave}
          onNfeAction={handleNfeAction}
          onPatientClick={handlePersonClick}
          onProfessionalClick={handlePersonClick}
        />
      </>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="h-4 bg-muted rounded w-24 animate-pulse" />
                <div className="h-4 w-4 bg-muted rounded animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded w-16 animate-pulse mb-1" />
                <div className="h-3 bg-muted rounded w-20 animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Bem-vindo, {user?.pessoa?.nome || 'Usuário'} (
            {userRole || 'role não definida'})
          </p>
        </div>
        <Button onClick={handleNavigateToAgenda}>
          <Calendar className="h-4 w-4 mr-2" />
          Ver Agenda Completa
        </Button>
      </div>

      {/* Métricas principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Agendamentos Hoje
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.agendamentosHoje}</div>
            <p className="text-xs text-muted-foreground">
              3 sessões programadas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Pacientes Ativos
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.pacientesAtivos}</div>
            <p className="text-xs text-muted-foreground">Em acompanhamento</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Sessões do Mês
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.sessoesMes}</div>
            <p className="text-xs text-muted-foreground">
              +12% vs mês anterior
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Faturamento</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R${' '}
              {metrics.faturamentoMes.toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
              })}
            </div>
            <p className="text-xs text-muted-foreground">Mês atual</p>
          </CardContent>
        </Card>
      </div>

      {/* Grid principal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Próximos agendamentos */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Próximos Agendamentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {metrics.proximosAgendamentos.map((agendamento, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">{agendamento.paciente}</p>
                    <p className="text-sm text-muted-foreground">
                      {agendamento.servico}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{agendamento.horario}</Badge>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Calendário compacto */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Agenda do Mês
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-96 overflow-hidden">
              <CalendarTemplateWithData
                responsive={true}
                initialView="month"
                className="scale-95"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ações rápidas */}
      <Card>
        <CardHeader>
          <CardTitle>Ações Rápidas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Button
              className="h-20 flex flex-col items-center justify-center space-y-2"
              onClick={handleNavigateToAgenda}
            >
              <Calendar className="h-6 w-6" />
              <span className="text-sm">Nova Sessão</span>
            </Button>

            <Button
              variant="outline"
              className="h-20 flex flex-col items-center justify-center space-y-2"
              onClick={handleNavigateToPacientes}
            >
              <Users className="h-6 w-6" />
              <span className="text-sm">Novo Paciente</span>
            </Button>

            <Button
              variant="outline"
              className="h-20 flex flex-col items-center justify-center space-y-2"
              onClick={handleNavigateToRelatorios}
            >
              <FileText className="h-6 w-6" />
              <span className="text-sm">Relatório</span>
            </Button>

            <Button
              variant="outline"
              className="h-20 flex flex-col items-center justify-center space-y-2"
            >
              <Activity className="h-6 w-6" />
              <span className="text-sm">Avaliação</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
