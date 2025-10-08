import React, { useState, useEffect, useCallback } from 'react';
import { PhoneInput } from '@/components/primitives/PhoneInput';
import { Input } from '@/components/primitives/input';
import { Button } from '@/components/primitives/button';
import { Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  validateWhatsAppAndCheckRegistration,
  sendValidationCode,
  validateCode,
  findExistingUserByPhone,
  trackRegistrationAttempt,
  type WhatsAppValidationResponse,
} from '@/lib/patient-registration-api';

// AI dev note: WhatsAppValidationStep - Etapa 1 do cadastro público de paciente
// Fluxo: 1) Valida WhatsApp 2) Envia código 3) Valida código
// Validação de código via Edge Function (hash SHA-256, rate limiting por IP)

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
  numero_endereco?: string; // AI dev note: Campo correto da view vw_usuarios_admin
  complemento_endereco?: string; // AI dev note: Campo correto da view vw_usuarios_admin
  bairro?: string;
  cidade?: string; // AI dev note: Campo correto da view vw_usuarios_admin
  estado?: string; // AI dev note: Campo correto da view vw_usuarios_admin
}

export interface WhatsAppValidationStepProps {
  onContinue: (data: { phoneNumber: string; personId?: string }) => void;
  onExistingPersonContinue?: (
    personId: string,
    existingUserData?: ExistingUserFullData
  ) => void;
  className?: string;
}

type ValidationState = 'phone-input' | 'code-sent' | 'code-validated';

export const WhatsAppValidationStep = React.memo<WhatsAppValidationStepProps>(
  ({ onContinue, onExistingPersonContinue, className }) => {
    const [phoneNumber, setPhoneNumber] = useState('');
    const [isValidating, setIsValidating] = useState(false);
    const [validationResult, setValidationResult] =
      useState<WhatsAppValidationResponse | null>(null);
    const [errorMessage, setErrorMessage] = useState('');

    // Estados para validação de código
    const [validationState, setValidationState] =
      useState<ValidationState>('phone-input');
    const [isSendingCode, setIsSendingCode] = useState(false);
    const [isValidatingCode, setIsValidatingCode] = useState(false);
    const [userCode, setUserCode] = useState('');
    const [codeError, setCodeError] = useState('');
    const [codeExpiresAt, setCodeExpiresAt] = useState<string>(''); // ISO string
    const [remainingTime, setRemainingTime] = useState<number>(0);
    const [attemptsRemaining, setAttemptsRemaining] = useState<number>(3);

    // Debounce para validação (800ms após parar de digitar)
    useEffect(() => {
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      if (cleanPhone.length === 0) {
        setValidationResult(null);
        setErrorMessage('');
        return;
      }

      if (cleanPhone.length !== 11) {
        setValidationResult(null);
        setErrorMessage('');
        return;
      }

      const timeoutId = setTimeout(async () => {
        setIsValidating(true);
        setErrorMessage('');

        try {
          const result =
            await validateWhatsAppAndCheckRegistration(phoneNumber);
          setValidationResult(result);

          if (!result.isValid) {
            setErrorMessage(result.errorMessage || 'Número inválido');
          }

          await trackRegistrationAttempt({
            phone_number: cleanPhone,
            validation_success: result.isValid,
            person_exists: result.personExists,
            error_message: result.errorMessage,
          });
        } catch (error) {
          console.error('Erro na validação:', error);
          setErrorMessage('Erro ao validar. Tente novamente.');
        } finally {
          setIsValidating(false);
        }
      }, 800);

      return () => clearTimeout(timeoutId);
    }, [phoneNumber]);

    // Timer para expiração do código
    useEffect(() => {
      if (validationState !== 'code-sent' || !codeExpiresAt) return;

      const interval = setInterval(() => {
        const now = new Date().getTime();
        const expiresTime = new Date(codeExpiresAt).getTime();
        const timeLeft = Math.max(0, expiresTime - now);

        if (timeLeft === 0) {
          setCodeError('Código expirado. Solicite um novo código.');
          clearInterval(interval);
          return;
        }

        setRemainingTime(Math.ceil(timeLeft / 1000 / 60)); // minutos
      }, 1000);

      return () => clearInterval(interval);
    }, [validationState, codeExpiresAt]);

    // Handler para enviar código de validação (usuário existente querendo cadastrar novo paciente)
    const handleSendCodeForExisting = useCallback(() => {
      console.log(
        '📝 [WhatsAppValidationStep] Usuário existente quer cadastrar novo paciente'
      );

      if (
        validationResult?.personExists &&
        validationResult.personId &&
        onExistingPersonContinue
      ) {
        console.log(
          '➡️ [WhatsAppValidationStep] Chamando onExistingPersonContinue com ID:',
          validationResult.personId
        );

        // Montar dados completos do usuário existente
        const existingUserData: ExistingUserFullData | undefined =
          validationResult.userData
            ? {
                id: validationResult.userData.id,
                nome: validationResult.userData.nome,
                cpf_cnpj: validationResult.userData.cpf_cnpj || undefined,
                telefone: validationResult.userData.telefone?.toString(),
                email: validationResult.userData.email || undefined,
                data_nascimento:
                  validationResult.userData.data_nascimento || undefined,
                sexo: validationResult.userData.sexo || undefined,
                id_tipo_pessoa:
                  validationResult.userData.tipo_pessoa_id || undefined,
                tipo_responsabilidade:
                  validationResult.userData.tipo_responsabilidade || undefined,
                cep: validationResult.userData.cep || undefined,
                logradouro: validationResult.userData.logradouro || undefined,
                numero_endereco:
                  validationResult.userData.numero_endereco || undefined,
                complemento_endereco:
                  validationResult.userData.complemento_endereco || undefined,
                bairro: validationResult.userData.bairro || undefined,
                cidade: validationResult.userData.cidade || undefined,
                estado: validationResult.userData.estado || undefined,
              }
            : undefined;

        onExistingPersonContinue(validationResult.personId, existingUserData);
      }
    }, [validationResult, onExistingPersonContinue]);

    // Handler para enviar código de validação (novo usuário)
    const handleSendCode = useCallback(async () => {
      if (!validationResult?.isValid || !validationResult.whatsappJid) return;

      setIsSendingCode(true);
      setCodeError('');

      try {
        const result = await sendValidationCode(validationResult.whatsappJid);

        if (result.success && result.expiresAt) {
          setCodeExpiresAt(result.expiresAt); // ISO string
          setValidationState('code-sent');
          setAttemptsRemaining(3);
        } else {
          setCodeError(result.error || 'Erro ao enviar código');
        }
      } catch (error) {
        console.error('Erro ao enviar código:', error);
        setCodeError('Erro ao enviar código. Tente novamente.');
      } finally {
        setIsSendingCode(false);
      }
    }, [validationResult]);

    // Handler para validar código inserido
    const handleValidateCode = useCallback(async () => {
      if (!validationResult?.whatsappJid || !validationResult?.phoneNumber)
        return;

      const cleanUserCode = userCode.replace(/\D/g, '');

      if (cleanUserCode.length !== 6) {
        setCodeError('Código deve ter 6 dígitos');
        return;
      }

      setIsValidatingCode(true);
      setCodeError('');

      try {
        // Validar código via Edge Function
        const result = await validateCode(
          validationResult.whatsappJid,
          cleanUserCode
        );

        if (!result.valid) {
          setCodeError(result.error || 'Código incorreto');

          if (result.blocked) {
            setValidationState('phone-input');
          } else if (result.attemptsRemaining !== undefined) {
            setAttemptsRemaining(result.attemptsRemaining);
          }
          return;
        }

        // Código válido - buscar usuário existente na vw_usuarios_admin
        console.log(
          '🔍 [WhatsAppValidationStep] Buscando usuário existente para JID:',
          validationResult.whatsappJid
        );
        const existingUser = await findExistingUserByPhone(
          validationResult.whatsappJid
        );
        console.log(
          '🔍 [WhatsAppValidationStep] Resultado da busca:',
          existingUser
        );

        if (existingUser.exists && existingUser.user) {
          // Usuário EXISTE - atualizar validationResult e voltar para mostrar boas-vindas
          console.log(
            '✅ [WhatsAppValidationStep] Usuário EXISTE - mostrando boas-vindas'
          );
          const firstName = existingUser.user.nome.split(' ')[0];

          setValidationResult({
            isValid: true,
            personExists: true,
            personId: existingUser.user.id,
            personFirstName: firstName,
            relatedPatients:
              existingUser.pacientes?.map((p) => ({
                id: p.id,
                nome: p.nome,
              })) || [],
            phoneNumber: validationResult.phoneNumber,
            whatsappJid: validationResult.whatsappJid,
            userData: existingUser.user, // Incluir dados completos do usuário
          });

          // Voltar para phone-input para mostrar a mensagem de boas-vindas
          // NÃO chamar onContinue - usuário deve escolher o que fazer
          setValidationState('phone-input');
          setCodeError('');
          setUserCode('');
        } else {
          // Novo usuário - prosseguir com cadastro
          console.log(
            '🆕 [WhatsAppValidationStep] Usuário NOVO - prosseguindo com cadastro'
          );
          setValidationState('code-validated');
          setCodeError('');

          onContinue({
            phoneNumber: validationResult.phoneNumber,
          });
        }
      } catch (error) {
        console.error('Erro ao validar código:', error);
        setCodeError('Erro ao validar código. Tente novamente.');
      } finally {
        setIsValidatingCode(false);
      }
    }, [userCode, validationResult, onContinue]);

    // Handler para reenviar código
    const handleResendCode = useCallback(() => {
      setUserCode('');
      setCodeError('');
      handleSendCode();
    }, [handleSendCode]);

    const canSendCode =
      validationResult?.isValid &&
      !isValidating &&
      !validationResult.personExists &&
      validationState === 'phone-input';

    return (
      <div className={cn('w-full max-w-md mx-auto space-y-6', className)}>
        {/* Título e descrição */}
        <div className="text-center space-y-2">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground">
            Validação de WhatsApp
          </h2>
          <p className="text-base text-muted-foreground">
            {validationState === 'phone-input' &&
              'Precisamos validar o número de WhatsApp do responsável legal'}
            {validationState === 'code-sent' &&
              'Digite o código que enviamos para o WhatsApp'}
            {validationState === 'code-validated' &&
              'Código validado com sucesso!'}
          </p>
        </div>

        {/* Input de telefone */}
        {validationState === 'phone-input' && (
          <>
            <div className="space-y-2">
              <label
                htmlFor="whatsapp-input"
                className="block text-sm font-medium text-foreground"
              >
                Número do WhatsApp *
              </label>
              <PhoneInput
                id="whatsapp-input"
                value={phoneNumber}
                onChange={setPhoneNumber}
                isValidating={isValidating}
                isValid={validationResult ? validationResult.isValid : null}
                errorMessage={errorMessage}
                autoFocus
              />
            </div>

            {/* Mensagem de sucesso - pessoa NÃO cadastrada */}
            {validationResult?.isValid && !validationResult.personExists && (
              <div className="space-y-3 p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm font-medium text-green-800 dark:text-green-200">
                  ✅ WhatsApp válido!
                </p>
                <p className="text-xs text-green-700 dark:text-green-300">
                  Clique no botão abaixo para receber um código de validação no
                  seu WhatsApp.
                </p>
              </div>
            )}

            {/* Mensagem - pessoa JÁ cadastrada */}
            {validationResult?.isValid && validationResult.personExists && (
              <div className="space-y-4 p-5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div>
                  <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100">
                    Seja bem-vindo novamente, {validationResult.personFirstName}
                    ! 👋
                  </h3>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    Encontramos seu cadastro em nosso sistema.
                  </p>
                </div>

                {validationResult.relatedPatients &&
                  validationResult.relatedPatients.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                        Pacientes cadastrados:
                      </p>
                      <ul className="space-y-1.5 pl-4">
                        {validationResult.relatedPatients.map((patient) => (
                          <li
                            key={patient.id}
                            className="text-sm text-blue-800 dark:text-blue-200 flex items-center"
                          >
                            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mr-2" />
                            {patient.nome}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                <div className="pt-2 space-y-2">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    O que deseja fazer?
                  </p>
                  <Button
                    onClick={handleSendCodeForExisting}
                    disabled={isSendingCode}
                    size="lg"
                    className="w-full h-12 text-base"
                  >
                    {isSendingCode
                      ? 'Enviando código...'
                      : 'Cadastrar novo paciente'}
                  </Button>
                </div>
              </div>
            )}

            {/* Botão verificar número - apenas para pessoas novas */}
            {canSendCode && (
              <Button
                onClick={handleSendCode}
                disabled={!canSendCode || isSendingCode}
                size="lg"
                className="w-full h-12 text-base font-semibold"
              >
                {isSendingCode ? 'Enviando código...' : 'Verificar número'}
              </Button>
            )}

            {/* Erro ao enviar código */}
            {codeError && validationState === 'phone-input' && (
              <p className="text-sm text-destructive text-center">
                {codeError}
              </p>
            )}
          </>
        )}

        {/* Campo de validação do código */}
        {validationState === 'code-sent' && (
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-200 text-center">
                📱 Enviamos um código de 6 dígitos para seu WhatsApp{' '}
                <span className="font-semibold">{phoneNumber}</span>
              </p>
            </div>

            {/* Timer de expiração */}
            {remainingTime > 0 && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span>
                  Código expira em{' '}
                  <span className="font-semibold">{remainingTime}</span> minuto
                  {remainingTime !== 1 ? 's' : ''}
                </span>
              </div>
            )}

            {/* Tentativas restantes */}
            {attemptsRemaining < 3 && attemptsRemaining > 0 && (
              <div className="flex items-center justify-center gap-2 text-sm text-orange-600 dark:text-orange-400">
                <AlertTriangle className="w-4 h-4" />
                <span>
                  {attemptsRemaining} tentativa
                  {attemptsRemaining !== 1 ? 's' : ''} restante
                  {attemptsRemaining !== 1 ? 's' : ''}
                </span>
              </div>
            )}

            <div className="space-y-2">
              <label
                htmlFor="code-input"
                className="block text-sm font-medium text-foreground"
              >
                Código de validação *
              </label>
              <Input
                id="code-input"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={userCode}
                onChange={(e) => {
                  setUserCode(e.target.value.replace(/\D/g, ''));
                  setCodeError('');
                }}
                placeholder="000000"
                className="h-14 text-center text-2xl font-bold tracking-widest"
                autoFocus
                disabled={remainingTime === 0}
              />
              {codeError && (
                <p className="text-sm text-destructive font-medium">
                  {codeError}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Button
                onClick={handleValidateCode}
                disabled={
                  userCode.length !== 6 ||
                  remainingTime === 0 ||
                  isValidatingCode
                }
                size="lg"
                className="w-full h-12 text-base font-semibold"
              >
                {isValidatingCode ? 'Validando...' : 'Validar código'}
              </Button>

              <Button
                onClick={handleResendCode}
                variant="ghost"
                size="sm"
                className="w-full text-sm"
                disabled={isSendingCode}
              >
                Não recebeu? Reenviar código
              </Button>
            </div>
          </div>
        )}

        {/* Informação adicional */}
        <p className="text-xs text-center text-muted-foreground">
          Seus dados são protegidos conforme a LGPD
        </p>
      </div>
    );
  }
);

WhatsAppValidationStep.displayName = 'WhatsAppValidationStep';
