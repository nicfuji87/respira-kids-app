import React, { useState, useCallback } from 'react';
import { ProgressIndicator } from '@/components/composed/ProgressIndicator';
import {
  ResponsiblePhoneValidationStep,
  type ResponsibleData,
} from '@/components/composed/ResponsiblePhoneValidationStep';
import {
  PatientSelectionStep,
  type SelectedPatient,
} from '@/components/composed/PatientSelectionStep';
import {
  FinancialResponsibleTypeStep,
  type FinancialResponsibleTypeData,
} from '@/components/composed/FinancialResponsibleTypeStep';
import {
  NewFinancialResponsibleFormStep,
  type NewFinancialResponsibleData,
} from '@/components/composed/NewFinancialResponsibleFormStep';
import { FinancialResponsibleReviewStep } from '@/components/composed/FinancialResponsibleReviewStep';
import { FinancialResponsibleSuccessStep } from '@/components/composed/FinancialResponsibleSuccessStep';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/primitives/use-toast';
import { telefoneParaEdge } from '@/lib/telefone-internacional';

// AI dev note: AddFinancialResponsibleSteps - Domain component gerenciador de fluxo
// Etapas: 1) Validação telefone, 2) Seleção pacientes, 3) Tipo responsável, 4) Dados (se outra pessoa), 5) Revisão, 6) Sucesso

export type AddFinancialResponsibleStep =
  | 'phone-validation'
  | 'patient-selection'
  | 'responsible-type'
  | 'responsible-form'
  | 'review'
  | 'success';

export interface AddFinancialResponsibleData {
  responsible?: ResponsibleData;
  selectedPatients?: SelectedPatient[];
  responsibleType?: FinancialResponsibleTypeData;
  newResponsibleData?: NewFinancialResponsibleData;
  result?: {
    financialResponsibleId: string;
    financialResponsibleName: string;
    patientsUpdated: number;
  };
}

export interface AddFinancialResponsibleStepsProps {
  className?: string;
}

const STEP_TITLES: Record<AddFinancialResponsibleStep, string> = {
  'phone-validation': 'Validação',
  'patient-selection': 'Pacientes',
  'responsible-type': 'Tipo',
  'responsible-form': 'Dados',
  review: 'Revisão',
  success: 'Sucesso',
};

export const AddFinancialResponsibleSteps =
  React.memo<AddFinancialResponsibleStepsProps>(({ className }) => {
    const [currentStep, setCurrentStep] =
      useState<AddFinancialResponsibleStep>('phone-validation');
    const [data, setData] = useState<AddFinancialResponsibleData>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();

    // Step 1: Validação de telefone
    const handlePhoneValidation = useCallback(
      (responsibleData: ResponsibleData) => {
        console.log(
          '✅ [AddFinancialResponsibleSteps] Telefone validado:',
          responsibleData
        );
        setData((prev) => ({ ...prev, responsible: responsibleData }));
        setCurrentStep('patient-selection');
      },
      []
    );

    // Step 2: Seleção de pacientes
    const handlePatientSelection = useCallback(
      (selectedPatients: SelectedPatient[]) => {
        console.log(
          '✅ [AddFinancialResponsibleSteps] Pacientes selecionados:',
          selectedPatients.length
        );
        setData((prev) => ({ ...prev, selectedPatients }));
        setCurrentStep('responsible-type');
      },
      []
    );

    // Step 3: Tipo de responsável
    const handleResponsibleType = useCallback(
      (responsibleType: FinancialResponsibleTypeData) => {
        console.log(
          '✅ [AddFinancialResponsibleSteps] Tipo:',
          responsibleType.isSelf ? 'Eu mesmo' : 'Outra pessoa'
        );
        setData((prev) => ({ ...prev, responsibleType }));

        if (responsibleType.isSelf) {
          // Pular formulário, ir direto para revisão
          setCurrentStep('review');
        } else {
          // Ir para formulário de nova pessoa
          setCurrentStep('responsible-form');
        }
      },
      []
    );

    // Step 4: Formulário de nova pessoa
    const handleResponsibleForm = useCallback(
      (newResponsibleData: NewFinancialResponsibleData) => {
        console.log(
          '✅ [AddFinancialResponsibleSteps] Dados do responsável financeiro:',
          newResponsibleData.nome
        );
        setData((prev) => ({ ...prev, newResponsibleData }));
        setCurrentStep('review');
      },
      []
    );

    // Step 5: Confirmação e envio
    const handleConfirm = useCallback(async () => {
      if (
        !data.responsible ||
        !data.selectedPatients ||
        !data.responsibleType
      ) {
        toast({
          title: 'Erro',
          description: 'Dados incompletos. Por favor, revise o cadastro.',
          variant: 'destructive',
        });
        return;
      }

      setIsSubmitting(true);

      try {
        console.log(
          '📤 [AddFinancialResponsibleSteps] Enviando dados para Edge Function...'
        );

        // Montar payload para Edge Function
        const payload = {
          // Estrangeiro vai com "+" para a edge function não pôr 55 na frente
          responsiblePhone: telefoneParaEdge(data.responsible.telefone),
          patientIds: data.selectedPatients.map((p) => p.id),
          financialResponsible: {
            isSelf: data.responsibleType.isSelf,
            ...(data.newResponsibleData && !data.responsibleType.isSelf
              ? {
                  phone: data.newResponsibleData.phone,
                  nome: data.newResponsibleData.nome,
                  cpf: data.newResponsibleData.cpf,
                  email: data.newResponsibleData.email,
                  endereco: data.newResponsibleData.endereco,
                  useSameAddress: data.newResponsibleData.useSameAddress,
                }
              : {}),
          },
        };

        console.log('📦 [AddFinancialResponsibleSteps] Payload:', payload);

        const { data: result, error } = await supabase.functions.invoke(
          'add-financial-responsible',
          {
            body: payload,
          }
        );

        if (error) {
          console.error(
            '❌ [AddFinancialResponsibleSteps] Erro da Edge Function:',
            error
          );
          throw error;
        }

        if (!result.success) {
          console.error(
            '❌ [AddFinancialResponsibleSteps] Erro no resultado:',
            result.error
          );
          throw new Error(result.error || 'Erro ao processar cadastro');
        }

        console.log(
          '✅ [AddFinancialResponsibleSteps] Cadastro concluído:',
          result.data
        );

        // Salvar resultado
        setData((prev) => ({ ...prev, result: result.data }));

        // Ir para página de sucesso
        setCurrentStep('success');

        toast({
          title: 'Sucesso!',
          description: 'Responsável financeiro cadastrado com sucesso.',
        });
      } catch (error) {
        console.error(
          '❌ [AddFinancialResponsibleSteps] Erro ao cadastrar:',
          error
        );

        toast({
          title: 'Erro ao cadastrar',
          description:
            error instanceof Error
              ? error.message
              : 'Não foi possível cadastrar o responsável financeiro. Tente novamente.',
          variant: 'destructive',
        });
      } finally {
        setIsSubmitting(false);
      }
    }, [data, toast]);

    // Handler para voltar
    const handleBack = useCallback(() => {
      const stepOrder: AddFinancialResponsibleStep[] = [
        'phone-validation',
        'patient-selection',
        'responsible-type',
        'responsible-form',
        'review',
      ];

      const currentIndex = stepOrder.indexOf(currentStep);
      if (currentIndex > 0) {
        // Se estava no review e tipo é "self", voltar para responsible-type
        if (currentStep === 'review' && data.responsibleType?.isSelf) {
          setCurrentStep('responsible-type');
        } else {
          setCurrentStep(stepOrder[currentIndex - 1]);
        }
      }
    }, [currentStep, data.responsibleType]);

    // Handler para adicionar outro
    const handleAddAnother = useCallback(() => {
      setData({});
      setCurrentStep('phone-validation');
    }, []);

    // Calcular progresso
    const currentStepIndex = Object.keys(STEP_TITLES).indexOf(currentStep);

    return (
      <div className={cn('space-y-6', className)}>
        {/* Progress Indicator */}
        {currentStep !== 'success' && (
          <ProgressIndicator
            currentStep={currentStepIndex + 1}
            totalSteps={
              Object.keys(STEP_TITLES).filter((k) => k !== 'success').length
            }
          />
        )}

        {/* Step Content */}
        {currentStep === 'phone-validation' && (
          <ResponsiblePhoneValidationStep onContinue={handlePhoneValidation} />
        )}

        {currentStep === 'patient-selection' && data.responsible && (
          <PatientSelectionStep
            responsibleId={data.responsible.id}
            onContinue={handlePatientSelection}
            onBack={handleBack}
          />
        )}

        {currentStep === 'responsible-type' && (
          <FinancialResponsibleTypeStep
            onContinue={handleResponsibleType}
            onBack={handleBack}
          />
        )}

        {currentStep === 'responsible-form' && data.selectedPatients && (
          <NewFinancialResponsibleFormStep
            onContinue={handleResponsibleForm}
            onBack={handleBack}
            patientAddress={
              data.selectedPatients[0]
                ? {
                    cep: '', // TODO: Buscar endereço do paciente se necessário
                    logradouro: '',
                    numero: '',
                    bairro: '',
                    cidade: '',
                    estado: '',
                  }
                : undefined
            }
          />
        )}

        {currentStep === 'review' &&
          data.responsible &&
          data.selectedPatients &&
          data.responsibleType && (
            <FinancialResponsibleReviewStep
              responsible={data.responsible}
              selectedPatients={data.selectedPatients}
              responsibleType={data.responsibleType}
              newResponsibleData={data.newResponsibleData}
              onConfirm={handleConfirm}
              onBack={handleBack}
              isSubmitting={isSubmitting}
            />
          )}

        {currentStep === 'success' && data.result && data.selectedPatients && (
          <FinancialResponsibleSuccessStep
            responsibleName={data.result.financialResponsibleName}
            patientsCount={data.selectedPatients.length}
            patientNames={data.selectedPatients.map((p) => p.nome)}
            onAddAnother={handleAddAnother}
          />
        )}
      </div>
    );
  });

AddFinancialResponsibleSteps.displayName = 'AddFinancialResponsibleSteps';
