import React from 'react';
import {
  Store,
  Plus,
  TrendingDown,
  TrendingUp,
  ShoppingCart,
  Calendar,
  Trash2,
  BarChart3,
  Award,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Skeleton,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/primitives';
import { CurrencyInput } from '@/components/primitives';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// AI dev note: Componente para gerenciar fornecedores de um produto
// Mostra histórico de preços e permite comparar fornecedores
// Tabela: produto_fornecedor (N:N)

interface ProdutoFornecedor {
  id: string;
  produto_id: string;
  fornecedor_id: string;
  preco_ultima_compra: number | null;
  preco_medio: number | null;
  preco_minimo: number | null;
  preco_maximo: number | null;
  quantidade_compras: number;
  ultima_compra_em: string | null;
  observacoes: string | null;
  ativo: boolean;
  fornecedor: {
    id: string;
    nome_fantasia: string | null;
    nome_razao_social: string;
  };
}

interface Fornecedor {
  id: string;
  nome_fantasia: string | null;
  nome_razao_social: string;
}

interface ProdutoFornecedoresPanelProps {
  produtoId: string;
  produtoNome: string;
  produtoCodigo: string;
  onClose?: () => void;
}

export const ProdutoFornecedoresPanel =
  React.memo<ProdutoFornecedoresPanelProps>(
    ({ produtoId, produtoNome, produtoCodigo }) => {
      const { toast } = useToast();
      const [isLoading, setIsLoading] = React.useState(true);
      const [produtoFornecedores, setProdutoFornecedores] = React.useState<
        ProdutoFornecedor[]
      >([]);
      const [fornecedoresDisponiveis, setFornecedoresDisponiveis] =
        React.useState<Fornecedor[]>([]);

      // Modal de adicionar
      const [showAddModal, setShowAddModal] = React.useState(false);
      const [selectedFornecedor, setSelectedFornecedor] =
        React.useState<string>('');
      const [precoInicial, setPrecoInicial] = React.useState<number | null>(0);
      const [isAdding, setIsAdding] = React.useState(false);

      // Dialog de confirmar exclusão
      const [deleteConfirm, setDeleteConfirm] = React.useState<string | null>(
        null
      );

      // Carregar fornecedores do produto
      const loadProdutoFornecedores = React.useCallback(async () => {
        try {
          setIsLoading(true);

          const { data, error } = await supabase
            .from('produto_fornecedor')
            .select(
              `
            *,
            fornecedor:fornecedor_id (
              id,
              nome_fantasia,
              nome_razao_social
            )
          `
            )
            .eq('produto_id', produtoId)
            .eq('ativo', true)
            .order('preco_ultima_compra', {
              ascending: true,
              nullsFirst: false,
            });

          if (error) throw error;
          setProdutoFornecedores(data || []);
        } catch (error) {
          console.error('Erro ao carregar fornecedores:', error);
          toast({
            variant: 'destructive',
            title: 'Erro',
            description: 'Não foi possível carregar os fornecedores.',
          });
        } finally {
          setIsLoading(false);
        }
      }, [produtoId, toast]);

      // Carregar fornecedores disponíveis (que ainda não estão vinculados)
      const loadFornecedoresDisponiveis = React.useCallback(async () => {
        try {
          // Buscar todos os fornecedores ativos
          const { data: allFornecedores, error: fornError } = await supabase
            .from('fornecedores')
            .select('id, nome_fantasia, nome_razao_social')
            .eq('ativo', true)
            .order('nome_fantasia');

          if (fornError) throw fornError;

          // Buscar IDs já vinculados
          const { data: vinculados, error: vincError } = await supabase
            .from('produto_fornecedor')
            .select('fornecedor_id')
            .eq('produto_id', produtoId)
            .eq('ativo', true);

          if (vincError) throw vincError;

          const vinculadosIds = new Set(
            vinculados?.map((v) => v.fornecedor_id) || []
          );

          // Filtrar apenas não vinculados
          const disponiveis = (allFornecedores || []).filter(
            (f) => !vinculadosIds.has(f.id)
          );
          setFornecedoresDisponiveis(disponiveis);
        } catch (error) {
          console.error('Erro ao carregar fornecedores disponíveis:', error);
        }
      }, [produtoId]);

      React.useEffect(() => {
        loadProdutoFornecedores();
        loadFornecedoresDisponiveis();
      }, [loadProdutoFornecedores, loadFornecedoresDisponiveis]);

      // Adicionar fornecedor ao produto
      const handleAddFornecedor = async () => {
        if (!selectedFornecedor) {
          toast({
            variant: 'destructive',
            title: 'Selecione um fornecedor',
            description: 'Escolha um fornecedor para vincular ao produto.',
          });
          return;
        }

        try {
          setIsAdding(true);

          const preco = precoInicial ?? 0;
          const { error } = await supabase.from('produto_fornecedor').insert({
            produto_id: produtoId,
            fornecedor_id: selectedFornecedor,
            preco_ultima_compra: preco > 0 ? preco : null,
            preco_medio: preco > 0 ? preco : null,
            preco_minimo: preco > 0 ? preco : null,
            preco_maximo: preco > 0 ? preco : null,
            quantidade_compras: preco > 0 ? 1 : 0,
            ultima_compra_em: preco > 0 ? new Date().toISOString() : null,
          });

          if (error) {
            if (error.code === '23505') {
              toast({
                variant: 'destructive',
                title: 'Fornecedor já vinculado',
                description: 'Este fornecedor já está vinculado ao produto.',
              });
              return;
            }
            throw error;
          }

          toast({
            title: 'Fornecedor adicionado',
            description: 'O fornecedor foi vinculado ao produto com sucesso.',
          });

          setShowAddModal(false);
          setSelectedFornecedor('');
          setPrecoInicial(0);
          loadProdutoFornecedores();
          loadFornecedoresDisponiveis();
        } catch (error) {
          console.error('Erro ao adicionar fornecedor:', error);
          toast({
            variant: 'destructive',
            title: 'Erro',
            description: 'Não foi possível adicionar o fornecedor.',
          });
        } finally {
          setIsAdding(false);
        }
      };

      // Remover fornecedor do produto
      const handleRemoveFornecedor = async (id: string) => {
        try {
          const { error } = await supabase
            .from('produto_fornecedor')
            .update({ ativo: false })
            .eq('id', id);

          if (error) throw error;

          toast({
            title: 'Fornecedor removido',
            description: 'O fornecedor foi desvinculado do produto.',
          });

          setDeleteConfirm(null);
          loadProdutoFornecedores();
          loadFornecedoresDisponiveis();
        } catch (error) {
          console.error('Erro ao remover fornecedor:', error);
          toast({
            variant: 'destructive',
            title: 'Erro',
            description: 'Não foi possível remover o fornecedor.',
          });
        }
      };

      // Formatar moeda
      const formatCurrency = (value: number | null) => {
        if (value === null || value === undefined) return '-';
        return new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        }).format(value);
      };

      // Obter nome do fornecedor
      const getFornecedorNome = (fornecedor: Fornecedor) => {
        return fornecedor.nome_fantasia || fornecedor.nome_razao_social;
      };

      // Identificar melhor preço
      const melhorPreco = React.useMemo(() => {
        const comPreco = produtoFornecedores.filter(
          (pf) => pf.preco_ultima_compra !== null
        );
        if (comPreco.length === 0) return null;
        return comPreco.reduce((min, pf) =>
          (pf.preco_ultima_compra || 0) < (min.preco_ultima_compra || Infinity)
            ? pf
            : min
        );
      }, [produtoFornecedores]);

      // Estatísticas gerais
      const estatisticas = React.useMemo(() => {
        const comPreco = produtoFornecedores.filter(
          (pf) => pf.preco_ultima_compra !== null
        );
        if (comPreco.length === 0) return null;

        const precos = comPreco.map((pf) => pf.preco_ultima_compra || 0);
        const precoMedio = precos.reduce((a, b) => a + b, 0) / precos.length;
        const precoMin = Math.min(...precos);
        const precoMax = Math.max(...precos);
        const economia = precoMax - precoMin;
        const percentualEconomia =
          precoMax > 0 ? (economia / precoMax) * 100 : 0;

        return {
          totalFornecedores: produtoFornecedores.length,
          precoMedio,
          precoMin,
          precoMax,
          economia,
          percentualEconomia,
        };
      }, [produtoFornecedores]);

      return (
        <Card className="w-full">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Store className="h-5 w-5" />
                  Fornecedores do Produto
                </CardTitle>
                <CardDescription className="mt-1">
                  <span className="font-mono font-medium">{produtoCodigo}</span>{' '}
                  - {produtoNome}
                </CardDescription>
              </div>
              <Button onClick={() => setShowAddModal(true)} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Fornecedor
              </Button>
            </div>

            {/* Cards de Estatísticas */}
            {estatisticas && (
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border bg-card p-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Store className="h-4 w-4" />
                    Fornecedores
                  </div>
                  <div className="mt-1 text-2xl font-bold">
                    {estatisticas.totalFornecedores}
                  </div>
                </div>

                <div className="rounded-lg border bg-card p-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <TrendingDown className="h-4 w-4 text-green-500" />
                    Menor Preço
                  </div>
                  <div className="mt-1 text-2xl font-bold text-green-600">
                    {formatCurrency(estatisticas.precoMin)}
                  </div>
                </div>

                <div className="rounded-lg border bg-card p-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <TrendingUp className="h-4 w-4 text-red-500" />
                    Maior Preço
                  </div>
                  <div className="mt-1 text-2xl font-bold text-red-600">
                    {formatCurrency(estatisticas.precoMax)}
                  </div>
                </div>

                <div className="rounded-lg border bg-card p-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <BarChart3 className="h-4 w-4" />
                    Economia Potencial
                  </div>
                  <div className="mt-1 text-2xl font-bold text-blue-600">
                    {estatisticas.percentualEconomia.toFixed(0)}%
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatCurrency(estatisticas.economia)} de diferença
                  </div>
                </div>
              </div>
            )}
          </CardHeader>

          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : produtoFornecedores.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Store className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-medium">
                  Nenhum fornecedor vinculado
                </h3>
                <p className="mb-4 max-w-sm text-sm text-muted-foreground">
                  Adicione fornecedores para comparar preços e rastrear compras.
                </p>
                <Button onClick={() => setShowAddModal(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar Primeiro Fornecedor
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fornecedor</TableHead>
                      <TableHead className="text-right">Último Preço</TableHead>
                      <TableHead className="text-right">Preço Médio</TableHead>
                      <TableHead className="text-right">Min / Max</TableHead>
                      <TableHead className="text-center">Compras</TableHead>
                      <TableHead>Última Compra</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {produtoFornecedores.map((pf) => {
                      const isMelhorPreco = melhorPreco?.id === pf.id;

                      return (
                        <TableRow
                          key={pf.id}
                          className={
                            isMelhorPreco
                              ? 'bg-green-50 dark:bg-green-950/20'
                              : ''
                          }
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {isMelhorPreco && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Award className="h-4 w-4 text-green-600" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      Melhor preço atual
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              <span className="font-medium">
                                {getFornecedorNome(pf.fornecedor)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <span
                              className={
                                isMelhorPreco
                                  ? 'font-bold text-green-600'
                                  : 'font-medium'
                              }
                            >
                              {formatCurrency(pf.preco_ultima_compra)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {formatCurrency(pf.preco_medio)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1 text-xs">
                              <span className="text-green-600">
                                {formatCurrency(pf.preco_minimo)}
                              </span>
                              <span className="text-muted-foreground">/</span>
                              <span className="text-red-600">
                                {formatCurrency(pf.preco_maximo)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary">
                              <ShoppingCart className="mr-1 h-3 w-3" />
                              {pf.quantidade_compras}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {pf.ultima_compra_em ? (
                              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                {format(
                                  new Date(pf.ultima_compra_em),
                                  'dd/MM/yyyy',
                                  { locale: ptBR }
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                -
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-red-600 hover:text-red-700"
                                      onClick={() => setDeleteConfirm(pf.id)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Remover fornecedor
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

          {/* Modal de Adicionar Fornecedor */}
          <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5" />
                  Adicionar Fornecedor
                </DialogTitle>
                <DialogDescription>
                  Vincule um fornecedor ao produto{' '}
                  <strong>{produtoNome}</strong>
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Fornecedor *</label>
                  <Select
                    value={selectedFornecedor}
                    onValueChange={setSelectedFornecedor}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um fornecedor..." />
                    </SelectTrigger>
                    <SelectContent>
                      {fornecedoresDisponiveis.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          Todos os fornecedores já estão vinculados
                        </div>
                      ) : (
                        fornecedoresDisponiveis.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {getFornecedorNome(f)}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Preço Inicial (opcional)
                  </label>
                  <CurrencyInput
                    value={precoInicial}
                    onChange={setPrecoInicial}
                    placeholder="R$ 0,00"
                  />
                  <p className="text-xs text-muted-foreground">
                    Se souber o preço deste fornecedor, informe aqui
                  </p>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleAddFornecedor}
                  disabled={isAdding || !selectedFornecedor}
                >
                  {isAdding ? (
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  Adicionar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Dialog de Confirmar Exclusão */}
          <AlertDialog
            open={!!deleteConfirm}
            onOpenChange={() => setDeleteConfirm(null)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remover Fornecedor</AlertDialogTitle>
                <AlertDialogDescription>
                  Tem certeza que deseja remover este fornecedor do produto? O
                  histórico de preços será mantido para consulta.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() =>
                    deleteConfirm && handleRemoveFornecedor(deleteConfirm)
                  }
                  className="bg-red-600 hover:bg-red-700"
                >
                  Remover
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Card>
      );
    }
  );

ProdutoFornecedoresPanel.displayName = 'ProdutoFornecedoresPanel';
