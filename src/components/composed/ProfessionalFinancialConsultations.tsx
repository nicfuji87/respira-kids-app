import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  DollarSign,
  User,
  MapPin,
  ChevronRight,
  X,
  Building2,
  Search,
  ChevronDown,
  ChevronUp,
  Users,
  Briefcase,
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
import { Input } from '@/components/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

// AI dev note: Lista de consultas para profissional
// Mostra consultas agrupadas por paciente com valores de comissão
// Sem funcionalidade de seleção em massa (profissionais não geram cobrança Asaas)

interface ConsultationWithCommission {
  id: string;
  data_hora: string;
  servico_nome: string;
  valor_servico: number;
  comissao_valor_calculado: number | null;
  paciente_id: string;
  paciente_nome: string;
  local_id?: string;
  local_nome?: string;
  status_consulta_codigo: string;
  status_consulta_nome: string;
  status_pagamento_codigo: string;
  status_pagamento_nome: string;
  tipo_servico_id?: string;
  empresa_fatura_id?: string;
  empresa_fatura_razao_social?: string;
}

interface PatientGroup {
  paciente_id: string;
  paciente_nome: string;
  consultas: ConsultationWithCommission[];
  total_comissao: number;
  total_consultas: number;
}

type SortOption = 'data_desc' | 'data_asc' | 'paciente_asc' | 'paciente_desc';

interface ProfessionalFinancialConsultationsProps {
  professionalId: string;
  onConsultationClick?: (consultation: ConsultationWithCommission) => void;
  className?: string;
}

export const ProfessionalFinancialConsultations: React.FC<
  ProfessionalFinancialConsultationsProps
> = ({ professionalId, onConsultationClick, className }) => {
  const [consultations, setConsultations] = useState<
    ConsultationWithCommission[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros - AI dev note: Período padrão mês atual
  const [periodFilter, setPeriodFilter] = useState<
    'mes_atual' | 'mes_anterior'
  >('mes_atual');
  const [sortOption, setSortOption] = useState<SortOption>('data_desc');
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>('todos');
  const [empresaFilter, setEmpresaFilter] = useState<string>('todos');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [searchQuery, setSearchQuery] = useState('');

  // Expansão de grupos
  const [expandedPatients, setExpandedPatients] = useState<Set<string>>(
    new Set()
  );

  // Listas para filtros
  const [serviceTypes, setServiceTypes] = useState<
    Array<{ id: string; nome: string }>
  >([]);
  const [companies, setCompanies] = useState<
    Array<{ id: string; nome: string }>
  >([]);

  // Buscar consultas
  const fetchConsultations = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // AI dev note: Calcular datas com base no filtro de período
      const today = new Date();
      let startDateFilter = '';
      let endDateFilter = '';

      if (periodFilter === 'mes_atual') {
        // Mês atual: primeiro dia do mês até hoje
        startDateFilter = new Date(today.getFullYear(), today.getMonth(), 1)
          .toISOString()
          .split('T')[0];
        endDateFilter = today.toISOString().split('T')[0];
      } else if (periodFilter === 'mes_anterior') {
        // Mês anterior: primeiro dia do mês anterior até último dia do mês anterior
        const firstDayPrevMonth = new Date(
          today.getFullYear(),
          today.getMonth() - 1,
          1
        );
        const lastDayPrevMonth = new Date(
          today.getFullYear(),
          today.getMonth(),
          0
        );
        startDateFilter = firstDayPrevMonth.toISOString().split('T')[0];
        endDateFilter = lastDayPrevMonth.toISOString().split('T')[0];
      }

      const { data, error: fetchError } = await supabase
        .from('vw_agendamentos_completos')
        .select(
          `
          id, data_hora, servico_nome, valor_servico, comissao_valor_calculado,
          paciente_id, paciente_nome, local_id, local_nome,
          status_consulta_codigo, status_consulta_nome,
          status_pagamento_codigo, status_pagamento_nome,
          tipo_servico_id, empresa_fatura_id, empresa_fatura_razao_social
        `
        )
        .eq('profissional_id', professionalId)
        .not('status_consulta_codigo', 'eq', 'cancelado')
        .gte('data_hora', startDateFilter + 'T00:00:00')
        .lte('data_hora', endDateFilter + 'T23:59:59')
        .order('data_hora', { ascending: false });

      if (fetchError) throw fetchError;

      setConsultations(data || []);

      // Extrair listas para filtros
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

      const uniqueCompanies = Array.from(
        new Map(
          (data || [])
            .filter((c) => c.empresa_fatura_id && c.empresa_fatura_razao_social)
            .map((c) => [
              c.empresa_fatura_id,
              { id: c.empresa_fatura_id, nome: c.empresa_fatura_razao_social },
            ])
        ).values()
      );
      setCompanies(uniqueCompanies);
    } catch (err) {
      console.error('Erro ao buscar consultas:', err);
      setError('Erro ao carregar consultas');
    } finally {
      setIsLoading(false);
    }
  }, [professionalId, periodFilter]);

  useEffect(() => {
    fetchConsultations();
  }, [fetchConsultations]);

  // Aplicar filtros e agrupar por paciente
  const patientGroups: PatientGroup[] = React.useMemo(() => {
    let filtered = [...consultations];

    // Filtro de tipo de serviço
    if (serviceTypeFilter !== 'todos') {
      filtered = filtered.filter(
        (c) => c.tipo_servico_id === serviceTypeFilter
      );
    }

    // Filtro de empresa
    if (empresaFilter !== 'todos') {
      filtered = filtered.filter((c) => c.empresa_fatura_id === empresaFilter);
    }

    // Filtro de status
    if (statusFilter !== 'todos') {
      filtered = filtered.filter(
        (c) => c.status_pagamento_codigo === statusFilter
      );
    }

    // Busca por paciente
    if (searchQuery.trim()) {
      filtered = filtered.filter((c) =>
        c.paciente_nome.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Agrupar por paciente
    const groupMap = new Map<string, PatientGroup>();

    filtered.forEach((consulta) => {
      if (!groupMap.has(consulta.paciente_id)) {
        groupMap.set(consulta.paciente_id, {
          paciente_id: consulta.paciente_id,
          paciente_nome: consulta.paciente_nome,
          consultas: [],
          total_comissao: 0,
          total_consultas: 0,
        });
      }

      const group = groupMap.get(consulta.paciente_id)!;
      group.consultas.push(consulta);
      group.total_comissao += consulta.comissao_valor_calculado || 0;
      group.total_consultas += 1;
    });

    // Converter para array e ordenar
    const groups = Array.from(groupMap.values());

    // Ordenar consultas dentro de cada grupo
    groups.forEach((group) => {
      group.consultas.sort((a, b) => {
        if (sortOption === 'data_desc') {
          return (
            new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime()
          );
        } else {
          return (
            new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime()
          );
        }
      });
    });

    // Ordenar grupos
    switch (sortOption) {
      case 'paciente_asc':
        groups.sort((a, b) =>
          a.paciente_nome.localeCompare(b.paciente_nome, 'pt-BR')
        );
        break;
      case 'paciente_desc':
        groups.sort((a, b) =>
          b.paciente_nome.localeCompare(a.paciente_nome, 'pt-BR')
        );
        break;
      case 'data_desc':
      case 'data_asc':
        // Ordenar por data da consulta mais recente do grupo
        groups.sort((a, b) => {
          const dateA = new Date(a.consultas[0].data_hora).getTime();
          const dateB = new Date(b.consultas[0].data_hora).getTime();
          return sortOption === 'data_desc' ? dateB - dateA : dateA - dateB;
        });
        break;
    }

    return groups;
  }, [
    consultations,
    serviceTypeFilter,
    empresaFilter,
    statusFilter,
    searchQuery,
    sortOption,
  ]);

  // Totais
  const totals = React.useMemo(() => {
    const totalComissao = patientGroups.reduce(
      (sum, group) => sum + group.total_comissao,
      0
    );
    const totalConsultas = patientGroups.reduce(
      (sum, group) => sum + group.total_consultas,
      0
    );
    const totalPacientes = patientGroups.length;
    return { totalComissao, totalConsultas, totalPacientes };
  }, [patientGroups]);

  // Formatação
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateString));
  };

  // Toggle expansão de paciente
  const togglePatientExpansion = (patientId: string) => {
    const newExpanded = new Set(expandedPatients);
    if (newExpanded.has(patientId)) {
      newExpanded.delete(patientId);
    } else {
      newExpanded.add(patientId);
    }
    setExpandedPatients(newExpanded);
  };

  const getStatusBadgeVariant = (
    statusCode: string
  ): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (statusCode) {
      case 'pago':
        return 'default';
      case 'pendente':
        return 'secondary';
      case 'aberto':
        return 'outline';
      case 'cancelado':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-verde-pipa flex-shrink-0" />
            <span className="text-base md:text-lg">Consultas por Paciente</span>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Filtros */}
          <div className="flex flex-col gap-3">
            {/* Linha 1: Período, Ordenação, Serviços, Empresa, Status */}
            <div className="flex flex-wrap gap-3">
              {/* Período */}
              <Select
                value={periodFilter}
                onValueChange={(value: 'mes_atual' | 'mes_anterior') =>
                  setPeriodFilter(value)
                }
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mes_atual">Mês Atual</SelectItem>
                  <SelectItem value="mes_anterior">Mês Anterior</SelectItem>
                </SelectContent>
              </Select>

              {/* Ordenação */}
              <Select
                value={sortOption}
                onValueChange={(value: SortOption) => setSortOption(value)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Ordenar por" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="data_desc">Data (mais recente)</SelectItem>
                  <SelectItem value="data_asc">Data (mais antiga)</SelectItem>
                  <SelectItem value="paciente_asc">Paciente A-Z</SelectItem>
                  <SelectItem value="paciente_desc">Paciente Z-A</SelectItem>
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
              <Select value={empresaFilter} onValueChange={setEmpresaFilter}>
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

              {/* Status */}
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
          {(serviceTypeFilter !== 'todos' ||
            empresaFilter !== 'todos' ||
            statusFilter !== 'todos' ||
            searchQuery.trim()) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setServiceTypeFilter('todos');
                setEmpresaFilter('todos');
                setStatusFilter('todos');
                setSearchQuery('');
              }}
              className="w-full md:w-auto"
            >
              <X className="h-4 w-4 mr-1" />
              Limpar Filtros
            </Button>
          )}

          {/* Resumo Total */}
          {!isLoading && !error && patientGroups.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-3">
                <User className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">
                    Total de Pacientes
                  </p>
                  <p className="text-lg font-semibold">
                    {totals.totalPacientes}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">
                    Total de Consultas
                  </p>
                  <p className="text-lg font-semibold">
                    {totals.totalConsultas}
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
                    {formatCurrency(totals.totalComissao)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Lista de Pacientes */}
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
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
          ) : patientGroups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma consulta encontrada com os filtros aplicados.
            </div>
          ) : (
            <div className="space-y-3">
              {patientGroups.map((group) => {
                const isExpanded = expandedPatients.has(group.paciente_id);

                return (
                  <Card key={group.paciente_id} className="overflow-hidden">
                    <div
                      className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => togglePatientExpansion(group.paciente_id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-2">
                            <User className="h-5 w-5 text-muted-foreground" />
                            <h3 className="font-semibold text-lg">
                              {group.paciente_nome}
                            </h3>
                            <Badge variant="outline">
                              {group.total_consultas} consulta(s)
                            </Badge>
                          </div>

                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-verde-pipa" />
                            <span className="text-sm text-muted-foreground">
                              Comissão Total:
                            </span>
                            <span className="font-semibold text-verde-pipa">
                              {formatCurrency(group.total_comissao)}
                            </span>
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

                    {/* Lista de consultas expandida */}
                    {isExpanded && (
                      <div className="border-t bg-muted/20">
                        <div className="divide-y">
                          {group.consultas.map((consulta) => (
                            <div
                              key={consulta.id}
                              className="p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                              onClick={() => onConsultationClick?.(consulta)}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 space-y-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Calendar className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-sm font-medium">
                                      {formatDate(consulta.data_hora)}
                                    </span>
                                    <Badge
                                      variant={getStatusBadgeVariant(
                                        consulta.status_pagamento_codigo
                                      )}
                                      className="text-xs"
                                    >
                                      {consulta.status_pagamento_nome}
                                    </Badge>
                                  </div>

                                  <div className="text-sm space-y-1">
                                    <div className="flex items-center gap-2">
                                      <Briefcase className="h-4 w-4 text-muted-foreground" />
                                      <span>{consulta.servico_nome}</span>
                                    </div>

                                    {consulta.local_nome && (
                                      <div className="flex items-center gap-2">
                                        <MapPin className="h-4 w-4 text-muted-foreground" />
                                        <span>{consulta.local_nome}</span>
                                      </div>
                                    )}

                                    {consulta.empresa_fatura_razao_social && (
                                      <div className="flex items-center gap-2">
                                        <Building2 className="h-4 w-4 text-muted-foreground" />
                                        <span>
                                          {consulta.empresa_fatura_razao_social}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="flex flex-col items-end gap-1">
                                  <span className="text-xs text-muted-foreground">
                                    Comissão
                                  </span>
                                  <span className="text-lg font-semibold text-verde-pipa">
                                    {formatCurrency(
                                      consulta.comissao_valor_calculado || 0
                                    )}
                                  </span>
                                  <ChevronRight className="h-4 w-4 text-muted-foreground mt-1" />
                                </div>
                              </div>
                            </div>
                          ))}
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
