// AI dev note: KPI card compartilhado pelas páginas Produtos e Estoque.

import React from 'react';
import { Card, CardContent } from '@/components/primitives/card';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export type StatTone = 'verde' | 'amarelo' | 'roxo' | 'azul';

const TONE_CLASSES: Record<StatTone, string> = {
  verde: 'bg-verde-pipa/30 text-roxo-titulo',
  amarelo: 'bg-amarelo-pipa/25 text-roxo-titulo',
  roxo: 'bg-roxo-titulo/10 text-roxo-titulo',
  azul: 'bg-azul-respira/15 text-azul-respira',
};

export interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone: StatTone;
}

export const StatCard: React.FC<StatCardProps> = ({
  icon: Icon,
  label,
  value,
  tone,
}) => (
  <Card className="overflow-hidden">
    <CardContent className="p-5 flex items-start gap-4">
      <div
        className={cn(
          'shrink-0 rounded-xl p-3 flex items-center justify-center',
          TONE_CLASSES[tone]
        )}
      >
        <Icon className="w-6 h-6" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs uppercase tracking-wide text-muted-foreground/80 font-medium">
          {label}
        </p>
        <p className="text-2xl font-bold text-foreground mt-0.5 leading-tight truncate">
          {value}
        </p>
      </div>
    </CardContent>
  </Card>
);
