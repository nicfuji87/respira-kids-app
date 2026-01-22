import React from 'react';
import {
  Search,
  Plus,
  Edit,
  Package,
  MoreHorizontal,
  CheckCircle,
  XCircle,
  Store,
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
  Dialog,
  DialogContent,
  Sheet,
  SheetContent,
} from '@/components/primitives';
import { ProdutoForm } from './ProdutoForm';
import { ProdutoFornecedoresPanel } from './ProdutoFornecedoresPanel';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';

// AI dev note: Lista de produtos e serviços cadastrados
// Permite busca, edição e gerenciamento do catálogo
// Agora com painel de fornecedores (N:N via produto_fornecedor)

interface Produto {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  unidade_medida: string;
  preco_referencia: number;
  ativo: boolean;
  categoria?: {
    codigo: string;
    nome: string;
  } | null;
  // AI dev note: Fornecedor removido - agora via tabela produto_fornecedor (N:N)
  fornecedores_count?: number;
}

interface ProdutoListProps {
  className?: string;
}

export const ProdutoList = React.memo<ProdutoListProps>(({ className }) => {
  const [produtos, setProdutos] = React.useState<Produto[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedStatus, setSelectedStatus] = React.useState<string>('ativo');
  const [showForm, setShowForm] = React.useState(false);
  const [produtoParaEditar, setProdutoParaEditar] = React.useState<{
    id: string;
    codigo: string;
    nome: string;
    descricao: string | null;
    unidade_medida: string;
    categoria_contabil_id: string | null;
    preco_referencia: number;
    ativo: boolean;
  } | null>(null);
  // AI dev note: Estado para o sheet de fornecedores
  const [produtoFornecedores, setProdutoFornecedores] = React.useState<{
    id: string;
    nome: string;
    codigo: string;
  } | null>(null);
  const { toast } = useToast();

  // Carregar produtos
  // AI dev note: Query atualizada - não busca mais fornecedor_padrao_id
  // Agora conta fornecedores via produto_fornecedor
  const loadProdutos = React.useCallback(async () => {
    try {
      setIsLoading(true);

      let query = supabase
        .from('produtos_servicos')
        .select(
          `
          *,
          categoria:categoria_contabil_id (
            codigo,
            nome
          )
        `
        )
        .order('nome');

      // Filtro por status
      if (selectedStatus === 'ativo') {
        query = query.eq('ativo', true);
      } else if (selectedStatus === 'inativo') {
        query = query.eq('ativo', false);
      }

      // Filtro por busca
      if (searchTerm) {
        query = query.or(
          `nome.ilike.%${searchTerm}%,codigo.ilike.%${searchTerm}%,descricao.ilike.%${searchTerm}%`
        );
      }

      const { data, error } = await query;

      if (error) throw error;

      // Buscar contagem de fornecedores para cada produto
      if (data && data.length > 0) {
        const produtoIds = data.map((p) => p.id);
        const { data: fornecedorCounts } = await supabase
          .from('produto_fornecedor')
          .select('produto_id')
          .in('produto_id', produtoIds)
          .eq('ativo', true);

        // Contar fornecedores por produto
        const countMap = new Map<string, number>();
        fornecedorCounts?.forEach((fc) => {
          countMap.set(fc.produto_id, (countMap.get(fc.produto_id) || 0) + 1);
        });

        // Adicionar contagem aos produtos
        const produtosComContagem = data.map((p) => ({
          ...p,
          fornecedores_count: countMap.get(p.id) || 0,
        }));

        setProdutos(produtosComContagem);
      } else {
        setProdutos(data || []);
      }
    } catch (error) {
      console.error('Erro ao carregar produtos:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar produtos',
        description: 'Não foi possível carregar a lista de produtos.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [selectedStatus, searchTerm, toast]);

  React.useEffect(() => {
    loadProdutos();
  }, [loadProdutos]);

  const handleNovo = () => {
    setProdutoParaEditar(null);
    setShowForm(true);
  };

  const handleEditar = async (produto: Produto) => {
    try {
      // Buscar dados completos do produto (incluindo IDs das relações)
      const { data, error } = await supabase
        .from('produtos_servicos')
        .select('*')
        .eq('id', produto.id)
        .single();

      if (error) throw error;

      setProdutoParaEditar(data);
      setShowForm(true);
    } catch (error) {
      console.error('Erro ao carregar produto:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível carregar os dados do produto.',
      });
    }
  };

  const handleToggleStatus = async (produto: Produto) => {
    try {
      const { error } = await supabase
        .from('produtos_servicos')
        .update({ ativo: !produto.ativo })
        .eq('id', produto.id);

      if (error) throw error;

      toast({
        title: produto.ativo ? 'Produto desativado' : 'Produto ativado',
        description: `O produto foi ${produto.ativo ? 'desativado' : 'ativado'} com sucesso.`,
      });

      loadProdutos();
    } catch (error) {
      console.error('Erro ao alterar status:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao alterar status',
        description: 'Não foi possível alterar o status do produto.',
      });
    }
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setProdutoParaEditar(null);
    loadProdutos();
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  return (
    <>
      <Card className={className}>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Catálogo de Produtos
              </CardTitle>
              <CardDescription>
                Gerencie produtos e serviços para padronizar lançamentos
              </CardDescription>
            </div>
            <Button onClick={handleNovo}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Produto
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Filtros */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, código ou descrição..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="ativo">Ativos</SelectItem>
                <SelectItem value="inativo">Inativos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Lista de Produtos */}
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : produtos.length === 0 ? (
            <div className="flex min-h-[400px] flex-col items-center justify-center text-center">
              <Package className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-medium">
                Nenhum produto encontrado
              </h3>
              <p className="mb-4 max-w-sm text-sm text-muted-foreground">
                {searchTerm
                  ? 'Nenhum produto corresponde à sua busca.'
                  : 'Comece cadastrando seus primeiros produtos.'}
              </p>
              <Button onClick={handleNovo}>
                <Plus className="mr-2 h-4 w-4" />
                Cadastrar Produto
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Unidade</TableHead>
                    <TableHead>Preço Ref.</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Fornecedores</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {produtos.map((produto) => (
                    <TableRow key={produto.id}>
                      <TableCell>
                        <span className="font-mono text-sm font-medium">
                          {produto.codigo}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{produto.nome}</div>
                          {produto.descricao && (
                            <div className="text-xs text-muted-foreground line-clamp-1">
                              {produto.descricao}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {produto.unidade_medida}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(produto.preco_referencia)}
                      </TableCell>
                      <TableCell>
                        {produto.categoria ? (
                          <Badge variant="secondary" className="text-xs">
                            {produto.categoria.codigo}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            -
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-auto p-1"
                          onClick={() =>
                            setProdutoFornecedores({
                              id: produto.id,
                              nome: produto.nome,
                              codigo: produto.codigo,
                            })
                          }
                        >
                          <Badge
                            variant={
                              produto.fornecedores_count &&
                              produto.fornecedores_count > 0
                                ? 'default'
                                : 'secondary'
                            }
                            className="cursor-pointer"
                          >
                            <Store className="mr-1 h-3 w-3" />
                            {produto.fornecedores_count || 0}
                          </Badge>
                        </Button>
                      </TableCell>
                      <TableCell>
                        {produto.ativo ? (
                          <Badge
                            variant="default"
                            className="bg-green-500 hover:bg-green-600"
                          >
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Ativo
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <XCircle className="mr-1 h-3 w-3" />
                            Inativo
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Ações</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleEditar(produto)}
                              >
                                <Edit className="mr-2 h-4 w-4" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  setProdutoFornecedores({
                                    id: produto.id,
                                    nome: produto.nome,
                                    codigo: produto.codigo,
                                  })
                                }
                              >
                                <Store className="mr-2 h-4 w-4" />
                                Fornecedores ({produto.fornecedores_count || 0})
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleToggleStatus(produto)}
                              >
                                {produto.ativo ? (
                                  <>
                                    <XCircle className="mr-2 h-4 w-4" />
                                    Desativar
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle className="mr-2 h-4 w-4" />
                                    Ativar
                                  </>
                                )}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
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

      {/* Dialog de Formulário */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl">
          <ProdutoForm
            produto={produtoParaEditar || undefined}
            onSuccess={handleFormSuccess}
            onCancel={() => {
              setShowForm(false);
              setProdutoParaEditar(null);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Sheet de Fornecedores */}
      <Sheet
        open={!!produtoFornecedores}
        onOpenChange={(open) => !open && setProdutoFornecedores(null)}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl overflow-y-auto"
        >
          {produtoFornecedores && (
            <ProdutoFornecedoresPanel
              produtoId={produtoFornecedores.id}
              produtoNome={produtoFornecedores.nome}
              produtoCodigo={produtoFornecedores.codigo}
              onClose={() => {
                setProdutoFornecedores(null);
                loadProdutos(); // Recarregar para atualizar contagem
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
});

ProdutoList.displayName = 'ProdutoList';
