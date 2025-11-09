import React from 'react';
import {
  Building,
  User,
  Search,
  Plus,
  Edit,
  Trash2,
  Wallet,
  CreditCard,
  PiggyBank,
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
} from '@/components/primitives';
import { ContaBancariaForm } from './ContaBancariaForm';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

// AI dev note: Lista de contas bancárias com filtros e ações CRUD
// Exibe contas da clínica e de sócios com saldos formatados
// Integração com formulário de edição

interface ContaBancaria {
  id: string;
  pessoa_id?: string | null;
  pessoa?: {
    nome: string;
  };
  tipo_conta: 'corrente' | 'poupanca' | 'investimento';
  banco_codigo: string;
  banco_nome: string;
  agencia: string;
  conta: string;
  digito: string;
  titular: string;
  saldo_inicial: number;
  observacoes?: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export const ContaBancariaList = React.memo(() => {
  const [contas, setContas] = React.useState<ContaBancaria[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [showForm, setShowForm] = React.useState(false);
  const [editingConta, setEditingConta] = React.useState<ContaBancaria | null>(
    null
  );
  const [deletingConta, setDeletingConta] =
    React.useState<ContaBancaria | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  // Carregar contas
  const loadContas = React.useCallback(async () => {
    try {
      setIsLoading(true);

      let query = supabase.from('contas_bancarias').select(
        `
          *,
          pessoa:pessoas!contas_bancarias_pessoa_id_fkey(nome)
        `
      );

      // Se for profissional, filtrar apenas suas próprias contas
      if (user?.pessoa?.role === 'profissional' && user?.pessoa?.id) {
        query = query.eq('pessoa_id', user.pessoa.id);
      }

      const { data, error } = await query.order('banco_nome').order('titular');

      if (error) throw error;

      setContas(data || []);
    } catch (error) {
      console.error('Erro ao carregar contas:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar',
        description: 'Não foi possível carregar as contas bancárias.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast, user?.pessoa?.role, user?.pessoa?.id]);

  React.useEffect(() => {
    loadContas();
  }, [loadContas]);

  // Filtrar contas localmente
  const filteredContas = React.useMemo(() => {
    return contas.filter((conta) => {
      const searchLower = searchTerm.toLowerCase();
      return (
        conta.titular.toLowerCase().includes(searchLower) ||
        conta.banco_nome.toLowerCase().includes(searchLower) ||
        conta.agencia.includes(searchTerm) ||
        conta.conta.includes(searchTerm) ||
        (conta.pessoa?.nome?.toLowerCase().includes(searchLower) ?? false)
      );
    });
  }, [contas, searchTerm]);

  // Formatação de moeda
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  // Ícone do tipo de conta
  const getTipoContaIcon = (tipo: string) => {
    switch (tipo) {
      case 'corrente':
        return <CreditCard className="h-4 w-4" />;
      case 'poupanca':
        return <PiggyBank className="h-4 w-4" />;
      case 'investimento':
        return <Wallet className="h-4 w-4" />;
      default:
        return null;
    }
  };

  // Nome do tipo de conta
  const getTipoContaNome = (tipo: string) => {
    switch (tipo) {
      case 'corrente':
        return 'Conta Corrente';
      case 'poupanca':
        return 'Poupança';
      case 'investimento':
        return 'Investimento';
      default:
        return tipo;
    }
  };

  // Handlers
  const handleEdit = (conta: ContaBancaria) => {
    setEditingConta(conta);
    setShowForm(true);
  };

  const handleDelete = async () => {
    if (!deletingConta) return;

    try {
      const { error } = await supabase
        .from('contas_bancarias')
        .update({ ativo: false })
        .eq('id', deletingConta.id);

      if (error) throw error;

      toast({
        title: 'Conta inativada',
        description: 'A conta bancária foi marcada como inativa.',
      });

      loadContas();
    } catch (error) {
      console.error('Erro ao inativar conta:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao inativar',
        description: 'Não foi possível inativar a conta bancária.',
      });
    } finally {
      setDeletingConta(null);
    }
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingConta(null);
    loadContas();
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingConta(null);
  };

  if (showForm) {
    return (
      <div className="space-y-4">
        <ContaBancariaForm
          conta={editingConta || undefined}
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
          <h2 className="text-2xl font-bold">Contas Bancárias</h2>
          <p className="text-muted-foreground">
            Gerencie as contas bancárias da clínica e sócios
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Conta
        </Button>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por titular, banco, agência ou conta..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Tabela */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Titular</TableHead>
              <TableHead>Banco</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Conta</TableHead>
              <TableHead className="text-right">Saldo Inicial</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : filteredContas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center">
                  Nenhuma conta encontrada
                </TableCell>
              </TableRow>
            ) : (
              filteredContas.map((conta) => (
                <TableRow key={conta.id}>
                  <TableCell>
                    <div className="flex items-start gap-2">
                      {conta.pessoa_id ? (
                        <User className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Building className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      )}
                      <div>
                        <p className="font-medium">{conta.titular}</p>
                        {conta.pessoa?.nome && (
                          <p className="text-sm text-muted-foreground">
                            {conta.pessoa.nome}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{conta.banco_nome}</p>
                      <p className="text-sm text-muted-foreground">
                        Código: {conta.banco_codigo}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getTipoContaIcon(conta.tipo_conta)}
                      <span className="text-sm">
                        {getTipoContaNome(conta.tipo_conta)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="text-sm">
                      Ag: {conta.agencia} | CC: {conta.conta}-{conta.digito}
                    </code>
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={cn(
                        'font-mono font-medium',
                        conta.saldo_inicial >= 0
                          ? 'text-green-600'
                          : 'text-red-600'
                      )}
                    >
                      {formatCurrency(conta.saldo_inicial)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={conta.ativo ? 'default' : 'destructive'}>
                      {conta.ativo ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(conta)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {conta.ativo && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingConta(conta)}
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

      {/* Resumo */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Building className="h-4 w-4" />
            Contas da Clínica
          </div>
          <p className="mt-1 text-2xl font-bold">
            {contas.filter((c) => !c.pessoa_id && c.ativo).length}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="h-4 w-4" />
            Contas de Sócios
          </div>
          <p className="mt-1 text-2xl font-bold">
            {contas.filter((c) => c.pessoa_id && c.ativo).length}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Wallet className="h-4 w-4" />
            Saldo Total
          </div>
          <p
            className={cn(
              'mt-1 text-2xl font-bold',
              contas.reduce(
                (sum, c) => sum + (c.ativo ? c.saldo_inicial : 0),
                0
              ) >= 0
                ? 'text-green-600'
                : 'text-red-600'
            )}
          >
            {formatCurrency(
              contas.reduce(
                (sum, c) => sum + (c.ativo ? c.saldo_inicial : 0),
                0
              )
            )}
          </p>
        </div>
      </div>

      {/* Modal de Confirmação de Exclusão */}
      <Dialog
        open={!!deletingConta}
        onOpenChange={() => setDeletingConta(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Inativação</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja inativar a conta{' '}
              <strong>
                {deletingConta?.banco_nome} - Ag: {deletingConta?.agencia} CC:{' '}
                {deletingConta?.conta}-{deletingConta?.digito}
              </strong>
              ?
              <br />
              Esta ação pode ser revertida alterando o status da conta.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingConta(null)}>
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

ContaBancariaList.displayName = 'ContaBancariaList';
