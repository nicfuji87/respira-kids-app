// AI dev note: Context para gerenciar logging do processo de cadastro público
// Mantém session_id persistente e fornece função para log de eventos
// Não impacta performance - logs são enviados de forma não-bloqueante

import React, { createContext, useMemo } from 'react';
import {
  getOrCreateSessionId,
  type RegistrationLogEvent,
  type RegistrationEventType,
  type RegistrationStepName,
  sendLogEvent,
  getBrowserInfo,
  anonymizeFormData,
} from '@/lib/registration-logger';

export interface LoggingContextValue {
  sessionId: string;
  logEvent: (
    eventType: RegistrationEventType,
    stepName?: RegistrationStepName,
    options?: {
      formData?: Record<string, unknown>;
      errorMessage?: string;
      errorStack?: string;
    }
  ) => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const LoggingContext = createContext<LoggingContextValue | undefined>(
  undefined
);

export interface LoggingProviderProps {
  children: React.ReactNode;
}

export const LoggingProvider: React.FC<LoggingProviderProps> = ({
  children,
}) => {
  // Session ID é criado uma vez e reutilizado durante toda a jornada
  const sessionId = useMemo(() => getOrCreateSessionId(), []);

  const logEvent = useMemo(
    () =>
      (
        eventType: RegistrationEventType,
        stepName?: RegistrationStepName,
        options?: {
          formData?: Record<string, unknown>;
          errorMessage?: string;
          errorStack?: string;
        }
      ) => {
        const event: RegistrationLogEvent = {
          sessionId,
          eventType,
          stepName,
          userAgent: navigator.userAgent,
          browserInfo: getBrowserInfo(),
        };

        // Anonimizar dados do formulário se fornecidos
        if (options?.formData) {
          event.formData = anonymizeFormData(options.formData);
        }

        if (options?.errorMessage) {
          event.errorMessage = options.errorMessage;
        }

        if (options?.errorStack) {
          event.errorStack = options.errorStack;
        }

        // Enviar log de forma não-bloqueante (fire-and-forget)
        sendLogEvent(event);
      },
    [sessionId]
  );

  const value = useMemo(
    () => ({
      sessionId,
      logEvent,
    }),
    [sessionId, logEvent]
  );

  return (
    <LoggingContext.Provider value={value}>{children}</LoggingContext.Provider>
  );
};
