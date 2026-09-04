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
  AlertCircle,
  CheckCircle,
  Clock,
  Download,
  Receipt,
  CalendarX,
  History,
  ExternalLink,
  Users,
  MessageCircle,
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
  Alert,
  AlertDescription,
  AlertTitle,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/primitives';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';

// AI dev note: Contas a receber = espelho de `faturas` via vw_contas_receber.
//
// Deliberadamente NÃO existe tabela `contas_receber`: o ASAAS é a fonte da
// verdade do recebimento e uma tabela paralela divergiria na primeira baixa
// que o webhook processasse. Esta tela é leitura — quem cobra é o módulo de
// cobrança (/cobrancas) e quem baixa é o webhook do ASAAS.
//
// Cuidado ao consultar `faturas` direto: 49 faturas em aberto têm ativo=false
// (excluídas pelo admin) e mantêm status 'pendente'/'atrasado'. Filtrar só por
// status superestima o recebível em ~R$53k. A view já exclui as inativas.

type Situacao =
  | 'recebido'
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

interface ContaReceber {
  id: string;
  id_asaas: string | null;
  descricao: string | null;
  valor_total: number;
  data_vencimento: string;
  data_recebimento: string | null;
  status: string;
  link_nfe: string | null;
  lembretes_enviados: number | null;
  empresa: string | null;
  empresa_id: string | null;
  responsavel_cobranca: string | null;
  responsavel_telefone: string | null;
  paciente: string | null;
  situacao: Situacao;
  dias_para_vencer: number;
  dias_atraso: number;
  faixa_atraso: FaixaAtraso | null;
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

// A descrição da fatura repete a lista de sessões inteira; na tabela só cabe
// uma linha de resumo.
const resumirDescricao = (texto: string | null) => {
  if (!texto) return '';
  const primeira = texto.split('\n')[0];
  return primeira.length > 90 ? `${primeira.slice(0, 90)}…` : primeira;
};

interface ContasReceberListProps {
  className?: string;
}

export const ContasReceberList = React.memo<ContasReceberListProps>(
  ({ className }) => {
    const [contas, setContas] = React.useState<ContaReceber[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [selectedSituacao, setSelectedSituacao] =
      React.useState<string>('em_aberto');
    const [selectedPeriodo, setSelectedPeriodo] =
      React.useState<string>('todas');
    const [dateRange, setDateRange] = React.useState<
      { from: Date; to: Date } | undefined
    >();
    const [aging, setAging] = React.useState<
      { faixa_atraso: FaixaAtraso; qtd: number; total: number }[]
    >([]);
    const { toast } = useToast();

    React.useEffect(() => {
      const hoje = new Date();
      switch (selectedPeriodo) {
        case 'vencidas':
          setDateRange({ from: new Date(2000, 0, 1), to: hoje });
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
        case 'todas':
        default:
          setDateRange(undefined);
          break;
      }
    }, [selectedPeriodo]);

    // Agregado no servidor — ver nota equivalente em ContasPagarList.
    const loadAging = React.useCallback(async () => {
      const { data, error } = await supabase
        .from('vw_aging_contas_receber')
        .select('faixa_atraso, qtd, total');

      if (error) {
        console.error('Erro ao carregar aging do recebível:', error);
        return;
      }

      const porFaixa = new Map(
        (data || []).map((f) => [
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
    }, []);

    const loadContas = React.useCallback(async () => {
      setIsLoading(true);
      try {
        let query = supabase
          .from('vw_contas_receber')
          .select('*')
          .order('data_vencimento', { ascending: true });

        if (selectedSituacao === 'em_aberto') {
          query = query.not('situacao', 'in', '("recebido","cancelado")');
        } else if (selectedSituacao !== 'todas') {
          query = query.eq('situacao', selectedSituacao);
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
            `descricao.ilike.%${searchTerm}%,responsavel_cobranca.ilike.%${searchTerm}%,paciente.ilike.%${searchTerm}%`
          );
        }

        // Recebidas somam milhares de linhas: sem filtro de período, limita.
        if (selectedSituacao === 'recebido' || selectedSituacao === 'todas') {
          query = query.limit(500);
        }

        const { data, error } = await query;
        if (error) throw error;

        setContas((data || []) as ContaReceber[]);
      } catch (error) {
        console.error('Erro ao carregar contas a receber:', error);
        toast({
          variant: 'destructive',
          title: 'Erro ao carregar',
          description: 'Não foi possível carregar as contas a receber.',
        });
      } finally {
        setIsLoading(false);
      }
    }, [selectedSituacao, dateRange, searchTerm, toast]);

    React.useEffect(() => {
      void loadContas();
    }, [loadContas]);

    React.useEffect(() => {
      void loadAging();
    }, [loadAging]);

    const totais = React.useMemo(() => {
      const emAberto = contas.filter(
        (c) => c.situacao !== 'recebido' && c.situacao !== 'cancelado'
      );
      return {
        aReceber: emAberto.reduce((s, c) => s + Number(c.valor_total), 0),
        qtdAReceber: emAberto.length,
        recebido: contas
          .filter((c) => c.situacao === 'recebido')
          .reduce((s, c) => s + Number(c.valor_total), 0),
        vencidas: contas.filter((c) => c.situacao === 'atrasado').length,
      };
    }, [contas]);

    const totalAtrasoGeral = React.useMemo(
      () => aging.reduce((s, f) => s + f.total, 0),
      [aging]
    );
    const qtdAtrasoGeral = React.useMemo(
      () => aging.reduce((s, f) => s + f.qtd, 0),
      [aging]
    );

    const getSituacaoBadge = (conta: ContaReceber) => {
      switch (conta.situacao) {
        case 'recebido':
          return (
            <Badge variant="outline" className="text-green-600">
              <CheckCircle className="mr-1 h-3 w-3" />
              Recebido
            </Badge>
          );
        case 'cancelado':
          return (
            <Badge variant="secondary">
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

    const handleExportCSV = () => {
      try {
        const headers = [
          'Vencimento',
          'Responsável pela cobrança',
          'Paciente',
          'Empresa',
          'Valor',
          'Situação',
          'Dias em atraso',
          'Recebido em',
          'Lembretes enviados',
        ];

        const rows = contas.map((c) => [
          format(parseISO(c.data_vencimento), 'dd/MM/yyyy'),
          c.responsavel_cobranca || '',
          c.paciente || '',
          c.empresa || '',
          moeda(Number(c.valor_total)),
          c.situacao,
          String(c.dias_atraso ?? 0),
          c.data_recebimento
            ? format(parseISO(c.data_recebimento), 'dd/MM/yyyy')
            : '',
          String(c.lembretes_enviados ?? 0),
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
        link.download = `contas_receber_${format(new Date(), 'yyyy-MM-dd')}.csv`;
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
      <Card className={className}>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Contas a Receber</CardTitle>
              <CardDescription>
                Faturas em aberto — o ASAAS continua sendo quem cobra e quem
                registra o pagamento.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              disabled={contas.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              Exportar
            </Button>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      A receber (no filtro)
                    </p>
                    <p className="text-xl font-bold text-orange-600">
                      {moeda(totais.aReceber)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {totais.qtdAReceber} fatura
                      {totais.qtdAReceber !== 1 ? 's' : ''}
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
                      Vencidas (no filtro)
                    </p>
                    <p className="text-xl font-bold text-red-600">
                      {totais.vencidas}
                    </p>
                  </div>
                  <AlertCircle className="h-8 w-8 text-red-600/20" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Inadimplência total
                    </p>
                    <p className="text-xl font-bold text-red-600">
                      {moeda(totalAtrasoGeral)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {qtdAtrasoGeral} fatura
                      {qtdAtrasoGeral !== 1 ? 's' : ''} em atraso
                    </p>
                  </div>
                  <History className="h-8 w-8 text-red-600/20" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Recebido (no filtro)
                    </p>
                    <p className="text-xl font-bold text-green-600">
                      {moeda(totais.recebido)}
                    </p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-600/20" />
                </div>
              </CardContent>
            </Card>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {aging.length > 0 && (
            <Card className="border-red-200 bg-red-50/50 dark:border-red-900/40 dark:bg-red-950/20">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <History className="h-4 w-4 text-red-600" />
                  Inadimplência por idade
                </CardTitle>
                <CardDescription>
                  Quanto mais antiga a fatura, menor a chance de receber.
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
                        {faixa.qtd} fatura{faixa.qtd !== 1 ? 's' : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-4">
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por responsável, paciente ou descrição..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <Select
              value={selectedSituacao}
              onValueChange={setSelectedSituacao}
            >
              <SelectTrigger>
                <SelectValue placeholder="Situação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="em_aberto">Em aberto</SelectItem>
                <SelectItem value="atrasado">Atrasadas</SelectItem>
                <SelectItem value="a_vencer">A vencer</SelectItem>
                <SelectItem value="recebido">Recebidas</SelectItem>
                <SelectItem value="cancelado">Canceladas</SelectItem>
                <SelectItem value="todas">Todas</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedPeriodo} onValueChange={setSelectedPeriodo}>
              <SelectTrigger>
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as datas</SelectItem>
                <SelectItem value="vencidas">Já vencidas</SelectItem>
                <SelectItem value="semana">Próximos 7 dias</SelectItem>
                <SelectItem value="mes_atual">Mês atual</SelectItem>
                <SelectItem value="proximo_mes">Próximo mês</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : contas.length === 0 ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
              <Receipt className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-medium">
                Nenhuma fatura encontrada
              </h3>
              <p className="max-w-sm text-sm text-muted-foreground">
                {selectedSituacao === 'em_aberto'
                  ? 'Nada em aberto no filtro atual — todas as faturas foram recebidas.'
                  : 'Tente ajustar os filtros de busca.'}
              </p>
            </div>
          ) : (
            <>
              {totais.vencidas > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Faturas vencidas</AlertTitle>
                  <AlertDescription>
                    {totais.vencidas} fatura
                    {totais.vencidas !== 1 ? 's' : ''} vencida
                    {totais.vencidas !== 1 ? 's' : ''} no filtro atual. A régua
                    de cobrança automática roda terças e sextas.
                  </AlertDescription>
                </Alert>
              )}

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Responsável</TableHead>
                      <TableHead>Paciente</TableHead>
                      <TableHead>Empresa</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead className="text-center">Lembretes</TableHead>
                      <TableHead className="text-right">NFS-e</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contas.map((conta) => (
                      <TableRow key={conta.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">
                              {format(
                                parseISO(conta.data_vencimento),
                                'dd/MM/yyyy'
                              )}
                            </span>
                            {conta.data_recebimento && (
                              <span className="text-xs text-green-600">
                                Recebido{' '}
                                {format(
                                  parseISO(conta.data_recebimento),
                                  'dd/MM/yyyy'
                                )}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="line-clamp-1 text-sm">
                              {conta.responsavel_cobranca || '-'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="line-clamp-1 text-sm text-muted-foreground">
                                  {conta.paciente || '-'}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-sm">
                                {resumirDescricao(conta.descricao) ||
                                  conta.paciente}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {conta.empresa || '-'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-sm font-medium">
                            {moeda(Number(conta.valor_total))}
                          </span>
                        </TableCell>
                        <TableCell>{getSituacaoBadge(conta)}</TableCell>
                        <TableCell className="text-center">
                          {conta.lembretes_enviados ? (
                            <Badge variant="outline" className="gap-1">
                              <MessageCircle className="h-3 w-3" />
                              {conta.lembretes_enviados}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              -
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {conta.link_nfe ? (
                            <Button variant="ghost" size="sm" asChild>
                              <a
                                href={conta.link_nfe}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="h-4 w-4" />
                                <span className="sr-only">Abrir NFS-e</span>
                              </a>
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              -
                            </span>
                          )}
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
    );
  }
);

ContasReceberList.displayName = 'ContasReceberList';
