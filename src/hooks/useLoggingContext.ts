// Hook para usar o logging context
import { useContext } from 'react';
import {
  LoggingContext,
  type LoggingContextValue,
} from '@/contexts/LoggingContext';

export const useLoggingContext = (): LoggingContextValue => {
  const context = useContext(LoggingContext);

  if (!context) {
    throw new Error('useLoggingContext must be used within LoggingProvider');
  }

  return context;
};
