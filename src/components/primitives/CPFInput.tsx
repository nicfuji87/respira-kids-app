import * as React from 'react';
import { IdCard } from 'lucide-react';
import { cn } from '@/lib/utils';

// AI dev note: CPFInput mobile-first com máscara e validação
// Máscara automática XXX.XXX.XXX-XX, validação de CPF, touch-friendly

export interface CPFInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'type' | 'value' | 'onChange'
  > {
  value: string;
  onChange: (value: string) => void;
  isValidating?: boolean;
  isValid?: boolean | null;
  errorMessage?: string;
}

/**
 * Formata CPF para XXX.XXX.XXX-XX
 */
const formatCPF = (value: string): string => {
  // Remove tudo que não é dígito
  const digits = value.replace(/\D/g, '');

  // Limita a 11 dígitos
  const limited = digits.slice(0, 11);

  // Aplica máscara
  if (limited.length === 0) return '';
  if (limited.length <= 3) return limited;
  if (limited.length <= 6) return `${limited.slice(0, 3)}.${limited.slice(3)}`;
  if (limited.length <= 9)
    return `${limited.slice(0, 3)}.${limited.slice(3, 6)}.${limited.slice(6)}`;

  return `${limited.slice(0, 3)}.${limited.slice(3, 6)}.${limited.slice(6, 9)}-${limited.slice(9)}`;
};

/**
 * Valida CPF usando algoritmo oficial
 */
// eslint-disable-next-line react-refresh/only-export-components
export const validateCPF = (cpf: string): boolean => {
  const digits = cpf.replace(/\D/g, '');

  // Verifica se tem 11 dígitos
  if (digits.length !== 11) return false;

  // Verifica se todos os dígitos são iguais
  if (/^(\d)\1{10}$/.test(digits)) return false;

  // Valida primeiro dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits.charAt(i)) * (10 - i);
  }
  let remainder = 11 - (sum % 11);
  const digit1 = remainder >= 10 ? 0 : remainder;

  if (digit1 !== parseInt(digits.charAt(9))) return false;

  // Valida segundo dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(digits.charAt(i)) * (11 - i);
  }
  remainder = 11 - (sum % 11);
  const digit2 = remainder >= 10 ? 0 : remainder;

  return digit2 === parseInt(digits.charAt(10));
};

export const CPFInput = React.forwardRef<HTMLInputElement, CPFInputProps>(
  (
    {
      className,
      value,
      onChange,
      isValidating = false,
      isValid = null,
      errorMessage,
      disabled,
      ...props
    },
    ref
  ) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const formatted = formatCPF(e.target.value);
      onChange(formatted);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      // Validação automática ao sair do campo
      const digits = e.target.value.replace(/\D/g, '');
      if (digits.length === 11 && !validateCPF(e.target.value)) {
        // Propagar evento para validação externa
      }
      props.onBlur?.(e);
    };

    // Estados visuais
    const showError = errorMessage && errorMessage.length > 0;
    const showSuccess = isValid === true && !isValidating;
    const showValidating = isValidating;

    return (
      <div className="w-full space-y-1.5">
        <div className="relative">
          {/* Ícone */}
          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <IdCard
              className={cn(
                'h-5 w-5 transition-colors',
                showError && 'text-destructive',
                showSuccess && 'text-green-500',
                showValidating && 'text-muted-foreground animate-pulse',
                !showError &&
                  !showSuccess &&
                  !showValidating &&
                  'text-muted-foreground'
              )}
            />
          </div>

          {/* Input */}
          <input
            ref={ref}
            type="text"
            inputMode="numeric"
            value={value}
            onChange={handleChange}
            onBlur={handleBlur}
            disabled={disabled || isValidating}
            className={cn(
              // Base
              'flex h-12 w-full rounded-lg border bg-background pl-11 pr-4 py-3',
              'text-base font-medium transition-all duration-200',
              'placeholder:text-muted-foreground/50',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',

              // Estados de validação
              showError && 'border-destructive focus-visible:ring-destructive',
              showSuccess && 'border-green-500 focus-visible:ring-green-500',
              showValidating && 'border-muted-foreground/30',
              !showError &&
                !showSuccess &&
                !showValidating &&
                'border-input focus-visible:ring-ring',

              // Disabled
              disabled && 'cursor-not-allowed opacity-50',

              // Mobile-first
              'text-lg md:text-base',

              className
            )}
            {...props}
          />

          {/* Indicador de validação (spinner ou check) */}
          {showValidating && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            </div>
          )}

          {showSuccess && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <svg
                className="h-5 w-5 text-green-500"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path d="M5 13l4 4L19 7" />
              </svg>
            </div>
          )}
        </div>

        {/* Mensagem de erro */}
        {showError && (
          <p className="text-sm font-medium text-destructive px-1">
            {errorMessage}
          </p>
        )}
      </div>
    );
  }
);

CPFInput.displayName = 'CPFInput';
