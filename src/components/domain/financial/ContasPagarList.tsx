import React from 'react';
import { format, differenceInDays, startOfMonth, endOfMonth } from 'date-fns';
import {
  Search,
  Calendar,
  CreditCard,
  AlertCircle,
  CheckCircle,
  Clock,
  ChevronRight,
  Download,
  DollarSign,
  MoreHorizontal,
  Receipt,
  CalendarCheck,
  CalendarX,
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
  Alert,
  AlertDescription,
  AlertTitle,
  Checkbox,
} from '@/components/primitives';
import { PagamentoForm } from './PagamentoForm';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';

// AI dev note: Lista de contas a pagar com filtros e ações
// Mostra parcelas agrupadas por vencimento, status e valor
// Permite registro de pagamentos e exportação de dados

interface ContaPagar {
  id: string;
  lancamento_id: string;
  numero_parcela: number;
  total_parcelas: number;
  valor_parcela: number;
  data_vencimento: string;
  status_pagamento: 'pendente' | 'pago' | 'cancelado';
  data_pagamento?: string | null;
  forma_pagamento_id?: string | null;
  conta_bancaria_id?: string | null;
  numero_documento_pagamento?: string | null;
  observacoes_pagamento?: string | null;
  lancamento: {
    tipo_lancamento: 'despesa' | 'receita';
    numero_documento?: string | null;
    descricao: string;
    valor_total: number;
    fornecedor?: {
      nome_razao_social: string;
      nome_fantasia?: string | null;
    } | null;
    categoria?: {
      nome: string;
      codigo: string;
    } | null;
    eh_divisao_socios: boolean;
  };
}

interface ContaPagarListProps {
  tipo?: 'todos' | 'despesa' | 'receita';
  showFilters?: boolean;
  className?: string;
}

export const ContasPagarList = React.memo<ContaPagarListProps>(
  ({ tipo = 'todos', showFilters = true, className }) => {
    const [contas, setContas] = React.useState<ContaPagar[]>([]);
    const [contasSelecionadas, setContasSelecionadas] = React.useState<
      Set<string>
    >(new Set());
    const [isLoading, setIsLoading] = React.useState(true);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [selectedStatus, setSelectedStatus] =
      React.useState<string>('pendente');
    const [selectedPeriodo, setSelectedPeriodo] =
      React.useState<string>('mes_atual');
    const [dateRange, setDateRange] = React.useState<
      { from: Date; to: Date } | undefined
    >();
    const [showPagamentoForm, setShowPagamentoForm] = React.useState(false);
    const [contaParaPagar, setContaParaPagar] =
      React.useState<ContaPagar | null>(null);
    const { toast } = useToast();

    // Calcular período baseado na seleção
    React.useEffect(() => {
      const hoje = new Date();

      switch (selectedPeriodo) {
        case 'vencidas':
          setDateRange({
            from: new Date(2000, 0, 1),
            to: hoje,
          });
          break;
        case 'hoje':
          setDateRange({
            from: hoje,
            to: hoje,
          });
          break;
        case 'semana': {
          const proximaSemana = new Date(hoje);
          proximaSemana.setDate(hoje.getDate() + 7);
          setDateRange({
            from: hoje,
            to: proximaSemana,
          });
          break;
        }
        case 'mes_atual':
          setDateRange({
            from: startOfMonth(hoje),
            to: endOfMonth(hoje),
          });
          break;
        case 'proximo_mes': {
          const proximoMes = new Date(
            hoje.getFullYear(),
            hoje.getMonth() + 1,
            1
          );
          setDateRange({
            from: startOfMonth(proximoMes),
            to: endOfMonth(proximoMes),
          });
          break;
        }
        case 'personalizado':
          // Mantém o dateRange atual para seleção manual
          break;
        default:
          setDateRange(undefined);
      }
    }, [selectedPeriodo]);

    // Carregar contas
    const loadContas = React.useCallback(async () => {
      try {
        setIsLoading(true);

        let query = supabase
          .from('contas_pagar')
          .select(
            `
            *,
            lancamento:lancamento_id (
              tipo_lancamento,
              numero_documento,
              descricao,
              valor_total,
              eh_divisao_socios,
              fornecedor:fornecedor_id (
                nome_razao_social,
                nome_fantasia
              ),
              categoria:categoria_contabil_id (
                nome,
                codigo
              )
            )
          `
          )
          .order('data_vencimento', { ascending: true })
          .order('created_at', { ascending: false });

        // Filtro por tipo
        if (tipo !== 'todos') {
          query = query.eq('lancamento.tipo_lancamento', tipo);
        }

        // Filtro por status
        if (selectedStatus !== 'todos') {
          query = query.eq('status_pagamento', selectedStatus);
        }

        // Filtro por período
        if (dateRange?.from) {
          query = query.gte(
            'data_vencimento',
            format(dateRange.from, 'yyyy-MM-dd')
          );
        }
        if (dateRange?.to) {
          query = query.lte(
            'data_vencimento',
            format(dateRange.to, 'yyyy-MM-dd')
          );
        }

        // Filtro por termo de busca
        if (searchTerm) {
          query = query.or(
            `lancamento.descricao.ilike.%${searchTerm}%,lancamento.numero_documento.ilike.%${searchTerm}%`
          );
        }

        const { data, error } = await query;

        if (error) throw error;
        setContas(data || []);
      } catch (error) {
        console.error('Erro ao carregar contas:', error);
        toast({
          variant: 'destructive',
          title: 'Erro ao carregar contas',
          description: 'Não foi possível carregar as contas a pagar.',
        });
      } finally {
        setIsLoading(false);
      }
    }, [tipo, selectedStatus, dateRange, searchTerm, toast]);

    React.useEffect(() => {
      loadContas();
    }, [loadContas]);

    // Calcular totais
    const totais = React.useMemo(() => {
      const total = contas.reduce((sum, conta) => sum + conta.valor_parcela, 0);
      const pendente = contas
        .filter((c) => c.status_pagamento === 'pendente')
        .reduce((sum, conta) => sum + conta.valor_parcela, 0);
      const pago = contas
        .filter((c) => c.status_pagamento === 'pago')
        .reduce((sum, conta) => sum + conta.valor_parcela, 0);
      const vencidas = contas.filter(
        (c) =>
          c.status_pagamento === 'pendente' &&
          new Date(c.data_vencimento) < new Date()
      ).length;

      return { total, pendente, pago, vencidas };
    }, [contas]);

    // Handlers
    const handlePagar = (conta: ContaPagar) => {
      setContaParaPagar(conta);
      setShowPagamentoForm(true);
    };

    const handlePagarSelecionadas = () => {
      if (contasSelecionadas.size === 0) {
        toast({
          variant: 'destructive',
          title: 'Nenhuma conta selecionada',
          description: 'Selecione pelo menos uma conta para pagar.',
        });
        return;
      }

      // TODO: Implementar pagamento em lote
      toast({
        title: 'Funcionalidade em desenvolvimento',
        description: 'Pagamento em lote será implementado em breve.',
      });
    };

    const handleSelecionarConta = (contaId: string, checked: boolean) => {
      const novasContas = new Set(contasSelecionadas);
      if (checked) {
        novasContas.add(contaId);
      } else {
        novasContas.delete(contaId);
      }
      setContasSelecionadas(novasContas);
    };

    const handleSelecionarTodas = (checked: boolean) => {
      if (checked) {
        const contasPendentes = contas
          .filter((c) => c.status_pagamento === 'pendente')
          .map((c) => c.id);
        setContasSelecionadas(new Set(contasPendentes));
      } else {
        setContasSelecionadas(new Set());
      }
    };

    const handlePagamentoSuccess = () => {
      setShowPagamentoForm(false);
      setContaParaPagar(null);
      loadContas();
      toast({
        title: 'Pagamento registrado',
        description: 'O pagamento foi registrado com sucesso.',
      });
    };

    const getStatusBadge = (status: string, dataVencimento: string) => {
      const hoje = new Date();
      const vencimento = new Date(dataVencimento);
      const diasAteVencimento = differenceInDays(vencimento, hoje);

      switch (status) {
        case 'pago':
          return (
            <Badge variant="outline" className="text-green-600">
              <CheckCircle className="mr-1 h-3 w-3" />
              Pago
            </Badge>
          );
        case 'cancelado':
          return (
            <Badge variant="destructive">
              <CalendarX className="mr-1 h-3 w-3" />
              Cancelado
            </Badge>
          );
        case 'pendente':
          if (diasAteVencimento < 0) {
            return (
              <Badge variant="destructive">
                <AlertCircle className="mr-1 h-3 w-3" />
                Vencida há {Math.abs(diasAteVencimento)} dia
                {Math.abs(diasAteVencimento) !== 1 ? 's' : ''}
              </Badge>
            );
          } else if (diasAteVencimento === 0) {
            return (
              <Badge variant="secondary" className="text-orange-600">
                <Clock className="mr-1 h-3 w-3" />
                Vence hoje
              </Badge>
            );
          } else if (diasAteVencimento <= 7) {
            return (
              <Badge variant="secondary">
                <Clock className="mr-1 h-3 w-3" />
                Vence em {diasAteVencimento} dia
                {diasAteVencimento !== 1 ? 's' : ''}
              </Badge>
            );
          } else {
            return (
              <Badge variant="outline">
                <Calendar className="mr-1 h-3 w-3" />A vencer
              </Badge>
            );
          }
        default:
          return <Badge variant="outline">{status}</Badge>;
      }
    };

    const getTipoIcon = (tipo: 'despesa' | 'receita') => {
      return tipo === 'despesa' ? (
        <DollarSign className="h-4 w-4 text-red-500" />
      ) : (
        <Receipt className="h-4 w-4 text-green-500" />
      );
    };

    const handleExportCSV = async () => {
      try {
        // Criar cabeçalho CSV
        const headers = [
          'Data Vencimento',
          'Tipo',
          'Fornecedor/Cliente',
          'Descrição',
          'Número Documento',
          'Parcela',
          'Valor',
          'Status',
          'Data Pagamento',
          'Categoria',
        ];

        // Criar linhas CSV
        const rows = contas.map((conta) => [
          format(new Date(conta.data_vencimento), 'dd/MM/yyyy'),
          conta.lancamento.tipo_lancamento === 'despesa'
            ? 'Despesa'
            : 'Receita',
          conta.lancamento.fornecedor?.nome_fantasia ||
            conta.lancamento.fornecedor?.nome_razao_social ||
            '',
          conta.lancamento.descricao,
          conta.lancamento.numero_documento || '',
          `${conta.numero_parcela}/${conta.total_parcelas}`,
          new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
          }).format(conta.valor_parcela),
          conta.status_pagamento === 'pago'
            ? 'Pago'
            : conta.status_pagamento === 'pendente'
              ? 'Pendente'
              : 'Cancelado',
          conta.data_pagamento
            ? format(new Date(conta.data_pagamento), 'dd/MM/yyyy')
            : '',
          conta.lancamento.categoria?.nome || '',
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
        link.download = `contas_pagar_${format(new Date(), 'yyyy-MM-dd')}.csv`;
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

    const contasPendentes = contas.filter(
      (c) => c.status_pagamento === 'pendente'
    );
    const todasSelecionadas =
      contasPendentes.length > 0 &&
      contasPendentes.every((c) => contasSelecionadas.has(c.id));

    return (
      <>
        <Card className={className}>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Contas a Pagar</CardTitle>
                <CardDescription>
                  Gerencie vencimentos e pagamentos
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCSV}
                  disabled={contas.length === 0}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Exportar
                </Button>
                {contasSelecionadas.size > 0 && (
                  <Button size="sm" onClick={handlePagarSelecionadas}>
                    <CreditCard className="mr-2 h-4 w-4" />
                    Pagar Selecionadas ({contasSelecionadas.size})
                  </Button>
                )}
              </div>
            </div>

            {/* Cards de Resumo */}
            <div className="mt-4 grid gap-4 md:grid-cols-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        Total
                      </p>
                      <p className="text-xl font-bold">
                        {new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        }).format(totais.total)}
                      </p>
                    </div>
                    <DollarSign className="h-8 w-8 text-muted-foreground/20" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        Pendente
                      </p>
                      <p className="text-xl font-bold text-orange-600">
                        {new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        }).format(totais.pendente)}
                      </p>
                    </div>
                    <Clock className="h-8 w-8 text-orange-600/20" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        Pago
                      </p>
                      <p className="text-xl font-bold text-green-600">
                        {new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        }).format(totais.pago)}
                      </p>
                    </div>
                    <CheckCircle className="h-8 w-8 text-green-600/20" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        Vencidas
                      </p>
                      <p className="text-xl font-bold text-red-600">
                        {totais.vencidas}
                      </p>
                    </div>
                    <AlertCircle className="h-8 w-8 text-red-600/20" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Filtros */}
            {showFilters && (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-4">
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

                  {/* Status */}
                  <Select
                    value={selectedStatus}
                    onValueChange={setSelectedStatus}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os status</SelectItem>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="pago">Pago</SelectItem>
                      <SelectItem value="cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Período */}
                  <Select
                    value={selectedPeriodo}
                    onValueChange={setSelectedPeriodo}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Período" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas as datas</SelectItem>
                      <SelectItem value="vencidas">Vencidas</SelectItem>
                      <SelectItem value="hoje">Vence hoje</SelectItem>
                      <SelectItem value="semana">Próximos 7 dias</SelectItem>
                      <SelectItem value="mes_atual">Mês atual</SelectItem>
                      <SelectItem value="proximo_mes">Próximo mês</SelectItem>
                      <SelectItem value="personalizado">
                        Personalizado...
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Lista de Contas */}
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : contas.length === 0 ? (
              <div className="flex min-h-[400px] flex-col items-center justify-center text-center">
                <Receipt className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-medium">
                  Nenhuma conta encontrada
                </h3>
                <p className="mb-4 max-w-sm text-sm text-muted-foreground">
                  {searchTerm ||
                  selectedStatus !== 'todos' ||
                  selectedPeriodo !== 'todas'
                    ? 'Tente ajustar os filtros de busca.'
                    : 'As contas a pagar serão geradas automaticamente ao cadastrar lançamentos.'}
                </p>
              </div>
            ) : (
              <>
                {/* Alerta para contas vencidas */}
                {totais.vencidas > 0 && selectedStatus !== 'pago' && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Atenção!</AlertTitle>
                    <AlertDescription>
                      Você tem {totais.vencidas} conta
                      {totais.vencidas !== 1 ? 's' : ''} vencida
                      {totais.vencidas !== 1 ? 's' : ''}.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]">
                          <Checkbox
                            checked={todasSelecionadas}
                            onCheckedChange={handleSelecionarTodas}
                            aria-label="Selecionar todas"
                          />
                        </TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Fornecedor/Cliente</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Parcela</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contas.map((conta) => (
                        <TableRow key={conta.id}>
                          <TableCell>
                            <Checkbox
                              checked={contasSelecionadas.has(conta.id)}
                              onCheckedChange={(checked) =>
                                handleSelecionarConta(
                                  conta.id,
                                  checked as boolean
                                )
                              }
                              disabled={conta.status_pagamento !== 'pendente'}
                              aria-label={`Selecionar conta ${conta.id}`}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-sm font-medium">
                                {format(
                                  new Date(conta.data_vencimento),
                                  'dd/MM/yyyy'
                                )}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  {getTipoIcon(
                                    conta.lancamento.tipo_lancamento
                                  )}
                                </TooltipTrigger>
                                <TooltipContent>
                                  {conta.lancamento.tipo_lancamento ===
                                  'despesa'
                                    ? 'Despesa'
                                    : 'Receita'}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableCell>
                          <TableCell>
                            {conta.lancamento.fornecedor ? (
                              <span className="text-sm">
                                {conta.lancamento.fornecedor.nome_fantasia ||
                                  conta.lancamento.fornecedor.nome_razao_social}
                              </span>
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                -
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-sm font-medium line-clamp-1">
                                {conta.lancamento.descricao}
                              </span>
                              {conta.lancamento.numero_documento && (
                                <span className="text-xs text-muted-foreground">
                                  Doc: {conta.lancamento.numero_documento}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm font-medium">
                              {conta.numero_parcela}/{conta.total_parcelas}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-sm font-medium">
                              {new Intl.NumberFormat('pt-BR', {
                                style: 'currency',
                                currency: 'BRL',
                              }).format(conta.valor_parcela)}
                            </span>
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(
                              conta.status_pagamento,
                              conta.data_vencimento
                            )}
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
                                {conta.status_pagamento === 'pendente' && (
                                  <>
                                    <DropdownMenuItem
                                      onClick={() => handlePagar(conta)}
                                    >
                                      <CreditCard className="mr-2 h-4 w-4" />
                                      Registrar Pagamento
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                  </>
                                )}
                                {conta.status_pagamento === 'pago' &&
                                  conta.data_pagamento && (
                                    <DropdownMenuItem disabled>
                                      <CalendarCheck className="mr-2 h-4 w-4" />
                                      Pago em{' '}
                                      {format(
                                        new Date(conta.data_pagamento),
                                        'dd/MM/yyyy'
                                      )}
                                    </DropdownMenuItem>
                                  )}
                                <DropdownMenuItem
                                  onClick={() => {
                                    // TODO: Implementar visualização de detalhes do lançamento
                                    toast({
                                      title: 'Em desenvolvimento',
                                      description:
                                        'Visualização de detalhes será implementada.',
                                    });
                                  }}
                                >
                                  <ChevronRight className="mr-2 h-4 w-4" />
                                  Ver Lançamento
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Form de Pagamento - será criado em seguida */}
        {showPagamentoForm && contaParaPagar && (
          <PagamentoForm
            conta={contaParaPagar}
            onSuccess={handlePagamentoSuccess}
            onCancel={() => {
              setShowPagamentoForm(false);
              setContaParaPagar(null);
            }}
          />
        )}
      </>
    );
  }
);

ContasPagarList.displayName = 'ContasPagarList';
