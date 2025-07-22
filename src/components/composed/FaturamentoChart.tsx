import React from 'react';
import { Bar, BarChart, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Skeleton } from '@/components/primitives/skeleton';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FaturamentoComparativo } from '@/lib/professional-dashboard-api';

// AI dev note: FaturamentoChart - Gráfico comparativo de faturamento mensal
// Usa Chart primitives com cores da Respira Kids e variação percentual

interface FaturamentoChartProps {
  data: FaturamentoComparativo | null;
  loading?: boolean;
  error?: string | null;
  className?: string;
}

const chartConfig = {
  faturamentoAReceber: {
    label: 'Faturamento a Receber',
    color: 'hsl(var(--verde-pipa))',
  },
  faturamentoPendente: {
    label: 'Faturamento Pendente',
    color: 'hsl(var(--amarelo-pipa))',
  },
} satisfies ChartConfig;

export const FaturamentoChart = React.memo<FaturamentoChartProps>(
  ({ data, loading = false, error, className }) => {
    const formatCurrency = (value: number) => {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(value);
    };

    // Preparar dados para o gráfico (dados anuais)
    const chartData = data
      ? data.dadosAnuais.map((mes) => ({
          periodo: mes.periodo,
          faturamentoAReceber: mes.faturamentoAReceber,
          faturamentoPendente: mes.faturamentoTotal - mes.faturamentoAReceber, // Diferença = consultas com evolução mas não finalizadas
          consultasRealizadas: mes.consultasRealizadas,
          consultasComEvolucao: mes.consultasComEvolucao,
          mes: mes.mes,
          ano: mes.ano,
        }))
      : [];

    if (error) {
      return (
        <Card className={cn('w-full', className)}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-verde-pipa" />
              Faturamento Comparativo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-6">
              <div className="text-destructive mb-2">
                Erro ao carregar dados
              </div>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (loading) {
      return (
        <Card className={cn('w-full', className)}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-verde-pipa" />
              Faturamento Comparativo
            </CardTitle>
            <CardDescription>
              <Skeleton className="h-4 w-48" />
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-6 w-24" />
              </div>
              <Skeleton className="h-[300px] w-full" />
            </div>
          </CardContent>
        </Card>
      );
    }

    if (!data) {
      return (
        <Card className={cn('w-full', className)}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-verde-pipa" />
              Faturamento Comparativo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-6">
              <div className="text-muted-foreground">Dados não disponíveis</div>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className={cn('w-full', className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-verde-pipa" />
            Gráfico anual
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Informações principais do topo */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Mês Atual */}
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Mês Atual</div>
              <div className="font-medium">
                {formatCurrency(data.resumoAno.mesAtual.faturamentoTotal)}
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>{data.resumoAno.mesAtual.consultas} consultas</div>
                <div className="text-verde-pipa">
                  A receber:{' '}
                  {formatCurrency(data.resumoAno.mesAtual.faturamentoAReceber)}
                </div>
              </div>
            </div>

            {/* Melhor Mês */}
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Melhor Mês</div>
              <div className="font-medium">
                {formatCurrency(data.resumoAno.melhorMes.faturamento)}
              </div>
              <div className="text-xs text-muted-foreground">
                {data.resumoAno.melhorMes.periodo}
              </div>
            </div>

            {/* Média Mensal */}
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Média Mensal</div>
              <div className="font-medium text-verde-pipa">
                {formatCurrency(data.resumoAno.mediaMovel)}
              </div>
              <div className="text-xs text-muted-foreground">
                {Math.round(
                  data.resumoAno.totalConsultas /
                    data.dadosAnuais.filter((m) => m.consultasRealizadas > 0)
                      .length
                )}{' '}
                consultas
              </div>
            </div>

            {/* Total do Ano */}
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Total do Ano</div>
              <div className="font-medium text-foreground">
                {formatCurrency(data.resumoAno.totalFaturamento)}
              </div>
              <div className="text-xs text-muted-foreground">
                {data.resumoAno.totalConsultas} consultas
              </div>
            </div>
          </div>

          {/* Gráfico */}
          <div className="h-[300px]">
            <ChartContainer config={chartConfig} className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                >
                  <XAxis
                    dataKey="periodo"
                    tickLine={false}
                    tickMargin={10}
                    axisLine={false}
                    className="text-xs"
                    tickFormatter={(value) => {
                      // Mostrar apenas o mês
                      return value.split(' ')[0];
                    }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    className="text-xs"
                    tickFormatter={(value) => {
                      return new Intl.NumberFormat('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                        notation: 'compact',
                      }).format(value);
                    }}
                  />
                  <Bar
                    dataKey="faturamentoAReceber"
                    stackId="faturamento"
                    fill="hsl(var(--verde-pipa))"
                    radius={[0, 0, 4, 4]}
                    className="opacity-90 hover:opacity-100"
                  />
                  <Bar
                    dataKey="faturamentoPendente"
                    stackId="faturamento"
                    fill="hsl(var(--amarelo-pipa))"
                    radius={[4, 4, 0, 0]}
                    className="opacity-80 hover:opacity-100"
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        className="w-[250px]"
                        formatter={(value, name, item, index) => (
                          <>
                            <div className="flex items-center gap-2">
                              <div
                                className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                                style={{
                                  backgroundColor:
                                    name === 'faturamentoAReceber'
                                      ? 'hsl(var(--verde-pipa))'
                                      : 'hsl(var(--amarelo-pipa))',
                                }}
                              />
                              {chartConfig[name as keyof typeof chartConfig]
                                ?.label || name}
                            </div>
                            <div className="ml-auto flex items-baseline gap-0.5 font-mono font-medium tabular-nums text-foreground">
                              {formatCurrency(Number(value))}
                            </div>
                            {/* Adicionar informações de consultas no último item */}
                            {index === 1 && item.payload && (
                              <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
                                <div className="flex justify-between text-xs">
                                  <span className="text-muted-foreground">
                                    Consultas realizadas:
                                  </span>
                                  <span className="font-medium">
                                    {item.payload.consultasRealizadas}
                                  </span>
                                </div>
                                <div className="flex justify-between text-xs">
                                  <span className="text-muted-foreground">
                                    Com evolução:
                                  </span>
                                  <span className="font-medium">
                                    {item.payload.consultasComEvolucao}
                                  </span>
                                </div>
                                <div className="flex justify-between text-xs font-medium">
                                  <span className="text-muted-foreground">
                                    Total faturamento:
                                  </span>
                                  <span>
                                    {formatCurrency(
                                      item.payload.faturamentoAReceber +
                                        item.payload.faturamentoPendente
                                    )}
                                  </span>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                        hideLabel
                      />
                    }
                    cursor={{ fill: 'rgba(0, 0, 0, 0.05)' }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>

          {/* Indicadores de faturamento */}
          <div className="grid grid-cols-2 gap-4 p-3 bg-muted/30 rounded-lg">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <div className="h-3 w-3 rounded-sm bg-verde-pipa"></div>
                <span className="text-xs font-medium">A Receber</span>
              </div>
              <div className="text-lg font-bold text-verde-pipa">
                {formatCurrency(data.resumoAno.totalAReceber)}
              </div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <div className="h-3 w-3 rounded-sm bg-amarelo-pipa"></div>
                <span className="text-xs font-medium">Pendente</span>
              </div>
              <div className="text-lg font-bold text-amarelo-pipa">
                {formatCurrency(
                  data.resumoAno.totalFaturamento - data.resumoAno.totalAReceber
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
);

FaturamentoChart.displayName = 'FaturamentoChart';
