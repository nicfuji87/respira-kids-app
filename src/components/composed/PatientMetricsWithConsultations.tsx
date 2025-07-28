import React, { useState, useEffect } from 'react';
import {
  Calendar,
  DollarSign,
  AlertTriangle,
  Clock,
  Activity,
  Filter,
  MapPin,
  User,
  ChevronRight,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';
import { Button } from '@/components/primitives/button';
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
  RecentConsultation,
} from '@/types/patient-details';

// AI dev note: PatientMetricsWithConsultations - Componente unificado que combina métricas e lista de consultas
// Filtros compartilhados entre métricas e consultas, conforme solicitado pelo usuário

type PeriodFilter =
  | 'ultimos_30'
  | 'ultimos_60'
  | 'ultimos_90'
  | 'ultimo_ano'
  | 'personalizado'
  | 'todos';

interface PatientMetricsWithConsultationsProps extends PatientMetricsProps {
  onConsultationClick?: (consultationId: string) => void;
}

export const PatientMetricsWithConsultations =
  React.memo<PatientMetricsWithConsultationsProps>(
    ({ patientId, onConsultationClick, className }) => {
      const [metrics, setMetrics] = useState<PatientMetricsData | null>(null);
      const [consultations, setConsultations] = useState<RecentConsultation[]>(
        []
      );
      const [totalCount, setTotalCount] = useState(0);
      const [isLoading, setIsLoading] = useState(true);
      const [error, setError] = useState<string | null>(null);

      // Estados do filtro compartilhado
      const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('todos');
      const [startDate, setStartDate] = useState<string>('');
      const [endDate, setEndDate] = useState<string>('');

      useEffect(() => {
        const loadData = async () => {
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

            // Query para métricas com filtros aplicados
            let metricsQuery = supabase
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

            // Query para consultas com filtros aplicados
            let consultationsQuery = supabase
              .from('vw_agendamentos_completos')
              .select(
                `
              id,
              data_hora,
              valor_servico,
              tipo_servico_nome,
              local_atendimento_nome,
              status_consulta_descricao,
              status_consulta_cor,
              status_pagamento_descricao,
              status_pagamento_cor,
              profissional_nome,
              possui_evolucao
            `
              )
              .eq('paciente_id', patientId)
              .eq('ativo', true);

            // Aplicar filtros de data se especificados
            if (start) {
              metricsQuery = metricsQuery.gte('data_hora', start);
              consultationsQuery = consultationsQuery.gte('data_hora', start);
            }
            if (end) {
              metricsQuery = metricsQuery.lte('data_hora', end + 'T23:59:59');
              consultationsQuery = consultationsQuery.lte(
                'data_hora',
                end + 'T23:59:59'
              );
            }

            // Executar queries em paralelo
            const [metricsResult, consultationsResult] = await Promise.all([
              metricsQuery,
              consultationsQuery
                .order('data_hora', { ascending: false })
                .limit(5),
            ]);

            if (metricsResult.error) {
              throw new Error(metricsResult.error.message);
            }
            if (consultationsResult.error) {
              throw new Error(consultationsResult.error.message);
            }

            const metricsData = metricsResult.data || [];
            const consultationsData = consultationsResult.data || [];

            // Calcular métricas
            const totalConsultas = metricsData.length;
            const totalAgendado = metricsData.reduce(
              (sum, item) => sum + parseFloat(item.valor_servico || '0'),
              0
            );

            // Calcular Total Faturado (cobrança gerada + pendente + pago + atrasado)
            const totalFaturado = metricsData
              .filter((item) => {
                const statusCode = (
                  item.pagamento_status as unknown as { codigo: string }
                )?.codigo;
                return [
                  'cobranca_gerada',
                  'pendente',
                  'pago',
                  'atrasado',
                ].includes(statusCode);
              })
              .reduce(
                (sum, item) => sum + parseFloat(item.valor_servico || '0'),
                0
              );

            // Calcular valores por status de pagamento
            const valorPago = metricsData
              .filter(
                (item) =>
                  (item.pagamento_status as unknown as { codigo: string })
                    ?.codigo === 'pago'
              )
              .reduce(
                (sum, item) => sum + parseFloat(item.valor_servico || '0'),
                0
              );

            const valorPendente = metricsData
              .filter(
                (item) =>
                  (item.pagamento_status as unknown as { codigo: string })
                    ?.codigo === 'pendente'
              )
              .reduce(
                (sum, item) => sum + parseFloat(item.valor_servico || '0'),
                0
              );

            const valorEmAtraso = metricsData
              .filter(
                (item) =>
                  (item.pagamento_status as unknown as { codigo: string })
                    ?.codigo === 'atrasado'
              )
              .reduce(
                (sum, item) => sum + parseFloat(item.valor_servico || '0'),
                0
              );

            // Consultas por status
            const consultasFinalizadas = metricsData.filter(
              (item) =>
                (item.consulta_status as unknown as { codigo: string })
                  ?.codigo === 'finalizada'
            ).length;
            const consultasAgendadas = metricsData.filter(
              (item) =>
                (item.consulta_status as unknown as { codigo: string })
                  ?.codigo === 'agendada'
            ).length;
            const consultasCanceladas = metricsData.filter(
              (item) =>
                (item.consulta_status as unknown as { codigo: string })
                  ?.codigo === 'cancelada'
            ).length;

            // Última consulta
            const sortedConsultas = metricsData
              .filter(
                (item) =>
                  (item.consulta_status as unknown as { codigo: string })
                    ?.codigo === 'finalizada'
              )
              .sort(
                (a, b) =>
                  new Date(b.data_hora).getTime() -
                  new Date(a.data_hora).getTime()
              );

            const ultimaConsulta = sortedConsultas[0]?.data_hora;
            const diasDesdeUltima = ultimaConsulta
              ? Math.floor(
                  (Date.now() - new Date(ultimaConsulta).getTime()) /
                    (1000 * 60 * 60 * 24)
                )
              : null;

            const calculatedMetrics: PatientMetricsData = {
              total_consultas: totalConsultas,
              total_faturado: totalFaturado, // Novo: apenas status específicos
              total_agendado: totalAgendado, // Novo: renomeado do antigo total_faturado
              valor_pendente: valorPendente,
              valor_em_atraso: valorEmAtraso,
              dias_em_atraso: valorEmAtraso > 0 ? 30 : 0,
              ultima_consulta: ultimaConsulta || null,
              dias_desde_ultima_consulta: diasDesdeUltima || 0,
              consultas_finalizadas: consultasFinalizadas,
              consultas_agendadas: consultasAgendadas,
              consultas_canceladas: consultasCanceladas,
              valor_pago: valorPago,
            };

            // Mapear dados das consultas
            const mappedConsultations: RecentConsultation[] =
              consultationsData.map((item) => ({
                id: item.id,
                data_hora: item.data_hora,
                servico_nome:
                  item.tipo_servico_nome || 'Serviço não especificado',
                local_nome:
                  item.local_atendimento_nome || 'Local não especificado',
                valor_servico: parseFloat(item.valor_servico || '0'),
                status_consulta:
                  item.status_consulta_descricao || 'Status não definido',
                status_pagamento:
                  item.status_pagamento_descricao || 'Status não definido',
                status_cor_consulta: item.status_consulta_cor || '#gray',
                status_cor_pagamento: item.status_pagamento_cor || '#gray',
                profissional_nome:
                  item.profissional_nome || 'Profissional não especificado',
                possui_evolucao: item.possui_evolucao || 'não',
              }));

            setMetrics(calculatedMetrics);
            setConsultations(mappedConsultations);

            // Buscar total de consultas para exibir contador
            let totalQuery = supabase
              .from('vw_agendamentos_completos')
              .select('*', { count: 'exact', head: true })
              .eq('paciente_id', patientId)
              .eq('ativo', true);

            if (start) {
              totalQuery = totalQuery.gte('data_hora', start);
            }
            if (end) {
              totalQuery = totalQuery.lte('data_hora', end + 'T23:59:59');
            }

            const { count } = await totalQuery;
            setTotalCount(count || 0);
          } catch (err) {
            console.error('Erro ao carregar dados do paciente:', err);
            setError('Erro ao carregar dados do paciente');
          } finally {
            setIsLoading(false);
          }
        };

        loadData();
      }, [patientId, periodFilter, startDate, endDate]);

      // Função para formatar valor monetário
      const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        }).format(value);
      };

      // Função para formatar data e hora
      const formatDateTime = (dateString: string) => {
        const date = new Date(dateString);
        return {
          date: date.toLocaleDateString('pt-BR'),
          time: date.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          }),
        };
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
                <Skeleton className="h-64 w-full" />
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
              {error || 'Não foi possível carregar os dados'}
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
            {/* Filtros compartilhados */}
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Período:</span>
              </div>

              <div className="flex flex-col md:flex-row gap-2 flex-1">
                <Select
                  value={periodFilter}
                  onValueChange={(value: PeriodFilter) =>
                    setPeriodFilter(value)
                  }
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
              {/* Total Agendado (anteriormente Total Faturado) */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium text-muted-foreground">
                    Total Agendado
                  </span>
                </div>
                <p className="text-xl font-bold">
                  {formatCurrency(metrics.total_agendado || 0)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Valor total dos serviços
                </p>
              </div>

              {/* Total Faturado (novo - apenas status específicos) */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-purple-500" />
                  <span className="text-sm font-medium text-muted-foreground">
                    Total Faturado
                  </span>
                </div>
                <p className="text-xl font-bold text-purple-600">
                  {formatCurrency(metrics.total_faturado)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Cobrança + Pendente + Pago + Atraso
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

            {/* Seção de Lista de Consultas */}
            <div className="space-y-4 border-t pt-6">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                <h3 className="text-lg font-medium">Lista de Consultas</h3>
                {totalCount > 0 && (
                  <Badge variant="outline" className="ml-auto">
                    {totalCount} total
                  </Badge>
                )}
              </div>

              {consultations.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Nenhuma consulta encontrada no período</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {consultations.map((consultation) => {
                    const { date, time } = formatDateTime(
                      consultation.data_hora
                    );

                    return (
                      <div
                        key={consultation.id}
                        className="flex items-start gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() => onConsultationClick?.(consultation.id)}
                      >
                        {/* Ícone de data */}
                        <div className="flex flex-col items-center justify-center w-12 h-12 bg-blue-100 rounded-lg">
                          <Calendar className="h-5 w-5 text-blue-600" />
                          <span className="text-xs font-medium text-blue-600">
                            {date.split('/')[0]}
                          </span>
                        </div>

                        {/* Detalhes da consulta */}
                        <div className="flex-1 space-y-2">
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-medium text-sm">
                                {consultation.servico_nome}
                              </h4>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>
                                  {date} às {time}
                                </span>
                                {consultation.local_nome && (
                                  <>
                                    <span>•</span>
                                    <div className="flex items-center gap-1">
                                      <MapPin className="h-3 w-3" />
                                      <span>{consultation.local_nome}</span>
                                    </div>
                                  </>
                                )}
                              </div>
                              {consultation.profissional_nome && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                                  <User className="h-3 w-3" />
                                  <span>{consultation.profissional_nome}</span>
                                </div>
                              )}
                            </div>

                            <div className="text-right">
                              <div className="text-sm font-medium">
                                {formatCurrency(consultation.valor_servico)}
                              </div>
                            </div>
                          </div>

                          {/* Status badges */}
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className="text-xs"
                              style={{
                                borderColor: consultation.status_cor_consulta,
                                color: consultation.status_cor_consulta,
                              }}
                            >
                              {consultation.status_consulta}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="text-xs"
                              style={{
                                borderColor: consultation.status_cor_pagamento,
                                color: consultation.status_cor_pagamento,
                              }}
                            >
                              {consultation.status_pagamento}
                            </Badge>

                            {/* Badge de evolução */}
                            {consultation.possui_evolucao === 'não' && (
                              <Badge
                                variant="outline"
                                className="text-xs px-1.5 py-0.5 h-5 bg-yellow-50 text-yellow-800 border-yellow-200"
                              >
                                Evoluir Paciente
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Ver mais */}
                  {totalCount > consultations.length && (
                    <div className="text-center pt-4 border-t">
                      <Button variant="outline" size="sm">
                        Ver todas as {totalCount} consultas
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      );
    }
  );

PatientMetricsWithConsultations.displayName = 'PatientMetricsWithConsultations';
