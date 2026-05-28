// AI dev note: Lista de barras horizontais para mostrar distribuição de respostas
// de uma pergunta single ou multi choice. Compatível com Respira Kids design system.

import React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { cn } from '@/lib/utils';
import type { DistribuicaoItem } from '@/types/pesquisa-experiencia';

interface PesquisaDistribuicaoBarrasProps {
  title: string;
  subtitle?: string;
  items: DistribuicaoItem[];
  /** Mensagem exibida quando não há dados. */
  emptyLabel?: string;
  className?: string;
  /** Cor base das barras (token Respira). */
  barColor?: 'azul' | 'verde' | 'amarelo' | 'roxo' | 'vermelho';
  /** Limitar quantidade exibida. */
  maxItems?: number;
}

const BAR_COLOR_MAP: Record<
  NonNullable<PesquisaDistribuicaoBarrasProps['barColor']>,
  string
> = {
  azul: 'bg-azul-respira',
  verde: 'bg-verde-pipa',
  amarelo: 'bg-amarelo-pipa',
  roxo: 'bg-roxo-titulo',
  vermelho: 'bg-vermelho-kids',
};

export const PesquisaDistribuicaoBarras =
  React.memo<PesquisaDistribuicaoBarrasProps>(
    ({
      title,
      subtitle,
      items,
      emptyLabel = 'Ainda sem respostas',
      className,
      barColor = 'azul',
      maxItems,
    }) => {
      const visibleItems = maxItems ? items.slice(0, maxItems) : items;
      const maxCount = visibleItems.reduce(
        (acc, item) => Math.max(acc, item.count),
        0
      );

      return (
        <Card className={cn('overflow-hidden', className)}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base md:text-lg font-semibold">
              {title}
            </CardTitle>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </CardHeader>
          <CardContent>
            {visibleItems.length === 0 ? (
              <p className="text-sm text-muted-foreground/80 py-4 text-center">
                {emptyLabel}
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {visibleItems.map((item) => {
                  const widthPct =
                    maxCount > 0
                      ? Math.max(4, Math.round((item.count / maxCount) * 100))
                      : 0;
                  return (
                    <li key={item.value}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm font-medium text-foreground truncate">
                          {item.label}
                        </span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {item.count}{' '}
                          <span className="text-muted-foreground/60">
                            ({item.percent}%)
                          </span>
                        </span>
                      </div>
                      <div className="h-2.5 w-full bg-muted/60 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all duration-500 ease-out',
                            BAR_COLOR_MAP[barColor]
                          )}
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      );
    }
  );

PesquisaDistribuicaoBarras.displayName = 'PesquisaDistribuicaoBarras';
