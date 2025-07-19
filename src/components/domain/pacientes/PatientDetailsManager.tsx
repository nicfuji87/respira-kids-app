import React, { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Skeleton } from '@/components/primitives/skeleton';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import {
  PatientCompleteInfo,
  PatientMetrics,
  RecentConsultations,
  PatientAnamnesis,
  PatientHistory,
  MediaGallery,
  type LocationOption,
} from '@/components/composed';
import { AppointmentDetailsManager } from '@/components/domain/calendar/AppointmentDetailsManager';
import {
  fetchPatientDetails,
  fetchPatientAnamnesis,
  savePatientAnamnesis,
} from '@/lib/patient-api';
import {
  fetchAgendamentoById,
  updateAgendamentoDetails,
  fetchLocaisAtendimento,
} from '@/lib/calendar-services';
import { useAuth } from '@/hooks/useAuth';
import type { PatientDetails } from '@/types/patient-details';
import type { SupabaseAgendamentoCompletoFlat } from '@/types/supabase-calendar';
import type { AppointmentUpdateData } from '@/components/domain/calendar/AppointmentDetailsManager';
import { cn } from '@/lib/utils';

// AI dev note: PatientDetailsManager - Component Domain expandido para gerenciar detalhes completos do paciente
// Atualizado para usar PatientCompleteInfo que une todas as informações pessoais em um único card
// Métricas e consultas com dados reais do Supabase

export interface PatientDetailsManagerProps {
  patientId: string;
  onBack?: () => void;
  className?: string;
}

export const PatientDetailsManager = React.memo<PatientDetailsManagerProps>(
  ({ patientId, onBack, className }) => {
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

    const { user } = useAuth();

    useEffect(() => {
      const loadPatientDetails = async () => {
        if (!patientId) return;

        try {
          setIsLoading(true);
          setError(null);

          // AI dev note: Carregar dados do paciente e anamnese em paralelo
          const [patientResponse, anamnesisData] = await Promise.all([
            fetchPatientDetails(patientId),
            fetchPatientAnamnesis(patientId),
          ]);

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
    }, [patientId]);

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
      await savePatientAnamnesis(patientId, content);
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
      <div className={cn('w-full space-y-6', className)}>
        {/* Header */}
        <div className="flex items-center gap-4">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
          )}
          <h1 className="text-2xl font-bold">{patient.nome}</h1>
        </div>

        {/* Informações Completas do Paciente - usando component PatientCompleteInfo unificado */}
        <PatientCompleteInfo patient={patient} />

        {/* Métricas do Paciente - com dados reais */}
        <PatientMetrics patientId={patientId} />

        {/* Consultas Recentes - com dados reais */}
        <RecentConsultations
          patientId={patientId}
          onConsultationClick={handleConsultationClick}
        />

        {/* Anamnese do Paciente */}
        <PatientAnamnesis
          patientId={patientId}
          initialValue={anamnesis}
          onUpdate={handleAnamnesisUpdate}
        />

        {/* Histórico Compilado com IA */}
        <PatientHistory patientId={patientId} />

        {/* Galeria de Mídias */}
        <MediaGallery patientId={patientId} />

        {/* Modal de Detalhes do Agendamento */}
        <AppointmentDetailsManager
          isOpen={isAppointmentModalOpen}
          onClose={() => setIsAppointmentModalOpen(false)}
          appointment={selectedAppointment}
          userRole={
            (user?.role as 'admin' | 'profissional' | 'secretaria') || null
          }
          locaisAtendimento={locaisAtendimento}
          isLoadingLocais={isLoadingLocais}
          onSave={handleAppointmentSave}
        />
      </div>
    );
  }
);

PatientDetailsManager.displayName = 'PatientDetailsManager';
