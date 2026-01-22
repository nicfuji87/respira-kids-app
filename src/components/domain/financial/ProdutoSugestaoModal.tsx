import React from 'react';
import { Package, Plus, Search, Check, Sparkles, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives';
import { CurrencyInput } from '@/components/primitives';
import { cn } from '@/lib/utils';
import {
  buscarProdutosSimilares,
  gerarCodigoProduto,
  criarProdutoRapido,
  type Produto,
  type ProdutoMatch,
} from '@/lib/produto-matching';
import { useToast } from '@/components/primitives/use-toast';

// AI dev note: Modal para sugestão/criação de produto no pré-lançamento
// Permite: vincular a produto existente, criar novo produto, ou ignorar
// Integrado com sistema de matching fuzzy

interface Categoria {
  id: string;
  codigo: string;
  nome: string;
}

interface ProdutoSugestaoModalProps {
  isOpen: boolean;
  onClose: () => void;
  descricao: string;
  valorUnitario: number;
  categoriaId: string | null;
  categorias: Categoria[];
  userId: string | null;
  onProdutoSelecionado: (produto: Produto | null, criadoNovo: boolean) => void;
}

export const ProdutoSugestaoModal = React.memo<ProdutoSugestaoModalProps>(
  ({
    isOpen,
    onClose,
    descricao,
    valorUnitario,
    categoriaId,
    categorias,
    userId,
    onProdutoSelecionado,
  }) => {
    const { toast } = useToast();

    // Estados
    const [activeTab, setActiveTab] = React.useState<
      'sugestao' | 'buscar' | 'criar'
    >('sugestao');
    const [isLoading, setIsLoading] = React.useState(false);
    const [matches, setMatches] = React.useState<ProdutoMatch[]>([]);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [searchResults, setSearchResults] = React.useState<ProdutoMatch[]>(
      []
    );

    // Estados para criar produto
    const [novoCodigo, setNovoCodigo] = React.useState('');
    const [novoNome, setNovoNome] = React.useState('');
    const [novaCategoria, setNovaCategoria] = React.useState<string | null>(
      null
    );
    const [novoPreco, setNovoPreco] = React.useState<number | null>(0);
    const [isCreating, setIsCreating] = React.useState(false);

    // Buscar sugestões ao abrir
    React.useEffect(() => {
      if (isOpen && descricao) {
        setIsLoading(true);
        buscarProdutosSimilares(descricao, 5)
          .then((results) => {
            setMatches(results);
            // Se não encontrou match bom, ir para aba de criar
            if (results.length === 0 || results[0].score < 50) {
              setActiveTab('criar');
            }
          })
          .finally(() => setIsLoading(false));

        // Preencher dados para criação
        setNovoCodigo(gerarCodigoProduto(descricao));
        setNovoNome(descricao);
        setNovaCategoria(categoriaId);
        setNovoPreco(valorUnitario);
      }
    }, [isOpen, descricao, categoriaId, valorUnitario]);

    // Buscar produtos ao digitar
    React.useEffect(() => {
      if (searchTerm.length >= 3) {
        const timer = setTimeout(() => {
          buscarProdutosSimilares(searchTerm, 10).then(setSearchResults);
        }, 300);
        return () => clearTimeout(timer);
      } else {
        setSearchResults([]);
      }
    }, [searchTerm]);

    const handleSelecionarProduto = (produto: Produto) => {
      onProdutoSelecionado(produto, false);
      onClose();
    };

    const handleCriarProduto = async () => {
      if (!novoCodigo || !novoNome) {
        toast({
          variant: 'destructive',
          title: 'Campos obrigatórios',
          description: 'Preencha o código e nome do produto.',
        });
        return;
      }

      setIsCreating(true);
      try {
        const result = await criarProdutoRapido(
          novoCodigo,
          novoNome,
          novaCategoria,
          novoPreco ?? undefined,
          userId
        );

        if (result.success && result.produto) {
          toast({
            title: 'Produto criado',
            description: `Produto "${result.produto.nome}" foi criado com sucesso.`,
          });
          onProdutoSelecionado(result.produto, true);
          onClose();
        } else {
          toast({
            variant: 'destructive',
            title: 'Erro ao criar produto',
            description: result.error || 'Tente novamente.',
          });
        }
      } finally {
        setIsCreating(false);
      }
    };

    const handleIgnorar = () => {
      onProdutoSelecionado(null, false);
      onClose();
    };

    const getScoreBadge = (score: number) => {
      if (score >= 90)
        return <Badge className="bg-green-500">Excelente ({score}%)</Badge>;
      if (score >= 75)
        return <Badge className="bg-blue-500">Bom ({score}%)</Badge>;
      if (score >= 50)
        return <Badge className="bg-yellow-500">Médio ({score}%)</Badge>;
      return <Badge variant="secondary">Baixo ({score}%)</Badge>;
    };

    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Vincular ou Criar Produto
            </DialogTitle>
            <DialogDescription>
              Item: <strong>"{descricao}"</strong>
            </DialogDescription>
          </DialogHeader>

          {/* Tabs */}
          <div className="flex gap-2 border-b pb-2">
            <Button
              variant={activeTab === 'sugestao' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('sugestao')}
              className="flex items-center gap-2"
            >
              <Sparkles className="h-4 w-4" />
              Sugestões ({matches.length})
            </Button>
            <Button
              variant={activeTab === 'buscar' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('buscar')}
              className="flex items-center gap-2"
            >
              <Search className="h-4 w-4" />
              Buscar
            </Button>
            <Button
              variant={activeTab === 'criar' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('criar')}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Criar Novo
            </Button>
          </div>

          {/* Conteúdo das Tabs */}
          <div className="min-h-[300px]">
            {/* Tab Sugestões */}
            {activeTab === 'sugestao' && (
              <div className="space-y-3">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-pulse text-muted-foreground">
                      Buscando produtos similares...
                    </div>
                  </div>
                ) : matches.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Package className="h-12 w-12 text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">
                      Nenhum produto similar encontrado.
                    </p>
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={() => setActiveTab('criar')}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Criar novo produto
                    </Button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground mb-3">
                      Produtos similares encontrados. Clique para vincular:
                    </p>
                    {matches.map((match) => (
                      <div
                        key={match.produto.id}
                        className={cn(
                          'flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors',
                          'hover:bg-accent hover:border-primary'
                        )}
                        onClick={() => handleSelecionarProduto(match.produto)}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {match.produto.nome}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              ({match.produto.codigo})
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                            <span>{match.produto.unidade_medida}</span>
                            <span>•</span>
                            <span>
                              {new Intl.NumberFormat('pt-BR', {
                                style: 'currency',
                                currency: 'BRL',
                              }).format(match.produto.preco_referencia)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {getScoreBadge(match.score)}
                          <Check className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {/* Tab Buscar */}
            {activeTab === 'buscar' && (
              <div className="space-y-3">
                <Input
                  placeholder="Digite para buscar produtos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full"
                />
                {searchTerm.length < 3 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Digite pelo menos 3 caracteres para buscar
                  </p>
                ) : searchResults.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhum produto encontrado
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {searchResults.map((match) => (
                      <div
                        key={match.produto.id}
                        className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-accent"
                        onClick={() => handleSelecionarProduto(match.produto)}
                      >
                        <div>
                          <div className="font-medium">
                            {match.produto.nome}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {match.produto.codigo} •{' '}
                            {match.produto.unidade_medida}
                          </div>
                        </div>
                        <Check className="h-4 w-4 text-muted-foreground" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab Criar */}
            {activeTab === 'criar' && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Criar novo produto a partir deste item:
                </p>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Código *</label>
                    <Input
                      value={novoCodigo}
                      onChange={(e) =>
                        setNovoCodigo(e.target.value.toUpperCase())
                      }
                      placeholder="ALCOOL-70"
                      maxLength={50}
                    />
                    <p className="text-xs text-muted-foreground">
                      Use letras maiúsculas, números e hífen
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Preço de Referência
                    </label>
                    <CurrencyInput
                      value={novoPreco}
                      onChange={setNovoPreco}
                      placeholder="R$ 0,00"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Nome *</label>
                  <Input
                    value={novoNome}
                    onChange={(e) => setNovoNome(e.target.value)}
                    placeholder="Álcool 70%"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Categoria</label>
                  <Select
                    value={novaCategoria || ''}
                    onValueChange={(v) => setNovaCategoria(v || null)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Nenhuma</SelectItem>
                      {categorias.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.codigo} - {cat.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="ghost" onClick={handleIgnorar}>
              <X className="mr-2 h-4 w-4" />
              Ignorar (sem produto)
            </Button>
            {activeTab === 'criar' && (
              <Button
                onClick={handleCriarProduto}
                disabled={isCreating || !novoCodigo || !novoNome}
              >
                {isCreating ? (
                  <div className="animate-spin mr-2 h-4 w-4 border-2 border-background border-t-transparent rounded-full" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Criar e Vincular
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

ProdutoSugestaoModal.displayName = 'ProdutoSugestaoModal';
