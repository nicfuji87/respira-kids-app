import React, { useRef, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

// AI dev note: Componente primitivo para entrada de PIN de 4 dígitos
// Baseado no padrão de inputs individuais para cada dígito
// Com suporte a navegação por teclado e paste

interface PinInputProps {
  length?: number;
  value?: string;
  onChange?: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  error?: boolean;
  autoFocus?: boolean;
  className?: string;
}

export const PinInput = React.forwardRef<HTMLDivElement, PinInputProps>(
  (
    {
      length = 4,
      value = '',
      onChange,
      onComplete,
      disabled = false,
      error = false,
      autoFocus = false,
      className,
    },
    ref
  ) => {
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
    const [pins, setPins] = useState<string[]>(
      value.split('').concat(Array(length - value.length).fill(''))
    );

    useEffect(() => {
      if (autoFocus && inputRefs.current[0]) {
        inputRefs.current[0].focus();
      }
    }, [autoFocus]);

    useEffect(() => {
      const newValue = value.slice(0, length);
      setPins(
        newValue.split('').concat(Array(length - newValue.length).fill(''))
      );
    }, [value, length]);

    const handleChange = (index: number, newValue: string) => {
      if (disabled) return;

      // Apenas aceitar números
      const numericValue = newValue.replace(/[^0-9]/g, '');

      if (numericValue.length > 1) {
        // Handle paste
        const pastedValues = numericValue.slice(0, length).split('');
        const newPins = [...pins];

        pastedValues.forEach((val, i) => {
          if (index + i < length) {
            newPins[index + i] = val;
          }
        });

        setPins(newPins);
        const fullValue = newPins.join('');
        onChange?.(fullValue);

        // Focus no próximo input vazio ou último
        const nextEmptyIndex = newPins.findIndex(
          (pin, i) => i >= index && !pin
        );
        const focusIndex = nextEmptyIndex === -1 ? length - 1 : nextEmptyIndex;
        inputRefs.current[Math.min(focusIndex, length - 1)]?.focus();

        if (fullValue.length === length && !fullValue.includes('')) {
          onComplete?.(fullValue);
        }
        return;
      }

      const newPins = [...pins];
      newPins[index] = numericValue;
      setPins(newPins);

      const fullValue = newPins.join('');
      onChange?.(fullValue);

      // Auto-focus próximo input
      if (numericValue && index < length - 1) {
        inputRefs.current[index + 1]?.focus();
      }

      // Verificar se está completo
      if (fullValue.length === length && !fullValue.includes('')) {
        // Pequeno delay para garantir que o estado foi atualizado
        setTimeout(() => {
          onComplete?.(fullValue);
        }, 50);
      }
    };

    const handleKeyDown = (
      index: number,
      e: React.KeyboardEvent<HTMLInputElement>
    ) => {
      if (disabled) return;

      if (e.key === 'Backspace') {
        e.preventDefault();

        if (pins[index]) {
          // Limpar o valor atual
          const newPins = [...pins];
          newPins[index] = '';
          setPins(newPins);
          onChange?.(newPins.join(''));
        } else if (index > 0) {
          // Voltar para o input anterior se o atual estiver vazio
          inputRefs.current[index - 1]?.focus();
        }
      } else if (e.key === 'ArrowLeft' && index > 0) {
        e.preventDefault();
        inputRefs.current[index - 1]?.focus();
      } else if (e.key === 'ArrowRight' && index < length - 1) {
        e.preventDefault();
        inputRefs.current[index + 1]?.focus();
      }
    };

    const handleFocus = (index: number) => {
      inputRefs.current[index]?.select();
    };

    const handlePaste = (e: React.ClipboardEvent) => {
      e.preventDefault();
      if (disabled) return;

      const pastedData = e.clipboardData.getData('text');
      const numericData = pastedData.replace(/[^0-9]/g, '').slice(0, length);

      if (numericData) {
        const newPins = numericData
          .split('')
          .concat(Array(length - numericData.length).fill(''));
        setPins(newPins);

        const fullValue = newPins.join('');
        onChange?.(fullValue);

        // Focus no último input preenchido ou no último
        const lastFilledIndex = newPins.reduceRight((acc, pin, idx) => {
          if (acc === -1 && pin !== '') return idx;
          return acc;
        }, -1);
        const focusIndex =
          lastFilledIndex === length - 1 ? length - 1 : lastFilledIndex + 1;
        inputRefs.current[Math.min(focusIndex, length - 1)]?.focus();

        if (fullValue.length === length && !fullValue.includes('')) {
          // Pequeno delay para garantir que o estado foi atualizado
          setTimeout(() => {
            onComplete?.(fullValue);
          }, 50);
        }
      }
    };

    return (
      <div
        ref={ref}
        className={cn('flex gap-2 sm:gap-3', className)}
        onPaste={handlePaste}
      >
        {Array.from({ length }, (_, index) => (
          <input
            key={index}
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]"
            maxLength={1}
            value={pins[index]}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onFocus={() => handleFocus(index)}
            disabled={disabled}
            className={cn(
              'h-12 w-12 sm:h-14 sm:w-14 text-center text-lg sm:text-xl font-semibold',
              'border-2 rounded-lg transition-all duration-200',
              'focus:outline-none focus:ring-2 focus:ring-offset-2',
              error
                ? 'border-destructive focus:ring-destructive'
                : 'border-input focus:ring-roxo-titulo focus:border-roxo-titulo',
              disabled && 'cursor-not-allowed opacity-50',
              pins[index] && !error && 'border-verde-pipa'
            )}
            aria-label={`Dígito ${index + 1} do PIN`}
          />
        ))}
      </div>
    );
  }
);

PinInput.displayName = 'PinInput';
