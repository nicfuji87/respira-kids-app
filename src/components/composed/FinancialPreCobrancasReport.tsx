import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  TrendingUp,
  Search,
  X,
  AlertCircle,
  Download,
  Bell,
  Filter,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';
import { Button } from '@/components/primitives/button';
import { Skeleton } from '@/components/primitives/skeleton';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { Input } from '@/components/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/primitives/table';
import { useToast } from '@/components/primitives/use-toast';
import { DatePicker } from './DatePicker';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import {
  computeDateRange,
  PERIOD_LABELS,
  type PeriodFilter,
} from '@/lib/date-range';
import {
  gerarRelatorioPreCobrancasPdf,
  DESFECHO_LABEL,
  type Desfecho,
} from '@/lib/pdf/relatorio-pre-cobrancas';

// AI dev note: Painel de FUNIL das pré-cobranças (aba Financeiro > Faturas). Lê a
// view vw_pre_cobrancas_completa (1 linha por pagamento_link, TODOS os status) e
// mostra o desfecho de cada uma — respondendo "do lote que gerei, quantos
// pagaram?". Complementa o FinancialPreFaturasList (que só lista as ABERTAS, para
// ação). Este é read-only/análise. Filtra por período de CRIAÇÃO (criado_em).

interface PreCobrancaRow {
  id: string;
  criado_em: string;
  vencimento: string | null;
  valor_base: number;
  empresa_id: string | null;
  empresa_nome: string | null;
  responsavel_nome: string | null;
  paciente_nome: string | null;
  lembretes_enviados: number;
  ultimo_lembrete_em: string | null;
  desfecho: Desfecho;
  qtd_consultas: number;
}

type DesfechoFilter = 'todos' | Desfecho;

const DESFECHO_BADGE: Record<Desfecho, string> = {
  paga: 'bg-green-100 text-green-800 border-green-300',
  aguardando_pagamento: 'bg-amber-100 text-amber-800 border-amber-300',
  pendente: 'bg-orange-100 text-orange-800 border-orange-300',
  expirada: 'bg-red-100 text-red-800 border-red-300',
  cancelada: 'bg-gray-100 text-gray-700 border-gray-300',
  estornada: 'bg-purple-100 text-purple-800 border-purple-300',
};

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    v || 0
  );

const formatDate = (iso?: string | null) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
    });
  } catch {
    return String(iso).split('T')[0];
  }
};

interface FinancialPreCobrancasReportProps {
  className?: string;
}

export const FinancialPreCobrancasReport: React.FC<
  FinancialPreCobrancasReportProps
> = ({ className }) => {
  const { toast } = useToast();

  const [rows, setRows] = useState<PreCobrancaRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('mes_atual');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [empresaFilter, setEmpresaFilter] = useState('todos');
  const [desfechoFilter, setDesfechoFilter] = useState<DesfechoFilter>('todos');
  const [searchQuery, setSearchQuery] = useState('');

  // AI dev note: filtro de período (criado_em) no servidor; empresa/desfecho/busca
  // no client sobre o conjunto carregado (volume é pequeno — dezenas por mês).
  const fetchRows = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { dateStart, dateEnd } = computeDateRange(
        periodFilter,
        startDate,
        endDate
      );
      const campos =
        'id, criado_em, vencimento, valor_base, empresa_id, empresa_nome, responsavel_nome, paciente_nome, lembretes_enviados, ultimo_lembrete_em, desfecho, qtd_consultas';

      const buildQuery = () => {
        let q = supabase
          .from('vw_pre_cobrancas_completa')
          .select(campos)
          .order('criado_em', { ascending: false });
        if (periodFilter !== 'todos') {
          if (dateStart) q = q.gte('criado_em', dateStart);
          if (dateEnd) q = q.lte('criado_em', dateEnd + 'T23:59:59');
        }
        return q;
      };

      const todas: PreCobrancaRow[] = [];
      let offset = 0;
      const size = 1000;
      let hasMore = true;
      while (hasMore) {
        const { data, error: batchErr } = await buildQuery().range(
          offset,
          offset + size - 1
        );
        if (batchErr) throw batchErr;
        if (data && data.length > 0) {
          todas.push(...(data as unknown as PreCobrancaRow[]));
          offset += size;
          hasMore = data.length === size;
        } else {
          hasMore = false;
        }
      }
      setRows(todas);
    } catch (err) {
      console.error('Erro ao carregar pré-cobranças:', err);
      setError('Erro ao carregar pré-cobranças');
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

  const filtered = useMemo(() => {
    let r = rows;
    if (empresaFilter !== 'todos')
      r = r.filter((x) => x.empresa_id === empresaFilter);
    if (desfechoFilter !== 'todos')
      r = r.filter((x) => x.desfecho === desfechoFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      r = r.filter(
        (x) =>
          x.responsavel_nome?.toLowerCase().includes(q) ||
          x.paciente_nome?.toLowerCase().includes(q)
      );
    }
    return r;
  }, [rows, empresaFilter, desfechoFilter, searchQuery]);

  const resumo = useMemo(() => {
    const acc = {
      total: filtered.length,
      valorTotal: 0,
      valorPago: 0,
      paga: 0,
      aguardando_pagamento: 0,
      pendente: 0,
      expirada: 0,
      cancelada: 0,
      estornada: 0,
    };
    for (const r of filtered) {
      acc.valorTotal += r.valor_base || 0;
      acc[r.desfecho]++;
      if (r.desfecho === 'paga') acc.valorPago += r.valor_base || 0;
    }
    return acc;
  }, [filtered]);

  // Conversão = pagas / (geradas − canceladas). Canceladas não são "oportunidade".
  const consideradas = resumo.total - resumo.cancelada;
  const conversao =
    consideradas > 0 ? Math.round((resumo.paga / consideradas) * 100) : 0;

  const handleExportPdf = useCallback(() => {
    if (filtered.length === 0) {
      toast({
        title: 'Nada para exportar',
        description: 'Nenhuma pré-cobrança nos filtros selecionados.',
      });
      return;
    }
    setIsExporting(true);
    try {
      const partes: string[] = [];
      if (empresaFilter !== 'todos') {
        const emp = empresas.find((e) => e.id === empresaFilter);
        if (emp) partes.push(`Empresa: ${emp.nome}`);
      }
      if (desfechoFilter !== 'todos')
        partes.push(`Desfecho: ${DESFECHO_LABEL[desfechoFilter]}`);
      if (searchQuery) partes.push(`Busca: "${searchQuery}"`);

      gerarRelatorioPreCobrancasPdf(filtered, {
        periodoLabel: PERIOD_LABELS[periodFilter],
        filtrosLabel: partes.length ? partes.join(' · ') : undefined,
        geradoEm: new Date(),
      });
    } catch (err) {
      console.error('Erro ao exportar PDF:', err);
      toast({
        title: 'Erro ao exportar PDF',
        description: 'Não foi possível gerar o relatório.',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  }, [
    filtered,
    empresaFilter,
    desfechoFilter,
    searchQuery,
    empresas,
    periodFilter,
    toast,
  ]);

  const resumoCards: Array<{
    label: string;
    value: string;
    className: string;
  }> = [
    {
      label: 'Geradas',
      value: `${resumo.total} · ${formatCurrency(resumo.valorTotal)}`,
      className: 'text-foreground',
    },
    {
      label: `Pagas (${conversao}% conversão)`,
      value: `${resumo.paga} · ${formatCurrency(resumo.valorPago)}`,
      className: 'text-green-600',
    },
    {
      label: 'Aguardando pagamento',
      value: String(resumo.aguardando_pagamento),
      className: 'text-amber-600',
    },
    {
      label: 'Pendentes',
      value: String(resumo.pendente),
      className: 'text-orange-600',
    },
    {
      label: 'Expiradas',
      value: String(resumo.expirada),
      className: 'text-red-600',
    },
    {
      label: 'Canceladas',
      value: String(resumo.cancelada),
      className: 'text-gray-500',
    },
  ];

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Funil de pré-cobranças
          </span>
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {filtered.length}{' '}
              {filtered.length === 1 ? 'pré-cobrança' : 'pré-cobranças'}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPdf}
              disabled={isExporting || isLoading}
              title="Exporta o funil filtrado em PDF"
            >
              <Download className="h-4 w-4 mr-2" />
              {isExporting ? 'Gerando...' : 'Exportar PDF'}
            </Button>
          </div>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Desfecho das pré-cobranças por período de criação — quantas viraram
          pagamento e quantas seguem em aberto.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Filtros */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Select
            value={periodFilter}
            onValueChange={(v) => setPeriodFilter(v as PeriodFilter)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mes_atual">Mês Atual</SelectItem>
              <SelectItem value="mes_anterior">Mês Anterior</SelectItem>
              <SelectItem value="ultimos_30">Últimos 30 dias</SelectItem>
              <SelectItem value="ultimos_60">Últimos 60 dias</SelectItem>
              <SelectItem value="ultimos_90">Últimos 90 dias</SelectItem>
              <SelectItem value="ultimo_ano">Último ano</SelectItem>
              <SelectItem value="personalizado">Personalizado</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={desfechoFilter}
            onValueChange={(v) => setDesfechoFilter(v as DesfechoFilter)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Desfecho" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os desfechos</SelectItem>
              <SelectItem value="paga">Paga</SelectItem>
              <SelectItem value="aguardando_pagamento">
                Aguardando pagamento
              </SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="expirada">Expirada</SelectItem>
              <SelectItem value="cancelada">Cancelada</SelectItem>
              <SelectItem value="estornada">Estornada</SelectItem>
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

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Responsável ou paciente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
        </div>

        {periodFilter === 'personalizado' && (
          <div className="flex gap-3 items-center">
            <DatePicker
              value={startDate}
              onChange={setStartDate}
              placeholder="Data inicial"
            />
            <span className="text-muted-foreground">até</span>
            <DatePicker
              value={endDate}
              onChange={setEndDate}
              placeholder="Data final"
            />
          </div>
        )}

        {/* Cards de resumo */}
        {!isLoading && !error && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {resumoCards.map((c) => (
              <div key={c.label} className="rounded-lg border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">{c.label}</div>
                <div className={cn('text-lg font-semibold', c.className)}>
                  {c.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Conteúdo */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Filter className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhuma pré-cobrança nesse período/filtros.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Criada em</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Desfecho</TableHead>
                  <TableHead className="text-center">Lembretes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {r.responsavel_nome || '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.paciente_nome || '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.empresa_nome || '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(r.valor_base)}
                    </TableCell>
                    <TableCell>{formatDate(r.criado_em)}</TableCell>
                    <TableCell>{formatDate(r.vencimento)}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          'font-normal',
                          DESFECHO_BADGE[r.desfecho]
                        )}
                      >
                        {DESFECHO_LABEL[r.desfecho]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {r.lembretes_enviados > 0 ? (
                        <span
                          className="inline-flex items-center gap-1 text-orange-700"
                          title={
                            r.ultimo_lembrete_em
                              ? `Último em ${formatDate(r.ultimo_lembrete_em)}`
                              : undefined
                          }
                        >
                          <Bell className="h-3 w-3" />
                          {r.lembretes_enviados}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
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
  );
};
