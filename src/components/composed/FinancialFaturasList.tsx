import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  CreditCard,
  User,
  Search,
  X,
  Receipt,
  ExternalLink,
  FileText,
  AlertCircle,
  ChevronLeft,
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
import { cn } from '@/lib/utils';
import { emitirNfeFatura } from '@/lib/faturas-api';
import type { FaturaComDetalhes } from '@/types/faturas';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

// AI dev note: Lista de faturas para área financeira com otimizações de performance
// Mesmos filtros e paginação da lista de consultas

type PeriodFilter =
  | 'ultimos_30'
  | 'ultimos_60'
  | 'ultimos_90'
  | 'ultimo_ano'
  | 'personalizado'
  | 'todos';

type StatusFilter =
  | 'todos'
  | 'pago'
  | 'pendente'
  | 'atrasado'
  | 'cancelado'
  | 'estornado';

type SortOption =
  | 'data_desc'
  | 'data_asc'
  | 'responsavel_asc'
  | 'responsavel_desc'
  | 'valor_desc'
  | 'valor_asc';

interface FinancialFaturasListProps {
  onFaturaClick?: (fatura: FaturaComDetalhes) => void;
  className?: string;
}

export const FinancialFaturasList: React.FC<FinancialFaturasListProps> = ({
  onFaturaClick,
  className,
}) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [faturas, setFaturas] = useState<FaturaComDetalhes[]>([]);
  const [filteredFaturas, setFilteredFaturas] = useState<FaturaComDetalhes[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEmitingNfe, setIsEmitingNfe] = useState<string | null>(null);

  // Estados de filtro
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('ultimos_30');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('data_desc');
  const [professionalFilter, setProfessionalFilter] = useState<string>('todos');
  const [empresaFilter, setEmpresaFilter] = useState<string>('todos');

  // Estados de paginação
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const PAGE_SIZE = 100; // AI dev note: 100 faturas por página

  // Listas para filtros
  const [professionals, setProfessionals] = useState<
    Array<{ id: string; nome: string }>
  >([]);
  const [empresas, setEmpresas] = useState<Array<{ id: string; nome: string }>>(
    []
  );

  // AI dev note: Busca otimizada com paginação e select de campos específicos
  const fetchFaturas = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Determinar datas baseadas no filtro
      const today = new Date();
      let dateStart = '';
      let dateEnd = today.toISOString().split('T')[0];

      switch (periodFilter) {
        case 'ultimos_30':
          dateStart = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0];
          break;
        case 'ultimos_60':
          dateStart = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0];
          break;
        case 'ultimos_90':
          dateStart = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0];
          break;
        case 'ultimo_ano':
          dateStart = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0];
          break;
        case 'personalizado':
          if (startDate) dateStart = startDate;
          if (endDate) dateEnd = endDate;
          break;
        case 'todos':
          dateStart = '';
          break;
      }

      // AI dev note: Select apenas campos necessários para performance
      const selectFields = [
        'id',
        'id_asaas',
        'valor_total',
        'status',
        'vencimento',
        'created_at',
        'empresa_id',
        'empresa_razao_social',
        'empresa_nome_fantasia',
        'responsavel_cobranca_id',
        'responsavel_nome',
        'responsavel_cpf',
        'link_nfe',
        'status_nfe',
        'qtd_consultas',
        'periodo_inicio',
        'periodo_fim',
        'profissionais_envolvidos',
        'pacientes_atendidos',
      ].join(',');

      // Buscar count separadamente
      let countQuery = supabase
        .from('vw_faturas_completas')
        .select('id', { count: 'exact', head: true });

      if (dateStart) {
        countQuery = countQuery.gte('created_at', dateStart);
      }
      if (dateEnd && periodFilter !== 'todos') {
        countQuery = countQuery.lte('created_at', dateEnd + 'T23:59:59');
      }

      const { count } = await countQuery;
      setTotalCount(count || 0);

      // Buscar dados com paginação
      const from = currentPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from('vw_faturas_completas')
        .select(selectFields)
        .range(from, to)
        .order('created_at', { ascending: false });

      if (dateStart) {
        query = query.gte('created_at', dateStart);
      }
      if (dateEnd && periodFilter !== 'todos') {
        query = query.lte('created_at', dateEnd + 'T23:59:59');
      }

      const { data, error: fetchError } = await query;

      setHasMore((count || 0) > to + 1);

      if (fetchError) throw fetchError;

      // Mapear para interface FaturaComDetalhes
      const faturasComDetalhes: FaturaComDetalhes[] = (data || []).map(
        (fatura) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const f = fatura as any;
          return {
            ...f,
            consultas_periodo:
              f.periodo_inicio && f.periodo_fim
                ? {
                    inicio: String(f.periodo_inicio),
                    fim: String(f.periodo_fim),
                  }
                : undefined,
            url_asaas:
              f.id_asaas && typeof f.id_asaas === 'string'
                ? `https://www.asaas.com/i/${f.id_asaas.replace('pay_', '')}`
                : undefined,
          } as FaturaComDetalhes;
        }
      );

      setFaturas(faturasComDetalhes);

      // Extrair listas únicas para filtros
      const uniqueProfessionals = Array.from(
        new Set(
          faturasComDetalhes
            .flatMap((f) => f.profissionais_envolvidos || [])
            .filter(Boolean)
        )
      ).map((nome, idx) => ({ id: `prof_${idx}`, nome }));
      setProfessionals(uniqueProfessionals);

      const uniqueEmpresas = Array.from(
        new Map(
          faturasComDetalhes
            .filter(
              (f) =>
                f.empresa_id &&
                (f.empresa_razao_social || f.empresa_nome_fantasia)
            )
            .map((f) => [
              f.empresa_id!,
              {
                id: f.empresa_id!,
                nome:
                  f.empresa_razao_social ||
                  f.empresa_nome_fantasia ||
                  'Sem nome',
              },
            ])
        ).values()
      );
      setEmpresas([...uniqueEmpresas]);
    } catch (err) {
      console.error('Erro ao buscar faturas:', err);
      setError('Erro ao carregar faturas');
    } finally {
      setIsLoading(false);
    }
  }, [periodFilter, startDate, endDate, currentPage]);

  // Aplicar filtros locais e ordenação
  useEffect(() => {
    let filtered = [...faturas];

    // Filtro de status
    if (statusFilter !== 'todos') {
      filtered = filtered.filter((f) => f.status === statusFilter);
    }

    // Filtro de profissional
    if (professionalFilter !== 'todos') {
      filtered = filtered.filter((f) =>
        f.profissionais_envolvidos?.includes(professionalFilter)
      );
    }

    // Filtro de empresa
    if (empresaFilter !== 'todos') {
      filtered = filtered.filter((f) => f.empresa_id === empresaFilter);
    }

    // Filtro de busca
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((f) =>
        f.responsavel_nome?.toLowerCase().includes(query)
      );
    }

    // Ordenação
    filtered.sort((a, b) => {
      switch (sortOption) {
        case 'responsavel_asc':
          return (a.responsavel_nome || '').localeCompare(
            b.responsavel_nome || '',
            'pt-BR'
          );
        case 'responsavel_desc':
          return (b.responsavel_nome || '').localeCompare(
            a.responsavel_nome || '',
            'pt-BR'
          );
        case 'data_asc':
          return (
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        case 'data_desc':
          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        case 'valor_asc':
          return a.valor_total - b.valor_total;
        case 'valor_desc':
          return b.valor_total - a.valor_total;
        default:
          return 0;
      }
    });

    setFilteredFaturas(filtered);
  }, [
    faturas,
    statusFilter,
    professionalFilter,
    empresaFilter,
    searchQuery,
    sortOption,
  ]);

  // Carregar faturas ao montar ou mudar filtros
  useEffect(() => {
    fetchFaturas();
  }, [fetchFaturas]);

  // Função para emitir NFe
  const handleEmitirNfe = async (fatura: FaturaComDetalhes) => {
    if (!user?.pessoa?.id) {
      toast({
        title: 'Erro de autenticação',
        description: 'Usuário não autenticado.',
        variant: 'destructive',
      });
      return;
    }

    setIsEmitingNfe(fatura.id);

    try {
      const result = await emitirNfeFatura(fatura.id, user.pessoa.id);

      if (result.success) {
        toast({
          title: 'NFe solicitada',
          description:
            'A nota fiscal está sendo gerada e será disponibilizada em breve.',
        });

        fetchFaturas();
      } else {
        toast({
          title: 'Erro ao emitir NFe',
          description:
            result.error || 'Erro desconhecido ao emitir nota fiscal',
          variant: 'destructive',
        });
      }
    } catch (err) {
      console.error('Erro ao emitir NFe:', err);
      toast({
        title: 'Erro ao emitir NFe',
        description: 'Ocorreu um erro ao processar a solicitação',
        variant: 'destructive',
      });
    } finally {
      setIsEmitingNfe(null);
    }
  };

  // Função para formatar data
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  // Função para formatar valor
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  // Função para obter badge de status
  const getStatusBadge = (status: FaturaComDetalhes['status']) => {
    const variants = {
      pago: 'default',
      pendente: 'secondary',
      atrasado: 'destructive',
      cancelado: 'outline',
      estornado: 'outline',
    } as const;

    const colors = {
      pago: '#10B981',
      pendente: '#F59E0B',
      atrasado: '#EF4444',
      cancelado: '#6B7280',
      estornado: '#7C3AED',
    };

    return (
      <Badge
        variant={variants[status]}
        style={{
          backgroundColor: `${colors[status]}15`,
          borderColor: colors[status],
          color: colors[status],
        }}
      >
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  // Função para determinar estado do botão NFe
  const getNfeButtonConfig = (fatura: FaturaComDetalhes) => {
    if (fatura.status !== 'pago') {
      return null;
    }

    const isProcessing = isEmitingNfe === fatura.id;
    const linkNfe = fatura.link_nfe;

    if (isProcessing) {
      return {
        text: 'Emitindo NFe...',
        icon: FileText,
        className: 'text-gray-500',
        disabled: true,
        action: null,
      };
    }

    if (!linkNfe) {
      return {
        text: 'Emitir NFe',
        icon: FileText,
        className: 'text-blue-600 hover:text-blue-800',
        disabled: false,
        action: () => handleEmitirNfe(fatura),
      };
    }

    return {
      text: 'Ver NFe',
      icon: ExternalLink,
      className: 'text-green-600 hover:text-green-800',
      disabled: false,
      action: () => window.open(linkNfe, '_blank'),
    };
  };

  // Loading state
  if (isLoading && currentPage === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Faturas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Faturas</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button onClick={fetchFaturas} className="mt-4">
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Faturas</span>
          <Badge variant="outline" className="ml-2">
            {filteredFaturas.length} fatura
            {filteredFaturas.length !== 1 ? 's' : ''}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Filtros */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          {/* Filtro de Período */}
          <Select
            value={periodFilter}
            onValueChange={(value) => {
              setPeriodFilter(value as PeriodFilter);
              setCurrentPage(0);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ultimos_30">Últimos 30 dias</SelectItem>
              <SelectItem value="ultimos_60">Últimos 60 dias</SelectItem>
              <SelectItem value="ultimos_90">Últimos 90 dias</SelectItem>
              <SelectItem value="ultimo_ano">Último ano</SelectItem>
              <SelectItem value="personalizado">Personalizado</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>

          {/* Filtro de Status */}
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as StatusFilter)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="pago">Pago</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="atrasado">Atrasado</SelectItem>
              <SelectItem value="cancelado">Cancelado</SelectItem>
              <SelectItem value="estornado">Estornado</SelectItem>
            </SelectContent>
          </Select>

          {/* Filtro de Profissional */}
          <Select
            value={professionalFilter}
            onValueChange={setProfessionalFilter}
          >
            <SelectTrigger>
              <SelectValue placeholder="Profissional" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {professionals.map((prof) => (
                <SelectItem key={prof.id} value={prof.nome}>
                  {prof.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filtro de Empresa */}
          <Select value={empresaFilter} onValueChange={setEmpresaFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Empresa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas</SelectItem>
              {empresas.map((emp) => (
                <SelectItem key={emp.id} value={emp.id}>
                  {emp.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Ordenação */}
          <Select
            value={sortOption}
            onValueChange={(value) => setSortOption(value as SortOption)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Ordenar por" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="data_desc">Data (mais recente)</SelectItem>
              <SelectItem value="data_asc">Data (mais antiga)</SelectItem>
              <SelectItem value="responsavel_asc">Responsável A-Z</SelectItem>
              <SelectItem value="responsavel_desc">Responsável Z-A</SelectItem>
              <SelectItem value="valor_desc">Valor (maior)</SelectItem>
              <SelectItem value="valor_asc">Valor (menor)</SelectItem>
            </SelectContent>
          </Select>

          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar responsável..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2"
              >
                <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Datas personalizadas */}
        {periodFilter === 'personalizado' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Data inicial</label>
              <DatePicker
                value={startDate}
                onChange={(date) => {
                  setStartDate(date);
                  setCurrentPage(0);
                }}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Data final</label>
              <DatePicker
                value={endDate}
                onChange={(date) => {
                  setEndDate(date);
                  setCurrentPage(0);
                }}
              />
            </div>
          </div>
        )}

        {/* Contador de resultados e paginação */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Mostrando {currentPage * PAGE_SIZE + 1}-
            {Math.min((currentPage + 1) * PAGE_SIZE, totalCount)} de{' '}
            {totalCount}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => p + 1)}
              disabled={!hasMore}
            >
              Próxima
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>

        {/* Lista de Faturas */}
        {filteredFaturas.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhuma fatura encontrada</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredFaturas.map((fatura) => {
              const nfeConfig = getNfeButtonConfig(fatura);
              const NfeIcon = nfeConfig?.icon;

              return (
                <div
                  key={fatura.id}
                  className={cn(
                    'group relative border rounded-lg p-4 hover:shadow-md transition-all cursor-pointer bg-card',
                    onFaturaClick && 'hover:border-primary'
                  )}
                  onClick={() => onFaturaClick?.(fatura)}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-sm">
                          Fatura #{fatura.id.slice(0, 8)}
                        </span>
                        {getStatusBadge(fatura.status)}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <User className="h-3 w-3" />
                        <span>
                          {fatura.responsavel_nome || 'Sem responsável'}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-primary">
                        {formatCurrency(fatura.valor_total)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {fatura.qtd_consultas || 0} consulta
                        {fatura.qtd_consultas !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>

                  {/* Detalhes */}
                  <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                    <div>
                      <div className="text-muted-foreground mb-1">
                        Vencimento
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3 w-3" />
                        {fatura.vencimento
                          ? formatDate(fatura.vencimento)
                          : 'Não definido'}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground mb-1">
                        Criada em
                      </div>
                      <div>{formatDate(fatura.created_at)}</div>
                    </div>
                  </div>

                  {/* Empresa */}
                  {fatura.empresa_razao_social && (
                    <div className="text-sm mb-3">
                      <div className="text-muted-foreground mb-1">Empresa</div>
                      <div>{fatura.empresa_razao_social}</div>
                    </div>
                  )}

                  {/* Ações */}
                  <div className="flex items-center gap-2 pt-3 border-t">
                    {fatura.url_asaas && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(fatura.url_asaas, '_blank');
                        }}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Ver no ASAAS
                      </Button>
                    )}

                    {nfeConfig && NfeIcon && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          nfeConfig.action?.();
                        }}
                        disabled={nfeConfig.disabled}
                        className={nfeConfig.className}
                      >
                        <NfeIcon className="h-4 w-4 mr-2" />
                        {nfeConfig.text}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
