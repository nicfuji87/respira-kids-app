import React from 'react';
import { format } from 'date-fns';
import {
  Search,
  CheckCircle,
  XCircle,
  AlertCircle,
  Edit,
  FileText,
  DollarSign,
  Receipt,
  Loader2,
  RefreshCw,
  Eye,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Button,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Skeleton,
  Alert,
  AlertDescription,
  AlertTitle,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/primitives';
import { LancamentoForm } from './LancamentoForm';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

// AI dev note: Interface para validação de pré-lançamentos enviados pela API
// Permite visualizar, editar, aprovar ou rejeitar lançamentos antes da validação final
// Suporta processamento em lote e visualização de documentos anexados

interface PreLancamento {
  id: string;
  tipo_lancamento: 'despesa' | 'receita';
  numero_documento?: string | null;
  data_emissao: string;
  data_competencia: string;
  fornecedor_id?: string | null;
  categoria_contabil_id: string;
  descricao: string;
  observacoes?: string | null;
  valor_total: number;
  quantidade_parcelas: number;
  eh_divisao_socios: boolean;
  pessoa_responsavel_id?: string | null;
  status_lancamento: string;
  origem_lancamento: string;
  arquivo_url?: string | null;
  dados_origem?: Record<string, unknown>;
  created_at: string;
  fornecedor?: {
    nome_razao_social: string;
    nome_fantasia?: string | null;
  } | null;
  categoria?: {
    nome: string;
    codigo: string;
  } | null;
  itens?: {
    descricao: string;
    quantidade: number;
    valor_unitario: number;
    valor_total: number;
  }[];
}

interface PreLancamentoValidationProps {
  showFilters?: boolean;
  className?: string;
}

export const PreLancamentoValidation = React.memo<PreLancamentoValidationProps>(
  ({ showFilters = true, className }) => {
    const [preLancamentos, setPreLancamentos] = React.useState<PreLancamento[]>(
      []
    );
    const [lancamentosSelecionados, setLancamentosSelecionados] =
      React.useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = React.useState(true);
    const [isProcessing, setIsProcessing] = React.useState(false);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [selectedPeriod, setSelectedPeriod] = React.useState<string>('todos');
    const [showEditDialog, setShowEditDialog] = React.useState(false);
    const [lancamentoParaEditar, setLancamentoParaEditar] =
      React.useState<PreLancamento | null>(null);
    const [showDocumentDialog, setShowDocumentDialog] = React.useState(false);
    const [documentoUrl, setDocumentoUrl] = React.useState<string | null>(null);
    const { user } = useAuth();
    const { toast } = useToast();

    // Carregar pré-lançamentos
    const loadPreLancamentos = React.useCallback(async () => {
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
            itens:lancamento_itens (
              descricao,
              quantidade,
              valor_unitario,
              valor_total
            )
          `
          )
          .eq('status_lancamento', 'pre_lancamento')
          .eq('origem_lancamento', 'api')
          .order('created_at', { ascending: false });

        // Filtro por período
        if (selectedPeriod === 'hoje') {
          const hoje = new Date();
          query = query.gte('created_at', format(hoje, 'yyyy-MM-dd'));
        } else if (selectedPeriod === 'semana') {
          const semanaPassada = new Date();
          semanaPassada.setDate(semanaPassada.getDate() - 7);
          query = query.gte('created_at', format(semanaPassada, 'yyyy-MM-dd'));
        } else if (selectedPeriod === 'mes') {
          const mesPassado = new Date();
          mesPassado.setMonth(mesPassado.getMonth() - 1);
          query = query.gte('created_at', format(mesPassado, 'yyyy-MM-dd'));
        }

        // Filtro por busca
        if (searchTerm) {
          query = query.or(
            `descricao.ilike.%${searchTerm}%,numero_documento.ilike.%${searchTerm}%`
          );
        }

        const { data, error } = await query;

        if (error) throw error;
        setPreLancamentos(data || []);
      } catch (error) {
        console.error('Erro ao carregar pré-lançamentos:', error);
        toast({
          variant: 'destructive',
          title: 'Erro ao carregar pré-lançamentos',
          description:
            'Não foi possível carregar os pré-lançamentos pendentes.',
        });
      } finally {
        setIsLoading(false);
      }
    }, [selectedPeriod, searchTerm, toast]);

    React.useEffect(() => {
      loadPreLancamentos();
    }, [loadPreLancamentos]);

    // Handlers
    const handleSelecionarLancamento = (
      lancamentoId: string,
      checked: boolean
    ) => {
      const novosLancamentos = new Set(lancamentosSelecionados);
      if (checked) {
        novosLancamentos.add(lancamentoId);
      } else {
        novosLancamentos.delete(lancamentoId);
      }
      setLancamentosSelecionados(novosLancamentos);
    };

    const handleSelecionarTodos = (checked: boolean) => {
      if (checked) {
        setLancamentosSelecionados(new Set(preLancamentos.map((l) => l.id)));
      } else {
        setLancamentosSelecionados(new Set());
      }
    };

    const handleEditar = (lancamento: PreLancamento) => {
      setLancamentoParaEditar(lancamento);
      setShowEditDialog(true);
    };

    const handleVisualizarDocumento = (url: string) => {
      setDocumentoUrl(url);
      setShowDocumentDialog(true);
    };

    const handleValidarSelecionados = async () => {
      if (lancamentosSelecionados.size === 0) {
        toast({
          variant: 'destructive',
          title: 'Nenhum lançamento selecionado',
          description: 'Selecione pelo menos um lançamento para validar.',
        });
        return;
      }

      try {
        setIsProcessing(true);

        // Atualizar status para validado
        const { error } = await supabase
          .from('lancamentos_financeiros')
          .update({
            status_lancamento: 'validado',
            validado_por: user?.pessoa?.id || null,
            validado_em: new Date().toISOString(),
            atualizado_por: user?.pessoa?.id || null,
          })
          .in('id', Array.from(lancamentosSelecionados));

        if (error) throw error;

        toast({
          title: 'Lançamentos validados',
          description: `${lancamentosSelecionados.size} lançamento(s) foram validados com sucesso.`,
        });

        // Limpar seleção e recarregar
        setLancamentosSelecionados(new Set());
        loadPreLancamentos();
      } catch (error) {
        console.error('Erro ao validar lançamentos:', error);
        toast({
          variant: 'destructive',
          title: 'Erro ao validar',
          description: 'Não foi possível validar os lançamentos selecionados.',
        });
      } finally {
        setIsProcessing(false);
      }
    };

    const handleRejeitarSelecionados = async () => {
      if (lancamentosSelecionados.size === 0) {
        toast({
          variant: 'destructive',
          title: 'Nenhum lançamento selecionado',
          description: 'Selecione pelo menos um lançamento para rejeitar.',
        });
        return;
      }

      try {
        setIsProcessing(true);

        // Atualizar status para cancelado
        const { error } = await supabase
          .from('lancamentos_financeiros')
          .update({
            status_lancamento: 'cancelado',
            cancelado_por: user?.pessoa?.id || null,
            cancelado_em: new Date().toISOString(),
            atualizado_por: user?.pessoa?.id || null,
          })
          .in('id', Array.from(lancamentosSelecionados));

        if (error) throw error;

        toast({
          title: 'Lançamentos rejeitados',
          description: `${lancamentosSelecionados.size} lançamento(s) foram rejeitados.`,
        });

        // Limpar seleção e recarregar
        setLancamentosSelecionados(new Set());
        loadPreLancamentos();
      } catch (error) {
        console.error('Erro ao rejeitar lançamentos:', error);
        toast({
          variant: 'destructive',
          title: 'Erro ao rejeitar',
          description: 'Não foi possível rejeitar os lançamentos selecionados.',
        });
      } finally {
        setIsProcessing(false);
      }
    };

    const handleEditSuccess = () => {
      setShowEditDialog(false);
      setLancamentoParaEditar(null);
      loadPreLancamentos();
    };

    const getTipoIcon = (tipo: 'despesa' | 'receita') => {
      return tipo === 'despesa' ? (
        <DollarSign className="h-4 w-4 text-red-500" />
      ) : (
        <Receipt className="h-4 w-4 text-green-500" />
      );
    };

    const todosSelecionados =
      preLancamentos.length > 0 &&
      preLancamentos.every((l) => lancamentosSelecionados.has(l.id));

    // Estatísticas
    const estatisticas = React.useMemo(() => {
      const total = preLancamentos.length;
      const totalValor = preLancamentos.reduce(
        (sum, l) => sum + l.valor_total,
        0
      );
      const despesas = preLancamentos.filter(
        (l) => l.tipo_lancamento === 'despesa'
      ).length;
      const receitas = preLancamentos.filter(
        (l) => l.tipo_lancamento === 'receita'
      ).length;

      return { total, totalValor, despesas, receitas };
    }, [preLancamentos]);

    return (
      <>
        <Card className={className}>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Validação de Pré-Lançamentos</CardTitle>
                <CardDescription>
                  Revise e valide lançamentos enviados pela IA antes de
                  confirmar
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadPreLancamentos}
                  disabled={isLoading}
                >
                  <RefreshCw
                    className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
                  />
                  Atualizar
                </Button>
                {lancamentosSelecionados.size > 0 && (
                  <>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleRejeitarSelecionados}
                      disabled={isProcessing}
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Rejeitar ({lancamentosSelecionados.size})
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleValidarSelecionados}
                      disabled={isProcessing}
                    >
                      {isProcessing ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle className="mr-2 h-4 w-4" />
                      )}
                      Validar ({lancamentosSelecionados.size})
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Cards de Resumo */}
            {preLancamentos.length > 0 && (
              <div className="mt-4 grid gap-4 md:grid-cols-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">
                          Total Pendente
                        </p>
                        <p className="text-2xl font-bold">
                          {estatisticas.total}
                        </p>
                      </div>
                      <FileText className="h-8 w-8 text-muted-foreground/20" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">
                          Valor Total
                        </p>
                        <p className="text-xl font-bold">
                          {new Intl.NumberFormat('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          }).format(estatisticas.totalValor)}
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
                          Despesas
                        </p>
                        <p className="text-2xl font-bold text-red-600">
                          {estatisticas.despesas}
                        </p>
                      </div>
                      <DollarSign className="h-8 w-8 text-red-600/20" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">
                          Receitas
                        </p>
                        <p className="text-2xl font-bold text-green-600">
                          {estatisticas.receitas}
                        </p>
                      </div>
                      <Receipt className="h-8 w-8 text-green-600/20" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Filtros */}
            {showFilters && (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex-1">
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

                <Tabs value={selectedPeriod} onValueChange={setSelectedPeriod}>
                  <TabsList>
                    <TabsTrigger value="todos">Todos</TabsTrigger>
                    <TabsTrigger value="hoje">Hoje</TabsTrigger>
                    <TabsTrigger value="semana">7 dias</TabsTrigger>
                    <TabsTrigger value="mes">30 dias</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            )}

            {/* Alerta de pré-lançamentos */}
            {preLancamentos.length > 0 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Atenção!</AlertTitle>
                <AlertDescription>
                  Estes lançamentos foram criados automaticamente pela IA e
                  precisam de validação antes de serem confirmados.
                </AlertDescription>
              </Alert>
            )}

            {/* Lista de Pré-Lançamentos */}
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : preLancamentos.length === 0 ? (
              <div className="flex min-h-[400px] flex-col items-center justify-center text-center">
                <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-medium">
                  Nenhum pré-lançamento pendente
                </h3>
                <p className="mb-4 max-w-sm text-sm text-muted-foreground">
                  Não há lançamentos aguardando validação no momento.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">
                        <Checkbox
                          checked={todosSelecionados}
                          onCheckedChange={handleSelecionarTodos}
                          aria-label="Selecionar todos"
                        />
                      </TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Documento</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Fornecedor/Cliente</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Criado em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preLancamentos.map((lancamento) => (
                      <TableRow key={lancamento.id}>
                        <TableCell>
                          <Checkbox
                            checked={lancamentosSelecionados.has(lancamento.id)}
                            onCheckedChange={(checked) =>
                              handleSelecionarLancamento(
                                lancamento.id,
                                checked as boolean
                              )
                            }
                            aria-label={`Selecionar lançamento ${lancamento.id}`}
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
                            <span className="text-sm font-medium">
                              {format(
                                new Date(lancamento.data_emissao),
                                'dd/MM/yyyy'
                              )}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Comp.:{' '}
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
                            {lancamento.arquivo_url && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-auto p-0 text-xs justify-start"
                                onClick={() =>
                                  handleVisualizarDocumento(
                                    lancamento.arquivo_url!
                                  )
                                }
                              >
                                <FileText className="mr-1 h-3 w-3" />
                                Ver documento
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-[200px]">
                            <span className="text-sm font-medium line-clamp-2">
                              {lancamento.descricao}
                            </span>
                            {lancamento.itens &&
                              lancamento.itens.length > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  {lancamento.itens.length} ite
                                  {lancamento.itens.length !== 1 ? 'ns' : 'm'}
                                </span>
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
                            <Badge variant="secondary" className="text-xs">
                              Não identificado
                            </Badge>
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
                            <Badge variant="secondary" className="text-xs">
                              Sem categoria
                            </Badge>
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
                                {lancamento.quantidade_parcelas}x
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(lancamento.created_at), 'dd/MM')}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(lancamento.created_at), 'HH:mm')}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => handleEditar(lancamento)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Editar lançamento
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>

                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-green-600 hover:text-green-700"
                                    onClick={() => {
                                      handleSelecionarLancamento(
                                        lancamento.id,
                                        true
                                      );
                                      handleValidarSelecionados();
                                    }}
                                    disabled={isProcessing}
                                  >
                                    <CheckCircle className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Validar lançamento
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>

                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-red-600 hover:text-red-700"
                                    onClick={() => {
                                      handleSelecionarLancamento(
                                        lancamento.id,
                                        true
                                      );
                                      handleRejeitarSelecionados();
                                    }}
                                    disabled={isProcessing}
                                  >
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Rejeitar lançamento
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dialog de Edição */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar Pré-Lançamento</DialogTitle>
              <DialogDescription>
                Revise e ajuste os dados antes de validar
              </DialogDescription>
            </DialogHeader>
            {lancamentoParaEditar && (
              <LancamentoForm
                lancamento={{
                  ...lancamentoParaEditar,
                  numero_documento:
                    lancamentoParaEditar.numero_documento || undefined,
                  observacoes: lancamentoParaEditar.observacoes || undefined,
                  fornecedor_id:
                    lancamentoParaEditar.fornecedor_id || undefined,
                  pessoa_responsavel_id:
                    lancamentoParaEditar.pessoa_responsavel_id || undefined,
                  arquivo_url: lancamentoParaEditar.arquivo_url || undefined,
                  empresa_fatura: undefined,
                  data_emissao: new Date(lancamentoParaEditar.data_emissao),
                  data_competencia: new Date(
                    lancamentoParaEditar.data_competencia
                  ),
                }}
                onSuccess={handleEditSuccess}
                onCancel={() => {
                  setShowEditDialog(false);
                  setLancamentoParaEditar(null);
                }}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Dialog de Documento */}
        <Dialog open={showDocumentDialog} onOpenChange={setShowDocumentDialog}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Documento Anexado</DialogTitle>
            </DialogHeader>
            {documentoUrl && (
              <div className="w-full h-[600px] overflow-auto">
                <iframe
                  src={documentoUrl}
                  className="w-full h-full"
                  title="Documento"
                />
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  if (documentoUrl) {
                    window.open(documentoUrl, '_blank');
                  }
                }}
              >
                <Eye className="mr-2 h-4 w-4" />
                Abrir em Nova Aba
              </Button>
              <Button onClick={() => setShowDocumentDialog(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }
);

PreLancamentoValidation.displayName = 'PreLancamentoValidation';
