import React, { useState, useEffect, useCallback } from 'react';
import { PhoneInput } from '@/components/primitives/PhoneInput';
import { Input } from '@/components/primitives/input';
import { Button } from '@/components/primitives/button';
import { Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  validateWhatsAppAndCheckRegistration,
  sendValidationCode,
  validateCode,
  type WhatsAppValidationResponse,
} from '@/lib/patient-registration-api';

// AI dev note: ResponsiblePhoneValidationStep - Validação de telefone do responsável
// Reutiliza lógica do WhatsAppValidationStep com foco em identificar responsável
// Fluxo: 1) Valida WhatsApp 2) Envia código 3) Valida código 4) Identifica pessoa

export interface ResponsibleData {
  id?: string; // Se pessoa já existe
  nome?: string;
  telefone: string; // Limpo (sem formatação)
  whatsappJid: string; // Ex: 556181446666@s.whatsapp.net
  exists: boolean; // Se pessoa existe no sistema
}

export interface ResponsiblePhoneValidationStepProps {
  onContinue: (data: ResponsibleData) => void;
  className?: string;
}

type ValidationState = 'phone-input' | 'code-sent' | 'code-validated';

export const ResponsiblePhoneValidationStep =
  React.memo<ResponsiblePhoneValidationStepProps>(
    ({ onContinue, className }) => {
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
      const [codeExpiresAt, setCodeExpiresAt] = useState<string>('');
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

          setRemainingTime(Math.ceil(timeLeft / 1000 / 60));
        }, 1000);

        return () => clearInterval(interval);
      }, [validationState, codeExpiresAt]);

      // Handler para enviar código
      const handleSendCode = useCallback(async () => {
        if (!validationResult?.whatsappJid) return;

        setIsSendingCode(true);
        setCodeError('');

        try {
          const result = await sendValidationCode(validationResult.whatsappJid);

          if (result.success && result.expiresAt) {
            setCodeExpiresAt(result.expiresAt);
            setValidationState('code-sent');
            console.log('✅ Código enviado com sucesso');
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

      // Handler para validar código
      const handleValidateCode = useCallback(async () => {
        if (!validationResult?.whatsappJid || !userCode) return;

        setIsValidatingCode(true);
        setCodeError('');

        try {
          const result = await validateCode(
            validationResult.whatsappJid,
            userCode
          );

          if (result.valid) {
            setValidationState('code-validated');
            console.log('✅ Código validado com sucesso');

            // Prosseguir para próxima etapa
            const responsibleData: ResponsibleData = {
              id: validationResult.personId,
              nome: validationResult.personFirstName,
              telefone: validationResult.phoneNumber || '',
              whatsappJid: validationResult.whatsappJid,
              exists: validationResult.personExists,
            };

            onContinue(responsibleData);
          } else {
            setCodeError(result.error || 'Código inválido. Tente novamente.');
            setAttemptsRemaining(result.attemptsRemaining || 0);

            if (result.blocked) {
              setCodeError(
                `Muitas tentativas. Tente novamente após ${result.blockedUntil || 'alguns minutos'}`
              );
            }
          }
        } catch (error) {
          console.error('Erro ao validar código:', error);
          setCodeError('Erro ao validar código. Tente novamente.');
        } finally {
          setIsValidatingCode(false);
        }
      }, [validationResult, userCode, onContinue]);

      // Renderização
      return (
        <div className={cn('space-y-6', className)}>
          {/* Título e Descrição */}
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-respira-text-primary">
              Validar Telefone
            </h2>
            <p className="text-sm text-respira-text-secondary">
              Digite seu número de WhatsApp para continuar
            </p>
          </div>

          {/* Etapa 1: Input de Telefone */}
          {validationState === 'phone-input' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-respira-text-primary">
                  WhatsApp
                </label>
                <PhoneInput
                  value={phoneNumber}
                  onChange={setPhoneNumber}
                  placeholder="(00) 00000-0000"
                  disabled={isValidating}
                  className="w-full"
                />

                {/* Feedback de validação */}
                {isValidating && (
                  <p className="text-xs text-respira-text-secondary animate-pulse">
                    Validando número...
                  </p>
                )}

                {errorMessage && (
                  <div className="flex items-center gap-2 text-xs text-respira-error">
                    <AlertTriangle className="h-3 w-3" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {validationResult?.isValid && (
                  <div className="flex items-center gap-2 text-xs text-respira-success">
                    <CheckCircle2 className="h-3 w-3" />
                    <span>WhatsApp válido</span>
                  </div>
                )}
              </div>

              {/* Botão Verificar */}
              <Button
                onClick={handleSendCode}
                disabled={!validationResult?.isValid || isSendingCode}
                className="w-full"
              >
                {isSendingCode ? 'Enviando código...' : 'Verificar número'}
              </Button>
            </div>
          )}

          {/* Etapa 2: Input de Código */}
          {validationState === 'code-sent' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-respira-text-primary">
                  Código de verificação
                </label>
                <p className="text-xs text-respira-text-secondary">
                  Digite o código de 6 dígitos enviado para seu WhatsApp
                </p>

                <Input
                  type="text"
                  value={userCode}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setUserCode(value);
                    setCodeError('');
                  }}
                  placeholder="000000"
                  maxLength={6}
                  className="w-full text-center text-2xl tracking-widest"
                  disabled={isValidatingCode}
                />

                {/* Timer e tentativas */}
                {remainingTime > 0 && (
                  <div className="flex items-center gap-2 text-xs text-respira-text-secondary">
                    <Clock className="h-3 w-3" />
                    <span>Código expira em {remainingTime} minutos</span>
                  </div>
                )}

                {attemptsRemaining < 3 && attemptsRemaining > 0 && (
                  <p className="text-xs text-respira-warning">
                    {attemptsRemaining} tentativa(s) restante(s)
                  </p>
                )}

                {codeError && (
                  <div className="flex items-center gap-2 text-xs text-respira-error">
                    <AlertTriangle className="h-3 w-3" />
                    <span>{codeError}</span>
                  </div>
                )}
              </div>

              {/* Botões */}
              <div className="flex flex-col gap-2">
                <Button
                  onClick={handleValidateCode}
                  disabled={userCode.length !== 6 || isValidatingCode}
                  className="w-full"
                >
                  {isValidatingCode ? 'Validando...' : 'Validar código'}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => {
                    setValidationState('phone-input');
                    setUserCode('');
                    setCodeError('');
                  }}
                  className="w-full"
                >
                  Alterar número
                </Button>
              </div>
            </div>
          )}

          {/* Etapa 3: Código Validado */}
          {validationState === 'code-validated' && (
            <div className="flex items-center justify-center gap-2 text-respira-success">
              <CheckCircle2 className="h-5 w-5" />
              <span>Código validado! Redirecionando...</span>
            </div>
          )}
        </div>
      );
    }
  );

ResponsiblePhoneValidationStep.displayName = 'ResponsiblePhoneValidationStep';
