// AI dev note: Cards de escolha única.
// Ao selecionar, dá feedback visual (~350ms) e auto-avança via onComplete.

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import type { QuestionOption } from '@/types/pesquisa-experiencia';

interface PesquisaSingleChoiceProps {
  options: QuestionOption[];
  value?: string;
  onSelect: (value: string) => void;
  /** Chamado após pequeno delay para animação. */
  onComplete: (value: string) => void;
}

export const PesquisaSingleChoice = React.memo<PesquisaSingleChoiceProps>(
  ({ options, value, onSelect, onComplete }) => {
    const [pending, setPending] = useState<string | null>(null);

    const handleClick = useCallback(
      (optValue: string) => {
        if (pending) return;
        setPending(optValue);
        onSelect(optValue);

        // Pequeno delay para feedback visual antes de avançar
        window.setTimeout(() => {
          onComplete(optValue);
        }, 380);
      },
      [pending, onSelect, onComplete]
    );

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
        {options.map((opt) => {
          const isSelected = (pending ?? value) === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleClick(opt.value)}
              disabled={pending !== null && pending !== opt.value}
              className={cn(
                'group relative w-full text-left',
                'flex items-center gap-3 px-5 py-4 min-h-[64px]',
                'rounded-2xl border-2 bg-card',
                'transition-all duration-300 ease-out',
                'hover:border-azul-respira/60 hover:shadow-md hover:-translate-y-0.5',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-azul-respira/60',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                isSelected
                  ? 'border-azul-respira bg-azul-respira/10 shadow-md scale-[1.02]'
                  : 'border-border/60'
              )}
            >
              {opt.emoji && (
                <span
                  className={cn(
                    'text-2xl shrink-0 transition-transform duration-300',
                    isSelected && 'scale-110'
                  )}
                  aria-hidden
                >
                  {opt.emoji}
                </span>
              )}
              <span
                className={cn(
                  'flex-1 text-base md:text-lg font-medium leading-snug',
                  isSelected ? 'text-roxo-titulo' : 'text-foreground'
                )}
              >
                {opt.label}
              </span>

              {/* Indicador de seleção */}
              <span
                className={cn(
                  'shrink-0 w-5 h-5 rounded-full border-2 transition-all duration-300',
                  isSelected
                    ? 'border-azul-respira bg-azul-respira'
                    : 'border-muted-foreground/30 bg-transparent group-hover:border-azul-respira/50'
                )}
              >
                {isSelected && (
                  <span className="block w-full h-full rounded-full bg-azul-respira animate-in zoom-in duration-200" />
                )}
              </span>
            </button>
          );
        })}
      </div>
    );
  }
);

PesquisaSingleChoice.displayName = 'PesquisaSingleChoice';
