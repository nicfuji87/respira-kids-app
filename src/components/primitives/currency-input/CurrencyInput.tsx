import * as React from 'react';
import { DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';

// AI dev note: CurrencyInput mobile-first com máscara e validação de moeda BRL
// Formatação automática R$ X.XXX,XX, suporte para valores negativos opcional

export interface CurrencyInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'type' | 'value' | 'onChange'
  > {
  value: number | null;
  onChange: (value: number | null) => void;
  allowNegative?: boolean;
  min?: number;
  max?: number;
  errorMessage?: string;
}

/**
 * Formata número para moeda BRL (R$ X.XXX,XX)
 */
const formatCurrency = (value: number | null): string => {
  if (value === null || isNaN(value)) return '';

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

/**
 * Remove formatação e retorna número
 */
const parseCurrency = (value: string): number | null => {
  if (!value) return null;

  // Remove tudo exceto dígitos, vírgula e sinal de menos
  const cleaned = value.replace(/[^\d,-]/g, '');

  // Troca vírgula por ponto
  const normalized = cleaned.replace(',', '.');

  // Converte para número
  const parsed = parseFloat(normalized);

  return isNaN(parsed) ? null : parsed;
};

/**
 * Formata valor enquanto digita
 */
const formatOnType = (value: string, allowNegative: boolean): string => {
  // Remove caracteres não permitidos
  let cleaned = value.replace(/[^\d,-]/g, '');

  // Gerencia sinal negativo
  const isNegative = cleaned.startsWith('-');
  cleaned = cleaned.replace(/-/g, '');

  // Remove zeros à esquerda
  cleaned = cleaned.replace(/^0+/, '');

  // Garante pelo menos um zero antes da vírgula
  if (cleaned.startsWith(',')) cleaned = '0' + cleaned;
  if (cleaned === '') cleaned = '0';

  // Limita a 2 casas decimais
  const parts = cleaned.split(',');
  if (parts.length > 1) {
    cleaned = parts[0] + ',' + parts[1].slice(0, 2);
  }

  // Adiciona formatação de milhares
  const [integerPart, decimalPart] = cleaned.split(',');
  const formatted = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  const result = decimalPart ? `${formatted},${decimalPart}` : formatted;

  // Adiciona prefixo R$
  const withPrefix = `R$ ${result}`;

  // Adiciona sinal negativo se necessário
  return allowNegative && isNegative ? `-${withPrefix}` : withPrefix;
};

export const CurrencyInput = React.forwardRef<
  HTMLInputElement,
  CurrencyInputProps
>(
  (
    {
      className,
      value,
      onChange,
      allowNegative = false,
      min,
      max,
      errorMessage,
      disabled,
      ...props
    },
    ref
  ) => {
    const [displayValue, setDisplayValue] = React.useState(() =>
      formatCurrency(value)
    );
    const [isFocused, setIsFocused] = React.useState(false);

    React.useEffect(() => {
      if (!isFocused) {
        setDisplayValue(formatCurrency(value));
      }
    }, [value, isFocused]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = e.target.value;
      const formatted = formatOnType(inputValue, allowNegative);
      setDisplayValue(formatted);

      // Parse e valida
      const parsed = parseCurrency(formatted);

      // Valida limites
      if (parsed !== null) {
        if (min !== undefined && parsed < min) return;
        if (max !== undefined && parsed > max) return;
        if (!allowNegative && parsed < 0) return;
      }

      onChange(parsed);
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      props.onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      // Reformata ao sair do campo
      setDisplayValue(formatCurrency(value));
      props.onBlur?.(e);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Permite apenas teclas de controle e caracteres válidos
      const allowedKeys = [
        'Backspace',
        'Delete',
        'Tab',
        'Escape',
        'Enter',
        'Home',
        'End',
        'ArrowLeft',
        'ArrowRight',
      ];

      if (
        !allowedKeys.includes(e.key) &&
        !/[0-9,]/.test(e.key) &&
        !(allowNegative && e.key === '-')
      ) {
        e.preventDefault();
      }

      props.onKeyDown?.(e);
    };

    const showError = errorMessage && errorMessage.length > 0;

    return (
      <div className="w-full space-y-1.5">
        <div className="relative">
          {/* Ícone */}
          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <DollarSign
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
            type="text"
            inputMode="decimal"
            value={displayValue}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            className={cn(
              // Base
              'flex h-12 w-full rounded-lg border bg-background pl-11 pr-4 py-3',
              'text-base font-medium transition-all duration-200',
              'placeholder:text-muted-foreground/50',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',

              // Estados de validação
              showError && 'border-destructive focus-visible:ring-destructive',
              !showError && 'border-input focus-visible:ring-ring',

              // Disabled
              disabled && 'cursor-not-allowed opacity-50',

              // Mobile-first
              'text-lg md:text-base',

              // Alinhamento à direita para números
              'text-right',

              className
            )}
            {...props}
          />
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

CurrencyInput.displayName = 'CurrencyInput';
