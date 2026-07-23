// AI dev note: Cards de múltipla escolha com limite opcional (maxSelections).
// Mostra botão "Continuar" no rodapé. Quando atinge o max, pode auto-avançar.

import React, { useCallback, useMemo } from 'react';
import { Button } from '@/components/primitives/button';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import type { QuestionOption } from '@/types/pesquisa-experiencia';

interface PesquisaMultiChoiceProps {
  options: QuestionOption[];
  value: string[];
  maxSelections?: number;
  onChange: (next: string[]) => void;
  onContinue: () => void;
}

export const PesquisaMultiChoice = React.memo<PesquisaMultiChoiceProps>(
  ({ options, value, maxSelections, onChange, onContinue }) => {
    const selected = useMemo(() => value || [], [value]);

    const toggle = useCallback(
      (optValue: string) => {
        if (selected.includes(optValue)) {
          onChange(selected.filter((v) => v !== optValue));
          return;
        }
        if (
          typeof maxSelections === 'number' &&
          selected.length >= maxSelections
        ) {
          // Substitui o primeiro selecionado (sensação de "ah, troquei")
          // ou simplesmente ignora — preferi ignorar para não confundir.
          return;
        }
        onChange([...selected, optValue]);
      },
      [selected, maxSelections, onChange]
    );

    const limitReached =
      typeof maxSelections === 'number' && selected.length >= maxSelections;

    const canContinue = selected.length > 0;

    return (
      <div className="w-full flex flex-col gap-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
          {options.map((opt) => {
            const isSelected = selected.includes(opt.value);
            const isDisabled = limitReached && !isSelected;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value)}
                disabled={isDisabled}
                className={cn(
                  'group relative w-full text-left',
                  'flex items-center gap-3 px-5 py-4 min-h-[64px]',
                  'rounded-2xl border-2 bg-card',
                  'transition-all duration-300 ease-out',
                  'hover:border-azul-respira/60 hover:shadow-md hover:-translate-y-0.5',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-azul-respira/60',
                  'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none',
                  isSelected
                    ? 'border-azul-respira bg-azul-respira/10 shadow-md'
                    : 'border-border/60'
                )}
              >
                <span
                  className={cn(
                    'flex-1 text-base md:text-lg font-medium leading-snug',
                    isSelected ? 'text-roxo-titulo' : 'text-foreground'
                  )}
                >
                  {opt.label}
                </span>

                {/* Checkbox visual */}
                <span
                  className={cn(
                    'shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all duration-300',
                    isSelected
                      ? 'border-azul-respira bg-azul-respira'
                      : 'border-muted-foreground/30 bg-transparent group-hover:border-azul-respira/50'
                  )}
                >
                  {isSelected && (
                    <Check className="w-4 h-4 text-white animate-in zoom-in duration-200" />
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {/* Helper de seleção + CTA */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <p className="text-sm text-muted-foreground">
            {typeof maxSelections === 'number'
              ? `${selected.length} de ${maxSelections} selecionada${maxSelections > 1 ? 's' : ''}`
              : `${selected.length} selecionada${selected.length === 1 ? '' : 's'}`}
          </p>
          <Button
            size="lg"
            onClick={onContinue}
            disabled={!canContinue}
            className="w-full sm:w-auto min-w-[180px] h-12 rounded-full"
          >
            Continuar
          </Button>
        </div>
      </div>
    );
  }
);

PesquisaMultiChoice.displayName = 'PesquisaMultiChoice';
