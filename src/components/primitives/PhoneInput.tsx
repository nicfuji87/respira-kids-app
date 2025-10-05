import * as React from 'react';
import { Phone } from 'lucide-react';
import { cn } from '@/lib/utils';

// AI dev note: PhoneInput mobile-first para validação de WhatsApp
// Máscara automática (XX) XXXXX-XXXX, touch-friendly, com estados de validação

export interface PhoneInputProps
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
 * Formata número de telefone brasileiro para (XX) XXXXX-XXXX
 */
const formatPhoneNumber = (value: string): string => {
  // Remove tudo que não é dígito
  const digits = value.replace(/\D/g, '');

  // Limita a 11 dígitos
  const limited = digits.slice(0, 11);

  // Aplica máscara
  if (limited.length === 0) return '';
  if (limited.length <= 2) return `(${limited}`;
  if (limited.length <= 7)
    return `(${limited.slice(0, 2)}) ${limited.slice(2)}`;

  return `(${limited.slice(0, 2)}) ${limited.slice(2, 7)}-${limited.slice(7)}`;
};

export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
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
      const formatted = formatPhoneNumber(e.target.value);
      onChange(formatted);
    };

    // Determinar cor da borda baseado no estado de validação
    const getBorderColor = () => {
      if (isValidating) return 'border-primary/50';
      if (isValid === true) return 'border-green-500';
      if (isValid === false) return 'border-destructive';
      return 'border-input';
    };

    return (
      <div className="relative w-full">
        {/* Ícone do telefone */}
        <Phone
          className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground z-10"
          aria-hidden="true"
        />

        {/* Input com máscara */}
        <input
          ref={ref}
          type="tel"
          inputMode="numeric"
          value={value}
          onChange={handleChange}
          disabled={disabled || isValidating}
          className={cn(
            // Base styles - mobile-first (h-14 = 56px para touch target)
            'flex h-14 w-full rounded-lg border bg-background pl-12 pr-12 py-4',
            'text-lg font-medium text-foreground',
            'shadow-sm transition-all duration-200',
            'placeholder:text-muted-foreground/60',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            // Cor da borda baseada no estado
            getBorderColor(),
            // Animação sutil no hover
            'hover:border-primary/30',
            className
          )}
          placeholder="(00) 00000-0000"
          aria-invalid={isValid === false}
          aria-describedby={errorMessage ? 'phone-error' : undefined}
          {...props}
        />

        {/* Spinner de validação */}
        {isValidating && (
          <div className="absolute right-4 top-1/2 transform -translate-y-1/2 z-10">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Ícone de sucesso */}
        {isValid === true && !isValidating && (
          <div className="absolute right-4 top-1/2 transform -translate-y-1/2 z-10">
            <svg
              className="w-5 h-5 text-green-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        )}

        {/* Ícone de erro */}
        {isValid === false && !isValidating && (
          <div className="absolute right-4 top-1/2 transform -translate-y-1/2 z-10">
            <svg
              className="w-5 h-5 text-destructive"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
        )}

        {/* Mensagem de erro */}
        {errorMessage && isValid === false && (
          <p
            id="phone-error"
            className="mt-2 text-sm text-destructive font-medium"
            role="alert"
          >
            {errorMessage}
          </p>
        )}
      </div>
    );
  }
);

PhoneInput.displayName = 'PhoneInput';
