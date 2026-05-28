// AI dev note: Escala 1 a 10 visual com botões arredondados grandes.
// 1-6 neutro, 7-8 positivo, 9-10 destaque visual (verde/azul).
// Exige clique em "Continuar" (decidido pelo usuário) para evitar cliques acidentais.

import React, { useCallback } from 'react';
import { Button } from '@/components/primitives/button';
import { cn } from '@/lib/utils';

interface PesquisaScale10Props {
  value?: number;
  onChange: (n: number) => void;
  onContinue: () => void;
  ctaLabel?: string;
}

function getBucketClass(n: number, isSelected: boolean) {
  // Não selecionado — cores neutras com leve diferenciação por bucket
  if (!isSelected) {
    if (n <= 6) {
      return 'bg-card text-foreground border-border/70 hover:border-vermelho-kids/40 hover:bg-vermelho-kids/5';
    }
    if (n <= 8) {
      return 'bg-card text-foreground border-border/70 hover:border-amarelo-pipa/60 hover:bg-amarelo-pipa/10';
    }
    return 'bg-card text-foreground border-border/70 hover:border-verde-pipa hover:bg-verde-pipa/15';
  }

  // Selecionado
  if (n <= 6) {
    return 'bg-vermelho-kids/15 text-roxo-titulo border-vermelho-kids shadow-md scale-110';
  }
  if (n <= 8) {
    return 'bg-amarelo-pipa/25 text-roxo-titulo border-amarelo-pipa shadow-md scale-110';
  }
  return 'bg-verde-pipa/30 text-roxo-titulo border-verde-pipa shadow-lg scale-110 ring-2 ring-verde-pipa/40 ring-offset-2 ring-offset-card';
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
                  getBucketClass(n, isSelected)
                )}
                aria-label={`Nota ${n}`}
                aria-pressed={isSelected}
              >
                {n}
              </button>
            );
          })}
        </div>

        {/* Legenda visual */}
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span>Muito baixo</span>
          <span>Médio</span>
          <span className="font-semibold text-roxo-titulo">Muito alto</span>
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
