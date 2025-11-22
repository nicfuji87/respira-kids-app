import React, { useState, useEffect } from 'react';
import { PinValidationDialog } from '@/components/composed/PinValidationDialog';
import { FinancialConsultationsList } from '@/components/composed/FinancialConsultationsList';
import { FinancialFaturasList } from '@/components/composed/FinancialFaturasList';
import { FaturamentoChart } from '@/components/composed/FaturamentoChart';
import { FinancialProfessionalReport } from '@/components/composed/FinancialProfessionalReport';
import { ProfessionalFinancialSummary } from '@/components/composed/ProfessionalFinancialSummary';
import { ProfessionalFinancialConsultations } from '@/components/composed/ProfessionalFinancialConsultations';
import { ProfessionalFaturamentoChart } from '@/components/composed/ProfessionalFaturamentoChart';
import { FinancialTemplate } from '@/components/templates/financial/FinancialTemplate';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/primitives/tabs';
import { AppointmentDetailsManager } from '@/components/domain/calendar/AppointmentDetailsManager';
import { useAuth } from '@/hooks/useAuth';
import { useCalendarFormData } from '@/hooks/useCalendarData';
import { useNavigate } from 'react-router-dom';
import { fetchAgendamentoById } from '@/lib/calendar-services';
import type { SupabaseAgendamentoCompletoFlat } from '@/types/supabase-calendar';
import type { FaturaComDetalhes } from '@/types/faturas';
import { useToast } from '@/components/primitives/use-toast';

// AI dev note: Interfaces para tipos da página financeira
interface ConsultationWithPatient {
  id: string;
  data_hora: string;
  servico_nome: string;
  paciente_id: string;
  paciente_nome: string;
  profissional_id: string;
  profissional_nome: string;
  valor_servico: number;
  status_consulta_codigo: string;
  status_pagamento_codigo: string;
}

interface AppointmentUpdateData {
  id: string;
  data_hora?: string;
  local_id?: string;
  valor_servico?: number;
  status_consulta_id?: string;
  tipo_servico_id?: string;
  empresa_fatura?: string;
}

// AI dev note: Página Financeiro para admin (com PIN, 4 abas) e profissional (sem PIN, 3 abas)
// Admin: Consultas, Faturas, Gráfico Anual, Profissionais (com proteção por PIN)
// Profissional: Resumo, Consultas, Gráfico Anual (sem proteção por PIN, apenas suas comissões)

export const FinanceiroPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isPinValidated, setIsPinValidated] = useState(false);
  const [isCheckingPin, setIsCheckingPin] = useState(true);

  // AI dev note: Tabs diferentes para admin e profissional
  const [activeTabAdmin, setActiveTabAdmin] = useState<
    'consultas' | 'faturas' | 'grafico' | 'profissionais'
  >('consultas');
  const [activeTabProfessional, setActiveTabProfessional] = useState<
    'resumo' | 'consultas' | 'grafico'
  >('resumo');

  // Estados para modal de detalhes do agendamento
  const [isAppointmentDetailsOpen, setIsAppointmentDetailsOpen] =
    useState(false);
  const [selectedAppointmentData, setSelectedAppointmentData] =
    useState<SupabaseAgendamentoCompletoFlat | null>(null);

  // Hook para dados do calendário (locais de atendimento)
  const { formData } = useCalendarFormData();

  // AI dev note: FaturamentoChart agora busca seus próprios dados com filtros
  // Removido useAdminMetrics para evitar duplicação de queries

  // AI dev note: Verificar se usuário tem acesso (admin, secretaria ou profissional)
  useEffect(() => {
    if (!user || !user.pessoa) return;

    const userRole = user.pessoa.role;
    if (
      userRole !== 'admin' &&
      userRole !== 'profissional' &&
      userRole !== 'secretaria'
    ) {
      navigate('/dashboard');
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.pessoa?.role, navigate]);

  // AI dev note: Verificar PIN para admin e secretaria
  useEffect(() => {
    const checkPinSession = async () => {
      // Profissional não precisa de PIN
      if (user?.pessoa?.role === 'profissional') {
        setIsPinValidated(true);
        setIsCheckingPin(false);
        return;
      }

      // Admin e Secretaria precisam de PIN
      if (
        user?.pessoa?.role === 'admin' ||
        user?.pessoa?.role === 'secretaria'
      ) {
        const sessionKey = `pin_validated_${user?.id}_financeiro`;
        const sessionValidated = sessionStorage.getItem(sessionKey);

        if (sessionValidated) {
          // Verificar se a sessão ainda é válida (30 minutos)
          const validatedTime = parseInt(sessionValidated);
          const now = Date.now();
          const thirtyMinutes = 30 * 60 * 1000;

          if (now - validatedTime < thirtyMinutes) {
            setIsPinValidated(true);
          } else {
            sessionStorage.removeItem(sessionKey);
          }
        }
      }

      setIsCheckingPin(false);
    };

    if (user?.id && user?.pessoa?.role) {
      checkPinSession();
    }
  }, [user?.id, user?.pessoa?.role]);

  // Handler para sucesso na validação do PIN
  const handlePinSuccess = () => {
    // Salvar na sessão ANTES de setar o estado
    const sessionKey = `pin_validated_${user?.id}_financeiro`;
    sessionStorage.setItem(sessionKey, Date.now().toString());

    // Fechar dialog e mostrar página
    setIsPinValidated(true);

    toast({
      title: 'Acesso autorizado',
      description: 'Área financeira liberada.',
    });
  };

  // Handler para clique em consulta
  const handleConsultationClick = async (
    consultation: ConsultationWithPatient | { id: string }
  ) => {
    try {
      const appointmentDetails = await fetchAgendamentoById(consultation.id);
      if (appointmentDetails) {
        setSelectedAppointmentData(appointmentDetails);
        setIsAppointmentDetailsOpen(true);
      }
    } catch (error) {
      console.error('Erro ao abrir detalhes do agendamento:', error);
      toast({
        title: 'Erro ao carregar detalhes',
        description: 'Não foi possível carregar os detalhes da consulta.',
        variant: 'destructive',
      });
    }
  };

  // Handler para clique em fatura
  const handleFaturaClick = async (fatura: FaturaComDetalhes) => {
    // Abrir link do ASAAS se existir
    if (fatura.url_asaas) {
      window.open(fatura.url_asaas, '_blank');
    }
  };

  // Handler para fechar modal de detalhes
  const handleAppointmentDetailsClose = () => {
    setIsAppointmentDetailsOpen(false);
    setSelectedAppointmentData(null);
  };

  // Handler para salvar alterações do agendamento
  const handleAppointmentDetailsSave = async (
    appointmentData: AppointmentUpdateData
  ) => {
    try {
      const { updateAgendamentoDetails } = await import(
        '@/lib/calendar-services'
      );

      // Converter AppointmentUpdateData para o formato esperado
      const updatePayload = {
        id: appointmentData.id,
        data_hora: appointmentData.data_hora,
        local_id: appointmentData.local_id || undefined, // Converter null para undefined
        valor_servico: appointmentData.valor_servico,
        status_consulta_id: appointmentData.status_consulta_id,
        tipo_servico_id: appointmentData.tipo_servico_id,
        empresa_fatura: appointmentData.empresa_fatura,
      };

      const updatedAppointment = await updateAgendamentoDetails(updatePayload);

      toast({
        title: 'Agendamento atualizado',
        description: 'As alterações foram salvas com sucesso',
      });

      // Atualizar dados do agendamento no state
      setSelectedAppointmentData(updatedAppointment);
    } catch (error) {
      console.error('Erro ao salvar alterações do agendamento:', error);
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar as alterações. Tente novamente.',
        variant: 'destructive',
      });
    }
  };

  // Se não for admin, secretaria ou profissional, redirecionar
  if (
    user?.pessoa?.role !== 'admin' &&
    user?.pessoa?.role !== 'profissional' &&
    user?.pessoa?.role !== 'secretaria'
  ) {
    return null;
  }

  const userRole = user?.pessoa?.role;
  const isProfessional = userRole === 'profissional';
  const isAdminOrSecretaria = userRole === 'admin' || userRole === 'secretaria';

  // Se ainda está verificando PIN
  if (isCheckingPin) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-pulse text-muted-foreground">
          Verificando acesso...
        </div>
      </div>
    );
  }

  // AI dev note: Renderizar versão específica para cada role
  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Financeiro</h1>
          <p className="text-muted-foreground">
            {isProfessional
              ? 'Minhas comissões e consultas'
              : isPinValidated
                ? 'Gestão financeira e faturamento'
                : 'Área restrita - Autenticação necessária'}
          </p>
        </div>

        {/* Conteúdo - Admin/Secretaria precisa de PIN, Profissional não */}
        {isPinValidated && (
          <>
            {/* Versão Admin e Secretaria - Combina comissões + novo módulo financeiro */}
            {isAdminOrSecretaria && userRole && (
              <Tabs defaultValue="comissoes" className="w-full">
                <TabsList className="grid w-full grid-cols-2 h-auto">
                  <TabsTrigger value="comissoes">
                    Comissões e Agendamentos
                  </TabsTrigger>
                  <TabsTrigger value="financeiro">
                    Gestão Financeira
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="comissoes" className="mt-6">
                  {/* Abas antigas de comissões */}
                  <Tabs
                    value={activeTabAdmin}
                    onValueChange={(value) =>
                      setActiveTabAdmin(
                        value as
                          | 'consultas'
                          | 'faturas'
                          | 'grafico'
                          | 'profissionais'
                      )
                    }
                  >
                    <TabsList className="grid w-full grid-cols-4 h-auto">
                      <TabsTrigger value="consultas">Consultas</TabsTrigger>
                      <TabsTrigger value="faturas">Faturas</TabsTrigger>
                      <TabsTrigger value="grafico">Gráfico Anual</TabsTrigger>
                      <TabsTrigger value="profissionais">
                        Profissionais
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="consultas" className="space-y-4">
                      <FinancialConsultationsList
                        onConsultationClick={handleConsultationClick}
                      />
                    </TabsContent>

                    <TabsContent value="faturas" className="space-y-4">
                      <FinancialFaturasList onFaturaClick={handleFaturaClick} />
                    </TabsContent>

                    <TabsContent value="grafico" className="space-y-4">
                      <FaturamentoChart />
                    </TabsContent>

                    <TabsContent value="profissionais" className="space-y-4">
                      <FinancialProfessionalReport />
                    </TabsContent>
                  </Tabs>
                </TabsContent>

                <TabsContent value="financeiro" className="mt-6">
                  <FinancialTemplate
                    userRole={userRole as 'admin' | 'secretaria'}
                  />
                </TabsContent>
              </Tabs>
            )}

            {/* Versão Profissional */}
            {isProfessional && user?.pessoa?.id && (
              <Tabs
                value={activeTabProfessional}
                onValueChange={(value) =>
                  setActiveTabProfessional(
                    value as 'resumo' | 'consultas' | 'grafico'
                  )
                }
              >
                <TabsList className="grid w-full grid-cols-3 h-auto">
                  <TabsTrigger value="resumo">Resumo</TabsTrigger>
                  <TabsTrigger value="consultas">Consultas</TabsTrigger>
                  <TabsTrigger value="grafico">Gráfico Anual</TabsTrigger>
                </TabsList>

                <TabsContent value="resumo" className="space-y-4">
                  <ProfessionalFinancialSummary
                    professionalId={user.pessoa.id}
                  />
                </TabsContent>

                <TabsContent value="consultas" className="space-y-4">
                  <ProfessionalFinancialConsultations
                    professionalId={user.pessoa.id}
                    onConsultationClick={handleConsultationClick}
                  />
                </TabsContent>

                <TabsContent value="grafico" className="space-y-4">
                  <ProfessionalFaturamentoChart
                    professionalId={user.pessoa.id}
                  />
                </TabsContent>
              </Tabs>
            )}

            {/* Modal de detalhes do agendamento */}
            <AppointmentDetailsManager
              isOpen={isAppointmentDetailsOpen}
              onClose={handleAppointmentDetailsClose}
              appointment={selectedAppointmentData}
              userRole={userRole as 'admin' | 'profissional'}
              locaisAtendimento={formData.locaisAtendimento || []}
              isLoadingLocais={false}
              onSave={handleAppointmentDetailsSave}
              onNfeAction={async (appointmentId: string, linkNfe?: string) => {
                // Implementação de ação de NFe se necessário
                console.log('NFe action for:', appointmentId, linkNfe);
              }}
              onPatientClick={(patientId: string | null) => {
                if (patientId) {
                  navigate(`/pessoa/${patientId}`);
                }
              }}
              onProfessionalClick={(professionalId: string) => {
                navigate(`/pessoa/${professionalId}`);
              }}
            />
          </>
        )}
      </div>

      {/* Dialog de validação de PIN - para admin e secretaria */}
      {isAdminOrSecretaria && (
        <PinValidationDialog
          isOpen={!isPinValidated}
          onClose={() => {
            navigate('/dashboard');
          }}
          onSuccess={handlePinSuccess}
          title="Acesso ao Financeiro"
          description="Esta área contém informações sensíveis. Digite seu PIN para continuar."
        />
      )}
    </>
  );
};
