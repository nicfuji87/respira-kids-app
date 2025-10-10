import React, { useState, useEffect, useCallback } from 'react';
import {
  User,
  DollarSign,
  TrendingUp,
  MapPin,
  Briefcase,
  CreditCard,
  ChevronDown,
  ChevronUp,
  X,
  Calendar,
  Eye,
  EyeOff,
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

// AI dev note: Relatório de Comissões de Profissionais - ADMIN ONLY
// Exibe resumo de comissões por profissional com detalhamento por local, serviço e status
// Usa vw_agendamentos_completos que já tem comissões calculadas
interface ConsultaComComissao {
  id: string;
  data_hora: string;
  profissional_id: string;
  profissional_nome: string;
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

interface ResumoComissaoProfissional {
  profissional_id: string;
  profissional_nome: string;
  total_consultas: number;
  total_comissao: number;
  total_faturamento_clinica: number;
  consultas_por_local: Record<
    string,
    { count: number; comissao: number; faturamento: number }
  >;
  consultas_por_servico: Record<
    string,
    { count: number; comissao: number; faturamento: number }
  >;
  consultas_por_status: Record<
    string,
    { count: number; comissao: number; faturamento: number }
  >;
}

type PeriodFilter =
  | 'mes_atual'
  | 'mes_anterior'
  | 'ultimos_30'
  | 'personalizado'
  | 'todos';
type SortOption = 'nome_asc' | 'nome_desc' | 'comissao_desc' | 'comissao_asc';

interface FinancialProfessionalReportProps {
  className?: string;
}

export const FinancialProfessionalReport: React.FC<
  FinancialProfessionalReportProps
> = ({ className }) => {
  const [consultas, setConsultas] = useState<ConsultaComComissao[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('mes_atual');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [professionalFilter, setProfessionalFilter] = useState<string>('todos');
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>('todos');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [sortOption, setSortOption] = useState<SortOption>('nome_asc');
  const [showFaturamento, setShowFaturamento] = useState<boolean>(true);

  // Expansão de cards
  const [expandedProfessionals, setExpandedProfessionals] = useState<
    Set<string>
  >(new Set());

  // Listas para filtros
  const [professionals, setProfessionals] = useState<
    Array<{ id: string; nome: string }>
  >([]);
  const [serviceTypes, setServiceTypes] = useState<
    Array<{ id: string; nome: string }>
  >([]);

  // Buscar consultas com comissões
  const fetchConsultas = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // AI dev note: Usar vw_agendamentos_completos que já tem comissões calculadas
      let query = supabase
        .from('vw_agendamentos_completos')
        .select(
          `
          id, data_hora, profissional_id, profissional_nome,
          tipo_servico_id, servico_nome, local_id, local_nome,
          local_atendimento_tipo_local, valor_servico,
          comissao_tipo_recebimento, comissao_valor_fixo,
          comissao_valor_percentual, comissao_valor_calculado,
          status_pagamento_codigo, status_pagamento_nome,
          status_consulta_codigo
        `
        )
        .not('status_consulta_codigo', 'eq', 'cancelado')
        .order('data_hora', { ascending: false });

      // Aplicar filtro de período
      const today = new Date();
      let startDateFilter = '';
      let endDateFilter = today.toISOString().split('T')[0];

      switch (periodFilter) {
        case 'mes_atual':
          // Primeiro dia do mês atual
          startDateFilter = new Date(today.getFullYear(), today.getMonth(), 1)
            .toISOString()
            .split('T')[0];
          endDateFilter = today.toISOString().split('T')[0];
          break;
        case 'mes_anterior':
          // Primeiro dia do mês anterior
          startDateFilter = new Date(
            today.getFullYear(),
            today.getMonth() - 1,
            1
          )
            .toISOString()
            .split('T')[0];
          // Último dia do mês anterior
          endDateFilter = new Date(today.getFullYear(), today.getMonth(), 0)
            .toISOString()
            .split('T')[0];
          break;
        case 'ultimos_30':
          startDateFilter = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0];
          endDateFilter = today.toISOString().split('T')[0];
          break;
        case 'personalizado':
          if (startDate) startDateFilter = startDate;
          if (endDate) endDateFilter = endDate;
          break;
      }

      if (startDateFilter && periodFilter !== 'todos') {
        query = query.gte('data_hora', startDateFilter);
      }
      if (endDateFilter && periodFilter !== 'todos') {
        // AI dev note: Incluir fim do dia para garantir que todo o último dia seja contabilizado
        query = query.lte('data_hora', endDateFilter + 'T23:59:59');
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setConsultas(data || []);

      // Extrair listas únicas para filtros
      const uniqueProfessionals = Array.from(
        new Map(
          (data || [])
            .filter((c) => c.profissional_id && c.profissional_nome)
            .map((c) => [
              c.profissional_id,
              { id: c.profissional_id, nome: c.profissional_nome },
            ])
        ).values()
      );
      setProfessionals(uniqueProfessionals);

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
  }, [periodFilter, startDate, endDate]);

  useEffect(() => {
    fetchConsultas();
  }, [fetchConsultas]);

  // Aplicar filtros e calcular resumos
  const resumos = React.useMemo(() => {
    let filtered = [...consultas];

    // Filtro de profissional
    if (professionalFilter !== 'todos') {
      filtered = filtered.filter(
        (c) => c.profissional_id === professionalFilter
      );
    }

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

    // Agrupar por profissional
    const resumosPorProfissional = new Map<
      string,
      ResumoComissaoProfissional
    >();

    filtered.forEach((consulta) => {
      const profId = consulta.profissional_id;

      if (!resumosPorProfissional.has(profId)) {
        resumosPorProfissional.set(profId, {
          profissional_id: profId,
          profissional_nome: consulta.profissional_nome,
          total_consultas: 0,
          total_comissao: 0,
          total_faturamento_clinica: 0,
          consultas_por_local: {},
          consultas_por_servico: {},
          consultas_por_status: {},
        });
      }

      const resumo = resumosPorProfissional.get(profId)!;

      // Contadores gerais
      resumo.total_consultas += 1;
      resumo.total_comissao += consulta.comissao_valor_calculado || 0;
      resumo.total_faturamento_clinica += consulta.valor_servico || 0;

      // Por local
      const localKey =
        consulta.local_nome ||
        consulta.local_atendimento_tipo_local ||
        'Sem local';
      if (!resumo.consultas_por_local[localKey]) {
        resumo.consultas_por_local[localKey] = {
          count: 0,
          comissao: 0,
          faturamento: 0,
        };
      }
      resumo.consultas_por_local[localKey].count += 1;
      resumo.consultas_por_local[localKey].comissao +=
        consulta.comissao_valor_calculado || 0;
      resumo.consultas_por_local[localKey].faturamento +=
        consulta.valor_servico || 0;

      // Por serviço
      const servicoKey = consulta.servico_nome || 'Sem serviço';
      if (!resumo.consultas_por_servico[servicoKey]) {
        resumo.consultas_por_servico[servicoKey] = {
          count: 0,
          comissao: 0,
          faturamento: 0,
        };
      }
      resumo.consultas_por_servico[servicoKey].count += 1;
      resumo.consultas_por_servico[servicoKey].comissao +=
        consulta.comissao_valor_calculado || 0;
      resumo.consultas_por_servico[servicoKey].faturamento +=
        consulta.valor_servico || 0;

      // Por status
      const statusKey = consulta.status_pagamento_nome || 'Sem status';
      if (!resumo.consultas_por_status[statusKey]) {
        resumo.consultas_por_status[statusKey] = {
          count: 0,
          comissao: 0,
          faturamento: 0,
        };
      }
      resumo.consultas_por_status[statusKey].count += 1;
      resumo.consultas_por_status[statusKey].comissao +=
        consulta.comissao_valor_calculado || 0;
      resumo.consultas_por_status[statusKey].faturamento +=
        consulta.valor_servico || 0;
    });

    // Converter Map para Array e ordenar
    const resumosArray = Array.from(resumosPorProfissional.values());

    switch (sortOption) {
      case 'nome_asc':
        resumosArray.sort((a, b) =>
          a.profissional_nome.localeCompare(b.profissional_nome, 'pt-BR')
        );
        break;
      case 'nome_desc':
        resumosArray.sort((a, b) =>
          b.profissional_nome.localeCompare(a.profissional_nome, 'pt-BR')
        );
        break;
      case 'comissao_desc':
        resumosArray.sort((a, b) => b.total_comissao - a.total_comissao);
        break;
      case 'comissao_asc':
        resumosArray.sort((a, b) => a.total_comissao - b.total_comissao);
        break;
    }

    return resumosArray;
  }, [
    consultas,
    professionalFilter,
    serviceTypeFilter,
    statusFilter,
    sortOption,
  ]);

  // Função para formatar valores monetários
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  // Toggle expansão de card
  const toggleExpand = (profissionalId: string) => {
    const newExpanded = new Set(expandedProfessionals);
    if (newExpanded.has(profissionalId)) {
      newExpanded.delete(profissionalId);
    } else {
      newExpanded.add(profissionalId);
    }
    setExpandedProfessionals(newExpanded);
  };

  // Totais gerais
  const totaisGerais = React.useMemo(() => {
    return resumos.reduce(
      (acc, resumo) => ({
        totalComissoes: acc.totalComissoes + resumo.total_comissao,
        totalFaturamento:
          acc.totalFaturamento + resumo.total_faturamento_clinica,
        totalConsultas: acc.totalConsultas + resumo.total_consultas,
      }),
      { totalComissoes: 0, totalFaturamento: 0, totalConsultas: 0 }
    );
  }, [resumos]);

  return (
    <div className={cn('space-y-4', className)}>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-verde-pipa flex-shrink-0" />
              <span className="text-base md:text-lg">
                Relatório de Profissionais
              </span>
            </CardTitle>

            {/* Toggle para mostrar/ocultar faturamento */}
            <Button
              variant={showFaturamento ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowFaturamento(!showFaturamento)}
              className="gap-2"
            >
              {showFaturamento ? (
                <>
                  <Eye className="h-4 w-4" />
                  <span className="hidden sm:inline">Com Faturamento</span>
                </>
              ) : (
                <>
                  <EyeOff className="h-4 w-4" />
                  <span className="hidden sm:inline">Sem Faturamento</span>
                </>
              )}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Filtros */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Ordenação */}
            <Select
              value={sortOption}
              onValueChange={(value: SortOption) => setSortOption(value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Ordenar por" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nome_asc">Nome A-Z</SelectItem>
                <SelectItem value="nome_desc">Nome Z-A</SelectItem>
                <SelectItem value="comissao_desc">Comissão (maior)</SelectItem>
                <SelectItem value="comissao_asc">Comissão (menor)</SelectItem>
              </SelectContent>
            </Select>

            {/* Período */}
            <Select
              value={periodFilter}
              onValueChange={(value: PeriodFilter) => setPeriodFilter(value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mes_atual">Mês Atual</SelectItem>
                <SelectItem value="mes_anterior">Mês Anterior</SelectItem>
                <SelectItem value="ultimos_30">Últimos 30 dias</SelectItem>
                <SelectItem value="personalizado">Personalizado</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
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
                <SelectItem value="todos">Todos os profissionais</SelectItem>
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
              <SelectTrigger>
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

          {/* Datas personalizadas */}
          {periodFilter === 'personalizado' && (
            <div className="flex gap-3 items-center flex-wrap">
              <DatePicker
                value={startDate}
                onChange={(value: string) => setStartDate(value)}
                placeholder="Data inicial"
              />
              <span className="text-muted-foreground">até</span>
              <DatePicker
                value={endDate}
                onChange={(value: string) => setEndDate(value)}
                placeholder="Data final"
              />
            </div>
          )}

          {/* Botão limpar filtros */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setPeriodFilter('mes_atual');
              setStartDate('');
              setEndDate('');
              setProfessionalFilter('todos');
              setServiceTypeFilter('todos');
              setStatusFilter('todos');
            }}
            className="w-full md:w-auto"
          >
            <X className="h-4 w-4 mr-1" />
            Limpar Filtros
          </Button>

          {/* Resumo Geral */}
          {!isLoading && !error && resumos.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">
                    Total de Consultas
                  </p>
                  <p className="text-lg font-semibold">
                    {totaisGerais.totalConsultas}
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
                    {formatCurrency(totaisGerais.totalComissoes)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <TrendingUp className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-sm text-muted-foreground">
                    Faturamento Clínica
                  </p>
                  <p className="text-lg font-semibold text-blue-500">
                    {formatCurrency(totaisGerais.totalFaturamento)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Lista de Profissionais */}
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="p-4 border rounded-lg space-y-2">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ))}
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : resumos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum dado encontrado com os filtros aplicados.
            </div>
          ) : (
            <div className="space-y-3">
              {resumos.map((resumo) => {
                const isExpanded = expandedProfessionals.has(
                  resumo.profissional_id
                );

                return (
                  <Card
                    key={resumo.profissional_id}
                    className="overflow-hidden"
                  >
                    <div
                      className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => toggleExpand(resumo.profissional_id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="space-y-2 flex-1">
                          {/* Nome e total de consultas */}
                          <div className="flex items-center gap-2">
                            <User className="h-5 w-5 text-muted-foreground" />
                            <h3 className="font-semibold text-lg">
                              {resumo.profissional_nome}
                            </h3>
                            <Badge variant="outline">
                              {resumo.total_consultas} consulta(s)
                            </Badge>
                          </div>

                          {/* Valores principais */}
                          <div className="flex flex-wrap gap-4 text-sm">
                            <div className="flex items-center gap-2">
                              <DollarSign className="h-4 w-4 text-verde-pipa" />
                              <span className="text-muted-foreground">
                                Comissão:
                              </span>
                              <span className="font-semibold text-verde-pipa">
                                {formatCurrency(resumo.total_comissao)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <TrendingUp className="h-4 w-4 text-blue-500" />
                              <span className="text-muted-foreground">
                                Faturamento:
                              </span>
                              <span className="font-semibold text-blue-500">
                                {formatCurrency(
                                  resumo.total_faturamento_clinica
                                )}
                              </span>
                            </div>
                          </div>
                        </div>

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

                    {/* Detalhamento expandido */}
                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-4 border-t bg-muted/20">
                        {/* Por Local */}
                        <div className="space-y-2 pt-4">
                          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <MapPin className="h-4 w-4" />
                            <span>Por Local de Atendimento</span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {Object.entries(resumo.consultas_por_local).map(
                              ([local, dados]) => (
                                <div
                                  key={local}
                                  className="flex items-center justify-between p-2 bg-background rounded text-sm"
                                >
                                  <span className="flex-1">{local}</span>
                                  <div className="flex items-center gap-2">
                                    <Badge
                                      variant="secondary"
                                      className="text-xs"
                                    >
                                      {dados.count}x
                                    </Badge>
                                    <div className="flex flex-col items-end">
                                      <span className="font-medium text-verde-pipa text-xs">
                                        {formatCurrency(dados.comissao)}
                                      </span>
                                      {showFaturamento && (
                                        <span className="font-medium text-blue-500 text-xs">
                                          {formatCurrency(dados.faturamento)}
                                        </span>
                                      )}
                                    </div>
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
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {Object.entries(resumo.consultas_por_servico).map(
                              ([servico, dados]) => (
                                <div
                                  key={servico}
                                  className="flex items-center justify-between p-2 bg-background rounded text-sm"
                                >
                                  <span className="flex-1">{servico}</span>
                                  <div className="flex items-center gap-2">
                                    <Badge
                                      variant="secondary"
                                      className="text-xs"
                                    >
                                      {dados.count}x
                                    </Badge>
                                    <div className="flex flex-col items-end">
                                      <span className="font-medium text-verde-pipa text-xs">
                                        {formatCurrency(dados.comissao)}
                                      </span>
                                      {showFaturamento && (
                                        <span className="font-medium text-blue-500 text-xs">
                                          {formatCurrency(dados.faturamento)}
                                        </span>
                                      )}
                                    </div>
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
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {Object.entries(resumo.consultas_por_status).map(
                              ([status, dados]) => (
                                <div
                                  key={status}
                                  className="flex items-center justify-between p-2 bg-background rounded text-sm"
                                >
                                  <span className="flex-1">{status}</span>
                                  <div className="flex items-center gap-2">
                                    <Badge
                                      variant="secondary"
                                      className="text-xs"
                                    >
                                      {dados.count}x
                                    </Badge>
                                    <div className="flex flex-col items-end">
                                      <span className="font-medium text-verde-pipa text-xs">
                                        {formatCurrency(dados.comissao)}
                                      </span>
                                      {showFaturamento && (
                                        <span className="font-medium text-blue-500 text-xs">
                                          {formatCurrency(dados.faturamento)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
