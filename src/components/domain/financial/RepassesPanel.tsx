import React from 'react';
import { format, parseISO } from 'date-fns';
import {
  HandCoins,
  Loader2,
  AlertCircle,
  CheckCircle,
  Clock,
  Undo2,
  CalendarClock,
  TrendingUp,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/primitives';
import { DatePicker } from '@/components/composed';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';

// AI dev note: Repasse de comissão às profissionais.
//
// Regra do negócio: a profissional recebe QUANDO O CLIENTE PAGA. Por isso
// o pendente não tem recorte de data — é tudo que tem margem gerada (a
// margem só nasce quando a fatura é paga) e ainda não entrou em repasse.
// Atendimento antigo cuja fatura só foi paga agora entra sozinho no
// próximo fechamento; é o que a coluna "chegou depois" sinaliza.
//
// Sócia não aparece aqui: quem recebe integral não gera margem.

interface Pendente {
  profissional_id: string;
  profissional: string;
  empresa_id: string | null;
  empresa: string | null;
  carteira: string | null;
  qtd_atendimentos: number;
  valor_devido: number;
  atendimento_mais_antigo: string;
  atendimento_mais_recente: string;
  chegou_apos_ultimo_fechamento: number;
  primeira_chegada_apos_fechamento: string | null;
}

interface Historico {
  id: string;
  profissional: string;
  empresa: string | null;
  carteira: string | null;
  fechado_em: string;
  qtd_atendimentos: number;
  valor_total: number;
  status: string;
  observacoes: string | null;
  status_pagamento: string | null;
  data_vencimento: string | null;
}

interface ARecuperar {
  profissional_id: string;
  profissional: string;
  empresa: string | null;
  qtd_atendimentos: number;
  valor_a_recuperar: number;
  estornado_em: string | null;
}

const moeda = (v: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(v) || 0);

export const RepassesPanel = React.memo<{ className?: string }>(
  ({ className }) => {
    const [pendentes, setPendentes] = React.useState<Pendente[]>([]);
    const [historico, setHistorico] = React.useState<Historico[]>([]);
    const [aRecuperar, setARecuperar] = React.useState<ARecuperar[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [fechando, setFechando] = React.useState<Pendente | null>(null);
    const [vencimento, setVencimento] = React.useState('');
    const [isSaving, setIsSaving] = React.useState(false);
    const { toast } = useToast();

    const carregar = React.useCallback(async () => {
      setIsLoading(true);
      try {
        const [pend, hist, rec] = await Promise.all([
          supabase
            .from('vw_repasses_pendentes')
            .select('*')
            .order('valor_devido', { ascending: false }),
          supabase
            .from('vw_repasses_historico')
            .select('*')
            .order('fechado_em', { ascending: false })
            .limit(30),
          supabase.from('vw_repasses_a_recuperar').select('*'),
        ]);

        if (pend.error) throw pend.error;
        setPendentes((pend.data || []) as Pendente[]);
        setHistorico((hist.data || []) as Historico[]);
        setARecuperar((rec.data || []) as ARecuperar[]);
      } catch (error) {
        console.error('Erro ao carregar repasses:', error);
        toast({
          variant: 'destructive',
          title: 'Erro ao carregar',
          description: 'Não foi possível carregar os repasses.',
        });
      } finally {
        setIsLoading(false);
      }
    }, [toast]);

    React.useEffect(() => {
      void carregar();
    }, [carregar]);

    const abrirFechamento = (p: Pendente) => {
      const d = new Date();
      d.setDate(d.getDate() + 5);
      setVencimento(format(d, 'yyyy-MM-dd'));
      setFechando(p);
    };

    const confirmarFechamento = async () => {
      if (!fechando) return;
      setIsSaving(true);
      try {
        const { data, error } = await supabase.rpc('fn_repasse_fechar', {
          p_profissional_id: fechando.profissional_id,
          p_empresa_id: fechando.empresa_id,
          p_vencimento: vencimento || null,
        });
        if (error) throw error;

        const r = data as { total: number; atendimentos: number } | null;
        toast({
          title: 'Repasse fechado',
          description: `${r?.atendimentos ?? 0} atendimentos, ${moeda(r?.total ?? 0)} — já está em Contas a Pagar.`,
        });
        setFechando(null);
        void carregar();
      } catch (error) {
        console.error('Erro ao fechar repasse:', error);
        toast({
          variant: 'destructive',
          title: 'Não foi possível fechar',
          description:
            error instanceof Error
              ? error.message
              : 'Erro ao fechar o repasse.',
        });
      } finally {
        setIsSaving(false);
      }
    };

    const desfazer = async (h: Historico) => {
      try {
        const { error } = await supabase.rpc('fn_repasse_desfazer', {
          p_repasse_id: h.id,
        });
        if (error) throw error;
        toast({
          title: 'Repasse desfeito',
          description: `Os ${h.qtd_atendimentos} atendimentos voltaram para o pendente.`,
        });
        void carregar();
      } catch (error) {
        console.error('Erro ao desfazer repasse:', error);
        toast({
          variant: 'destructive',
          title: 'Não foi possível desfazer',
          description:
            error instanceof Error ? error.message : 'Erro ao desfazer.',
        });
      }
    };

    const totalDevido = pendentes.reduce(
      (s, p) => s + Number(p.valor_devido),
      0
    );
    const totalRecuperar = aRecuperar.reduce(
      (s, r) => s + Number(r.valor_a_recuperar),
      0
    );
    const chegouDepois = pendentes.reduce(
      (s, p) => s + (p.chegou_apos_ultimo_fechamento || 0),
      0
    );

    return (
      <>
        <Card className={className}>
          <CardHeader>
            <div className="flex flex-col gap-1">
              <CardTitle className="flex items-center gap-2">
                <HandCoins className="h-5 w-5" />
                Repasse de comissão
              </CardTitle>
              <CardDescription>
                A profissional recebe quando o cliente paga. Sócia não aparece
                aqui — quem recebe integral não gera comissão.
              </CardDescription>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        A repassar agora
                      </p>
                      <p className="text-xl font-bold text-orange-600">
                        {moeda(totalDevido)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {pendentes.length} fechamento
                        {pendentes.length !== 1 ? 's' : ''} em aberto
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
                        Chegou depois do último fechamento
                      </p>
                      <p className="text-xl font-bold">{chegouDepois}</p>
                      <p className="text-xs text-muted-foreground">
                        atendimento{chegouDepois !== 1 ? 's' : ''} de cliente
                        que pagou atrasado
                      </p>
                    </div>
                    <TrendingUp className="h-8 w-8 text-muted-foreground/20" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        A recuperar
                      </p>
                      <p className="text-xl font-bold text-red-600">
                        {moeda(totalRecuperar)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        comissão paga e depois estornada
                      </p>
                    </div>
                    <AlertCircle className="h-8 w-8 text-red-600/20" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {totalRecuperar > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Comissão paga sobre fatura estornada</AlertTitle>
                <AlertDescription>
                  {aRecuperar
                    .map(
                      (r) =>
                        `${r.profissional}: ${moeda(r.valor_a_recuperar)} (${r.qtd_atendimentos} atend.)`
                    )
                    .join(' · ')}
                  . O sistema não desconta sozinho — decida se abate no próximo
                  repasse ou cobra à parte.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <h3 className="text-base font-semibold">A repassar</h3>
              {isLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : pendentes.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-10 text-center">
                  <CheckCircle className="mb-2 h-8 w-8 text-green-600/40" />
                  <p className="text-sm font-medium">Nada a repassar</p>
                  <p className="max-w-sm text-xs text-muted-foreground">
                    Aparece aqui assim que um cliente pagar a fatura de um
                    atendimento de profissional comissionada.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Profissional</TableHead>
                        <TableHead>Empresa que paga</TableHead>
                        <TableHead className="text-center">Atend.</TableHead>
                        <TableHead>Período</TableHead>
                        <TableHead className="text-right">Devido</TableHead>
                        <TableHead className="text-right">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendentes.map((p) => (
                        <TableRow key={`${p.profissional_id}-${p.empresa_id}`}>
                          <TableCell className="font-medium">
                            {p.profissional}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {p.carteira || p.empresa || '—'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="text-sm">
                              {p.qtd_atendimentos}
                            </span>
                            {p.chegou_apos_ultimo_fechamento > 0 && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge
                                      variant="secondary"
                                      className="ml-1.5 cursor-help"
                                    >
                                      +{p.chegou_apos_ultimo_fechamento}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    {p.chegou_apos_ultimo_fechamento} de cliente
                                    que pagou depois do último fechamento
                                    {p.primeira_chegada_apos_fechamento &&
                                      ` (desde ${format(parseISO(p.primeira_chegada_apos_fechamento), 'dd/MM')})`}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground">
                              {format(
                                parseISO(p.atendimento_mais_antigo),
                                'dd/MM/yy'
                              )}{' '}
                              a{' '}
                              {format(
                                parseISO(p.atendimento_mais_recente),
                                'dd/MM/yy'
                              )}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {moeda(p.valor_devido)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              onClick={() => abrirFechamento(p)}
                            >
                              Fechar
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {historico.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-base font-semibold">Fechamentos</h3>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Profissional</TableHead>
                        <TableHead>Empresa</TableHead>
                        <TableHead className="text-center">Atend.</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Situação</TableHead>
                        <TableHead className="text-right">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historico.map((h) => (
                        <TableRow key={h.id}>
                          <TableCell className="text-sm">
                            {format(parseISO(h.fechado_em), 'dd/MM/yyyy')}
                          </TableCell>
                          <TableCell className="text-sm">
                            {h.profissional}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {h.carteira || h.empresa || '—'}
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {h.qtd_atendimentos}
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium">
                            {moeda(h.valor_total)}
                          </TableCell>
                          <TableCell>
                            {h.status === 'acerto_historico' ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge
                                      variant="outline"
                                      className="cursor-help"
                                    >
                                      Acerto histórico
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    Pago fora do sistema antes da virada. Não
                                    gerou conta a pagar.
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : h.status === 'cancelado' ? (
                              <Badge variant="secondary">Desfeito</Badge>
                            ) : h.status_pagamento === 'pago' ? (
                              <Badge
                                variant="outline"
                                className="text-green-600"
                              >
                                <CheckCircle className="mr-1 h-3 w-3" />
                                Pago
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                <Clock className="mr-1 h-3 w-3" />A pagar
                                {h.data_vencimento &&
                                  ` ${format(parseISO(h.data_vencimento), 'dd/MM')}`}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {h.status !== 'cancelado' &&
                              h.status_pagamento !== 'pago' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => desfazer(h)}
                                >
                                  <Undo2 className="mr-1 h-3.5 w-3.5" />
                                  Desfazer
                                </Button>
                              )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {fechando && (
          <Dialog
            open
            onOpenChange={(aberto) => {
              if (!aberto && !isSaving) setFechando(null);
            }}
          >
            <DialogContent className="sm:max-w-[440px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CalendarClock className="h-5 w-5" />
                  Fechar repasse
                </DialogTitle>
                <DialogDescription>
                  {fechando.profissional} ·{' '}
                  {fechando.carteira || fechando.empresa}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="rounded-md border bg-muted/40 p-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-muted-foreground">
                      {fechando.qtd_atendimentos} atendimentos pagos pelo
                      cliente
                    </span>
                    <span className="text-lg font-bold">
                      {moeda(fechando.valor_devido)}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="repasse-venc">Vencimento do pagamento</Label>
                  <DatePicker
                    value={vencimento}
                    onChange={setVencimento}
                    placeholder="dd/mm/aaaa"
                  />
                </div>

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Isso cria uma conta a pagar na carteira{' '}
                    <strong>{fechando.carteira || fechando.empresa}</strong>. O
                    pagamento em si você faz em Contas a Pagar.
                  </AlertDescription>
                </Alert>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setFechando(null)}
                  disabled={isSaving}
                >
                  Cancelar
                </Button>
                <Button onClick={confirmarFechamento} disabled={isSaving}>
                  {isSaving && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Fechar repasse
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </>
    );
  }
);

RepassesPanel.displayName = 'RepassesPanel';
