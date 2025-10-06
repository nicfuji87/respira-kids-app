import React from 'react';
import { cn } from '@/lib/utils';

// AI dev note: ProgressIndicator - Componente para mostrar progresso do cadastro
// Exibe bolinhas indicando etapas concluídas, atual e pendentes

export interface ProgressIndicatorProps {
  currentStep: number; // 1-based index
  totalSteps: number;
  className?: string;
}

export const ProgressIndicator = React.memo<ProgressIndicatorProps>(
  ({ currentStep, totalSteps, className }) => {
    const progress = (currentStep / totalSteps) * 100;

    return (
      <div className={cn('w-full space-y-2', className)}>
        {/* Barra de progresso slim */}
        <div className="relative h-1 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-primary transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Texto discreto */}
        <div className="text-xs text-muted-foreground text-center">
          Etapa {currentStep} de {totalSteps}
        </div>
      </div>
    );
  }
);

ProgressIndicator.displayName = 'ProgressIndicator';
