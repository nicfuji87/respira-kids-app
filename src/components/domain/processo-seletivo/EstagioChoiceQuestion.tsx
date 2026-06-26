// AI dev note: Pergunta de escolha única (situacional e estilo de trabalho).
// As alternativas são embaralhadas a cada exibição (anti-"a resposta é sempre a C").
// Ao selecionar, dá feedback visual (~380ms) e avança automaticamente.
// Não mostra qual é a "certa" — a correção é feita no servidor.

import React, { useCallback, useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { QuestionOption } from '@/types/processo-seletivo';

interface EstagioChoiceQuestionProps {
  kicker?: string;
  enunciado: string;
  options: QuestionOption[];
  value?: string;
  /** Se true, embaralha a ordem de exibição das alternativas. */
  shuffle?: boolean;
  onSelect: (value: string) => void;
  onComplete: () => void;
  onBack?: () => void;
  canGoBack: boolean;
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const EstagioChoiceQuestion = React.memo<EstagioChoiceQuestionProps>(
  ({
    kicker,
    enunciado,
    options,
    value,
    shuffle = false,
    onSelect,
    onComplete,
    onBack,
    canGoBack,
  }) => {
    const [pending, setPending] = useState<string | null>(null);

    // Embaralha uma vez por montagem (cada step remonta via key).
    const displayOptions = useMemo(
      () => (shuffle ? shuffleArray(options) : options),
      [shuffle, options]
    );

    const handleClick = useCallback(
      (optValue: string) => {
        if (pending) return;
        setPending(optValue);
        onSelect(optValue);
        window.setTimeout(() => onComplete(), 380);
      },
      [pending, onSelect, onComplete]
    );

    return (
      <div className="w-full flex flex-col gap-6 animate-in fade-in slide-in-from-right-2 duration-400">
        {canGoBack && onBack && (
          <button
            type="button"
            onClick={onBack}
            className="self-start inline-flex items-center gap-1 text-sm text-muted-foreground/80 hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Voltar
          </button>
        )}

        <div className="space-y-2">
          {kicker && (
            <span className="inline-block text-xs font-semibold uppercase tracking-wide text-azul-respira">
              {kicker}
            </span>
          )}
          <h2 className="text-xl md:text-2xl font-bold text-foreground leading-snug">
            {enunciado}
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-3 w-full">
          {displayOptions.map((opt) => {
            const isSelected = (pending ?? value) === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleClick(opt.value)}
                disabled={pending !== null && pending !== opt.value}
                className={cn(
                  'group relative w-full text-left',
                  'flex items-start gap-3 px-5 py-4',
                  'rounded-2xl border-2 bg-card',
                  'transition-all duration-300 ease-out',
                  'hover:border-azul-respira/60 hover:shadow-md',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-azul-respira/60',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  isSelected
                    ? 'border-azul-respira bg-azul-respira/10 shadow-md'
                    : 'border-border/60'
                )}
              >
                <span
                  className={cn(
                    'shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 transition-all duration-300',
                    isSelected
                      ? 'border-azul-respira bg-azul-respira'
                      : 'border-muted-foreground/30 bg-transparent group-hover:border-azul-respira/50'
                  )}
                />
                <span
                  className={cn(
                    'flex-1 text-base md:text-lg font-medium leading-snug',
                    isSelected ? 'text-roxo-titulo' : 'text-foreground'
                  )}
                >
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }
);

EstagioChoiceQuestion.displayName = 'EstagioChoiceQuestion';
