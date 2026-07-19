// AI dev note: Card que mostra NPS segmentado por uma dimensão (canal, tempo, etc.).
// Tabela com label, total, breakdown promotor/neutro/detrator, NPS final colorido.

import React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { cn } from '@/lib/utils';
import type { NpsSegmento } from '@/types/pesquisa-experiencia';

interface PesquisaNpsSegmentadoProps {
  title: string;
  subtitle?: string;
  segmentos: NpsSegmento[];
  emptyLabel?: string;
  /** Quantidade mínima de respostas para considerar relevante (destacar). */
  minRespostas?: number;
  className?: string;
}

function npsColor(nps: number, total: number, minRespostas: number) {
  if (total < minRespostas) return 'text-muted-foreground';
  if (nps >= 75) return 'text-verde-pipa';
  if (nps >= 50) return 'text-roxo-titulo';
  if (nps >= 0) return 'text-amarelo-pipa';
  return 'text-vermelho-kids';
}

export const PesquisaNpsSegmentado = React.memo<PesquisaNpsSegmentadoProps>(
  ({
    title,
    subtitle,
    segmentos,
    emptyLabel = 'Ainda sem dados',
    minRespostas = 3,
    className,
  }) => {
    return (
      <Card className={cn('overflow-hidden', className)}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base md:text-lg font-semibold">
            {title}
          </CardTitle>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {segmentos.length === 0 ? (
            <p className="text-sm text-muted-foreground/80 py-6 text-center px-6">
              {emptyLabel}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-muted-foreground/70">
                    <th className="text-left font-medium px-6 py-2">
                      Segmento
                    </th>
                    <th className="text-center font-medium px-2 py-2 w-16">
                      Total
                    </th>
                    <th className="text-center font-medium px-2 py-2 hidden sm:table-cell">
                      Distribuição
                    </th>
                    <th className="text-right font-medium px-6 py-2 w-20">
                      NPS
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {segmentos.map((s, idx) => {
                    const { promotores, neutros, detratores, total, nps } =
                      s.nps;
                    const promPct = total > 0 ? (promotores / total) * 100 : 0;
                    const neutPct = total > 0 ? (neutros / total) * 100 : 0;
                    const detPct = total > 0 ? (detratores / total) * 100 : 0;
                    const isAmostraPequena = total < minRespostas;

                    return (
                      <tr
                        key={s.key}
                        className={cn(
                          'border-t border-border/40',
                          idx % 2 === 0 ? 'bg-card' : 'bg-muted/20'
                        )}
                      >
                        <td className="px-6 py-3 font-medium text-foreground">
                          {s.label}
                        </td>
                        <td className="text-center px-2 py-3 text-muted-foreground">
                          {total}
                        </td>
                        <td className="px-2 py-3 hidden sm:table-cell">
                          <div className="h-2 w-full max-w-[200px] mx-auto flex rounded-full overflow-hidden bg-muted/60">
                            <div
                              className="h-full bg-vermelho-kids"
                              style={{ width: `${detPct}%` }}
                              title={`${detratores} detratores`}
                            />
                            <div
                              className="h-full bg-amarelo-pipa"
                              style={{ width: `${neutPct}%` }}
                              title={`${neutros} neutros`}
                            />
                            <div
                              className="h-full bg-verde-pipa"
                              style={{ width: `${promPct}%` }}
                              title={`${promotores} promotores`}
                            />
                          </div>
                        </td>
                        <td
                          className={cn(
                            'text-right px-6 py-3 font-bold text-base',
                            npsColor(nps, total, minRespostas)
                          )}
                          title={
                            isAmostraPequena
                              ? `Amostra pequena (< ${minRespostas})`
                              : undefined
                          }
                        >
                          {total > 0 ? nps : '—'}
                          {isAmostraPequena && total > 0 && (
                            <span className="text-[11px] text-muted-foreground/70 font-normal ml-1">
                              *
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-[11px] text-muted-foreground/70 px-6 py-2 italic">
                * amostra menor que {minRespostas} — interpretar com cuidado
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
);

PesquisaNpsSegmentado.displayName = 'PesquisaNpsSegmentado';
