import React from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  GraduationCap,
  Loader2,
  CheckCircle,
  AlertCircle,
  Bus,
  Pencil,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  CurrencyInput,
} from '@/components/primitives';
import { DatePicker } from '@/components/composed';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';

// AI dev note: Fechamento mensal de bolsa e VT das estagiárias.
//
// O VT conta dia com registro de ENTRADA no ponto — não o par
// entrada+saída. Esquecer de bater a saída é comum e não deveria custar a
// passagem de quem veio trabalhar.
//
// Valores ficam por estagiária (não global): o próximo contrato não vai
// ter o mesmo valor do atual.

interface Fechamento {
  candidatura_id: string;
  estagiaria: string;
  competencia: string;
  dias_presenca: number;
  valor_bolsa: number;
  valor_vt_dia: number;
  valor_vt: number;
  valor_total: number;
  ja_lancado: boolean;
  lancamento_id: string | null;
}

interface Estagiaria {
  id: string;
  nome: string;
  valor_bolsa_mensal: number | null;
  valor_vt_dia: number | null;
}

const moeda = (v: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(v) || 0);

const mesLabel = (iso: string) =>
  format(parseISO(iso), "MMMM 'de' yyyy", { locale: ptBR });

export const FechamentoEstagioPanel = React.memo<{ className?: string }>(
  ({ className }) => {
    const [linhas, setLinhas] = React.useState<Fechamento[]>([]);
    const [estagiarias, setEstagiarias] = React.useState<Estagiaria[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [lancando, setLancando] = React.useState<Fechamento | null>(null);
    const [vencimento, setVencimento] = React.useState('');
    const [editando, setEditando] = React.useState<Estagiaria | null>(null);
    const [bolsa, setBolsa] = React.useState<number | null>(null);
    const [vtDia, setVtDia] = React.useState<number | null>(null);
    const [isSaving, setIsSaving] = React.useState(false);
    const { toast } = useToast();

    const carregar = React.useCallback(async () => {
      setIsLoading(true);
      try {
        const [fech, est] = await Promise.all([
          supabase
            .from('vw_fechamento_estagio_mes')
            .select('*')
            .order('competencia', { ascending: false }),
          supabase
            .from('candidaturas_estagio')
            .select('id, nome, valor_bolsa_mensal, valor_vt_dia')
            .eq('ativo', true)
            .eq('status', 'aprovado')
            .order('nome'),
        ]);

        if (fech.error) throw fech.error;
        setLinhas((fech.data || []) as Fechamento[]);
        setEstagiarias((est.data || []) as Estagiaria[]);
      } catch (error) {
        console.error('Erro ao carregar fechamento de estágio:', error);
        toast({
          variant: 'destructive',
          title: 'Erro ao carregar',
          description: 'Não foi possível carregar os dados de estágio.',
        });
      } finally {
        setIsLoading(false);
      }
    }, [toast]);

    React.useEffect(() => {
      void carregar();
    }, [carregar]);

    const abrirLancamento = (f: Fechamento) => {
      const venc = new Date(parseISO(f.competencia));
      venc.setMonth(venc.getMonth() + 1);
      venc.setDate(5);
      setVencimento(format(venc, 'yyyy-MM-dd'));
      setLancando(f);
    };

    const confirmarLancamento = async () => {
      if (!lancando) return;
      setIsSaving(true);
      try {
        const { data, error } = await supabase.rpc('fn_estagio_fechar_mes', {
          p_candidatura_id: lancando.candidatura_id,
          p_competencia: lancando.competencia,
          p_vencimento: vencimento || null,
        });
        if (error) throw error;

        const r = data as { total: number } | null;
        toast({
          title: 'Lançado em Contas a Pagar',
          description: `${lancando.estagiaria} — ${moeda(r?.total ?? 0)}`,
        });
        setLancando(null);
        void carregar();
      } catch (error) {
        console.error('Erro ao lançar estágio:', error);
        toast({
          variant: 'destructive',
          title: 'Não foi possível lançar',
          description:
            error instanceof Error ? error.message : 'Erro ao lançar o mês.',
        });
      } finally {
        setIsSaving(false);
      }
    };

    const abrirEdicao = (e: Estagiaria) => {
      setBolsa(e.valor_bolsa_mensal);
      setVtDia(e.valor_vt_dia);
      setEditando(e);
    };

    const salvarValores = async () => {
      if (!editando) return;
      setIsSaving(true);
      try {
        const { error } = await supabase
          .from('candidaturas_estagio')
          .update({ valor_bolsa_mensal: bolsa, valor_vt_dia: vtDia })
          .eq('id', editando.id);
        if (error) throw error;

        toast({
          title: 'Valores atualizados',
          description: `${editando.nome}: bolsa ${moeda(bolsa ?? 0)}, VT ${moeda(vtDia ?? 0)}/dia.`,
        });
        setEditando(null);
        void carregar();
      } catch (error) {
        console.error('Erro ao salvar valores:', error);
        toast({
          variant: 'destructive',
          title: 'Não foi possível salvar',
          description:
            error instanceof Error ? error.message : 'Erro ao salvar.',
        });
      } finally {
        setIsSaving(false);
      }
    };

    const pendentes = linhas.filter((l) => !l.ja_lancado);
    const totalPendente = pendentes.reduce(
      (s, l) => s + Number(l.valor_total),
      0
    );
    const semValor = estagiarias.filter(
      (e) => !e.valor_bolsa_mensal || !e.valor_vt_dia
    );

    return (
      <>
        <Card className={className}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              Bolsa e vale-transporte
            </CardTitle>
            <CardDescription>
              O VT conta dia com registro de entrada no ponto — quem veio
              trabalhar recebe a passagem, mesmo que tenha esquecido de bater a
              saída.
            </CardDescription>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        A lançar
                      </p>
                      <p className="text-xl font-bold text-orange-600">
                        {moeda(totalPendente)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {pendentes.length} mês
                        {pendentes.length !== 1 ? 'es' : ''} em aberto
                      </p>
                    </div>
                    <Bus className="h-8 w-8 text-orange-600/20" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <p className="mb-2 text-sm font-medium text-muted-foreground">
                    Valores por estagiária
                  </p>
                  <div className="space-y-1.5">
                    {estagiarias.map((e) => (
                      <div
                        key={e.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="truncate text-sm">{e.nome}</span>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {moeda(e.valor_bolsa_mensal ?? 0)} +{' '}
                            {moeda(e.valor_vt_dia ?? 0)}/dia
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => abrirEdicao(e)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            <span className="sr-only">Editar valores</span>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {semValor.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Sem bolsa ou VT cadastrado:{' '}
                  {semValor.map((e) => e.nome).join(', ')}. O mês não fecha até
                  preencher.
                </AlertDescription>
              </Alert>
            )}

            {isLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : linhas.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-10 text-center">
                <GraduationCap className="mb-2 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm font-medium">Nenhum ponto registrado</p>
                <p className="max-w-sm text-xs text-muted-foreground">
                  Os meses aparecem aqui conforme as estagiárias batem ponto no
                  tablet.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Estagiária</TableHead>
                      <TableHead>Mês</TableHead>
                      <TableHead className="text-center">Dias</TableHead>
                      <TableHead className="text-right">Bolsa</TableHead>
                      <TableHead className="text-right">VT</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhas.map((l) => (
                      <TableRow key={`${l.candidatura_id}-${l.competencia}`}>
                        <TableCell className="font-medium">
                          {l.estagiaria}
                        </TableCell>
                        <TableCell className="text-sm capitalize">
                          {mesLabel(l.competencia)}
                        </TableCell>
                        <TableCell className="text-center text-sm">
                          {l.dias_presenca}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {moeda(l.valor_bolsa)}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {moeda(l.valor_vt)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {moeda(l.valor_total)}
                        </TableCell>
                        <TableCell className="text-right">
                          {l.ja_lancado ? (
                            <Badge variant="outline" className="text-green-600">
                              <CheckCircle className="mr-1 h-3 w-3" />
                              Lançado
                            </Badge>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => abrirLancamento(l)}
                              disabled={l.valor_total <= 0}
                            >
                              Lançar
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {lancando && (
          <Dialog
            open
            onOpenChange={(aberto) => {
              if (!aberto && !isSaving) setLancando(null);
            }}
          >
            <DialogContent className="sm:max-w-[440px]">
              <DialogHeader>
                <DialogTitle>Lançar bolsa e VT</DialogTitle>
                <DialogDescription className="capitalize">
                  {lancando.estagiaria} · {mesLabel(lancando.competencia)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-1.5 rounded-md border bg-muted/40 p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bolsa</span>
                    <span>{moeda(lancando.valor_bolsa)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      VT — {lancando.dias_presenca} dias ×{' '}
                      {moeda(lancando.valor_vt_dia)}
                    </span>
                    <span>{moeda(lancando.valor_vt)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1.5 font-bold">
                    <span>Total</span>
                    <span>{moeda(lancando.valor_total)}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="estagio-venc">Vencimento</Label>
                  <DatePicker
                    value={vencimento}
                    onChange={setVencimento}
                    placeholder="dd/mm/aaaa"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setLancando(null)}
                  disabled={isSaving}
                >
                  Cancelar
                </Button>
                <Button onClick={confirmarLancamento} disabled={isSaving}>
                  {isSaving && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Lançar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {editando && (
          <Dialog
            open
            onOpenChange={(aberto) => {
              if (!aberto && !isSaving) setEditando(null);
            }}
          >
            <DialogContent className="sm:max-w-[400px]">
              <DialogHeader>
                <DialogTitle>Valores de {editando.nome}</DialogTitle>
                <DialogDescription>
                  Vale só para ela — cada contrato pode ter valor diferente.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="est-bolsa">Bolsa por mês</Label>
                  <CurrencyInput
                    id="est-bolsa"
                    value={bolsa}
                    onChange={setBolsa}
                    placeholder="R$ 0,00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="est-vt">Vale-transporte por dia</Label>
                  <CurrencyInput
                    id="est-vt"
                    value={vtDia}
                    onChange={setVtDia}
                    placeholder="R$ 0,00"
                  />
                  <p className="text-xs text-muted-foreground">
                    Ida e volta somados.
                  </p>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setEditando(null)}
                  disabled={isSaving}
                >
                  Cancelar
                </Button>
                <Button onClick={salvarValores} disabled={isSaving}>
                  {isSaving && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Salvar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </>
    );
  }
);

FechamentoEstagioPanel.displayName = 'FechamentoEstagioPanel';
