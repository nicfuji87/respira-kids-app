// AI dev note: Card de NPS com score grande + barra de proporção
// promotores / neutros / detratores.

import React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { cn } from '@/lib/utils';
import type { NpsBreakdown } from '@/types/pesquisa-experiencia';

interface PesquisaNPSCardProps {
  nps: NpsBreakdown;
  className?: string;
}

function getNpsTone(score: number): {
  className: string;
  label: string;
} {
  if (score >= 75) {
    return {
      className: 'text-verde-pipa',
      label: 'Excelente',
    };
  }
  if (score >= 50) {
    return {
      className: 'text-roxo-titulo',
      label: 'Muito bom',
    };
  }
  if (score >= 0) {
    return {
      className: 'text-amarelo-pipa',
      label: 'Em construção',
    };
  }
  return {
    className: 'text-vermelho-kids',
    label: 'Atenção',
  };
}

export const PesquisaNPSCard = React.memo<PesquisaNPSCardProps>(
  ({ nps, className }) => {
    const tone = getNpsTone(nps.nps);

    const promotoresPct =
      nps.total > 0 ? (nps.promotores / nps.total) * 100 : 0;
    const neutrosPct = nps.total > 0 ? (nps.neutros / nps.total) * 100 : 0;
    const detratoresPct =
      nps.total > 0 ? (nps.detratores / nps.total) * 100 : 0;

    return (
      <Card className={cn('overflow-hidden', className)}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base md:text-lg font-semibold flex items-center gap-2">
            NPS · Chance de Indicação
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Promotores (9-10) menos detratores (1-6). Faixa: -100 a 100.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Score grande */}
          <div className="flex items-end justify-between gap-4">
            <div>
              <p
                className={cn(
                  'text-5xl md:text-6xl font-bold leading-none',
                  tone.className
                )}
              >
                {nps.total > 0 ? nps.nps : '—'}
              </p>
              <p className={cn('text-sm font-semibold mt-1.5', tone.className)}>
                {nps.total > 0 ? tone.label : 'Aguardando respostas'}
              </p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>
                <span className="font-semibold text-foreground">
                  {nps.total}
                </span>{' '}
                {nps.total === 1 ? 'resposta' : 'respostas'}
              </p>
            </div>
          </div>

          {/* Barra proporcional */}
          <div className="h-3 w-full flex rounded-full overflow-hidden bg-muted/60">
            <div
              className="h-full bg-vermelho-kids transition-all"
              style={{ width: `${detratoresPct}%` }}
              title={`${nps.detratores} detratores`}
            />
            <div
              className="h-full bg-amarelo-pipa transition-all"
              style={{ width: `${neutrosPct}%` }}
              title={`${nps.neutros} neutros`}
            />
            <div
              className="h-full bg-verde-pipa transition-all"
              style={{ width: `${promotoresPct}%` }}
              title={`${nps.promotores} promotores`}
            />
          </div>

          {/* Legenda */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="flex items-center justify-center gap-1.5 text-vermelho-kids">
                <span className="w-2 h-2 rounded-full bg-vermelho-kids" />
                <span className="text-xs font-medium">Detratores</span>
              </div>
              <p className="text-lg font-bold text-foreground mt-1">
                {nps.detratores}
              </p>
              <p className="text-xs text-muted-foreground">
                {Math.round(detratoresPct)}%
              </p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1.5 text-amarelo-pipa">
                <span className="w-2 h-2 rounded-full bg-amarelo-pipa" />
                <span className="text-xs font-medium">Neutros</span>
              </div>
              <p className="text-lg font-bold text-foreground mt-1">
                {nps.neutros}
              </p>
              <p className="text-xs text-muted-foreground">
                {Math.round(neutrosPct)}%
              </p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1.5 text-verde-pipa">
                <span className="w-2 h-2 rounded-full bg-verde-pipa" />
                <span className="text-xs font-medium">Promotores</span>
              </div>
              <p className="text-lg font-bold text-foreground mt-1">
                {nps.promotores}
              </p>
              <p className="text-xs text-muted-foreground">
                {Math.round(promotoresPct)}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
);

PesquisaNPSCard.displayName = 'PesquisaNPSCard';
