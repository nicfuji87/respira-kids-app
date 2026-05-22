// AI dev note: MetasOverview - Resumo executivo de metas (cards de KPI)
// Usado para visão rápida no topo da aba Metas e em dashboards

import React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Skeleton } from '@/components/primitives/skeleton';
import {
  Target,
  CheckCircle2,
  AlertTriangle,
  Clock,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MetaDashboard } from '@/types/metas';

export interface MetasOverviewProps {
  metas: MetaDashboard[];
  loading?: boolean;
  className?: string;
}

export const MetasOverview: React.FC<MetasOverviewProps> = ({
  metas,
  loading,
  className,
}) => {
  const stats = React.useMemo(() => {
    const ativas = metas.filter((m) => m.status === 'ativa');
    const atingidas = ativas.filter(
      (m) => m.status_atingimento === 'atingida'
    ).length;
    const atrasadas = ativas.filter(
      (m) => m.status_atingimento === 'atrasada'
    ).length;
    const emAndamento = ativas.filter(
      (m) => m.status_atingimento === 'em_andamento'
    ).length;
    const mediaProgresso =
      ativas.length > 0
        ? ativas.reduce(
            (acc, m) => acc + Math.min(m.percentual_atingido || 0, 100),
            0
          ) / ativas.length
        : 0;

    return {
      total: ativas.length,
      atingidas,
      atrasadas,
      emAndamento,
      mediaProgresso,
    };
  }, [metas]);

  const items = [
    {
      label: 'Metas Ativas',
      value: stats.total,
      icon: Target,
      color: 'text-rosa-suave',
    },
    {
      label: 'Atingidas',
      value: stats.atingidas,
      icon: CheckCircle2,
      color: 'text-green-600',
    },
    {
      label: 'Em Andamento',
      value: stats.emAndamento,
      icon: Clock,
      color: 'text-amarelo-pipa',
    },
    {
      label: 'Atrasadas',
      value: stats.atrasadas,
      icon: AlertTriangle,
      color: 'text-destructive',
    },
    {
      label: 'Progresso Médio',
      value: `${stats.mediaProgresso.toFixed(0)}%`,
      icon: TrendingUp,
      color: 'text-azul-respira',
    },
  ];

  return (
    <div
      className={cn(
        'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3',
        className
      )}
    >
      {items.map((it) => (
        <Card key={it.label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-1">
              <it.icon className={cn('h-3.5 w-3.5', it.color)} />
              {it.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className={cn('text-2xl font-bold', it.color)}>
                {it.value}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

MetasOverview.displayName = 'MetasOverview';
