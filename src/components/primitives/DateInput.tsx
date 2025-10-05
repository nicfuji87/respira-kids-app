import * as React from 'react';
import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

// AI dev note: DateInput mobile-first com validação
// Usa input type="date" nativo para melhor UX mobile, validação de idade mínima/máxima

export interface DateInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'type' | 'value' | 'onChange'
  > {
  value: string; // Formato: YYYY-MM-DD (ISO)
  onChange: (value: string) => void;
  minAge?: number; // Idade mínima em anos
  maxAge?: number; // Idade máxima em anos
  errorMessage?: string;
  helperText?: string;
}

/**
 * Calcula idade baseada na data de nascimento
 */
// eslint-disable-next-line react-refresh/only-export-components
export const calculateAge = (birthDate: string): number => {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return age;
};

/**
 * Valida data com regras de idade
 */
// eslint-disable-next-line react-refresh/only-export-components
export const validateDate = (
  date: string,
  minAge?: number,
  maxAge?: number
): { valid: boolean; error?: string } => {
  if (!date) {
    return { valid: false, error: 'Data é obrigatória' };
  }

  const selectedDate = new Date(date);
  const today = new Date();

  // Não pode ser data futura
  if (selectedDate > today) {
    return { valid: false, error: 'Data não pode ser futura' };
  }

  const age = calculateAge(date);

  if (minAge !== undefined && age < minAge) {
    return { valid: false, error: `Idade mínima: ${minAge} anos` };
  }

  if (maxAge !== undefined && age > maxAge) {
    return { valid: false, error: `Idade máxima: ${maxAge} anos` };
  }

  return { valid: true };
};

/**
 * Formata data ISO para exibição (DD/MM/YYYY)
 */
// eslint-disable-next-line react-refresh/only-export-components
export const formatDateDisplay = (isoDate: string): string => {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
};

export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  (
    {
      className,
      value,
      onChange,
      minAge,
      maxAge,
      errorMessage,
      helperText,
      disabled,
      ...props
    },
    ref
  ) => {
    const [localError, setLocalError] = React.useState<string>('');

    // Calcular datas min/max baseadas em idade
    const today = new Date();
    const maxDate = today.toISOString().split('T')[0]; // Hoje

    let minDate: string | undefined;
    if (maxAge !== undefined) {
      const minBirthDate = new Date(today);
      minBirthDate.setFullYear(minBirthDate.getFullYear() - maxAge);
      minDate = minBirthDate.toISOString().split('T')[0];
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      onChange(newValue);
      setLocalError('');
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      const validation = validateDate(e.target.value, minAge, maxAge);
      if (!validation.valid && validation.error) {
        setLocalError(validation.error);
      } else {
        setLocalError('');
      }
      props.onBlur?.(e);
    };

    const displayError = errorMessage || localError;
    const showError = displayError && displayError.length > 0;

    // Calcular idade se houver valor
    const age = value ? calculateAge(value) : null;

    return (
      <div className="w-full space-y-1.5">
        <div className="relative">
          {/* Ícone */}
          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10">
            <Calendar
              className={cn(
                'h-5 w-5 transition-colors',
                showError && 'text-destructive',
                !showError && 'text-muted-foreground'
              )}
            />
          </div>

          {/* Input */}
          <input
            ref={ref}
            type="date"
            value={value}
            onChange={handleChange}
            onBlur={handleBlur}
            min={minDate}
            max={maxDate}
            disabled={disabled}
            className={cn(
              // Base
              'flex h-12 w-full rounded-lg border bg-background pl-11 pr-4 py-3',
              'text-base font-medium transition-all duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',

              // Estados de validação
              showError && 'border-destructive focus-visible:ring-destructive',
              !showError && 'border-input focus-visible:ring-ring',

              // Disabled
              disabled && 'cursor-not-allowed opacity-50',

              // Mobile-first
              'text-base',

              // Estilo do date picker nativo
              '[color-scheme:light] dark:[color-scheme:dark]',

              className
            )}
            {...props}
          />
        </div>

        {/* Helper text ou idade calculada */}
        {!showError && value && age !== null && (
          <p className="text-sm text-muted-foreground px-1">
            {age === 0 ? 'Menos de 1 ano' : `${age} ano${age !== 1 ? 's' : ''}`}
          </p>
        )}

        {!showError && helperText && !value && (
          <p className="text-sm text-muted-foreground px-1">{helperText}</p>
        )}

        {/* Mensagem de erro */}
        {showError && (
          <p className="text-sm font-medium text-destructive px-1">
            {displayError}
          </p>
        )}
      </div>
    );
  }
);

DateInput.displayName = 'DateInput';
