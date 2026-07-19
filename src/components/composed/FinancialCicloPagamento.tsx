import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Clock, AlertCircle, Info } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Skeleton } from '@/components/primitives/skeleton';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { DatePicker } from './DatePicker';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { computeDateRange, type PeriodFilter } from '@/lib/date-range';

// AI dev note: Card de "Tempo de pagamento" (aba Financeiro > Faturas). Lê a view
// vw_ciclo_cobranca e mede quanto tempo o cliente leva da PRÉ-COBRANÇA gerada até
// o PAGAMENTO — a métrica confiável (nasce do fluxo novo de link; os timestamps do
// legado importado são inválidos, por isso filtramos via_link + dias >= 0). Mostra
// média/mediana/distribuição e a diferença entre PIX e cartão. Filtra por pago_em.

interface CicloRow {
  fatura_id: string;
  pago_em: string | null;
  forma_pagamento: string | null;
  empresa_id: string | null;
  empresa_nome: string | null;
  dias_precobranca_ate_pago: number | null;
  valor_total: number;
}

const formaLabel = (f?: string | null) => {
  if (f === 'pix') return 'PIX';
  if (f === 'credit_card') return 'Cartão';
  return f || 'Outro';
};

const fmtDias = (n: number | null) =>
  n === null ? '—' : `${n.toFixed(1).replace('.', ',')} dias`;

interface FinancialCicloPagamentoProps {
  className?: string;
}

export const FinancialCicloPagamento: React.FC<
  FinancialCicloPagamentoProps
> = ({ className }) => {
  const [rows, setRows] = useState<CicloRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('todos');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [empresaFilter, setEmpresaFilter] = useState('todos');

  // AI dev note: só o fluxo VIA LINK e com duração >= 0 (descarta o legado, cujo
  // criado_em é posterior ao pago_em). Filtra por pago_em (quando pagou).
  const fetchRows = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { dateStart, dateEnd } = computeDateRange(
        periodFilter,
        startDate,
        endDate
      );
      let q = supabase
        .from('vw_ciclo_cobranca')
        .select(
          'fatura_id, pago_em, forma_pagamento, empresa_id, empresa_nome, dias_precobranca_ate_pago, valor_total'
        )
        .eq('via_link', true)
        .not('dias_precobranca_ate_pago', 'is', null)
        .gte('dias_precobranca_ate_pago', 0)
        .order('pago_em', { ascending: false });
      if (periodFilter !== 'todos') {
        if (dateStart) q = q.gte('pago_em', dateStart);
        if (dateEnd) q = q.lte('pago_em', dateEnd + 'T23:59:59');
      }
      const { data, error: err } = await q.range(0, 4999);
      if (err) throw err;
      setRows((data as unknown as CicloRow[]) || []);
    } catch (e) {
      console.error('Erro ao carregar ciclo de pagamento:', e);
      setError('Erro ao carregar as estatísticas de pagamento');
    } finally {
      setIsLoading(false);
    }
  }, [periodFilter, startDate, endDate]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const empresas = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => {
      if (r.empresa_id) m.set(r.empresa_id, r.empresa_nome || 'Empresa');
    });
    return [...m.entries()].map(([id, nome]) => ({ id, nome }));
  }, [rows]);

  const filtered = useMemo(
    () =>
      empresaFilter === 'todos'
        ? rows
        : rows.filter((r) => r.empresa_id === empresaFilter),
    [rows, empresaFilter]
  );

  const stats = useMemo(() => {
    const dias = filtered
      .map((r) => r.dias_precobranca_ate_pago)
      .filter((d): d is number => d !== null)
      .sort((a, b) => a - b);
    const n = dias.length;
    const media = n ? dias.reduce((s, d) => s + d, 0) / n : null;
    const mediana = n
      ? n % 2
        ? dias[(n - 1) / 2]
        : (dias[n / 2 - 1] + dias[n / 2]) / 2
      : null;
    const ate2 = dias.filter((d) => d <= 2).length;

    // Distribuição por faixa
    const faixas = [
      { label: 'Mesmo dia / 1 dia', min: 0, max: 1 },
      { label: '2–3 dias', min: 2, max: 3 },
      { label: '4–7 dias', min: 4, max: 7 },
      { label: '+7 dias', min: 8, max: Infinity },
    ].map((f) => ({
      label: f.label,
      qtd: dias.filter((d) => d >= f.min && d <= f.max).length,
    }));

    // Por forma de pagamento
    const porFormaMap = new Map<string, number[]>();
    for (const r of filtered) {
      if (r.dias_precobranca_ate_pago === null) continue;
      const k = formaLabel(r.forma_pagamento);
      const arr = porFormaMap.get(k) || [];
      arr.push(r.dias_precobranca_ate_pago);
      porFormaMap.set(k, arr);
    }
    const porForma = [...porFormaMap.entries()]
      .map(([forma, arr]) => ({
        forma,
        qtd: arr.length,
        media: arr.reduce((s, d) => s + d, 0) / arr.length,
      }))
      .sort((a, b) => b.qtd - a.qtd);

    return {
      n,
      media,
      mediana,
      pctAte2: n ? Math.round((ate2 / n) * 100) : 0,
      faixas,
      porForma,
    };
  }, [filtered]);

  const kpis = [
    { label: 'Cobranças pagas', value: String(stats.n) },
    { label: 'Tempo médio', value: fmtDias(stats.media) },
    { label: 'Mediana', value: fmtDias(stats.mediana) },
    { label: 'Pagam em ≤2 dias', value: `${stats.pctAte2}%` },
  ];

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Tempo de pagamento
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Da pré-cobrança gerada até o pagamento (fluxo de link). Quanto tempo,
          em média, o cliente leva para pagar.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Filtros */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Select
            value={periodFilter}
            onValueChange={(v) => setPeriodFilter(v as PeriodFilter)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Período (pagamento)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="mes_atual">Mês Atual</SelectItem>
              <SelectItem value="mes_anterior">Mês Anterior</SelectItem>
              <SelectItem value="ultimos_30">Últimos 30 dias</SelectItem>
              <SelectItem value="ultimos_60">Últimos 60 dias</SelectItem>
              <SelectItem value="ultimos_90">Últimos 90 dias</SelectItem>
              <SelectItem value="personalizado">Personalizado</SelectItem>
            </SelectContent>
          </Select>

          <Select value={empresaFilter} onValueChange={setEmpresaFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Empresa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as empresas</SelectItem>
              {empresas.map((emp) => (
                <SelectItem key={emp.id} value={emp.id}>
                  {emp.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {periodFilter === 'personalizado' && (
          <div className="flex gap-3 items-center">
            <DatePicker
              value={startDate}
              onChange={setStartDate}
              placeholder="Pago de"
            />
            <span className="text-muted-foreground">até</span>
            <DatePicker
              value={endDate}
              onChange={setEndDate}
              placeholder="Pago até"
            />
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : stats.n === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhuma cobrança paga (via link) nesse período.</p>
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {kpis.map((k) => (
                <div
                  key={k.label}
                  className="rounded-lg border bg-muted/30 p-3 text-center"
                >
                  <div className="text-xs text-muted-foreground">{k.label}</div>
                  <div className="text-xl font-bold text-primary mt-1">
                    {k.value}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Distribuição por faixa */}
              <div>
                <h4 className="text-sm font-medium mb-3">
                  Distribuição do tempo de pagamento
                </h4>
                <div className="space-y-2">
                  {stats.faixas.map((f) => {
                    const pct = stats.n
                      ? Math.round((f.qtd / stats.n) * 100)
                      : 0;
                    return (
                      <div key={f.label} className="text-sm">
                        <div className="flex justify-between mb-1">
                          <span className="text-muted-foreground">
                            {f.label}
                          </span>
                          <span className="font-medium">
                            {f.qtd} ({pct}%)
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-verde-pipa"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Por forma de pagamento */}
              <div>
                <h4 className="text-sm font-medium mb-3">
                  Por forma de pagamento
                </h4>
                <div className="space-y-3">
                  {stats.porForma.map((p) => (
                    <div
                      key={p.forma}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div>
                        <div className="font-medium">{p.forma}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.qtd} paga{p.qtd !== 1 ? 's' : ''}
                        </div>
                      </div>
                      <div
                        className={cn(
                          'text-lg font-semibold',
                          p.forma === 'PIX' ? 'text-green-600' : 'text-blue-600'
                        )}
                      >
                        {fmtDias(p.media)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Mede o ciclo <strong>pré-cobrança → pagamento</strong> das
                cobranças enviadas por link. Faturas antigas (importadas) não
                entram porque não têm o marco de criação confiável.
              </AlertDescription>
            </Alert>
          </>
        )}
      </CardContent>
    </Card>
  );
};
