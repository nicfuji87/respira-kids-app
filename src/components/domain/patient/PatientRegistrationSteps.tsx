import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import {
  FinancialResponsibleStep,
  type FinancialResponsibleData,
} from '@/components/composed/FinancialResponsibleStep';
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
import { Button } from '@/components/primitives/button';
import { AlertCircle, Check, Copy, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cleanCPF } from '@/lib/cpf-validator';
import {
  generateContractPreview,
  buildUsoImagemVars,
  type ContractVariables,
} from '@/lib/contract-api';
import {
  finalizePatientRegistration,
  type FinalizationData,
} from '@/lib/registration-finalization-api';
import { supabase } from '@/lib/supabase';
import { useRegistrationLogger } from '@/hooks/useRegistrationLogger';
import type { RegistrationStepName } from '@/lib/registration-logger';

// AI dev note: PatientRegistrationSteps - Domain component que gerencia fluxo de cadastro público
// Etapas: 1) WhatsApp validation, 2) Identificação responsável, 3) Dados responsável, etc.

export type RegistrationStep =
  | 'whatsapp'
  | 'responsible-identification'
  | 'not-responsible'
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
  numero_endereco?: string; // AI dev note: Corrigindo nome do campo para match com vw_usuarios_admin
  complemento_endereco?: string; // AI dev note: Corrigindo nome do campo para match com vw_usuarios_admin
  bairro?: string;
  cidade?: string; // AI dev note: Campo correto da view vw_usuarios_admin
  estado?: string; // AI dev note: Campo correto da view vw_usuarios_admin
}

// AI dev note: Endereço de um usuário existente só pode ser reaproveitado (pulando a
// etapa 'address') se estiver completo E o estado tiver exatamente 2 caracteres —
// é o que a constraint enderecos_estado_check exige no banco. Cadastros antigos podem
// ter endereço vazio/incompleto; sem esta checagem a etapa era pulada e o cadastro
// quebrava no finalize sem que o usuário tivesse como corrigir o dado.
function hasValidExistingAddress(
  existingUserData?: ExistingUserFullData
): boolean {
  return !!(
    existingUserData?.cep &&
    existingUserData?.logradouro &&
    existingUserData?.bairro &&
    existingUserData?.cidade &&
    existingUserData?.estado &&
    existingUserData.estado.trim().length === 2
  );
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
  responsavelFinanceiro?: FinancialResponsibleData;

  // Etapa 6: Dados do Paciente
  paciente?: PatientData;

  // Etapa 7: Pediatra
  pediatra?: PediatricianData;

  // Etapa 8: Autorizações
  autorizacoes?: AuthorizationsData;

  // Etapa 10: Contrato
  contrato?: {
    contractContent: string;
    contractVariables?: ContractVariables; // Variáveis do contrato para gerar ao aceitar
    contractId?: string; // ID será gerado apenas quando usuário aceitar
  };
}

export interface PatientRegistrationStepsProps {
  onComplete?: (data: PatientRegistrationData) => void;
  className?: string;
}

// AI dev note: Persistência do progresso em sessionStorage — o fluxo obriga a
// trocar de app no celular (código do WhatsApp) e o navegador pode descartar a
// aba; sem isso o usuário perdia as 10 etapas. sessionStorage (e NUNCA
// localStorage) porque os dados contêm PII (CPF/endereço) e devem morrer com a
// aba. Nunca logar o conteúdo do rascunho no console.
const DRAFT_STORAGE_KEY = 'rk-cadastro-paciente-draft';

const VALID_REGISTRATION_STEPS: RegistrationStep[] = [
  'whatsapp',
  'responsible-identification',
  'not-responsible',
  'responsible-data',
  'address',
  'financial-responsible',
  'patient-data',
  'pediatrician',
  'authorizations',
  'review',
  'contract',
];

interface RegistrationDraft {
  currentStep: RegistrationStep;
  registrationData: Partial<PatientRegistrationData>;
  savedAt: string;
}

function loadRegistrationDraft(): RegistrationDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RegistrationDraft> | null;
    // Validação mínima de shape antes de reidratar
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.currentStep !== 'string' ||
      !VALID_REGISTRATION_STEPS.includes(
        parsed.currentStep as RegistrationStep
      ) ||
      !parsed.registrationData ||
      typeof parsed.registrationData !== 'object' ||
      typeof parsed.registrationData.whatsappValidated !== 'boolean'
    ) {
      return null;
    }
    return parsed as RegistrationDraft;
  } catch {
    // Rascunho corrompido/indisponível: começa do zero (sem logar conteúdo)
    return null;
  }
}

function clearRegistrationDraft() {
  try {
    sessionStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // sessionStorage indisponível: nada a limpar
  }
}

// AI dev note: WhatsApp de contato da clínica (mesmo número usado em
// SharedSchedulePage). Se mudar, atualizar nos dois lugares.
const CLINIC_WHATSAPP_URL = 'https://wa.me/556181446666';

// AI dev note: Tela intermediária quando a pessoa indica que NÃO é o
// responsável legal. Antes o fluxo resetava as etapas na hora, sem aviso;
// agora explica, oferece copiar o link para enviar ao responsável e só
// recomeça após confirmação explícita ("Voltar" preserva os dados).
const NotResponsibleNotice: React.FC<{
  onBack: () => void;
  onRestart: () => void;
}> = ({ onBack, onRestart }) => {
  const [copied, setCopied] = useState(false);
  const registrationLink = `${window.location.origin}/#/cadastro-paciente`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(registrationLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard indisponível: o link continua visível para cópia manual
    }
  };

  return (
    <div className="w-full max-w-md mx-auto px-4 space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-semibold text-foreground">
          O cadastro deve ser feito pelo responsável legal
        </h2>
        <p className="text-sm text-muted-foreground">
          Sem problemas! Envie este link para o responsável legal do paciente
          fazer o cadastro:
        </p>
      </div>

      <div className="p-3 bg-muted rounded-lg border text-sm break-all text-center">
        {registrationLink}
      </div>

      <Button
        type="button"
        onClick={handleCopy}
        size="lg"
        className="w-full h-12 gap-2"
      >
        {copied ? (
          <>
            <Check className="w-4 h-4" />
            Link copiado!
          </>
        ) : (
          <>
            <Copy className="w-4 h-4" />
            Copiar link
          </>
        )}
      </Button>

      <div className="space-y-3">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          size="lg"
          className="w-full h-12"
        >
          Voltar (meus dados continuam preenchidos)
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onRestart}
          size="lg"
          className="w-full h-12 text-destructive hover:text-destructive"
        >
          Entendi, recomeçar
        </Button>
      </div>
    </div>
  );
};

// AI dev note: Card de erro amigável no lugar do alert() técnico. NUNCA
// exibir error.message cru para o responsável — detalhes ficam só no console
// (sem PII). Os dados preenchidos são preservados para tentar de novo.
const RegistrationErrorCard: React.FC<{ onRetry: () => void }> = ({
  onRetry,
}) => (
  <div className="w-full max-w-md mx-auto px-4 space-y-6">
    <div className="space-y-2 text-center">
      <AlertCircle
        className="w-12 h-12 text-destructive mx-auto"
        aria-hidden="true"
      />
      <h2 className="text-2xl font-semibold text-foreground">
        Não conseguimos concluir seu cadastro
      </h2>
      <p className="text-sm text-muted-foreground">
        Algo deu errado do nosso lado. Seus dados continuam preenchidos — você
        pode tentar novamente agora ou falar com a clínica.
      </p>
    </div>

    <Button type="button" onClick={onRetry} size="lg" className="w-full h-12">
      Tentar novamente
    </Button>

    <a
      href={CLINIC_WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-center gap-2 p-3 rounded-lg border hover:bg-accent transition-colors"
    >
      <MessageCircle className="w-4 h-4 text-green-600" aria-hidden="true" />
      <span className="text-sm font-medium">
        Falar com a clínica no WhatsApp
      </span>
    </a>
  </div>
);

export const PatientRegistrationSteps =
  React.memo<PatientRegistrationStepsProps>(({ className }) => {
    // Reidrata rascunho salvo (se houver) — inicializador lazy roda 1x no mount
    const [initialDraft] = useState<RegistrationDraft | null>(
      loadRegistrationDraft
    );
    const [currentStep, setCurrentStep] = useState<RegistrationStep>(
      initialDraft?.currentStep ?? 'whatsapp'
    );
    const [registrationData, setRegistrationData] = useState<
      Partial<PatientRegistrationData>
    >(
      initialDraft?.registrationData ?? {
        whatsappValidated: false,
      }
    );
    const [isLoadingContract, setIsLoadingContract] = useState(false);
    // AI dev note: erro fatal de submissão ('contract' = geração do contrato
    // falhou na review; 'finalization' = Edge Function falhou no aceite).
    // Mostra card amigável no wizard em vez de alert() com mensagem técnica.
    const [submissionError, setSubmissionError] = useState<
      'contract' | 'finalization' | null
    >(null);

    // AI dev note: Autosave do progresso. Os dados só mudam em transição de
    // etapa (cada step guarda estado local e sobe no "continuar"), então salvar
    // imediato é barato — e evita perder o save quando o usuário troca de app
    // logo em seguida (timers de debounce ficam suspensos em aba de background).
    useEffect(() => {
      const hasProgress =
        currentStep !== 'whatsapp' || !!registrationData.whatsappValidated;
      try {
        if (!hasProgress) {
          // Sem progresso (início ou reset explícito do fluxo): remove o rascunho
          sessionStorage.removeItem(DRAFT_STORAGE_KEY);
          return;
        }
        const draft: RegistrationDraft = {
          currentStep,
          registrationData,
          savedAt: new Date().toISOString(),
        };
        sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
      } catch {
        // Quota/indisponibilidade: segue sem persistir (nunca logar os dados)
      }
    }, [currentStep, registrationData]);

    // Hook de logging para rastreamento do processo
    const logger = useRegistrationLogger();

    // AI dev note: Helper para compatibilidade com chamadas antigas de log
    // Mapeia steps do fluxo local para RegistrationStepName da lib
    const log = useCallback(
      (
        eventType:
          | 'step_started'
          | 'step_completed'
          | 'validation_error'
          | 'api_error'
          | 'success',
        step: string,
        data?: unknown
      ) => {
        // Mapear steps locais para RegistrationStepName
        const stepMapping: Record<string, RegistrationStepName> = {
          whatsapp: 'whatsapp',
          'responsible-identification': 'responsible',
          'not-responsible': 'responsible',
          'responsible-data': 'responsible',
          address: 'address',
          'financial-responsible': 'responsible',
          'patient-data': 'patient',
          patient: 'patient',
          pediatrician: 'pediatrician',
          authorizations: 'authorizations',
          review: 'review',
          contract: 'review',
          finalization: 'finalization',
        };

        const mappedStep = stepMapping[step] || 'review';

        switch (eventType) {
          case 'step_started':
            logger.logStepStarted(mappedStep);
            break;
          case 'step_completed':
            logger.logStepCompleted(
              mappedStep,
              data as Record<string, unknown> | undefined
            );
            break;
          case 'validation_error':
            logger.logValidationError(
              mappedStep,
              (data || {}) as Record<string, unknown>
            );
            break;
          case 'api_error':
            logger.logApiError(mappedStep, data as Error);
            break;
          case 'success':
            logger.logSuccess(data as Parameters<typeof logger.logSuccess>[0]);
            break;
        }
      },
      [logger]
    );

    // TODO: onComplete será usado quando implementar a etapa final (após aceite do contrato)

    // Handler para conclusão da etapa de WhatsApp (pessoa nova)
    const handleWhatsAppContinue = useCallback(
      (data: { phoneNumber: string; personId?: string }) => {
        // AI dev note: nunca logar telefone/PII no console
        console.log(
          '🆕 [PatientRegistrationSteps] handleWhatsAppContinue - Usuário NOVO'
        );

        // Log de conclusão da etapa WhatsApp
        log('step_completed', 'whatsapp', { phoneNumber: data.phoneNumber });

        setRegistrationData((prev) => ({
          ...prev,
          phoneNumber: data.phoneNumber,
          existingPersonId: data.personId,
          whatsappValidated: true,
        }));

        console.log(
          '➡️ [PatientRegistrationSteps] Avançando para responsible-identification (novo usuário)'
        );
        // Log de início da próxima etapa
        log('step_started', 'responsible-identification');

        // Avançar para identificação do responsável
        setCurrentStep('responsible-identification');
      },
      [log]
    );

    // Handler para pessoa existente querendo cadastrar novo paciente
    const handleExistingPersonContinue = useCallback(
      (personId: string, existingUserData?: ExistingUserFullData) => {
        console.log(
          '🔄 [PatientRegistrationSteps] handleExistingPersonContinue - personId:',
          personId
        );

        // Log de conclusão da etapa WhatsApp (pessoa existente)
        log('step_completed', 'whatsapp', { existingPersonId: personId });

        // AI dev note: Para usuários existentes, extrair phoneNumber do telefone cadastrado
        // Isso garante que o contrato terá o telefone preenchido corretamente
        const phoneFromExisting = existingUserData?.telefone
          ? existingUserData.telefone.toString().replace(/^55/, '') // Remover código do país
          : '';

        setRegistrationData((prev) => ({
          ...prev,
          existingPersonId: personId,
          existingUserData,
          whatsappValidated: true,
          phoneNumber: phoneFromExisting, // AI dev note: Definir phoneNumber para contrato
        }));

        console.log(
          '➡️ [PatientRegistrationSteps] Avançando para responsible-identification'
        );
        // Log de início da próxima etapa
        log('step_started', 'responsible-identification');

        // Avançar para identificação do responsável
        setCurrentStep('responsible-identification');
      },
      [log]
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

        // Log de conclusão da identificação
        log('step_completed', 'responsible-identification', {
          isSelfResponsible,
        });

        setRegistrationData((prev) => ({
          ...prev,
          isSelfResponsible,
        }));

        if (isSelfResponsible) {
          // Se pessoa EXISTE e é o responsável → pular direto para financial-responsible,
          // MAS só se o endereço já cadastrado for válido e completo. Caso contrário,
          // manda para a etapa 'address' (pré-preenchida) para o usuário corrigir.
          if (registrationData.existingPersonId) {
            if (hasValidExistingAddress(registrationData.existingUserData)) {
              console.log(
                '✅ [PatientRegistrationSteps] Usuário existente com endereço válido → pula direto para financial-responsible'
              );
              log('step_started', 'financial-responsible');
              setCurrentStep('financial-responsible');
            } else {
              console.log(
                '⚠️ [PatientRegistrationSteps] Usuário existente com endereço incompleto/inválido → vai para address'
              );
              const existing = registrationData.existingUserData;
              setRegistrationData((prev) => ({
                ...prev,
                endereco: {
                  cep: existing?.cep || '',
                  logradouro: existing?.logradouro || '',
                  bairro: existing?.bairro || '',
                  cidade: existing?.cidade || '',
                  estado: existing?.estado || '',
                  numero: existing?.numero_endereco || '',
                  complemento: existing?.complemento_endereco || undefined,
                },
              }));
              log('step_started', 'address');
              setCurrentStep('address');
            }
          } else {
            // Pessoa NOVA e é o responsável → cadastrar dados do responsável primeiro
            console.log(
              '🆕 [PatientRegistrationSteps] Usuário novo → vai para responsible-data'
            );
            log('step_started', 'responsible-data');
            setCurrentStep('responsible-data');
          }
        } else {
          // AI dev note: Pessoa NÃO é responsável — NÃO resetar nada ainda.
          // Mostrar tela de orientação (enviar link ao responsável); o reset
          // só acontece se a pessoa confirmar "Entendi, recomeçar".
          console.log(
            '🔄 [PatientRegistrationSteps] Não é responsável → tela de orientação'
          );
          log('step_started', 'not-responsible');
          setCurrentStep('not-responsible');
        }
      },
      [
        registrationData.existingPersonId,
        registrationData.existingUserData,
        log,
      ]
    );

    // Handler para dados do responsável
    const handleResponsibleData = useCallback(
      (data: ResponsibleData) => {
        // AI dev note: não logar o payload (nome/CPF/e-mail = PII)
        console.log('✅ [PatientRegistrationSteps] handleResponsibleData');

        // Log de conclusão da etapa de dados do responsável
        log('step_completed', 'responsible-data', data);

        setRegistrationData((prev) => ({
          ...prev,
          responsavelLegal: data,
        }));

        console.log(
          '➡️ [PatientRegistrationSteps] Avançando para address (ETAPA 4)'
        );
        // Log de início da próxima etapa
        log('step_started', 'address');

        // Após dados do responsável, cadastrar endereço
        setCurrentStep('address');
      },
      [log]
    );

    // Handler para endereço
    const handleAddress = useCallback(
      (data: AddressData) => {
        // AI dev note: não logar o payload (endereço = PII)
        console.log('✅ [PatientRegistrationSteps] handleAddress');

        // Log de conclusão da etapa de endereço
        log('step_completed', 'address', data);

        setRegistrationData((prev) => ({
          ...prev,
          endereco: data,
        }));

        // SEMPRE perguntar sobre responsável financeiro, mesmo para usuários existentes
        // Cada paciente pode ter um responsável financeiro diferente
        console.log(
          '➡️ [PatientRegistrationSteps] Avançando para financial-responsible (ETAPA 5)'
        );
        console.log(
          '💡 [PatientRegistrationSteps] Perguntando sobre responsável financeiro para ESTE paciente'
        );
        // Log de início da próxima etapa
        log('step_started', 'financial-responsible');

        setCurrentStep('financial-responsible');
      },
      [log]
    );

    // Handler para responsável financeiro
    const handleFinancialResponsible = useCallback(
      (data: FinancialResponsibleData) => {
        // AI dev note: não logar o payload (pode conter nome/CPF/telefone = PII)
        console.log('✅ [PatientRegistrationSteps] handleFinancialResponsible');

        // Log de conclusão da etapa
        log('step_completed', 'financial-responsible', data);

        setRegistrationData((prev) => ({
          ...prev,
          responsavelFinanceiro: data,
        }));

        // Sempre avança para dados do paciente
        console.log(
          '➡️ [PatientRegistrationSteps] Avançando para patient-data (ETAPA 6)'
        );
        log('step_started', 'patient-data');
        setCurrentStep('patient-data');
      },
      [log]
    );

    // Handler para dados do paciente
    const handlePatientData = useCallback(
      (data: PatientData) => {
        // AI dev note: não logar o payload (nome/CPF/nascimento = PII)
        console.log('✅ [PatientRegistrationSteps] handlePatientData');

        // Log de conclusão da etapa
        log('step_completed', 'patient', data);

        setRegistrationData((prev) => ({
          ...prev,
          paciente: data,
        }));

        console.log(
          '➡️ [PatientRegistrationSteps] Avançando para pediatrician (ETAPA 7)'
        );
        // Log de início da próxima etapa
        log('step_started', 'pediatrician');

        // Avançar para etapa de pediatra
        setCurrentStep('pediatrician');
      },
      [log]
    );

    // Handler para pediatra
    const handlePediatrician = useCallback(
      (data: PediatricianData) => {
        console.log('✅ [PatientRegistrationSteps] handlePediatrician');

        // Log de conclusão da etapa
        log('step_completed', 'pediatrician', data);

        setRegistrationData((prev) => ({
          ...prev,
          pediatra: data,
        }));

        console.log(
          '➡️ [PatientRegistrationSteps] Avançando para authorizations (ETAPA 8)'
        );
        // Log de início da próxima etapa
        log('step_started', 'authorizations');

        // Avançar para etapa de autorizações
        setCurrentStep('authorizations');
      },
      [log]
    );

    // Handler para autorizações
    const handleAuthorizations = useCallback(
      (data: AuthorizationsData) => {
        console.log('✅ [PatientRegistrationSteps] handleAuthorizations');

        // Log de conclusão da etapa
        log('step_completed', 'authorizations', data);

        setRegistrationData((prev) => ({
          ...prev,
          autorizacoes: data,
        }));

        console.log(
          '➡️ [PatientRegistrationSteps] Avançando para review (ETAPA 9)'
        );
        // Log de início da próxima etapa
        log('step_started', 'review');

        setCurrentStep('review');
      },
      [log]
    );

    // Handler para revisão e geração do contrato
    const handleReview = useCallback(async () => {
      console.log(
        '📝 [PatientRegistrationSteps] handleReview - Gerando contrato'
      );
      setIsLoadingContract(true);

      try {
        // Determinar quem é o contratante (para o contrato)
        // Se responsável financeiro é o mesmo que legal, usar dados do responsável legal ou existente
        // Se responsável financeiro é diferente, usar dados da pessoa encontrada
        const existingUserData = registrationData.existingUserData;
        const responsavelFinanceiro = registrationData.responsavelFinanceiro;

        // AI dev note: NOVA LÓGICA - Responsável LEGAL sempre é o contratante
        // Responsável FINANCEIRO só é mencionado se for diferente do legal

        console.log('📋 [PatientRegistrationSteps] Determinando contratante:', {
          isSameAsLegal: responsavelFinanceiro?.isSameAsLegal,
          hasPersonData: !!responsavelFinanceiro?.personData,
          hasNewPersonData: !!responsavelFinanceiro?.newPersonData,
          hasExistingUserData: !!existingUserData,
          hasResponsavelLegal: !!registrationData.responsavelLegal,
        });

        // SEMPRE usar responsável LEGAL como contratante
        const responsavelLegalNome =
          existingUserData?.nome ||
          registrationData.responsavelLegal?.nome ||
          '';
        const responsavelLegalCpf =
          existingUserData?.cpf_cnpj ||
          registrationData.responsavelLegal?.cpf ||
          '';
        const responsavelLegalEmail =
          existingUserData?.email ||
          registrationData.responsavelLegal?.email ||
          '';

        // AI dev note: não logar nome do contratante (PII)
        console.log(
          '✅ [PatientRegistrationSteps] Contratante (Responsável Legal) definido'
        );

        // Determinar se precisa mencionar responsável financeiro separadamente
        let responsavelLegalFinanceiro = '';
        let clausulaResponsavelFinanceiro = '';

        if (responsavelFinanceiro?.isSameAsLegal) {
          // CASO 1: Mesma pessoa - mencionar "e Financeiro"
          responsavelLegalFinanceiro = 'e Financeiro';
          clausulaResponsavelFinanceiro = '';
          console.log(
            '✅ [PatientRegistrationSteps] Responsável Legal = Financeiro'
          );
        } else {
          // CASO 2 e 3: Pessoas diferentes - adicionar cláusula separada
          responsavelLegalFinanceiro = '';

          let financeiroNome = '';
          let financeiroCpf = '';
          let financeiroTelefone = '';
          let financeiroEmail = '';

          if (responsavelFinanceiro?.personData) {
            // Pessoa existente encontrada por CPF
            financeiroNome = responsavelFinanceiro.personData.nome;
            financeiroCpf = responsavelFinanceiro.personData.cpf;
            financeiroEmail = responsavelFinanceiro.personData.email || '';
            const tel = responsavelFinanceiro.personData.telefone || '';
            financeiroTelefone = tel
              ? `(${tel.slice(0, 2)}) ${tel.slice(2, 7)}-${tel.slice(7)}`
              : '';
          } else if (responsavelFinanceiro?.newPersonData) {
            // Nova pessoa cadastrada
            financeiroNome = responsavelFinanceiro.newPersonData.nome;
            financeiroCpf = responsavelFinanceiro.newPersonData.cpf;
            financeiroEmail = responsavelFinanceiro.newPersonData.email;
            const tel = responsavelFinanceiro.newPersonData.whatsapp;
            financeiroTelefone = tel
              ? `(${tel.slice(0, 2)}) ${tel.slice(2, 7)}-${tel.slice(7)}`
              : '';
          }

          // Formatar CPF com máscara
          const formatarCpf = (cpf: string) => {
            const limpo = cpf.replace(/\D/g, '');
            return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
          };

          if (financeiroNome && financeiroCpf) {
            clausulaResponsavelFinanceiro = `

**Parágrafo único:** Os pagamentos referentes aos serviços prestados serão realizados por **${financeiroNome}**, CPF nº ${formatarCpf(financeiroCpf)}, telefone ${financeiroTelefone}, email ${financeiroEmail}, na qualidade de **RESPONSÁVEL FINANCEIRO**.`;

            // AI dev note: não logar nome do responsável financeiro (PII)
            console.log(
              '✅ [PatientRegistrationSteps] Responsável Financeiro DIFERENTE do legal'
            );
          }
        }

        // Manter variáveis antigas para compatibilidade temporária
        const contratanteNome = responsavelLegalNome;
        const contratanteCpf = responsavelLegalCpf;
        const contratanteEmail = responsavelLegalEmail;

        // Preparar variáveis do contrato conforme plano
        // Formatar telefone para (XX) XXXXX-XXXX
        const telefoneFormatado = registrationData.phoneNumber
          ? `(${registrationData.phoneNumber.slice(0, 2)}) ${registrationData.phoneNumber.slice(2, 7)}-${registrationData.phoneNumber.slice(7)}`
          : '';

        // AI dev note: Converter data de nascimento de formato ISO (YYYY-MM-DD) para formato brasileiro (dd/mm/aaaa)
        const formatarDataBrasileira = (dataISO: string): string => {
          if (!dataISO) return '';
          const [year, month, day] = dataISO.split('-');
          return `${day}/${month}/${year}`;
        };

        // AI dev note: Formatar endereço completo evitando vírgulas duplas quando número está vazio
        // AI dev note: registrationData.endereco tem prioridade — é o valor que passou pela
        // etapa 'address' (validado). existingUserData é só fallback para quando essa etapa
        // foi pulada (endereço já cadastrado e válido).
        const formatarEnderecoCompleto = () => {
          const logradouro =
            registrationData.endereco?.logradouro ||
            existingUserData?.logradouro ||
            '';
          const numero =
            registrationData.endereco?.numero ||
            existingUserData?.numero_endereco ||
            '';
          const complemento =
            registrationData.endereco?.complemento ||
            existingUserData?.complemento_endereco ||
            '';
          const bairro =
            registrationData.endereco?.bairro || existingUserData?.bairro || '';
          const cidade =
            registrationData.endereco?.cidade || existingUserData?.cidade || '';
          const uf =
            registrationData.endereco?.estado || existingUserData?.estado || '';
          const cep =
            registrationData.endereco?.cep || existingUserData?.cep || '';

          // Montar endereço: se número vazio, não incluir a vírgula extra
          let endereco = logradouro;
          if (numero && numero.trim()) {
            endereco += `, ${numero}`;
          }
          if (complemento && complemento.trim()) {
            endereco += ` ${complemento}`;
          }
          if (bairro) {
            endereco += `, ${bairro}`;
          }
          if (cidade) {
            endereco += `, ${cidade}`;
          }
          if (uf) {
            endereco += ` - ${uf}`;
          }
          if (cep) {
            endereco += `, CEP ${cep}`;
          }
          return endereco;
        };

        const contractVariables: ContractVariables = {
          // Novas variáveis - Responsável Legal
          responsavelLegalNome: responsavelLegalNome,
          responsavelLegalCpf: responsavelLegalCpf,
          responsavelLegalTelefone: telefoneFormatado,
          responsavelLegalEmail: responsavelLegalEmail,
          responsavelLegalFinanceiro: responsavelLegalFinanceiro,
          clausulaResponsavelFinanceiro: clausulaResponsavelFinanceiro,

          // Variáveis antigas (compatibilidade temporária)
          contratante: contratanteNome,
          cpf: contratanteCpf,
          telefone: telefoneFormatado,
          email: contratanteEmail,
          endereco_completo: formatarEnderecoCompleto(),
          logradouro:
            registrationData.endereco?.logradouro ||
            existingUserData?.logradouro ||
            '',
          numero:
            registrationData.endereco?.numero ||
            existingUserData?.numero_endereco ||
            '',
          complemento:
            registrationData.endereco?.complemento ||
            existingUserData?.complemento_endereco,
          bairro:
            registrationData.endereco?.bairro || existingUserData?.bairro || '',
          cidade:
            registrationData.endereco?.cidade || existingUserData?.cidade || '',
          uf:
            registrationData.endereco?.estado || existingUserData?.estado || '',
          cep: registrationData.endereco?.cep || existingUserData?.cep || '',
          paciente: registrationData.paciente?.nome || '',
          dnPac: formatarDataBrasileira(
            registrationData.paciente?.dataNascimento || ''
          ),
          cpfPac: registrationData.paciente?.cpf || 'não fornecido',
          hoje: new Date().toLocaleDateString('pt-BR'),
          // AI dev note: uso científico e redes sociais são autorizações
          // INDEPENDENTES — buildUsoImagemVars monta cada cláusula corretamente,
          // sem misturar/negar uma quando só a outra foi recusada.
          ...buildUsoImagemVars({
            usoCientifico:
              registrationData.autorizacoes?.usoCientifico ?? false,
            usoRedesSociais:
              registrationData.autorizacoes?.usoRedesSociais ?? false,
            usoNome: registrationData.autorizacoes?.usoNome ?? false,
          }),
        };

        // Gerar PREVIEW do contrato (sem salvar no banco)
        // O contrato será salvo apenas quando o usuário aceitar
        console.log(
          '📄 [PatientRegistrationSteps] Gerando PREVIEW do contrato (não salva no banco ainda)'
        );
        const contractPreview =
          await generateContractPreview(contractVariables);

        console.log(
          '✅ [PatientRegistrationSteps] Preview do contrato gerado:',
          contractPreview.templateNome
        );

        // Salvar preview e variáveis nos dados (para poder gerar o contrato depois)
        setRegistrationData((prev) => ({
          ...prev,
          contrato: {
            contractContent: contractPreview.conteudo,
            contractVariables: contractVariables, // Salvar as variáveis para usar ao aceitar
            contractId: undefined, // Não temos ID ainda (será gerado ao aceitar)
          },
        }));

        console.log(
          '➡️ [PatientRegistrationSteps] Avançando para contract (ETAPA 10)'
        );
        // Log de conclusão da revisão
        log('step_completed', 'review');
        // Log de início da visualização do contrato
        log('step_started', 'contract');

        setCurrentStep('contract');
      } catch (error) {
        console.error(
          '❌ [PatientRegistrationSteps] Erro ao gerar contrato:',
          error
        );
        // Log de erro ao gerar contrato
        log('api_error', 'review', {
          error:
            error instanceof Error ? error.message : 'Erro ao gerar contrato',
        });

        // AI dev note: sem alert() técnico — card amigável no próprio wizard
        setSubmissionError('contract');
      } finally {
        setIsLoadingContract(false);
      }
    }, [registrationData, log]);

    // Handler para aceite do contrato
    const handleContractAccept = useCallback(async () => {
      console.log(
        '🎯 [PatientRegistrationSteps] ====== INICIANDO FINALIZAÇÃO DE CADASTRO ======'
      );
      console.log(
        '📋 [PatientRegistrationSteps] Estado atual do registrationData:',
        {
          hasWhatsappJid: !!registrationData.whatsappJid,
          hasPhoneNumber: !!registrationData.phoneNumber,
          hasExistingPersonId: !!registrationData.existingPersonId,
          hasExistingUserData: !!registrationData.existingUserData,
          hasResponsavelLegal: !!registrationData.responsavelLegal,
          hasEndereco: !!registrationData.endereco,
          responsavelFinanceiroIsSame:
            registrationData.responsavelFinanceiro?.isSameAsLegal,
          hasResponsavelFinanceiro: !!registrationData.responsavelFinanceiro,
          hasPaciente: !!registrationData.paciente,
          hasPediatra: !!registrationData.pediatra,
          hasAutorizacoes: !!registrationData.autorizacoes,
          hasContrato: !!registrationData.contrato,
        }
      );
      setIsLoadingContract(true);

      try {
        console.log(
          '📋 [PatientRegistrationSteps] Preparando dados para Edge Function...'
        );

        // Verificar se temos as variáveis do contrato
        const contractVariables = registrationData.contrato?.contractVariables;
        if (!contractVariables) {
          throw new Error('Variáveis do contrato não encontradas');
        }

        console.log(
          '✅ [PatientRegistrationSteps] Variáveis do contrato preparadas'
        );

        // AI dev note: Simplificando preparação de telefone para usuários existentes
        const whatsappJid =
          registrationData.whatsappJid ||
          (registrationData.existingUserData?.telefone
            ? registrationData.existingUserData.telefone.toString()
            : '');

        const phoneNumber =
          registrationData.phoneNumber ||
          (registrationData.existingUserData?.telefone
            ? registrationData.existingUserData.telefone
                .toString()
                .replace(/^55/, '')
            : '');

        // Preparar dados para a Edge Function (agora com o ID do contrato salvo)
        const finalizationData: FinalizationData = {
          whatsappJid: whatsappJid,
          phoneNumber: phoneNumber,
          existingPersonId: registrationData.existingPersonId,
          existingUserData: registrationData.existingUserData,

          // Responsável Legal (apenas se for novo usuário)
          responsavelLegal:
            !registrationData.existingPersonId &&
            registrationData.responsavelLegal
              ? {
                  nome: registrationData.responsavelLegal.nome,
                  cpf: cleanCPF(registrationData.responsavelLegal.cpf), // AI dev note: Limpar CPF antes de enviar
                  email: registrationData.responsavelLegal.email,
                }
              : undefined,

          // Endereço - usar dados do existingUserData se endereco não estiver definido
          endereco: registrationData.endereco
            ? {
                cep: registrationData.endereco.cep,
                logradouro: registrationData.endereco.logradouro,
                bairro: registrationData.endereco.bairro,
                cidade: registrationData.endereco.cidade,
                estado: registrationData.endereco.estado,
                numero: registrationData.endereco.numero,
                complemento: registrationData.endereco.complemento,
              }
            : {
                cep: registrationData.existingUserData?.cep || '',
                logradouro: registrationData.existingUserData?.logradouro || '',
                bairro: registrationData.existingUserData?.bairro || '',
                cidade: registrationData.existingUserData?.cidade || '',
                estado: registrationData.existingUserData?.estado || '',
                numero:
                  registrationData.existingUserData?.numero_endereco || '',
                complemento:
                  registrationData.existingUserData?.complemento_endereco ||
                  undefined,
              },

          // Responsável Financeiro
          responsavelFinanceiroMesmoQueLegal:
            registrationData.responsavelFinanceiro?.isSameAsLegal ?? true,
          responsavelFinanceiroExistingId:
            registrationData.responsavelFinanceiro?.existingPersonId,
          newPersonData: registrationData.responsavelFinanceiro?.newPersonData
            ? {
                ...registrationData.responsavelFinanceiro.newPersonData,
                cpf: cleanCPF(
                  registrationData.responsavelFinanceiro.newPersonData.cpf
                ), // AI dev note: Limpar CPF antes de enviar
              }
            : undefined,

          // Paciente
          paciente: {
            nome: registrationData.paciente!.nome,
            dataNascimento: registrationData.paciente!.dataNascimento, // AI dev note: Já vem em formato ISO (yyyy-mm-dd) do DateInput
            sexo: registrationData.paciente!.sexo,
            cpf: registrationData.paciente!.cpf
              ? cleanCPF(registrationData.paciente!.cpf)
              : undefined, // AI dev note: Limpar CPF antes de enviar
            emitirNotaNomePaciente:
              registrationData.paciente!.emitirNotaNomePaciente,
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

          // Variáveis do contrato (Edge Function vai criar o contrato)
          contractVariables: contractVariables,
        };

        // AI dev note: NUNCA logar o payload de finalização (contém CPFs,
        // telefone, endereço e nomes). Apenas flags booleanas, sem valores.
        console.log('📋 [PatientRegistrationSteps] Dados preparados:', {
          hasWhatsappJid: !!finalizationData.whatsappJid,
          hasPhoneNumber: !!finalizationData.phoneNumber,
          hasExistingPersonId: !!finalizationData.existingPersonId,
          hasExistingUserData: !!finalizationData.existingUserData,
          hasResponsavelLegal: !!finalizationData.responsavelLegal,
          hasEndereco: !!finalizationData.endereco.cep,
          responsavelFinanceiroMesmoQueLegal:
            finalizationData.responsavelFinanceiroMesmoQueLegal,
          hasNewPersonData: !!finalizationData.newPersonData,
          hasPacienteCpf: !!finalizationData.paciente.cpf,
          hasPediatra: !!finalizationData.pediatra.nome,
          hasContractVariables: !!finalizationData.contractVariables,
        });

        console.log(
          '📤 [PatientRegistrationSteps] PASSO 3: Enviando dados para Edge Function...'
        );
        console.log(
          '⏱️ [PatientRegistrationSteps] Timestamp:',
          new Date().toISOString()
        );

        // Log de início da finalização
        log('step_started', 'finalization', {
          hasContract: !!registrationData.contrato,
        });

        // Chamar Edge Function (que vai criar paciente, responsáveis e assinar o contrato)
        const result = await finalizePatientRegistration(finalizationData);

        console.log(
          '📥 [PatientRegistrationSteps] Resposta recebida da Edge Function'
        );
        console.log('📋 [PatientRegistrationSteps] Success:', result.success);

        if (!result.success) {
          console.error(
            '❌ [PatientRegistrationSteps] Erro na finalização:',
            result.error
          );

          // Log de erro na API
          log('api_error', 'finalization', { error: result.error });

          // AI dev note: Se erro menciona que cadastro pode ter funcionado,
          // redirecionar mesmo assim (dados foram criados no backend)
          if (
            result.error &&
            result.error.includes('mas cadastro pode ter funcionado')
          ) {
            console.log(
              '⚠️ [PatientRegistrationSteps] Erro de comunicação mas cadastro pode ter funcionado - redirecionando'
            );
            // Cadastro persistido no backend: limpar rascunho antes de sair
            clearRegistrationDraft();
            // Redirecionar com dados básicos disponíveis
            const params = new URLSearchParams({
              patient_name: registrationData.paciente!.nome,
              patient_id: 'verificar', // Indicar que precisa verificação
              contract_id: registrationData.contrato?.contractId || '',
            });
            window.location.href = `/#/cadastro-paciente/sucesso?${params.toString()}`;
            return;
          }

          throw new Error(result.error || 'Erro ao finalizar cadastro');
        }

        console.log(
          '🎉 [PatientRegistrationSteps] ====== CADASTRO COMPLETO COM SUCESSO! ======'
        );
        console.log(
          '✅ [PatientRegistrationSteps] Paciente criado:',
          result.pacienteId
        );
        console.log(
          '✅ [PatientRegistrationSteps] Responsável legal:',
          result.responsavelLegalId
        );
        console.log(
          '✅ [PatientRegistrationSteps] Responsável financeiro:',
          result.responsavelFinanceiroId
        );
        console.log(
          '✅ [PatientRegistrationSteps] Contrato gerado (aguardando assinatura):',
          result.contratoId
        );

        // Log de sucesso total
        log('success', 'finalization', {
          pacienteId: result.pacienteId,
          contratoId: result.contratoId,
        });

        // Sucesso: limpar rascunho salvo antes de redirecionar
        clearRegistrationDraft();

        // Redirecionar para página de sucesso
        const params = new URLSearchParams({
          patient_name: registrationData.paciente!.nome,
          patient_id: result.pacienteId || '',
          contract_id: result.contratoId || '',
        });
        window.location.href = `/#/cadastro-paciente/sucesso?${params.toString()}`;
      } catch (error) {
        console.error(
          '❌ [PatientRegistrationSteps] Erro ao finalizar cadastro:',
          error
        );

        // Log de erro fatal
        log('api_error', 'finalization', {
          error: error instanceof Error ? error.message : 'Erro desconhecido',
          stack: error instanceof Error ? error.stack : undefined,
        });

        // AI dev note: Verificação adicional - consultar banco para ver se cadastro funcionou
        // mesmo com erro de comunicação da Edge Function
        console.log(
          '🔍 [PatientRegistrationSteps] Verificando se cadastro foi criado no backend...'
        );

        try {
          // AI dev note: Após a migração para assinatura digital via n8n/Assinafy,
          // o contrato agora é criado com status 'gerado' (aguardando assinatura).
          // A verificação de fallback aceita tanto 'gerado' quanto 'assinado'
          // como indicador de que o cadastro foi persistido no banco.
          if (!registrationData.contrato?.contractId) {
            console.log(
              '❌ [PatientRegistrationSteps] Sem ID de contrato para verificar'
            );
            throw error; // Re-lançar o erro original
          }

          const { data: contratoVerificacao } = await supabase
            .from('user_contracts')
            .select('id, status_contrato, pessoa_id')
            .eq('id', registrationData.contrato.contractId)
            .in('status_contrato', ['gerado', 'assinado'])
            .single();

          if (contratoVerificacao?.pessoa_id) {
            console.log(
              '✅ [PatientRegistrationSteps] Contrato encontrado no banco - cadastro funcionou!'
            );
            console.log(
              '📋 [PatientRegistrationSteps] Paciente ID encontrado:',
              contratoVerificacao.pessoa_id
            );

            // Cadastro confirmado no banco: limpar rascunho antes de sair
            clearRegistrationDraft();
            // Redirecionar para sucesso
            const params = new URLSearchParams({
              patient_name: registrationData.paciente!.nome,
              patient_id: contratoVerificacao.pessoa_id,
              contract_id: registrationData.contrato?.contractId || '',
            });
            window.location.href = `/#/cadastro-paciente/sucesso?${params.toString()}`;
            return;
          }
        } catch (verificationError) {
          console.error(
            '❌ [PatientRegistrationSteps] Erro na verificação:',
            verificationError
          );
        }

        // AI dev note: NUNCA mostrar error.message cru para o responsável —
        // card amigável no wizard; detalhes já foram logados no console.
        setSubmissionError('finalization');
      } finally {
        setIsLoadingContract(false);
      }
    }, [registrationData, log]);

    // Handler para rejeição do contrato
    const handleContractReject = useCallback(() => {
      console.log('❌ [PatientRegistrationSteps] handleContractReject');
      // Log de rejeição do contrato
      log('step_started', 'review');

      // Voltar para revisão
      setCurrentStep('review');
    }, [log]);

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
          // Se usuário existente: volta para responsible-identification
          // Se novo usuário: volta para responsible-data
          if (registrationData.existingPersonId) {
            setCurrentStep('responsible-identification');
          } else {
            setCurrentStep('responsible-data');
          }
          break;
        case 'financial-responsible':
          setCurrentStep('address');
          break;
        case 'patient-data':
          // SEMPRE volta para financial-responsible (agora é obrigatório para todos)
          setCurrentStep('financial-responsible');
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
    }, [currentStep, registrationData.existingPersonId]);

    // Calcular progresso (etapas válidas)
    const { stepNumber, totalSteps } = useMemo(() => {
      // Etapas básicas que sempre existem
      const stepMapping: Record<
        RegistrationStep,
        { baseStep: number; total: number }
      > = {
        whatsapp: { baseStep: 1, total: 10 },
        'responsible-identification': { baseStep: 2, total: 10 },
        'not-responsible': { baseStep: 2, total: 10 },
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

    const fiscalResponsible = useMemo(() => {
      const responsavelFinanceiro = registrationData.responsavelFinanceiro;

      if (responsavelFinanceiro?.isSameAsLegal) {
        return {
          nome:
            registrationData.existingUserData?.nome ||
            registrationData.responsavelLegal?.nome,
          cpf:
            registrationData.existingUserData?.cpf_cnpj ||
            registrationData.responsavelLegal?.cpf,
        };
      }

      if (responsavelFinanceiro?.personData) {
        return {
          nome: responsavelFinanceiro.personData.nome,
          cpf: responsavelFinanceiro.personData.cpf,
        };
      }

      if (responsavelFinanceiro?.newPersonData) {
        return {
          nome: responsavelFinanceiro.newPersonData.nome,
          cpf: responsavelFinanceiro.newPersonData.cpf,
        };
      }

      return undefined;
    }, [
      registrationData.existingUserData?.cpf_cnpj,
      registrationData.existingUserData?.nome,
      registrationData.responsavelFinanceiro,
      registrationData.responsavelLegal?.cpf,
      registrationData.responsavelLegal?.nome,
    ]);

    const responsavelCpfs = useMemo(
      () =>
        [
          registrationData.responsavelLegal?.cpf,
          registrationData.existingUserData?.cpf_cnpj,
          fiscalResponsible?.cpf,
        ].filter((cpf): cpf is string => Boolean(cpf)),
      [
        fiscalResponsible?.cpf,
        registrationData.existingUserData?.cpf_cnpj,
        registrationData.responsavelLegal?.cpf,
      ]
    );

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

        case 'not-responsible':
          return (
            <NotResponsibleNotice
              onBack={() => setCurrentStep('responsible-identification')}
              onRestart={() => {
                // Reset explícito (confirmado pela pessoa): limpa dados e
                // volta para a validação do WhatsApp do responsável legal
                setRegistrationData({
                  whatsappValidated: false,
                  isSelfResponsible: false,
                });
                setCurrentStep('whatsapp');
              }}
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
              defaultValue={registrationData.responsavelFinanceiro}
            />
          );

        case 'patient-data':
          return (
            <PatientDataStep
              onContinue={handlePatientData}
              onBack={handleBack}
              initialData={registrationData.paciente}
              responsavelCpf={
                registrationData.responsavelLegal?.cpf ||
                registrationData.existingUserData?.cpf_cnpj
              }
              responsavelCpfs={responsavelCpfs}
              fiscalResponsible={fiscalResponsible}
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
                  registrationData.responsavelFinanceiro?.isSameAsLegal,
                responsavelFinanceiro: (() => {
                  // Se é o mesmo que legal, não precisa exibir
                  if (registrationData.responsavelFinanceiro?.isSameAsLegal) {
                    return undefined;
                  }
                  // Se tem personData (pessoa existente encontrada por CPF)
                  if (registrationData.responsavelFinanceiro?.personData) {
                    return {
                      nome: registrationData.responsavelFinanceiro.personData
                        .nome,
                      cpf: registrationData.responsavelFinanceiro.personData
                        .cpf,
                      email:
                        registrationData.responsavelFinanceiro.personData
                          .email || '',
                      telefone:
                        registrationData.responsavelFinanceiro.personData
                          .telefone || '',
                      whatsappJid: '',
                      endereco: registrationData.endereco!,
                    };
                  }
                  // Se tem newPersonData (nova pessoa cadastrada)
                  if (registrationData.responsavelFinanceiro?.newPersonData) {
                    return {
                      nome: registrationData.responsavelFinanceiro.newPersonData
                        .nome,
                      cpf: registrationData.responsavelFinanceiro.newPersonData
                        .cpf,
                      email:
                        registrationData.responsavelFinanceiro.newPersonData
                          .email,
                      telefone:
                        registrationData.responsavelFinanceiro.newPersonData
                          .whatsapp,
                      whatsappJid:
                        registrationData.responsavelFinanceiro.newPersonData
                          .whatsappJid,
                      endereco: registrationData.endereco!,
                    };
                  }
                  return undefined;
                })(),
                paciente: registrationData.paciente,
                fiscalResponsible,
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
      <div className={cn('w-full min-h-screen py-8', className)}>
        {/* Indicador de progresso ÚNICO */}
        <div className="px-4 mb-6">
          <ProgressIndicator currentStep={stepNumber} totalSteps={totalSteps} />
        </div>

        {/* Etapa atual (ou card de erro amigável, se a submissão falhou) */}
        <div className="w-full">
          {submissionError ? (
            <RegistrationErrorCard onRetry={() => setSubmissionError(null)} />
          ) : (
            renderCurrentStep()
          )}
        </div>
      </div>
    );
  });

PatientRegistrationSteps.displayName = 'PatientRegistrationSteps';
