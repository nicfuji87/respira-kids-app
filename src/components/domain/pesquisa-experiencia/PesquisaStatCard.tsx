// AI dev note: Card de métrica resumida usado no dashboard da pesquisa.

import React from 'react';
import { Card, CardContent } from '@/components/primitives/card';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface PesquisaStatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  /** Cor do ícone (token Tailwind do design system). */
  tone?: 'azul' | 'verde' | 'amarelo' | 'roxo' | 'vermelho';
  className?: string;
}

const TONE_CLASSES: Record<
  NonNullable<PesquisaStatCardProps['tone']>,
  string
> = {
  azul: 'bg-azul-respira/15 text-azul-respira',
  verde: 'bg-verde-pipa/30 text-roxo-titulo',
  amarelo: 'bg-amarelo-pipa/25 text-roxo-titulo',
  roxo: 'bg-roxo-titulo/10 text-roxo-titulo',
  vermelho: 'bg-vermelho-kids/20 text-vermelho-kids',
};

export const PesquisaStatCard = React.memo<PesquisaStatCardProps>(
  ({ icon: Icon, label, value, hint, tone = 'azul', className }) => {
    return (
      <Card className={cn('overflow-hidden', className)}>
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
            <p className="text-2xl md:text-3xl font-bold text-foreground mt-0.5 leading-tight truncate">
              {value}
            </p>
            {hint && (
              <p className="text-xs text-muted-foreground/80 mt-1">{hint}</p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }
);

PesquisaStatCard.displayName = 'PesquisaStatCard';
