import React, { useState, useEffect } from 'react';
import { ArrowLeft, Calendar } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Skeleton } from '@/components/primitives/skeleton';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import {
  PatientCompleteInfo,
  PatientMetricsWithConsultations,
  PatientAnamnesis,
  PatientHistory,
  MediaGallery,
  PatientContractSection,
  type LocationOption,
} from '@/components/composed';
import { AppointmentDetailsManager } from '@/components/domain/calendar/AppointmentDetailsManager';
import { AppointmentFormManager } from '@/components/domain/calendar/AppointmentFormManager';
import {
  fetchPatientDetails,
  fetchPatientAnamnesis,
  savePatientAnamnesis,
} from '@/lib/patient-api';
import {
  fetchPersonDetails,
  fetchPersonAnamnesis,
  savePersonAnamnesis,
} from '@/lib/person-api';

import {
  fetchAgendamentoById,
  updateAgendamentoDetails,
  fetchLocaisAtendimento,
  updateNfeLink,
} from '@/lib/calendar-services';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import type { PatientDetails, PersonDetails } from '@/types/patient-details';
import type { SupabaseAgendamentoCompletoFlat } from '@/types/supabase-calendar';
import type { AppointmentUpdateData } from '@/components/domain/calendar/AppointmentDetailsManager';
import { cn } from '@/lib/utils';

// AI dev note: PatientDetailsManager - Component Domain expandido para gerenciar detalhes completos do paciente
// Atualizado para usar PatientCompleteInfo que une todas as informações pessoais em um único card
// Métricas e consultas com dados reais do Supabase

export interface PatientDetailsManagerProps {
  patientId?: string; // Para compatibilidade backward
  personId?: string; // Para uso genérico com qualquer pessoa
  onBack?: () => void;
  className?: string;
}

export const PatientDetailsManager = React.memo<PatientDetailsManagerProps>(
  ({ patientId, personId, onBack, className }) => {
    // AI dev note: Determinar ID correto - personId tem prioridade, fallback para patientId
    const actualId = personId || patientId;

    if (!actualId) {
      throw new Error('PatientDetailsManager requer patientId ou personId');
    }
    const [patient, setPatient] = useState<PatientDetails | null>(null);
    const [anamnesis, setAnamnesis] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Estados para o modal de detalhes do agendamento
    const [selectedAppointment, setSelectedAppointment] =
      useState<SupabaseAgendamentoCompletoFlat | null>(null);
    const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
    const [locaisAtendimento, setLocaisAtendimento] = useState<
      LocationOption[]
    >([]);
    const [isLoadingLocais, setIsLoadingLocais] = useState(false);

    // Estados para o modal de criação de agendamento
    const [isNewAppointmentModalOpen, setIsNewAppointmentModalOpen] =
      useState(false);

    const { user } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
      const loadPatientDetails = async () => {
        if (!actualId) return;

        try {
          setIsLoading(true);
          setError(null);

          // AI dev note: Carregar dados da pessoa/paciente baseado no tipo de ID
          let patientResponse;
          let anamnesisData;

          if (personId) {
            // Se personId foi fornecido, usar API de pessoa genérica
            const [personResp, personAnamnesis] = await Promise.all([
              fetchPersonDetails(
                actualId,
                user?.role as 'admin' | 'profissional' | 'secretaria'
              ),
              fetchPersonAnamnesis(actualId),
            ]);
            patientResponse = {
              patient: personResp.person,
              error: personResp.error,
            };
            anamnesisData = personAnamnesis;
          } else {
            // Se apenas patientId foi fornecido, usar API de paciente tradicional
            const [patientResp, patientAnamnesis] = await Promise.all([
              fetchPatientDetails(actualId),
              fetchPatientAnamnesis(actualId),
            ]);
            patientResponse = patientResp;
            anamnesisData = patientAnamnesis;
          }

          if (patientResponse.error) {
            setError(patientResponse.error);
          } else if (patientResponse.patient) {
            setPatient(patientResponse.patient);
            setAnamnesis(anamnesisData || '');
          } else {
            setError('Paciente não encontrado');
          }
        } catch (err) {
          console.error('Erro ao carregar detalhes do paciente:', err);
          setError('Erro ao carregar dados do paciente');
        } finally {
          setIsLoading(false);
        }
      };

      loadPatientDetails();
    }, [actualId, personId, user?.role]);

    // Carregar locais de atendimento
    useEffect(() => {
      const loadLocais = async () => {
        setIsLoadingLocais(true);
        try {
          const locais = await fetchLocaisAtendimento();
          setLocaisAtendimento(locais);
        } catch (error) {
          console.error('Erro ao carregar locais:', error);
        } finally {
          setIsLoadingLocais(false);
        }
      };

      loadLocais();
    }, []);

    // Handler para atualização de anamnese
    const handleAnamnesisUpdate = async (content: string) => {
      if (personId) {
        await savePersonAnamnesis(actualId, content);
      } else {
        await savePatientAnamnesis(actualId, content);
      }
      setAnamnesis(content);
    };

    // Handler para click na consulta recente
    const handleConsultationClick = async (consultationId: string) => {
      try {
        const appointment = await fetchAgendamentoById(consultationId);
        if (appointment) {
          setSelectedAppointment(appointment);
          setIsAppointmentModalOpen(true);
        }
      } catch (error) {
        console.error('Erro ao carregar detalhes do agendamento:', error);
      }
    };

    // Handler para salvar alterações no agendamento
    const handleAppointmentSave = async (
      appointmentData: AppointmentUpdateData
    ) => {
      try {
        await updateAgendamentoDetails(appointmentData);
        setIsAppointmentModalOpen(false);
      } catch (error) {
        console.error('Erro ao salvar agendamento:', error);
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
          if (selectedAppointment?.id === appointmentId) {
            const updatedAppointment =
              await fetchAgendamentoById(appointmentId);
            setSelectedAppointment(updatedAppointment);
          }
        }
      } catch (error) {
        console.error('Erro na ação de NFe:', error);
      }
    };

    // Handlers para modal de novo agendamento
    const handleNewAppointmentClick = () => {
      setIsNewAppointmentModalOpen(true);
    };

    const handleNewAppointmentClose = () => {
      setIsNewAppointmentModalOpen(false);
    };

    const handleNewAppointmentSave = () => {
      setIsNewAppointmentModalOpen(false);
      // TODO: Atualizar lista de consultas recentes se necessário
    };

    // Loading state
    if (isLoading) {
      return (
        <div className={cn('w-full space-y-6', className)}>
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-20" />
            <Skeleton className="h-8 w-48" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      );
    }

    // Error state
    if (error || !patient) {
      return (
        <div className={cn('w-full', className)}>
          <Alert variant="destructive">
            <AlertDescription>
              {error || 'Paciente não encontrado'}
            </AlertDescription>
          </Alert>
          {onBack && (
            <Button variant="outline" onClick={onBack} className="mt-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
          )}
        </div>
      );
    }

    return (
      <div className={cn('w-full space-y-4 md:space-y-6', className)}>
        {/* Header - Responsivo para mobile */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
          <div className="flex items-center gap-2 md:gap-4 min-w-0">
            {onBack && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onBack}
                className="flex-shrink-0"
              >
                <ArrowLeft className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Voltar</span>
              </Button>
            )}
            <h1 className="text-xl md:text-2xl font-bold truncate">
              {patient.nome}
            </h1>
          </div>

          {/* Botão Agendar - apenas para pacientes */}
          {(!personId ||
            (patient as PersonDetails)?.tipo_pessoa === 'paciente') && (
            <Button
              onClick={handleNewAppointmentClick}
              className="gap-2 w-full md:w-auto flex-shrink-0"
              size="sm"
            >
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Agendar Paciente</span>
              <span className="sm:hidden">Agendar</span>
            </Button>
          )}
        </div>

        {/* Informações Completas do Paciente - usando component PatientCompleteInfo unificado */}
        <PatientCompleteInfo
          patient={patient}
          userRole={
            (user?.pessoa?.role as 'admin' | 'profissional' | 'secretaria') ||
            null
          }
          onResponsibleClick={(responsibleId) => {
            console.log(
              '🔍 [DEBUG] PatientDetailsManager - onResponsibleClick chamado:',
              {
                responsibleId,
              }
            );
            handlePersonClick(responsibleId);
          }}
        />

        {/* Contrato do Paciente - apenas para pacientes */}
        {(!personId ||
          (patient as PersonDetails)?.tipo_pessoa === 'paciente') && (
          <PatientContractSection
            patientId={actualId}
            userRole={
              (user?.pessoa?.role as 'admin' | 'profissional' | 'secretaria') ||
              null
            }
          />
        )}

        {/* Seções específicas apenas para pacientes */}
        {(!personId ||
          (patient as PersonDetails)?.tipo_pessoa === 'paciente') && (
          <>
            {/* Métricas do Paciente com Lista de Consultas - unificado */}
            <PatientMetricsWithConsultations
              patientId={actualId}
              onConsultationClick={handleConsultationClick}
              userRole={
                (user?.pessoa?.role as
                  | 'admin'
                  | 'profissional'
                  | 'secretaria') || null
              }
            />

            {/* Anamnese do Paciente */}
            <PatientAnamnesis
              patientId={actualId}
              initialValue={anamnesis}
              onUpdate={handleAnamnesisUpdate}
            />

            {/* Histórico Compilado com IA */}
            <PatientHistory patientId={actualId} />

            {/* Galeria de Mídias */}
            <MediaGallery patientId={actualId} />
          </>
        )}

        {/* Modal de Detalhes do Agendamento */}
        <AppointmentDetailsManager
          isOpen={isAppointmentModalOpen}
          onClose={() => setIsAppointmentModalOpen(false)}
          appointment={selectedAppointment}
          userRole={
            (user?.pessoa?.role as 'admin' | 'profissional' | 'secretaria') ||
            null
          }
          locaisAtendimento={locaisAtendimento}
          isLoadingLocais={isLoadingLocais}
          onSave={handleAppointmentSave}
          onNfeAction={handleNfeAction}
          onPatientClick={handlePersonClick}
          onProfessionalClick={handlePersonClick}
        />

        {/* Modal de Novo Agendamento */}
        <AppointmentFormManager
          isOpen={isNewAppointmentModalOpen}
          onClose={handleNewAppointmentClose}
          initialPatientId={actualId}
          onSave={handleNewAppointmentSave}
        />
      </div>
    );
  }
);

PatientDetailsManager.displayName = 'PatientDetailsManager';
