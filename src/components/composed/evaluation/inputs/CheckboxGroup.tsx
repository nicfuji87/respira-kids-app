import React from 'react';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

// AI dev note: CheckboxGroup - Múltipla seleção com chips visuais
// Para campos onde múltiplas opções podem ser selecionadas

interface CheckboxOption {
  valor: string;
  label: string;
}

interface CheckboxGroupProps {
  value: string[] | null | undefined;
  onChange: (value: string[]) => void;
  options: CheckboxOption[];
  disabled?: boolean;
  className?: string;
  maxSelections?: number;
}

export const CheckboxGroup: React.FC<CheckboxGroupProps> = ({
  value = [],
  onChange,
  options,
  disabled = false,
  className,
  maxSelections,
}) => {
  const selectedValues = value || [];

  const handleToggle = (optionValue: string) => {
    if (disabled) return;

    const isSelected = selectedValues.includes(optionValue);

    if (isSelected) {
      onChange(selectedValues.filter((v) => v !== optionValue));
    } else {
      if (maxSelections && selectedValues.length >= maxSelections) {
        return; // Limite atingido
      }
      onChange([...selectedValues, optionValue]);
    }
  };

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {options.map((option) => {
        const isSelected = selectedValues.includes(option.valor);
        const isDisabledByLimit =
          maxSelections &&
          selectedValues.length >= maxSelections &&
          !isSelected;

        return (
          <button
            key={option.valor}
            type="button"
            onClick={() => handleToggle(option.valor)}
            disabled={disabled || !!isDisabledByLimit}
            className={cn(
              'flex items-center gap-1.5 py-1.5 px-3 rounded-full border-2 text-sm font-medium transition-all',
              isSelected
                ? 'bg-primary border-primary text-primary-foreground shadow-sm'
                : 'bg-background border-border text-foreground hover:border-primary/50',
              (disabled || isDisabledByLimit) && 'opacity-50 cursor-not-allowed'
            )}
          >
            <div
              className={cn(
                'w-4 h-4 rounded-sm border flex items-center justify-center transition-colors',
                isSelected
                  ? 'bg-primary-foreground/20 border-primary-foreground/40'
                  : 'border-current'
              )}
            >
              {isSelected && <Check className="h-3 w-3" />}
            </div>
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
};

CheckboxGroup.displayName = 'CheckboxGroup';

