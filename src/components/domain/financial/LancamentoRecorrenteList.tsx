import React from 'react';
import { format } from 'date-fns';
import {
  Search,
  Edit,
  Repeat,
  Calendar,
  DollarSign,
  Users,
  MoreHorizontal,
  CheckCircle,
  XCircle,
  AlertCircle,
  Power,
  Receipt,
  History,
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
  DialogFooter,
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
  Alert,
  AlertDescription,
  AlertTitle,
  Switch,
} from '@/components/primitives';
import { LancamentoRecorrenteForm } from './LancamentoRecorrenteForm';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

// AI dev note: Lista de lançamentos recorrentes com controle de status
// Permite visualizar, editar, ativar/desativar e ver histórico
// Mostra próxima data de geração e estatísticas

interface LancamentoRecorrente {
  id: string;
  tipo_lancamento: 'despesa' | 'receita';
  descricao: string;
  valor: number;
  fornecedor_id?: string | null;
  categoria_contabil_id: string;
  frequencia_recorrencia: string;
  dia_vencimento: number;
  ajustar_fim_semana: boolean;
  data_inicio: string;
  data_fim?: string | null;
  data_proxima_recorrencia: string;
  eh_divisao_socios: boolean;
  ativo: boolean;
  observacoes?: string | null;
  created_at: string;
  fornecedor?: {
    nome_razao_social: string;
    nome_fantasia?: string | null;
  } | null;
  categoria?: {
    nome: string;
    codigo: string;
  } | null;
  criado_por_pessoa?: {
    nome: string;
  } | null;
  // Contagem de lançamentos gerados
  _count?: {
    lancamentos: number;
  };
}

interface LancamentoRecorrenteListProps {
  tipo?: 'todos' | 'despesa' | 'receita';
  showFilters?: boolean;
  className?: string;
}

interface HistoricoLancamento {
  id: string;
  data_emissao: string;
  valor_total: number;
  status_lancamento: string;
  quantidade_parcelas: number;
}

export const LancamentoRecorrenteList =
  React.memo<LancamentoRecorrenteListProps>(
    ({ tipo = 'todos', showFilters = true, className }) => {
      const [lancamentos, setLancamentos] = React.useState<
        LancamentoRecorrente[]
      >([]);
      const [isLoading, setIsLoading] = React.useState(true);
      const [searchTerm, setSearchTerm] = React.useState('');
      const [selectedStatus, setSelectedStatus] =
        React.useState<string>('todos');
      const [selectedFrequencia, setSelectedFrequencia] =
        React.useState<string>('todas');
      const [showForm, setShowForm] = React.useState(false);
      const [selectedLancamento, setSelectedLancamento] =
        React.useState<LancamentoRecorrente | null>(null);
      const [showHistorico, setShowHistorico] = React.useState(false);
      const [historico, setHistorico] = React.useState<HistoricoLancamento[]>(
        []
      );
      const [loadingHistorico, setLoadingHistorico] = React.useState(false);
      const { user } = useAuth();
      const { toast } = useToast();

      // Carregar lançamentos recorrentes
      const loadLancamentos = React.useCallback(async () => {
        try {
          setIsLoading(true);

          let query = supabase
            .from('lancamentos_recorrentes')
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
            criado_por_pessoa:criado_por (
              nome
            )
          `
            )
            .order('ativo', { ascending: false })
            .order('descricao');

          // Filtro por tipo
          if (tipo !== 'todos') {
            query = query.eq('tipo_lancamento', tipo);
          }

          // Filtro por status
          if (selectedStatus === 'ativos') {
            query = query.eq('ativo', true);
          } else if (selectedStatus === 'inativos') {
            query = query.eq('ativo', false);
          }

          // Filtro por frequência
          if (selectedFrequencia !== 'todas') {
            query = query.eq('frequencia_recorrencia', selectedFrequencia);
          }

          // Filtro por busca
          if (searchTerm) {
            query = query.ilike('descricao', `%${searchTerm}%`);
          }

          const { data, error } = await query;

          if (error) throw error;
          setLancamentos(data || []);
        } catch (error) {
          console.error('Erro ao carregar lançamentos recorrentes:', error);
          toast({
            variant: 'destructive',
            title: 'Erro ao carregar lançamentos',
            description:
              'Não foi possível carregar os lançamentos recorrentes.',
          });
        } finally {
          setIsLoading(false);
        }
      }, [tipo, selectedStatus, selectedFrequencia, searchTerm, toast]);

      React.useEffect(() => {
        loadLancamentos();
      }, [loadLancamentos]);

      // Handlers
      const handleEdit = (lancamento: LancamentoRecorrente) => {
        setSelectedLancamento(lancamento);
        setShowForm(true);
      };

      const handleToggleStatus = async (lancamento: LancamentoRecorrente) => {
        try {
          const { error } = await supabase
            .from('lancamentos_recorrentes')
            .update({
              ativo: !lancamento.ativo,
              atualizado_por: user?.id,
            })
            .eq('id', lancamento.id);

          if (error) throw error;

          toast({
            title: lancamento.ativo
              ? 'Lançamento desativado'
              : 'Lançamento ativado',
            description: `O lançamento recorrente foi ${lancamento.ativo ? 'desativado' : 'ativado'} com sucesso.`,
          });

          loadLancamentos();
        } catch (error) {
          console.error('Erro ao alterar status:', error);
          toast({
            variant: 'destructive',
            title: 'Erro ao alterar status',
            description: 'Não foi possível alterar o status do lançamento.',
          });
        }
      };

      const handleViewHistorico = async (lancamento: LancamentoRecorrente) => {
        try {
          setLoadingHistorico(true);
          setSelectedLancamento(lancamento);
          setShowHistorico(true);

          // Buscar lançamentos gerados
          const { data, error } = await supabase
            .from('lancamentos_financeiros')
            .select(
              'id, data_emissao, valor_total, status_lancamento, quantidade_parcelas'
            )
            .eq('lancamento_recorrente_id', lancamento.id)
            .order('data_emissao', { ascending: false });

          if (error) throw error;
          setHistorico(data || []);
        } catch (error) {
          console.error('Erro ao carregar histórico:', error);
          toast({
            variant: 'destructive',
            title: 'Erro ao carregar histórico',
            description:
              'Não foi possível carregar o histórico de lançamentos.',
          });
        } finally {
          setLoadingHistorico(false);
        }
      };

      const handleFormSuccess = () => {
        setShowForm(false);
        setSelectedLancamento(null);
        loadLancamentos();
      };

      const getFrequenciaLabel = (freq: string) => {
        const labels: Record<string, string> = {
          mensal: 'Mensal',
          bimestral: 'Bimestral',
          trimestral: 'Trimestral',
          semestral: 'Semestral',
          anual: 'Anual',
        };
        return labels[freq] || freq;
      };

      const getFrequenciaBadge = (freq: string) => {
        const colors: Record<string, string> = {
          mensal: 'default',
          bimestral: 'secondary',
          trimestral: 'secondary',
          semestral: 'secondary',
          anual: 'secondary',
        };
        return (
          <Badge
            variant={
              (colors[freq] as 'default' | 'secondary' | 'outline') || 'outline'
            }
          >
            {getFrequenciaLabel(freq)}
          </Badge>
        );
      };

      const getTipoIcon = (tipo: 'despesa' | 'receita') => {
        return tipo === 'despesa' ? (
          <DollarSign className="h-4 w-4 text-red-500" />
        ) : (
          <Receipt className="h-4 w-4 text-green-500" />
        );
      };

      const getProximaData = (data: string) => {
        const proxima = new Date(data);
        const hoje = new Date();
        const diffDays = Math.ceil(
          (proxima.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (diffDays < 0) {
          return <Badge variant="destructive">Atrasado</Badge>;
        } else if (diffDays === 0) {
          return <Badge variant="secondary">Hoje</Badge>;
        } else if (diffDays <= 7) {
          return (
            <Badge variant="secondary">
              {diffDays} dia{diffDays !== 1 ? 's' : ''}
            </Badge>
          );
        } else {
          return (
            <span className="text-sm">{format(proxima, 'dd/MM/yyyy')}</span>
          );
        }
      };

      // Calcular totais
      const totais = React.useMemo(() => {
        const ativos = lancamentos.filter((l) => l.ativo);
        const totalMensal = ativos.reduce((sum, l) => {
          let valor = l.valor;
          // Converter para valor mensal baseado na frequência
          switch (l.frequencia_recorrencia) {
            case 'bimestral':
              valor = valor / 2;
              break;
            case 'trimestral':
              valor = valor / 3;
              break;
            case 'semestral':
              valor = valor / 6;
              break;
            case 'anual':
              valor = valor / 12;
              break;
          }
          return sum + (l.tipo_lancamento === 'despesa' ? -valor : valor);
        }, 0);

        const despesasMensais = ativos
          .filter((l) => l.tipo_lancamento === 'despesa')
          .reduce((sum, l) => {
            let valor = l.valor;
            switch (l.frequencia_recorrencia) {
              case 'bimestral':
                valor = valor / 2;
                break;
              case 'trimestral':
                valor = valor / 3;
                break;
              case 'semestral':
                valor = valor / 6;
                break;
              case 'anual':
                valor = valor / 12;
                break;
            }
            return sum + valor;
          }, 0);

        const receitasMensais = ativos
          .filter((l) => l.tipo_lancamento === 'receita')
          .reduce((sum, l) => {
            let valor = l.valor;
            switch (l.frequencia_recorrencia) {
              case 'bimestral':
                valor = valor / 2;
                break;
              case 'trimestral':
                valor = valor / 3;
                break;
              case 'semestral':
                valor = valor / 6;
                break;
              case 'anual':
                valor = valor / 12;
                break;
            }
            return sum + valor;
          }, 0);

        return {
          total: ativos.length,
          totalMensal,
          despesasMensais,
          receitasMensais,
          inativos: lancamentos.filter((l) => !l.ativo).length,
        };
      }, [lancamentos]);

      return (
        <>
          <Card className={className}>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Lançamentos Recorrentes</CardTitle>
                  <CardDescription>
                    Configure despesas e receitas fixas
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    setSelectedLancamento(null);
                    setShowForm(true);
                  }}
                >
                  <Repeat className="mr-2 h-4 w-4" />
                  Novo Recorrente
                </Button>
              </div>

              {/* Cards de Resumo */}
              {lancamentos.length > 0 && (
                <div className="mt-4 grid gap-4 md:grid-cols-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">
                            Ativos
                          </p>
                          <p className="text-2xl font-bold">{totais.total}</p>
                          {totais.inativos > 0 && (
                            <p className="text-xs text-muted-foreground">
                              +{totais.inativos} inativos
                            </p>
                          )}
                        </div>
                        <Power className="h-8 w-8 text-green-500/20" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">
                            Despesas/mês
                          </p>
                          <p className="text-xl font-bold text-red-600">
                            {new Intl.NumberFormat('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            }).format(totais.despesasMensais)}
                          </p>
                        </div>
                        <DollarSign className="h-8 w-8 text-red-500/20" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">
                            Receitas/mês
                          </p>
                          <p className="text-xl font-bold text-green-600">
                            {new Intl.NumberFormat('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            }).format(totais.receitasMensais)}
                          </p>
                        </div>
                        <Receipt className="h-8 w-8 text-green-500/20" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">
                            Saldo/mês
                          </p>
                          <p
                            className={`text-xl font-bold ${totais.totalMensal >= 0 ? 'text-green-600' : 'text-red-600'}`}
                          >
                            {new Intl.NumberFormat('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            }).format(totais.totalMensal)}
                          </p>
                        </div>
                        <CheckCircle
                          className={`h-8 w-8 ${totais.totalMensal >= 0 ? 'text-green-500/20' : 'text-red-500/20'}`}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Filtros */}
              {showFilters && (
                <div className="grid gap-4 md:grid-cols-4">
                  {/* Busca */}
                  <div className="md:col-span-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Buscar por descrição..."
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
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="ativos">Ativos</SelectItem>
                      <SelectItem value="inativos">Inativos</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Frequência */}
                  <Select
                    value={selectedFrequencia}
                    onValueChange={setSelectedFrequencia}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Frequência" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas</SelectItem>
                      <SelectItem value="mensal">Mensal</SelectItem>
                      <SelectItem value="bimestral">Bimestral</SelectItem>
                      <SelectItem value="trimestral">Trimestral</SelectItem>
                      <SelectItem value="semestral">Semestral</SelectItem>
                      <SelectItem value="anual">Anual</SelectItem>
                    </SelectContent>
                  </Select>
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
                  <Repeat className="mb-4 h-12 w-12 text-muted-foreground" />
                  <h3 className="mb-2 text-lg font-medium">
                    Nenhum lançamento recorrente encontrado
                  </h3>
                  <p className="mb-4 max-w-sm text-sm text-muted-foreground">
                    {searchTerm ||
                    selectedStatus !== 'todos' ||
                    selectedFrequencia !== 'todas'
                      ? 'Tente ajustar os filtros de busca.'
                      : 'Configure despesas e receitas que se repetem automaticamente.'}
                  </p>
                  {!searchTerm &&
                    selectedStatus === 'todos' &&
                    selectedFrequencia === 'todas' && (
                      <Button
                        onClick={() => {
                          setSelectedLancamento(null);
                          setShowForm(true);
                        }}
                      >
                        <Repeat className="mr-2 h-4 w-4" />
                        Criar Primeiro Recorrente
                      </Button>
                    )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]">Status</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Fornecedor/Cliente</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead>Frequência</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Próxima</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lancamentos.map((lancamento) => (
                        <TableRow
                          key={lancamento.id}
                          className={!lancamento.ativo ? 'opacity-60' : ''}
                        >
                          <TableCell>
                            <Switch
                              checked={lancamento.ativo}
                              onCheckedChange={() =>
                                handleToggleStatus(lancamento)
                              }
                              aria-label={`${lancamento.ativo ? 'Desativar' : 'Ativar'} lançamento`}
                            />
                          </TableCell>
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
                              <span className="font-medium">
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
                                {lancamento.categoria.codigo}
                              </Badge>
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                -
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {getFrequenciaBadge(
                              lancamento.frequencia_recorrencia
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="font-medium">
                              {new Intl.NumberFormat('pt-BR', {
                                style: 'currency',
                                currency: 'BRL',
                              }).format(lancamento.valor)}
                            </span>
                          </TableCell>
                          <TableCell>
                            {lancamento.ativo ? (
                              getProximaData(
                                lancamento.data_proxima_recorrencia
                              )
                            ) : (
                              <Badge variant="outline">Inativo</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="text-sm">
                                Dia {lancamento.dia_vencimento}
                              </span>
                              {lancamento.ajustar_fim_semana && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Calendar className="h-3 w-3 text-muted-foreground" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      Ajusta para dia útil
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
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
                                  onClick={() => handleEdit(lancamento)}
                                >
                                  <Edit className="mr-2 h-4 w-4" />
                                  Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    handleViewHistorico(lancamento)
                                  }
                                >
                                  <History className="mr-2 h-4 w-4" />
                                  Ver histórico
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => handleToggleStatus(lancamento)}
                                >
                                  <Power className="mr-2 h-4 w-4" />
                                  {lancamento.ativo ? 'Desativar' : 'Ativar'}
                                </DropdownMenuItem>
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
                  {selectedLancamento
                    ? 'Editar Lançamento Recorrente'
                    : 'Novo Lançamento Recorrente'}
                </DialogTitle>
              </DialogHeader>
              <LancamentoRecorrenteForm
                lancamento={
                  selectedLancamento
                    ? {
                        ...selectedLancamento,
                        data_inicio: new Date(selectedLancamento.data_inicio),
                        data_fim: selectedLancamento.data_fim
                          ? new Date(selectedLancamento.data_fim)
                          : null,
                        observacoes:
                          selectedLancamento.observacoes || undefined,
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

          {/* Dialog de Histórico */}
          <Dialog open={showHistorico} onOpenChange={setShowHistorico}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Histórico de Lançamentos</DialogTitle>
                <DialogDescription>
                  {selectedLancamento?.descricao}
                </DialogDescription>
              </DialogHeader>

              {loadingHistorico ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : historico.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Nenhum lançamento gerado</AlertTitle>
                  <AlertDescription>
                    Este lançamento recorrente ainda não gerou nenhum
                    lançamento.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground">
                    Total de {historico.length} lançamento
                    {historico.length !== 1 ? 's' : ''} gerado
                    {historico.length !== 1 ? 's' : ''}
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Parcelas</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historico.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            {format(new Date(item.data_emissao), 'dd/MM/yyyy')}
                          </TableCell>
                          <TableCell>
                            {new Intl.NumberFormat('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            }).format(item.valor_total)}
                          </TableCell>
                          <TableCell>
                            {item.quantidade_parcelas > 1
                              ? `${item.quantidade_parcelas}x`
                              : 'À vista'}
                          </TableCell>
                          <TableCell>
                            {item.status_lancamento === 'validado' ? (
                              <Badge variant="default">
                                <CheckCircle className="mr-1 h-3 w-3" />
                                Validado
                              </Badge>
                            ) : item.status_lancamento === 'cancelado' ? (
                              <Badge variant="destructive">
                                <XCircle className="mr-1 h-3 w-3" />
                                Cancelado
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                {item.status_lancamento}
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowHistorico(false)}
                >
                  Fechar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      );
    }
  );

LancamentoRecorrenteList.displayName = 'LancamentoRecorrenteList';
