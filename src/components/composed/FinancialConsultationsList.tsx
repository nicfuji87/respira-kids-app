import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  DollarSign,
  User,
  MapPin,
  ChevronRight,
  CreditCard,
  X,
  Building2,
  ExternalLink,
  Search,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  List,
  Users,
  Check,
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
import { Input } from '@/components/primitives/input';
import { useToast } from '@/components/primitives/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/primitives/popover';
import { DatePicker } from './DatePicker';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { processPayment } from '@/lib/asaas-api';
import type { ProcessPaymentData } from '@/types/asaas';
import { generateChargeDescription } from '@/lib/charge-description';
import type { ConsultationData, PatientData } from '@/lib/charge-description';
import { useAuth } from '@/hooks/useAuth';

// AI dev note: Lista de consultas para área financeira
// Mostra consultas de todos os pacientes com filtros e seleção em massa
// Baseado em PatientMetricsWithConsultations mas adaptado para múltiplos pacientes

interface ConsultationWithPatient {
  id: string;
  data_hora: string;
  servico_nome: string;
  servico_duracao?: number;
  valor_servico: number;
  profissional_id: string;
  profissional_nome: string;
  paciente_id: string;
  paciente_nome: string;
  responsavel_legal_id?: string;
  responsavel_legal_nome?: string;
  responsavel_financeiro_id?: string;
  responsavel_financeiro_nome?: string;
  local_id?: string;
  local_nome?: string;
  status_consulta_codigo: string;
  status_consulta_nome: string;
  status_pagamento_codigo: string;
  status_pagamento_nome: string;
  id_pagamento_externo?: string;
  pagamento_url?: string;
  fatura_id?: string;
  tipo_servico_id?: string; // Necessário para filtros
  empresa_fatura_id?: string; // Necessário para validação de cobrança
  empresa_fatura_razao_social?: string; // Nome da empresa para exibição
}

type PeriodFilter =
  | 'mes_atual'
  | 'mes_anterior'
  | 'ultimos_30'
  | 'ultimos_60'
  | 'ultimos_90'
  | 'ultimo_ano'
  | 'personalizado'
  | 'todos';

type SortOption =
  | 'data_desc'
  | 'data_asc'
  | 'paciente_asc'
  | 'paciente_desc'
  | 'valor_desc'
  | 'valor_asc';

interface FinancialConsultationsListProps {
  onConsultationClick?: (consultation: ConsultationWithPatient) => void;
  className?: string;
}

// AI dev note: Componente auxiliar para filtro multi-seleção (profissionais e status)
interface MultiSelectFilterProps {
  items: Array<{ id: string; label: string }>;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  allLabel?: string;
  placeholder?: string;
}

const MultiSelectFilter = React.memo<MultiSelectFilterProps>(
  ({
    items,
    selectedIds,
    onSelectionChange,
    allLabel = 'Todos',
    placeholder,
  }) => {
    const [open, setOpen] = React.useState(false);

    const toggleItem = (itemId: string) => {
      const newSelection = selectedIds.includes(itemId)
        ? selectedIds.filter((id) => id !== itemId)
        : [...selectedIds, itemId];
      onSelectionChange(newSelection);
    };

    const selectAll = () => {
      onSelectionChange([]);
    };

    const isAllSelected = selectedIds.length === 0;

    const getButtonText = () => {
      if (isAllSelected) return placeholder || allLabel;
      if (selectedIds.length === 1) {
        const item = items.find((i) => i.id === selectedIds[0]);
        return item?.label || allLabel;
      }
      return `${selectedIds.length} selecionados`;
    };

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              'w-full justify-between font-normal h-10',
              !isAllSelected && 'border-primary'
            )}
          >
            <span className="truncate text-sm">{getButtonText()}</span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[250px] p-0" align="start">
          <div className="max-h-[300px] overflow-y-auto">
            {/* Opção "Todos" */}
            <div
              className={cn(
                'flex items-center gap-2 px-3 py-2 hover:bg-accent cursor-pointer',
                isAllSelected && 'bg-accent'
              )}
              onClick={selectAll}
            >
              <div
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded border',
                  isAllSelected
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'border-input'
                )}
              >
                {isAllSelected && <Check className="h-3 w-3" />}
              </div>
              <span className="text-sm font-medium">{allLabel}</span>
            </div>

            {/* Lista de itens */}
            {items.map((item) => {
              const isSelected = selectedIds.includes(item.id);
              return (
                <div
                  key={item.id}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 hover:bg-accent cursor-pointer',
                    isSelected && 'bg-accent/50'
                  )}
                  onClick={() => toggleItem(item.id)}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleItem(item.id)}
                    className="pointer-events-none"
                  />
                  <span className="text-sm">{item.label}</span>
                </div>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    );
  }
);

MultiSelectFilter.displayName = 'MultiSelectFilter';

export const FinancialConsultationsList: React.FC<
  FinancialConsultationsListProps
> = ({ onConsultationClick, className }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [consultations, setConsultations] = useState<ConsultationWithPatient[]>(
    []
  );
  const [filteredConsultations, setFilteredConsultations] = useState<
    ConsultationWithPatient[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estados de filtro
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('mes_atual');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  // AI dev note: Agora suporta múltiplos profissionais (array vazio = todos)
  const [professionalFilter, setProfessionalFilter] = useState<string[]>([]);
  // AI dev note: Agora suporta múltiplos tipos de serviço (array vazio = todos)
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string[]>([]);
  const [empresaFilter, setEmpresaFilter] = useState<string>('todos');
  // AI dev note: Agora suporta múltiplos status (array vazio = todos)
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('data_desc');

  // Estados de seleção
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedConsultations, setSelectedConsultations] = useState<string[]>(
    []
  ); // AI dev note: Mantém IDs selecionados entre páginas
  const [isGeneratingCharges, setIsGeneratingCharges] = useState(false);

  // Estados de visualização
  const [viewMode, setViewMode] = useState<'list' | 'grouped'>('grouped'); // AI dev note: Novo modo de visualização agrupado por paciente
  const [expandedPatients, setExpandedPatients] = useState<Set<string>>(
    new Set()
  );

  // AI dev note: Totais calculados a partir de filteredConsultations
  // BUGFIX: Antes usava query separada que ignorava filtros locais (empresa, profissional, etc)
  // Agora calcula dinamicamente baseado nas consultas já filtradas

  // Listas para filtros
  const [professionals, setProfessionals] = useState<
    Array<{ id: string; nome: string }>
  >([]);
  const [serviceTypes, setServiceTypes] = useState<
    Array<{ id: string; nome: string }>
  >([]);
  const [companies, setCompanies] = useState<
    Array<{ id: string; nome: string }>
  >([]);
  // AI dev note: Status de pagamento vindos do Supabase (não mais hardcoded)
  const [paymentStatusOptions, setPaymentStatusOptions] = useState<
    Array<{ id: string; codigo: string; descricao: string }>
  >([]);

  // Função para buscar consultas
  const fetchConsultations = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // AI dev note: Select apenas campos necessários para performance
      const selectFields = `
        id, data_hora, servico_nome, servico_duracao, valor_servico,
        profissional_id, profissional_nome, paciente_id, paciente_nome,
        local_id, local_nome, status_consulta_codigo, status_consulta_nome,
        status_pagamento_codigo, status_pagamento_nome, id_pagamento_externo,
        fatura_id, tipo_servico_id, empresa_fatura_id, empresa_fatura_razao_social
      `;

      // AI dev note: Calcular filtros de período ANTES de buscar count e dados
      const today = new Date();
      let startDateFilter = '';
      let endDateFilter = today.toISOString().split('T')[0];

      switch (periodFilter) {
        case 'mes_atual':
          // Primeiro dia do mês atual
          startDateFilter = new Date(today.getFullYear(), today.getMonth(), 1)
            .toISOString()
            .split('T')[0];
          // Hoje
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
          // AI dev note: Criar nova instância para evitar mutação do objeto today
          startDateFilter = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0];
          break;
        case 'ultimos_60':
          // AI dev note: Criar nova instância para evitar mutação do objeto today
          startDateFilter = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0];
          break;
        case 'ultimos_90':
          // AI dev note: Criar nova instância para evitar mutação do objeto today
          startDateFilter = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0];
          break;
        case 'ultimo_ano':
          // AI dev note: Criar nova instância para evitar mutação do objeto today
          startDateFilter = new Date(
            today.getTime() - 365 * 24 * 60 * 60 * 1000
          )
            .toISOString()
            .split('T')[0];
          break;
        case 'personalizado':
          if (startDate) startDateFilter = startDate;
          if (endDate) endDateFilter = endDate;
          break;
      }

      // AI dev note: Totais agora são calculados via useMemo baseado em filteredConsultations
      // Isso garante que os totais respeitem todos os filtros locais (empresa, profissional, etc)

      // Query de dados com filtros de período
      let query = supabase
        .from('vw_agendamentos_completos')
        .select(selectFields)
        .not('status_consulta_codigo', 'eq', 'cancelado')
        .order('data_hora', { ascending: false });

      // Aplicar filtros de período
      if (startDateFilter && periodFilter !== 'todos') {
        query = query.gte('data_hora', startDateFilter);
      }
      if (endDateFilter && periodFilter !== 'todos') {
        // AI dev note: Incluir fim do dia para garantir que todo o último dia seja contabilizado
        query = query.lte('data_hora', endDateFilter + 'T23:59:59');
      }

      // AI dev note: BUSCAR TODAS as consultas do período sem paginação
      // Os filtros locais (nome, profissional, etc) precisam de todos os dados
      // A paginação será feita apenas na exibição (frontend)

      const { data, error: fetchError } = await query;

      // Sem paginação - todos os registros são buscados

      if (fetchError) throw fetchError;

      // Buscar responsáveis para todos os pacientes
      const pacienteIds = [
        ...new Set((data || []).map((item) => item.paciente_id)),
      ];

      const { data: responsaveisData } = await supabase
        .from('pessoa_responsaveis')
        .select(
          `
          id_pessoa,
          id_responsavel,
          tipo_responsabilidade,
          responsavel:id_responsavel(id, nome)
        `
        )
        .in('id_pessoa', pacienteIds)
        .eq('ativo', true);

      // Criar mapa de responsáveis por paciente
      type ResponsavelInfo = { id: string; nome: string };
      const responsaveisMap = new Map<
        string,
        { legal?: ResponsavelInfo; financeiro?: ResponsavelInfo }
      >();
      (responsaveisData || []).forEach((resp) => {
        if (!responsaveisMap.has(resp.id_pessoa)) {
          responsaveisMap.set(resp.id_pessoa, {});
        }
        const current = responsaveisMap.get(resp.id_pessoa)!;

        // AI dev note: resp.responsavel é um array do Supabase join, pegar o primeiro item
        const responsavelData = Array.isArray(resp.responsavel)
          ? resp.responsavel[0]
          : resp.responsavel;

        if (
          resp.tipo_responsabilidade === 'legal' ||
          resp.tipo_responsabilidade === 'ambos'
        ) {
          current.legal = responsavelData;
        }
        if (
          resp.tipo_responsabilidade === 'financeiro' ||
          resp.tipo_responsabilidade === 'ambos'
        ) {
          current.financeiro = responsavelData;
        }
      });

      // Mapear dados da view para a interface esperada
      const mappedData = (data || []).map((item) => {
        const responsaveis = responsaveisMap.get(item.paciente_id) || {};

        return {
          id: item.id,
          data_hora: item.data_hora,
          servico_nome: item.servico_nome,
          servico_duracao: item.servico_duracao,
          valor_servico: item.valor_servico,
          profissional_id: item.profissional_id,
          profissional_nome: item.profissional_nome,
          paciente_id: item.paciente_id,
          paciente_nome: item.paciente_nome,
          responsavel_legal_id: responsaveis.legal?.id,
          responsavel_legal_nome: responsaveis.legal?.nome,
          responsavel_financeiro_id: responsaveis.financeiro?.id,
          responsavel_financeiro_nome: responsaveis.financeiro?.nome,
          local_id: item.local_id,
          local_nome: item.local_nome,
          status_consulta_codigo: item.status_consulta_codigo,
          status_consulta_nome: item.status_consulta_nome,
          status_pagamento_codigo: item.status_pagamento_codigo,
          status_pagamento_nome: item.status_pagamento_nome,
          id_pagamento_externo: item.id_pagamento_externo,
          fatura_id: item.fatura_id,
          tipo_servico_id: item.tipo_servico_id,
          empresa_fatura_id: item.empresa_fatura_id,
          empresa_fatura_razao_social: item.empresa_fatura_razao_social,
        };
      });

      setConsultations(mappedData);

      // Extrair listas únicas para os filtros
      const uniqueProfessionals = Array.from(
        new Map(
          mappedData
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
          mappedData
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
          mappedData
            .filter((c) => c.empresa_fatura_id && c.empresa_fatura_razao_social)
            .map((c) => [
              c.empresa_fatura_id,
              {
                id: c.empresa_fatura_id!,
                nome: c.empresa_fatura_razao_social!,
              },
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
  }, [periodFilter, startDate, endDate]);

  // Aplicar filtros locais e ordenação
  useEffect(() => {
    let filtered = [...consultations];

    // AI dev note: Filtro de profissional (agora suporta múltiplos - array vazio = todos)
    if (professionalFilter.length > 0) {
      filtered = filtered.filter((c) =>
        professionalFilter.includes(c.profissional_id)
      );
    }

    // AI dev note: Filtro de tipo de serviço (agora suporta múltiplos - array vazio = todos)
    if (serviceTypeFilter.length > 0) {
      filtered = filtered.filter((c) =>
        serviceTypeFilter.includes(c.tipo_servico_id || '')
      );
    }

    // Filtro de empresa
    if (empresaFilter !== 'todos') {
      filtered = filtered.filter((c) => c.empresa_fatura_id === empresaFilter);
    }

    // AI dev note: Filtro de status de pagamento (agora suporta múltiplos - array vazio = todos)
    if (paymentStatusFilter.length > 0) {
      filtered = filtered.filter((c) =>
        paymentStatusFilter.includes(c.status_pagamento_codigo)
      );
    }

    // Filtro de busca
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.paciente_nome?.toLowerCase().includes(query) ||
          c.responsavel_legal_nome?.toLowerCase().includes(query) ||
          c.responsavel_financeiro_nome?.toLowerCase().includes(query)
      );
    }

    // AI dev note: Aplicar ordenação
    switch (sortOption) {
      case 'paciente_asc':
        filtered.sort((a, b) =>
          a.paciente_nome.localeCompare(b.paciente_nome, 'pt-BR')
        );
        break;
      case 'paciente_desc':
        filtered.sort((a, b) =>
          b.paciente_nome.localeCompare(a.paciente_nome, 'pt-BR')
        );
        break;
      case 'data_asc':
        filtered.sort(
          (a, b) =>
            new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime()
        );
        break;
      case 'data_desc':
        filtered.sort(
          (a, b) =>
            new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime()
        );
        break;
      case 'valor_asc':
        filtered.sort((a, b) => a.valor_servico - b.valor_servico);
        break;
      case 'valor_desc':
        filtered.sort((a, b) => b.valor_servico - a.valor_servico);
        break;
    }

    setFilteredConsultations(filtered);
  }, [
    consultations,
    professionalFilter,
    serviceTypeFilter,
    empresaFilter,
    paymentStatusFilter,
    searchQuery,
    sortOption,
  ]);

  // Limpar quando filtros mudarem
  useEffect(() => {
    // Resetar seleções se necessário
  }, [
    periodFilter,
    startDate,
    endDate,
    professionalFilter,
    serviceTypeFilter,
    paymentStatusFilter,
  ]);

  // AI dev note: Calcular totais a partir das consultas FILTRADAS
  // BUGFIX: Antes usava query separada no banco que ignorava filtros locais
  const totalCount = filteredConsultations.length;

  const totalSummary = React.useMemo(() => {
    const totalValue = filteredConsultations.reduce(
      (sum, item) => sum + (item.valor_servico || 0),
      0
    );
    const unpaidCount = filteredConsultations.filter(
      (item) =>
        item.status_pagamento_codigo !== 'pago' &&
        item.status_pagamento_codigo !== 'cancelado'
    ).length;
    const paidCount = filteredConsultations.filter(
      (item) => item.status_pagamento_codigo === 'pago'
    ).length;

    return { totalValue, unpaidCount, paidCount };
  }, [filteredConsultations]);

  // Carregar consultas ao montar
  useEffect(() => {
    fetchConsultations();
  }, [fetchConsultations]);

  // AI dev note: Buscar status de pagamento do Supabase (não mais hardcoded)
  useEffect(() => {
    const fetchPaymentStatusOptions = async () => {
      try {
        const { data, error } = await supabase
          .from('pagamento_status')
          .select('id, codigo, descricao')
          .order('descricao');

        if (error) throw error;

        setPaymentStatusOptions(data || []);
      } catch (err) {
        console.error('Erro ao buscar status de pagamento:', err);
      }
    };

    fetchPaymentStatusOptions();
  }, []);

  // AI dev note: Toggle selecionar/desselecionar todos da PÁGINA ATUAL
  // Mantém seleções de outras páginas intactas
  const toggleSelectAll = () => {
    const eligibleIdsCurrentPage = filteredConsultations
      .filter(
        (c) =>
          c.status_pagamento_codigo !== 'pago' &&
          c.status_pagamento_codigo !== 'cancelado' &&
          !c.fatura_id
      )
      .map((c) => c.id);

    // Verificar se todos da página atual já estão selecionados
    const allCurrentPageSelected = eligibleIdsCurrentPage.every((id) =>
      selectedConsultations.includes(id)
    );

    if (allCurrentPageSelected) {
      // Remover apenas os IDs da página atual
      setSelectedConsultations(
        selectedConsultations.filter(
          (id) => !eligibleIdsCurrentPage.includes(id)
        )
      );
    } else {
      // Adicionar apenas os IDs da página atual que ainda não estão selecionados
      const newIds = eligibleIdsCurrentPage.filter(
        (id) => !selectedConsultations.includes(id)
      );
      setSelectedConsultations([...selectedConsultations, ...newIds]);
    }
  };

  // AI dev note: Selecionar TODAS as consultas não pagas que estão FILTRADAS na tela
  // BUGFIX: Antes fazia query no banco ignorando filtros locais (empresa, profissional, etc)
  // Agora usa filteredConsultations que já tem todos os filtros aplicados
  const selectAllUnpaid = () => {
    // AI dev note: Usar consultas já filtradas localmente (inclui filtro de empresa, profissional, etc)
    const eligibleConsultations = filteredConsultations.filter(
      (c) =>
        c.status_pagamento_codigo !== 'pago' &&
        c.status_pagamento_codigo !== 'cancelado' &&
        !c.fatura_id
    );

    const allUnpaidIds = eligibleConsultations.map((item) => item.id);

    setSelectedConsultations(allUnpaidIds);

    // Construir mensagem indicando filtros aplicados
    const filtersApplied: string[] = [];
    if (empresaFilter !== 'todos') filtersApplied.push('empresa');
    if (professionalFilter.length > 0) filtersApplied.push('profissional');
    if (serviceTypeFilter.length > 0) filtersApplied.push('serviço');
    if (paymentStatusFilter.length > 0) filtersApplied.push('status');

    const filterInfo =
      filtersApplied.length > 0
        ? ` (filtros aplicados: ${filtersApplied.join(', ')})`
        : '';

    toast({
      title: 'Todas selecionadas',
      description: `${allUnpaidIds.length} consultas não pagas foram selecionadas${filterInfo}.`,
    });
  };

  // AI dev note: Agrupar consultas por paciente + empresa (chave composta)
  const groupedByPatient = React.useMemo(() => {
    const groups = new Map<
      string,
      {
        groupKey: string; // AI dev note: Chave composta para usar como React key
        paciente_id: string;
        paciente_nome: string;
        consultas: ConsultationWithPatient[];
        total_valor: number;
        total_consultas: number;
        consultas_nao_pagas: number;
        empresa_fatura_razao_social?: string;
        empresa_fatura_id?: string;
      }
    >();

    filteredConsultations.forEach((consulta) => {
      // AI dev note: Chave composta: paciente_id + empresa_fatura_id
      // Isso permite que o mesmo paciente apareça múltiplas vezes (uma por empresa)
      const groupKey = `${consulta.paciente_id}__${consulta.empresa_fatura_id || 'sem_empresa'}`;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          groupKey, // AI dev note: Salvar a chave para usar como React key
          paciente_id: consulta.paciente_id,
          paciente_nome: consulta.paciente_nome,
          consultas: [],
          total_valor: 0,
          total_consultas: 0,
          consultas_nao_pagas: 0,
          empresa_fatura_razao_social: consulta.empresa_fatura_razao_social,
          empresa_fatura_id: consulta.empresa_fatura_id,
        });
      }

      const group = groups.get(groupKey)!;
      group.consultas.push(consulta);
      group.total_valor += consulta.valor_servico || 0;
      group.total_consultas += 1;
      if (
        consulta.status_pagamento_codigo !== 'pago' &&
        consulta.status_pagamento_codigo !== 'cancelado'
      ) {
        group.consultas_nao_pagas += 1;
      }
    });

    // Ordenar consultas dentro de cada grupo por data (mais recente primeiro)
    groups.forEach((group) => {
      group.consultas.sort(
        (a, b) =>
          new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime()
      );
    });

    return Array.from(groups.values()).sort((a, b) =>
      a.paciente_nome.localeCompare(b.paciente_nome, 'pt-BR')
    );
  }, [filteredConsultations]);

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

  // Selecionar todas consultas de um paciente
  const toggleSelectPatient = (patientId: string) => {
    const patientGroup = groupedByPatient.find(
      (g) => g.paciente_id === patientId
    );
    if (!patientGroup) return;

    const eligibleConsultations = patientGroup.consultas.filter(
      (c) =>
        c.status_pagamento_codigo !== 'pago' &&
        c.status_pagamento_codigo !== 'cancelado' &&
        !c.fatura_id
    );

    const eligibleIds = eligibleConsultations.map((c) => c.id);

    // Verificar se todas as consultas do paciente já estão selecionadas
    const allSelected = eligibleIds.every((id) =>
      selectedConsultations.includes(id)
    );

    if (allSelected) {
      // Remover todas as consultas deste paciente
      setSelectedConsultations(
        selectedConsultations.filter((id) => !eligibleIds.includes(id))
      );
    } else {
      // Adicionar todas as consultas deste paciente
      const newIds = eligibleIds.filter(
        (id) => !selectedConsultations.includes(id)
      );
      setSelectedConsultations([...selectedConsultations, ...newIds]);
    }
  };

  // AI dev note: Cobrança em massa - all-or-nothing por paciente, continua outros se um falhar
  const handleGenerateBulkCharges = async () => {
    if (selectedConsultations.length === 0) {
      toast({
        title: 'Nenhuma consulta selecionada',
        description: 'Selecione pelo menos uma consulta para gerar cobrança.',
        variant: 'destructive',
      });
      return;
    }

    if (!user?.pessoa?.id) {
      toast({
        title: 'Erro de autenticação',
        description: 'Usuário não autenticado.',
        variant: 'destructive',
      });
      return;
    }

    setIsGeneratingCharges(true);

    try {
      // Agrupar consultas por paciente
      const consultationsByPatient = new Map<
        string,
        ConsultationWithPatient[]
      >();

      selectedConsultations.forEach((id) => {
        const consultation = consultations.find((c) => c.id === id);
        if (consultation) {
          const patientId = consultation.paciente_id;
          if (!consultationsByPatient.has(patientId)) {
            consultationsByPatient.set(patientId, []);
          }
          consultationsByPatient.get(patientId)!.push(consultation);
        }
      });

      const results: Array<{
        patientName: string;
        success: boolean;
        error?: string;
      }> = [];

      // Processar paciente por paciente (all-or-nothing por paciente)
      for (const [patientId, patientConsultations] of Array.from(
        consultationsByPatient.entries()
      )) {
        const patientName = patientConsultations[0].paciente_nome;

        try {
          // Validar que todas consultas do paciente têm empresa_fatura_id
          const consultasSemEmpresa = patientConsultations.filter(
            (c) => !c.empresa_fatura_id
          );

          if (consultasSemEmpresa.length > 0) {
            console.error(
              '❌ Consultas sem empresa de faturamento:',
              consultasSemEmpresa.map((c) => ({
                id: c.id,
                data: c.data_hora,
                servico: c.servico_nome,
                empresa_fatura_id: c.empresa_fatura_id,
              }))
            );
            throw new Error(
              `${consultasSemEmpresa.length} consulta(s) do paciente ${patientName} não têm empresa de faturamento configurada. Por favor, edite estas consultas para adicionar a empresa de faturamento.`
            );
          }

          const empresaFaturaIds = [
            ...new Set(patientConsultations.map((c) => c.empresa_fatura_id)),
          ];

          if (empresaFaturaIds.length > 1) {
            throw new Error(
              `As consultas do paciente ${patientName} têm empresas de faturamento diferentes (${empresaFaturaIds.length} empresas). Por favor, selecione consultas da mesma empresa.`
            );
          }

          // AI dev note: REGRA DE NEGÓCIO - responsavel_cobranca_id é a fonte única da verdade
          // - Paciente pode ter VÁRIOS responsáveis financeiros (relações múltiplas)
          // - Mas tem apenas 1 responsavel_cobranca_id (campo direto na tabela pessoas)
          // - Paciente pode ser MAIOR e ainda ter um responsável de cobrança diferente dele
          // - SEMPRE validar e usar o CPF do responsavel_cobranca_id, nunca do paciente
          // - Menores nem sempre têm CPF cadastrado (normal e esperado)
          const { data: patientData, error: patientError } = await supabase
            .from('pessoas')
            .select('id, nome, cpf_cnpj, responsavel_cobranca_id')
            .eq('id', patientId)
            .single();

          if (patientError || !patientData) {
            throw new Error('Dados do paciente não encontrados');
          }

          // Determinar responsável de cobrança (fonte única da verdade)
          const responsibleId =
            patientData.responsavel_cobranca_id || patientId;

          // Buscar dados do responsável de cobrança
          const { data: responsibleData, error: responsibleError } =
            await supabase
              .from('pessoas')
              .select('nome, cpf_cnpj')
              .eq('id', responsibleId)
              .single();

          if (responsibleError || !responsibleData) {
            throw new Error('Dados do responsável de cobrança não encontrados');
          }

          if (!responsibleData.cpf_cnpj) {
            throw new Error(
              `Responsável de cobrança (${responsibleData.nome}) não possui CPF cadastrado`
            );
          }

          // Mapear consultas para formato esperado por generateChargeDescription
          const consultationData: ConsultationData[] = patientConsultations.map(
            (c) => ({
              id: c.id,
              data_hora: c.data_hora,
              servico_nome: c.servico_nome,
              valor_servico: c.valor_servico,
              profissional_nome: c.profissional_nome,
              profissional_id: c.profissional_id,
              tipo_servico_id: c.tipo_servico_id,
            })
          );

          // AI dev note: Usar dados do paciente para descrição (nome e CPF do responsável)
          const patientDataForDescription: PatientData = {
            nome: patientData.nome,
            cpf_cnpj: responsibleData.cpf_cnpj, // CPF do responsável de cobrança
          };

          // Gerar descrição da cobrança
          const description = await generateChargeDescription(
            consultationData,
            patientDataForDescription
          );

          // AI dev note: Usar o mesmo responsibleId já determinado acima
          // Não buscar de novo dos agendamentos pois pode ter inconsistência

          const totalValue = patientConsultations.reduce(
            (sum, c) => sum + (c.valor_servico || 0),
            0
          );

          // Criar dados para processamento
          const paymentData: ProcessPaymentData = {
            consultationIds: patientConsultations.map((c) => c.id),
            patientId,
            responsibleId,
            totalValue,
            description,
          };

          // Processar pagamento (D+1)
          const result = await processPayment(paymentData, user.pessoa.id);

          if (!result.success) {
            throw new Error(result.error || 'Erro ao processar pagamento');
          }

          results.push({ patientName, success: true });
        } catch (patientError) {
          // Falha em um paciente não interrompe os outros
          const errorMessage =
            patientError instanceof Error
              ? patientError.message
              : 'Erro desconhecido';
          console.error(`Erro ao processar ${patientName}:`, patientError);
          results.push({ patientName, success: false, error: errorMessage });
        }
      }

      // Contar sucessos e falhas
      const successes = results.filter((r) => r.success);
      const failures = results.filter((r) => !r.success);

      if (successes.length > 0) {
        const failureDetails =
          failures.length > 0
            ? `\n\nFalhas: ${failures.map((f) => `${f.patientName} (${f.error})`).join(', ')}`
            : '';

        toast({
          title: 'Cobranças processadas',
          description: `✅ ${successes.length} paciente(s) com sucesso${failures.length > 0 ? `\n❌ ${failures.length} com falha` : ''}${failureDetails}`,
        });

        // Limpar seleção e recarregar
        setSelectedConsultations([]);
        setIsSelectionMode(false);
        fetchConsultations();
      } else {
        toast({
          title: 'Erro ao gerar cobranças',
          description: `Todas falharam:\n${failures.map((f) => `${f.patientName}: ${f.error}`).join('\n')}`,
          variant: 'destructive',
        });
      }
    } catch (err) {
      console.error('Erro crítico ao gerar cobranças:', err);
      toast({
        title: 'Erro crítico',
        description: 'Ocorreu um erro inesperado ao processar as cobranças.',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingCharges(false);
    }
  };

  // AI dev note: Função para formatar data SEM conversão de timezone
  // Mantém exatamente como vem do Supabase
  const formatDate = (dateString: string) => {
    if (!dateString) return '--/--/----';
    // Extrair data diretamente da string sem criar objeto Date
    const [datePart] = dateString.split('T');
    const [year, month, day] = datePart.split('-');
    return `${day}/${month}/${year}`;
  };

  // AI dev note: Função para formatar horário SEM conversão de timezone
  // Mantém exatamente como vem do Supabase
  const formatTime = (dataHora: string) => {
    if (!dataHora) {
      return '--:--';
    }
    // Extrair horário diretamente da string sem criar objeto Date
    const timePart = dataHora.includes('T') ? dataHora.split('T')[1] : dataHora;
    const [hour, minute] = timePart.split(':');
    return `${hour}:${minute}`;
  };

  // AI dev note: Função para calcular horário de fim SEM conversão de timezone
  // Mantém exatamente como vem do Supabase
  const calculateEndTime = (dataHora: string, duracaoMinutos?: number) => {
    if (!dataHora || !duracaoMinutos) {
      return '--:--';
    }
    // Extrair horário diretamente da string
    const timePart = dataHora.includes('T') ? dataHora.split('T')[1] : dataHora;
    const [hour, minute] = timePart.split(':');

    // Calcular novo horário
    const totalMinutes =
      parseInt(hour) * 60 + parseInt(minute) + duracaoMinutos;
    const endHour = Math.floor(totalMinutes / 60) % 24;
    const endMinute = totalMinutes % 60;

    return `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
  };

  // AI dev note: Função para formatar valores monetários no padrão brasileiro
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  // Função para obter URL do ASAAS
  const getAsaasPaymentUrl = (paymentId: string): string | null => {
    if (!paymentId?.trim() || !paymentId.startsWith('pay_')) {
      return null;
    }
    return `https://www.asaas.com/i/${paymentId.replace('pay_', '')}`;
  };

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-verde-pipa flex-shrink-0" />
            <span className="text-base md:text-lg">Lista de Consultas</span>
          </CardTitle>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Toggle de visualização */}
            <Button
              variant={viewMode === 'grouped' ? 'default' : 'outline'}
              size="sm"
              onClick={() =>
                setViewMode(viewMode === 'list' ? 'grouped' : 'list')
              }
              className="gap-1"
              title={
                viewMode === 'grouped'
                  ? 'Alternar para lista'
                  : 'Agrupar por paciente'
              }
            >
              {viewMode === 'grouped' ? (
                <>
                  <Users className="h-4 w-4" />
                  <span className="hidden sm:inline">Agrupado</span>
                </>
              ) : (
                <>
                  <List className="h-4 w-4" />
                  <span className="hidden sm:inline">Lista</span>
                </>
              )}
            </Button>

            {isSelectionMode ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsSelectionMode(false);
                    setSelectedConsultations([]);
                  }}
                  className="gap-1"
                >
                  <X className="h-4 w-4" />
                  <span className="hidden sm:inline">Cancelar</span>
                </Button>
                <Button
                  size="sm"
                  onClick={handleGenerateBulkCharges}
                  disabled={
                    selectedConsultations.length === 0 || isGeneratingCharges
                  }
                >
                  <CreditCard className="h-4 w-4 flex-shrink-0" />
                  <span className="ml-1.5 sm:ml-2">
                    <span className="sm:hidden">
                      Gerar ({selectedConsultations.length})
                    </span>
                    <span className="hidden sm:inline">
                      Gerar Cobranças ({selectedConsultations.length})
                    </span>
                  </span>
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsSelectionMode(true)}
              >
                <CheckSquare className="h-4 w-4 flex-shrink-0" />
                <span className="ml-1.5 sm:ml-2">Selecionar</span>
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Filtros */}
        <div className="space-y-4">
          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar paciente, responsável legal ou financeiro..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Linha de filtros */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
            {/* Ordenação */}
            <Select
              value={sortOption}
              onValueChange={(value: SortOption) => setSortOption(value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Ordenar por" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="paciente_asc">Paciente A-Z</SelectItem>
                <SelectItem value="paciente_desc">Paciente Z-A</SelectItem>
                <SelectItem value="data_desc">Data (mais recente)</SelectItem>
                <SelectItem value="data_asc">Data (mais antiga)</SelectItem>
                <SelectItem value="valor_desc">Valor (maior)</SelectItem>
                <SelectItem value="valor_asc">Valor (menor)</SelectItem>
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
                <SelectItem value="ultimos_60">Últimos 60 dias</SelectItem>
                <SelectItem value="ultimos_90">Últimos 90 dias</SelectItem>
                <SelectItem value="ultimo_ano">Último ano</SelectItem>
                <SelectItem value="personalizado">Personalizado</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
              </SelectContent>
            </Select>

            {/* Profissional - Multi-seleção */}
            <MultiSelectFilter
              items={professionals.map((prof) => ({
                id: prof.id,
                label: prof.nome,
              }))}
              selectedIds={professionalFilter}
              onSelectionChange={setProfessionalFilter}
              allLabel="Todos os profissionais"
              placeholder="Profissional"
            />

            {/* Tipo de Serviço - Multi-seleção */}
            <MultiSelectFilter
              items={serviceTypes.map((type) => ({
                id: type.id,
                label: type.nome,
              }))}
              selectedIds={serviceTypeFilter}
              onSelectionChange={setServiceTypeFilter}
              allLabel="Todos os serviços"
              placeholder="Tipo de Serviço"
            />

            {/* Empresa */}
            <Select value={empresaFilter} onValueChange={setEmpresaFilter}>
              <SelectTrigger>
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

            {/* Status de Pagamento - Multi-seleção com dados do Supabase */}
            <MultiSelectFilter
              items={paymentStatusOptions.map((status) => ({
                id: status.codigo,
                label: status.descricao,
              }))}
              selectedIds={paymentStatusFilter}
              onSelectionChange={setPaymentStatusFilter}
              allLabel="Todos os status"
              placeholder="Status de Pagamento"
            />

            {/* Botão de limpar filtros */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPeriodFilter('mes_atual');
                setProfessionalFilter([]);
                setServiceTypeFilter([]);
                setEmpresaFilter('todos');
                setPaymentStatusFilter([]);
                setSearchQuery('');
                setStartDate('');
                setEndDate('');
              }}
            >
              <X className="h-4 w-4 mr-1" />
              Limpar
            </Button>
          </div>

          {/* Datas personalizadas */}
          {periodFilter === 'personalizado' && (
            <div className="flex gap-3 items-center">
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
        </div>

        {/* Ação de selecionar todos quando em modo de seleção */}
        {isSelectionMode && (
          <div className="space-y-3">
            {/* Controles de seleção */}
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Checkbox para página atual */}
              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg flex-1">
                <Checkbox
                  checked={
                    filteredConsultations
                      .filter(
                        (c) =>
                          c.status_pagamento_codigo !== 'pago' &&
                          c.status_pagamento_codigo !== 'cancelado' &&
                          !c.fatura_id
                      )
                      .every((c) => selectedConsultations.includes(c.id)) &&
                    filteredConsultations.filter(
                      (c) =>
                        c.status_pagamento_codigo !== 'pago' &&
                        c.status_pagamento_codigo !== 'cancelado' &&
                        !c.fatura_id
                    ).length > 0
                  }
                  onCheckedChange={toggleSelectAll}
                />
                <span className="text-sm font-medium">
                  Selecionar desta página (
                  {
                    filteredConsultations.filter(
                      (c) =>
                        c.status_pagamento_codigo !== 'pago' &&
                        c.status_pagamento_codigo !== 'cancelado' &&
                        !c.fatura_id
                    ).length
                  }
                  )
                </span>
              </div>

              {/* Botão para selecionar TODAS */}
              <Button
                variant="outline"
                size="sm"
                onClick={selectAllUnpaid}
                disabled={isLoading}
                className="whitespace-nowrap"
              >
                <CheckSquare className="h-4 w-4 mr-2" />
                Selecionar TODAS não pagas
              </Button>
            </div>

            {/* AI dev note: Indicador de seleções ativas entre páginas */}
            {selectedConsultations.length > 0 && (
              <Alert className="bg-verde-pipa/10 border-verde-pipa">
                <CheckSquare className="h-4 w-4 text-verde-pipa" />
                <AlertDescription className="flex items-center justify-between">
                  <span>
                    <strong>{selectedConsultations.length}</strong> consulta(s)
                    selecionada(s). As seleções persistem ao trocar de página.
                  </span>
                  {selectedConsultations.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedConsultations([])}
                      className="ml-2"
                    >
                      <X className="h-3 w-3 mr-1" />
                      Limpar tudo
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Lista de consultas - Visualização Agrupada */}
        {viewMode === 'grouped' &&
        !isLoading &&
        !error &&
        filteredConsultations.length > 0 ? (
          <div className="space-y-3">
            {groupedByPatient.map((patientGroup) => {
              const isExpanded = expandedPatients.has(patientGroup.paciente_id);
              const eligibleConsultations = patientGroup.consultas.filter(
                (c) =>
                  c.status_pagamento_codigo !== 'pago' &&
                  c.status_pagamento_codigo !== 'cancelado' &&
                  !c.fatura_id
              );
              const allPatientConsultationsSelected =
                eligibleConsultations.length > 0 &&
                eligibleConsultations.every((c) =>
                  selectedConsultations.includes(c.id)
                );

              return (
                <Card
                  key={patientGroup.groupKey}
                  className={cn(
                    'overflow-hidden transition-colors',
                    isSelectionMode &&
                      allPatientConsultationsSelected &&
                      'bg-muted/50'
                  )}
                >
                  <div
                    className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() =>
                      !isSelectionMode &&
                      togglePatientExpansion(patientGroup.paciente_id)
                    }
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-2 flex-1">
                        {/* Cabeçalho do paciente */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {isSelectionMode && (
                            <Checkbox
                              checked={allPatientConsultationsSelected}
                              onCheckedChange={() =>
                                toggleSelectPatient(patientGroup.paciente_id)
                              }
                              onClick={(e) => e.stopPropagation()}
                              disabled={eligibleConsultations.length === 0}
                            />
                          )}
                          <User className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                          <h3 className="font-semibold text-lg">
                            {patientGroup.paciente_nome}
                          </h3>
                          {patientGroup.empresa_fatura_razao_social && (
                            <Badge
                              variant="outline"
                              className="bg-blue-500/10 text-blue-700"
                            >
                              <Building2 className="h-3 w-3 mr-1" />
                              {patientGroup.empresa_fatura_razao_social}
                            </Badge>
                          )}
                          <Badge variant="outline">
                            {patientGroup.total_consultas} consulta(s)
                          </Badge>
                          {patientGroup.consultas_nao_pagas > 0 && (
                            <Badge
                              variant="secondary"
                              className="bg-orange-500/10 text-orange-600"
                            >
                              {patientGroup.consultas_nao_pagas} não paga(s)
                            </Badge>
                          )}
                        </div>

                        {/* Valores principais */}
                        <div className="flex flex-wrap gap-4 text-sm">
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-verde-pipa" />
                            <span className="text-muted-foreground">
                              Total:
                            </span>
                            <span className="font-semibold text-verde-pipa">
                              {formatCurrency(patientGroup.total_valor)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="flex-shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePatientExpansion(patientGroup.paciente_id);
                        }}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-5 w-5" />
                        ) : (
                          <ChevronDown className="h-5 w-5" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Detalhamento expandido - Consultas do paciente */}
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-2 border-t bg-muted/20">
                      {patientGroup.consultas.map((consultation) => {
                        const asaasUrl = consultation.id_pagamento_externo
                          ? getAsaasPaymentUrl(
                              consultation.id_pagamento_externo
                            )
                          : null;
                        const canSelect =
                          isSelectionMode &&
                          consultation.status_pagamento_codigo !== 'pago' &&
                          consultation.status_pagamento_codigo !==
                            'cancelado' &&
                          !consultation.fatura_id;

                        return (
                          <div
                            key={consultation.id}
                            className={cn(
                              'flex items-center gap-3 p-3 bg-background rounded-lg transition-colors',
                              canSelect && 'hover:bg-muted/50',
                              selectedConsultations.includes(consultation.id) &&
                                'bg-muted/50',
                              !canSelect && isSelectionMode && 'opacity-50'
                            )}
                          >
                            {isSelectionMode && (
                              <Checkbox
                                checked={selectedConsultations.includes(
                                  consultation.id
                                )}
                                onCheckedChange={(checked) => {
                                  if (!canSelect) return;
                                  if (checked) {
                                    setSelectedConsultations([
                                      ...selectedConsultations,
                                      consultation.id,
                                    ]);
                                  } else {
                                    setSelectedConsultations(
                                      selectedConsultations.filter(
                                        (id) => id !== consultation.id
                                      )
                                    );
                                  }
                                }}
                                disabled={!canSelect}
                              />
                            )}

                            <div
                              className="flex-1 space-y-1 cursor-pointer"
                              onClick={() =>
                                !isSelectionMode &&
                                onConsultationClick?.(consultation)
                              }
                            >
                              {/* Linha 1: Data, Horário e Valor */}
                              <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-3">
                                  <div className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3 text-muted-foreground" />
                                    <span>
                                      {formatDate(consultation.data_hora)}
                                    </span>
                                  </div>
                                  <span>
                                    {formatTime(consultation.data_hora)} -{' '}
                                    {calculateEndTime(
                                      consultation.data_hora,
                                      consultation.servico_duracao
                                    )}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {consultation.servico_nome}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-verde-pipa">
                                    {formatCurrency(
                                      consultation.valor_servico || 0
                                    )}
                                  </span>
                                  <Badge
                                    variant={
                                      consultation.status_pagamento_codigo ===
                                      'pago'
                                        ? 'default'
                                        : consultation.status_pagamento_codigo ===
                                            'pendente'
                                          ? 'secondary'
                                          : consultation.status_pagamento_codigo ===
                                              'aberto'
                                            ? 'outline'
                                            : 'destructive'
                                    }
                                    className="text-xs"
                                  >
                                    {consultation.status_pagamento_nome}
                                  </Badge>
                                </div>
                              </div>

                              {/* Linha 2: Profissional e Local */}
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  <span>{consultation.profissional_nome}</span>
                                </div>
                                {consultation.local_nome && (
                                  <div className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    <span>{consultation.local_nome}</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Ações */}
                            {!isSelectionMode && (
                              <div className="flex items-center gap-1">
                                {asaasUrl && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      window.open(asaasUrl, '_blank');
                                    }}
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() =>
                                    onConsultationClick?.(consultation)
                                  }
                                >
                                  <ChevronRight className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        ) : null}

        {/* Lista de consultas - Visualização Lista */}
        {viewMode === 'list' && isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-8 w-20" />
              </div>
            ))}
          </div>
        ) : viewMode === 'list' && error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : viewMode === 'list' && filteredConsultations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhuma consulta encontrada com os filtros aplicados.
          </div>
        ) : viewMode === 'list' ? (
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {filteredConsultations.map((consultation) => {
              const asaasUrl = consultation.id_pagamento_externo
                ? getAsaasPaymentUrl(consultation.id_pagamento_externo)
                : null;
              // AI dev note: Pode selecionar se não está paga e não tem fatura
              const canSelect =
                isSelectionMode &&
                consultation.status_pagamento_codigo !== 'pago' &&
                consultation.status_pagamento_codigo !== 'cancelado' &&
                !consultation.fatura_id;

              return (
                <div
                  key={consultation.id}
                  className={cn(
                    'flex items-center justify-between p-4 border rounded-lg transition-colors',
                    canSelect && 'hover:bg-muted/50',
                    selectedConsultations.includes(consultation.id) &&
                      'bg-muted/50',
                    !canSelect && isSelectionMode && 'opacity-50'
                  )}
                >
                  <div className="flex items-center gap-4 flex-1">
                    {isSelectionMode && (
                      <Checkbox
                        checked={selectedConsultations.includes(
                          consultation.id
                        )}
                        onCheckedChange={(checked) => {
                          if (!canSelect) return;

                          if (checked) {
                            setSelectedConsultations([
                              ...selectedConsultations,
                              consultation.id,
                            ]);
                          } else {
                            setSelectedConsultations(
                              selectedConsultations.filter(
                                (id) => id !== consultation.id
                              )
                            );
                          }
                        }}
                        disabled={!canSelect}
                      />
                    )}

                    <div
                      className="space-y-2 flex-1 cursor-pointer"
                      onClick={() =>
                        !isSelectionMode && onConsultationClick?.(consultation)
                      }
                    >
                      {/* Primeira linha: Paciente e Valor */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">
                            {consultation.paciente_nome}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-verde-pipa">
                            {formatCurrency(consultation.valor_servico || 0)}
                          </span>
                          <Badge
                            variant={
                              consultation.status_pagamento_codigo === 'pago'
                                ? 'default'
                                : consultation.status_pagamento_codigo ===
                                    'pendente'
                                  ? 'secondary'
                                  : consultation.status_pagamento_codigo ===
                                      'aberto'
                                    ? 'outline'
                                    : 'destructive'
                            }
                          >
                            {consultation.status_pagamento_nome}
                          </Badge>
                        </div>
                      </div>

                      {/* Segunda linha: Data, Horário e Serviço */}
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>{formatDate(consultation.data_hora)}</span>
                        </div>
                        <span>
                          {formatTime(consultation.data_hora)} -{' '}
                          {calculateEndTime(
                            consultation.data_hora,
                            consultation.servico_duracao
                          )}
                        </span>
                        <span>{consultation.servico_nome}</span>
                      </div>

                      {/* Terceira linha: Responsáveis e Local */}
                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        {consultation.responsavel_legal_nome && (
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3 text-muted-foreground" />
                            <span className="text-muted-foreground">
                              Legal:
                            </span>
                            <span>{consultation.responsavel_legal_nome}</span>
                          </div>
                        )}
                        {consultation.responsavel_financeiro_nome && (
                          <div className="flex items-center gap-1">
                            <CreditCard className="h-3 w-3 text-muted-foreground" />
                            <span className="text-muted-foreground">
                              Financeiro:
                            </span>
                            <span>
                              {consultation.responsavel_financeiro_nome}
                            </span>
                          </div>
                        )}
                        {consultation.local_nome && (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            <span>{consultation.local_nome}</span>
                          </div>
                        )}
                      </div>

                      {/* Quarta linha: Profissional */}
                      <div className="flex items-center gap-1 text-sm">
                        <Building2 className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          Profissional:
                        </span>
                        <span>{consultation.profissional_nome}</span>
                      </div>
                    </div>

                    {/* Ações */}
                    {!isSelectionMode && (
                      <div className="flex items-center gap-2">
                        {asaasUrl && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(asaasUrl, '_blank');
                            }}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onConsultationClick?.(consultation)}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {/* Estados vazios para visualização agrupada */}
        {viewMode === 'grouped' && isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="p-4 border rounded-lg space-y-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ))}
          </div>
        ) : viewMode === 'grouped' && error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : viewMode === 'grouped' && filteredConsultations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhuma consulta encontrada com os filtros aplicados.
          </div>
        ) : null}

        {/* Resumo - Totais de TODOS os registros do filtro */}
        {!isLoading && !error && filteredConsultations.length > 0 && (
          <div className="mt-4 p-4 bg-muted/30 rounded-lg">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">
                  Total de consultas:
                </span>
                <p className="font-semibold">{totalCount}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Valor total:</span>
                <p className="font-semibold text-verde-pipa">
                  {formatCurrency(totalSummary.totalValue)}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Não pagas:</span>
                <p className="font-semibold text-orange-500">
                  {totalSummary.unpaidCount}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Pagas:</span>
                <p className="font-semibold text-green-500">
                  {totalSummary.paidCount}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Contador de consultas */}
        {!isLoading && !error && filteredConsultations.length > 0 && (
          <div className="flex items-center justify-center gap-2 mt-4 pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              Exibindo {filteredConsultations.length} de {totalCount} consultas
              {selectedConsultations.length > 0 &&
                ` • ${selectedConsultations.length} selecionadas`}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
