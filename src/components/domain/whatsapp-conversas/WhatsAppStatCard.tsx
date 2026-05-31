// AI dev note: Card de métrica do dashboard de Análise de Conversas (WhatsApp).
// Reaproveita o padrão visual dos cards da Pesquisa de Experiência.

import React from 'react';
import { Card, CardContent } from '@/components/primitives/card';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface WhatsAppStatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'azul' | 'verde' | 'amarelo' | 'roxo' | 'vermelho';
  onClick?: () => void;
  className?: string;
}

const TONE_CLASSES: Record<
  NonNullable<WhatsAppStatCardProps['tone']>,
  string
> = {
  azul: 'bg-azul-respira/15 text-azul-respira',
  verde: 'bg-verde-pipa/30 text-roxo-titulo',
  amarelo: 'bg-amarelo-pipa/25 text-roxo-titulo',
  roxo: 'bg-roxo-titulo/10 text-roxo-titulo',
  vermelho: 'bg-vermelho-kids/20 text-vermelho-kids',
};

export const WhatsAppStatCard = React.memo<WhatsAppStatCardProps>(
  ({ icon: Icon, label, value, hint, tone = 'azul', onClick, className }) => {
    return (
      <Card
        className={cn(
          'overflow-hidden',
          onClick && 'cursor-pointer transition-colors hover:bg-muted/40',
          className
        )}
        onClick={onClick}
      >
        <CardContent className="p-4 md:p-5 flex items-start gap-3 md:gap-4">
          <div
            className={cn(
              'shrink-0 rounded-xl p-2.5 md:p-3 flex items-center justify-center',
              TONE_CLASSES[tone]
            )}
          >
            <Icon className="w-5 h-5 md:w-6 md:h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground/80 font-medium">
              {label}
            </p>
            <p className="text-xl md:text-3xl font-bold text-foreground mt-0.5 leading-tight truncate">
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

WhatsAppStatCard.displayName = 'WhatsAppStatCard';
