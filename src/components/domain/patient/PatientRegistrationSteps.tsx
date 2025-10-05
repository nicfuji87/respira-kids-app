import React, { useState, useCallback, useMemo } from 'react';
import { WhatsAppValidationStep } from '@/components/composed/WhatsAppValidationStep';
import { ResponsibleIdentificationStep } from '@/components/composed/ResponsibleIdentificationStep';
import {
  ResponsibleDataStep,
  type ResponsibleData,
} from '@/components/composed/ResponsibleDataStep';
import {
  AddressStep,
  type AddressData,
} from '@/components/composed/AddressStep';
import { FinancialResponsibleStep } from '@/components/composed/FinancialResponsibleStep';
import {
  PatientDataStep,
  type PatientData,
} from '@/components/composed/PatientDataStep';
import {
  PediatricianStep,
  type PediatricianData,
} from '@/components/composed/PediatricianStep';
import {
  AuthorizationsStep,
  type AuthorizationsData,
} from '@/components/composed/AuthorizationsStep';
import { ReviewStep } from '@/components/composed/ReviewStep';
import { ContractReviewStep } from '@/components/composed/ContractReviewStep';
import { ProgressIndicator } from '@/components/composed/ProgressIndicator';
import { cn } from '@/lib/utils';
import {
  generateContract,
  type ContractVariables,
  type UserContract,
} from '@/lib/contract-api';
import {
  finalizePatientRegistration,
  type FinalizationData,
} from '@/lib/registration-finalization-api';

// AI dev note: PatientRegistrationSteps - Domain component que gerencia fluxo de cadastro público
// Etapas: 1) WhatsApp validation, 2) Identificação responsável, 3) Dados responsável, etc.

export type RegistrationStep =
  | 'whatsapp'
  | 'responsible-identification'
  | 'responsible-data'
  | 'address'
  | 'financial-responsible'
  | 'patient-data'
  | 'pediatrician'
  | 'authorizations'
  | 'review'
  | 'contract';

export interface ExistingUserFullData {
  id: string;
  nome: string;
  cpf_cnpj?: string;
  telefone?: string;
  email?: string;
  data_nascimento?: string;
  sexo?: string;
  id_tipo_pessoa?: string;
  tipo_responsabilidade?: string; // 'legal', 'financeiro' ou 'ambos'
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
}

export interface PatientRegistrationData {
  // Etapa 1: WhatsApp
  whatsappJid?: string;
  phoneNumber: string;
  whatsappValidated: boolean;
  existingPersonId?: string;
  existingUserData?: ExistingUserFullData;

  // Etapa 2: Identificação
  isSelfResponsible?: boolean;

  // Etapa 3: Dados do Responsável Legal
  responsavelLegal?: ResponsibleData;

  // Etapa 4: Endereço do Responsável Legal
  endereco?: AddressData;

  // Etapa 5: Responsável Financeiro
  responsavelFinanceiroMesmoQueLegal?: boolean;
  responsavelFinanceiro?: {
    nome: string;
    cpf: string;
    email: string;
    telefone: string;
    whatsappJid: string;
    endereco: AddressData;
  };

  // Etapa 6: Dados do Paciente
  paciente?: PatientData;

  // Etapa 7: Pediatra
  pediatra?: PediatricianData;

  // Etapa 8: Autorizações
  autorizacoes?: AuthorizationsData;

  // Etapa 10: Contrato
  contrato?: {
    contractContent: string;
    contractId: string;
    contractData: UserContract;
  };
}

export interface PatientRegistrationStepsProps {
  onComplete?: (data: PatientRegistrationData) => void;
  className?: string;
}

export const PatientRegistrationSteps =
  React.memo<PatientRegistrationStepsProps>(({ className }) => {
    const [currentStep, setCurrentStep] =
      useState<RegistrationStep>('whatsapp');
    const [registrationData, setRegistrationData] = useState<
      Partial<PatientRegistrationData>
    >({
      whatsappValidated: false,
    });
    const [isLoadingContract, setIsLoadingContract] = useState(false);

    // TODO: onComplete será usado quando implementar a etapa final (após aceite do contrato)

    // Handler para conclusão da etapa de WhatsApp (pessoa nova)
    const handleWhatsAppContinue = useCallback(
      (data: { phoneNumber: string; personId?: string }) => {
        console.log(
          '🆕 [PatientRegistrationSteps] handleWhatsAppContinue - Usuário NOVO'
        );
        console.log(
          '📞 [PatientRegistrationSteps] Telefone:',
          data.phoneNumber
        );

        setRegistrationData((prev) => ({
          ...prev,
          phoneNumber: data.phoneNumber,
          existingPersonId: data.personId,
          whatsappValidated: true,
        }));

        console.log(
          '➡️ [PatientRegistrationSteps] Avançando para responsible-identification (novo usuário)'
        );
        // Avançar para identificação do responsável
        setCurrentStep('responsible-identification');
      },
      []
    );

    // Handler para pessoa existente querendo cadastrar novo paciente
    const handleExistingPersonContinue = useCallback(
      (personId: string, existingUserData?: ExistingUserFullData) => {
        console.log(
          '🔄 [PatientRegistrationSteps] handleExistingPersonContinue - personId:',
          personId
        );

        setRegistrationData((prev) => ({
          ...prev,
          existingPersonId: personId,
          existingUserData,
          whatsappValidated: true,
        }));

        console.log(
          '➡️ [PatientRegistrationSteps] Avançando para responsible-identification'
        );
        // Avançar para identificação do responsável
        setCurrentStep('responsible-identification');
      },
      []
    );

    // Handler para identificação do responsável
    const handleResponsibleIdentification = useCallback(
      (isSelfResponsible: boolean) => {
        console.log(
          '🔍 [PatientRegistrationSteps] handleResponsibleIdentification'
        );
        console.log('   - isSelfResponsible:', isSelfResponsible);
        console.log(
          '   - existingPersonId:',
          registrationData.existingPersonId
        );

        setRegistrationData((prev) => ({
          ...prev,
          isSelfResponsible,
        }));

        if (isSelfResponsible) {
          // Se pessoa EXISTE e é o responsável → ir direto para cadastro do PACIENTE
          if (registrationData.existingPersonId) {
            console.log(
              '✅ [PatientRegistrationSteps] Usuário existente → vai para patient-data'
            );
            setCurrentStep('patient-data');
          } else {
            // Pessoa NOVA e é o responsável → cadastrar dados do responsável primeiro
            console.log(
              '🆕 [PatientRegistrationSteps] Usuário novo → vai para responsible-data'
            );
            setCurrentStep('responsible-data');
          }
        } else {
          // Pessoa NÃO é responsável - voltar para validar WhatsApp do responsável legal
          console.log(
            '🔄 [PatientRegistrationSteps] Não é responsável → volta para whatsapp'
          );
          setCurrentStep('whatsapp');
          setRegistrationData({
            whatsappValidated: false,
            isSelfResponsible: false,
          });
        }
      },
      [registrationData.existingPersonId]
    );

    // Handler para dados do responsável
    const handleResponsibleData = useCallback((data: ResponsibleData) => {
      console.log('✅ [PatientRegistrationSteps] handleResponsibleData:', data);

      setRegistrationData((prev) => ({
        ...prev,
        responsavelLegal: data,
      }));

      console.log(
        '➡️ [PatientRegistrationSteps] Avançando para address (ETAPA 4)'
      );
      // Após dados do responsável, cadastrar endereço
      setCurrentStep('address');
    }, []);

    // Handler para endereço
    const handleAddress = useCallback(
      (data: AddressData) => {
        console.log('✅ [PatientRegistrationSteps] handleAddress:', data);

        setRegistrationData((prev) => ({
          ...prev,
          endereco: data,
        }));

        // Se usuário é EXISTENTE, pular responsável financeiro (já cadastrado)
        if (registrationData.existingPersonId) {
          console.log(
            '✅ [PatientRegistrationSteps] Usuário existente → pula financial-responsible'
          );
          console.log(
            '➡️ [PatientRegistrationSteps] Avançando para patient-data (ETAPA 6)'
          );
          setCurrentStep('patient-data');
        } else {
          console.log(
            '➡️ [PatientRegistrationSteps] Avançando para financial-responsible (ETAPA 5)'
          );
          setCurrentStep('financial-responsible');
        }
      },
      [registrationData.existingPersonId]
    );

    // Handler para responsável financeiro
    const handleFinancialResponsible = useCallback((isSameAsLegal: boolean) => {
      console.log(
        '✅ [PatientRegistrationSteps] handleFinancialResponsible - mesmo que legal:',
        isSameAsLegal
      );

      setRegistrationData((prev) => ({
        ...prev,
        responsavelFinanceiroMesmoQueLegal: isSameAsLegal,
      }));

      if (isSameAsLegal) {
        // Mesmo responsável - ir para dados do paciente
        console.log(
          '➡️ [PatientRegistrationSteps] Mesmo responsável → Avançando para patient-data (ETAPA 6)'
        );
        setCurrentStep('patient-data');
      } else {
        // Responsável diferente - precisa cadastrar (TODO: implementar)
        console.log(
          '⚠️ [PatientRegistrationSteps] Responsável diferente → cadastro ainda não implementado'
        );
        // TODO: Criar etapa para cadastrar responsável financeiro diferente
        // Por enquanto, avançar para patient-data
        setCurrentStep('patient-data');
      }
    }, []);

    // Handler para dados do paciente
    const handlePatientData = useCallback((data: PatientData) => {
      console.log('✅ [PatientRegistrationSteps] handlePatientData:', data);

      setRegistrationData((prev) => ({
        ...prev,
        paciente: data,
      }));

      console.log(
        '➡️ [PatientRegistrationSteps] Avançando para pediatrician (ETAPA 7)'
      );
      // Avançar para etapa de pediatra
      setCurrentStep('pediatrician');
    }, []);

    // Handler para pediatra
    const handlePediatrician = useCallback((data: PediatricianData) => {
      console.log('✅ [PatientRegistrationSteps] handlePediatrician:', data);

      setRegistrationData((prev) => ({
        ...prev,
        pediatra: data,
      }));

      console.log(
        '➡️ [PatientRegistrationSteps] Avançando para authorizations (ETAPA 8)'
      );
      // Avançar para etapa de autorizações
      setCurrentStep('authorizations');
    }, []);

    // Handler para autorizações
    const handleAuthorizations = useCallback((data: AuthorizationsData) => {
      console.log('✅ [PatientRegistrationSteps] handleAuthorizations:', data);

      setRegistrationData((prev) => ({
        ...prev,
        autorizacoes: data,
      }));

      console.log(
        '➡️ [PatientRegistrationSteps] Avançando para review (ETAPA 9)'
      );
      setCurrentStep('review');
    }, []);

    // Handler para revisão e geração do contrato
    const handleReview = useCallback(async () => {
      console.log(
        '📝 [PatientRegistrationSteps] handleReview - Gerando contrato'
      );
      setIsLoadingContract(true);

      try {
        // Determinar quem é o responsável financeiro (para o contrato)
        const responsavelContrato =
          registrationData.responsavelFinanceiro ||
          registrationData.responsavelLegal;
        const existingUserData = registrationData.existingUserData;

        // Preparar variáveis do contrato conforme plano
        // Formatar telefone para (XX) XXXXX-XXXX
        const telefoneFormatado = registrationData.phoneNumber
          ? `(${registrationData.phoneNumber.slice(0, 2)}) ${registrationData.phoneNumber.slice(2, 7)}-${registrationData.phoneNumber.slice(7)}`
          : '';

        const contractVariables: ContractVariables = {
          contratante:
            existingUserData?.nome || responsavelContrato?.nome || '',
          cpf: existingUserData?.cpf_cnpj || responsavelContrato?.cpf || '',
          telefone: telefoneFormatado,
          email: existingUserData?.email || responsavelContrato?.email || '',
          logradouro:
            existingUserData?.logradouro ||
            registrationData.endereco?.logradouro ||
            '',
          numero:
            existingUserData?.numero || registrationData.endereco?.numero || '',
          complemento:
            existingUserData?.complemento ||
            registrationData.endereco?.complemento,
          bairro:
            existingUserData?.bairro || registrationData.endereco?.bairro || '',
          cidade:
            existingUserData?.localidade ||
            registrationData.endereco?.cidade ||
            '',
          uf: existingUserData?.uf || registrationData.endereco?.estado || '',
          cep: existingUserData?.cep || registrationData.endereco?.cep || '',
          paciente: registrationData.paciente?.nome || '',
          dnPac: registrationData.paciente?.dataNascimento || '', // Já vem em dd/mm/aaaa
          cpfPac: registrationData.paciente?.cpf || '',
          hoje: new Date().toLocaleDateString('pt-BR'),
          autorizo: registrationData.autorizacoes?.usoCientifico
            ? 'autorizo'
            : 'não autorizo',
          fimTerapeutico: (() => {
            const cientifico = registrationData.autorizacoes?.usoCientifico;
            const redesSociais = registrationData.autorizacoes?.usoRedesSociais;
            if (cientifico && redesSociais) {
              return 'fins terapêuticos, uso em redes sociais e pesquisa científica';
            } else if (redesSociais) {
              return 'fins terapêuticos e uso em redes sociais';
            } else if (cientifico) {
              return 'fins terapêuticos e pesquisa científica';
            }
            return 'fins exclusivamente terapêuticos';
          })(),
          vinculoNome: registrationData.autorizacoes?.usoNome
            ? 'poderão'
            : 'não poderão',
        };

        // Gerar contrato no banco
        // TODO: Usar o ID do paciente quando ele for criado
        // Por enquanto, usando o existingPersonId ou gerando um temporário
        const pessoaId =
          registrationData.existingPersonId || 'temp-' + Date.now();

        const contract = await generateContract(pessoaId, contractVariables);

        console.log(
          '✅ [PatientRegistrationSteps] Contrato gerado:',
          contract.id
        );

        // Salvar contrato nos dados
        setRegistrationData((prev) => ({
          ...prev,
          contrato: {
            contractContent: contract.conteudo_final,
            contractId: contract.id,
            contractData: contract,
          },
        }));

        console.log(
          '➡️ [PatientRegistrationSteps] Avançando para contract (ETAPA 10)'
        );
        setCurrentStep('contract');
      } catch (error) {
        console.error(
          '❌ [PatientRegistrationSteps] Erro ao gerar contrato:',
          error
        );
        alert('Erro ao gerar contrato. Por favor, tente novamente.');
      } finally {
        setIsLoadingContract(false);
      }
    }, [registrationData]);

    // Handler para aceite do contrato
    const handleContractAccept = useCallback(async () => {
      console.log('✅ [PatientRegistrationSteps] handleContractAccept');
      setIsLoadingContract(true);

      try {
        // Preparar dados para a Edge Function
        const finalizationData: FinalizationData = {
          whatsappJid:
            registrationData.whatsappJid || registrationData.phoneNumber,
          phoneNumber: registrationData.phoneNumber,
          existingPersonId: registrationData.existingPersonId,
          existingUserData: registrationData.existingUserData,

          // Responsável Legal (apenas se for novo usuário)
          responsavelLegal:
            !registrationData.existingPersonId &&
            registrationData.responsavelLegal
              ? {
                  nome: registrationData.responsavelLegal.nome,
                  cpf: registrationData.responsavelLegal.cpf,
                  email: registrationData.responsavelLegal.email,
                }
              : undefined,

          // Endereço
          endereco: {
            cep: registrationData.endereco!.cep,
            logradouro: registrationData.endereco!.logradouro,
            bairro: registrationData.endereco!.bairro,
            cidade: registrationData.endereco!.cidade,
            estado: registrationData.endereco!.estado,
            numero: registrationData.endereco!.numero,
            complemento: registrationData.endereco?.complemento,
          },

          // Responsável Financeiro
          responsavelFinanceiroMesmoQueLegal:
            registrationData.responsavelFinanceiroMesmoQueLegal ?? true,
          responsavelFinanceiro: registrationData.responsavelFinanceiro
            ? {
                nome: registrationData.responsavelFinanceiro.nome,
                cpf: registrationData.responsavelFinanceiro.cpf,
                email: registrationData.responsavelFinanceiro.email,
                telefone: registrationData.responsavelFinanceiro.telefone,
                whatsappJid: registrationData.responsavelFinanceiro.whatsappJid,
                endereco: registrationData.responsavelFinanceiro.endereco,
              }
            : undefined,

          // Paciente
          paciente: {
            nome: registrationData.paciente!.nome,
            dataNascimento: registrationData.paciente!.dataNascimento,
            sexo: registrationData.paciente!.sexo,
            cpf: registrationData.paciente!.cpf || undefined,
          },

          // Pediatra
          pediatra: {
            id: registrationData.pediatra?.id,
            nome: registrationData.pediatra!.nome,
            crm: registrationData.pediatra?.crm,
          },

          // Autorizações
          autorizacoes: {
            usoCientifico:
              registrationData.autorizacoes!.usoCientifico ?? false,
            usoRedesSociais:
              registrationData.autorizacoes!.usoRedesSociais ?? false,
            usoNome: registrationData.autorizacoes!.usoNome ?? false,
          },

          // ID do contrato
          contratoId: registrationData.contrato!.contractId,
        };

        console.log(
          '📤 [PatientRegistrationSteps] Enviando dados para finalização...'
        );

        // Chamar Edge Function
        const result = await finalizePatientRegistration(finalizationData);

        if (!result.success) {
          throw new Error(result.error || 'Erro ao finalizar cadastro');
        }

        console.log('🎉 [PatientRegistrationSteps] Cadastro COMPLETO!');
        console.log('✅ Paciente criado:', result.pacienteId);
        console.log('✅ Contrato assinado:', result.contratoId);

        // Redirecionar para página de sucesso
        const params = new URLSearchParams({
          patient_name: registrationData.paciente!.nome,
          patient_id: result.pacienteId || '',
          contract_id: result.contratoId || '',
        });
        window.location.href = `/cadastro-paciente/sucesso?${params.toString()}`;
      } catch (error) {
        console.error(
          '❌ [PatientRegistrationSteps] Erro ao finalizar cadastro:',
          error
        );
        alert(
          `Erro ao finalizar cadastro: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
        );
      } finally {
        setIsLoadingContract(false);
      }
    }, [registrationData]);

    // Handler para rejeição do contrato
    const handleContractReject = useCallback(() => {
      console.log('❌ [PatientRegistrationSteps] handleContractReject');
      // Voltar para revisão
      setCurrentStep('review');
    }, []);

    // Handler para voltar etapa
    const handleBack = useCallback(() => {
      switch (currentStep) {
        case 'responsible-identification':
          setCurrentStep('whatsapp');
          break;
        case 'responsible-data':
          setCurrentStep('responsible-identification');
          break;
        case 'address':
          setCurrentStep('responsible-data');
          break;
        case 'financial-responsible':
          setCurrentStep('address');
          break;
        case 'patient-data':
          // Se tem responsável financeiro definido, volta para financial-responsible
          // Se não (usuário existente), volta para address
          if (
            registrationData.responsavelFinanceiroMesmoQueLegal !== undefined
          ) {
            setCurrentStep('financial-responsible');
          } else {
            setCurrentStep('address');
          }
          break;
        case 'pediatrician':
          setCurrentStep('patient-data');
          break;
        case 'authorizations':
          setCurrentStep('pediatrician');
          break;
        case 'review':
          setCurrentStep('authorizations');
          break;
        case 'contract':
          setCurrentStep('review');
          break;
        default:
          break;
      }
    }, [currentStep, registrationData.responsavelFinanceiroMesmoQueLegal]);

    // Calcular progresso (etapas válidas)
    const { stepNumber, totalSteps } = useMemo(() => {
      // Etapas básicas que sempre existem
      const stepMapping: Record<
        RegistrationStep,
        { baseStep: number; total: number }
      > = {
        whatsapp: { baseStep: 1, total: 10 },
        'responsible-identification': { baseStep: 2, total: 10 },
        'responsible-data': { baseStep: 3, total: 10 },
        address: { baseStep: 4, total: 10 },
        'financial-responsible': { baseStep: 5, total: 10 },
        'patient-data': { baseStep: 6, total: 10 },
        pediatrician: { baseStep: 7, total: 10 },
        authorizations: { baseStep: 8, total: 10 },
        review: { baseStep: 9, total: 10 },
        contract: { baseStep: 10, total: 10 },
      };

      const mapping = stepMapping[currentStep] || { baseStep: 1, total: 10 };
      return { stepNumber: mapping.baseStep, totalSteps: mapping.total };
    }, [currentStep]);

    // Renderizar etapa atual
    const renderCurrentStep = () => {
      switch (currentStep) {
        case 'whatsapp':
          return (
            <WhatsAppValidationStep
              onContinue={handleWhatsAppContinue}
              onExistingPersonContinue={handleExistingPersonContinue}
            />
          );

        case 'responsible-identification':
          return (
            <ResponsibleIdentificationStep
              onContinue={handleResponsibleIdentification}
              onBack={handleBack}
              defaultValue={registrationData.isSelfResponsible}
            />
          );

        case 'responsible-data':
          return (
            <ResponsibleDataStep
              onContinue={handleResponsibleData}
              onBack={handleBack}
              defaultValues={registrationData.responsavelLegal}
              whatsappNumber={
                registrationData.phoneNumber
                  ? `(${registrationData.phoneNumber.slice(0, 2)}) ${registrationData.phoneNumber.slice(2, 7)}-${registrationData.phoneNumber.slice(7)}`
                  : undefined
              }
            />
          );

        case 'address':
          return (
            <AddressStep
              onContinue={handleAddress}
              onBack={handleBack}
              initialData={registrationData.endereco}
            />
          );

        case 'financial-responsible':
          return (
            <FinancialResponsibleStep
              onContinue={handleFinancialResponsible}
              onBack={handleBack}
              defaultValue={registrationData.responsavelFinanceiroMesmoQueLegal}
            />
          );

        case 'patient-data':
          return (
            <PatientDataStep
              onContinue={handlePatientData}
              onBack={handleBack}
              initialData={registrationData.paciente}
            />
          );

        case 'pediatrician':
          return (
            <PediatricianStep
              onContinue={handlePediatrician}
              onBack={handleBack}
              initialData={registrationData.pediatra}
            />
          );

        case 'authorizations':
          return (
            <AuthorizationsStep
              onContinue={handleAuthorizations}
              onBack={handleBack}
              initialData={registrationData.autorizacoes}
            />
          );

        case 'review':
          return (
            <ReviewStep
              onConfirm={handleReview}
              onEdit={(step) => {
                console.log(
                  '✏️ [PatientRegistrationSteps] Editando etapa:',
                  step
                );
                setCurrentStep(step as RegistrationStep);
              }}
              data={{
                phoneNumber: registrationData.phoneNumber,
                responsavel: registrationData.responsavelLegal,
                endereco: registrationData.endereco,
                responsavelFinanceiroMesmoQueLegal:
                  registrationData.responsavelFinanceiroMesmoQueLegal,
                responsavelFinanceiro: registrationData.responsavelFinanceiro,
                paciente: registrationData.paciente,
                pediatra: registrationData.pediatra,
                autorizacoes: registrationData.autorizacoes,
                existingPersonId: registrationData.existingPersonId,
                existingUserData: registrationData.existingUserData,
              }}
              isLoading={isLoadingContract}
            />
          );

        case 'contract':
          return (
            <ContractReviewStep
              contractContent={registrationData.contrato?.contractContent || ''}
              onAccept={handleContractAccept}
              onReject={handleContractReject}
              isLoading={isLoadingContract}
            />
          );

        default:
          return null;
      }
    };

    return (
      <div className={cn('w-full min-h-screen py-8 px-4', className)}>
        {/* Indicador de progresso */}
        <ProgressIndicator
          currentStep={stepNumber}
          totalSteps={totalSteps}
          className="mb-8"
        />

        {/* Etapa atual */}
        <div className="w-full">{renderCurrentStep()}</div>
      </div>
    );
  });

PatientRegistrationSteps.displayName = 'PatientRegistrationSteps';
