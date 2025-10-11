import React, { useState, useEffect, useCallback } from 'react';
import {
  User,
  DollarSign,
  MapPin,
  Briefcase,
  CreditCard,
  ChevronDown,
  ChevronUp,
  Calendar,
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
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

// AI dev note: Resumo financeiro do profissional - PROFISSIONAL ONLY
// Exibe resumo de comissões do profissional logado com detalhamento por local, serviço e status
// Usa vw_agendamentos_completos que já tem comissões calculadas
// Mostra apenas valores de comissão, não o faturamento da clínica

type PeriodFilter =
  | 'mes_atual'
  | 'mes_anterior'
  | 'ultimos_30'
  | 'ultimos_60'
  | 'ultimos_90';

interface ConsultaComComissao {
  id: string;
  data_hora: string;
  tipo_servico_id: string;
  servico_nome: string;
  local_id: string | null;
  local_nome: string | null;
  local_atendimento_tipo_local: string | null;
  valor_servico: number;
  comissao_tipo_recebimento: 'fixo' | 'percentual' | null;
  comissao_valor_fixo: number | null;
  comissao_valor_percentual: number | null;
  comissao_valor_calculado: number | null;
  status_pagamento_codigo: string;
  status_pagamento_nome: string;
  status_consulta_codigo: string;
}

interface ResumoComissao {
  total_consultas: number;
  total_comissao: number;
  consultas_por_local: Record<string, { count: number; comissao: number }>;
  consultas_por_servico: Record<string, { count: number; comissao: number }>;
  consultas_por_status: Record<string, { count: number; comissao: number }>;
}

interface ProfessionalFinancialSummaryProps {
  professionalId: string;
  className?: string;
}

export const ProfessionalFinancialSummary: React.FC<
  ProfessionalFinancialSummaryProps
> = ({ professionalId, className }) => {
  const [consultas, setConsultas] = useState<ConsultaComComissao[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros - AI dev note: Período padrão mês atual
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('mes_atual');
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>('todos');
  const [statusFilter, setStatusFilter] = useState<string>('todos');

  // Expansão de seções
  const [isExpanded, setIsExpanded] = useState(true);

  // Listas para filtros
  const [serviceTypes, setServiceTypes] = useState<
    Array<{ id: string; nome: string }>
  >([]);

  // Buscar consultas com comissões
  const fetchConsultas = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // AI dev note: Calcular datas com base no filtro de período
      const today = new Date();
      let startDateFilter = '';
      let endDateFilter = today.toISOString().split('T')[0];

      switch (periodFilter) {
        case 'mes_atual':
          startDateFilter = new Date(today.getFullYear(), today.getMonth(), 1)
            .toISOString()
            .split('T')[0];
          break;
        case 'mes_anterior':
          startDateFilter = new Date(
            today.getFullYear(),
            today.getMonth() - 1,
            1
          )
            .toISOString()
            .split('T')[0];
          endDateFilter = new Date(today.getFullYear(), today.getMonth(), 0)
            .toISOString()
            .split('T')[0];
          break;
        case 'ultimos_30':
          startDateFilter = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0];
          break;
        case 'ultimos_60':
          startDateFilter = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0];
          break;
        case 'ultimos_90':
          startDateFilter = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0];
          break;
      }

      const { data, error: fetchError } = await supabase
        .from('vw_agendamentos_completos')
        .select(
          `
          id, data_hora, tipo_servico_id, servico_nome, local_id, local_nome,
          local_atendimento_tipo_local, valor_servico,
          comissao_tipo_recebimento, comissao_valor_fixo,
          comissao_valor_percentual, comissao_valor_calculado,
          status_pagamento_codigo, status_pagamento_nome,
          status_consulta_codigo
        `
        )
        .eq('profissional_id', professionalId)
        .not('status_consulta_codigo', 'eq', 'cancelado')
        .gte('data_hora', startDateFilter + 'T00:00:00')
        .lte('data_hora', endDateFilter + 'T23:59:59')
        .order('data_hora', { ascending: false });

      if (fetchError) throw fetchError;

      setConsultas(data || []);

      // Extrair lista de tipos de serviço
      const uniqueServiceTypes = Array.from(
        new Map(
          (data || [])
            .filter((c) => c.tipo_servico_id && c.servico_nome)
            .map((c) => [
              c.tipo_servico_id,
              { id: c.tipo_servico_id, nome: c.servico_nome },
            ])
        ).values()
      );
      setServiceTypes(uniqueServiceTypes);
    } catch (err) {
      console.error('Erro ao buscar consultas:', err);
      setError('Erro ao carregar consultas');
    } finally {
      setIsLoading(false);
    }
  }, [professionalId, periodFilter]);

  useEffect(() => {
    fetchConsultas();
  }, [fetchConsultas]);

  // Aplicar filtros e calcular resumo
  const resumo: ResumoComissao = React.useMemo(() => {
    let filtered = [...consultas];

    // Filtro de tipo de serviço
    if (serviceTypeFilter !== 'todos') {
      filtered = filtered.filter(
        (c) => c.tipo_servico_id === serviceTypeFilter
      );
    }

    // Filtro de status
    if (statusFilter !== 'todos') {
      filtered = filtered.filter(
        (c) => c.status_pagamento_codigo === statusFilter
      );
    }

    // Calcular totais
    const result: ResumoComissao = {
      total_consultas: 0,
      total_comissao: 0,
      consultas_por_local: {},
      consultas_por_servico: {},
      consultas_por_status: {},
    };

    filtered.forEach((consulta) => {
      result.total_consultas += 1;
      result.total_comissao += consulta.comissao_valor_calculado || 0;

      // Por local
      const localKey =
        consulta.local_nome ||
        consulta.local_atendimento_tipo_local ||
        'Sem local';
      if (!result.consultas_por_local[localKey]) {
        result.consultas_por_local[localKey] = { count: 0, comissao: 0 };
      }
      result.consultas_por_local[localKey].count += 1;
      result.consultas_por_local[localKey].comissao +=
        consulta.comissao_valor_calculado || 0;

      // Por serviço
      const servicoKey = consulta.servico_nome || 'Sem serviço';
      if (!result.consultas_por_servico[servicoKey]) {
        result.consultas_por_servico[servicoKey] = { count: 0, comissao: 0 };
      }
      result.consultas_por_servico[servicoKey].count += 1;
      result.consultas_por_servico[servicoKey].comissao +=
        consulta.comissao_valor_calculado || 0;

      // Por status
      const statusKey = consulta.status_pagamento_nome || 'Sem status';
      if (!result.consultas_por_status[statusKey]) {
        result.consultas_por_status[statusKey] = { count: 0, comissao: 0 };
      }
      result.consultas_por_status[statusKey].count += 1;
      result.consultas_por_status[statusKey].comissao +=
        consulta.comissao_valor_calculado || 0;
    });

    return result;
  }, [consultas, serviceTypeFilter, statusFilter]);

  // Função para formatar valores monetários
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  return (
    <div className={cn('space-y-4', className)}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-verde-pipa flex-shrink-0" />
            <span className="text-base md:text-lg">Resumo Financeiro</span>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Filtros */}
          <div className="flex flex-col gap-3">
            {/* Linha 1: Período, Serviços, Status */}
            <div className="flex flex-wrap gap-3">
              {/* Período */}
              <Select
                value={periodFilter}
                onValueChange={(value: PeriodFilter) => setPeriodFilter(value)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mes_atual">Mês Atual</SelectItem>
                  <SelectItem value="mes_anterior">Mês Anterior</SelectItem>
                  <SelectItem value="ultimos_30">Últimos 30 dias</SelectItem>
                  <SelectItem value="ultimos_60">Últimos 60 dias</SelectItem>
                  <SelectItem value="ultimos_90">Últimos 90 dias</SelectItem>
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

              {/* Status de Pagamento */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="flex-1 min-w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os status</SelectItem>
                  <SelectItem value="pago">Pago</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="aberto">Em aberto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Resumo Geral */}
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Total de Consultas
                    </p>
                    <p className="text-lg font-semibold">
                      {resumo.total_consultas}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <DollarSign className="h-5 w-5 text-verde-pipa" />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Total Comissões
                    </p>
                    <p className="text-lg font-semibold text-verde-pipa">
                      {formatCurrency(resumo.total_comissao)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Detalhamento expandido */}
              <Card className="overflow-hidden">
                <div
                  className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setIsExpanded(!isExpanded)}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Detalhamento</h3>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="flex-shrink-0"
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-5 w-5" />
                      ) : (
                        <ChevronDown className="h-5 w-5" />
                      )}
                    </Button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 space-y-4 border-t bg-muted/20">
                    {/* Por Local */}
                    <div className="space-y-2 pt-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        <span>Por Local de Atendimento</span>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {Object.entries(resumo.consultas_por_local).map(
                          ([local, dados]) => (
                            <div
                              key={local}
                              className="flex items-center justify-between p-2 bg-background rounded text-sm"
                            >
                              <span className="flex-1">{local}</span>
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-xs">
                                  {dados.count}x
                                </Badge>
                                <span className="font-medium text-verde-pipa text-xs">
                                  {formatCurrency(dados.comissao)}
                                </span>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>

                    {/* Por Serviço */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Briefcase className="h-4 w-4" />
                        <span>Por Tipo de Serviço</span>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {Object.entries(resumo.consultas_por_servico).map(
                          ([servico, dados]) => (
                            <div
                              key={servico}
                              className="flex items-center justify-between p-2 bg-background rounded text-sm"
                            >
                              <span className="flex-1">{servico}</span>
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-xs">
                                  {dados.count}x
                                </Badge>
                                <span className="font-medium text-verde-pipa text-xs">
                                  {formatCurrency(dados.comissao)}
                                </span>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>

                    {/* Por Status */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <CreditCard className="h-4 w-4" />
                        <span>Por Status de Pagamento</span>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {Object.entries(resumo.consultas_por_status).map(
                          ([status, dados]) => (
                            <div
                              key={status}
                              className="flex items-center justify-between p-2 bg-background rounded text-sm"
                            >
                              <span className="flex-1">{status}</span>
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-xs">
                                  {dados.count}x
                                </Badge>
                                <span className="font-medium text-verde-pipa text-xs">
                                  {formatCurrency(dados.comissao)}
                                </span>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
