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
  CreditCard,
  X,
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
import { Checkbox } from '@/components/primitives/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { DatePicker } from './DatePicker';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { processPayment } from '@/lib/asaas-api';
import type { ProcessPaymentData } from '@/types/asaas';
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
      const { user } = useAuth();
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

      // Estados para seleção de consultas para cobrança
      const [isSelectionMode, setIsSelectionMode] = useState(false);
      const [selectedConsultations, setSelectedConsultations] = useState<
        string[]
      >([]);
      const [isGeneratingCharge, setIsGeneratingCharge] = useState(false);
      const [chargeError, setChargeError] = useState<string | null>(null);

      // Verificar se usuário tem permissão para gerar cobrança (admin ou secretaria)
      const canGenerateCharge =
        user?.pessoa?.role === 'admin' || user?.pessoa?.role === 'secretaria';

      // Handlers de seleção
      const toggleSelectionMode = () => {
        setIsSelectionMode(!isSelectionMode);
        setSelectedConsultations([]); // Limpar seleção ao entrar/sair do modo
      };

      const toggleConsultationSelection = (consultationId: string) => {
        setSelectedConsultations((prev) =>
          prev.includes(consultationId)
            ? prev.filter((id) => id !== consultationId)
            : [...prev, consultationId]
        );
      };

      const selectAllConsultations = () => {
        const selectableConsultations = consultations
          .filter((c) => c.status_pagamento?.toLowerCase() === 'pendente')
          .map((c) => c.id);
        setSelectedConsultations(selectableConsultations);
      };

      const clearSelection = () => {
        setSelectedConsultations([]);
      };

      // AI dev note: Gera descrição da cobrança baseada no template especificado
      const generateChargeDescription = async (
        selectedConsultationData: RecentConsultation[],
        patientData: Record<string, string | number | boolean | null>
      ) => {
        console.log('🎯 Gerando descrição da cobrança:', {
          consultationsCount: selectedConsultationData.length,
          patientData: patientData,
        });

        // Agrupar consultas por tipo de serviço
        const serviceGroups = selectedConsultationData.reduce(
          (groups: Record<string, RecentConsultation[]>, consultation) => {
            const extendedConsultation = consultation as RecentConsultation & {
              tipo_servico_nome?: string;
            };
            const serviceType =
              extendedConsultation.tipo_servico_nome ||
              consultation.servico_nome ||
              'Atendimento';
            if (!groups[serviceType]) {
              groups[serviceType] = [];
            }
            groups[serviceType].push(consultation);
            return groups;
          },
          {}
        );

        console.log('📋 Grupos de serviços:', serviceGroups);

        // Construir descrição dos serviços
        const serviceDescriptions = Object.entries(serviceGroups).map(
          ([serviceType, consultations]) => {
            const count = consultations.length;
            return count === 1
              ? `1 sessão de ${serviceType.toLowerCase()}`
              : `${count} sessões de ${serviceType.toLowerCase()}`;
          }
        );

        const servicesText = serviceDescriptions.join(', ');

        // Buscar dados completos do profissional da primeira consulta
        const firstConsultation = selectedConsultationData[0];
        const extendedFirstConsultation =
          firstConsultation as RecentConsultation & {
            profissional_id?: string;
          };
        const profissionalNome =
          firstConsultation?.profissional_nome || 'Profissional';

        let profissionalCpf = '';
        let profissionalRegistro = '';

        // Buscar CPF e registro do profissional no banco
        if (extendedFirstConsultation.profissional_id) {
          console.log(
            '🔍 Buscando dados completos do profissional:',
            extendedFirstConsultation.profissional_id
          );

          try {
            const { data: profissionalData, error: profissionalError } =
              await supabase
                .from('pessoas')
                .select('cpf_cnpj, registro_profissional')
                .eq('id', extendedFirstConsultation.profissional_id)
                .single();

            if (!profissionalError && profissionalData) {
              profissionalCpf = profissionalData.cpf_cnpj || '';
              profissionalRegistro =
                profissionalData.registro_profissional || '';
              console.log('✅ Dados do profissional encontrados:', {
                profissionalCpf,
                profissionalRegistro,
              });
            } else {
              console.warn(
                '⚠️ Erro ao buscar dados do profissional:',
                profissionalError
              );
            }
          } catch (error) {
            console.error('❌ Erro na busca do profissional:', error);
          }
        }

        // Dados do paciente
        const pacienteNome = patientData?.nome || 'Paciente';
        const pacienteCpf = patientData?.cpf_cnpj || '';

        console.log('👨‍⚕️ Dados do profissional:', {
          profissionalNome,
          profissionalCpf,
          profissionalRegistro,
        });
        console.log('👤 Dados do paciente:', { pacienteNome, pacienteCpf });

        // Construir lista de datas e valores
        const datesAndValues = selectedConsultationData
          .map((consultation) => {
            const date = new Date(consultation.data_hora).toLocaleDateString(
              'pt-BR'
            );
            const valueNumber = Number(consultation.valor_servico || 0);
            const formattedValue = valueNumber.toFixed(2).replace('.', ',');
            const value = `R$ ${formattedValue}`;
            return `${date} (${value})`;
          })
          .join(', ');

        // Template conforme especificado
        const registroText = profissionalRegistro
          ? ` ${profissionalRegistro}`
          : '';
        const description = `${servicesText}. Atendimento realizado ao paciente ${pacienteNome} CPF ${pacienteCpf}, pela ${profissionalNome} CPF ${profissionalCpf}${registroText}. Nos dias ${datesAndValues}`;

        console.log('📝 Descrição gerada:', description);
        return description;
      };

      // Handler para gerar cobrança
      const handleGenerateCharge = async () => {
        console.log('🚀 Iniciando geração de cobrança...');

        if (selectedConsultations.length === 0) {
          console.log('❌ Nenhuma consulta selecionada');
          return;
        }

        setIsGeneratingCharge(true);
        setChargeError(null);

        try {
          console.log('📋 Consultas selecionadas:', selectedConsultations);

          // Buscar dados completos das consultas selecionadas
          const selectedConsultationData = consultations.filter((c) =>
            selectedConsultations.includes(c.id)
          );

          console.log(
            '📊 Dados das consultas filtradas:',
            selectedConsultationData
          );

          if (selectedConsultationData.length === 0) {
            throw new Error('Nenhuma consulta selecionada encontrada');
          }

          // Calcular valor total
          const totalValue = selectedConsultationData.reduce(
            (sum, consultation) => {
              const value = Number(consultation.valor_servico || 0);
              return sum + value;
            },
            0
          );

          console.log('💰 Valor total calculado:', totalValue);

          if (totalValue <= 0) {
            throw new Error('Valor total deve ser maior que zero');
          }

          // Buscar dados completos do paciente com responsável de cobrança
          console.log('👤 Buscando dados do paciente:', patientId);

          const { data: patientData, error: patientError } = await supabase
            .from('pacientes_com_responsaveis_view')
            .select('*')
            .eq('id', patientId)
            .single();

          if (patientError || !patientData) {
            console.error('❌ Erro ao buscar dados do paciente:', patientError);
            throw new Error('Erro ao buscar dados do paciente');
          }

          console.log('✅ Dados do paciente encontrados:', patientData);

          const responsibleId =
            patientData.responsavel_cobranca_id || patientId;
          console.log('💳 Responsável pela cobrança:', responsibleId);

          // Gerar descrição da cobrança
          const description = await generateChargeDescription(
            selectedConsultationData,
            patientData
          );

          // Preparar dados para processamento
          const processData: ProcessPaymentData = {
            consultationIds: selectedConsultations,
            patientId: patientId,
            responsibleId: responsibleId,
            totalValue: totalValue,
            description: description,
          };

          console.log('⚙️ Processando cobrança:', processData);

          // Processar cobrança
          const result = await processPayment(
            processData,
            user?.pessoa?.role || null
          );

          console.log('📥 Resultado do processamento:', result);

          if (result.success) {
            console.log('✅ Cobrança criada com sucesso:', result);

            // Limpar seleção
            setSelectedConsultations([]);
            setIsSelectionMode(false);

            // Recarregar dados das consultas para atualizar status
            // TODO: Implementar reload das consultas ou mostrar feedback de sucesso
            console.log('🎉 Exibindo sucesso ao usuário');
            alert(
              'Cobrança gerada com sucesso! ID do pagamento: ' +
                result.asaasPaymentId
            );
          } else {
            console.error('❌ Falha no processamento:', result.error);
            throw new Error(
              result.error || 'Erro desconhecido ao gerar cobrança'
            );
          }
        } catch (error) {
          console.error('💥 Erro ao gerar cobrança:', error);
          const errorMessage =
            error instanceof Error ? error.message : 'Erro desconhecido';
          console.error('📝 Mensagem de erro para usuário:', errorMessage);
          setChargeError(errorMessage);
        } finally {
          console.log('🏁 Finalizando geração de cobrança');
          setIsGeneratingCharge(false);
        }
      };

      // Filtrar consultas selecionáveis (apenas pendentes)
      const selectableConsultations = consultations.filter(
        (c) => c.status_pagamento?.toLowerCase() === 'pendente'
      );

      const selectedCount = selectedConsultations.length;

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
              .from('vw_agendamentos_completos')
              .select(
                `
              valor_servico,
              data_hora,
              status_consulta_codigo,
              status_pagamento_codigo
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
              profissional_id,
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
                const statusCode = item.status_pagamento_codigo;
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
              .filter((item) => item.status_pagamento_codigo === 'pago')
              .reduce(
                (sum, item) => sum + parseFloat(item.valor_servico || '0'),
                0
              );

            const valorPendente = metricsData
              .filter((item) => item.status_pagamento_codigo === 'pendente')
              .reduce(
                (sum, item) => sum + parseFloat(item.valor_servico || '0'),
                0
              );

            const valorEmAtraso = metricsData
              .filter((item) => item.status_pagamento_codigo === 'atrasado')
              .reduce(
                (sum, item) => sum + parseFloat(item.valor_servico || '0'),
                0
              );

            // Consultas por status
            const consultasFinalizadas = metricsData.filter(
              (item) => item.status_consulta_codigo === 'finalizado'
            ).length;
            const consultasAgendadas = metricsData.filter(
              (item) => item.status_consulta_codigo === 'agendado'
            ).length;
            const consultasCanceladas = metricsData.filter(
              (item) => item.status_consulta_codigo === 'cancelado'
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
            const sortedConsultas = metricsData
              .filter((item) => item.status_consulta_codigo === 'finalizado')
              .sort(
                (a, b) =>
                  parseDateTime(b.data_hora) - parseDateTime(a.data_hora)
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

      // Limpar seleção quando mudamos filtros
      useEffect(() => {
        if (isSelectionMode) {
          setSelectedConsultations([]);
        }
      }, [periodFilter, startDate, endDate, isSelectionMode]);

      // Função para formatar valor monetário
      const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        }).format(value);
      };

      // Função para formatar data e hora (sem conversão de timezone)
      const formatDateTime = (dateString: string) => {
        // Parse manual para evitar conversão automática de timezone
        // Formato esperado: "2025-07-29T09:00:00+00:00" ou "2025-07-29 09:00:00+00"
        const [datePart, timePart] =
          dateString.split('T').length > 1
            ? dateString.split('T')
            : dateString.split(' ');

        const [year, month, day] = datePart.split('-');
        const [hour, minute] = timePart.split('+')[0].split(':'); // Remove timezone info

        // Criar data usando valores exatos sem conversão
        const date = new Date(
          parseInt(year),
          parseInt(month) - 1,
          parseInt(day)
        );

        return {
          date: date.toLocaleDateString('pt-BR'),
          time: `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`,
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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  <h3 className="text-lg font-medium">Lista de Consultas</h3>
                  {totalCount > 0 && (
                    <Badge variant="outline">{totalCount} total</Badge>
                  )}
                </div>

                {/* Botão de seleção para cobrança - apenas para admin/secretaria */}
                {canGenerateCharge && selectableConsultations.length > 0 && (
                  <div className="flex items-center gap-2">
                    {isSelectionMode && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={selectAllConsultations}
                          disabled={
                            selectedConsultations.length ===
                            selectableConsultations.length
                          }
                        >
                          Todas
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={clearSelection}
                          disabled={selectedConsultations.length === 0}
                        >
                          Limpar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={toggleSelectionMode}
                        >
                          <X className="h-4 w-4" />
                          Cancelar
                        </Button>
                      </>
                    )}

                    <Button
                      variant={selectedCount > 0 ? 'default' : 'outline'}
                      size="sm"
                      onClick={
                        selectedCount > 0
                          ? handleGenerateCharge
                          : toggleSelectionMode
                      }
                      disabled={isGeneratingCharge}
                      className={selectedCount > 0 ? 'respira-gradient' : ''}
                    >
                      <CreditCard className="h-4 w-4 mr-2" />
                      {isGeneratingCharge
                        ? 'Gerando cobrança...'
                        : selectedCount > 0
                          ? `Gerar cobrança de ${selectedCount} consulta${selectedCount > 1 ? 's' : ''}`
                          : 'Escolher consultas para gerar cobrança'}
                    </Button>
                  </div>
                )}

                {/* Exibir erro de cobrança se houver */}
                {chargeError && (
                  <Alert className="mt-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Erro ao gerar cobrança:</strong> {chargeError}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setChargeError(null)}
                        className="ml-2 h-auto p-1"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </AlertDescription>
                  </Alert>
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
                    const isSelectable =
                      consultation.status_pagamento?.toLowerCase() ===
                      'pendente';
                    const isSelected = selectedConsultations.includes(
                      consultation.id
                    );

                    return (
                      <div
                        key={consultation.id}
                        className={cn(
                          'flex items-start gap-4 p-4 border rounded-lg transition-colors',
                          !isSelectionMode &&
                            'hover:bg-muted/50 cursor-pointer',
                          isSelectionMode && !isSelectable && 'opacity-50',
                          isSelected && 'ring-2 ring-primary bg-primary/5'
                        )}
                        onClick={() => {
                          if (isSelectionMode && isSelectable) {
                            toggleConsultationSelection(consultation.id);
                          } else if (!isSelectionMode) {
                            onConsultationClick?.(consultation.id);
                          }
                        }}
                      >
                        {/* Checkbox para modo de seleção */}
                        {isSelectionMode && (
                          <div className="flex items-center pt-2">
                            <Checkbox
                              checked={isSelected}
                              disabled={!isSelectable}
                              onCheckedChange={() => {
                                if (isSelectable) {
                                  toggleConsultationSelection(consultation.id);
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                        )}

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
