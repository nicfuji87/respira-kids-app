import React from 'react';
import { format } from 'date-fns';
import {
  Search,
  CheckCircle,
  XCircle,
  AlertCircle,
  FileText,
  DollarSign,
  Receipt,
  Loader2,
  RefreshCw,
  Save,
  LinkIcon,
  Plus,
} from 'lucide-react';
import { Switch } from '@/components/primitives';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Button,
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
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Badge,
} from '@/components/primitives';
import { CurrencyInput } from '@/components/primitives';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { ProdutoSugestaoModal } from './ProdutoSugestaoModal';
import { buscarProdutosSimilares, type Produto } from '@/lib/produto-matching';

// AI dev note: Interface para validação de pré-lançamentos enviados pela API
// ATUALIZADO: Campos editáveis inline diretamente na tabela
// Botões de aprovar/excluir no final de cada linha

interface PreLancamento {
  id: string;
  tipo_lancamento: 'despesa' | 'receita';
  numero_documento?: string | null;
  data_emissao: string;
  data_competencia: string;
  data_vencimento?: string | null;
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
  pago?: boolean; // Indica se já foi pago no momento do cadastro
  fornecedor?: {
    nome_razao_social: string;
    nome_fantasia?: string | null;
  } | null;
  categoria?: {
    nome: string;
    codigo: string;
  } | null;
}

// AI dev note: Interface para sugestão de produto vinculada ao pré-lançamento
interface ProdutoSugestao {
  lancamento_id: string;
  produto_id: string | null;
  produto_nome: string | null;
  match_score: number;
  criar_novo: boolean;
}

interface Fornecedor {
  id: string;
  nome_razao_social: string;
  nome_fantasia?: string | null;
}

interface Categoria {
  id: string;
  nome: string;
  codigo: string;
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
    const [editedData, setEditedData] = React.useState<
      Record<string, Partial<PreLancamento>>
    >({});
    const [fornecedores, setFornecedores] = React.useState<Fornecedor[]>([]);
    const [categorias, setCategorias] = React.useState<Categoria[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [isProcessing, setIsProcessing] = React.useState<string | null>(null);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [selectedPeriod, setSelectedPeriod] = React.useState<string>('todos');
    const { user } = useAuth();
    const { toast } = useToast();

    // AI dev note: Estados para sugestão de produtos
    const [produtoSugestoes, setProdutoSugestoes] = React.useState<
      Record<string, ProdutoSugestao>
    >({});
    const [produtoModalOpen, setProdutoModalOpen] = React.useState(false);
    const [produtoModalLancamento, setProdutoModalLancamento] =
      React.useState<PreLancamento | null>(null);

    // Carregar fornecedores e categorias
    React.useEffect(() => {
      const loadData = async () => {
        try {
          const [fornecedoresRes, categoriasRes] = await Promise.all([
            supabase
              .from('fornecedores')
              .select('id, nome_razao_social, nome_fantasia')
              .eq('ativo', true)
              .order('nome_fantasia'),
            supabase
              .from('categorias_contabeis')
              .select('id, nome, codigo')
              .eq('ativo', true)
              .order('codigo'),
          ]);

          if (fornecedoresRes.data) setFornecedores(fornecedoresRes.data);
          if (categoriasRes.data) setCategorias(categoriasRes.data);
        } catch (error) {
          console.error('Erro ao carregar dados:', error);
        }
      };

      loadData();
    }, []);

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
            )
          `
          )
          .eq('status_lancamento', 'pre_lancamento')
          .eq('origem_lancamento', 'api_ia')
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
        setEditedData({}); // Limpar edições ao recarregar
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

    // AI dev note: Buscar sugestões de produtos para cada pré-lançamento
    const loadProdutoSugestoes = React.useCallback(
      async (lancamentos: PreLancamento[]) => {
        const sugestoes: Record<string, ProdutoSugestao> = {};

        await Promise.all(
          lancamentos.map(async (lancamento) => {
            try {
              const matches = await buscarProdutosSimilares(
                lancamento.descricao,
                1
              );
              const melhorMatch = matches.length > 0 ? matches[0] : null;

              sugestoes[lancamento.id] = {
                lancamento_id: lancamento.id,
                produto_id:
                  melhorMatch?.score && melhorMatch.score >= 70
                    ? melhorMatch.produto.id
                    : null,
                produto_nome: melhorMatch?.produto.nome || null,
                match_score: melhorMatch?.score || 0,
                criar_novo: !melhorMatch || melhorMatch.score < 50,
              };
            } catch {
              sugestoes[lancamento.id] = {
                lancamento_id: lancamento.id,
                produto_id: null,
                produto_nome: null,
                match_score: 0,
                criar_novo: true,
              };
            }
          })
        );

        setProdutoSugestoes(sugestoes);
      },
      []
    );

    // Carregar sugestões quando pré-lançamentos mudam
    React.useEffect(() => {
      if (preLancamentos.length > 0) {
        loadProdutoSugestoes(preLancamentos);
      }
    }, [preLancamentos, loadProdutoSugestoes]);

    // Abrir modal de sugestão de produto
    const handleAbrirProdutoModal = (lancamento: PreLancamento) => {
      setProdutoModalLancamento(lancamento);
      setProdutoModalOpen(true);
    };

    // Callback quando produto é selecionado/criado no modal
    const handleProdutoSelecionado = (
      produto: Produto | null,
      criadoNovo: boolean
    ) => {
      if (!produtoModalLancamento) return;

      setProdutoSugestoes((prev) => ({
        ...prev,
        [produtoModalLancamento.id]: {
          lancamento_id: produtoModalLancamento.id,
          produto_id: produto?.id || null,
          produto_nome: produto?.nome || null,
          match_score: produto ? 100 : 0,
          criar_novo: false,
        },
      }));

      // Se criou novo produto e tem categoria, atualizar categoria do lançamento
      if (criadoNovo && produto?.categoria_contabil_id) {
        setEditedData((prev) => ({
          ...prev,
          [produtoModalLancamento.id]: {
            ...prev[produtoModalLancamento.id],
            categoria_contabil_id: produto.categoria_contabil_id as string,
          },
        }));
      }

      setProdutoModalOpen(false);
      setProdutoModalLancamento(null);
    };

    // Handlers para edição inline
    const handleFieldChange = (id: string, field: string, value: unknown) => {
      setEditedData((prev) => ({
        ...prev,
        [id]: {
          ...prev[id],
          [field]: value,
        },
      }));
    };

    const handleSalvarEdicoes = async (id: string) => {
      const edits = editedData[id];
      if (!edits || Object.keys(edits).length === 0) {
        toast({
          variant: 'destructive',
          title: 'Sem alterações',
          description: 'Nenhuma alteração foi feita neste lançamento.',
        });
        return;
      }

      try {
        setIsProcessing(id);

        // Salvar todas as edições incluindo 'pago'

        const { error } = await supabase
          .from('lancamentos_financeiros')
          .update({
            ...edits,
            atualizado_por: user?.pessoa?.id || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);

        if (error) throw error;

        toast({
          title: 'Alterações salvas',
          description: 'As alterações foram salvas com sucesso.',
        });

        // Remover da lista de editados
        setEditedData((prev) => {
          const newData = { ...prev };
          delete newData[id];
          return newData;
        });

        loadPreLancamentos();
      } catch (error) {
        console.error('Erro ao salvar alterações:', error);
        toast({
          variant: 'destructive',
          title: 'Erro ao salvar',
          description: 'Não foi possível salvar as alterações.',
        });
      } finally {
        setIsProcessing(null);
      }
    };

    const handleAprovar = async (id: string) => {
      try {
        setIsProcessing(id);

        const lancamento = preLancamentos.find((l) => l.id === id);
        if (!lancamento) throw new Error('Lançamento não encontrado');

        // Preparar dados atualizados (incluindo edições)
        const edits = editedData[id] || {};
        const dadosAtualizados = {
          ...edits,
          atualizado_por: user?.pessoa?.id || null,
        };

        // Salvar edições primeiro se houver
        if (Object.keys(dadosAtualizados).length > 0) {
          const { error: updateError } = await supabase
            .from('lancamentos_financeiros')
            .update(dadosAtualizados)
            .eq('id', id);

          if (updateError) throw updateError;
        }

        // Atualizar status para validado
        const { error: statusError } = await supabase
          .from('lancamentos_financeiros')
          .update({
            status_lancamento: 'validado',
            validado_por: user?.pessoa?.id || null,
            validado_em: new Date().toISOString(),
            atualizado_por: user?.pessoa?.id || null,
          })
          .eq('id', id);

        if (statusError) throw statusError;

        // AI dev note: Criar item do lançamento com produto vinculado (se houver)
        const sugestao = produtoSugestoes[id];
        const descricaoItem =
          (editedData[id]?.descricao as string) ?? lancamento.descricao;
        const categoriaItem =
          (editedData[id]?.categoria_contabil_id as string) ??
          lancamento.categoria_contabil_id;
        const valorItem =
          (editedData[id]?.valor_total as number) ?? lancamento.valor_total;

        // Verificar se já existe item para este lançamento
        const { data: existingItem } = await supabase
          .from('lancamento_itens')
          .select('id')
          .eq('lancamento_id', id)
          .single();

        if (!existingItem) {
          // Criar item do lançamento
          const { error: itemError } = await supabase
            .from('lancamento_itens')
            .insert({
              lancamento_id: id,
              item_numero: 1,
              descricao: descricaoItem,
              quantidade: 1,
              valor_unitario: valorItem,
              valor_total: valorItem,
              categoria_contabil_id: categoriaItem,
              produto_id: sugestao?.produto_id || null,
            });

          if (itemError) {
            console.warn('Erro ao criar item do lançamento:', itemError);
            // Não interrompe o fluxo, item é opcional
          }
        }

        // AI dev note: Criar contas a pagar (uma parcela por documento)
        // Se já estiver marcado como pago, criar com status "pago"
        const estaPago =
          (editedData[id]?.pago as boolean | undefined) ??
          lancamento.pago ??
          false;
        const quantidadeParcelas =
          editedData[id]?.quantidade_parcelas ?? lancamento.quantidade_parcelas;
        const valorTotal =
          editedData[id]?.valor_total ?? lancamento.valor_total;

        // AI dev note: Usar data_vencimento se fornecida, senão usar data_emissao
        const dataVencimentoBase = editedData[id]?.data_vencimento
          ? new Date(editedData[id].data_vencimento as string)
          : lancamento.data_vencimento
            ? new Date(lancamento.data_vencimento)
            : new Date(lancamento.data_emissao);

        const contasPagarData = [];
        const valorParcela = Number(valorTotal) / quantidadeParcelas;

        for (let i = 0; i < quantidadeParcelas; i++) {
          const vencimento = new Date(dataVencimentoBase);
          vencimento.setMonth(vencimento.getMonth() + i);

          contasPagarData.push({
            lancamento_id: id,
            numero_parcela: i + 1,
            total_parcelas: quantidadeParcelas,
            valor_parcela: valorParcela,
            data_vencimento: format(vencimento, 'yyyy-MM-dd'),
            status_pagamento: estaPago ? 'pago' : 'pendente',
            data_pagamento: estaPago ? format(new Date(), 'yyyy-MM-dd') : null,
            valor_pago: estaPago ? valorParcela : null,
            valor_final: estaPago ? valorParcela : null,
            pago_por: estaPago ? user?.pessoa?.id || null : null,
          });
        }

        const { error: contasError } = await supabase
          .from('contas_pagar')
          .insert(contasPagarData);

        if (contasError) throw contasError;

        const produtoMsg = sugestao?.produto_nome
          ? ` Produto vinculado: ${sugestao.produto_nome}.`
          : '';

        toast({
          title: 'Lançamento aprovado',
          description: `O lançamento foi aprovado e ${quantidadeParcelas} parcela(s) ${estaPago ? 'marcada(s) como paga(s)' : 'criada(s)'} com sucesso.${produtoMsg}`,
        });

        loadPreLancamentos();
      } catch (error) {
        console.error('Erro ao aprovar:', error);
        toast({
          variant: 'destructive',
          title: 'Erro ao aprovar',
          description: 'Não foi possível aprovar o lançamento.',
        });
      } finally {
        setIsProcessing(null);
      }
    };

    const handleExcluir = async (id: string) => {
      try {
        setIsProcessing(id);

        // AI dev note: Atualizar status para cancelado
        // A tabela não tem colunas cancelado_por/cancelado_em, usar apenas campos existentes
        const { error } = await supabase
          .from('lancamentos_financeiros')
          .update({
            status_lancamento: 'cancelado',
            atualizado_por: user?.pessoa?.id || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);

        if (error) throw error;

        toast({
          title: 'Lançamento excluído',
          description: 'O lançamento foi excluído com sucesso.',
        });

        loadPreLancamentos();
      } catch (error) {
        console.error('Erro ao excluir:', error);
        toast({
          variant: 'destructive',
          title: 'Erro ao excluir',
          description: 'Não foi possível excluir o lançamento.',
        });
      } finally {
        setIsProcessing(null);
      }
    };

    const getTipoIcon = (tipo: 'despesa' | 'receita') => {
      return tipo === 'despesa' ? (
        <DollarSign className="h-4 w-4 text-red-500" />
      ) : (
        <Receipt className="h-4 w-4 text-green-500" />
      );
    };

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

    // Função para obter valor editado ou original
    const getFieldValue = (
      lancamento: PreLancamento,
      field: keyof PreLancamento
    ) => {
      return editedData[lancamento.id]?.[field] ?? lancamento[field];
    };

    return (
      <>
        <Card className={className}>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Validação de Pré-Lançamentos</CardTitle>
                <CardDescription>
                  Revise, edite e valide lançamentos enviados pela IA
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
                <AlertTitle>Campos Editáveis</AlertTitle>
                <AlertDescription>
                  Você pode editar os campos diretamente na tabela. Clique em
                  "Salvar" para confirmar as alterações ou "Aprovar" para
                  validar o lançamento.
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
                      <TableHead>Tipo</TableHead>
                      <TableHead>Documento</TableHead>
                      <TableHead className="min-w-[200px]">Descrição</TableHead>
                      <TableHead className="min-w-[160px]">Produto</TableHead>
                      <TableHead className="min-w-[180px]">
                        Fornecedor
                      </TableHead>
                      <TableHead className="min-w-[150px]">Categoria</TableHead>
                      <TableHead className="min-w-[120px]">Valor</TableHead>
                      <TableHead>Parcelas</TableHead>
                      <TableHead className="min-w-[130px]">
                        Vencimento
                      </TableHead>
                      <TableHead className="min-w-[200px]">
                        Observações
                      </TableHead>
                      <TableHead className="min-w-[100px] text-center">
                        Pago?
                      </TableHead>
                      <TableHead className="text-right min-w-[180px]">
                        Ações
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preLancamentos.map((lancamento) => {
                      const hasChanges =
                        editedData[lancamento.id] &&
                        Object.keys(editedData[lancamento.id]).length > 0;
                      const processing = isProcessing === lancamento.id;

                      return (
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
                            <Input
                              value={
                                (getFieldValue(
                                  lancamento,
                                  'numero_documento'
                                ) as string) || ''
                              }
                              onChange={(e) =>
                                handleFieldChange(
                                  lancamento.id,
                                  'numero_documento',
                                  e.target.value
                                )
                              }
                              placeholder="Nº doc"
                              className="h-8 text-sm"
                            />
                          </TableCell>

                          <TableCell>
                            <Input
                              value={
                                getFieldValue(lancamento, 'descricao') as string
                              }
                              onChange={(e) =>
                                handleFieldChange(
                                  lancamento.id,
                                  'descricao',
                                  e.target.value
                                )
                              }
                              placeholder="Descrição"
                              className="h-8 text-sm"
                            />
                          </TableCell>

                          {/* AI dev note: Coluna de Produto com sugestão automática */}
                          <TableCell>
                            {(() => {
                              const sugestao = produtoSugestoes[lancamento.id];
                              if (!sugestao) {
                                return (
                                  <div className="text-xs text-muted-foreground animate-pulse">
                                    Buscando...
                                  </div>
                                );
                              }
                              if (
                                sugestao.produto_id &&
                                sugestao.produto_nome
                              ) {
                                return (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-8 w-full justify-start text-left text-xs"
                                          onClick={() =>
                                            handleAbrirProdutoModal(lancamento)
                                          }
                                        >
                                          <LinkIcon className="h-3 w-3 mr-1 text-green-600" />
                                          <span className="truncate max-w-[100px]">
                                            {sugestao.produto_nome}
                                          </span>
                                          {sugestao.match_score < 100 && (
                                            <Badge
                                              variant="secondary"
                                              className="ml-1 text-[10px] px-1"
                                            >
                                              {sugestao.match_score}%
                                            </Badge>
                                          )}
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        Clique para alterar produto
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                );
                              }
                              return (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 w-full text-xs"
                                        onClick={() =>
                                          handleAbrirProdutoModal(lancamento)
                                        }
                                      >
                                        <Plus className="h-3 w-3 mr-1" />
                                        Vincular
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      Vincular a produto existente ou criar novo
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              );
                            })()}
                          </TableCell>

                          <TableCell>
                            <Select
                              value={
                                (getFieldValue(
                                  lancamento,
                                  'fornecedor_id'
                                ) as string) || ''
                              }
                              onValueChange={(value) =>
                                handleFieldChange(
                                  lancamento.id,
                                  'fornecedor_id',
                                  value
                                )
                              }
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                              <SelectContent>
                                {fornecedores.map((f) => (
                                  <SelectItem key={f.id} value={f.id}>
                                    {f.nome_fantasia || f.nome_razao_social}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>

                          <TableCell>
                            <Select
                              value={
                                getFieldValue(
                                  lancamento,
                                  'categoria_contabil_id'
                                ) as string
                              }
                              onValueChange={(value) =>
                                handleFieldChange(
                                  lancamento.id,
                                  'categoria_contabil_id',
                                  value
                                )
                              }
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                              <SelectContent>
                                {categorias.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.codigo} - {c.nome}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>

                          <TableCell>
                            <CurrencyInput
                              value={
                                getFieldValue(
                                  lancamento,
                                  'valor_total'
                                ) as number
                              }
                              onChange={(value) =>
                                handleFieldChange(
                                  lancamento.id,
                                  'valor_total',
                                  value
                                )
                              }
                              className="h-8 text-sm"
                            />
                          </TableCell>

                          <TableCell>
                            <Input
                              type="number"
                              min="1"
                              value={
                                getFieldValue(
                                  lancamento,
                                  'quantidade_parcelas'
                                ) as number
                              }
                              onChange={(e) =>
                                handleFieldChange(
                                  lancamento.id,
                                  'quantidade_parcelas',
                                  parseInt(e.target.value) || 1
                                )
                              }
                              className="h-8 text-sm w-16"
                            />
                          </TableCell>

                          <TableCell>
                            <Input
                              type="date"
                              value={
                                (getFieldValue(
                                  lancamento,
                                  'data_vencimento'
                                ) as string) ||
                                lancamento.data_emissao ||
                                ''
                              }
                              onChange={(e) =>
                                handleFieldChange(
                                  lancamento.id,
                                  'data_vencimento',
                                  e.target.value
                                )
                              }
                              className="h-8 text-sm"
                            />
                          </TableCell>

                          <TableCell>
                            <Input
                              value={
                                (getFieldValue(
                                  lancamento,
                                  'observacoes'
                                ) as string) || ''
                              }
                              onChange={(e) =>
                                handleFieldChange(
                                  lancamento.id,
                                  'observacoes',
                                  e.target.value
                                )
                              }
                              placeholder="Observações..."
                              className="h-8 text-sm"
                            />
                          </TableCell>

                          <TableCell>
                            <div className="flex items-center justify-center">
                              <Switch
                                checked={
                                  (editedData[lancamento.id]?.pago as
                                    | boolean
                                    | undefined) ??
                                  lancamento.pago ??
                                  false
                                }
                                onCheckedChange={(checked) =>
                                  handleFieldChange(
                                    lancamento.id,
                                    'pago',
                                    checked
                                  )
                                }
                              />
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              {hasChanges && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-blue-600 hover:text-blue-700"
                                        onClick={() =>
                                          handleSalvarEdicoes(lancamento.id)
                                        }
                                        disabled={processing}
                                      >
                                        {processing ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <Save className="h-4 w-4" />
                                        )}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      Salvar alterações
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}

                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-green-600 hover:text-green-700"
                                      onClick={() =>
                                        handleAprovar(lancamento.id)
                                      }
                                      disabled={processing}
                                    >
                                      {processing ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <CheckCircle className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Aprovar lançamento
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
                                      onClick={() =>
                                        handleExcluir(lancamento.id)
                                      }
                                      disabled={processing}
                                    >
                                      {processing ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <XCircle className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Excluir lançamento
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modal de Sugestão/Criação de Produto */}
        {produtoModalLancamento && (
          <ProdutoSugestaoModal
            isOpen={produtoModalOpen}
            onClose={() => {
              setProdutoModalOpen(false);
              setProdutoModalLancamento(null);
            }}
            descricao={produtoModalLancamento.descricao}
            valorUnitario={produtoModalLancamento.valor_total}
            categoriaId={produtoModalLancamento.categoria_contabil_id}
            categorias={categorias}
            userId={user?.pessoa?.id || null}
            onProdutoSelecionado={handleProdutoSelecionado}
          />
        )}
      </>
    );
  }
);

PreLancamentoValidation.displayName = 'PreLancamentoValidation';
