// AI dev note: Hook customizado para logging do processo de cadastro
// Fornece funções type-safe para log de eventos em cada etapa
// Uso: const logger = useRegistrationLogger();

import { useCallback } from 'react';
import { useLoggingContext } from '@/hooks/useLoggingContext';
import { clearSessionId } from '@/lib/registration-logger';
import type { RegistrationStepName } from '@/lib/registration-logger';

export interface RegistrationLogger {
  // Log quando uma etapa inicia
  logStepStarted: (step: RegistrationStepName) => void;

  // Log quando uma etapa é completada com sucesso
  logStepCompleted: (
    step: RegistrationStepName,
    formData?: Record<string, unknown>
  ) => void;

  // Log de erro de validação
  logValidationError: (
    step: RegistrationStepName,
    errors: Record<string, unknown>
  ) => void;

  // Log de erro na API/Edge Function
  logApiError: (step: RegistrationStepName, error: Error) => void;

  // Log de sucesso completo do cadastro
  logSuccess: (resultIds: {
    pacienteId?: string;
    responsavelLegalId?: string;
    responsavelFinanceiroId?: string;
    contratoId?: string;
  }) => void;

  // Limpar session (chamar após sucesso)
  clearSession: () => void;
}

export const useRegistrationLogger = (): RegistrationLogger => {
  const { logEvent } = useLoggingContext();

  const logStepStarted = useCallback(
    (step: RegistrationStepName) => {
      console.log(`📋 [Logger] Etapa iniciada: ${step}`);
      logEvent('step_started', step);
    },
    [logEvent]
  );

  const logStepCompleted = useCallback(
    (step: RegistrationStepName, formData?: Record<string, unknown>) => {
      console.log(`✅ [Logger] Etapa completada: ${step}`);
      logEvent('step_completed', step, { formData });
    },
    [logEvent]
  );

  const logValidationError = useCallback(
    (step: RegistrationStepName, errors: Record<string, unknown>) => {
      console.log(`❌ [Logger] Erro de validação: ${step}`, errors);
      logEvent('validation_error', step, {
        formData: errors,
        errorMessage: 'Erro de validação do formulário',
      });
    },
    [logEvent]
  );

  const logApiError = useCallback(
    (step: RegistrationStepName, error: Error) => {
      console.error(`❌ [Logger] Erro na API: ${step}`, error);
      logEvent('api_error', step, {
        errorMessage: error.message,
        errorStack: error.stack,
      });
    },
    [logEvent]
  );

  const logSuccess = useCallback(
    (resultIds: {
      pacienteId?: string;
      responsavelLegalId?: string;
      responsavelFinanceiroId?: string;
      contratoId?: string;
    }) => {
      console.log('🎉 [Logger] Cadastro concluído com sucesso!', resultIds);
      logEvent('success', 'finalization', {
        formData: resultIds,
      });
    },
    [logEvent]
  );

  const clearSession = useCallback(() => {
    console.log('🧹 [Logger] Limpando session ID');
    clearSessionId();
  }, []);

  return {
    logStepStarted,
    logStepCompleted,
    logValidationError,
    logApiError,
    logSuccess,
    clearSession,
  };
};
