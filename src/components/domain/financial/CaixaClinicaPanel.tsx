import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  PiggyBank,
  TrendingUp,
  Users,
  Receipt,
  Building2,
  AlertCircle,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/primitives';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';

// AI dev note: Painel do Caixa da Clínica (carteira comum).
// Mostra o saldo alimentado pelas MARGENS dos atendimentos comissionados
// (margem = valor_servico − comissão − imposto). Fonte: vw_caixa_clinica_resumo
// (agregado) e vw_margens_clinica (extrato). Margens 'provisorias' usam alíquota
// estimada (tributos_empresa) até a reconciliação com o imposto real.

interface ResumoRow {
  mes: string;
  empresa_id: string;
  empresa: string;
  atendimentos: number;
  receita: number;
  comissoes: number;
  impostos: number;
  margem: number;
}

interface MargemRow {
  id: string;
  status: string;
  valor_servico: number;
  comissao: number;
  imposto: number;
  aliquota_aplicada: number;
  margem: number;
  empresa: string;
  profissional: string | null;
  data_hora: string | null;
  pago_em: string | null;
}

const num = (v: unknown): number => Number(v ?? 0);

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);

export const CaixaClinicaPanel = React.memo(() => {
  const [resumo, setResumo] = React.useState<ResumoRow[]>([]);
  const [extrato, setExtrato] = React.useState<MargemRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  // Saldo REAL da conta (saldo inicial no corte + movimentos reais após o corte).
  // Separado da margem, que é resultado provisório (alíquota estimada).
  const [saldoConta, setSaldoConta] = React.useState<{
    saldoInicial: number;
    dataCorte: string | null;
    saldo: number;
  } | null>(null);
  const { toast } = useToast();

  React.useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const [resumoRes, extratoRes] = await Promise.all([
          supabase
            .from('vw_caixa_clinica_resumo')
            .select('*')
            .order('mes', { ascending: false }),
          supabase
            .from('vw_margens_clinica')
            .select('*')
            .neq('status', 'estornado')
            .order('gerado_em', { ascending: false })
            .limit(50),
        ]);

        if (resumoRes.error) throw resumoRes.error;
        if (extratoRes.error) throw extratoRes.error;

        setResumo(
          (resumoRes.data || []).map((r) => ({
            mes: r.mes,
            empresa_id: r.empresa_id,
            empresa: r.empresa,
            atendimentos: num(r.atendimentos),
            receita: num(r.receita),
            comissoes: num(r.comissoes),
            impostos: num(r.impostos),
            margem: num(r.margem),
          }))
        );
        setExtrato(
          (extratoRes.data || []).map((m) => ({
            id: m.id,
            status: m.status,
            valor_servico: num(m.valor_servico),
            comissao: num(m.comissao),
            imposto: num(m.imposto),
            aliquota_aplicada: num(m.aliquota_aplicada),
            margem: num(m.margem),
            empresa: m.empresa,
            profissional: m.profissional,
            data_hora: m.data_hora,
            pago_em: m.pago_em,
          }))
        );

        // Saldo REAL: saldo inicial da conta (no corte) + movimentos reais
        // (lançamentos pagos no centro Clínica após o corte). Lançamentos anteriores
        // ao corte já estão no saldo inicial — daí o filtro por data_competencia.
        const { data: centro } = await supabase
          .from('centros_financeiros')
          .select(
            'id, conta:conta_bancaria_id(saldo_inicial, data_saldo_inicial)'
          )
          .eq('tipo', 'comum')
          .maybeSingle();
        const conta = Array.isArray(centro?.conta)
          ? centro?.conta[0]
          : centro?.conta;
        if (centro?.id && conta?.data_saldo_inicial) {
          const { data: movs } = await supabase
            .from('lancamentos_financeiros')
            .select('tipo_lancamento, valor_total')
            .eq('centro_financeiro_id', centro.id)
            .eq('pago', true)
            .gt('data_competencia', conta.data_saldo_inicial);
          const movimentos = (movs || []).reduce(
            (s, l) =>
              s +
              (l.tipo_lancamento === 'receita'
                ? num(l.valor_total)
                : -num(l.valor_total)),
            0
          );
          const inicial = num(conta.saldo_inicial);
          setSaldoConta({
            saldoInicial: inicial,
            dataCorte: conta.data_saldo_inicial,
            saldo: inicial + movimentos,
          });
        }
      } catch (error) {
        console.error('Erro ao carregar caixa da clínica:', error);
        toast({
          variant: 'destructive',
          title: 'Erro ao carregar',
          description: 'Não foi possível carregar o caixa da Clínica.',
        });
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [toast]);

  // Totais consolidados
  const totais = React.useMemo(
    () =>
      resumo.reduce(
        (acc, r) => {
          acc.receita += r.receita;
          acc.comissoes += r.comissoes;
          acc.impostos += r.impostos;
          acc.margem += r.margem;
          acc.atendimentos += r.atendimentos;
          return acc;
        },
        { receita: 0, comissoes: 0, impostos: 0, margem: 0, atendimentos: 0 }
      ),
    [resumo]
  );

  // Margem por empresa
  const porEmpresa = React.useMemo(() => {
    const map = new Map<string, number>();
    resumo.forEach((r) =>
      map.set(r.empresa, (map.get(r.empresa) || 0) + r.margem)
    );
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [resumo]);

  // Margem por mês (últimos 6)
  const porMes = React.useMemo(() => {
    const map = new Map<string, number>();
    resumo.forEach((r) => map.set(r.mes, (map.get(r.mes) || 0) + r.margem));
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, 6);
  }, [resumo]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <PiggyBank className="h-6 w-6 text-emerald-600" />
          Caixa da Clínica
        </h2>
        <p className="text-muted-foreground">
          Saldo real da conta desde o corte + margem dos atendimentos
          comissionados como resultado a conciliar
        </p>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Saldo real x margem provisória</AlertTitle>
        <AlertDescription>
          O <strong>Saldo em conta</strong> é o saldo inicial no corte +
          movimentos reais lançados depois. A <strong>margem</strong> usa
          alíquotas estimadas (Tributos) e é referência do resultado a conciliar
          — não soma direto no saldo.
        </AlertDescription>
      </Alert>

      {/* Cards de resumo */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card className="border-emerald-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              Saldo em conta
              <PiggyBank className="h-4 w-4 text-emerald-600" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {formatCurrency(saldoConta?.saldo ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {saldoConta?.dataCorte
                ? `desde ${format(new Date(saldoConta.dataCorte), 'dd/MM/yyyy')} (Nubank)`
                : 'conta não configurada'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              Resultado gerado (margens)
              <PiggyBank className="h-4 w-4 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(totais.margem)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {totais.atendimentos} atendimentos · a conciliar
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              Receita comissionados
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(totais.receita)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              Comissões repassadas
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              −{formatCurrency(totais.comissoes)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              Impostos (estimados)
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              −{formatCurrency(totais.impostos)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Por empresa */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" />
              Margem por empresa de faturamento
            </CardTitle>
            <CardDescription>De onde a margem foi gerada</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {porEmpresa.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados.</p>
            ) : (
              porEmpresa.map(([empresa, margem]) => (
                <div
                  key={empresa}
                  className="flex items-center justify-between border-b py-2 last:border-0"
                >
                  <span className="text-sm">{empresa}</span>
                  <span className="font-medium text-emerald-600">
                    {formatCurrency(margem)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Por mês */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" />
              Margem por mês
            </CardTitle>
            <CardDescription>Últimos 6 meses</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {porMes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados.</p>
            ) : (
              porMes.map(([mes, margem]) => (
                <div
                  key={mes}
                  className="flex items-center justify-between border-b py-2 last:border-0"
                >
                  <span className="text-sm capitalize">
                    {format(new Date(mes), "MMM 'de' yyyy", { locale: ptBR })}
                  </span>
                  <span className="font-medium text-emerald-600">
                    {formatCurrency(margem)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Extrato detalhado */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimas margens</CardTitle>
          <CardDescription>
            Detalhe dos atendimentos que alimentaram o caixa
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Profissional</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="text-right">Serviço</TableHead>
                  <TableHead className="text-right">Comissão</TableHead>
                  <TableHead className="text-right">Imposto</TableHead>
                  <TableHead className="text-right">Margem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {extrato.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center">
                      Nenhuma margem registrada ainda.
                    </TableCell>
                  </TableRow>
                ) : (
                  extrato.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {m.data_hora
                          ? format(new Date(m.data_hora), 'dd/MM/yyyy')
                          : '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {m.profissional?.split(' ')[0] || '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {m.empresa}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {formatCurrency(m.valor_servico)}
                      </TableCell>
                      <TableCell className="text-right text-sm text-amber-600">
                        −{formatCurrency(m.comissao)}
                      </TableCell>
                      <TableCell className="text-right text-sm text-red-600">
                        −{formatCurrency(m.imposto)}
                      </TableCell>
                      <TableCell className="text-right font-medium text-emerald-600">
                        {formatCurrency(m.margem)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

CaixaClinicaPanel.displayName = 'CaixaClinicaPanel';
