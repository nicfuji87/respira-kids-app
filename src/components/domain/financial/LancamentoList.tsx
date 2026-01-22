import React from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfYear,
  endOfYear,
  subYears,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Search,
  Download,
  FileText,
  Edit,
  ChevronRight,
  Receipt,
  DollarSign,
  Users,
  Eye,
  MoreHorizontal,
  CheckCircle,
  Clock,
  AlertCircle,
  Calendar,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  X,
  Building2,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Badge,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Skeleton,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Tabs,
  TabsList,
  TabsTrigger,
  Separator,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Label,
} from '@/components/primitives';
import { DatePicker } from '@/components/composed/DatePicker';
import { LancamentoForm } from './LancamentoForm';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';

// AI dev note: Lista de lançamentos financeiros com filtros avançados
// Exibe despesas e receitas, permite edição e visualização detalhada
// Mostra status de pagamento das contas relacionadas

interface Lancamento {
  id: string;
  tipo_lancamento: 'despesa' | 'receita';
  numero_documento?: string | null;
  data_emissao: string;
  data_competencia: string;
  descricao: string;
  observacoes?: string | null;
  valor_total: number;
  quantidade_parcelas: number;
  eh_divisao_socios: boolean;
  pessoa_responsavel_id?: string | null;
  fornecedor_id?: string | null;
  categoria_contabil_id?: string;
  status_lancamento: string;
  origem_lancamento: string;
  arquivo_url?: string | null;
  empresa_fatura_id?: string | null;
  created_at: string;
  fornecedor?: {
    nome_razao_social: string;
    nome_fantasia?: string | null;
  } | null;
  categoria?: {
    id: string;
    nome: string;
    codigo: string;
    categoria_pai_id?: string | null;
    categoria_pai?: {
      id: string;
      nome: string;
      codigo: string;
    } | null;
  } | null;
  contas_pagar?: {
    status_pagamento: string;
    data_vencimento: string;
    valor_parcela: number;
    numero_parcela: number;
  }[];
  divisao_socios?: {
    pessoa: {
      nome: string;
    };
    percentual: number;
    valor: number;
  }[];
  criado_por_pessoa?: {
    nome: string;
  } | null;
}

interface Fornecedor {
  id: string;
  nome_razao_social: string;
  nome_fantasia?: string | null;
}

type PeriodoFiltro =
  | 'todos'
  | 'mes_atual'
  | 'mes_anterior'
  | 'ultimos_3_meses'
  | 'ano_atual'
  | 'ano_anterior'
  | 'personalizado';
type SortField = 'data_emissao' | 'valor_total' | 'descricao' | 'fornecedor';
type SortOrder = 'asc' | 'desc';

interface LancamentoListProps {
  tipo?: 'todos' | 'despesa' | 'receita';
  showFilters?: boolean;
  onSelectLancamento?: (lancamento: Lancamento) => void;
  className?: string;
}

export const LancamentoList = React.memo<LancamentoListProps>(
  ({ tipo = 'todos', showFilters = true, onSelectLancamento, className }) => {
    const [tipoAtivo, setTipoAtivo] = React.useState<
      'todos' | 'despesa' | 'receita'
    >(tipo);
    const [lancamentos, setLancamentos] = React.useState<Lancamento[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [selectedStatus, setSelectedStatus] = React.useState<string>('todos');
    const [selectedCategoria, setSelectedCategoria] =
      React.useState<string>('todas');
    const [selectedOrigem, setSelectedOrigem] = React.useState<string>('todas');

    // Novos filtros - Padrão: mês atual ordenado por data mais recente
    const [selectedPeriodo, setSelectedPeriodo] =
      React.useState<PeriodoFiltro>('mes_atual');
    const [dateFrom, setDateFrom] = React.useState<string>('');
    const [dateTo, setDateTo] = React.useState<string>('');
    const [selectedFornecedor, setSelectedFornecedor] =
      React.useState<string>('todos');

    // Ordenação
    const [sortField, setSortField] = React.useState<SortField>('data_emissao');
    const [sortOrder, setSortOrder] = React.useState<SortOrder>('desc');

    // Controle de filtros avançados visíveis
    const [showAdvancedFilters, setShowAdvancedFilters] = React.useState(false);

    // Filtro por categoria principal (nível 1) e grupo/subcategoria (nível 2)
    const [selectedCategoriaPrincipal, setSelectedCategoriaPrincipal] =
      React.useState<string>('todas');

    const [showForm, setShowForm] = React.useState(false);
    const [selectedLancamento, setSelectedLancamento] =
      React.useState<Lancamento | null>(null);
    const [showDetails, setShowDetails] = React.useState(false);
    const [categoriasPrincipais, setCategoriasPrincipais] = React.useState<
      { id: string; nome: string; codigo: string }[]
    >([]);
    const [subcategorias, setSubcategorias] = React.useState<
      { id: string; nome: string; codigo: string; categoria_pai_id: string }[]
    >([]);
    const [fornecedores, setFornecedores] = React.useState<Fornecedor[]>([]);
    // Receitas de agendamentos (igual ao Dashboard)
    const [receitasAgendamentos, setReceitasAgendamentos] = React.useState(0);
    const [isLoadingReceitas, setIsLoadingReceitas] = React.useState(false);
    // Dados do período anterior para comparação
    const [categoriasPeriodoAnterior, setCategoriasPeriodoAnterior] =
      React.useState<Record<string, number>>({});
    const [isLoadingComparativo, setIsLoadingComparativo] =
      React.useState(false);
    const { toast } = useToast();

    // Carregar categorias (separadas por nível) e fornecedores
    React.useEffect(() => {
      const loadCategorias = async () => {
        try {
          const { data, error } = await supabase
            .from('categorias_contabeis')
            .select('id, nome, codigo, nivel, categoria_pai_id')
            .eq('ativo', true)
            .order('nome');

          if (error) throw error;

          // Separar categorias principais (nível 1) e subcategorias/grupos (nível 2)
          const principais = (data || [])
            .filter((c: { nivel: number }) => c.nivel === 1)
            .map((c: { id: string; nome: string; codigo: string }) => ({
              id: c.id,
              nome: c.nome,
              codigo: c.codigo,
            }));

          const subs = (data || [])
            .filter((c: { nivel: number }) => c.nivel === 2)
            .map(
              (c: {
                id: string;
                nome: string;
                codigo: string;
                categoria_pai_id: string;
              }) => ({
                id: c.id,
                nome: c.nome,
                codigo: c.codigo,
                categoria_pai_id: c.categoria_pai_id,
              })
            );

          setCategoriasPrincipais(principais);
          setSubcategorias(subs);
        } catch (error) {
          console.error('Erro ao carregar categorias:', error);
        }
      };

      const loadFornecedores = async () => {
        try {
          const { data, error } = await supabase
            .from('fornecedores')
            .select('id, nome_razao_social, nome_fantasia')
            .eq('ativo', true)
            .order('nome_razao_social');

          if (error) throw error;
          setFornecedores(data || []);
        } catch (error) {
          console.error('Erro ao carregar fornecedores:', error);
        }
      };

      loadCategorias();
      loadFornecedores();
    }, []);

    // Buscar receitas de agendamentos (igual ao Dashboard)
    const loadReceitasAgendamentos = React.useCallback(
      async (dataInicio: string | null, dataFim: string | null) => {
        if (!dataInicio || !dataFim) {
          setReceitasAgendamentos(0);
          return;
        }

        try {
          setIsLoadingReceitas(true);

          // Buscar status "pago"
          const { data: statusPago } = await supabase
            .from('pagamento_status')
            .select('id')
            .eq('codigo', 'pago')
            .single();

          if (!statusPago) {
            setReceitasAgendamentos(0);
            return;
          }

          // Query para agendamentos pagos no período
          const { data, error } = await supabase
            .from('agendamentos')
            .select('valor_servico')
            .gte('data_hora', dataInicio)
            .lte('data_hora', dataFim + 'T23:59:59')
            .eq('ativo', true)
            .eq('status_pagamento_id', statusPago.id);

          if (error) {
            console.error('Erro ao buscar receitas:', error);
            setReceitasAgendamentos(0);
            return;
          }

          const total =
            data?.reduce(
              (sum, a) => sum + (parseFloat(a.valor_servico) || 0),
              0
            ) || 0;

          setReceitasAgendamentos(total);
        } catch (error) {
          console.error('Erro ao buscar receitas:', error);
          setReceitasAgendamentos(0);
        } finally {
          setIsLoadingReceitas(false);
        }
      },
      []
    );

    // Calcular período anterior para comparação
    const getPeriodoAnterior = React.useCallback(
      (
        periodo: PeriodoFiltro,
        dateFrom: string,
        dateTo: string
      ): { from: string | null; to: string | null } | null => {
        const today = new Date();

        switch (periodo) {
          case 'mes_atual': {
            const lastMonth = subMonths(today, 1);
            return {
              from: format(startOfMonth(lastMonth), 'yyyy-MM-dd'),
              to: format(endOfMonth(lastMonth), 'yyyy-MM-dd'),
            };
          }
          case 'mes_anterior': {
            const twoMonthsAgo = subMonths(today, 2);
            return {
              from: format(startOfMonth(twoMonthsAgo), 'yyyy-MM-dd'),
              to: format(endOfMonth(twoMonthsAgo), 'yyyy-MM-dd'),
            };
          }
          case 'ultimos_3_meses': {
            const sixMonthsAgo = subMonths(today, 6);
            const threeMonthsAgo = subMonths(today, 3);
            return {
              from: format(startOfMonth(sixMonthsAgo), 'yyyy-MM-dd'),
              to: format(endOfMonth(threeMonthsAgo), 'yyyy-MM-dd'),
            };
          }
          case 'ano_atual': {
            const lastYear = subYears(today, 1);
            return {
              from: format(startOfYear(lastYear), 'yyyy-MM-dd'),
              to: format(endOfYear(lastYear), 'yyyy-MM-dd'),
            };
          }
          case 'ano_anterior': {
            const twoYearsAgo = subYears(today, 2);
            return {
              from: format(startOfYear(twoYearsAgo), 'yyyy-MM-dd'),
              to: format(endOfYear(twoYearsAgo), 'yyyy-MM-dd'),
            };
          }
          case 'personalizado': {
            if (!dateFrom || !dateTo) return null;
            const fromDate = new Date(dateFrom);
            const toDate = new Date(dateTo);
            const diffDays =
              Math.ceil(
                (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)
              ) + 1;
            const prevFrom = new Date(fromDate);
            prevFrom.setDate(prevFrom.getDate() - diffDays);
            const prevTo = new Date(fromDate);
            prevTo.setDate(prevTo.getDate() - 1);
            return {
              from: format(prevFrom, 'yyyy-MM-dd'),
              to: format(prevTo, 'yyyy-MM-dd'),
            };
          }
          default:
            return null;
        }
      },
      []
    );

    // Buscar dados do período anterior para comparação
    const loadComparativoPeriodoAnterior = React.useCallback(
      async (periodo: PeriodoFiltro, dateFrom: string, dateTo: string) => {
        const periodoAnterior = getPeriodoAnterior(periodo, dateFrom, dateTo);
        if (!periodoAnterior || !periodoAnterior.from || !periodoAnterior.to) {
          setCategoriasPeriodoAnterior({});
          return;
        }

        try {
          setIsLoadingComparativo(true);

          const { data, error } = await supabase
            .from('lancamentos_financeiros')
            .select(
              `
              valor_total,
              categoria:categoria_contabil_id (
                id,
                categoria_pai:categoria_pai_id (
                  id,
                  nome
                )
              )
            `
            )
            .eq('tipo_lancamento', 'despesa')
            .gte('data_competencia', periodoAnterior.from)
            .lte('data_competencia', periodoAnterior.to)
            .in('status_lancamento', ['validado', 'pago']);

          if (error) {
            console.error('Erro ao buscar período anterior:', error);
            setCategoriasPeriodoAnterior({});
            return;
          }

          // Agrupar por categoria principal
          const porCategoria: Record<string, number> = {};

          data?.forEach((l) => {
            if (l.categoria) {
              // Handle array or object from Supabase join
              const catData = Array.isArray(l.categoria)
                ? l.categoria[0]
                : l.categoria;
              const catPai = catData?.categoria_pai || catData;
              const catId = Array.isArray(catPai) ? catPai[0]?.id : catPai?.id;

              if (catId) {
                porCategoria[catId] =
                  (porCategoria[catId] || 0) + (l.valor_total || 0);
              }
            }
          });

          setCategoriasPeriodoAnterior(porCategoria);
        } catch (error) {
          console.error('Erro ao buscar período anterior:', error);
          setCategoriasPeriodoAnterior({});
        } finally {
          setIsLoadingComparativo(false);
        }
      },
      [getPeriodoAnterior]
    );

    // Função para calcular datas do período selecionado
    const getDateRangeForPeriod = React.useCallback(
      (periodo: PeriodoFiltro): { from: string | null; to: string | null } => {
        const today = new Date();

        switch (periodo) {
          case 'mes_atual':
            return {
              from: format(startOfMonth(today), 'yyyy-MM-dd'),
              to: format(endOfMonth(today), 'yyyy-MM-dd'),
            };
          case 'mes_anterior': {
            const lastMonth = subMonths(today, 1);
            return {
              from: format(startOfMonth(lastMonth), 'yyyy-MM-dd'),
              to: format(endOfMonth(lastMonth), 'yyyy-MM-dd'),
            };
          }
          case 'ultimos_3_meses': {
            const threeMonthsAgo = subMonths(today, 3);
            return {
              from: format(startOfMonth(threeMonthsAgo), 'yyyy-MM-dd'),
              to: format(endOfMonth(today), 'yyyy-MM-dd'),
            };
          }
          case 'ano_atual':
            return {
              from: format(startOfYear(today), 'yyyy-MM-dd'),
              to: format(endOfYear(today), 'yyyy-MM-dd'),
            };
          case 'ano_anterior': {
            const lastYear = subYears(today, 1);
            return {
              from: format(startOfYear(lastYear), 'yyyy-MM-dd'),
              to: format(endOfYear(lastYear), 'yyyy-MM-dd'),
            };
          }
          case 'personalizado':
            return {
              from: dateFrom || null,
              to: dateTo || null,
            };
          default:
            return { from: null, to: null };
        }
      },
      [dateFrom, dateTo]
    );

    // Carregar lançamentos
    const loadLancamentos = React.useCallback(async () => {
      try {
        setIsLoading(true);

        let query = supabase.from('lancamentos_financeiros').select(
          `
            *,
            fornecedor:fornecedor_id (
              nome_razao_social,
              nome_fantasia
            ),
            categoria:categoria_contabil_id (
              id,
              nome,
              codigo,
              categoria_pai_id,
              categoria_pai:categoria_pai_id (
                id,
                nome,
                codigo
              )
            ),
            contas_pagar (
              status_pagamento,
              data_vencimento,
              valor_parcela,
              numero_parcela
            ),
            divisao_socios:lancamento_divisao_socios (
              pessoa:pessoa_id (
                nome
              ),
              percentual,
              valor
            ),
            criado_por_pessoa:criado_por (
              nome
            )
          `
        );

        // Filtro por tipo
        if (tipoAtivo !== 'todos') {
          query = query.eq('tipo_lancamento', tipoAtivo);
        }

        // Filtro por status
        if (selectedStatus !== 'todos') {
          query = query.eq('status_lancamento', selectedStatus);
        }

        // Filtro por categoria (subcategoria/grupo)
        if (selectedCategoria !== 'todas') {
          query = query.eq('categoria_contabil_id', selectedCategoria);
        }

        // Filtro por categoria principal - filtra subcategorias que pertencem a ela
        if (
          selectedCategoriaPrincipal !== 'todas' &&
          selectedCategoria === 'todas'
        ) {
          // Buscar todas as subcategorias desta categoria principal
          const subcatsIds = subcategorias
            .filter((s) => s.categoria_pai_id === selectedCategoriaPrincipal)
            .map((s) => s.id);

          if (subcatsIds.length > 0) {
            query = query.in('categoria_contabil_id', subcatsIds);
          }
        }

        // Filtro por origem
        if (selectedOrigem !== 'todas') {
          query = query.eq('origem_lancamento', selectedOrigem);
        }

        // Filtro por fornecedor
        if (selectedFornecedor !== 'todos') {
          query = query.eq('fornecedor_id', selectedFornecedor);
        }

        // Filtro por período
        const dateRange = getDateRangeForPeriod(selectedPeriodo);
        if (dateRange.from) {
          query = query.gte('data_emissao', dateRange.from);
        }
        if (dateRange.to) {
          query = query.lte('data_emissao', dateRange.to);
        }

        // Filtro por termo de busca
        if (searchTerm) {
          query = query.or(
            `descricao.ilike.%${searchTerm}%,numero_documento.ilike.%${searchTerm}%`
          );
        }

        // Ordenação - para fornecedor, fazemos client-side após a query
        if (sortField === 'fornecedor') {
          query = query.order('data_emissao', {
            ascending: sortOrder === 'asc',
          });
        } else {
          query = query.order(sortField, { ascending: sortOrder === 'asc' });
        }

        // Ordenação secundária
        if (sortField !== 'data_emissao') {
          query = query.order('data_emissao', { ascending: false });
        }

        const { data, error } = await query;

        if (error) throw error;

        // Ordenação por fornecedor (client-side)
        let sortedData = data || [];
        if (sortField === 'fornecedor') {
          sortedData = [...sortedData].sort((a, b) => {
            const nomeA =
              a.fornecedor?.nome_fantasia ||
              a.fornecedor?.nome_razao_social ||
              '';
            const nomeB =
              b.fornecedor?.nome_fantasia ||
              b.fornecedor?.nome_razao_social ||
              '';
            const comparison = nomeA.localeCompare(nomeB, 'pt-BR');
            return sortOrder === 'asc' ? comparison : -comparison;
          });
        }

        setLancamentos(sortedData);
      } catch (error) {
        console.error('Erro ao carregar lançamentos:', error);
        toast({
          variant: 'destructive',
          title: 'Erro ao carregar lançamentos',
          description:
            'Não foi possível carregar os lançamentos. Tente novamente.',
        });
      } finally {
        setIsLoading(false);
      }
    }, [
      tipoAtivo,
      selectedStatus,
      selectedCategoria,
      selectedCategoriaPrincipal,
      subcategorias,
      selectedOrigem,
      selectedFornecedor,
      selectedPeriodo,
      getDateRangeForPeriod,
      searchTerm,
      sortField,
      sortOrder,
      toast,
    ]);

    React.useEffect(() => {
      loadLancamentos();
    }, [loadLancamentos]);

    // Carregar receitas de agendamentos quando o período mudar
    React.useEffect(() => {
      const dateRange = getDateRangeForPeriod(selectedPeriodo);
      loadReceitasAgendamentos(dateRange.from, dateRange.to);
      loadComparativoPeriodoAnterior(selectedPeriodo, dateFrom, dateTo);
    }, [
      selectedPeriodo,
      dateFrom,
      dateTo,
      getDateRangeForPeriod,
      loadReceitasAgendamentos,
      loadComparativoPeriodoAnterior,
    ]);

    const handleEdit = (lancamento: Lancamento) => {
      setSelectedLancamento(lancamento);
      setShowForm(true);
    };

    const handleViewDetails = (lancamento: Lancamento) => {
      setSelectedLancamento(lancamento);
      setShowDetails(true);
    };

    const handleFormSuccess = () => {
      setShowForm(false);
      setSelectedLancamento(null);
      loadLancamentos();
    };

    const getStatusBadge = (status: string) => {
      switch (status) {
        case 'pre_lancamento':
          return (
            <Badge variant="secondary">
              <Clock className="mr-1 h-3 w-3" />
              Pré-lançamento
            </Badge>
          );
        case 'validado':
          return (
            <Badge variant="default">
              <CheckCircle className="mr-1 h-3 w-3" />
              Validado
            </Badge>
          );
        case 'cancelado':
          return (
            <Badge variant="destructive">
              <AlertCircle className="mr-1 h-3 w-3" />
              Cancelado
            </Badge>
          );
        default:
          return <Badge variant="outline">{status}</Badge>;
      }
    };

    const getOrigemBadge = (origem: string) => {
      switch (origem) {
        case 'manual':
          return <Badge variant="outline">Manual</Badge>;
        case 'api':
          return <Badge variant="secondary">API</Badge>;
        case 'recorrente':
          return <Badge variant="default">Recorrente</Badge>;
        default:
          return <Badge variant="outline">{origem}</Badge>;
      }
    };

    const getTipoIcon = (tipo: 'despesa' | 'receita') => {
      return tipo === 'despesa' ? (
        <DollarSign className="h-4 w-4 text-red-500" />
      ) : (
        <Receipt className="h-4 w-4 text-green-500" />
      );
    };

    // Contar filtros ativos (excluindo período padrão)
    const countActiveFilters = () => {
      let count = 0;
      if (tipoAtivo !== 'todos') count++;
      if (selectedStatus !== 'todos') count++;
      if (selectedCategoria !== 'todas') count++;
      if (selectedCategoriaPrincipal !== 'todas') count++;
      if (selectedOrigem !== 'todas') count++;
      if (selectedFornecedor !== 'todos') count++;
      // Não contar período padrão (mes_atual) como filtro ativo
      if (selectedPeriodo !== 'todos' && selectedPeriodo !== 'mes_atual')
        count++;
      if (searchTerm) count++;
      return count;
    };

    // Limpar todos os filtros (volta para padrão: mês atual)
    const clearAllFilters = () => {
      setTipoAtivo('todos');
      setSelectedStatus('todos');
      setSelectedCategoria('todas');
      setSelectedCategoriaPrincipal('todas');
      setSelectedOrigem('todas');
      setSelectedFornecedor('todos');
      setSelectedPeriodo('mes_atual'); // Padrão é mês atual
      setDateFrom('');
      setDateTo('');
      setSearchTerm('');
      setSortField('data_emissao');
      setSortOrder('desc');
    };

    // Label do período para exibição
    const getPeriodoLabel = (periodo: PeriodoFiltro) => {
      switch (periodo) {
        case 'mes_atual':
          return 'Mês Atual';
        case 'mes_anterior':
          return 'Mês Anterior';
        case 'ultimos_3_meses':
          return 'Últimos 3 Meses';
        case 'ano_atual':
          return 'Ano Atual';
        case 'ano_anterior':
          return 'Ano Anterior';
        case 'personalizado':
          return 'Personalizado';
        default:
          return 'Todos os períodos';
      }
    };

    // Label do campo de ordenação
    const getSortFieldLabel = (field: SortField) => {
      switch (field) {
        case 'data_emissao':
          return 'Data';
        case 'valor_total':
          return 'Valor';
        case 'descricao':
          return 'Descrição';
        case 'fornecedor':
          return 'Fornecedor';
        default:
          return 'Data';
      }
    };

    // Toggle ordenação
    const toggleSort = (field: SortField) => {
      if (sortField === field) {
        setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
      } else {
        setSortField(field);
        setSortOrder(
          field === 'descricao' || field === 'fornecedor' ? 'asc' : 'desc'
        );
      }
    };

    // Ícone de ordenação
    const getSortIcon = (field: SortField) => {
      if (sortField !== field) {
        return <ArrowUpDown className="h-4 w-4 text-muted-foreground" />;
      }
      return sortOrder === 'asc' ? (
        <ArrowUp className="h-4 w-4 text-primary" />
      ) : (
        <ArrowDown className="h-4 w-4 text-primary" />
      );
    };

    // Calcular resumo dos filtros
    const activeFilters = countActiveFilters();

    // Calcular totais e estatísticas
    // AI dev note: Receitas vêm de agendamentos (igual Dashboard), Despesas de lançamentos
    const resumoFinanceiro = React.useMemo(() => {
      const totalDespesas = lancamentos
        .filter((l) => l.tipo_lancamento === 'despesa')
        .reduce((sum, l) => sum + l.valor_total, 0);

      // Receitas vêm de agendamentos pagos (igual ao Dashboard)
      const totalReceitas = receitasAgendamentos;

      const saldo = totalReceitas - totalDespesas;

      // Agrupar por categoria principal
      const porCategoriaPrincipal: Record<
        string,
        { nome: string; total: number; count: number }
      > = {};

      lancamentos.forEach((l) => {
        if (l.categoria) {
          // Se tem categoria pai (é subcategoria), usar a pai
          // Se não tem pai (é categoria principal), usar ela mesma
          const catPai = l.categoria.categoria_pai || l.categoria;
          const catId = catPai.id;
          const catNome = catPai.nome;

          if (!porCategoriaPrincipal[catId]) {
            porCategoriaPrincipal[catId] = {
              nome: catNome,
              total: 0,
              count: 0,
            };
          }
          porCategoriaPrincipal[catId].total += l.valor_total;
          porCategoriaPrincipal[catId].count += 1;
        }
      });

      // Ordenar por valor total e adicionar comparativo
      const categoriasOrdenadas = Object.entries(porCategoriaPrincipal)
        .map(([id, data]) => {
          const valorAnterior = categoriasPeriodoAnterior[id] || 0;
          const variacao = data.total - valorAnterior;
          const percentualVariacao =
            valorAnterior > 0 ? (variacao / valorAnterior) * 100 : 0;

          return {
            id,
            ...data,
            valorAnterior,
            variacao,
            percentualVariacao,
          };
        })
        .sort((a, b) => b.total - a.total);

      return {
        totalDespesas,
        totalReceitas,
        saldo,
        porCategoriaPrincipal: categoriasOrdenadas,
      };
    }, [lancamentos, receitasAgendamentos, categoriasPeriodoAnterior]);

    // Formatar moeda
    const formatCurrency = (value: number) => {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(value);
    };

    // Subcategorias filtradas pela categoria principal selecionada
    const subcategoriasFiltradas = React.useMemo(() => {
      if (selectedCategoriaPrincipal === 'todas') {
        return subcategorias;
      }
      return subcategorias.filter(
        (s) => s.categoria_pai_id === selectedCategoriaPrincipal
      );
    }, [subcategorias, selectedCategoriaPrincipal]);

    const getPaymentStatus = (contas: Lancamento['contas_pagar']) => {
      if (!contas || contas.length === 0) return null;

      const pendentes = contas.filter(
        (c) => c.status_pagamento === 'pendente'
      ).length;
      const pagas = contas.filter((c) => c.status_pagamento === 'pago').length;
      const vencidas = contas.filter(
        (c) =>
          c.status_pagamento === 'pendente' &&
          new Date(c.data_vencimento) < new Date()
      ).length;

      if (vencidas > 0) {
        return (
          <Badge variant="destructive">
            <AlertCircle className="mr-1 h-3 w-3" />
            {vencidas} vencida{vencidas > 1 ? 's' : ''}
          </Badge>
        );
      }

      if (pendentes > 0 && pagas > 0) {
        return (
          <Badge variant="secondary">
            {pagas}/{contas.length} pagas
          </Badge>
        );
      }

      if (pagas === contas.length) {
        return (
          <Badge variant="outline" className="text-green-600">
            <CheckCircle className="mr-1 h-3 w-3" />
            Quitado
          </Badge>
        );
      }

      return (
        <Badge variant="secondary">
          <Clock className="mr-1 h-3 w-3" />A pagar
        </Badge>
      );
    };

    const handleExportCSV = async () => {
      try {
        // Criar cabeçalho CSV
        const headers = [
          'Data Emissão',
          'Data Competência',
          'Tipo',
          'Número Documento',
          'Fornecedor/Cliente',
          'Descrição',
          'Categoria',
          'Valor Total',
          'Parcelas',
          'Status',
          'Divisão Sócios',
          'Observações',
        ];

        // Criar linhas CSV
        const rows = lancamentos.map((lancamento) => [
          format(new Date(lancamento.data_emissao), 'dd/MM/yyyy'),
          format(new Date(lancamento.data_competencia), 'dd/MM/yyyy'),
          lancamento.tipo_lancamento === 'despesa' ? 'Despesa' : 'Receita',
          lancamento.numero_documento || '',
          lancamento.fornecedor?.nome_fantasia ||
            lancamento.fornecedor?.nome_razao_social ||
            '',
          lancamento.descricao,
          lancamento.categoria?.nome || '',
          new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
          }).format(lancamento.valor_total),
          lancamento.quantidade_parcelas.toString(),
          lancamento.status_lancamento,
          lancamento.eh_divisao_socios ? 'Sim' : 'Não',
          lancamento.observacoes || '',
        ]);

        // Montar CSV
        const csvContent = [
          headers.join(';'),
          ...rows.map((row) => row.join(';')),
        ].join('\n');

        // Criar blob e download
        const blob = new Blob(['\ufeff' + csvContent], {
          type: 'text/csv;charset=utf-8;',
        });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `lancamentos_${format(new Date(), 'yyyy-MM-dd')}.csv`;
        link.click();

        toast({
          title: 'Exportação concluída',
          description: 'Arquivo CSV gerado com sucesso.',
        });
      } catch (error) {
        console.error('Erro ao exportar:', error);
        toast({
          variant: 'destructive',
          title: 'Erro na exportação',
          description: 'Não foi possível gerar o arquivo CSV.',
        });
      }
    };

    return (
      <>
        <Card className={className}>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Lançamentos Financeiros</CardTitle>
                <CardDescription>
                  Gerencie despesas e receitas da clínica
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCSV}
                  disabled={lancamentos.length === 0}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Exportar
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setSelectedLancamento(null);
                    setShowForm(true);
                  }}
                >
                  <DollarSign className="mr-2 h-4 w-4" />
                  Novo Lançamento
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Filtros */}
            {showFilters && (
              <div className="space-y-4">
                {/* Tabs por tipo */}
                <Tabs
                  value={tipoAtivo}
                  onValueChange={(value) =>
                    setTipoAtivo(value as 'todos' | 'despesa' | 'receita')
                  }
                  className="w-full"
                >
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="todos">Todos</TabsTrigger>
                    <TabsTrigger value="despesa">
                      <DollarSign className="mr-2 h-4 w-4 text-red-500" />
                      Despesas
                    </TabsTrigger>
                    <TabsTrigger value="receita">
                      <Receipt className="mr-2 h-4 w-4 text-green-500" />
                      Receitas
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                {/* Linha principal de filtros */}
                <div className="grid gap-4 md:grid-cols-5">
                  {/* Busca */}
                  <div className="md:col-span-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Buscar por descrição ou documento..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>

                  {/* Período */}
                  <Select
                    value={selectedPeriodo}
                    onValueChange={(value) =>
                      setSelectedPeriodo(value as PeriodoFiltro)
                    }
                  >
                    <SelectTrigger>
                      <Calendar className="mr-2 h-4 w-4" />
                      <SelectValue placeholder="Período" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os períodos</SelectItem>
                      <SelectItem value="mes_atual">Mês Atual</SelectItem>
                      <SelectItem value="mes_anterior">Mês Anterior</SelectItem>
                      <SelectItem value="ultimos_3_meses">
                        Últimos 3 Meses
                      </SelectItem>
                      <SelectItem value="ano_atual">Ano Atual</SelectItem>
                      <SelectItem value="ano_anterior">Ano Anterior</SelectItem>
                      <SelectItem value="personalizado">
                        Personalizado
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Ordenação */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="justify-start">
                        <ArrowUpDown className="mr-2 h-4 w-4" />
                        {getSortFieldLabel(sortField)}
                        {sortOrder === 'asc' ? (
                          <ArrowUp className="ml-1 h-3 w-3" />
                        ) : (
                          <ArrowDown className="ml-1 h-3 w-3" />
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56" align="start">
                      <div className="space-y-2">
                        <h4 className="font-medium text-sm">Ordenar por</h4>
                        <div className="space-y-1">
                          <Button
                            variant={
                              sortField === 'data_emissao'
                                ? 'secondary'
                                : 'ghost'
                            }
                            size="sm"
                            className="w-full justify-between"
                            onClick={() => toggleSort('data_emissao')}
                          >
                            Data
                            {getSortIcon('data_emissao')}
                          </Button>
                          <Button
                            variant={
                              sortField === 'valor_total'
                                ? 'secondary'
                                : 'ghost'
                            }
                            size="sm"
                            className="w-full justify-between"
                            onClick={() => toggleSort('valor_total')}
                          >
                            Valor
                            {getSortIcon('valor_total')}
                          </Button>
                          <Button
                            variant={
                              sortField === 'descricao' ? 'secondary' : 'ghost'
                            }
                            size="sm"
                            className="w-full justify-between"
                            onClick={() => toggleSort('descricao')}
                          >
                            Descrição (A-Z)
                            {getSortIcon('descricao')}
                          </Button>
                          <Button
                            variant={
                              sortField === 'fornecedor' ? 'secondary' : 'ghost'
                            }
                            size="sm"
                            className="w-full justify-between"
                            onClick={() => toggleSort('fornecedor')}
                          >
                            Fornecedor (A-Z)
                            {getSortIcon('fornecedor')}
                          </Button>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>

                  {/* Botão Filtros Avançados */}
                  <Button
                    variant={showAdvancedFilters ? 'secondary' : 'outline'}
                    onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                    className="relative"
                  >
                    <Filter className="mr-2 h-4 w-4" />
                    Filtros
                    {activeFilters > 0 && (
                      <Badge
                        variant="destructive"
                        className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-xs"
                      >
                        {activeFilters}
                      </Badge>
                    )}
                  </Button>
                </div>

                {/* Datas personalizadas - aparece quando selecionado "personalizado" */}
                {selectedPeriodo === 'personalizado' && (
                  <div className="grid gap-4 md:grid-cols-4 items-end p-4 bg-muted/50 rounded-lg border">
                    <div className="space-y-2">
                      <Label className="text-sm">Data Inicial</Label>
                      <DatePicker
                        value={dateFrom}
                        onChange={setDateFrom}
                        placeholder="De..."
                        disableFuture
                        startYear={2020}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">Data Final</Label>
                      <DatePicker
                        value={dateTo}
                        onChange={setDateTo}
                        placeholder="Até..."
                        disableFuture
                        startYear={2020}
                      />
                    </div>
                    <div className="md:col-span-2 text-sm text-muted-foreground flex items-center">
                      <Calendar className="mr-2 h-4 w-4" />
                      {dateFrom && dateTo ? (
                        <>
                          Exibindo de{' '}
                          {format(
                            new Date(dateFrom + 'T00:00:00'),
                            "dd 'de' MMMM 'de' yyyy",
                            { locale: ptBR }
                          )}{' '}
                          até{' '}
                          {format(
                            new Date(dateTo + 'T00:00:00'),
                            "dd 'de' MMMM 'de' yyyy",
                            { locale: ptBR }
                          )}
                        </>
                      ) : (
                        'Selecione o período desejado'
                      )}
                    </div>
                  </div>
                )}

                {/* Filtros avançados */}
                {showAdvancedFilters && (
                  <div className="p-4 bg-muted/50 rounded-lg border space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-sm flex items-center gap-2">
                        <Filter className="h-4 w-4" />
                        Filtros Avançados
                      </h4>
                      {activeFilters > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={clearAllFilters}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="mr-1 h-3 w-3" />
                          Limpar filtros
                        </Button>
                      )}
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      {/* Status */}
                      <div className="space-y-2">
                        <Label className="text-sm">Status</Label>
                        <Select
                          value={selectedStatus}
                          onValueChange={setSelectedStatus}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todos">
                              Todos os status
                            </SelectItem>
                            <SelectItem value="pre_lancamento">
                              Pré-lançamento
                            </SelectItem>
                            <SelectItem value="validado">Validado</SelectItem>
                            <SelectItem value="cancelado">Cancelado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Categoria Principal (Nível 1) */}
                      <div className="space-y-2">
                        <Label className="text-sm">Categoria</Label>
                        <Select
                          value={selectedCategoriaPrincipal}
                          onValueChange={(value) => {
                            setSelectedCategoriaPrincipal(value);
                            // Limpar subcategoria ao mudar categoria principal
                            if (value !== 'todas') {
                              setSelectedCategoria('todas');
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Categoria" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todas">
                              Todas as categorias
                            </SelectItem>
                            {categoriasPrincipais.map((cat) => (
                              <SelectItem key={cat.id} value={cat.id}>
                                {cat.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Grupo/Subcategoria (Nível 2) */}
                      <div className="space-y-2">
                        <Label className="text-sm">Grupo</Label>
                        <Select
                          value={selectedCategoria}
                          onValueChange={setSelectedCategoria}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Grupo" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todas">
                              Todos os grupos
                            </SelectItem>
                            {subcategoriasFiltradas.map((cat) => (
                              <SelectItem key={cat.id} value={cat.id}>
                                {cat.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      {/* Fornecedor */}
                      <div className="space-y-2">
                        <Label className="text-sm">Fornecedor</Label>
                        <Select
                          value={selectedFornecedor}
                          onValueChange={setSelectedFornecedor}
                        >
                          <SelectTrigger>
                            <Building2 className="mr-2 h-4 w-4" />
                            <SelectValue placeholder="Fornecedor" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todos">
                              Todos os fornecedores
                            </SelectItem>
                            {fornecedores.map((fornecedor) => (
                              <SelectItem
                                key={fornecedor.id}
                                value={fornecedor.id}
                              >
                                {fornecedor.nome_fantasia ||
                                  fornecedor.nome_razao_social}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Origem */}
                      <div className="space-y-2">
                        <Label className="text-sm">Origem</Label>
                        <Select
                          value={selectedOrigem}
                          onValueChange={setSelectedOrigem}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Origem" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todas">
                              Todas as origens
                            </SelectItem>
                            <SelectItem value="manual">Manual</SelectItem>
                            <SelectItem value="api">API</SelectItem>
                            <SelectItem value="api_ia">API IA</SelectItem>
                            <SelectItem value="recorrente">
                              Recorrente
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Resumo Financeiro */}
                {!isLoading && lancamentos.length > 0 && (
                  <div className="p-4 bg-muted/30 rounded-lg border space-y-4">
                    {/* Linha de totais */}
                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="text-center p-3 bg-background rounded-lg border">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">
                          Lançamentos
                        </div>
                        <div className="text-2xl font-bold">
                          {lancamentos.length}
                        </div>
                      </div>
                      <div className="text-center p-3 bg-background rounded-lg border">
                        <div className="text-xs text-red-600 uppercase tracking-wide">
                          Total Despesas
                        </div>
                        <div className="text-xl font-bold text-red-600">
                          {formatCurrency(resumoFinanceiro.totalDespesas)}
                        </div>
                        {resumoFinanceiro.totalReceitas > 0 && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {(
                              (resumoFinanceiro.totalDespesas /
                                resumoFinanceiro.totalReceitas) *
                              100
                            ).toFixed(1)}
                            % das receitas
                          </div>
                        )}
                      </div>
                      <div className="text-center p-3 bg-background rounded-lg border">
                        <div className="text-xs text-green-600 uppercase tracking-wide">
                          Receitas (Consultas)
                        </div>
                        <div className="text-xl font-bold text-green-600">
                          {isLoadingReceitas ? (
                            <span className="text-muted-foreground">...</span>
                          ) : (
                            formatCurrency(resumoFinanceiro.totalReceitas)
                          )}
                        </div>
                      </div>
                      <div className="text-center p-3 bg-background rounded-lg border">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">
                          Saldo
                        </div>
                        <div
                          className={`text-xl font-bold ${resumoFinanceiro.saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}
                        >
                          {formatCurrency(resumoFinanceiro.saldo)}
                        </div>
                      </div>
                    </div>

                    {/* Valores por Categoria Principal */}
                    {resumoFinanceiro.porCategoriaPrincipal.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                          Por Categoria Principal
                          {isLoadingComparativo && (
                            <span className="ml-2 text-xs">
                              (carregando comparativo...)
                            </span>
                          )}
                        </h4>
                        <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-6">
                          {resumoFinanceiro.porCategoriaPrincipal.map((cat) => {
                            const temComparativo = cat.valorAnterior > 0;
                            const isAumento = cat.variacao > 0;
                            const isReducao = cat.variacao < 0;
                            const percentualSobreReceita =
                              resumoFinanceiro.totalReceitas > 0
                                ? (cat.total / resumoFinanceiro.totalReceitas) *
                                  100
                                : 0;

                            return (
                              <div
                                key={cat.id}
                                className="p-2 bg-background rounded border text-sm"
                              >
                                <div className="font-medium truncate mb-1">
                                  {cat.nome}
                                </div>
                                <div className="space-y-1">
                                  <div className="flex justify-between items-center">
                                    <span className="text-xs text-muted-foreground">
                                      {cat.count}x
                                    </span>
                                    <span className="font-medium text-foreground">
                                      {formatCurrency(cat.total)}
                                    </span>
                                  </div>
                                  {resumoFinanceiro.totalReceitas > 0 && (
                                    <div className="text-xs text-muted-foreground">
                                      {percentualSobreReceita.toFixed(1)}% das
                                      receitas
                                    </div>
                                  )}
                                  {temComparativo && (
                                    <div className="pt-1 border-t border-muted">
                                      <div className="flex justify-between items-center text-xs">
                                        <span className="text-muted-foreground">
                                          Período anterior:
                                        </span>
                                        <span className="text-muted-foreground">
                                          {formatCurrency(cat.valorAnterior)}
                                        </span>
                                      </div>
                                      <div className="flex justify-between items-center text-xs mt-0.5">
                                        <span className="text-muted-foreground">
                                          Variação:
                                        </span>
                                        <span
                                          className={`font-medium ${
                                            isAumento
                                              ? 'text-red-600'
                                              : isReducao
                                                ? 'text-green-600'
                                                : 'text-muted-foreground'
                                          }`}
                                        >
                                          {isAumento ? '+' : ''}
                                          {cat.percentualVariacao.toFixed(1)}%
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Resumo dos resultados e filtros ativos */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">
                      {isLoading ? (
                        'Carregando...'
                      ) : (
                        <>
                          <strong>{lancamentos.length}</strong> lançamento
                          {lancamentos.length !== 1 ? 's' : ''} encontrado
                          {lancamentos.length !== 1 ? 's' : ''}
                        </>
                      )}
                    </span>
                    {selectedPeriodo !== 'todos' && (
                      <Badge variant="secondary" className="font-normal">
                        <Calendar className="mr-1 h-3 w-3" />
                        {getPeriodoLabel(selectedPeriodo)}
                      </Badge>
                    )}
                  </div>

                  {/* Chips de filtros ativos */}
                  <div className="flex flex-wrap items-center gap-2">
                    {searchTerm && (
                      <Badge variant="outline" className="gap-1">
                        <Search className="h-3 w-3" />"{searchTerm}"
                        <button
                          onClick={() => setSearchTerm('')}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    )}
                    {selectedCategoriaPrincipal !== 'todas' && (
                      <Badge variant="outline" className="gap-1">
                        Categoria:{' '}
                        {
                          categoriasPrincipais.find(
                            (c) => c.id === selectedCategoriaPrincipal
                          )?.nome
                        }
                        <button
                          onClick={() => setSelectedCategoriaPrincipal('todas')}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    )}
                    {selectedCategoria !== 'todas' && (
                      <Badge variant="outline" className="gap-1">
                        Grupo:{' '}
                        {subcategorias.find((c) => c.id === selectedCategoria)
                          ?.nome ||
                          categoriasPrincipais.find(
                            (c) => c.id === selectedCategoria
                          )?.nome}
                        <button
                          onClick={() => setSelectedCategoria('todas')}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    )}
                    {selectedFornecedor !== 'todos' && (
                      <Badge variant="outline" className="gap-1">
                        <Building2 className="h-3 w-3" />
                        {fornecedores.find((f) => f.id === selectedFornecedor)
                          ?.nome_fantasia ||
                          fornecedores.find((f) => f.id === selectedFornecedor)
                            ?.nome_razao_social}
                        <button
                          onClick={() => setSelectedFornecedor('todos')}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    )}
                    {selectedStatus !== 'todos' && (
                      <Badge variant="outline" className="gap-1">
                        {selectedStatus === 'pre_lancamento'
                          ? 'Pré-lançamento'
                          : selectedStatus === 'validado'
                            ? 'Validado'
                            : 'Cancelado'}
                        <button
                          onClick={() => setSelectedStatus('todos')}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    )}
                    {selectedOrigem !== 'todas' && (
                      <Badge variant="outline" className="gap-1">
                        Origem: {selectedOrigem}
                        <button
                          onClick={() => setSelectedOrigem('todas')}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Lista de Lançamentos */}
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : lancamentos.length === 0 ? (
              <div className="flex min-h-[400px] flex-col items-center justify-center text-center">
                <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-medium">
                  Nenhum lançamento encontrado
                </h3>
                <p className="mb-4 max-w-sm text-sm text-muted-foreground">
                  {searchTerm ||
                  selectedStatus !== 'todos' ||
                  selectedCategoria !== 'todas'
                    ? 'Tente ajustar os filtros de busca.'
                    : 'Comece cadastrando um novo lançamento financeiro.'}
                </p>
                {!searchTerm &&
                  selectedStatus === 'todos' &&
                  selectedCategoria === 'todas' && (
                    <Button
                      onClick={() => {
                        setSelectedLancamento(null);
                        setShowForm(true);
                      }}
                    >
                      <DollarSign className="mr-2 h-4 w-4" />
                      Novo Lançamento
                    </Button>
                  )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">Tipo</TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => toggleSort('data_emissao')}
                      >
                        <div className="flex items-center gap-1">
                          Data
                          {getSortIcon('data_emissao')}
                        </div>
                      </TableHead>
                      <TableHead>Documento</TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => toggleSort('descricao')}
                      >
                        <div className="flex items-center gap-1">
                          Descrição
                          {getSortIcon('descricao')}
                        </div>
                      </TableHead>
                      <TableHead>Observações</TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => toggleSort('fornecedor')}
                      >
                        <div className="flex items-center gap-1">
                          Fornecedor/Cliente
                          {getSortIcon('fornecedor')}
                        </div>
                      </TableHead>
                      <TableHead>Categoria / Grupo</TableHead>
                      <TableHead
                        className="text-right cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => toggleSort('valor_total')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Valor
                          {getSortIcon('valor_total')}
                        </div>
                      </TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Pagamento</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lancamentos.map((lancamento) => (
                      <TableRow key={lancamento.id}>
                        <TableCell>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                {getTipoIcon(lancamento.tipo_lancamento)}
                              </TooltipTrigger>
                              <TooltipContent>
                                {lancamento.tipo_lancamento === 'despesa'
                                  ? 'Despesa'
                                  : 'Receita'}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">
                              {format(
                                new Date(lancamento.data_emissao),
                                'dd/MM/yyyy'
                              )}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Competência:{' '}
                              {format(
                                new Date(lancamento.data_competencia),
                                'MM/yyyy'
                              )}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            {lancamento.numero_documento ? (
                              <span className="text-sm">
                                {lancamento.numero_documento}
                              </span>
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                -
                              </span>
                            )}
                            <div className="flex gap-1 mt-1">
                              {getOrigemBadge(lancamento.origem_lancamento)}
                              {lancamento.arquivo_url && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <FileText className="h-3 w-3 text-muted-foreground" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      Documento anexado
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium line-clamp-1">
                              {lancamento.descricao}
                            </span>
                            {lancamento.eh_divisao_socios && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Users className="h-3 w-3" />
                                Divisão entre sócios
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          {lancamento.observacoes ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-sm text-muted-foreground line-clamp-2 cursor-help">
                                    {lancamento.observacoes}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-sm">
                                  <p>{lancamento.observacoes}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              -
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {lancamento.fornecedor ? (
                            <span className="text-sm">
                              {lancamento.fornecedor.nome_fantasia ||
                                lancamento.fornecedor.nome_razao_social}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              -
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {lancamento.categoria ? (
                            <div className="flex flex-col gap-1">
                              {/* Categoria Principal */}
                              {lancamento.categoria.categoria_pai ? (
                                <>
                                  <Badge
                                    variant="secondary"
                                    className="text-xs w-fit"
                                  >
                                    {lancamento.categoria.categoria_pai.nome}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {lancamento.categoria.nome}
                                  </span>
                                </>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="text-xs w-fit"
                                >
                                  {lancamento.categoria.nome}
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              -
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end">
                            <span className="text-sm font-medium">
                              {new Intl.NumberFormat('pt-BR', {
                                style: 'currency',
                                currency: 'BRL',
                              }).format(lancamento.valor_total)}
                            </span>
                            {lancamento.quantidade_parcelas > 1 && (
                              <span className="text-xs text-muted-foreground">
                                {lancamento.quantidade_parcelas}x de{' '}
                                {new Intl.NumberFormat('pt-BR', {
                                  style: 'currency',
                                  currency: 'BRL',
                                }).format(
                                  lancamento.valor_total /
                                    lancamento.quantidade_parcelas
                                )}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(lancamento.status_lancamento)}
                        </TableCell>
                        <TableCell>
                          {getPaymentStatus(lancamento.contas_pagar)}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Abrir menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Ações</DropdownMenuLabel>
                              <DropdownMenuItem
                                onClick={() => handleViewDetails(lancamento)}
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                Ver detalhes
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleEdit(lancamento)}
                                disabled={
                                  lancamento.status_lancamento === 'cancelado'
                                }
                              >
                                <Edit className="mr-2 h-4 w-4" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {lancamento.arquivo_url && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    lancamento.arquivo_url &&
                                    window.open(
                                      lancamento.arquivo_url,
                                      '_blank'
                                    )
                                  }
                                >
                                  <FileText className="mr-2 h-4 w-4" />
                                  Ver documento
                                </DropdownMenuItem>
                              )}
                              {onSelectLancamento && (
                                <DropdownMenuItem
                                  onClick={() => onSelectLancamento(lancamento)}
                                >
                                  <ChevronRight className="mr-2 h-4 w-4" />
                                  Selecionar
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dialog de Formulário */}
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {selectedLancamento ? 'Editar Lançamento' : 'Novo Lançamento'}
              </DialogTitle>
              <DialogDescription>
                Preencha os dados do lançamento financeiro abaixo
              </DialogDescription>
            </DialogHeader>
            <LancamentoForm
              lancamento={
                selectedLancamento
                  ? {
                      id: selectedLancamento.id,
                      tipo_lancamento: selectedLancamento.tipo_lancamento,
                      numero_documento:
                        selectedLancamento.numero_documento || undefined,
                      data_emissao: new Date(selectedLancamento.data_emissao),
                      data_competencia: new Date(
                        selectedLancamento.data_competencia
                      ),
                      descricao: selectedLancamento.descricao,
                      observacoes: selectedLancamento.observacoes || undefined,
                      valor_total: selectedLancamento.valor_total,
                      quantidade_parcelas:
                        selectedLancamento.quantidade_parcelas,
                      eh_divisao_socios: selectedLancamento.eh_divisao_socios,
                      pessoa_responsavel_id:
                        selectedLancamento.pessoa_responsavel_id || undefined,
                      categoria_contabil_id:
                        selectedLancamento.categoria?.id ||
                        selectedLancamento.categoria_contabil_id ||
                        '',
                      fornecedor_id:
                        selectedLancamento.fornecedor_id || undefined,
                      empresa_fatura_id:
                        selectedLancamento.empresa_fatura_id || undefined,
                      arquivo_url: selectedLancamento.arquivo_url || undefined,
                    }
                  : undefined
              }
              onSuccess={handleFormSuccess}
              onCancel={() => {
                setShowForm(false);
                setSelectedLancamento(null);
              }}
            />
          </DialogContent>
        </Dialog>

        {/* Dialog de Detalhes */}
        <Dialog open={showDetails} onOpenChange={setShowDetails}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Detalhes do Lançamento</DialogTitle>
              <DialogDescription>
                Informações completas sobre o lançamento financeiro
              </DialogDescription>
            </DialogHeader>

            {selectedLancamento && (
              <div className="space-y-6">
                {/* Informações Gerais */}
                <div className="space-y-3">
                  <h3 className="font-medium">Informações Gerais</h3>
                  <div className="grid gap-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tipo:</span>
                      <div className="flex items-center gap-2">
                        {getTipoIcon(selectedLancamento.tipo_lancamento)}
                        <span>
                          {selectedLancamento.tipo_lancamento === 'despesa'
                            ? 'Despesa'
                            : 'Receita'}
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status:</span>
                      {getStatusBadge(selectedLancamento.status_lancamento)}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Origem:</span>
                      {getOrigemBadge(selectedLancamento.origem_lancamento)}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Data de Emissão:
                      </span>
                      <span>
                        {format(
                          new Date(selectedLancamento.data_emissao),
                          'dd/MM/yyyy'
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Competência:
                      </span>
                      <span>
                        {format(
                          new Date(selectedLancamento.data_competencia),
                          'MM/yyyy'
                        )}
                      </span>
                    </div>
                    {selectedLancamento.numero_documento && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Nº Documento:
                        </span>
                        <span>{selectedLancamento.numero_documento}</span>
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Valores */}
                <div className="space-y-3">
                  <h3 className="font-medium">Valores</h3>
                  <div className="grid gap-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Valor Total:
                      </span>
                      <span className="font-medium">
                        {new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        }).format(selectedLancamento.valor_total)}
                      </span>
                    </div>
                    {selectedLancamento.quantidade_parcelas > 1 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Parcelas:</span>
                        <span>
                          {selectedLancamento.quantidade_parcelas}x de{' '}
                          {new Intl.NumberFormat('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          }).format(
                            selectedLancamento.valor_total /
                              selectedLancamento.quantidade_parcelas
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Divisão entre Sócios */}
                {selectedLancamento.eh_divisao_socios &&
                  selectedLancamento.divisao_socios && (
                    <>
                      <Separator />
                      <div className="space-y-3">
                        <h3 className="font-medium flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          Divisão entre Sócios
                        </h3>
                        <div className="space-y-2">
                          {selectedLancamento.divisao_socios.map(
                            (divisao, index) => (
                              <div
                                key={index}
                                className="flex justify-between text-sm"
                              >
                                <span>{divisao.pessoa.nome}</span>
                                <span>
                                  {divisao.percentual}% -{' '}
                                  {new Intl.NumberFormat('pt-BR', {
                                    style: 'currency',
                                    currency: 'BRL',
                                  }).format(divisao.valor)}
                                </span>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    </>
                  )}

                {/* Informações Adicionais */}
                {(selectedLancamento.fornecedor ||
                  selectedLancamento.categoria ||
                  selectedLancamento.observacoes) && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <h3 className="font-medium">Informações Adicionais</h3>
                      <div className="grid gap-3 text-sm">
                        {selectedLancamento.fornecedor && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              {selectedLancamento.tipo_lancamento === 'despesa'
                                ? 'Fornecedor:'
                                : 'Cliente:'}
                            </span>
                            <span>
                              {selectedLancamento.fornecedor.nome_fantasia ||
                                selectedLancamento.fornecedor.nome_razao_social}
                            </span>
                          </div>
                        )}
                        {selectedLancamento.categoria && (
                          <>
                            {selectedLancamento.categoria.categoria_pai && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Categoria:
                                </span>
                                <span>
                                  {
                                    selectedLancamento.categoria.categoria_pai
                                      .nome
                                  }
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                Grupo:
                              </span>
                              <span>{selectedLancamento.categoria.nome}</span>
                            </div>
                          </>
                        )}
                        {selectedLancamento.observacoes && (
                          <div>
                            <span className="text-muted-foreground">
                              Observações:
                            </span>
                            <p className="mt-1 text-sm">
                              {selectedLancamento.observacoes}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* Metadados */}
                <Separator />
                <div className="space-y-3">
                  <h3 className="font-medium">Registro</h3>
                  <div className="grid gap-3 text-sm text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Criado em:</span>
                      <span>
                        {format(
                          new Date(selectedLancamento.created_at),
                          "dd/MM/yyyy 'às' HH:mm"
                        )}
                      </span>
                    </div>
                    {selectedLancamento.criado_por_pessoa && (
                      <div className="flex justify-between">
                        <span>Criado por:</span>
                        <span>{selectedLancamento.criado_por_pessoa.nome}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Documento Anexo */}
                {selectedLancamento.arquivo_url && (
                  <div className="pt-3">
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() =>
                        selectedLancamento.arquivo_url &&
                        window.open(selectedLancamento.arquivo_url, '_blank')
                      }
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Ver Documento Anexo
                    </Button>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </>
    );
  }
);

LancamentoList.displayName = 'LancamentoList';
