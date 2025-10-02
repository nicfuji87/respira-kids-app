import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Bar, BarChart, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import {
  Card,
  CardContent,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { DollarSign, X, Search } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

type PeriodFilter =
  | 'mes_atual'
  | 'mes_anterior'
  | 'ultimos_3'
  | 'ultimos_6'
  | 'ultimos_12'
  | 'ultimo_ano'
  | 'ultimos_24'
  | 'todos';

type PaymentStatusFilter =
  | 'todos'
  | 'pago'
  | 'pendente'
  | 'aberto'
  | 'cancelado';
type ConsultationStatusFilter =
  | 'todos'
  | 'finalizado'
  | 'agendado'
  | 'cancelado'
  | 'confirmado';

// AI dev note: FaturamentoChart - Gráfico comparativo de faturamento mensal
// Agora com filtros completos que buscam dados brutos e agregam no frontend

interface FaturamentoChartProps {
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
  ({ className }) => {
    // Estados de filtros
    const [periodFilter, setPeriodFilter] =
      useState<PeriodFilter>('ultimos_12');
    const [professionalFilter, setProfessionalFilter] =
      useState<string>('todos');
    const [serviceTypeFilter, setServiceTypeFilter] = useState<string>('todos');
    const [paymentStatusFilter, setPaymentStatusFilter] =
      useState<PaymentStatusFilter>('todos');
    const [consultationStatusFilter, setConsultationStatusFilter] =
      useState<ConsultationStatusFilter>('todos');
    const [empresaFilter, setEmpresaFilter] = useState<string>('todos');
    const [searchQuery, setSearchQuery] = useState('');

    // Estados de dados
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [rawData, setRawData] = useState<
      Array<{
        data_hora: string;
        valor_servico: string;
        status_consulta_codigo: string;
        status_pagamento_codigo: string;
        possui_evolucao: string;
        paciente_nome: string;
      }>
    >([]);

    // Listas para filtros
    const [professionals, setProfessionals] = useState<
      Array<{ id: string; nome: string }>
    >([]);
    const [serviceTypes, setServiceTypes] = useState<
      Array<{ id: string; nome: string }>
    >([]);

    const formatCurrency = (value: number) => {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(value);
    };

    // Carregar listas de filtros
    useEffect(() => {
      const loadFilterLists = async () => {
        // Buscar profissionais (role = 'profissional' ou pode_atender = true)
        const { data: profsData, error: profsError } = await supabase
          .from('pessoas')
          .select('id, nome, role, pode_atender')
          .eq('ativo', true)
          .or('role.eq.profissional,pode_atender.eq.true')
          .order('nome');

        if (profsError) {
          console.error('❌ Erro ao buscar profissionais:', profsError);
        } else {
          console.log('👨‍⚕️ Profissionais carregados:', profsData?.length);
          if (profsData) setProfessionals(profsData);
        }

        // Buscar tipos de serviço
        const { data: servicesData, error: servicesError } = await supabase
          .from('tipo_servicos')
          .select('id, nome')
          .eq('ativo', true)
          .order('nome');

        if (servicesError) {
          console.error('❌ Erro ao buscar tipos de serviço:', servicesError);
        } else {
          console.log('🏥 Tipos de serviço carregados:', servicesData?.length);
          if (servicesData) setServiceTypes(servicesData);
        }
      };

      loadFilterLists();
    }, []);

    // Buscar dados do gráfico com filtros aplicados
    const fetchChartData = useCallback(async () => {
      setIsLoading(true);
      setError(null);

      try {
        // AI dev note: Buscar dados em lotes aplicando filtros
        let query = supabase
          .from('vw_agendamentos_completos')
          .select(
            'data_hora, valor_servico, status_consulta_codigo, status_pagamento_codigo, possui_evolucao, paciente_nome'
          )
          .eq('ativo', true);

        // Aplicar filtros
        if (professionalFilter !== 'todos') {
          query = query.eq('profissional_id', professionalFilter);
        }
        if (serviceTypeFilter !== 'todos') {
          query = query.eq('tipo_servico_id', serviceTypeFilter);
        }
        if (paymentStatusFilter !== 'todos') {
          query = query.eq('status_pagamento_codigo', paymentStatusFilter);
        }
        if (consultationStatusFilter !== 'todos') {
          query = query.eq('status_consulta_codigo', consultationStatusFilter);
        }
        if (empresaFilter !== 'todos') {
          query = query.eq('empresa_fatura_id', empresaFilter);
        }
        if (searchQuery) {
          query = query.ilike('paciente_nome', `%${searchQuery}%`);
        }

        // Buscar em lotes
        const allData: Array<{
          data_hora: string;
          valor_servico: string;
          status_consulta_codigo: string;
          status_pagamento_codigo: string;
          possui_evolucao: string;
          paciente_nome: string;
        }> = [];
        let offset = 0;
        const batchSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data: batchData, error: batchError } = await query
            .range(offset, offset + batchSize - 1)
            .order('data_hora', { ascending: true });

          if (batchError) throw batchError;

          if (batchData && batchData.length > 0) {
            allData.push(...batchData);
            offset += batchSize;
            hasMore = batchData.length === batchSize;
          } else {
            hasMore = false;
          }

          if (offset > 50000) break; // Safety
        }

        setRawData(allData);
      } catch (err) {
        console.error('Erro ao buscar dados do gráfico:', err);
        setError('Erro ao carregar dados do gráfico');
      } finally {
        setIsLoading(false);
      }
    }, [
      professionalFilter,
      serviceTypeFilter,
      paymentStatusFilter,
      consultationStatusFilter,
      empresaFilter,
      searchQuery,
    ]);

    // Recarregar quando filtros mudarem
    useEffect(() => {
      fetchChartData();
    }, [fetchChartData]);

    // AI dev note: Agregar dados brutos por mês/ano
    const chartData = useMemo(() => {
      if (rawData.length === 0) return [];

      // Agrupar por mês/ano
      const dadosPorMes = new Map<
        string,
        {
          periodo: string;
          faturamentoAReceber: number;
          faturamentoPendente: number;
          consultasRealizadas: number;
          consultasComEvolucao: number;
          mes: number;
          ano: number;
        }
      >();

      rawData.forEach((consulta) => {
        const data = new Date(consulta.data_hora);
        const ano = data.getFullYear();
        const mes = data.getMonth() + 1; // 1-12
        const mesKey = `${ano}${String(mes).padStart(2, '0')}`;

        if (!dadosPorMes.has(mesKey)) {
          dadosPorMes.set(mesKey, {
            periodo: new Intl.DateTimeFormat('pt-BR', {
              month: 'short',
              year: 'numeric',
            }).format(new Date(ano, mes - 1, 1)),
            faturamentoAReceber: 0,
            faturamentoPendente: 0,
            consultasRealizadas: 0,
            consultasComEvolucao: 0,
            mes,
            ano,
          });
        }

        const dadosMes = dadosPorMes.get(mesKey)!;
        const valor = parseFloat(consulta.valor_servico || '0');

        // Sempre contar consulta
        dadosMes.consultasRealizadas += 1;

        // AI dev note: Lógica de faturamento
        // Verde (A Receber) = Finalizadas SEM evolução (prontas para faturar)
        // Amarelo (Pendente) = Finalizadas COM evolução mas ainda em processo
        if (consulta.status_consulta_codigo === 'finalizado') {
          if (consulta.possui_evolucao === 'sim') {
            // COM evolução = ainda em processo (amarelo/pendente)
            dadosMes.consultasComEvolucao += 1;
            dadosMes.faturamentoPendente += valor;
          } else {
            // SEM evolução = pronta para receber (verde/a receber)
            dadosMes.faturamentoAReceber += valor;
          }
        } else if (consulta.status_consulta_codigo === 'agendado') {
          // Agendadas contam como pendente
          dadosMes.faturamentoPendente += valor;
        }
      });

      // Ordenar por ano e mês
      const allData = Array.from(dadosPorMes.values()).sort((a, b) => {
        if (a.ano !== b.ano) return a.ano - b.ano;
        return a.mes - b.mes;
      });

      // Aplicar filtro de período
      const now = new Date();
      const currentMonth = now.getMonth() + 1; // 1-12
      const currentYear = now.getFullYear();

      switch (periodFilter) {
        case 'mes_atual':
          return allData.filter(
            (d) => d.mes === currentMonth && d.ano === currentYear
          );
        case 'mes_anterior': {
          const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
          const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
          return allData.filter(
            (d) => d.mes === prevMonth && d.ano === prevYear
          );
        }
        case 'ultimos_3':
          return allData.slice(-3);
        case 'ultimos_6':
          return allData.slice(-6);
        case 'ultimos_12':
          return allData.slice(-12);
        case 'ultimos_24':
          return allData.slice(-24);
        case 'ultimo_ano':
          return allData.slice(-12);
        case 'todos':
        default:
          return allData;
      }
    }, [rawData, periodFilter]);

    // Calcular resumo baseado nos dados filtrados
    const resumoFiltrado = useMemo(() => {
      if (!chartData || chartData.length === 0) {
        return {
          totalFaturamento: 0,
          totalAReceber: 0,
          totalConsultas: 0,
          mediaMovel: 0,
        };
      }

      const totalFaturamento = chartData.reduce(
        (sum, d) => sum + d.faturamentoAReceber + d.faturamentoPendente,
        0
      );
      const totalAReceber = chartData.reduce(
        (sum, d) => sum + d.faturamentoAReceber,
        0
      );
      const totalConsultas = chartData.reduce(
        (sum, d) => sum + d.consultasRealizadas,
        0
      );
      const mediaMovel = totalFaturamento / chartData.length;

      return {
        totalFaturamento,
        totalAReceber,
        totalConsultas,
        mediaMovel,
      };
    }, [chartData]);

    if (isLoading) {
      return (
        <Card className={cn('w-full', className)}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-verde-pipa" />
              Gráfico de Faturamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-[300px] w-full" />
            </div>
          </CardContent>
        </Card>
      );
    }

    if (error) {
      return (
        <Card className={cn('w-full', className)}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-verde-pipa" />
              Gráfico de Faturamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-6">
              <div className="text-destructive mb-2">
                Erro ao carregar dados
              </div>
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button onClick={fetchChartData} className="mt-4">
                Tentar novamente
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className={cn('w-full', className)}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-verde-pipa" />
              Gráfico de Faturamento
            </CardTitle>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar paciente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Linha de filtros */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
            {/* Período */}
            <Select
              value={periodFilter}
              onValueChange={(value) => setPeriodFilter(value as PeriodFilter)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mes_atual">Mês Atual</SelectItem>
                <SelectItem value="mes_anterior">Mês Anterior</SelectItem>
                <SelectItem value="ultimos_3">Últimos 3 Meses</SelectItem>
                <SelectItem value="ultimos_6">Últimos 6 Meses</SelectItem>
                <SelectItem value="ultimos_12">Últimos 12 Meses</SelectItem>
                <SelectItem value="ultimos_24">Últimos 24 Meses</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
              </SelectContent>
            </Select>

            {/* Status de Consulta */}
            <Select
              value={consultationStatusFilter}
              onValueChange={(value) =>
                setConsultationStatusFilter(value as ConsultationStatusFilter)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Status Consulta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="finalizado">Finalizado</SelectItem>
                <SelectItem value="agendado">Agendado</SelectItem>
                <SelectItem value="confirmado">Confirmado</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>

            {/* Status de Pagamento */}
            <Select
              value={paymentStatusFilter}
              onValueChange={(value) =>
                setPaymentStatusFilter(value as PaymentStatusFilter)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Status Pagamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="aberto">Em aberto</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>

            {/* Profissional */}
            <Select
              value={professionalFilter}
              onValueChange={setProfessionalFilter}
            >
              <SelectTrigger>
                <SelectValue placeholder="Profissional" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {professionals.map((prof) => (
                  <SelectItem key={prof.id} value={prof.id}>
                    {prof.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Tipo de Serviço */}
            <Select
              value={serviceTypeFilter}
              onValueChange={setServiceTypeFilter}
            >
              <SelectTrigger>
                <SelectValue placeholder="Tipo de Serviço" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {serviceTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Botão de limpar filtros */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPeriodFilter('ultimos_12');
                setProfessionalFilter('todos');
                setServiceTypeFilter('todos');
                setPaymentStatusFilter('todos');
                setConsultationStatusFilter('todos');
                setEmpresaFilter('todos');
                setSearchQuery('');
              }}
            >
              <X className="h-4 w-4 mr-1" />
              Limpar
            </Button>
          </div>
          {/* Métricas resumo - baseadas no filtro aplicado */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 p-3 md:p-4 bg-muted/30 rounded-lg border">
            {/* Total Faturamento */}
            <div className="text-center">
              <div className="text-xs md:text-sm text-muted-foreground">
                Total Faturamento
              </div>
              <div className="font-medium text-foreground text-sm md:text-base">
                {formatCurrency(resumoFiltrado.totalFaturamento)}
              </div>
              <div className="text-xs text-muted-foreground">
                {resumoFiltrado.totalConsultas} consultas
              </div>
            </div>

            {/* A Receber */}
            <div className="text-center">
              <div className="text-xs md:text-sm text-muted-foreground">
                A Receber
              </div>
              <div className="font-medium text-verde-pipa text-sm md:text-base">
                {formatCurrency(resumoFiltrado.totalAReceber)}
              </div>
              <div className="text-xs text-muted-foreground">
                {(
                  (resumoFiltrado.totalAReceber /
                    resumoFiltrado.totalFaturamento) *
                  100
                ).toFixed(0)}
                % do total
              </div>
            </div>

            {/* Média */}
            <div className="text-center">
              <div className="text-xs md:text-sm text-muted-foreground">
                Média do Período
              </div>
              <div className="font-medium text-sm md:text-base">
                {formatCurrency(resumoFiltrado.mediaMovel)}
              </div>
              <div className="text-xs text-muted-foreground">
                {chartData.length} mês(es)
              </div>
            </div>

            {/* Melhor Mês do período filtrado */}
            <div className="text-center">
              <div className="text-xs md:text-sm text-muted-foreground">
                Melhor Mês
              </div>
              <div className="font-medium text-sm md:text-base">
                {chartData.length > 0
                  ? formatCurrency(
                      Math.max(
                        ...chartData.map(
                          (d) => d.faturamentoAReceber + d.faturamentoPendente
                        )
                      )
                    )
                  : formatCurrency(0)}
              </div>
              <div className="text-xs text-muted-foreground">
                {chartData.length > 0
                  ? chartData.find(
                      (d) =>
                        d.faturamentoAReceber + d.faturamentoPendente ===
                        Math.max(
                          ...chartData.map(
                            (d) => d.faturamentoAReceber + d.faturamentoPendente
                          )
                        )
                    )?.periodo
                  : 'N/A'}
              </div>
            </div>
          </div>

          {/* Gráfico */}
          <div className="h-[250px] md:h-[300px]">
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

          {/* Indicadores de faturamento - baseados no filtro */}
          <div className="grid grid-cols-2 gap-4 p-3 bg-muted/30 rounded-lg">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <div className="h-3 w-3 rounded-sm bg-verde-pipa"></div>
                <span className="text-xs font-medium">A Receber</span>
              </div>
              <div className="text-lg font-bold text-verde-pipa">
                {formatCurrency(resumoFiltrado.totalAReceber)}
              </div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <div className="h-3 w-3 rounded-sm bg-amarelo-pipa"></div>
                <span className="text-xs font-medium">Pendente</span>
              </div>
              <div className="text-lg font-bold text-amarelo-pipa">
                {formatCurrency(
                  resumoFiltrado.totalFaturamento - resumoFiltrado.totalAReceber
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
