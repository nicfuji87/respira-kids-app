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

type PaymentStatusFilter =
  | 'todos'
  | 'pago'
  | 'pendente'
  | 'aberto'
  | 'cancelado';

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
  const [professionalFilter, setProfessionalFilter] = useState<string>('todos');
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>('todos');
  const [paymentStatusFilter, setPaymentStatusFilter] =
    useState<PaymentStatusFilter>('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('data_desc');

  // Estados de seleção
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedConsultations, setSelectedConsultations] = useState<string[]>(
    []
  ); // AI dev note: Mantém IDs selecionados entre páginas
  const [isGeneratingCharges, setIsGeneratingCharges] = useState(false);

  // Estados de paginação
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const PAGE_SIZE = 100; // AI dev note: 100 consultas por página

  // Estados de totais (todos os registros do filtro, não apenas da página)
  const [totalSummary, setTotalSummary] = useState({
    totalValue: 0,
    unpaidCount: 0,
    paidCount: 0,
  });

  // Listas para filtros
  const [professionals, setProfessionals] = useState<
    Array<{ id: string; nome: string }>
  >([]);
  const [serviceTypes, setServiceTypes] = useState<
    Array<{ id: string; nome: string }>
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
        fatura_id, tipo_servico_id, empresa_fatura_id
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
          startDateFilter = new Date(today.setDate(today.getDate() - 30))
            .toISOString()
            .split('T')[0];
          break;
        case 'ultimos_60':
          startDateFilter = new Date(today.setDate(today.getDate() - 60))
            .toISOString()
            .split('T')[0];
          break;
        case 'ultimos_90':
          startDateFilter = new Date(today.setDate(today.getDate() - 90))
            .toISOString()
            .split('T')[0];
          break;
        case 'ultimo_ano':
          startDateFilter = new Date(today.setFullYear(today.getFullYear() - 1))
            .toISOString()
            .split('T')[0];
          break;
        case 'personalizado':
          if (startDate) startDateFilter = startDate;
          if (endDate) endDateFilter = endDate;
          break;
      }

      // AI dev note: Buscar count COM OS MESMOS FILTROS aplicados
      let countQuery = supabase
        .from('vw_agendamentos_completos')
        .select('*', { count: 'exact', head: true })
        .not('status_consulta_codigo', 'eq', 'cancelado');

      // Aplicar mesmos filtros de período no count
      if (startDateFilter && periodFilter !== 'todos') {
        countQuery = countQuery.gte('data_hora', startDateFilter);
      }
      if (endDateFilter && periodFilter !== 'todos') {
        countQuery = countQuery.lte('data_hora', endDateFilter);
      }

      const { count } = await countQuery;
      setTotalCount(count || 0);

      // AI dev note: Buscar totais usando agregação em lotes (sem limite de 1000)
      let allConsultasQuery = supabase
        .from('vw_agendamentos_completos')
        .select('valor_servico, status_pagamento_codigo')
        .not('status_consulta_codigo', 'eq', 'cancelado');

      // Aplicar mesmos filtros de período
      if (startDateFilter && periodFilter !== 'todos') {
        allConsultasQuery = allConsultasQuery.gte('data_hora', startDateFilter);
      }
      if (endDateFilter && periodFilter !== 'todos') {
        allConsultasQuery = allConsultasQuery.lte('data_hora', endDateFilter);
      }

      // Buscar TODAS as consultas em lotes para evitar limite de 1000
      const allConsultas: Array<{
        valor_servico: string;
        status_pagamento_codigo: string;
      }> = [];
      let currentOffset = 0;
      const batchSize = 1000;
      let hasMoreRecords = true;

      while (hasMoreRecords) {
        const { data: batchData, error: batchError } =
          await allConsultasQuery.range(
            currentOffset,
            currentOffset + batchSize - 1
          );

        if (batchError) {
          console.error('❌ Erro ao buscar lote de consultas:', batchError);
          break;
        }

        if (batchData && batchData.length > 0) {
          allConsultas.push(...batchData);
          currentOffset += batchSize;
          hasMoreRecords = batchData.length === batchSize;
        } else {
          hasMoreRecords = false;
        }
      }

      // Calcular totais com TODOS os registros
      const totalValue = allConsultas.reduce(
        (sum, item) => sum + (parseFloat(item.valor_servico) || 0),
        0
      );
      const unpaidCount = allConsultas.filter(
        (item) =>
          item.status_pagamento_codigo !== 'pago' &&
          item.status_pagamento_codigo !== 'cancelado'
      ).length;
      const paidCount = allConsultas.filter(
        (item) => item.status_pagamento_codigo === 'pago'
      ).length;

      console.log('📊 Totais de Consultas (com lotes):', {
        periodFilter,
        totalRegistros: allConsultas.length,
        totalValue,
        unpaidCount,
        paidCount,
        startDateFilter,
        endDateFilter,
      });

      setTotalSummary({ totalValue, unpaidCount, paidCount });

      // Query de dados com mesmos filtros
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
        query = query.lte('data_hora', endDateFilter);
      }

      // AI dev note: Aplicar paginação
      const from = currentPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.range(from, to);

      const { data, error: fetchError } = await query;

      setHasMore((count || 0) > to + 1);

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
    } catch (err) {
      console.error('Erro ao buscar consultas:', err);
      setError('Erro ao carregar consultas');
    } finally {
      setIsLoading(false);
    }
  }, [periodFilter, startDate, endDate, currentPage]);

  // Aplicar filtros locais e ordenação
  useEffect(() => {
    let filtered = [...consultations];

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

    // Filtro de status de pagamento
    if (paymentStatusFilter !== 'todos') {
      filtered = filtered.filter(
        (c) => c.status_pagamento_codigo === paymentStatusFilter
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
    paymentStatusFilter,
    searchQuery,
    sortOption,
  ]);

  // Resetar página quando filtros mudarem
  useEffect(() => {
    setCurrentPage(0);
  }, [
    periodFilter,
    startDate,
    endDate,
    professionalFilter,
    serviceTypeFilter,
    paymentStatusFilter,
  ]);

  // Carregar consultas ao montar
  useEffect(() => {
    fetchConsultations();
  }, [fetchConsultations]);

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

  // AI dev note: Selecionar TODAS as consultas não pagas de TODAS as páginas
  // Query otimizada que busca apenas IDs
  const selectAllUnpaid = async () => {
    setIsLoading(true);
    try {
      // Buscar apenas IDs de consultas não pagas (query leve)
      let query = supabase
        .from('vw_agendamentos_completos')
        .select('id, status_pagamento_codigo, fatura_id')
        .not('status_consulta_codigo', 'eq', 'cancelado')
        .in('status_pagamento_codigo', ['aberto', 'pendente'])
        .is('fatura_id', null);

      // Aplicar mesmos filtros de período
      const today = new Date();
      let startDateFilter = '';
      let endDateFilter = today.toISOString().split('T')[0];

      switch (periodFilter) {
        case 'mes_atual':
          startDateFilter = new Date(today.getFullYear(), today.getMonth(), 1)
            .toISOString()
            .split('T')[0];
          endDateFilter = today.toISOString().split('T')[0];
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
          startDateFilter = new Date(today.setDate(today.getDate() - 30))
            .toISOString()
            .split('T')[0];
          break;
        case 'ultimos_60':
          startDateFilter = new Date(today.setDate(today.getDate() - 60))
            .toISOString()
            .split('T')[0];
          break;
        case 'ultimos_90':
          startDateFilter = new Date(today.setDate(today.getDate() - 90))
            .toISOString()
            .split('T')[0];
          break;
        case 'ultimo_ano':
          startDateFilter = new Date(today.setFullYear(today.getFullYear() - 1))
            .toISOString()
            .split('T')[0];
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
        query = query.lte('data_hora', endDateFilter);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      const allUnpaidIds = (data || []).map((item) => item.id);

      setSelectedConsultations(allUnpaidIds);

      toast({
        title: 'Todas selecionadas',
        description: `${allUnpaidIds.length} consultas não pagas foram selecionadas.`,
      });
    } catch (err) {
      console.error('Erro ao selecionar todas:', err);
      toast({
        title: 'Erro ao selecionar',
        description: 'Não foi possível selecionar todas as consultas.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
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
          const empresaFaturaIds = [
            ...new Set(
              patientConsultations
                .map((c) => c.empresa_fatura_id)
                .filter(Boolean)
            ),
          ];
          if (empresaFaturaIds.length === 0) {
            throw new Error('Consultas sem empresa de faturamento configurada');
          }
          if (empresaFaturaIds.length > 1) {
            throw new Error('Consultas com empresas de faturamento diferentes');
          }

          // Buscar dados do paciente (CPF)
          const { data: patientData, error: patientError } = await supabase
            .from('pessoas')
            .select('nome, cpf_cnpj')
            .eq('id', patientId)
            .single();

          if (patientError || !patientData) {
            throw new Error('Dados do paciente não encontrados');
          }

          if (!patientData.cpf_cnpj) {
            throw new Error(
              `Paciente ${patientName} não possui CPF cadastrado`
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

          const patientDataForDescription: PatientData = {
            nome: patientData.nome,
            cpf_cnpj: patientData.cpf_cnpj,
          };

          // Gerar descrição da cobrança
          const description = await generateChargeDescription(
            consultationData,
            patientDataForDescription
          );

          // Definir responsável (financeiro > legal > paciente)
          const responsibleId =
            patientConsultations[0].responsavel_financeiro_id ||
            patientConsultations[0].responsavel_legal_id ||
            patientId;

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
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-verde-pipa" />
            Lista de Consultas
          </CardTitle>

          <div className="flex items-center gap-2">
            {isSelectionMode ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsSelectionMode(false);
                    setSelectedConsultations([]);
                  }}
                >
                  <X className="h-4 w-4 mr-1" />
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleGenerateBulkCharges}
                  disabled={
                    selectedConsultations.length === 0 || isGeneratingCharges
                  }
                >
                  <CreditCard className="h-4 w-4 mr-1" />
                  Gerar Cobranças ({selectedConsultations.length})
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsSelectionMode(true)}
              >
                <CheckSquare className="h-4 w-4 mr-1" />
                Selecionar
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
            <Select
              value={paymentStatusFilter}
              onValueChange={(value: PaymentStatusFilter) =>
                setPaymentStatusFilter(value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Status de Pagamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="aberto">Em aberto</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>

            {/* Botão de limpar filtros */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPeriodFilter('mes_atual');
                setProfessionalFilter('todos');
                setServiceTypeFilter('todos');
                setPaymentStatusFilter('todos');
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

        {/* Lista de consultas */}
        {isLoading ? (
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
        ) : error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : filteredConsultations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhuma consulta encontrada com os filtros aplicados.
          </div>
        ) : (
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
        )}

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

        {/* Paginação */}
        {!isLoading && !error && totalCount > PAGE_SIZE && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              Mostrando {currentPage * PAGE_SIZE + 1} -{' '}
              {Math.min((currentPage + 1) * PAGE_SIZE, totalCount)} de{' '}
              {totalCount} consultas
              {selectedConsultations.length > 0 &&
                ` (${selectedConsultations.length} selecionadas)`}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(0)}
                disabled={currentPage === 0}
                title="Primeira página"
              >
                <ChevronRight className="h-4 w-4 rotate-180 mr-1" />
                <ChevronRight className="h-4 w-4 rotate-180 -ml-3" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                disabled={currentPage === 0}
              >
                <ChevronRight className="h-4 w-4 rotate-180 mr-1" />
                Anterior
              </Button>
              <div className="px-3 py-1 text-sm font-medium bg-muted rounded">
                Página {currentPage + 1} de {Math.ceil(totalCount / PAGE_SIZE)}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => p + 1)}
                disabled={!hasMore}
              >
                Próxima
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setCurrentPage(Math.ceil(totalCount / PAGE_SIZE) - 1)
                }
                disabled={!hasMore}
                title="Última página"
              >
                <ChevronRight className="h-4 w-4 ml-1" />
                <ChevronRight className="h-4 w-4 -ml-3" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
