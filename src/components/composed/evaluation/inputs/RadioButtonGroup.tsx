import React from 'react';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

// AI dev note: RadioButtonGroup - Seleção única com botões visuais
// Substituição visual para radio buttons tradicionais

interface RadioOption {
  valor: string;
  label: string;
  descricao?: string;
}

interface RadioButtonGroupProps {
  value: string | null | undefined;
  onChange: (value: string) => void;
  options: RadioOption[];
  disabled?: boolean;
  className?: string;
  layout?: 'horizontal' | 'vertical' | 'grid';
  size?: 'sm' | 'md' | 'lg';
}

export const RadioButtonGroup: React.FC<RadioButtonGroupProps> = ({
  value,
  onChange,
  options,
  disabled = false,
  className,
  layout = 'horizontal',
  size = 'md',
}) => {
  const layoutClasses = {
    horizontal: 'flex flex-wrap gap-2',
    vertical: 'flex flex-col gap-2',
    grid: 'grid grid-cols-2 gap-2 sm:grid-cols-3',
  };

  const sizeClasses = {
    sm: 'py-1.5 px-3 text-xs',
    md: 'py-2 px-4 text-sm',
    lg: 'py-3 px-5 text-base',
  };

  return (
    <div className={cn(layoutClasses[layout], className)}>
      {options.map((option) => {
        const isSelected = value === option.valor;
        return (
          <button
            key={option.valor}
            type="button"
            onClick={() => !disabled && onChange(option.valor)}
            disabled={disabled}
            className={cn(
              'relative rounded-lg border-2 font-medium transition-all',
              sizeClasses[size],
              layout === 'vertical' && 'w-full text-left',
              isSelected
                ? 'bg-primary border-primary text-primary-foreground shadow-md'
                : 'bg-background border-border text-foreground hover:border-primary/50 hover:bg-accent',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            <div className="flex items-center gap-2">
              {isSelected && <Check className="h-4 w-4" />}
              <span>{option.label}</span>
            </div>
            {option.descricao && (
              <p
                className={cn(
                  'text-xs mt-0.5',
                  isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'
                )}
              >
                {option.descricao}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
};

RadioButtonGroup.displayName = 'RadioButtonGroup';

