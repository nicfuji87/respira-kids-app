// AI dev note: Escala 1 a 10 visual com botões arredondados grandes.
// Cores semafóricas em TODOS os números (mesmo não selecionados) para feedback visual imediato:
//   1-2 = vermelho forte | 3-4 = vermelho | 5-6 = laranja/amarelo | 7-8 = amarelo claro | 9-10 = verde
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

/** Classes do botão (estado base + seleção) por nota — sempre coloridas. */
function getBucketClass(n: number, isSelected: boolean) {
  // Mapeamento por intensidade emocional (todos coloridos, selecionado fica mais forte)
  if (n <= 2) {
    return isSelected
      ? 'bg-vermelho-kids text-white border-vermelho-kids shadow-lg scale-110 ring-2 ring-vermelho-kids/40 ring-offset-2 ring-offset-card'
      : 'bg-vermelho-kids/15 text-roxo-titulo border-vermelho-kids/50 hover:bg-vermelho-kids/25 hover:border-vermelho-kids';
  }
  if (n <= 4) {
    return isSelected
      ? 'bg-vermelho-kids/80 text-white border-vermelho-kids shadow-md scale-110'
      : 'bg-vermelho-kids/10 text-roxo-titulo border-vermelho-kids/30 hover:bg-vermelho-kids/20 hover:border-vermelho-kids/60';
  }
  if (n <= 6) {
    return isSelected
      ? 'bg-amarelo-pipa text-roxo-titulo border-amarelo-pipa shadow-md scale-110 ring-2 ring-amarelo-pipa/40 ring-offset-2 ring-offset-card'
      : 'bg-amarelo-pipa/15 text-roxo-titulo border-amarelo-pipa/40 hover:bg-amarelo-pipa/25 hover:border-amarelo-pipa';
  }
  if (n <= 8) {
    return isSelected
      ? 'bg-amarelo-pipa/80 text-roxo-titulo border-amarelo-pipa shadow-md scale-110'
      : 'bg-amarelo-pipa/10 text-roxo-titulo border-amarelo-pipa/30 hover:bg-amarelo-pipa/20 hover:border-amarelo-pipa/60';
  }
  // 9-10: verde, com 10 ainda mais destacado
  return isSelected
    ? 'bg-verde-pipa text-roxo-titulo border-verde-pipa shadow-xl scale-110 ring-2 ring-verde-pipa/50 ring-offset-2 ring-offset-card'
    : 'bg-verde-pipa/25 text-roxo-titulo border-verde-pipa/50 hover:bg-verde-pipa/40 hover:border-verde-pipa';
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

        {/* Legenda visual com cores */}
        <div className="flex items-center justify-between text-xs px-1">
          <span className="text-vermelho-kids font-medium">Muito baixo</span>
          <span className="text-amarelo-pipa font-medium">Médio</span>
          <span className="text-verde-pipa font-semibold">Muito alto</span>
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
