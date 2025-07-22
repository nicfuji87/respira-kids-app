import React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';
import { Skeleton } from '@/components/primitives/skeleton';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProfessionalMetrics as ProfessionalMetricsData } from '@/lib/professional-dashboard-api';

// AI dev note: ProfessionalMetrics - Grid de 4 cards combinando primitives
// Usa cores da Respira Kids e estados de loading/erro

interface ProfessionalMetricsProps {
  metrics: ProfessionalMetricsData | null;
  loading?: boolean;
  error?: string | null;
  className?: string;
}

const MetricCard = React.memo<{
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  urgent?: boolean;
  loading?: boolean;
  onClick?: () => void;
  className?: string;
  comparativo?: {
    valor: number;
    percentual: number;
    tipo: 'crescimento' | 'queda' | 'estavel';
    label: string;
  };
}>(
  ({
    title,
    value,
    subtitle,
    icon: Icon,
    color,
    bgColor,
    urgent,
    loading,
    onClick,
    className,
    comparativo,
  }) => (
    <Card
      className={cn(
        'transition-all duration-200 hover:shadow-md',
        onClick && 'cursor-pointer hover:-translate-y-1',
        className
      )}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-foreground">
          {title}
        </CardTitle>
        <div className={cn('p-2 rounded-lg', bgColor)}>
          <Icon className={cn('h-4 w-4', color)} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              {loading ? (
                <>
                  <Skeleton className="h-8 w-16 mb-1" />
                  <Skeleton className="h-3 w-20" />
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold text-foreground">
                    {value}
                  </div>
                  <p className="text-xs text-muted-foreground">{subtitle}</p>
                </>
              )}
            </div>

            {urgent && !loading && (
              <Badge variant="destructive" className="text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Urgente
              </Badge>
            )}
          </div>

          {/* Comparativo */}
          {comparativo && !loading && (
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="text-xs text-muted-foreground">
                {comparativo.label}
              </div>
              <div className="flex items-center gap-1">
                <span
                  className={cn(
                    'text-xs font-medium',
                    comparativo.tipo === 'crescimento' && 'text-green-600',
                    comparativo.tipo === 'queda' && 'text-red-600',
                    comparativo.tipo === 'estavel' && 'text-gray-600'
                  )}
                >
                  {comparativo.percentual > 0 ? '+' : ''}
                  {comparativo.percentual.toFixed(1)}%
                </span>
                <span className="text-xs text-muted-foreground">
                  ({comparativo.percentual > 0 ? '+' : ''}
                  {comparativo.valor})
                </span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
);

MetricCard.displayName = 'MetricCard';

export const ProfessionalMetrics = React.memo<ProfessionalMetricsProps>(
  ({ error, className }) => {
    // Estados de erro
    if (error) {
      return (
        <div
          className={cn(
            'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6',
            className
          )}
        >
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="border-destructive/20">
              <CardContent className="flex items-center justify-center p-6">
                <div className="text-center">
                  <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Erro ao carregar
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      );
    }

    // AI dev note: Cards removidos pois as informações já estão disponíveis no gráfico de Faturamento Comparativo
    return null;
  }
);

ProfessionalMetrics.displayName = 'ProfessionalMetrics';
