import React from 'react';
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Plus,
  Edit,
  Trash2,
  Search,
  MoreVertical,
} from 'lucide-react';
import {
  Button,
  Input,
  Badge,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ScrollArea,
} from '@/components/primitives';
import { CategoriaForm } from './CategoriaForm';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

// AI dev note: Visualização hierárquica de categorias contábeis em árvore
// Suporta expansão/colapso, busca, e ações CRUD integradas
// Exibe cores e badges de acordo com o nível

interface Categoria {
  id: string;
  codigo: string;
  nome: string;
  descricao?: string;
  categoria_pai_id?: string | null;
  nivel: number;
  cor?: string;
  ordem_exibicao: number;
  ativo: boolean;
  _children?: Categoria[];
  _expanded?: boolean;
}

export const CategoriaTree = React.memo(() => {
  const [categorias, setCategorias] = React.useState<Categoria[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [showForm, setShowForm] = React.useState(false);
  const [editingCategoria, setEditingCategoria] =
    React.useState<Categoria | null>(null);
  const [deletingCategoria, setDeletingCategoria] =
    React.useState<Categoria | null>(null);
  const [expandedNodes, setExpandedNodes] = React.useState<Set<string>>(
    new Set()
  );
  const { toast } = useToast();

  // Carregar categorias
  const loadCategorias = React.useCallback(async () => {
    try {
      setIsLoading(true);

      const { data, error } = await supabase
        .from('categorias_contabeis')
        .select('*')
        .order('nivel')
        .order('ordem_exibicao')
        .order('nome');

      if (error) throw error;

      // Construir árvore
      const categoriasMap = new Map<string, Categoria>();
      const roots: Categoria[] = [];

      // Primeira passada: criar map
      (data || []).forEach((cat) => {
        categoriasMap.set(cat.id, { ...cat, _children: [] });
      });

      // Segunda passada: construir hierarquia
      (data || []).forEach((cat) => {
        const categoria = categoriasMap.get(cat.id)!;

        if (cat.categoria_pai_id && categoriasMap.has(cat.categoria_pai_id)) {
          const pai = categoriasMap.get(cat.categoria_pai_id)!;
          pai._children!.push(categoria);
        } else {
          roots.push(categoria);
        }
      });

      setCategorias(roots);
    } catch (error) {
      console.error('Erro ao carregar categorias:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar',
        description: 'Não foi possível carregar as categorias.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    loadCategorias();
  }, [loadCategorias]);

  // Toggle expansão
  const toggleExpanded = (categoriaId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(categoriaId)) {
        next.delete(categoriaId);
      } else {
        next.add(categoriaId);
      }
      return next;
    });
  };

  // Filtrar categorias recursivamente
  const filterCategorias = React.useCallback(
    (cats: Categoria[], term: string): Categoria[] => {
      if (!term) return cats;

      const filtered: Categoria[] = [];

      cats.forEach((cat) => {
        const childrenFiltered = cat._children
          ? filterCategorias(cat._children, term)
          : [];

        if (
          cat.nome.toLowerCase().includes(term.toLowerCase()) ||
          cat.codigo.toLowerCase().includes(term.toLowerCase()) ||
          childrenFiltered.length > 0
        ) {
          filtered.push({
            ...cat,
            _children: childrenFiltered,
            _expanded: childrenFiltered.length > 0,
          });

          // Auto-expandir se tem filhos que correspondem
          if (childrenFiltered.length > 0) {
            setExpandedNodes((prev) => new Set([...prev, cat.id]));
          }
        }
      });

      return filtered;
    },
    []
  );

  const filteredCategorias = React.useMemo(
    () => filterCategorias(categorias, searchTerm),
    [categorias, searchTerm, filterCategorias]
  );

  // Handlers
  const handleEdit = (categoria: Categoria) => {
    setEditingCategoria(categoria);
    setShowForm(true);
  };

  const handleDelete = async () => {
    if (!deletingCategoria) return;

    try {
      // Verificar se tem filhos
      const temFilhos = categorias.some(
        (cat) =>
          cat.categoria_pai_id === deletingCategoria.id ||
          (cat._children &&
            cat._children.some(
              (child) => child.categoria_pai_id === deletingCategoria.id
            ))
      );

      if (temFilhos) {
        toast({
          variant: 'destructive',
          title: 'Não é possível excluir',
          description:
            'Esta categoria possui subcategorias. Remova as subcategorias primeiro.',
        });
        return;
      }

      const { error } = await supabase
        .from('categorias_contabeis')
        .update({ ativo: false })
        .eq('id', deletingCategoria.id);

      if (error) throw error;

      toast({
        title: 'Categoria inativada',
        description: 'A categoria foi marcada como inativa.',
      });

      loadCategorias();
    } catch (error) {
      console.error('Erro ao inativar categoria:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao inativar',
        description: 'Não foi possível inativar a categoria.',
      });
    } finally {
      setDeletingCategoria(null);
    }
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingCategoria(null);
    loadCategorias();
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingCategoria(null);
  };

  // Renderizar nó da árvore
  const renderTreeNode = (categoria: Categoria, level: number = 0) => {
    const hasChildren = categoria._children && categoria._children.length > 0;
    const isExpanded = expandedNodes.has(categoria.id);

    return (
      <div key={categoria.id}>
        <div
          className={cn(
            'group flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-accent/50 transition-colors',
            !categoria.ativo && 'opacity-50'
          )}
          style={{ paddingLeft: `${level * 24 + 12}px` }}
        >
          {/* Expand/Collapse */}
          <button
            onClick={() => hasChildren && toggleExpanded(categoria.id)}
            className={cn(
              'flex h-5 w-5 items-center justify-center rounded hover:bg-accent',
              !hasChildren && 'invisible'
            )}
          >
            {hasChildren &&
              (isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              ))}
          </button>

          {/* Ícone */}
          <div className="flex items-center">
            {isExpanded ? (
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Folder className="h-4 w-4 text-muted-foreground" />
            )}
          </div>

          {/* Cor (apenas nível 1) */}
          {categoria.nivel === 1 && categoria.cor && (
            <div
              className="h-4 w-4 rounded"
              style={{ backgroundColor: categoria.cor }}
            />
          )}

          {/* Nome */}
          <span className="flex-1 font-medium">{categoria.nome}</span>

          {/* Código */}
          <code className="text-xs text-muted-foreground">
            {categoria.codigo}
          </code>

          {/* Badge de status */}
          {!categoria.ativo && (
            <Badge variant="destructive" className="text-xs">
              Inativo
            </Badge>
          )}

          {/* Ações */}
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleEdit(categoria)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Editar
                </DropdownMenuItem>
                {categoria.ativo && (
                  <DropdownMenuItem
                    onClick={() => setDeletingCategoria(categoria)}
                    className="text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Inativar
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Renderizar filhos */}
        {hasChildren && isExpanded && (
          <div>
            {categoria._children!.map((child) =>
              renderTreeNode(child, level + 1)
            )}
          </div>
        )}
      </div>
    );
  };

  if (showForm) {
    return (
      <div className="space-y-4">
        <CategoriaForm
          categoria={editingCategoria || undefined}
          onSuccess={handleFormSuccess}
          onCancel={handleFormCancel}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header e Ações */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Categorias Contábeis</h2>
          <p className="text-muted-foreground">
            Gerencie a estrutura de categorias para classificação contábil
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Categoria
        </Button>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar categorias..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Árvore */}
      <div className="rounded-lg border">
        <ScrollArea className="h-[500px]">
          <div className="p-4">
            {isLoading ? (
              <div className="text-center text-muted-foreground">
                Carregando...
              </div>
            ) : filteredCategorias.length === 0 ? (
              <div className="text-center text-muted-foreground">
                {searchTerm
                  ? 'Nenhuma categoria encontrada'
                  : 'Nenhuma categoria cadastrada'}
              </div>
            ) : (
              <div>
                {filteredCategorias.map((categoria) =>
                  renderTreeNode(categoria)
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded bg-primary" />
          <span>Grupos (Nível 1)</span>
        </div>
        <div className="flex items-center gap-2">
          <Folder className="h-4 w-4" />
          <span>Classificações e Subclassificações</span>
        </div>
      </div>

      {/* Modal de Confirmação de Exclusão */}
      <Dialog
        open={!!deletingCategoria}
        onOpenChange={() => setDeletingCategoria(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Inativação</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja inativar a categoria{' '}
              <strong>{deletingCategoria?.nome}</strong>?
              <br />
              Esta ação pode ser revertida alterando o status da categoria.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletingCategoria(null)}
            >
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Inativar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

CategoriaTree.displayName = 'CategoriaTree';
