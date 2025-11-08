import React from 'react';
import {
  Building2,
  User,
  Search,
  Plus,
  Edit,
  Trash2,
  Filter,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Button,
  Input,
  Badge,
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
} from '@/components/primitives';
import { FornecedorForm } from './FornecedorForm';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';

// AI dev note: Lista de fornecedores com busca, filtros e ações CRUD
// Exibe fornecedores com diferentes visualizações para PF e PJ
// Integração com formulário de edição e exclusão lógica (soft delete)

interface Fornecedor {
  id: string;
  tipo_pessoa: 'fisica' | 'juridica';
  nome_razao_social: string;
  nome_fantasia?: string;
  cpf_cnpj: string;
  email?: string;
  telefone?: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export const FornecedorList = React.memo(() => {
  const [fornecedores, setFornecedores] = React.useState<Fornecedor[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [tipoFilter, setTipoFilter] = React.useState<
    'todos' | 'fisica' | 'juridica'
  >('todos');
  const [statusFilter, setStatusFilter] = React.useState<
    'todos' | 'ativos' | 'inativos'
  >('ativos');
  const [showForm, setShowForm] = React.useState(false);
  const [editingFornecedor, setEditingFornecedor] =
    React.useState<Fornecedor | null>(null);
  const [deletingFornecedor, setDeletingFornecedor] =
    React.useState<Fornecedor | null>(null);
  const { toast } = useToast();

  // Carregar fornecedores
  const loadFornecedores = React.useCallback(async () => {
    try {
      setIsLoading(true);

      let query = supabase
        .from('fornecedores')
        .select('*')
        .order('nome_razao_social', { ascending: true });

      // Filtros
      if (statusFilter !== 'todos') {
        query = query.eq('ativo', statusFilter === 'ativos');
      }

      if (tipoFilter !== 'todos') {
        query = query.eq('tipo_pessoa', tipoFilter);
      }

      const { data, error } = await query;

      if (error) throw error;

      setFornecedores(data || []);
    } catch (error) {
      console.error('Erro ao carregar fornecedores:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar',
        description: 'Não foi possível carregar a lista de fornecedores.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, tipoFilter, toast]);

  React.useEffect(() => {
    loadFornecedores();
  }, [loadFornecedores]);

  // Filtrar fornecedores localmente
  const filteredFornecedores = React.useMemo(() => {
    return fornecedores.filter((fornecedor) => {
      const searchLower = searchTerm.toLowerCase();
      return (
        fornecedor.nome_razao_social.toLowerCase().includes(searchLower) ||
        (fornecedor.nome_fantasia?.toLowerCase().includes(searchLower) ??
          false) ||
        fornecedor.cpf_cnpj.includes(searchTerm) ||
        (fornecedor.email?.toLowerCase().includes(searchLower) ?? false)
      );
    });
  }, [fornecedores, searchTerm]);

  // Formatação de documento
  const formatarDocumento = (cpfCnpj: string, tipo: 'fisica' | 'juridica') => {
    if (tipo === 'fisica') {
      // CPF: XXX.XXX.XXX-XX
      return cpfCnpj.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    } else {
      // CNPJ: XX.XXX.XXX/XXXX-XX
      return cpfCnpj.replace(
        /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
        '$1.$2.$3/$4-$5'
      );
    }
  };

  // Formatação de telefone
  const formatarTelefone = (telefone?: string) => {
    if (!telefone) return '-';
    const cleaned = telefone.replace(/\D/g, '');
    if (cleaned.length === 11) {
      return cleaned.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    } else if (cleaned.length === 10) {
      return cleaned.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    }
    return telefone;
  };

  // Handlers
  const handleEdit = (fornecedor: Fornecedor) => {
    setEditingFornecedor(fornecedor);
    setShowForm(true);
  };

  const handleDelete = async () => {
    if (!deletingFornecedor) return;

    try {
      const { error } = await supabase
        .from('fornecedores')
        .update({ ativo: false })
        .eq('id', deletingFornecedor.id);

      if (error) throw error;

      toast({
        title: 'Fornecedor inativado',
        description: 'O fornecedor foi marcado como inativo.',
      });

      loadFornecedores();
    } catch (error) {
      console.error('Erro ao inativar fornecedor:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao inativar',
        description: 'Não foi possível inativar o fornecedor.',
      });
    } finally {
      setDeletingFornecedor(null);
    }
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingFornecedor(null);
    loadFornecedores();
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingFornecedor(null);
  };

  if (showForm) {
    return (
      <div className="space-y-4">
        <FornecedorForm
          fornecedor={editingFornecedor || undefined}
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
          <h2 className="text-2xl font-bold">Fornecedores</h2>
          <p className="text-muted-foreground">
            Gerencie os fornecedores da clínica
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Fornecedor
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 md:flex-row">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, CNPJ/CPF, email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Select
            value={tipoFilter}
            onValueChange={(v: 'todos' | 'fisica' | 'juridica') =>
              setTipoFilter(v)
            }
          >
            <SelectTrigger className="w-[140px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos tipos</SelectItem>
              <SelectItem value="juridica">Pessoa Jurídica</SelectItem>
              <SelectItem value="fisica">Pessoa Física</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={statusFilter}
            onValueChange={(v: 'todos' | 'ativos' | 'inativos') =>
              setStatusFilter(v)
            }
          >
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="ativos">Ativos</SelectItem>
              <SelectItem value="inativos">Inativos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Nome/Razão Social</TableHead>
              <TableHead>CPF/CNPJ</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : filteredFornecedores.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">
                  Nenhum fornecedor encontrado
                </TableCell>
              </TableRow>
            ) : (
              filteredFornecedores.map((fornecedor) => (
                <TableRow key={fornecedor.id}>
                  <TableCell>
                    <div className="flex items-center">
                      {fornecedor.tipo_pessoa === 'juridica' ? (
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <User className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">
                        {fornecedor.nome_razao_social}
                      </p>
                      {fornecedor.nome_fantasia && (
                        <p className="text-sm text-muted-foreground">
                          {fornecedor.nome_fantasia}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="text-sm">
                      {formatarDocumento(
                        fornecedor.cpf_cnpj,
                        fornecedor.tipo_pessoa
                      )}
                    </code>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {fornecedor.email && (
                        <p className="truncate max-w-[200px]">
                          {fornecedor.email}
                        </p>
                      )}
                      <p className="text-muted-foreground">
                        {formatarTelefone(fornecedor.telefone?.toString())}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={fornecedor.ativo ? 'default' : 'destructive'}
                    >
                      {fornecedor.ativo ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(fornecedor)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {fornecedor.ativo && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingFornecedor(fornecedor)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Modal de Confirmação de Exclusão */}
      <Dialog
        open={!!deletingFornecedor}
        onOpenChange={() => setDeletingFornecedor(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Inativação</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja inativar o fornecedor{' '}
              <strong>{deletingFornecedor?.nome_razao_social}</strong>?
              <br />
              Esta ação pode ser revertida alterando o status do fornecedor.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletingFornecedor(null)}
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

FornecedorList.displayName = 'FornecedorList';
