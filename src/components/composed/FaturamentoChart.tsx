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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/primitives/popover';
import { DollarSign, X, Search, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Badge } from '@/components/primitives/badge';
import { Checkbox } from '@/components/primitives/checkbox';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

type PeriodFilter =
  | 'mes_atual'
  | 'mes_anterior'
  | 'ultimos_3'
  | 'ultimos_6'
  | 'ultimos_12'
  | 'ano_atual'
  | 'ano_anterior'
  | 'ultimos_24'
  | 'todos';

// AI dev note: Status reais do Supabase
const CONSULTA_STATUS_OPTIONS = [
  { codigo: 'agendado', descricao: 'Agendado' },
  { codigo: 'confirmado', descricao: 'Confirmado' },
  { codigo: 'finalizado', descricao: 'Finalizado' },
  { codigo: 'cancelado', descricao: 'Cancelado' },
  { codigo: 'reagendado', descricao: 'Reagendado' },
  { codigo: 'faltou', descricao: 'Paciente Faltou' },
  { codigo: 'erro', descricao: 'Erro' },
];

const PAGAMENTO_STATUS_OPTIONS = [
  { codigo: 'pago', descricao: 'Pago' },
  { codigo: 'pendente', descricao: 'Pendente' },
  { codigo: 'cobranca_gerada', descricao: 'Cobrança Gerada' },
  { codigo: 'atrasado', descricao: 'Atrasado' },
  { codigo: 'cancelado', descricao: 'Cancelado' },
  { codigo: 'estornado', descricao: 'Estornado' },
];

// AI dev note: FaturamentoChart - Gráfico comparativo de faturamento mensal
// Com filtros multi-select e métricas detalhadas por status de pagamento e evolução

interface FaturamentoChartProps {
  className?: string;
  userRole?: 'admin' | 'profissional' | 'secretaria' | null;
}

const chartConfig = {
  faturamentoPago: {
    label: 'Faturamento Pago',
    color: 'hsl(var(--verde-pipa))',
  },
  faturamentoPendente: {
    label: 'Faturamento Pendente',
    color: 'hsl(var(--amarelo-pipa))',
  },
} satisfies ChartConfig;

export const FaturamentoChart = React.memo<FaturamentoChartProps>(
  ({ className, userRole = 'admin' }) => {
    // Estados de filtros
    const [periodFilter, setPeriodFilter] =
      useState<PeriodFilter>('ultimos_12');
    const [professionalFilter, setProfessionalFilter] = useState<string[]>([]);
    const [serviceTypeFilter, setServiceTypeFilter] = useState<string[]>([]);
    const [paymentStatusFilter, setPaymentStatusFilter] = useState<string[]>(
      []
    );
    const [consultationStatusFilter, setConsultationStatusFilter] = useState<
      string[]
    >([]);
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
            'data_hora, valor_servico, status_consulta_codigo, status_pagamento_codigo, possui_evolucao, paciente_nome, profissional_id, tipo_servico_id'
          )
          .eq('ativo', true);

        // Aplicar filtros multi-select
        if (professionalFilter.length > 0) {
          query = query.in('profissional_id', professionalFilter);
        }
        if (serviceTypeFilter.length > 0) {
          query = query.in('tipo_servico_id', serviceTypeFilter);
        }
        if (paymentStatusFilter.length > 0) {
          query = query.in('status_pagamento_codigo', paymentStatusFilter);
        }
        if (consultationStatusFilter.length > 0) {
          query = query.in('status_consulta_codigo', consultationStatusFilter);
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
          faturamentoPago: number;
          faturamentoPendente: number;
          faturamentoPagoComEvolucao: number;
          faturamentoPendenteComEvolucao: number;
          faturamentoTotal: number;
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
            faturamentoPago: 0,
            faturamentoPendente: 0,
            faturamentoPagoComEvolucao: 0,
            faturamentoPendenteComEvolucao: 0,
            faturamentoTotal: 0,
            consultasRealizadas: 0,
            consultasComEvolucao: 0,
            mes,
            ano,
          });
        }

        const dadosMes = dadosPorMes.get(mesKey)!;
        const valor = parseFloat(consulta.valor_servico || '0');
        const isPago = consulta.status_pagamento_codigo === 'pago';
        const isPendente =
          consulta.status_pagamento_codigo === 'pendente' ||
          consulta.status_pagamento_codigo === 'cobranca_gerada' ||
          consulta.status_pagamento_codigo === 'atrasado';
        const temEvolucao = consulta.possui_evolucao === 'sim';

        // Sempre contar consulta (exceto canceladas)
        if (consulta.status_consulta_codigo !== 'cancelado') {
          dadosMes.consultasRealizadas += 1;
          dadosMes.faturamentoTotal += valor;

          if (temEvolucao) {
            dadosMes.consultasComEvolucao += 1;
          }

          // AI dev note: Lógica de faturamento por status de pagamento
          if (isPago) {
            dadosMes.faturamentoPago += valor;
            if (temEvolucao) {
              dadosMes.faturamentoPagoComEvolucao += valor;
            }
          } else if (isPendente) {
            dadosMes.faturamentoPendente += valor;
            if (temEvolucao) {
              dadosMes.faturamentoPendenteComEvolucao += valor;
            }
          }
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
        case 'ano_atual':
          return allData.filter((d) => d.ano === currentYear);
        case 'ano_anterior':
          return allData.filter((d) => d.ano === currentYear - 1);
        case 'ultimos_24':
          return allData.slice(-24);
        case 'todos':
        default:
          return allData;
      }
    }, [rawData, periodFilter]);

    // Calcular resumo baseado nos dados filtrados
    const resumoFiltrado = useMemo(() => {
      if (!chartData || chartData.length === 0) {
        return {
          faturamentoTotal: 0,
          faturamentoPendente: 0,
          faturamentoPagoComEvolucao: 0,
          faturamentoPendenteComEvolucao: 0,
          totalConsultas: 0,
        };
      }

      const faturamentoTotal = chartData.reduce(
        (sum, d) => sum + d.faturamentoTotal,
        0
      );
      const faturamentoPendente = chartData.reduce(
        (sum, d) => sum + d.faturamentoPendente,
        0
      );
      const faturamentoPagoComEvolucao = chartData.reduce(
        (sum, d) => sum + d.faturamentoPagoComEvolucao,
        0
      );
      const faturamentoPendenteComEvolucao = chartData.reduce(
        (sum, d) => sum + d.faturamentoPendenteComEvolucao,
        0
      );
      const totalConsultas = chartData.reduce(
        (sum, d) => sum + d.consultasRealizadas,
        0
      );

      return {
        faturamentoTotal,
        faturamentoPendente,
        faturamentoPagoComEvolucao,
        faturamentoPendenteComEvolucao,
        totalConsultas,
      };
    }, [chartData]);

    // Componente de MultiSelect
    const MultiSelectFilter = ({
      options,
      selected,
      onSelectedChange,
      placeholder,
    }: {
      options: Array<{
        id?: string;
        codigo?: string;
        nome?: string;
        descricao?: string;
      }>;
      selected: string[];
      onSelectedChange: (values: string[]) => void;
      placeholder: string;
    }) => {
      const [open, setOpen] = useState(false);

      const toggleOption = (value: string) => {
        if (selected.includes(value)) {
          onSelectedChange(selected.filter((v) => v !== value));
        } else {
          onSelectedChange([...selected, value]);
        }
      };

      const getLabel = (opt: {
        id?: string;
        codigo?: string;
        nome?: string;
        descricao?: string;
      }) => {
        return opt.nome || opt.descricao || opt.codigo || '';
      };

      const getValue = (opt: {
        id?: string;
        codigo?: string;
        nome?: string;
        descricao?: string;
      }) => {
        return opt.id || opt.codigo || '';
      };

      return (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 justify-between w-full"
            >
              <span className="truncate">
                {selected.length === 0
                  ? placeholder
                  : selected.length === 1
                    ? options.find((o) => getValue(o) === selected[0])
                      ? getLabel(
                          options.find((o) => getValue(o) === selected[0])!
                        )
                      : placeholder
                    : `${selected.length} selecionados`}
              </span>
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-0" align="start">
            <div className="p-2 space-y-1 max-h-[300px] overflow-y-auto">
              {options.map((opt) => {
                const value = getValue(opt);
                const isSelected = selected.includes(value);
                return (
                  <div
                    key={value}
                    className={cn(
                      'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-muted',
                      isSelected && 'bg-muted'
                    )}
                    onClick={() => toggleOption(value)}
                  >
                    <Checkbox
                      checked={isSelected}
                      className="pointer-events-none"
                    />
                    <span className="text-sm">{getLabel(opt)}</span>
                  </div>
                );
              })}
            </div>
            {selected.length > 0 && (
              <div className="border-t p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-8 text-xs"
                  onClick={() => {
                    onSelectedChange([]);
                    setOpen(false);
                  }}
                >
                  Limpar seleção
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      );
    };

    // Componente de Período Select
    const PeriodSelect = () => (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-9 justify-between w-full"
          >
            <span>
              {periodFilter === 'mes_atual' && 'Mês Atual'}
              {periodFilter === 'mes_anterior' && 'Mês Anterior'}
              {periodFilter === 'ultimos_3' && 'Últimos 3 Meses'}
              {periodFilter === 'ultimos_6' && 'Últimos 6 Meses'}
              {periodFilter === 'ultimos_12' && 'Últimos 12 Meses'}
              {periodFilter === 'ano_atual' && 'Ano Atual'}
              {periodFilter === 'ano_anterior' && 'Ano Anterior'}
              {periodFilter === 'ultimos_24' && 'Últimos 24 Meses'}
              {periodFilter === 'todos' && 'Todos'}
            </span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[180px] p-0" align="start">
          <div className="p-1 space-y-0.5">
            {[
              { value: 'mes_atual', label: 'Mês Atual' },
              { value: 'mes_anterior', label: 'Mês Anterior' },
              { value: 'ultimos_3', label: 'Últimos 3 Meses' },
              { value: 'ultimos_6', label: 'Últimos 6 Meses' },
              { value: 'ultimos_12', label: 'Últimos 12 Meses' },
              { value: 'ano_atual', label: 'Ano Atual' },
              { value: 'ano_anterior', label: 'Ano Anterior' },
              { value: 'ultimos_24', label: 'Últimos 24 Meses' },
              { value: 'todos', label: 'Todos' },
            ].map((opt) => (
              <div
                key={opt.value}
                className={cn(
                  'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-muted text-sm',
                  periodFilter === opt.value && 'bg-muted'
                )}
                onClick={() => setPeriodFilter(opt.value as PeriodFilter)}
              >
                {periodFilter === opt.value && (
                  <Check className="h-4 w-4 text-primary" />
                )}
                {periodFilter !== opt.value && <div className="w-4" />}
                {opt.label}
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    );

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

    const hasActiveFilters =
      professionalFilter.length > 0 ||
      serviceTypeFilter.length > 0 ||
      paymentStatusFilter.length > 0 ||
      consultationStatusFilter.length > 0 ||
      searchQuery;

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

          {/* Linha de filtros com multi-select */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {/* Período */}
            <PeriodSelect />

            {/* Status de Consulta - Multi-select */}
            <MultiSelectFilter
              options={CONSULTA_STATUS_OPTIONS}
              selected={consultationStatusFilter}
              onSelectedChange={setConsultationStatusFilter}
              placeholder="Status Consulta"
            />

            {/* Status de Pagamento - Multi-select */}
            <MultiSelectFilter
              options={PAGAMENTO_STATUS_OPTIONS}
              selected={paymentStatusFilter}
              onSelectedChange={setPaymentStatusFilter}
              placeholder="Status Pagamento"
            />

            {/* Profissional - Multi-select */}
            <MultiSelectFilter
              options={professionals.map((p) => ({ id: p.id, nome: p.nome }))}
              selected={professionalFilter}
              onSelectedChange={setProfessionalFilter}
              placeholder="Profissional"
            />

            {/* Tipo de Serviço - Multi-select */}
            <MultiSelectFilter
              options={serviceTypes.map((s) => ({ id: s.id, nome: s.nome }))}
              selected={serviceTypeFilter}
              onSelectedChange={setServiceTypeFilter}
              placeholder="Tipo de Serviço"
            />

            {/* Botão de limpar filtros */}
            <Button
              variant={hasActiveFilters ? 'destructive' : 'ghost'}
              size="sm"
              className="h-9"
              onClick={() => {
                setPeriodFilter('ultimos_12');
                setProfessionalFilter([]);
                setServiceTypeFilter([]);
                setPaymentStatusFilter([]);
                setConsultationStatusFilter([]);
                setSearchQuery('');
              }}
            >
              <X className="h-4 w-4 mr-1" />
              Limpar
            </Button>
          </div>

          {/* Badges dos filtros ativos */}
          {hasActiveFilters && (
            <div className="flex flex-wrap gap-2">
              {consultationStatusFilter.map((status) => (
                <Badge
                  key={`consulta-${status}`}
                  variant="secondary"
                  className="cursor-pointer"
                  onClick={() =>
                    setConsultationStatusFilter(
                      consultationStatusFilter.filter((s) => s !== status)
                    )
                  }
                >
                  {CONSULTA_STATUS_OPTIONS.find((o) => o.codigo === status)
                    ?.descricao || status}
                  <X className="ml-1 h-3 w-3" />
                </Badge>
              ))}
              {paymentStatusFilter.map((status) => (
                <Badge
                  key={`pagamento-${status}`}
                  variant="secondary"
                  className="cursor-pointer"
                  onClick={() =>
                    setPaymentStatusFilter(
                      paymentStatusFilter.filter((s) => s !== status)
                    )
                  }
                >
                  {PAGAMENTO_STATUS_OPTIONS.find((o) => o.codigo === status)
                    ?.descricao || status}
                  <X className="ml-1 h-3 w-3" />
                </Badge>
              ))}
              {professionalFilter.map((id) => (
                <Badge
                  key={`prof-${id}`}
                  variant="secondary"
                  className="cursor-pointer"
                  onClick={() =>
                    setProfessionalFilter(
                      professionalFilter.filter((p) => p !== id)
                    )
                  }
                >
                  {professionals.find((p) => p.id === id)?.nome || id}
                  <X className="ml-1 h-3 w-3" />
                </Badge>
              ))}
              {serviceTypeFilter.map((id) => (
                <Badge
                  key={`serv-${id}`}
                  variant="secondary"
                  className="cursor-pointer"
                  onClick={() =>
                    setServiceTypeFilter(
                      serviceTypeFilter.filter((s) => s !== id)
                    )
                  }
                >
                  {serviceTypes.find((s) => s.id === id)?.nome || id}
                  <X className="ml-1 h-3 w-3" />
                </Badge>
              ))}
            </div>
          )}

          {/* Métricas resumo - 4 métricas principais */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 p-3 md:p-4 bg-muted/30 rounded-lg border">
            {/* Faturamento Total */}
            <div className="text-center">
              <div className="text-xs md:text-sm text-muted-foreground">
                Faturamento
              </div>
              <div className="font-bold text-foreground text-lg md:text-xl">
                {formatCurrency(resumoFiltrado.faturamentoTotal)}
              </div>
              <div className="text-xs text-muted-foreground">
                {resumoFiltrado.totalConsultas} consultas
              </div>
            </div>

            {/* Faturamento Pendente */}
            <div className="text-center">
              <div className="text-xs md:text-sm text-muted-foreground">
                Faturamento Pendente
              </div>
              <div className="font-bold text-amarelo-pipa text-lg md:text-xl">
                {formatCurrency(resumoFiltrado.faturamentoPendente)}
              </div>
              <div className="text-xs text-muted-foreground">não pago</div>
            </div>

            {/* Pago c/ Evolução */}
            <div className="text-center">
              <div className="text-xs md:text-sm text-muted-foreground">
                Pago c/ Evolução
              </div>
              <div className="font-bold text-verde-pipa text-lg md:text-xl">
                {formatCurrency(resumoFiltrado.faturamentoPagoComEvolucao)}
              </div>
              <div className="text-xs text-muted-foreground">
                {userRole === 'profissional' ? 'sua comissão' : 'com evolução'}
              </div>
            </div>

            {/* Pendente c/ Evolução */}
            <div className="text-center">
              <div className="text-xs md:text-sm text-muted-foreground">
                Pendente c/ Evolução
              </div>
              <div className="font-bold text-orange-500 text-lg md:text-xl">
                {formatCurrency(resumoFiltrado.faturamentoPendenteComEvolucao)}
              </div>
              <div className="text-xs text-muted-foreground">
                a receber c/ evolução
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
                    dataKey="faturamentoPago"
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
                        className="w-[280px]"
                        formatter={(value, name, item, index) => (
                          <>
                            <div className="flex items-center gap-2">
                              <div
                                className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                                style={{
                                  backgroundColor:
                                    name === 'faturamentoPago'
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
                            {/* Adicionar informações detalhadas no último item */}
                            {index === 1 && item.payload && (
                              <div className="mt-2 pt-2 border-t border-border/50 space-y-1 w-full">
                                <div className="flex justify-between text-xs">
                                  <span className="text-muted-foreground">
                                    Consultas:
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
                                <div className="flex justify-between text-xs">
                                  <span className="text-muted-foreground">
                                    Pago c/ evolução:
                                  </span>
                                  <span className="font-medium text-verde-pipa">
                                    {formatCurrency(
                                      item.payload.faturamentoPagoComEvolucao
                                    )}
                                  </span>
                                </div>
                                <div className="flex justify-between text-xs">
                                  <span className="text-muted-foreground">
                                    Pendente c/ evolução:
                                  </span>
                                  <span className="font-medium text-orange-500">
                                    {formatCurrency(
                                      item.payload
                                        .faturamentoPendenteComEvolucao
                                    )}
                                  </span>
                                </div>
                                <div className="flex justify-between text-xs font-medium pt-1 border-t">
                                  <span className="text-muted-foreground">
                                    Total:
                                  </span>
                                  <span>
                                    {formatCurrency(
                                      item.payload.faturamentoTotal
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

          {/* Legenda */}
          <div className="grid grid-cols-2 gap-4 p-3 bg-muted/30 rounded-lg">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <div className="h-3 w-3 rounded-sm bg-verde-pipa"></div>
                <span className="text-xs font-medium">Pago</span>
              </div>
              <div className="text-lg font-bold text-verde-pipa">
                {formatCurrency(
                  resumoFiltrado.faturamentoTotal -
                    resumoFiltrado.faturamentoPendente
                )}
              </div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <div className="h-3 w-3 rounded-sm bg-amarelo-pipa"></div>
                <span className="text-xs font-medium">Pendente</span>
              </div>
              <div className="text-lg font-bold text-amarelo-pipa">
                {formatCurrency(resumoFiltrado.faturamentoPendente)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
);

FaturamentoChart.displayName = 'FaturamentoChart';
