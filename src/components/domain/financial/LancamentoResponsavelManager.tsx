import React from 'react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Search,
  Users,
  User,
  UserX,
  CheckCircle,
  AlertCircle,
  Filter,
  CheckSquare,
  RefreshCw,
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
  Checkbox,
  Alert,
  AlertDescription,
  AlertTitle,
  Label,
} from '@/components/primitives';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';

// AI dev note: Interface para gerenciar atribuição de responsáveis nos lançamentos
// Permite atribuir/remover responsável em lote
// Filtra por: atribuição (com/sem responsável), tipo de divisão, período
// Útil para organizar gastos individuais entre sócios

interface Lancamento {
  id: string;
  tipo_lancamento: 'despesa' | 'receita';
  data_emissao: string;
  data_competencia: string;
  descricao: string;
  valor_total: number;
  eh_divisao_socios: boolean;
  pessoa_responsavel_id: string | null;
  status_lancamento: string;
  categoria?: {
    nome: string;
  } | null;
  pessoa_responsavel?: {
    nome: string;
  } | null;
}

interface Socio {
  id: string;
  pessoa_id: string;
  percentual_divisao: number;
  nome: string;
}

type FilterAtribuicao = 'todos' | 'atribuidos' | 'nao_atribuidos';
type FilterDivisao = 'todos' | 'dividido' | 'individual';

interface LancamentoResponsavelManagerProps {
  className?: string;
}

export const LancamentoResponsavelManager =
  React.memo<LancamentoResponsavelManagerProps>(({ className }) => {
    const [isLoading, setIsLoading] = React.useState(true);
    const [isSaving, setIsSaving] = React.useState(false);
    const [lancamentos, setLancamentos] = React.useState<Lancamento[]>([]);
    const [socios, setSocios] = React.useState<Socio[]>([]);
    const [selectedIds, setSelectedIds] = React.useState<Set<string>>(
      new Set()
    );

    // Filtros
    const [searchTerm, setSearchTerm] = React.useState('');
    const [filterAtribuicao, setFilterAtribuicao] =
      React.useState<FilterAtribuicao>('todos');
    const [filterDivisao, setFilterDivisao] =
      React.useState<FilterDivisao>('individual');
    const [filterPeriodo, setFilterPeriodo] = React.useState('todos');
    const [filterResponsavel, setFilterResponsavel] = React.useState('todos');

    // Atribuição em lote
    const [responsavelLote, setResponsavelLote] = React.useState<string>('');

    const { toast } = useToast();

    // Carregar sócios
    React.useEffect(() => {
      const loadSocios = async () => {
        const { data, error } = await supabase
          .from('configuracao_divisao_socios')
          .select(
            `
            id,
            pessoa_id,
            percentual_divisao,
            pessoa:pessoa_id (nome)
          `
          )
          .eq('ativo', true);

        if (!error && data) {
          const sociosList = data.map(
            (s: {
              id: string;
              pessoa_id: string;
              percentual_divisao: number | string;
              pessoa: { nome: string } | { nome: string }[];
            }) => ({
              id: s.id,
              pessoa_id: s.pessoa_id,
              percentual_divisao:
                typeof s.percentual_divisao === 'string'
                  ? parseFloat(s.percentual_divisao)
                  : s.percentual_divisao,
              nome: Array.isArray(s.pessoa)
                ? s.pessoa[0]?.nome || 'Sócio'
                : s.pessoa?.nome || 'Sócio',
            })
          );
          setSocios(sociosList);
        }
      };
      loadSocios();
    }, []);

    // Carregar lançamentos
    const loadLancamentos = React.useCallback(async () => {
      try {
        setIsLoading(true);

        let query = supabase
          .from('lancamentos_financeiros')
          .select(
            `
            id,
            tipo_lancamento,
            data_emissao,
            data_competencia,
            descricao,
            valor_total,
            eh_divisao_socios,
            pessoa_responsavel_id,
            status_lancamento,
            categoria:categoria_contabil_id (nome),
            pessoa_responsavel:pessoa_responsavel_id (nome)
          `
          )
          .in('status_lancamento', ['validado', 'pago'])
          .order('data_emissao', { ascending: false });

        // Filtro por tipo de divisão
        if (filterDivisao === 'dividido') {
          query = query.eq('eh_divisao_socios', true);
        } else if (filterDivisao === 'individual') {
          query = query.eq('eh_divisao_socios', false);
        }

        // Filtro por atribuição
        if (filterAtribuicao === 'atribuidos') {
          query = query.not('pessoa_responsavel_id', 'is', null);
        } else if (filterAtribuicao === 'nao_atribuidos') {
          query = query.is('pessoa_responsavel_id', null);
        }

        // Filtro por responsável específico
        if (filterResponsavel !== 'todos') {
          query = query.eq('pessoa_responsavel_id', filterResponsavel);
        }

        // Filtro por período
        if (filterPeriodo !== 'todos') {
          const hoje = new Date();
          let inicio: Date;
          let fim: Date = endOfMonth(hoje);

          switch (filterPeriodo) {
            case 'mes_atual':
              inicio = startOfMonth(hoje);
              break;
            case 'mes_anterior':
              inicio = startOfMonth(subMonths(hoje, 1));
              fim = endOfMonth(subMonths(hoje, 1));
              break;
            case 'ultimos_3_meses':
              inicio = startOfMonth(subMonths(hoje, 2));
              break;
            case 'ultimos_6_meses':
              inicio = startOfMonth(subMonths(hoje, 5));
              break;
            case 'ano_atual':
              inicio = new Date(hoje.getFullYear(), 0, 1);
              fim = new Date(hoje.getFullYear(), 11, 31);
              break;
            default:
              inicio = startOfMonth(hoje);
          }

          query = query
            .gte('data_competencia', format(inicio, 'yyyy-MM-dd'))
            .lte('data_competencia', format(fim, 'yyyy-MM-dd'));
        }

        // Filtro por busca
        if (searchTerm) {
          query = query.ilike('descricao', `%${searchTerm}%`);
        }

        const { data, error } = await query;

        if (error) throw error;

        // Transform data to match Lancamento interface
        const transformedData: Lancamento[] = (data || []).map(
          (item: {
            id: string;
            tipo_lancamento: 'despesa' | 'receita';
            data_emissao: string;
            data_competencia: string;
            descricao: string;
            valor_total: number;
            eh_divisao_socios: boolean;
            pessoa_responsavel_id: string | null;
            status_lancamento: string;
            categoria: { nome: string } | { nome: string }[] | null;
            pessoa_responsavel: { nome: string } | { nome: string }[] | null;
          }) => ({
            ...item,
            categoria: Array.isArray(item.categoria)
              ? item.categoria[0] || null
              : item.categoria,
            pessoa_responsavel: Array.isArray(item.pessoa_responsavel)
              ? item.pessoa_responsavel[0] || null
              : item.pessoa_responsavel,
          })
        );

        setLancamentos(transformedData);
        setSelectedIds(new Set()); // Limpa seleção ao recarregar
      } catch (error) {
        console.error('Erro ao carregar lançamentos:', error);
        toast({
          variant: 'destructive',
          title: 'Erro ao carregar',
          description: 'Não foi possível carregar os lançamentos.',
        });
      } finally {
        setIsLoading(false);
      }
    }, [
      filterAtribuicao,
      filterDivisao,
      filterPeriodo,
      filterResponsavel,
      searchTerm,
      toast,
    ]);

    React.useEffect(() => {
      loadLancamentos();
    }, [loadLancamentos]);

    // Toggle seleção individual
    const toggleSelect = (id: string) => {
      setSelectedIds((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(id)) {
          newSet.delete(id);
        } else {
          newSet.add(id);
        }
        return newSet;
      });
    };

    // Selecionar/desselecionar todos
    const toggleSelectAll = () => {
      if (selectedIds.size === lancamentos.length) {
        setSelectedIds(new Set());
      } else {
        setSelectedIds(new Set(lancamentos.map((l) => l.id)));
      }
    };

    // Atribuir responsável em lote
    const handleAtribuirLote = async () => {
      if (selectedIds.size === 0) {
        toast({
          variant: 'destructive',
          title: 'Nenhum lançamento selecionado',
          description: 'Selecione ao menos um lançamento para atribuir.',
        });
        return;
      }

      if (!responsavelLote) {
        toast({
          variant: 'destructive',
          title: 'Selecione um responsável',
          description: 'Escolha um sócio para atribuir aos lançamentos.',
        });
        return;
      }

      try {
        setIsSaving(true);

        const pessoaId = responsavelLote === 'remover' ? null : responsavelLote;

        const { error } = await supabase
          .from('lancamentos_financeiros')
          .update({ pessoa_responsavel_id: pessoaId })
          .in('id', Array.from(selectedIds));

        if (error) throw error;

        toast({
          title: 'Atribuição realizada',
          description: `${selectedIds.size} lançamento(s) ${responsavelLote === 'remover' ? 'tiveram o responsável removido' : 'foram atribuídos'}.`,
        });

        setSelectedIds(new Set());
        setResponsavelLote('');
        loadLancamentos();
      } catch (error) {
        console.error('Erro ao atribuir:', error);
        toast({
          variant: 'destructive',
          title: 'Erro ao atribuir',
          description: 'Não foi possível atribuir o responsável.',
        });
      } finally {
        setIsSaving(false);
      }
    };

    // Atribuir responsável individual
    const handleAtribuirIndividual = async (
      lancamentoId: string,
      pessoaId: string | null
    ) => {
      try {
        const { error } = await supabase
          .from('lancamentos_financeiros')
          .update({ pessoa_responsavel_id: pessoaId })
          .eq('id', lancamentoId);

        if (error) throw error;

        // Atualiza localmente
        setLancamentos((prev) =>
          prev.map((l) =>
            l.id === lancamentoId
              ? {
                  ...l,
                  pessoa_responsavel_id: pessoaId,
                  pessoa_responsavel: pessoaId
                    ? {
                        nome:
                          socios.find((s) => s.pessoa_id === pessoaId)?.nome ||
                          '',
                      }
                    : null,
                }
              : l
          )
        );

        toast({
          title: 'Responsável atualizado',
          description: pessoaId
            ? 'Responsável atribuído com sucesso.'
            : 'Responsável removido.',
        });
      } catch (error) {
        console.error('Erro ao atribuir:', error);
        toast({
          variant: 'destructive',
          title: 'Erro',
          description: 'Não foi possível atualizar o responsável.',
        });
      }
    };

    // Estatísticas
    const stats = React.useMemo(() => {
      const total = lancamentos.length;
      const atribuidos = lancamentos.filter(
        (l) => l.pessoa_responsavel_id
      ).length;
      const naoAtribuidos = total - atribuidos;
      const valorAtribuido = lancamentos
        .filter((l) => l.pessoa_responsavel_id)
        .reduce((sum, l) => sum + l.valor_total, 0);
      const valorNaoAtribuido = lancamentos
        .filter((l) => !l.pessoa_responsavel_id)
        .reduce((sum, l) => sum + l.valor_total, 0);

      return {
        total,
        atribuidos,
        naoAtribuidos,
        valorAtribuido,
        valorNaoAtribuido,
      };
    }, [lancamentos]);

    const formatCurrency = (value: number) => {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(value);
    };

    const getPrimeiroNome = (nomeCompleto: string) => {
      return nomeCompleto.split(' ')[0];
    };

    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Atribuição de Responsáveis
              </CardTitle>
              <CardDescription>
                Gerencie a atribuição de responsáveis nos lançamentos
                financeiros
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadLancamentos}
              disabled={isLoading}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
              />
              Atualizar
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Estatísticas */}
          <div className="grid gap-4 md:grid-cols-4">
            <div className="p-4 rounded-lg border bg-muted/50">
              <div className="text-sm text-muted-foreground">Total</div>
              <div className="text-2xl font-bold">{stats.total}</div>
            </div>
            <div className="p-4 rounded-lg border bg-green-50 dark:bg-green-950">
              <div className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                <CheckCircle className="h-3 w-3" />
                Atribuídos
              </div>
              <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                {stats.atribuidos}
              </div>
              <div className="text-xs text-green-600 dark:text-green-400">
                {formatCurrency(stats.valorAtribuido)}
              </div>
            </div>
            <div className="p-4 rounded-lg border bg-orange-50 dark:bg-orange-950">
              <div className="text-sm text-orange-600 dark:text-orange-400 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Não atribuídos
              </div>
              <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                {stats.naoAtribuidos}
              </div>
              <div className="text-xs text-orange-600 dark:text-orange-400">
                {formatCurrency(stats.valorNaoAtribuido)}
              </div>
            </div>
            <div className="p-4 rounded-lg border bg-blue-50 dark:bg-blue-950">
              <div className="text-sm text-blue-600 dark:text-blue-400">
                Selecionados
              </div>
              <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                {selectedIds.size}
              </div>
            </div>
          </div>

          {/* Filtros */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Filter className="h-4 w-4" />
              Filtros
            </div>

            <div className="grid gap-4 md:grid-cols-5">
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

              {/* Tipo de divisão */}
              <Select
                value={filterDivisao}
                onValueChange={(v) => setFilterDivisao(v as FilterDivisao)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="individual">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Individuais
                    </div>
                  </SelectItem>
                  <SelectItem value="dividido">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Divididos
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>

              {/* Atribuição */}
              <Select
                value={filterAtribuicao}
                onValueChange={(v) =>
                  setFilterAtribuicao(v as FilterAtribuicao)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Atribuição" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="atribuidos">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      Atribuídos
                    </div>
                  </SelectItem>
                  <SelectItem value="nao_atribuidos">
                    <div className="flex items-center gap-2">
                      <UserX className="h-4 w-4 text-orange-600" />
                      Não atribuídos
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>

              {/* Período */}
              <Select value={filterPeriodo} onValueChange={setFilterPeriodo}>
                <SelectTrigger>
                  <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os períodos</SelectItem>
                  <SelectItem value="mes_atual">Mês atual</SelectItem>
                  <SelectItem value="mes_anterior">Mês anterior</SelectItem>
                  <SelectItem value="ultimos_3_meses">
                    Últimos 3 meses
                  </SelectItem>
                  <SelectItem value="ultimos_6_meses">
                    Últimos 6 meses
                  </SelectItem>
                  <SelectItem value="ano_atual">Ano atual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filtro por responsável */}
            <div className="grid gap-4 md:grid-cols-5">
              <Select
                value={filterResponsavel}
                onValueChange={setFilterResponsavel}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Responsável" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os responsáveis</SelectItem>
                  {socios.map((socio) => (
                    <SelectItem key={socio.pessoa_id} value={socio.pessoa_id}>
                      {getPrimeiroNome(socio.nome)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Ações em lote */}
          {selectedIds.size > 0 && (
            <Alert>
              <CheckSquare className="h-4 w-4" />
              <AlertTitle>
                {selectedIds.size} lançamento(s) selecionado(s)
              </AlertTitle>
              <AlertDescription>
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  <Label className="text-sm">Atribuir a:</Label>
                  <Select
                    value={responsavelLote}
                    onValueChange={setResponsavelLote}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {socios.map((socio) => (
                        <SelectItem
                          key={socio.pessoa_id}
                          value={socio.pessoa_id}
                        >
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            {getPrimeiroNome(socio.nome)}
                          </div>
                        </SelectItem>
                      ))}
                      <SelectItem value="remover">
                        <div className="flex items-center gap-2 text-red-600">
                          <UserX className="h-4 w-4" />
                          Remover atribuição
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleAtribuirLote}
                    disabled={!responsavelLote || isSaving}
                    size="sm"
                  >
                    {isSaving ? 'Salvando...' : 'Aplicar'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedIds(new Set())}
                  >
                    Limpar seleção
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Tabela */}
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : lancamentos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <UserX className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">
                Nenhum lançamento encontrado
              </h3>
              <p className="text-sm text-muted-foreground">
                Ajuste os filtros para ver mais resultados.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <Checkbox
                        checked={
                          selectedIds.size === lancamentos.length &&
                          lancamentos.length > 0
                        }
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="w-[200px]">Responsável</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lancamentos.map((lancamento) => (
                    <TableRow key={lancamento.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(lancamento.id)}
                          onCheckedChange={() => toggleSelect(lancamento.id)}
                        />
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
                            {format(
                              new Date(lancamento.data_competencia),
                              'MMM/yyyy',
                              { locale: ptBR }
                            )}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-medium line-clamp-1">
                          {lancamento.descricao}
                        </span>
                      </TableCell>
                      <TableCell>
                        {lancamento.categoria ? (
                          <Badge variant="outline" className="text-xs">
                            {lancamento.categoria.nome}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={`text-sm font-medium ${
                            lancamento.tipo_lancamento === 'despesa'
                              ? 'text-red-600'
                              : 'text-green-600'
                          }`}
                        >
                          {formatCurrency(lancamento.valor_total)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {lancamento.eh_divisao_socios ? (
                          <Badge variant="secondary" className="text-xs">
                            <Users className="h-3 w-3 mr-1" />
                            Dividido
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            <User className="h-3 w-3 mr-1" />
                            Individual
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={lancamento.pessoa_responsavel_id || 'nenhum'}
                          onValueChange={(value) =>
                            handleAtribuirIndividual(
                              lancamento.id,
                              value === 'nenhum' ? null : value
                            )
                          }
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue>
                              {lancamento.pessoa_responsavel_id ? (
                                <div className="flex items-center gap-2">
                                  <User className="h-3 w-3 text-green-600" />
                                  <span>
                                    {getPrimeiroNome(
                                      lancamento.pessoa_responsavel?.nome || ''
                                    )}
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 text-orange-600">
                                  <UserX className="h-3 w-3" />
                                  <span>Não atribuído</span>
                                </div>
                              )}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="nenhum">
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <UserX className="h-4 w-4" />
                                Nenhum
                              </div>
                            </SelectItem>
                            {socios.map((socio) => (
                              <SelectItem
                                key={socio.pessoa_id}
                                value={socio.pessoa_id}
                              >
                                <div className="flex items-center gap-2">
                                  <User className="h-4 w-4" />
                                  {getPrimeiroNome(socio.nome)}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Resumo por sócio */}
          {socios.length > 0 && lancamentos.length > 0 && (
            <div className="pt-4 border-t">
              <h4 className="text-sm font-medium mb-3">
                Resumo por Responsável
              </h4>
              <div className="grid gap-3 md:grid-cols-3">
                {socios.map((socio) => {
                  const lancamentosSocio = lancamentos.filter(
                    (l) => l.pessoa_responsavel_id === socio.pessoa_id
                  );
                  const total = lancamentosSocio.reduce(
                    (sum, l) => sum + l.valor_total,
                    0
                  );

                  return (
                    <div
                      key={socio.pessoa_id}
                      className="p-3 rounded-lg border"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">
                          {getPrimeiroNome(socio.nome)}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {lancamentosSocio.length} lançamento(s)
                      </div>
                      <div className="text-lg font-bold">
                        {formatCurrency(total)}
                      </div>
                    </div>
                  );
                })}

                {/* Não atribuídos */}
                <div className="p-3 rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950 dark:border-orange-800">
                  <div className="flex items-center gap-2 mb-1">
                    <UserX className="h-4 w-4 text-orange-600" />
                    <span className="font-medium text-orange-700 dark:text-orange-300">
                      Não atribuídos
                    </span>
                  </div>
                  <div className="text-sm text-orange-600 dark:text-orange-400">
                    {stats.naoAtribuidos} lançamento(s)
                  </div>
                  <div className="text-lg font-bold text-orange-700 dark:text-orange-300">
                    {formatCurrency(stats.valorNaoAtribuido)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  });

LancamentoResponsavelManager.displayName = 'LancamentoResponsavelManager';
