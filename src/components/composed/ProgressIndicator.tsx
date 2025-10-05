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
    return (
      <div className={cn('flex flex-col items-center gap-3', className)}>
        {/* Texto */}
        <div className="text-sm font-medium text-muted-foreground">
          Etapa {currentStep} de {totalSteps}
        </div>

        {/* Bolinhas */}
        <div className="flex items-center gap-2">
          {Array.from({ length: totalSteps }, (_, i) => {
            const step = i + 1;
            const isCompleted = step < currentStep;
            const isCurrent = step === currentStep;
            const isPending = step > currentStep;

            return (
              <div
                key={step}
                className={cn(
                  'rounded-full transition-all',
                  isCompleted && 'w-2 h-2 bg-primary',
                  isCurrent &&
                    'w-3 h-3 bg-primary ring-2 ring-primary/30 ring-offset-2',
                  isPending && 'w-2 h-2 bg-gray-300 dark:bg-gray-600'
                )}
              />
            );
          })}
        </div>
      </div>
    );
  }
);

ProgressIndicator.displayName = 'ProgressIndicator';
