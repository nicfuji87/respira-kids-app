import React from 'react';
import {
  Building2,
  PiggyBank,
  Wallet,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import {
  startOfYear,
  endOfYear,
  subYears,
  subMonths,
  startOfMonth,
} from 'date-fns';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/primitives';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';

// AI dev note: Visão consolidada por CARTEIRA (BC / FS / Clínica) num período.
// Empresa = faturamento − comissões − margem enviada à Clínica − despesas próprias.
// Clínica = margens recebidas − custos compartilhados. Alíquotas dos impostos são
// ESTIMADAS (tributos_empresa) até ajuste com a contadora; demais números são reais.
// Fontes: vw_faturamento_empresa_mes, vw_caixa_clinica_resumo, vw_despesas_carteira_mes.

type Periodo = 'ano_atual' | 'ano_anterior' | 'ultimos_12m' | 'tudo';

interface FaturamentoRow {
  mes: string;
  empresa_id: string;
  empresa: string;
  faturamento_servico: number;
}
interface MargemRow {
  mes: string;
  empresa_id: string;
  empresa: string;
  receita: number;
  comissoes: number;
  impostos: number;
  margem: number;
}
interface DespesaRow {
  mes: string;
  carteira: string | null;
  carteira_tipo: string | null;
  natureza_custo: string;
  total: number;
}

const num = (v: unknown): number => Number(v ?? 0);

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);

function rangeFor(periodo: Periodo): { inicio: Date | null; fim: Date | null } {
  const hoje = new Date();
  switch (periodo) {
    case 'ano_atual':
      return { inicio: startOfYear(hoje), fim: endOfYear(hoje) };
    case 'ano_anterior': {
      const a = subYears(hoje, 1);
      return { inicio: startOfYear(a), fim: endOfYear(a) };
    }
    case 'ultimos_12m':
      return { inicio: startOfMonth(subMonths(hoje, 11)), fim: hoje };
    case 'tudo':
    default:
      return { inicio: null, fim: null };
  }
}

export const ResumoCarteiras = React.memo(() => {
  const [periodo, setPeriodo] = React.useState<Periodo>('ano_atual');
  const [faturamento, setFaturamento] = React.useState<FaturamentoRow[]>([]);
  const [margens, setMargens] = React.useState<MargemRow[]>([]);
  const [despesas, setDespesas] = React.useState<DespesaRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const { toast } = useToast();

  React.useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const [fatRes, margRes, despRes] = await Promise.all([
          supabase.from('vw_faturamento_empresa_mes').select('*'),
          supabase.from('vw_caixa_clinica_resumo').select('*'),
          supabase.from('vw_despesas_carteira_mes').select('*'),
        ]);
        if (fatRes.error) throw fatRes.error;
        if (margRes.error) throw margRes.error;
        if (despRes.error) throw despRes.error;

        setFaturamento(
          (fatRes.data || []).map((r) => ({
            mes: r.mes,
            empresa_id: r.empresa_id,
            empresa: r.empresa,
            faturamento_servico: num(r.faturamento_servico),
          }))
        );
        setMargens(
          (margRes.data || []).map((r) => ({
            mes: r.mes,
            empresa_id: r.empresa_id,
            empresa: r.empresa,
            receita: num(r.receita),
            comissoes: num(r.comissoes),
            impostos: num(r.impostos),
            margem: num(r.margem),
          }))
        );
        setDespesas(
          (despRes.data || []).map((r) => ({
            mes: r.mes,
            carteira: r.carteira,
            carteira_tipo: r.carteira_tipo,
            natureza_custo: r.natureza_custo,
            total: num(r.total),
          }))
        );
      } catch (error) {
        console.error('Erro ao carregar carteiras:', error);
        toast({
          variant: 'destructive',
          title: 'Erro ao carregar',
          description: 'Não foi possível carregar a visão por carteira.',
        });
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [toast]);

  const dados = React.useMemo(() => {
    const { inicio, fim } = rangeFor(periodo);
    const noPeriodo = (mes: string) => {
      if (!inicio || !fim) return true;
      const d = new Date(mes);
      return d >= inicio && d <= fim;
    };

    const fat = faturamento.filter((r) => noPeriodo(r.mes));
    const marg = margens.filter((r) => noPeriodo(r.mes));
    const desp = despesas.filter((r) => noPeriodo(r.mes));

    // Empresas (carteiras BC / FS)
    const empresasMap = new Map<
      string,
      {
        empresa: string;
        faturamento: number;
        comissionados: number;
        comissoes: number;
        margemClinica: number;
        despesasProprias: number;
      }
    >();
    const ensure = (id: string, nome: string) => {
      if (!empresasMap.has(id))
        empresasMap.set(id, {
          empresa: nome,
          faturamento: 0,
          comissionados: 0,
          comissoes: 0,
          margemClinica: 0,
          despesasProprias: 0,
        });
      return empresasMap.get(id)!;
    };
    fat.forEach((r) => {
      ensure(r.empresa_id, r.empresa).faturamento += r.faturamento_servico;
    });
    marg.forEach((r) => {
      const e = ensure(r.empresa_id, r.empresa);
      e.comissionados += r.receita;
      e.comissoes += r.comissoes;
      e.margemClinica += r.margem;
    });
    desp
      .filter((r) => r.carteira_tipo === 'empresa')
      .forEach((r) => {
        const found = Array.from(empresasMap.values()).find(
          (e) => e.empresa === r.carteira
        );
        if (found) found.despesasProprias += r.total;
      });

    const empresas = Array.from(empresasMap.values()).sort(
      (a, b) => b.faturamento - a.faturamento
    );

    // Clínica
    const margensRecebidas = marg.reduce((s, r) => s + r.margem, 0);
    const custosCompartilhados = desp
      .filter((r) => r.carteira_tipo === 'comum')
      .reduce((s, r) => s + r.total, 0);

    // Custos individuais sem carteira atribuída (a classificar)
    const naoAtribuidos = desp
      .filter((r) => !r.carteira)
      .reduce((s, r) => s + r.total, 0);

    return {
      empresas,
      clinica: {
        margensRecebidas,
        custosCompartilhados,
        saldo: margensRecebidas - custosCompartilhados,
      },
      naoAtribuidos,
    };
  }, [faturamento, margens, despesas, periodo]);

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-64 w-full" />
        ))}
      </div>
    );
  }

  const Linha = ({
    label,
    valor,
    tom,
  }: {
    label: string;
    valor: number;
    tom?: 'neg' | 'pos' | 'muted';
  }) => (
    <div className="flex items-center justify-between text-sm py-1">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          tom === 'neg'
            ? 'text-red-600'
            : tom === 'pos'
              ? 'text-emerald-600 font-medium'
              : ''
        }
      >
        {tom === 'neg' ? '−' : ''}
        {formatCurrency(Math.abs(valor))}
      </span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="h-6 w-6" />
            Resultado por carteira
          </h2>
          <p className="text-muted-foreground">
            Cada empresa e o caixa comum da Clínica, separados
          </p>
        </div>
        <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ano_atual">Ano atual</SelectItem>
            <SelectItem value="ano_anterior">Ano anterior</SelectItem>
            <SelectItem value="ultimos_12m">Últimos 12 meses</SelectItem>
            <SelectItem value="tudo">Tudo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Impostos estimados</AlertTitle>
        <AlertDescription>
          As margens usam alíquotas estimadas; os demais valores são reais.
          {dados.naoAtribuidos > 0 && (
            <>
              {' '}
              Há <strong>{formatCurrency(dados.naoAtribuidos)}</strong> em
              custos individuais sem empresa atribuída — não entram em nenhuma
              carteira ainda.
            </>
          )}
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Carteiras das empresas */}
        {dados.empresas.map((e) => {
          const socias = e.faturamento - e.comissionados;
          return (
            <Card key={e.empresa}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Building2 className="h-4 w-4 text-blue-600" />
                  {e.empresa}
                </CardTitle>
                <CardDescription>Carteira da empresa</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold mb-3">
                  {formatCurrency(e.faturamento)}
                  <span className="text-xs font-normal text-muted-foreground ml-1">
                    faturado
                  </span>
                </div>
                <div className="border-t pt-2">
                  <Linha label="Sócias (direto)" valor={socias} tom="muted" />
                  <Linha
                    label="Comissionados"
                    valor={e.comissionados}
                    tom="muted"
                  />
                  <Linha
                    label="Comissões repassadas"
                    valor={e.comissoes}
                    tom="neg"
                  />
                  <div className="flex items-center justify-between text-sm py-1">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <ArrowRight className="h-3 w-3" />
                      Margem → Clínica
                    </span>
                    <span className="text-red-600">
                      −{formatCurrency(e.margemClinica)}
                    </span>
                  </div>
                  <Linha
                    label="Despesas próprias"
                    valor={e.despesasProprias}
                    tom="neg"
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* Carteira da Clínica */}
        <Card className="border-emerald-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <PiggyBank className="h-4 w-4 text-emerald-600" />
              Clínica Respira Kids
            </CardTitle>
            <CardDescription>Caixa comum</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold mb-3 ${
                dados.clinica.saldo >= 0
                  ? 'text-emerald-600'
                  : 'text-orange-600'
              }`}
            >
              {formatCurrency(dados.clinica.saldo)}
              <span className="text-xs font-normal text-muted-foreground ml-1">
                saldo
              </span>
            </div>
            <div className="border-t pt-2">
              <Linha
                label="Margens recebidas"
                valor={dados.clinica.margensRecebidas}
                tom="pos"
              />
              <Linha
                label="Custos compartilhados"
                valor={dados.clinica.custosCompartilhados}
                tom="neg"
              />
            </div>
            {periodo === 'tudo' && (
              <p className="mt-3 text-xs text-muted-foreground">
                Atenção: margens existem desde set/2025; custos incluem
                histórico anterior. Compare por período para um saldo justo.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
});

ResumoCarteiras.displayName = 'ResumoCarteiras';
