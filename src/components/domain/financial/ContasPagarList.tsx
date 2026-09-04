import React from 'react';
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  addMonths,
} from 'date-fns';
import {
  Search,
  Calendar,
  CreditCard,
  AlertCircle,
  CheckCircle,
  Clock,
  ChevronRight,
  Download,
  DollarSign,
  MoreHorizontal,
  Receipt,
  CalendarCheck,
  CalendarX,
  CircleDashed,
  PencilLine,
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
  Checkbox,
} from '@/components/primitives';
import { PagamentoForm } from './PagamentoForm';
import { BaixaLoteDialog } from './BaixaLoteDialog';
import {
  PrevisaoValorDialog,
  type PrevisaoParaPreencher,
} from './PrevisaoValorDialog';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';

// AI dev note: Agenda de contas a pagar, lendo vw_contas_pagar.
//
// A view já calcula situacao, dias_atraso e faixa_atraso — não recalcular aqui,
// senão a tela e o fluxo de caixa divergem sobre o que está vencido.
//
// Dois conceitos que a tela precisa manter separados:
//  · CONTA — valor conhecido, é dívida, entra nos totais e pode ser paga.
//  · PREVISÃO (eh_previsao) — conta fixa de valor variável (condomínio, energia,
//    impostos) que nasce com R$ 0,00 esperando o boleto. NÃO é dívida e não
//    entra em nenhum total; aparece para ser preenchida. Antes de 31/08/2026
//    essas linhas eram filtradas fora da tela e ficavam invisíveis no sistema
//    inteiro — 44 previsões de fev→ago/2026 nunca viraram conta a pagar.
//
// Parcela vencida permanece pendente até o pagamento acontecer: nada de baixa
// presumida. Por isso existe o painel de aging, que carrega o passivo à vista.

type Situacao =
  | 'pago'
  | 'cancelado'
  | 'atrasado'
  | 'vence_hoje'
  | 'vence_em_7_dias'
  | 'a_vencer';

type FaixaAtraso =
  | 'a_vencer'
  | 'ate_30'
  | 'de_31_a_60'
  | 'de_61_a_90'
  | 'de_91_a_365'
  | 'acima_de_365';

interface ContaPagarView {
  id: string;
  lancamento_id: string;
  numero_parcela: number;
  total_parcelas: number;
  valor_parcela: number;
  data_vencimento: string;
  data_pagamento: string | null;
  status_pagamento: 'pendente' | 'pago' | 'cancelado';
  descricao: string;
  numero_documento: string | null;
  tipo_lancamento: 'despesa' | 'receita';
  fornecedor: string | null;
  categoria: string | null;
  carteira: string | null;
  eh_previsao: boolean;
  situacao: Situacao;
  dias_para_vencer: number;
  dias_atraso: number;
  faixa_atraso: FaixaAtraso | null;
}

interface ContaPagarListProps {
  tipo?: 'todos' | 'despesa' | 'receita';
  showFilters?: boolean;
  className?: string;
}

const FAIXAS: { chave: FaixaAtraso; rotulo: string }[] = [
  { chave: 'ate_30', rotulo: 'Até 30 dias' },
  { chave: 'de_31_a_60', rotulo: '31 a 60 dias' },
  { chave: 'de_61_a_90', rotulo: '61 a 90 dias' },
  { chave: 'de_91_a_365', rotulo: '91 dias a 1 ano' },
  { chave: 'acima_de_365', rotulo: 'Mais de 1 ano' },
];

const moeda = (v: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(v);

export const ContasPagarList = React.memo<ContaPagarListProps>(
  ({ tipo = 'todos', showFilters = true, className }) => {
    const [contas, setContas] = React.useState<ContaPagarView[]>([]);
    const [contasSelecionadas, setContasSelecionadas] = React.useState<
      Set<string>
    >(new Set());
    const [isLoading, setIsLoading] = React.useState(true);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [selectedStatus, setSelectedStatus] =
      React.useState<string>('pendente');
    const [selectedPeriodo, setSelectedPeriodo] =
      React.useState<string>('mes_atual');
    const [dateRange, setDateRange] = React.useState<
      { from: Date; to: Date } | undefined
    >();
    const [contaParaPagar, setContaParaPagar] =
      React.useState<ContaPagarView | null>(null);
    const [previsaoParaPreencher, setPrevisaoParaPreencher] =
      React.useState<PrevisaoParaPreencher | null>(null);
    const [showBaixaLote, setShowBaixaLote] = React.useState(false);
    const { toast } = useToast();

    // Passivo total em aberto — independe do filtro de período da tela, porque
    // a dívida antiga não some quando alguém olha só o mês corrente.
    const [aging, setAging] = React.useState<
      { faixa_atraso: FaixaAtraso; qtd: number; total: number }[]
    >([]);
    const [totalPrevisoes, setTotalPrevisoes] = React.useState(0);

    // Calcular período baseado na seleção
    React.useEffect(() => {
      const hoje = new Date();

      switch (selectedPeriodo) {
        case 'vencidas':
          setDateRange({ from: new Date(2000, 0, 1), to: hoje });
          break;
        case 'hoje':
          setDateRange({ from: hoje, to: hoje });
          break;
        case 'semana': {
          const em7 = new Date(hoje);
          em7.setDate(em7.getDate() + 7);
          setDateRange({ from: hoje, to: em7 });
          break;
        }
        case 'mes_atual':
          setDateRange({ from: startOfMonth(hoje), to: endOfMonth(hoje) });
          break;
        case 'proximo_mes': {
          const prox = addMonths(hoje, 1);
          setDateRange({ from: startOfMonth(prox), to: endOfMonth(prox) });
          break;
        }
        case 'proximos_3_meses':
          setDateRange({
            from: startOfMonth(hoje),
            to: endOfMonth(addMonths(hoje, 3)),
          });
          break;
        case 'todas':
        default:
          setDateRange(undefined);
          break;
      }
    }, [selectedPeriodo]);

    // Agregação vem pronta do servidor: somar no cliente exigiria baixar todas
    // as parcelas em aberto, e o PostgREST corta em 1000 linhas por padrão.
    const loadAging = React.useCallback(async () => {
      const [agingRes, previsoesRes] = await Promise.all([
        supabase
          .from('vw_aging_contas_pagar')
          .select('faixa_atraso, qtd, total'),
        supabase.from('vw_previsoes_resumo').select('total').maybeSingle(),
      ]);

      if (agingRes.error) {
        console.error('Erro ao carregar aging:', agingRes.error);
      } else {
        const porFaixa = new Map(
          (agingRes.data || []).map((f) => [
            f.faixa_atraso as FaixaAtraso,
            { qtd: Number(f.qtd), total: Number(f.total) },
          ])
        );
        setAging(
          FAIXAS.filter((f) => porFaixa.has(f.chave)).map((f) => ({
            faixa_atraso: f.chave,
            ...porFaixa.get(f.chave)!,
          }))
        );
      }

      if (previsoesRes.error) {
        console.error('Erro ao contar previsões:', previsoesRes.error);
      } else {
        setTotalPrevisoes(Number(previsoesRes.data?.total ?? 0));
      }
    }, []);

    const loadContas = React.useCallback(async () => {
      setIsLoading(true);
      try {
        let query = supabase
          .from('vw_contas_pagar')
          .select('*')
          .order('data_vencimento', { ascending: true });

        if (tipo !== 'todos') {
          query = query.eq('tipo_lancamento', tipo);
        }

        if (selectedStatus !== 'todos') {
          query = query.eq('status_pagamento', selectedStatus);
        }

        if (dateRange?.from) {
          query = query.gte(
            'data_vencimento',
            format(dateRange.from, 'yyyy-MM-dd')
          );
        }
        if (dateRange?.to) {
          query = query.lte(
            'data_vencimento',
            format(dateRange.to, 'yyyy-MM-dd')
          );
        }

        if (searchTerm) {
          query = query.or(
            `descricao.ilike.%${searchTerm}%,numero_documento.ilike.%${searchTerm}%,fornecedor.ilike.%${searchTerm}%`
          );
        }

        const { data, error } = await query;
        if (error) throw error;

        setContas((data || []) as ContaPagarView[]);
      } catch (error) {
        console.error('Erro ao carregar contas:', error);
        toast({
          variant: 'destructive',
          title: 'Erro ao carregar contas',
          description: 'Não foi possível carregar as contas a pagar.',
        });
      } finally {
        setIsLoading(false);
      }
    }, [tipo, selectedStatus, dateRange, searchTerm, toast]);

    React.useEffect(() => {
      void loadContas();
    }, [loadContas]);

    React.useEffect(() => {
      void loadAging();
    }, [loadAging]);

    const recarregar = React.useCallback(() => {
      setContasSelecionadas(new Set());
      void loadContas();
      void loadAging();
    }, [loadContas, loadAging]);

    // Previsão não é dívida: fica fora de todo total.
    const contasReais = React.useMemo(
      () => contas.filter((c) => !c.eh_previsao),
      [contas]
    );
    const previsoesNaTela = React.useMemo(
      () => contas.filter((c) => c.eh_previsao),
      [contas]
    );

    const totais = React.useMemo(() => {
      const total = contasReais.reduce(
        (s, c) => s + Number(c.valor_parcela),
        0
      );
      const pendente = contasReais
        .filter((c) => c.status_pagamento === 'pendente')
        .reduce((s, c) => s + Number(c.valor_parcela), 0);
      const pago = contasReais
        .filter((c) => c.status_pagamento === 'pago')
        .reduce((s, c) => s + Number(c.valor_parcela), 0);
      const vencidas = contasReais.filter(
        (c) => c.situacao === 'atrasado'
      ).length;

      return { total, pendente, pago, vencidas };
    }, [contasReais]);

    const totalAtrasoGeral = React.useMemo(
      () => aging.reduce((s, f) => s + f.total, 0),
      [aging]
    );
    const qtdAtrasoGeral = React.useMemo(
      () => aging.reduce((s, f) => s + f.qtd, 0),
      [aging]
    );

    const valorSelecionado = React.useMemo(
      () =>
        contasReais
          .filter((c) => contasSelecionadas.has(c.id))
          .reduce((s, c) => s + Number(c.valor_parcela), 0),
      [contasReais, contasSelecionadas]
    );

    // Handlers
    const handlePagar = (conta: ContaPagarView) => setContaParaPagar(conta);

    const handlePreencherPrevisao = async (conta: ContaPagarView) => {
      // Busca a sugestão de valor (último valor real da mesma regra) só ao abrir
      const { data } = await supabase
        .from('vw_previsoes_a_preencher')
        .select('valor_ultimo_real, competencia_ultimo_real')
        .eq('conta_pagar_id', conta.id)
        .maybeSingle();

      setPrevisaoParaPreencher({
        id: conta.id,
        descricao: conta.descricao,
        data_vencimento: conta.data_vencimento,
        fornecedor: conta.fornecedor,
        categoria: conta.categoria,
        valor_ultimo_real: data?.valor_ultimo_real ?? null,
        competencia_ultimo_real: data?.competencia_ultimo_real ?? null,
      });
    };

    const handleSelecionarConta = (contaId: string, checked: boolean) => {
      const novas = new Set(contasSelecionadas);
      if (checked) novas.add(contaId);
      else novas.delete(contaId);
      setContasSelecionadas(novas);
    };

    const selecionaveis = React.useMemo(
      () => contasReais.filter((c) => c.status_pagamento === 'pendente'),
      [contasReais]
    );

    const handleSelecionarTodas = (checked: boolean) => {
      setContasSelecionadas(
        checked ? new Set(selecionaveis.map((c) => c.id)) : new Set()
      );
    };

    const todasSelecionadas =
      selecionaveis.length > 0 &&
      selecionaveis.every((c) => contasSelecionadas.has(c.id));

    const getStatusBadge = (conta: ContaPagarView) => {
      if (conta.eh_previsao) {
        return (
          <Badge
            variant="outline"
            className="border-dashed text-muted-foreground"
          >
            <CircleDashed className="mr-1 h-3 w-3" />
            Aguardando valor
          </Badge>
        );
      }

      switch (conta.situacao) {
        case 'pago':
          return (
            <Badge variant="outline" className="text-green-600">
              <CheckCircle className="mr-1 h-3 w-3" />
              Pago
            </Badge>
          );
        case 'cancelado':
          return (
            <Badge variant="destructive">
              <CalendarX className="mr-1 h-3 w-3" />
              Cancelado
            </Badge>
          );
        case 'atrasado':
          return (
            <Badge variant="destructive">
              <AlertCircle className="mr-1 h-3 w-3" />
              Vencida há {conta.dias_atraso} dia
              {conta.dias_atraso !== 1 ? 's' : ''}
            </Badge>
          );
        case 'vence_hoje':
          return (
            <Badge variant="secondary" className="text-orange-600">
              <Clock className="mr-1 h-3 w-3" />
              Vence hoje
            </Badge>
          );
        case 'vence_em_7_dias':
          return (
            <Badge variant="secondary">
              <Clock className="mr-1 h-3 w-3" />
              Vence em {conta.dias_para_vencer} dia
              {conta.dias_para_vencer !== 1 ? 's' : ''}
            </Badge>
          );
        default:
          return (
            <Badge variant="outline">
              <Calendar className="mr-1 h-3 w-3" />A vencer
            </Badge>
          );
      }
    };

    const getTipoIcon = (tipoLancamento: 'despesa' | 'receita') =>
      tipoLancamento === 'despesa' ? (
        <DollarSign className="h-4 w-4 text-red-500" />
      ) : (
        <Receipt className="h-4 w-4 text-green-500" />
      );

    const handleExportCSV = () => {
      try {
        const headers = [
          'Data Vencimento',
          'Tipo',
          'Fornecedor',
          'Descrição',
          'Número Documento',
          'Parcela',
          'Valor',
          'Situação',
          'Dias em atraso',
          'Data Pagamento',
          'Categoria',
          'Carteira',
        ];

        const rows = contas.map((c) => [
          format(parseISO(c.data_vencimento), 'dd/MM/yyyy'),
          c.tipo_lancamento === 'despesa' ? 'Despesa' : 'Receita',
          c.fornecedor || '',
          c.descricao,
          c.numero_documento || '',
          `${c.numero_parcela}/${c.total_parcelas}`,
          c.eh_previsao ? 'aguardando valor' : moeda(Number(c.valor_parcela)),
          c.eh_previsao ? 'Previsão' : c.situacao,
          String(c.dias_atraso ?? 0),
          c.data_pagamento
            ? format(parseISO(c.data_pagamento), 'dd/MM/yyyy')
            : '',
          c.categoria || '',
          c.carteira || '',
        ]);

        const csvContent = [
          headers.join(';'),
          ...rows.map((r) => r.join(';')),
        ].join('\n');

        const blob = new Blob(['﻿' + csvContent], {
          type: 'text/csv;charset=utf-8;',
        });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `contas_pagar_${format(new Date(), 'yyyy-MM-dd')}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);

        toast({
          title: 'Exportação concluída',
          description: 'Arquivo CSV gerado com sucesso.',
        });
      } catch (error) {
        console.error('Erro ao exportar:', error);
        toast({
          variant: 'destructive',
          title: 'Erro na exportação',
          description: 'Não foi possível gerar o arquivo CSV.',
        });
      }
    };

    return (
      <>
        <Card className={className}>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Contas a Pagar</CardTitle>
                <CardDescription>
                  Gerencie vencimentos e pagamentos
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCSV}
                  disabled={contas.length === 0}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Exportar
                </Button>
                {contasSelecionadas.size > 0 && (
                  <Button size="sm" onClick={() => setShowBaixaLote(true)}>
                    <CreditCard className="mr-2 h-4 w-4" />
                    Dar baixa ({contasSelecionadas.size})
                  </Button>
                )}
              </div>
            </div>

            {/* Cards de Resumo */}
            <div className="mt-4 grid gap-4 md:grid-cols-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        Total no período
                      </p>
                      <p className="text-xl font-bold">{moeda(totais.total)}</p>
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
                        A pagar
                      </p>
                      <p className="text-xl font-bold text-orange-600">
                        {moeda(totais.pendente)}
                      </p>
                    </div>
                    <Clock className="h-8 w-8 text-orange-600/20" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        Pago
                      </p>
                      <p className="text-xl font-bold text-green-600">
                        {moeda(totais.pago)}
                      </p>
                    </div>
                    <CheckCircle className="h-8 w-8 text-green-600/20" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        Em atraso (total)
                      </p>
                      <p className="text-xl font-bold text-red-600">
                        {moeda(totalAtrasoGeral)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {qtdAtrasoGeral} parcela
                        {qtdAtrasoGeral !== 1 ? 's' : ''} em aberto
                      </p>
                    </div>
                    <AlertCircle className="h-8 w-8 text-red-600/20" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Passivo em aberto por idade — carregado até que seja pago */}
            {aging.length > 0 && (
              <Card className="border-red-200 bg-red-50/50 dark:border-red-900/40 dark:bg-red-950/20">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <History className="h-4 w-4 text-red-600" />
                    Passivo em aberto por idade
                  </CardTitle>
                  <CardDescription>
                    Continua em aberto até o pagamento ser registrado — sem
                    baixa presumida.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    {aging.map((faixa) => (
                      <div
                        key={faixa.faixa_atraso}
                        className="rounded-md border bg-background p-3"
                      >
                        <p className="text-xs text-muted-foreground">
                          {
                            FAIXAS.find((f) => f.chave === faixa.faixa_atraso)
                              ?.rotulo
                          }
                        </p>
                        <p className="text-sm font-bold text-red-600">
                          {moeda(faixa.total)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {faixa.qtd} parcela{faixa.qtd !== 1 ? 's' : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Previsões esperando o valor real */}
            {totalPrevisoes > 0 && (
              <Alert>
                <CircleDashed className="h-4 w-4" />
                <AlertTitle>
                  {totalPrevisoes} conta{totalPrevisoes !== 1 ? 's' : ''} fixa
                  {totalPrevisoes !== 1 ? 's' : ''} aguardando valor
                </AlertTitle>
                <AlertDescription>
                  Condomínio, energia, limpeza e impostos nascem sem valor —
                  chegam como previsão e viram conta a pagar quando alguém
                  preenche o valor do boleto.
                  {previsoesNaTela.length > 0 && (
                    <>
                      {' '}
                      <strong>{previsoesNaTela.length}</strong> aparece
                      {previsoesNaTela.length !== 1 ? 'm' : ''} na lista abaixo.
                    </>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Filtros */}
            {showFilters && (
              <div className="grid gap-4 md:grid-cols-4">
                <div className="md:col-span-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por descrição, documento ou fornecedor..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                <Select
                  value={selectedStatus}
                  onValueChange={setSelectedStatus}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os status</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="pago">Pago</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={selectedPeriodo}
                  onValueChange={setSelectedPeriodo}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Período" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas as datas</SelectItem>
                    <SelectItem value="vencidas">Vencidas</SelectItem>
                    <SelectItem value="hoje">Vence hoje</SelectItem>
                    <SelectItem value="semana">Próximos 7 dias</SelectItem>
                    <SelectItem value="mes_atual">Mês atual</SelectItem>
                    <SelectItem value="proximo_mes">Próximo mês</SelectItem>
                    <SelectItem value="proximos_3_meses">
                      Próximos 3 meses
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Lista */}
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : contas.length === 0 ? (
              <div className="flex min-h-[400px] flex-col items-center justify-center text-center">
                <Receipt className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-medium">
                  Nenhuma conta encontrada
                </h3>
                <p className="mb-4 max-w-sm text-sm text-muted-foreground">
                  {searchTerm ||
                  selectedStatus !== 'todos' ||
                  selectedPeriodo !== 'todas'
                    ? 'Tente ajustar os filtros de busca.'
                    : 'As contas a pagar são geradas ao cadastrar lançamentos e pelas regras de contas fixas.'}
                </p>
              </div>
            ) : (
              <>
                {totais.vencidas > 0 && selectedStatus !== 'pago' && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Contas vencidas no período</AlertTitle>
                    <AlertDescription>
                      {totais.vencidas} conta
                      {totais.vencidas !== 1 ? 's' : ''} vencida
                      {totais.vencidas !== 1 ? 's' : ''} dentro do filtro atual.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]">
                          <Checkbox
                            checked={todasSelecionadas}
                            onCheckedChange={handleSelecionarTodas}
                            aria-label="Selecionar todas"
                          />
                        </TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Fornecedor</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Parcela</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Situação</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contas.map((conta) => (
                        <TableRow
                          key={conta.id}
                          className={
                            conta.eh_previsao ? 'bg-muted/40' : undefined
                          }
                        >
                          <TableCell>
                            <Checkbox
                              checked={contasSelecionadas.has(conta.id)}
                              onCheckedChange={(checked) =>
                                handleSelecionarConta(
                                  conta.id,
                                  checked as boolean
                                )
                              }
                              disabled={
                                conta.status_pagamento !== 'pendente' ||
                                conta.eh_previsao
                              }
                              aria-label={`Selecionar ${conta.descricao}`}
                            />
                          </TableCell>
                          <TableCell>
                            <span className="text-sm font-medium">
                              {format(
                                parseISO(conta.data_vencimento),
                                'dd/MM/yyyy'
                              )}
                            </span>
                          </TableCell>
                          <TableCell>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  {getTipoIcon(conta.tipo_lancamento)}
                                </TooltipTrigger>
                                <TooltipContent>
                                  {conta.tipo_lancamento === 'despesa'
                                    ? 'Despesa'
                                    : 'Receita'}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">
                              {conta.fornecedor || (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="line-clamp-1 text-sm font-medium">
                                {conta.descricao}
                              </span>
                              {conta.numero_documento && (
                                <span className="text-xs text-muted-foreground">
                                  Doc: {conta.numero_documento}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm font-medium">
                              {conta.numero_parcela}/{conta.total_parcelas}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            {conta.eh_previsao ? (
                              <Button
                                variant="link"
                                size="sm"
                                className="h-auto p-0 text-sm"
                                onClick={() => handlePreencherPrevisao(conta)}
                              >
                                informar valor
                              </Button>
                            ) : (
                              <span className="text-sm font-medium">
                                {moeda(Number(conta.valor_parcela))}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>{getStatusBadge(conta)}</TableCell>
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
                                {conta.eh_previsao ? (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      handlePreencherPrevisao(conta)
                                    }
                                  >
                                    <PencilLine className="mr-2 h-4 w-4" />
                                    Preencher valor
                                  </DropdownMenuItem>
                                ) : (
                                  conta.status_pagamento === 'pendente' && (
                                    <>
                                      <DropdownMenuItem
                                        onClick={() => handlePagar(conta)}
                                      >
                                        <CreditCard className="mr-2 h-4 w-4" />
                                        Registrar Pagamento
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                    </>
                                  )
                                )}
                                {conta.status_pagamento === 'pago' &&
                                  conta.data_pagamento && (
                                    <DropdownMenuItem disabled>
                                      <CalendarCheck className="mr-2 h-4 w-4" />
                                      Pago em{' '}
                                      {format(
                                        parseISO(conta.data_pagamento),
                                        'dd/MM/yyyy'
                                      )}
                                    </DropdownMenuItem>
                                  )}
                                <DropdownMenuItem
                                  onClick={() => {
                                    toast({
                                      title: 'Em desenvolvimento',
                                      description:
                                        'Visualização de detalhes será implementada.',
                                    });
                                  }}
                                >
                                  <ChevronRight className="mr-2 h-4 w-4" />
                                  Ver Lançamento
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {contaParaPagar && (
          <PagamentoForm
            conta={{
              id: contaParaPagar.id,
              lancamento_id: contaParaPagar.lancamento_id,
              numero_parcela: contaParaPagar.numero_parcela,
              total_parcelas: contaParaPagar.total_parcelas,
              valor_parcela: Number(contaParaPagar.valor_parcela),
              data_vencimento: contaParaPagar.data_vencimento,
              lancamento: {
                tipo_lancamento: contaParaPagar.tipo_lancamento,
                numero_documento: contaParaPagar.numero_documento,
                descricao: contaParaPagar.descricao,
                fornecedor: contaParaPagar.fornecedor
                  ? { nome_razao_social: contaParaPagar.fornecedor }
                  : null,
              },
            }}
            onSuccess={() => {
              setContaParaPagar(null);
              recarregar();
              toast({
                title: 'Pagamento registrado',
                description: 'O pagamento foi registrado com sucesso.',
              });
            }}
            onCancel={() => setContaParaPagar(null)}
          />
        )}

        {previsaoParaPreencher && (
          <PrevisaoValorDialog
            previsao={previsaoParaPreencher}
            onSuccess={() => {
              setPrevisaoParaPreencher(null);
              recarregar();
            }}
            onCancel={() => setPrevisaoParaPreencher(null)}
          />
        )}

        {showBaixaLote && (
          <BaixaLoteDialog
            contaIds={Array.from(contasSelecionadas)}
            valorTotal={valorSelecionado}
            onSuccess={() => {
              setShowBaixaLote(false);
              recarregar();
            }}
            onCancel={() => setShowBaixaLote(false)}
          />
        )}
      </>
    );
  }
);

ContasPagarList.displayName = 'ContasPagarList';
