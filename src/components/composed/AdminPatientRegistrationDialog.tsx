import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { Progress } from '@/components/primitives/progress';
import { AdminWhatsAppValidationStep } from './AdminWhatsAppValidationStep';
import { ResponsibleDataStep } from './ResponsibleDataStep';
import { AddressStep } from './AddressStep';
import { AdminPatientDataStep } from './AdminPatientDataStep';
import {
  FinancialResponsibleStep,
  type FinancialResponsibleData,
} from './FinancialResponsibleStep';
import { PediatricianStep } from './PediatricianStep';
import { AuthorizationsStep } from './AuthorizationsStep';
import { AdminContractGenerationStep } from './AdminContractGenerationStep';
import {
  createPatientAdmin,
  type AdminPatientData,
} from '@/lib/admin-patient-registration-api';
import { toast } from '@/components/primitives/use-toast';
import { Loader2 } from 'lucide-react';

interface AdminPatientRegistrationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (patientId: string) => void;
}

type StepType =
  | 'whatsapp'
  | 'responsible-data'
  | 'address'
  | 'patient-data'
  | 'financial-responsible'
  | 'pediatrician'
  | 'authorizations'
  | 'contract'
  | 'creating';

const STEP_TITLES: Record<StepType, string> = {
  whatsapp: 'WhatsApp do Responsável',
  'responsible-data': 'Dados do Responsável',
  address: 'Endereço',
  'patient-data': 'Dados do Paciente',
  'financial-responsible': 'Responsável Financeiro',
  pediatrician: 'Pediatra',
  authorizations: 'Autorizações',
  contract: 'Contrato',
  creating: 'Criando Paciente...',
};

// AI dev note: Dialog orquestrador do cadastro administrativo com suporte a auto-responsabilidade
export const AdminPatientRegistrationDialog: React.FC<
  AdminPatientRegistrationDialogProps
> = ({ isOpen, onClose, onSuccess }) => {
  const [currentStep, setCurrentStep] = useState<StepType>('whatsapp');
  const [formData, setFormData] = useState<Partial<AdminPatientData>>({
    autorizacoes: {
      uso_imagem_tratamento: false,
      uso_imagem_educacional: false,
      uso_imagem_marketing: false,
      compartilhamento_equipe: false,
    },
  });
  const [createdPatientId, setCreatedPatientId] = useState<string | null>(null);

  // Calcular progresso
  const steps: StepType[] = [
    'whatsapp',
    'responsible-data',
    'address',
    'patient-data',
    'financial-responsible',
    'pediatrician',
    'authorizations',
    'contract',
  ];

  // Calcular etapas efetivas (pulando se responsável já existe)
  const effectiveSteps = formData.responsavelId
    ? steps.filter((s) => !['responsible-data', 'address'].includes(s))
    : steps;

  const currentStepIndex = effectiveSteps.indexOf(currentStep);
  const progress = ((currentStepIndex + 1) / effectiveSteps.length) * 100;

  // Navegar para próxima etapa
  const goToNextStep = useCallback(() => {
    const allSteps: StepType[] = [
      'whatsapp',
      'responsible-data',
      'address',
      'patient-data',
      'financial-responsible',
      'pediatrician',
      'authorizations',
      'contract',
    ];
    const currentIndex = allSteps.indexOf(currentStep);
    if (currentIndex < allSteps.length - 1) {
      const nextStep = allSteps[currentIndex + 1];

      // Pular etapas se responsável já existe
      if (
        formData.responsavelId &&
        ['responsible-data', 'address'].includes(nextStep)
      ) {
        const skipToIndex = allSteps.indexOf('patient-data');
        setCurrentStep(allSteps[skipToIndex]);
      } else {
        setCurrentStep(nextStep);
      }
    }
  }, [currentStep, formData.responsavelId]);

  // Navegar para etapa anterior
  const goToPreviousStep = useCallback(() => {
    const allSteps: StepType[] = [
      'whatsapp',
      'responsible-data',
      'address',
      'patient-data',
      'financial-responsible',
      'pediatrician',
      'authorizations',
      'contract',
    ];
    const currentIndex = allSteps.indexOf(currentStep);
    if (currentIndex > 0) {
      const prevStep = allSteps[currentIndex - 1];

      // Pular etapas se responsável já existe
      if (
        formData.responsavelId &&
        ['responsible-data', 'address'].includes(prevStep)
      ) {
        setCurrentStep('whatsapp');
      } else {
        setCurrentStep(prevStep);
      }
    }
  }, [currentStep, formData.responsavelId]);

  // Handlers para cada etapa
  const handleWhatsAppContinue = (data: {
    whatsapp: string;
    jid: string;
    existingPerson?: {
      id: string;
      nome: string;
      cpf_cnpj: string;
      email?: string;
      endereco?: { id: string };
    };
  }) => {
    const hasExistingPerson = !!data.existingPerson;

    setFormData((prev) => ({
      ...prev,
      whatsappResponsavel: data.whatsapp,
      jidResponsavel: data.jid,
      responsavelId: data.existingPerson?.id,
      nomeResponsavel: data.existingPerson?.nome,
      cpfResponsavel: data.existingPerson?.cpf_cnpj,
      emailResponsavel: data.existingPerson?.email,
      enderecoId: data.existingPerson?.endereco?.id,
    }));

    // Se responsável já existe, pular direto para dados do paciente
    if (hasExistingPerson) {
      setCurrentStep('patient-data');
    } else {
      setCurrentStep('responsible-data');
    }
  };

  const handleResponsibleDataContinue = (data: {
    nome: string;
    cpf: string;
    email: string;
  }) => {
    setFormData((prev) => ({
      ...prev,
      nomeResponsavel: data.nome,
      cpfResponsavel: data.cpf,
      emailResponsavel: data.email,
    }));
    goToNextStep();
  };

  const handleAddressContinue = (data: {
    cep: string;
    logradouro: string;
    numero: string;
    complemento?: string;
    bairro: string;
    cidade: string;
    estado: string;
  }) => {
    setFormData((prev) => ({
      ...prev,
      cep: data.cep,
      logradouro: data.logradouro,
      numeroEndereco: data.numero,
      complementoEndereco: data.complemento,
      bairro: data.bairro,
      cidade: data.cidade,
      estado: data.estado,
    }));
    goToNextStep();
  };

  const handlePatientDataContinue = (data: {
    nome: string;
    cpf: string;
    dataNascimento: string;
    sexo: string;
    email?: string;
    usarEmailResponsavel: boolean;
    usarEnderecoResponsavel: boolean;
    cep?: string;
    numeroEndereco?: string;
    complemento?: string;
  }) => {
    setFormData((prev) => ({
      ...prev,
      nomePaciente: data.nome,
      cpfPaciente: data.cpf,
      dataNascimentoPaciente: data.dataNascimento,
      sexoPaciente: data.sexo,
      emailPaciente: data.email,
      usarEnderecoResponsavel: data.usarEnderecoResponsavel,
      cepPaciente: data.cep,
      numeroEnderecoPaciente: data.numeroEndereco,
      complementoPaciente: data.complemento,
    }));
    goToNextStep();
  };

  const handleFinancialResponsibleContinue = (
    data: FinancialResponsibleData
  ) => {
    setFormData((prev) => ({
      ...prev,
      isResponsavelFinanceiroIgualLegal: data.isSameAsLegal,
      responsavelFinanceiroId: data.existingPersonId,
    }));
    goToNextStep();
  };

  const handlePediatricianContinue = (data: {
    id?: string;
    pessoaId?: string;
    nome: string;
    crm?: string;
    isNew: boolean;
    noPediatrician?: boolean;
  }) => {
    setFormData((prev) => ({
      ...prev,
      pediatraId: data.id, // ID da pessoa_pediatra
    }));
    goToNextStep();
  };

  const handleAuthorizationsContinue = (data: {
    usoCientifico: boolean | null;
    usoRedesSociais: boolean | null;
    usoNome: boolean | null;
  }) => {
    // Transformar AuthorizationsData para o formato esperado
    setFormData((prev) => ({
      ...prev,
      autorizacoes: {
        uso_imagem_tratamento: data.usoCientifico || false,
        uso_imagem_educacional: data.usoCientifico || false,
        uso_imagem_marketing: data.usoRedesSociais || false,
        compartilhamento_equipe: data.usoNome || false,
      },
    }));

    // Criar paciente antes de gerar contrato
    createPatient();
  };

  // Criar paciente no banco
  const createPatient = async () => {
    setCurrentStep('creating');

    try {
      const result = await createPatientAdmin(formData as AdminPatientData);

      if (result.success && result.patientId) {
        setCreatedPatientId(result.patientId);
        setCurrentStep('contract');
      } else {
        throw new Error(result.error || 'Erro ao criar paciente');
      }
    } catch (err) {
      console.error('Erro ao criar paciente:', err);
      toast({
        title: 'Erro ao criar paciente',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });

      // Voltar para etapa anterior
      setCurrentStep('authorizations');
    }
  };

  // Preparar variáveis do contrato
  const prepareContractVariables = () => {
    const idade = formData.dataNascimentoPaciente
      ? new Date().getFullYear() -
        new Date(formData.dataNascimentoPaciente).getFullYear()
      : 0;

    const isAutoResponsavel = idade >= 18;
    const responsavelNome = isAutoResponsavel
      ? formData.nomePaciente
      : formData.nomeResponsavel;
    const responsavelCpf = isAutoResponsavel
      ? formData.cpfPaciente
      : formData.cpfResponsavel;

    return {
      // Responsável Legal
      responsavelLegalNome: responsavelNome || '',
      responsavelLegalCpf: responsavelCpf || '',
      responsavelLegalTelefone: formData.whatsappResponsavel || '',
      responsavelLegalEmail:
        formData.emailPaciente || formData.emailResponsavel || '',
      responsavelLegalFinanceiro: formData.isResponsavelFinanceiroIgualLegal
        ? 'e Financeiro'
        : '',

      // Cláusula condicional
      clausulaResponsavelFinanceiro: formData.isResponsavelFinanceiroIgualLegal
        ? ''
        : 'Parágrafo sobre responsável financeiro diferente',

      // Compatibilidade
      contratante: responsavelNome || '',
      cpf: responsavelCpf || '',
      telefone: formData.whatsappResponsavel || '',
      email: formData.emailPaciente || formData.emailResponsavel || '',

      // Endereço
      endereco_completo: `${formData.logradouro || ''}, ${formData.numeroEndereco || ''}${formData.complementoEndereco ? `, ${formData.complementoEndereco}` : ''} - ${formData.bairro || ''}, ${formData.cidade || ''}/${formData.estado || ''}`,
      logradouro: formData.logradouro || '',
      numero: formData.numeroEndereco || '',
      complemento: formData.complementoEndereco,
      bairro: formData.bairro || '',
      cidade: formData.cidade || '',
      uf: formData.estado || '',
      cep: formData.cep || '',

      // Paciente
      paciente: formData.nomePaciente || '',
      dnPac: formData.dataNascimentoPaciente
        ? new Date(formData.dataNascimentoPaciente).toLocaleDateString('pt-BR')
        : '',
      cpfPac: formData.cpfPaciente || '',

      // Outros
      hoje: new Date().toLocaleDateString('pt-BR'),
      autorizo: (formData.autorizacoes?.uso_imagem_marketing
        ? 'autorizo'
        : 'não autorizo') as 'autorizo' | 'não autorizo',
      fimTerapeutico: formData.autorizacoes?.uso_imagem_tratamento
        ? 'autorizo'
        : 'não autorizo',
      vinculoNome: (formData.autorizacoes?.compartilhamento_equipe
        ? 'poderão'
        : 'não poderão') as 'poderão' | 'não poderão',
    };
  };

  const handleContractFinish = () => {
    if (createdPatientId) {
      toast({
        title: 'Paciente cadastrado com sucesso!',
        description: 'O contrato foi enviado para o responsável via WhatsApp',
      });
      onSuccess(createdPatientId);
      handleClose();
    }
  };

  const handleClose = () => {
    // Resetar estado ao fechar
    setCurrentStep('whatsapp');
    setFormData({
      autorizacoes: {
        uso_imagem_tratamento: false,
        uso_imagem_educacional: false,
        uso_imagem_marketing: false,
        compartilhamento_equipe: false,
      },
    });
    setCreatedPatientId(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Novo Paciente
            {currentStep !== 'creating' && currentStepIndex >= 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                Etapa {currentStepIndex + 1} de {effectiveSteps.length}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Barra de progresso */}
        {currentStep !== 'creating' && (
          <div className="mb-6">
            <Progress value={progress} className="h-2" />
            <p className="text-sm text-muted-foreground mt-2">
              {STEP_TITLES[currentStep]}
            </p>
          </div>
        )}

        {/* Conteúdo das etapas */}
        <div className="mt-6">
          {currentStep === 'whatsapp' && (
            <AdminWhatsAppValidationStep
              onContinue={handleWhatsAppContinue}
              onBack={handleClose}
              initialValue={formData.whatsappResponsavel}
            />
          )}

          {currentStep === 'responsible-data' && !formData.responsavelId && (
            <ResponsibleDataStep
              onContinue={handleResponsibleDataContinue}
              onBack={goToPreviousStep}
              defaultValues={{
                nome: formData.nomeResponsavel,
                cpf: formData.cpfResponsavel,
                email: formData.emailResponsavel,
              }}
            />
          )}

          {currentStep === 'address' && !formData.enderecoId && (
            <AddressStep
              onContinue={handleAddressContinue}
              onBack={goToPreviousStep}
              initialData={{
                cep: formData.cep,
                numero: formData.numeroEndereco,
                complemento: formData.complementoEndereco,
              }}
            />
          )}

          {currentStep === 'patient-data' && (
            <AdminPatientDataStep
              onContinue={handlePatientDataContinue}
              onBack={goToPreviousStep}
              responsavelData={{
                email: formData.emailResponsavel,
                endereco: formData.enderecoId
                  ? { cep: formData.cep || '' }
                  : undefined,
              }}
              initialData={{
                nome: formData.nomePaciente,
                cpf: formData.cpfPaciente,
                dataNascimento: formData.dataNascimentoPaciente,
                sexo: formData.sexoPaciente,
                email: formData.emailPaciente,
                usarEmailResponsavel: formData.usarEnderecoResponsavel,
                usarEnderecoResponsavel: formData.usarEnderecoResponsavel,
                cep: formData.cepPaciente,
                numeroEndereco: formData.numeroEnderecoPaciente,
                complemento: formData.complementoPaciente,
              }}
            />
          )}

          {currentStep === 'financial-responsible' && (
            <FinancialResponsibleStep
              onContinue={handleFinancialResponsibleContinue}
              onBack={goToPreviousStep}
              defaultValue={{
                isSameAsLegal:
                  formData.isResponsavelFinanceiroIgualLegal ?? true,
              }}
            />
          )}

          {currentStep === 'pediatrician' && (
            <PediatricianStep
              onContinue={handlePediatricianContinue}
              onBack={goToPreviousStep}
              initialData={
                formData.pediatraId
                  ? {
                      id: formData.pediatraId,
                      nome: '',
                      isNew: false,
                    }
                  : undefined
              }
            />
          )}

          {currentStep === 'authorizations' && (
            <AuthorizationsStep
              onContinue={handleAuthorizationsContinue}
              onBack={goToPreviousStep}
              initialData={{
                usoCientifico:
                  formData.autorizacoes?.uso_imagem_educacional || false,
                usoRedesSociais:
                  formData.autorizacoes?.uso_imagem_marketing || false,
                usoNome:
                  formData.autorizacoes?.compartilhamento_equipe || false,
              }}
            />
          )}

          {currentStep === 'creating' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
              <p className="text-lg font-medium">Criando paciente...</p>
              <p className="text-sm text-muted-foreground mt-2">
                Aguarde enquanto salvamos os dados
              </p>
            </div>
          )}

          {currentStep === 'contract' && createdPatientId && (
            <AdminContractGenerationStep
              patientId={createdPatientId}
              contractVariables={prepareContractVariables()}
              onFinish={handleContractFinish}
              onBack={() => setCurrentStep('authorizations')}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
