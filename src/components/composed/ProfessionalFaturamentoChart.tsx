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
import { X, Search, TrendingUp } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

// AI dev note: Gráfico de faturamento para profissional
// Mostra gráfico anual de comissões com filtros específicos para profissional
// Filtros fixos: Últimos 12 meses, Status agendamento, Serviços, Empresas, Status pagamento, Buscar paciente

type ConsultationStatusFilter =
  | 'todos'
  | 'finalizado'
  | 'agendado'
  | 'cancelado'
  | 'confirmado';

type PaymentStatusFilter =
  | 'todos'
  | 'pago'
  | 'pendente'
  | 'aberto'
  | 'cancelado';

interface ProfessionalFaturamentoChartProps {
  professionalId: string;
  className?: string;
}

const chartConfig = {
  comissao: {
    label: 'Comissão',
    color: 'hsl(var(--verde-pipa))',
  },
} satisfies ChartConfig;

export const ProfessionalFaturamentoChart =
  React.memo<ProfessionalFaturamentoChartProps>(
    ({ professionalId, className }) => {
      // Filtros - AI dev note: Conforme requisitos
      const [consultationStatusFilter, setConsultationStatusFilter] =
        useState<ConsultationStatusFilter>('todos');
      const [serviceTypeFilter, setServiceTypeFilter] =
        useState<string>('todos');
      const [empresaFilter, setEmpresaFilter] = useState<string>('todos');
      const [paymentStatusFilter, setPaymentStatusFilter] =
        useState<PaymentStatusFilter>('todos');
      const [searchQuery, setSearchQuery] = useState('');

      // Estados de dados
      const [isLoading, setIsLoading] = useState(true);
      const [error, setError] = useState<string | null>(null);
      const [rawData, setRawData] = useState<
        Array<{
          data_hora: string;
          comissao_valor_calculado: number;
          status_consulta_codigo: string;
          status_pagamento_codigo: string;
          paciente_nome: string;
        }>
      >([]);

      // Listas para filtros
      const [serviceTypes, setServiceTypes] = useState<
        Array<{ id: string; nome: string }>
      >([]);
      const [companies, setCompanies] = useState<
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
          // Buscar tipos de serviço do profissional
          const { data: servicesData, error: servicesError } = await supabase
            .from('vw_agendamentos_completos')
            .select('tipo_servico_id, servico_nome')
            .eq('profissional_id', professionalId)
            .not('tipo_servico_id', 'is', null)
            .not('servico_nome', 'is', null);

          if (servicesError) {
            console.error('❌ Erro ao buscar tipos de serviço:', servicesError);
          } else {
            const uniqueServices = Array.from(
              new Map(
                (servicesData || []).map((s) => [
                  s.tipo_servico_id,
                  { id: s.tipo_servico_id, nome: s.servico_nome },
                ])
              ).values()
            );
            setServiceTypes(uniqueServices);
          }

          // Buscar empresas do profissional
          const { data: companiesData, error: companiesError } = await supabase
            .from('vw_agendamentos_completos')
            .select('empresa_fatura_id, empresa_fatura_razao_social')
            .eq('profissional_id', professionalId)
            .not('empresa_fatura_id', 'is', null)
            .not('empresa_fatura_razao_social', 'is', null);

          if (companiesError) {
            console.error('❌ Erro ao buscar empresas:', companiesError);
          } else {
            const uniqueCompanies = Array.from(
              new Map(
                (companiesData || []).map((c) => [
                  c.empresa_fatura_id,
                  {
                    id: c.empresa_fatura_id,
                    nome: c.empresa_fatura_razao_social,
                  },
                ])
              ).values()
            );
            setCompanies(uniqueCompanies);
          }
        };

        loadFilterLists();
      }, [professionalId]);

      // Buscar dados do gráfico - últimos 12 meses fixo
      const fetchChartData = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
          // AI dev note: Últimos 12 meses fixo
          const hoje = new Date();
          const inicioHistorico = new Date();
          inicioHistorico.setMonth(hoje.getMonth() - 12);

          // Garantir que pega desde o início do dia inicial até o final do dia atual
          const dataInicio =
            inicioHistorico.toISOString().split('T')[0] + 'T00:00:00';
          const dataFim = hoje.toISOString().split('T')[0] + 'T23:59:59';

          let query = supabase
            .from('vw_agendamentos_completos')
            .select(
              'data_hora, comissao_valor_calculado, status_consulta_codigo, status_pagamento_codigo, paciente_nome, tipo_servico_id, empresa_fatura_id'
            )
            .eq('profissional_id', professionalId)
            .eq('ativo', true)
            .gte('data_hora', dataInicio)
            .lte('data_hora', dataFim)
            .order('data_hora', { ascending: true });

          // Aplicar filtros
          if (consultationStatusFilter !== 'todos') {
            query = query.eq(
              'status_consulta_codigo',
              consultationStatusFilter
            );
          }

          if (serviceTypeFilter !== 'todos') {
            query = query.eq('tipo_servico_id', serviceTypeFilter);
          }

          if (empresaFilter !== 'todos') {
            query = query.eq('empresa_fatura_id', empresaFilter);
          }

          if (paymentStatusFilter !== 'todos') {
            query = query.eq('status_pagamento_codigo', paymentStatusFilter);
          }

          if (searchQuery.trim()) {
            query = query.ilike('paciente_nome', `%${searchQuery.trim()}%`);
          }

          const { data, error: fetchError } = await query;

          if (fetchError) throw fetchError;

          console.log(
            `📊 Gráfico Profissional: ${data?.length || 0} consultas carregadas`
          );

          setRawData(data || []);
        } catch (err) {
          console.error('❌ Erro ao buscar dados do gráfico:', err);
          setError('Erro ao carregar dados do gráfico');
        } finally {
          setIsLoading(false);
        }
      }, [
        professionalId,
        consultationStatusFilter,
        serviceTypeFilter,
        empresaFilter,
        paymentStatusFilter,
        searchQuery,
      ]);

      useEffect(() => {
        fetchChartData();
      }, [fetchChartData]);

      // Agregar dados por mês
      const chartData = useMemo(() => {
        if (rawData.length === 0) return [];

        const dadosPorMes = new Map<
          string,
          {
            periodo: string;
            comissao: number;
            mes: number;
            ano: number;
          }
        >();

        rawData.forEach((consulta) => {
          const data = new Date(consulta.data_hora);
          const ano = data.getFullYear();
          const mes = data.getMonth() + 1;
          const mesKey = `${ano}${String(mes).padStart(2, '0')}`;

          if (!dadosPorMes.has(mesKey)) {
            dadosPorMes.set(mesKey, {
              periodo: new Intl.DateTimeFormat('pt-BR', {
                month: 'short',
                year: 'numeric',
              }).format(new Date(ano, mes - 1, 1)),
              comissao: 0,
              mes,
              ano,
            });
          }

          const dadosMes = dadosPorMes.get(mesKey)!;
          dadosMes.comissao += consulta.comissao_valor_calculado || 0;
        });

        // Ordenar por ano e mês
        const allData = Array.from(dadosPorMes.values()).sort((a, b) => {
          if (a.ano !== b.ano) return a.ano - b.ano;
          return a.mes - b.mes;
        });

        return allData;
      }, [rawData]);

      // Calcular totais
      const totalComissao = useMemo(() => {
        return chartData.reduce((sum, item) => sum + item.comissao, 0);
      }, [chartData]);

      return (
        <div className={cn('space-y-4', className)}>
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-verde-pipa flex-shrink-0" />
                  <span className="text-base md:text-lg">
                    Gráfico Anual de Comissões
                  </span>
                </CardTitle>

                {/* Total */}
                {!isLoading && !error && chartData.length > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Total:</span>
                    <span className="font-semibold text-verde-pipa text-lg">
                      {formatCurrency(totalComissao)}
                    </span>
                  </div>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Filtros */}
              <div className="flex flex-col gap-3">
                {/* Linha 1: Status Agendamento, Serviços, Empresa, Status Pagamento */}
                <div className="flex flex-wrap gap-3">
                  {/* Status de Agendamento */}
                  <Select
                    value={consultationStatusFilter}
                    onValueChange={(value: ConsultationStatusFilter) =>
                      setConsultationStatusFilter(value)
                    }
                  >
                    <SelectTrigger className="flex-1 min-w-[180px]">
                      <SelectValue placeholder="Status Agendamento" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">
                        Todos status de agendamento
                      </SelectItem>
                      <SelectItem value="finalizado">Finalizado</SelectItem>
                      <SelectItem value="agendado">Agendado</SelectItem>
                      <SelectItem value="confirmado">Confirmado</SelectItem>
                      <SelectItem value="cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Tipo de Serviço */}
                  <Select
                    value={serviceTypeFilter}
                    onValueChange={setServiceTypeFilter}
                  >
                    <SelectTrigger className="flex-1 min-w-[180px]">
                      <SelectValue placeholder="Tipo de Serviço" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os serviços</SelectItem>
                      {serviceTypes.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Empresa */}
                  <Select
                    value={empresaFilter}
                    onValueChange={setEmpresaFilter}
                  >
                    <SelectTrigger className="flex-1 min-w-[180px]">
                      <SelectValue placeholder="Empresa" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todas as empresas</SelectItem>
                      {companies.map((company) => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Status de Pagamento */}
                  <Select
                    value={paymentStatusFilter}
                    onValueChange={(value: PaymentStatusFilter) =>
                      setPaymentStatusFilter(value)
                    }
                  >
                    <SelectTrigger className="flex-1 min-w-[180px]">
                      <SelectValue placeholder="Status Pagamento" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">
                        Todos status de pagamento
                      </SelectItem>
                      <SelectItem value="pago">Pago</SelectItem>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="aberto">Em aberto</SelectItem>
                      <SelectItem value="cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Linha 2: Busca por Paciente */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por paciente..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Botão limpar filtros */}
              {(consultationStatusFilter !== 'todos' ||
                serviceTypeFilter !== 'todos' ||
                empresaFilter !== 'todos' ||
                paymentStatusFilter !== 'todos' ||
                searchQuery.trim()) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setConsultationStatusFilter('todos');
                    setServiceTypeFilter('todos');
                    setEmpresaFilter('todos');
                    setPaymentStatusFilter('todos');
                    setSearchQuery('');
                  }}
                  className="w-full md:w-auto"
                >
                  <X className="h-4 w-4 mr-1" />
                  Limpar Filtros
                </Button>
              )}

              {/* Gráfico */}
              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-[400px] w-full" />
                </div>
              ) : error ? (
                <div className="flex items-center justify-center h-[400px] text-muted-foreground">
                  {error}
                </div>
              ) : chartData.length === 0 ? (
                <div className="flex items-center justify-center h-[400px] text-muted-foreground">
                  Nenhum dado disponível para o período selecionado
                </div>
              ) : (
                <div className="h-[400px] w-full">
                  <ChartContainer config={chartConfig}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <XAxis
                          dataKey="periodo"
                          angle={-45}
                          textAnchor="end"
                          height={80}
                          tick={{ fontSize: 12 }}
                        />
                        <YAxis
                          tickFormatter={(value) =>
                            new Intl.NumberFormat('pt-BR', {
                              notation: 'compact',
                              style: 'currency',
                              currency: 'BRL',
                              maximumFractionDigits: 1,
                            }).format(value)
                          }
                          tick={{ fontSize: 12 }}
                        />
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              formatter={(value, name) => [
                                formatCurrency(value as number),
                                chartConfig[name as keyof typeof chartConfig]
                                  ?.label || name,
                              ]}
                            />
                          }
                        />
                        <Bar
                          dataKey="comissao"
                          fill="var(--color-comissao)"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }
  );

ProfessionalFaturamentoChart.displayName = 'ProfessionalFaturamentoChart';
