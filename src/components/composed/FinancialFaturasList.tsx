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
import { fetchFaturasGeral, emitirNfeFatura } from '@/lib/faturas-api';
import type { FaturaComDetalhes } from '@/types/faturas';
import { useAuth } from '@/hooks/useAuth';

// AI dev note: Lista de faturas para área financeira
// Mostra faturas de todos os pacientes com filtros e busca
// Baseado em FaturasList mas adaptado para visão geral

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

interface FinancialFaturasListProps {
  onFaturaClick?: (fatura: FaturaComDetalhes) => void;
  className?: string;
}

// Função utilitária para gerar URL do ASAAS
const getAsaasPaymentUrl = (paymentId: string): string | null => {
  if (!paymentId?.trim() || !paymentId.startsWith('pay_')) {
    return null;
  }
  return `https://www.asaas.com/i/${paymentId.replace('pay_', '')}`;
};

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

  // Função para buscar faturas
  const fetchFaturas = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Determinar datas baseadas no filtro
      const today = new Date();
      const dateRange: { startDate?: string; endDate?: string } = {};

      switch (periodFilter) {
        case 'ultimos_30':
          dateRange.startDate = new Date(
            today.getTime() - 30 * 24 * 60 * 60 * 1000
          )
            .toISOString()
            .split('T')[0];
          dateRange.endDate = today.toISOString().split('T')[0];
          break;
        case 'ultimos_60':
          dateRange.startDate = new Date(
            today.getTime() - 60 * 24 * 60 * 60 * 1000
          )
            .toISOString()
            .split('T')[0];
          dateRange.endDate = today.toISOString().split('T')[0];
          break;
        case 'ultimos_90':
          dateRange.startDate = new Date(
            today.getTime() - 90 * 24 * 60 * 60 * 1000
          )
            .toISOString()
            .split('T')[0];
          dateRange.endDate = today.toISOString().split('T')[0];
          break;
        case 'ultimo_ano':
          dateRange.startDate = new Date(
            today.getTime() - 365 * 24 * 60 * 60 * 1000
          )
            .toISOString()
            .split('T')[0];
          dateRange.endDate = today.toISOString().split('T')[0];
          break;
        case 'personalizado':
          if (startDate) dateRange.startDate = startDate;
          if (endDate) dateRange.endDate = endDate;
          break;
      }

      const result = await fetchFaturasGeral(dateRange);

      if (result.success && result.data) {
        setFaturas(result.data);
      } else {
        throw new Error(result.error || 'Erro ao buscar faturas');
      }
    } catch (err) {
      console.error('Erro ao buscar faturas:', err);
      setError('Erro ao carregar faturas');
    } finally {
      setIsLoading(false);
    }
  }, [periodFilter, startDate, endDate]);

  // Aplicar filtros locais
  useEffect(() => {
    let filtered = [...faturas];

    // Filtro de status
    if (statusFilter !== 'todos') {
      filtered = filtered.filter((f) => f.status === statusFilter);
    }

    // Filtro de busca
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((f) =>
        f.responsavel_nome?.toLowerCase().includes(query)
      );
    }

    setFilteredFaturas(filtered);
  }, [faturas, statusFilter, searchQuery]);

  // Carregar faturas ao montar
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

        // Recarregar faturas
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

    if (linkNfe === 'sincronizando') {
      return {
        text: 'Gerando NFe',
        icon: FileText,
        className: 'text-gray-500',
        disabled: true,
        action: null,
      };
    }

    if (linkNfe === 'erro') {
      return {
        text: 'Erro NFe',
        icon: AlertCircle,
        className: 'text-red-600 hover:text-red-800',
        disabled: false,
        action: () => {
          toast({
            title: 'Erro na NFe',
            description:
              fatura.status_nfe ||
              'Erro desconhecido na emissão da nota fiscal',
            variant: 'destructive',
          });
        },
      };
    }

    // Link válido
    return {
      text: 'Ver NFe',
      icon: ExternalLink,
      className: 'text-green-600 hover:text-green-800',
      disabled: false,
      action: () => window.open(linkNfe, '_blank'),
    };
  };

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-azul-respira" />
            Faturas
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Filtros */}
        <div className="space-y-4">
          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por paciente ou responsável..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Linha de filtros */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Período */}
            <Select
              value={periodFilter}
              onValueChange={(value: PeriodFilter) => setPeriodFilter(value)}
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

            {/* Status */}
            <Select
              value={statusFilter}
              onValueChange={(value: StatusFilter) => setStatusFilter(value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="atrasado">Atrasado</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
                <SelectItem value="estornado">Estornado</SelectItem>
              </SelectContent>
            </Select>

            {/* Botão de limpar filtros */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPeriodFilter('ultimos_30');
                setStatusFilter('todos');
                setSearchQuery('');
                setStartDate('');
                setEndDate('');
              }}
              className="lg:col-span-2"
            >
              <X className="h-4 w-4 mr-1" />
              Limpar filtros
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

        {/* Lista de faturas */}
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
        ) : filteredFaturas.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhuma fatura encontrada com os filtros aplicados.
          </div>
        ) : (
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {filteredFaturas.map((fatura) => {
              const asaasUrl = getAsaasPaymentUrl(fatura.id_asaas);
              const nfeConfig = getNfeButtonConfig(fatura);

              return (
                <div
                  key={fatura.id}
                  className="flex items-center justify-between p-4 border rounded-lg transition-colors hover:bg-muted/50 cursor-pointer"
                  onClick={() => onFaturaClick?.(fatura)}
                >
                  <div className="space-y-2 flex-1">
                    {/* Primeira linha: Paciente e Status */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">
                          {fatura.responsavel_nome}
                        </span>
                      </div>
                      {getStatusBadge(fatura.status)}
                    </div>

                    {/* Segunda linha: Valor e Vencimento */}
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-verde-pipa">
                        {formatCurrency(fatura.valor_total)}
                      </span>
                      {fatura.vencimento && (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          <span>Venc: {formatDate(fatura.vencimento)}</span>
                        </div>
                      )}
                    </div>

                    {/* Terceira linha: Consultas e Responsável */}
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{fatura.qtd_consultas || 0} consulta(s)</span>
                      {fatura.responsavel_nome && (
                        <div className="flex items-center gap-1">
                          <CreditCard className="h-3 w-3" />
                          <span>Resp: {fatura.responsavel_nome}</span>
                        </div>
                      )}
                    </div>

                    {/* Quarta linha: Ações */}
                    <div className="flex items-center gap-2">
                      {/* Link ASAAS */}
                      {asaasUrl && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-auto p-1 text-xs text-blue-600 hover:text-blue-800"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(asaasUrl, '_blank');
                          }}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Ver fatura
                        </Button>
                      )}

                      {/* Botão NFe */}
                      {nfeConfig && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn(
                            'h-auto p-1 text-xs',
                            nfeConfig.className
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            nfeConfig.action?.();
                          }}
                          disabled={nfeConfig.disabled}
                        >
                          <nfeConfig.icon className="h-3 w-3 mr-1" />
                          {nfeConfig.text}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Resumo */}
        {!isLoading && !error && filteredFaturas.length > 0 && (
          <div className="mt-4 p-4 bg-muted/30 rounded-lg">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Total de faturas:</span>
                <p className="font-semibold">{filteredFaturas.length}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Valor total:</span>
                <p className="font-semibold text-verde-pipa">
                  {formatCurrency(
                    filteredFaturas.reduce((sum, f) => sum + f.valor_total, 0)
                  )}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Pagas:</span>
                <p className="font-semibold text-green-500">
                  {filteredFaturas.filter((f) => f.status === 'pago').length}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Pendentes:</span>
                <p className="font-semibold text-orange-500">
                  {
                    filteredFaturas.filter((f) =>
                      ['pendente', 'atrasado'].includes(f.status)
                    ).length
                  }
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
