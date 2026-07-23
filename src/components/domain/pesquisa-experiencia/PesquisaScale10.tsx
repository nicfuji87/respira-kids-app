// AI dev note: Escala 1 a 10 visual com botões arredondados grandes.
// Todos os números têm EXATAMENTE o mesmo peso visual até serem escolhidos —
// nada de semáforo (vermelho embaixo / verde em cima), que empurrava a resposta
// para o 9-10. A cor só aparece no estado selecionado, e é a mesma para qualquer nota.
// Exige clique em "Continuar" para evitar cliques acidentais.

import React, { useCallback } from 'react';
import { Button } from '@/components/primitives/button';
import { cn } from '@/lib/utils';

interface PesquisaScale10Props {
  value?: number;
  onChange: (n: number) => void;
  onContinue: () => void;
  ctaLabel?: string;
}

/**
 * Classes do botão por estado. Idêntico para as 10 notas: a única diferença é
 * selecionado x não selecionado. Qualquer variação por faixa reintroduz viés.
 */
function getScaleClass(isSelected: boolean) {
  return isSelected
    ? 'bg-azul-respira text-roxo-titulo border-azul-respira shadow-md scale-105'
    : 'bg-card text-foreground border-border/60 hover:border-azul-respira/60 hover:bg-azul-respira/5';
}

export const PesquisaScale10 = React.memo<PesquisaScale10Props>(
  ({ value, onChange, onContinue, ctaLabel = 'Continuar' }) => {
    const handleClick = useCallback(
      (n: number) => {
        onChange(n);
      },
      [onChange]
    );

    return (
      <div className="w-full flex flex-col gap-6">
        {/* Grid de notas 1-10 */}
        <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 sm:gap-3">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
            const isSelected = value === n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => handleClick(n)}
                className={cn(
                  'aspect-square w-full',
                  'rounded-2xl border-2 font-bold',
                  'text-xl md:text-2xl',
                  'transition-all duration-300 ease-out',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-azul-respira/60',
                  getScaleClass(isSelected)
                )}
                aria-label={`Nota ${n}`}
                aria-pressed={isSelected}
              >
                {n}
              </button>
            );
          })}
        </div>

        {/* Âncoras da escala — mesmo peso tipográfico nas duas pontas */}
        <div className="flex items-center justify-between text-xs px-1 text-muted-foreground">
          <span>Muito baixo</span>
          <span>Muito alto</span>
        </div>

        {/* CTA */}
        <div className="flex justify-center pt-2">
          <Button
            size="lg"
            onClick={onContinue}
            disabled={typeof value !== 'number'}
            className="w-full sm:w-auto min-w-[200px] h-12 rounded-full"
          >
            {ctaLabel}
          </Button>
        </div>
      </div>
    );
  }
);

PesquisaScale10.displayName = 'PesquisaScale10';
