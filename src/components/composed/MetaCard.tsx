// AI dev note: MetaCard - Card individual de meta com progresso, status e ações

import React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';
import { Progress } from '@/components/primitives/progress';
import { Button } from '@/components/primitives/button';
import {
  Target,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Users,
  User,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MetaDashboard } from '@/types/metas';

export interface MetaCardProps {
  meta: MetaDashboard;
  className?: string;
  onDelete?: (meta: MetaDashboard) => void;
  onRefresh?: (meta: MetaDashboard) => void;
  showOwner?: boolean;
}

const CATEGORIA_COLORS: Record<string, string> = {
  atendimento: 'bg-azul-respira/10 text-azul-respira border-azul-respira/30',
  qualidade: 'bg-roxo-titulo/10 text-roxo-titulo border-roxo-titulo/30',
  produtividade: 'bg-amarelo-pipa text-roxo-titulo border-transparent',
  reativacao: 'bg-rosa-suave/10 text-rosa-suave border-rosa-suave/30',
  relacionamento:
    'bg-vermelho-kids/10 text-vermelho-kids border-vermelho-kids/30',
};

export const MetaCard: React.FC<MetaCardProps> = ({
  meta,
  className,
  onDelete,
  showOwner = true,
}) => {
  const pct = Math.min(Math.max(meta.percentual_atingido || 0, 0), 100);

  const StatusIcon =
    meta.status_atingimento === 'atingida'
      ? CheckCircle2
      : meta.status_atingimento === 'atrasada'
        ? AlertTriangle
        : Clock;

  const statusColor =
    meta.status_atingimento === 'atingida'
      ? 'text-green-600'
      : meta.status_atingimento === 'atrasada'
        ? 'text-destructive'
        : 'text-roxo-titulo';

  const formatMesAno = () => {
    const meses = [
      'Jan',
      'Fev',
      'Mar',
      'Abr',
      'Mai',
      'Jun',
      'Jul',
      'Ago',
      'Set',
      'Out',
      'Nov',
      'Dez',
    ];
    return `${meses[(meta.mes_referencia || 1) - 1]}/${meta.ano_referencia}`;
  };

  return (
    <Card className={cn('hover:shadow-md transition-shadow', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4 text-rosa-suave shrink-0" />
              <span className="truncate">{meta.titulo}</span>
            </CardTitle>
            <div className="text-xs text-muted-foreground mt-1">
              {meta.tipo_meta_nome} • {formatMesAno()}
            </div>
          </div>
          <StatusIcon className={cn('h-5 w-5 shrink-0', statusColor)} />
        </div>

        <div className="flex flex-wrap gap-1 mt-2">
          <Badge
            variant="outline"
            className={cn('text-[10px]', CATEGORIA_COLORS[meta.categoria])}
          >
            {meta.categoria}
          </Badge>
          {meta.escopo === 'individual' ? (
            <Badge variant="outline" className="text-[10px] gap-1">
              <User className="h-3 w-3" />
              {showOwner ? meta.pessoa_nome || 'Individual' : 'Individual'}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] gap-1">
              <Users className="h-3 w-3" />
              Clínica
            </Badge>
          )}
          {meta.status !== 'ativa' && (
            <Badge variant="secondary" className="text-[10px]">
              {meta.status}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div>
          <div className="flex items-end justify-between mb-1">
            <div>
              <span className="text-2xl font-bold">
                {Number(meta.valor_atual).toLocaleString('pt-BR', {
                  maximumFractionDigits: 2,
                })}
              </span>
              <span className="text-sm text-muted-foreground ml-1">
                / {Number(meta.valor_meta).toLocaleString('pt-BR')}{' '}
                {meta.unidade_medida}
              </span>
            </div>
            <div className={cn('text-lg font-semibold', statusColor)}>
              {pct.toFixed(0)}%
            </div>
          </div>
          <Progress value={pct} className="h-2" />
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {meta.dias_restantes > 0
              ? `${meta.dias_restantes} dias restantes`
              : 'Período encerrado'}
          </span>
          {meta.valor_minimo != null && (
            <span>
              Mín: {Number(meta.valor_minimo).toLocaleString('pt-BR')}
            </span>
          )}
        </div>

        {onDelete && (
          <div className="pt-2 border-t flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(meta)}
              className="text-xs text-muted-foreground hover:text-destructive gap-1 h-7"
            >
              <Trash2 className="h-3 w-3" />
              Remover
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

MetaCard.displayName = 'MetaCard';
