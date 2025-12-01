import React from 'react';
import { cn } from '@/lib/utils';

// AI dev note: BooleanToggle - Toggle visual para campos Sim/Não
// Otimizado para preenchimento rápido com feedback visual claro

interface BooleanToggleProps {
  value: boolean | null | undefined;
  onChange: (value: boolean) => void;
  labelSim?: string;
  labelNao?: string;
  disabled?: boolean;
  className?: string;
}

export const BooleanToggle: React.FC<BooleanToggleProps> = ({
  value,
  onChange,
  labelSim = 'Sim',
  labelNao = 'Não',
  disabled = false,
  className,
}) => {
  return (
    <div className={cn('flex gap-2', className)}>
      <button
        type="button"
        onClick={() => !disabled && onChange(true)}
        disabled={disabled}
        className={cn(
          'flex-1 py-2 px-4 rounded-lg border-2 font-medium transition-all text-sm',
          value === true
            ? 'bg-emerald-500 border-emerald-500 text-white shadow-md'
            : 'bg-background border-border text-muted-foreground hover:border-emerald-300 hover:bg-emerald-50',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        {labelSim}
      </button>
      <button
        type="button"
        onClick={() => !disabled && onChange(false)}
        disabled={disabled}
        className={cn(
          'flex-1 py-2 px-4 rounded-lg border-2 font-medium transition-all text-sm',
          value === false
            ? 'bg-rose-500 border-rose-500 text-white shadow-md'
            : 'bg-background border-border text-muted-foreground hover:border-rose-300 hover:bg-rose-50',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        {labelNao}
      </button>
    </div>
  );
};

BooleanToggle.displayName = 'BooleanToggle';

