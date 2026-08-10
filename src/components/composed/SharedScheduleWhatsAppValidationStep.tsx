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
import type { ExistingUserFullData } from './WhatsAppValidationStep';
import { WHATSAPP_CODE_VALIDATION_ENABLED } from '@/lib/feature-flags';

// AI dev note: SharedScheduleWhatsAppValidationStep - Validação para Agenda Compartilhada
// Fluxo diferente do cadastro de paciente:
// 1) Se NÃO cadastrado → chama onAccessDenied (mostra mensagem)
// 2) Se cadastrado → envia código → valida → chama onValidated
// Com WHATSAPP_CODE_VALIDATION_ENABLED = false, o passo do código é pulado:
// número cadastrado já libera a agenda
// NÃO altera o componente WhatsAppValidationStep usado no cadastro

export interface SharedScheduleWhatsAppValidationStepProps {
  onValidated: (personId: string, userData?: ExistingUserFullData) => void;
  onAccessDenied: () => void;
  className?: string;
}

type ValidationState = 'phone-input' | 'code-sent';

export const SharedScheduleWhatsAppValidationStep =
  React.memo<SharedScheduleWhatsAppValidationStepProps>(
    ({ onValidated, onAccessDenied, className }) => {
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
            } else if (!result.personExists) {
              // Pessoa NÃO cadastrada → acesso negado IMEDIATAMENTE
              console.log(
                '❌ [SharedScheduleWhatsAppValidation] Pessoa não cadastrada - mostrando acesso negado'
              );
              onAccessDenied();
              return;
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
      }, [phoneNumber, onAccessDenied]);

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

      // Busca os dados completos e libera a agenda (com ou sem código)
      const proceedAfterPhoneConfirmed = useCallback(async () => {
        if (!validationResult?.whatsappJid) return;

        console.log(
          '🔍 [SharedScheduleWhatsAppValidation] Buscando usuário para JID:',
          validationResult.whatsappJid
        );
        const existingUser = await findExistingUserByPhone(
          validationResult.whatsappJid
        );

        if (existingUser.exists && existingUser.user) {
          console.log(
            '✅ [SharedScheduleWhatsAppValidation] Usuário validado - continuando para agenda'
          );

          // Montar dados completos do usuário
          const userData: ExistingUserFullData = {
            id: existingUser.user.id,
            nome: existingUser.user.nome,
            cpf_cnpj: existingUser.user.cpf_cnpj || undefined,
            telefone: existingUser.user.telefone?.toString(),
            email: existingUser.user.email || undefined,
            data_nascimento: existingUser.user.data_nascimento || undefined,
            sexo: existingUser.user.sexo || undefined,
            id_tipo_pessoa: existingUser.user.tipo_pessoa_id || undefined,
            tipo_responsabilidade:
              existingUser.user.tipo_responsabilidade || undefined,
            cep: existingUser.user.cep || undefined,
            logradouro: existingUser.user.logradouro || undefined,
            numero_endereco: existingUser.user.numero_endereco || undefined,
            complemento_endereco:
              existingUser.user.complemento_endereco || undefined,
            bairro: existingUser.user.bairro || undefined,
            cidade: existingUser.user.cidade || undefined,
            estado: existingUser.user.estado || undefined,
          };

          onValidated(existingUser.user.id, userData);
        } else {
          setCodeError('Erro ao buscar dados do usuário');
        }
      }, [validationResult, onValidated]);

      // Handler para enviar código de validação (usuário cadastrado)
      const handleSendCode = useCallback(async () => {
        if (!validationResult?.isValid || !validationResult.whatsappJid) return;

        setIsSendingCode(true);
        setCodeError('');

        try {
          // Envio de código suspenso: número cadastrado já libera a agenda
          if (!WHATSAPP_CODE_VALIDATION_ENABLED) {
            await proceedAfterPhoneConfirmed();
            return;
          }

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
      }, [validationResult, proceedAfterPhoneConfirmed]);

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

          // Código válido - buscar dados completos do usuário
          await proceedAfterPhoneConfirmed();
        } catch (error) {
          console.error('Erro ao validar código:', error);
          setCodeError('Erro ao validar código. Tente novamente.');
        } finally {
          setIsValidatingCode(false);
        }
      }, [userCode, validationResult, proceedAfterPhoneConfirmed]);

      // Handler para reenviar código
      const handleResendCode = useCallback(() => {
        setUserCode('');
        setCodeError('');
        handleSendCode();
      }, [handleSendCode]);

      return (
        <div className={cn('w-full max-w-md mx-auto space-y-6', className)}>
          {/* Título e descrição */}
          <div className="text-center space-y-2">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">
              Validação de WhatsApp
            </h2>
            <p className="text-base text-muted-foreground">
              {validationState === 'phone-input' &&
                'Digite seu WhatsApp para acessar a agenda'}
              {validationState === 'code-sent' &&
                'Digite o código que enviamos para o WhatsApp'}
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

              {/* Mensagem - pessoa JÁ cadastrada (pode continuar) */}
              {validationResult?.isValid && validationResult.personExists && (
                <div className="space-y-4 p-5 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
                  <div>
                    <h3 className="text-lg font-semibold text-green-900 dark:text-green-100">
                      Olá, {validationResult.personFirstName}! 👋
                    </h3>
                    <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                      Encontramos seu cadastro em nosso sistema.
                    </p>
                  </div>

                  <p className="text-sm text-green-800 dark:text-green-200">
                    {WHATSAPP_CODE_VALIDATION_ENABLED
                      ? 'Clique no botão abaixo para receber um código de validação e continuar com o agendamento.'
                      : 'Clique no botão abaixo para continuar com o agendamento.'}
                  </p>

                  <Button
                    onClick={handleSendCode}
                    disabled={isSendingCode}
                    size="lg"
                    className="w-full h-12 text-base"
                  >
                    {isSendingCode
                      ? WHATSAPP_CODE_VALIDATION_ENABLED
                        ? 'Enviando código...'
                        : 'Aguarde...'
                      : 'Continuar para o agendamento'}
                  </Button>
                </div>
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
                    <span className="font-semibold">{remainingTime}</span>{' '}
                    minuto
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
        </div>
      );
    }
  );

SharedScheduleWhatsAppValidationStep.displayName =
  'SharedScheduleWhatsAppValidationStep';
