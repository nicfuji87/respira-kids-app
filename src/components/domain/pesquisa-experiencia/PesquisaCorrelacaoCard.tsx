// AI dev note: Card de correlação entre duas escalas (Pearson + scatter visual).
// Mostra coeficiente, interpretação textual, total de pares e mini-scatter.

import React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { cn } from '@/lib/utils';
import type { CorrelacaoNotas } from '@/types/pesquisa-experiencia';

interface PesquisaCorrelacaoCardProps {
  title: string;
  subtitle?: string;
  /** Label do eixo X. */
  xLabel: string;
  /** Label do eixo Y. */
  yLabel: string;
  correlacao: CorrelacaoNotas;
  className?: string;
}

function describeCorrelacao(coef: number): { label: string; tone: string } {
  const abs = Math.abs(coef);
  let strength = '';
  if (abs >= 0.7) strength = 'forte';
  else if (abs >= 0.4) strength = 'moderada';
  else if (abs >= 0.2) strength = 'fraca';
  else strength = 'praticamente inexistente';

  const direction = coef >= 0 ? 'positiva' : 'negativa';

  let tone = 'text-muted-foreground';
  if (abs >= 0.7 && coef > 0) tone = 'text-verde-pipa';
  else if (abs >= 0.4 && coef > 0) tone = 'text-roxo-titulo';
  else if (abs >= 0.4 && coef < 0) tone = 'text-vermelho-kids';

  return {
    label: `Correlação ${strength} ${direction}`,
    tone,
  };
}

export const PesquisaCorrelacaoCard = React.memo<PesquisaCorrelacaoCardProps>(
  ({ title, subtitle, xLabel, yLabel, correlacao, className }) => {
    const { coeficiente, total, pontos } = correlacao;
    const desc = describeCorrelacao(coeficiente);

    // Dimensões do scatter
    const W = 220;
    const H = 140;
    const PAD = 14;
    const innerW = W - PAD * 2;
    const innerH = H - PAD * 2;

    // Eixos vão de 1 a 10
    const xMin = 1;
    const xMax = 10;
    const yMin = 1;
    const yMax = 10;

    // Tamanho dos pontos baseado em count
    const maxCount = pontos.reduce((m, p) => Math.max(m, p.count), 1);

    return (
      <Card className={cn('overflow-hidden', className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base md:text-lg font-semibold">
            {title}
          </CardTitle>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Coeficiente */}
          <div className="flex items-end justify-between gap-3">
            <div>
              <p
                className={cn(
                  'text-4xl md:text-5xl font-bold leading-none',
                  desc.tone
                )}
              >
                {total >= 2 ? coeficiente.toFixed(2) : '—'}
              </p>
              <p className={cn('text-xs font-semibold mt-1.5', desc.tone)}>
                {total >= 2 ? desc.label : 'Amostra insuficiente'}
              </p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>
                <span className="font-semibold text-foreground">{total}</span>{' '}
                {total === 1 ? 'par' : 'pares'} de respostas
              </p>
              <p className="mt-0.5">Pearson (-1 a 1)</p>
            </div>
          </div>

          {/* Scatter plot */}
          {total >= 2 && (
            <div className="flex flex-col items-center gap-1">
              <svg
                width={W}
                height={H}
                viewBox={`0 0 ${W} ${H}`}
                className="max-w-full"
              >
                {/* Grid de fundo */}
                <line
                  x1={PAD}
                  y1={H - PAD}
                  x2={W - PAD}
                  y2={H - PAD}
                  stroke="hsl(var(--border))"
                  strokeWidth={1}
                />
                <line
                  x1={PAD}
                  y1={PAD}
                  x2={PAD}
                  y2={H - PAD}
                  stroke="hsl(var(--border))"
                  strokeWidth={1}
                />
                {/* Pontos */}
                {pontos.map((p, i) => {
                  const cx = PAD + ((p.x - xMin) / (xMax - xMin)) * innerW;
                  const cy = H - PAD - ((p.y - yMin) / (yMax - yMin)) * innerH;
                  const r = 3 + (p.count / maxCount) * 5;
                  return (
                    <circle
                      key={i}
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill="hsl(var(--azul-respira))"
                      opacity={0.7}
                    />
                  );
                })}
              </svg>
              <div className="flex justify-between w-full text-[11px] text-muted-foreground/80 px-1">
                <span>{xLabel} (1) →</span>
                <span>{xLabel} (10)</span>
              </div>
            </div>
          )}

          {/* Interpretação textual */}
          {total >= 2 && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              Quando <strong>{xLabel}</strong> aumenta,{' '}
              <strong>{yLabel}</strong> tende a{' '}
              {coeficiente > 0.05
                ? 'aumentar também'
                : coeficiente < -0.05
                  ? 'diminuir'
                  : 'permanecer estável'}
              .
            </p>
          )}
        </CardContent>
      </Card>
    );
  }
);

PesquisaCorrelacaoCard.displayName = 'PesquisaCorrelacaoCard';
