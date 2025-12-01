import React from 'react';
import { cn } from '@/lib/utils';

// AI dev note: ScaleSelector - Seletor de escala numérica
// Para campos como MFS (0-5), APGAR (0-10), Grau de Severidade (1-8)

interface ScaleSelectorProps {
  value: number | null | undefined;
  onChange: (value: number) => void;
  min: number;
  max: number;
  disabled?: boolean;
  className?: string;
  labels?: Record<number, string>;
  showLabels?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const ScaleSelector: React.FC<ScaleSelectorProps> = ({
  value,
  onChange,
  min,
  max,
  disabled = false,
  className,
  labels = {},
  showLabels = false,
  size = 'md',
}) => {
  const numbers = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap gap-1.5">
        {numbers.map((num) => {
          const isSelected = value === num;
          return (
            <button
              key={num}
              type="button"
              onClick={() => !disabled && onChange(num)}
              disabled={disabled}
              className={cn(
                'rounded-lg border-2 font-bold transition-all flex items-center justify-center',
                sizeClasses[size],
                isSelected
                  ? 'bg-primary border-primary text-primary-foreground shadow-md scale-110'
                  : 'bg-background border-border text-foreground hover:border-primary/50 hover:bg-accent',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              {num}
            </button>
          );
        })}
      </div>

      {showLabels && value !== null && value !== undefined && labels[value] && (
        <p className="text-sm text-muted-foreground px-1">{labels[value]}</p>
      )}
    </div>
  );
};

ScaleSelector.displayName = 'ScaleSelector';

