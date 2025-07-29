import React, { useState, useEffect } from 'react';
import {
  Calendar,
  DollarSign,
  AlertTriangle,
  Clock,
  Activity,
  Filter,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';
import { Skeleton } from '@/components/primitives/skeleton';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { DatePicker } from './DatePicker';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import type {
  PatientMetricsProps,
  PatientMetrics as PatientMetricsData,
} from '@/types/patient-details';

// AI dev note: PatientMetrics - Component Composed para exibir métricas reais do paciente
// Busca dados reais do Supabase com filtros por data e período
// Layout reorganizado: valores na primeira linha, consultas na segunda

type PeriodFilter =
  | 'ultimos_30'
  | 'ultimos_60'
  | 'ultimos_90'
  | 'ultimo_ano'
  | 'personalizado'
  | 'todos';

export const PatientMetrics = React.memo<PatientMetricsProps>(
  ({ patientId, className }) => {
    const [metrics, setMetrics] = useState<PatientMetricsData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Estados do filtro
    const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('todos');
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');

    useEffect(() => {
      const loadMetrics = async () => {
        if (!patientId) return;

        try {
          setIsLoading(true);
          setError(null);

          // Função para calcular datas baseadas no período
          const getDateRange = (period: PeriodFilter) => {
            const today = new Date();
            const end = today.toISOString().split('T')[0];

            let start = '';
            switch (period) {
              case 'ultimos_30':
                start = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
                  .toISOString()
                  .split('T')[0];
                break;
              case 'ultimos_60':
                start = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000)
                  .toISOString()
                  .split('T')[0];
                break;
              case 'ultimos_90':
                start = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000)
                  .toISOString()
                  .split('T')[0];
                break;
              case 'ultimo_ano':
                start = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000)
                  .toISOString()
                  .split('T')[0];
                break;
              case 'personalizado':
                return { start: startDate, end: endDate };
              case 'todos':
              default:
                return { start: '', end: '' };
            }

            return { start, end };
          };

          // Calcular range de datas
          const { start, end } = getDateRange(periodFilter);

          // AI dev note: Query com filtros de data aplicados
          let query = supabase
            .from('agendamentos')
            .select(
              `
              valor_servico,
              data_hora,
              consulta_status!inner(codigo),
              pagamento_status!inner(codigo)
            `
            )
            .eq('paciente_id', patientId)
            .eq('ativo', true);

          // Aplicar filtros de data se especificados
          if (start) {
            query = query.gte('data_hora', start);
          }
          if (end) {
            query = query.lte('data_hora', end + 'T23:59:59');
          }

          const { data, error: queryError } = await query;

          if (queryError) {
            throw new Error(queryError.message);
          }

          if (!data) {
            throw new Error('Nenhum dado encontrado');
          }

          // Calcular métricas
          const totalConsultas = data.length;
          const totalFaturado = data.reduce(
            (sum, item) => sum + parseFloat(item.valor_servico || '0'),
            0
          );

          // Calcular valores por status de pagamento
          const valorPago = data
            .filter(
              (item) =>
                (item.pagamento_status as unknown as { codigo: string })
                  ?.codigo === 'pago'
            )
            .reduce(
              (sum, item) => sum + parseFloat(item.valor_servico || '0'),
              0
            );

          const valorPendente = data
            .filter(
              (item) =>
                (item.pagamento_status as unknown as { codigo: string })
                  ?.codigo === 'pendente'
            )
            .reduce(
              (sum, item) => sum + parseFloat(item.valor_servico || '0'),
              0
            );

          const valorEmAtraso = data
            .filter(
              (item) =>
                (item.pagamento_status as unknown as { codigo: string })
                  ?.codigo === 'atrasado'
            )
            .reduce(
              (sum, item) => sum + parseFloat(item.valor_servico || '0'),
              0
            );

          // Consultas por status (AI dev note: corrigindo contadores que não funcionavam)
          const consultasFinalizadas = data.filter(
            (item) =>
              (item.consulta_status as unknown as { codigo: string })
                ?.codigo === 'finalizado'
          ).length;
          const consultasAgendadas = data.filter(
            (item) =>
              (item.consulta_status as unknown as { codigo: string })
                ?.codigo === 'agendado'
          ).length;
          const consultasCanceladas = data.filter(
            (item) =>
              (item.consulta_status as unknown as { codigo: string })
                ?.codigo === 'cancelado'
          ).length;

          // Função auxiliar para converter string de data em timestamp (sem conversão de timezone)
          const parseDateTime = (dateString: string): number => {
            const [datePart, timePart] =
              dateString.split('T').length > 1
                ? dateString.split('T')
                : dateString.split(' ');

            const [year, month, day] = datePart.split('-');
            const [hour, minute, second] = timePart.split('+')[0].split(':');

            const date = new Date(
              parseInt(year),
              parseInt(month) - 1,
              parseInt(day),
              parseInt(hour),
              parseInt(minute),
              parseInt(second || '0')
            );

            return date.getTime();
          };

          // Última consulta
          const sortedConsultas = data
            .filter(
              (item) =>
                (item.consulta_status as unknown as { codigo: string })
                  ?.codigo === 'finalizado'
            )
            .sort(
              (a, b) => parseDateTime(b.data_hora) - parseDateTime(a.data_hora)
            );

          const ultimaConsulta = sortedConsultas[0]?.data_hora;
          const diasDesdeUltima = ultimaConsulta
            ? Math.floor(
                (Date.now() - parseDateTime(ultimaConsulta)) /
                  (1000 * 60 * 60 * 24)
              )
            : null;

          const calculatedMetrics: PatientMetricsData = {
            total_consultas: totalConsultas,
            total_faturado: totalFaturado,
            valor_pendente: valorPendente,
            valor_em_atraso: valorEmAtraso,
            dias_em_atraso: valorEmAtraso > 0 ? 30 : 0, // Placeholder - implementar lógica real
            ultima_consulta: ultimaConsulta || null,
            dias_desde_ultima_consulta: diasDesdeUltima || 0,
            consultas_finalizadas: consultasFinalizadas,
            consultas_agendadas: consultasAgendadas,
            consultas_canceladas: consultasCanceladas,
            valor_pago: valorPago,
          };

          setMetrics(calculatedMetrics);
        } catch (err) {
          console.error('Erro ao carregar métricas do paciente:', err);
          setError('Erro ao carregar métricas do paciente');
        } finally {
          setIsLoading(false);
        }
      };

      loadMetrics();
    }, [patientId, periodFilter, startDate, endDate]);

    // Função para formatar valor monetário
    const formatCurrency = (value: number) => {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(value);
    };

    // Loading state
    if (isLoading) {
      return (
        <Card className={cn('w-full', className)}>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          </CardContent>
        </Card>
      );
    }

    // Error state
    if (error || !metrics) {
      return (
        <Alert variant="destructive" className={className}>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {error || 'Não foi possível carregar as métricas'}
          </AlertDescription>
        </Alert>
      );
    }

    return (
      <Card className={cn('w-full', className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Métricas do Paciente
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Filtros */}
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Período:</span>
            </div>

            <div className="flex flex-col md:flex-row gap-2 flex-1">
              <Select
                value={periodFilter}
                onValueChange={(value: PeriodFilter) => setPeriodFilter(value)}
              >
                <SelectTrigger className="w-full md:w-48">
                  <SelectValue placeholder="Selecione o período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os dados</SelectItem>
                  <SelectItem value="ultimos_30">Últimos 30 dias</SelectItem>
                  <SelectItem value="ultimos_60">Últimos 60 dias</SelectItem>
                  <SelectItem value="ultimos_90">Últimos 90 dias</SelectItem>
                  <SelectItem value="ultimo_ano">Último ano</SelectItem>
                  <SelectItem value="personalizado">
                    Período personalizado
                  </SelectItem>
                </SelectContent>
              </Select>

              {periodFilter === 'personalizado' && (
                <div className="flex gap-2">
                  <DatePicker
                    value={startDate}
                    onChange={setStartDate}
                    placeholder="Data inicial"
                    className="w-full md:w-40"
                  />
                  <DatePicker
                    value={endDate}
                    onChange={setEndDate}
                    placeholder="Data final"
                    className="w-full md:w-40"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Primeira linha: Valores financeiros */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {/* Total Faturado */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-medium text-muted-foreground">
                  Total Faturado
                </span>
              </div>
              <p className="text-xl font-bold">
                {formatCurrency(metrics.total_faturado)}
              </p>
              <p className="text-xs text-muted-foreground">
                Valor total dos serviços
              </p>
            </div>

            {/* Valor Pago */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-muted-foreground">
                  Valor Pago
                </span>
              </div>
              <p className="text-xl font-bold text-green-600">
                {formatCurrency(metrics.valor_pago || 0)}
              </p>
              <Badge variant="outline" className="text-xs text-green-600">
                Pago
              </Badge>
            </div>

            {/* Valor Pendente */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-yellow-500" />
                <span className="text-sm font-medium text-muted-foreground">
                  Valor Pendente
                </span>
              </div>
              <p className="text-xl font-bold text-yellow-600">
                {formatCurrency(metrics.valor_pendente)}
              </p>
              <Badge variant="outline" className="text-xs text-yellow-600">
                Pendente
              </Badge>
            </div>

            {/* Valor em Atraso */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <span className="text-sm font-medium text-muted-foreground">
                  Valor em Atraso
                </span>
              </div>
              <p className="text-xl font-bold text-red-600">
                {formatCurrency(metrics.valor_em_atraso)}
              </p>
              <Badge variant="destructive" className="text-xs">
                {metrics.dias_em_atraso} dias
              </Badge>
            </div>
          </div>

          {/* Segunda linha: Consultas */}
          <div className="grid grid-cols-1 gap-4">
            {/* Total de Consultas com status detalhado */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-medium text-muted-foreground">
                  Total de Consultas
                </span>
              </div>
              <p className="text-2xl font-bold">{metrics.total_consultas}</p>
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <span>✅ Finalizadas:</span>
                  <span className="font-semibold">
                    {metrics.consultas_finalizadas || 0}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span>📅 Agendadas:</span>
                  <span className="font-semibold">
                    {metrics.consultas_agendadas || 0}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span>❌ Canceladas:</span>
                  <span className="font-semibold">
                    {metrics.consultas_canceladas || 0}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
);

PatientMetrics.displayName = 'PatientMetrics';
