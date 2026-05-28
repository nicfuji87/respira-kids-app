// AI dev note: Barra de progresso discreta no topo da pesquisa.
// Mostra "Pergunta N de M" + barra fina. Sem números grandes na UI.

import React from 'react';
import { cn } from '@/lib/utils';

interface PesquisaProgressProps {
  current: number;
  total: number;
  className?: string;
}

export const PesquisaProgress = React.memo<PesquisaProgressProps>(
  ({ current, total, className }) => {
    const safeTotal = Math.max(total, 1);
    const percent = Math.min(100, Math.round((current / safeTotal) * 100));

    return (
      <div className={cn('w-full', className)}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-muted-foreground/80 tracking-wide">
            Pergunta {current} de {total}
          </span>
          <span className="text-xs text-muted-foreground/60">{percent}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/15">
          <div
            className="h-full rounded-full bg-gradient-to-r from-azul-respira to-verde-pipa transition-all duration-500 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    );
  }
);

PesquisaProgress.displayName = 'PesquisaProgress';
