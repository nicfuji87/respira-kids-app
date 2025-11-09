import React from 'react';
import { format } from 'date-fns';
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
} from '@/components/primitives';
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
  status_lancamento: string;
  origem_lancamento: string;
  arquivo_url?: string | null;
  created_at: string;
  fornecedor?: {
    nome_razao_social: string;
    nome_fantasia?: string | null;
  } | null;
  categoria?: {
    nome: string;
    codigo: string;
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
    const [dateRange] = React.useState<{ from: Date; to?: Date } | undefined>();
    const [showForm, setShowForm] = React.useState(false);
    const [selectedLancamento, setSelectedLancamento] =
      React.useState<Lancamento | null>(null);
    const [showDetails, setShowDetails] = React.useState(false);
    const [categorias, setCategorias] = React.useState<
      { id: string; nome: string }[]
    >([]);
    const { toast } = useToast();

    // Carregar categorias
    React.useEffect(() => {
      const loadCategorias = async () => {
        try {
          const { data, error } = await supabase
            .from('categorias_contabeis')
            .select('id, nome')
            .eq('ativo', true)
            .order('nome');

          if (error) throw error;
          setCategorias(data || []);
        } catch (error) {
          console.error('Erro ao carregar categorias:', error);
        }
      };

      loadCategorias();
    }, []);

    // Carregar lançamentos
    const loadLancamentos = React.useCallback(async () => {
      try {
        setIsLoading(true);

        let query = supabase
          .from('lancamentos_financeiros')
          .select(
            `
            *,
            fornecedor:fornecedor_id (
              nome_razao_social,
              nome_fantasia
            ),
            categoria:categoria_contabil_id (
              nome,
              codigo
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
          )
          .order('data_emissao', { ascending: false })
          .order('created_at', { ascending: false });

        // Filtro por tipo
        if (tipoAtivo !== 'todos') {
          query = query.eq('tipo_lancamento', tipoAtivo);
        }

        // Filtro por status
        if (selectedStatus !== 'todos') {
          query = query.eq('status_lancamento', selectedStatus);
        }

        // Filtro por categoria
        if (selectedCategoria !== 'todas') {
          query = query.eq('categoria_contabil_id', selectedCategoria);
        }

        // Filtro por origem
        if (selectedOrigem !== 'todas') {
          query = query.eq('origem_lancamento', selectedOrigem);
        }

        // Filtro por período
        if (dateRange?.from) {
          query = query.gte(
            'data_emissao',
            format(dateRange.from, 'yyyy-MM-dd')
          );
        }
        if (dateRange?.to) {
          query = query.lte('data_emissao', format(dateRange.to, 'yyyy-MM-dd'));
        }

        // Filtro por termo de busca
        if (searchTerm) {
          query = query.or(
            `descricao.ilike.%${searchTerm}%,numero_documento.ilike.%${searchTerm}%`
          );
        }

        const { data, error } = await query;

        if (error) throw error;
        setLancamentos(data || []);
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
      selectedOrigem,
      dateRange,
      searchTerm,
      toast,
    ]);

    React.useEffect(() => {
      loadLancamentos();
    }, [loadLancamentos]);

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
                      <SelectItem value="pre_lancamento">
                        Pré-lançamento
                      </SelectItem>
                      <SelectItem value="validado">Validado</SelectItem>
                      <SelectItem value="cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Categoria */}
                  <Select
                    value={selectedCategoria}
                    onValueChange={setSelectedCategoria}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas as categorias</SelectItem>
                      {categorias.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  {/* Origem */}
                  <Select
                    value={selectedOrigem}
                    onValueChange={setSelectedOrigem}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Origem" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas as origens</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="api">API</SelectItem>
                      <SelectItem value="recorrente">Recorrente</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Período - Seria necessário implementar um DateRangePicker */}
                  {/* Por hora, vamos deixar comentado */}
                  {/* <DateRangePicker
                    value={dateRange}
                    onChange={setDateRange}
                    placeholder="Selecione o período"
                  /> */}
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
                      <TableHead>Data</TableHead>
                      <TableHead>Documento</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Fornecedor/Cliente</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
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
                            <Badge
                              variant="outline"
                              className="font-mono text-xs"
                            >
                              {lancamento.categoria.codigo} -{' '}
                              {lancamento.categoria.nome}
                            </Badge>
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
                      pessoa_responsavel_id: selectedLancamento.pessoa_responsavel_id || undefined,
                      categoria_contabil_id: selectedLancamento.categoria?.id || '',
                      fornecedor_id: selectedLancamento.fornecedor_id || undefined,
                      empresa_fatura: undefined,
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
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              Categoria:
                            </span>
                            <span>{selectedLancamento.categoria.nome}</span>
                          </div>
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
