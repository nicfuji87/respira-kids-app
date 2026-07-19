import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Send,
  Search,
  X,
  AlertCircle,
  Download,
  Filter,
  Info,
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
  gerarRelatorioDisparosPdf,
  DISPARO_LABEL,
  type DisparoStatus,
} from '@/lib/pdf/relatorio-disparos';

// AI dev note: "Log de disparos" (aba Financeiro > Faturas). Lê vw_disparo_cobrancas
// (1 linha por cobrança) e mostra o status de disparo ponta a ponta: gerado -> fila
// (entregue ao n8n?) -> ENVIO WhatsApp. O 'entregue_n8n' = saiu do Supabase mas o
// n8n ainda não confirmou o WhatsApp (o resultado real só chega quando o fluxo n8n
// chamar fn_registrar_disparo_cobranca). Serve para achar "erro" e "faltou disparar".

interface DisparoRow {
  pagamento_link_id: string;
  token: string;
  criado_em: string;
  link_status: string;
  valor_base: number;
  empresa_id: string | null;
  empresa_nome: string | null;
  responsavel_nome: string | null;
  responsavel_telefone: string | number | null;
  paciente_nome: string | null;
  lote_id: string | null;
  geracao_erro: string | null;
  envio_detalhe: string | null;
  envio_em: string | null;
  fila_erro: string | null;
  disparo_status: DisparoStatus;
}

type DisparoFilter = 'todos' | DisparoStatus;

const DISPARO_BADGE: Record<DisparoStatus, string> = {
  enviado: 'bg-green-100 text-green-800 border-green-300',
  falhou: 'bg-red-100 text-red-800 border-red-300',
  entregue_n8n: 'bg-blue-100 text-blue-800 border-blue-300',
  na_fila: 'bg-amber-100 text-amber-800 border-amber-300',
  erro_entrega: 'bg-red-100 text-red-800 border-red-300',
  erro_geracao: 'bg-red-100 text-red-800 border-red-300',
  sem_disparo: 'bg-gray-100 text-gray-700 border-gray-300',
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

interface FinancialDisparosLogProps {
  className?: string;
}

export const FinancialDisparosLog: React.FC<FinancialDisparosLogProps> = ({
  className,
}) => {
  const { toast } = useToast();

  const [rows, setRows] = useState<DisparoRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('mes_atual');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<DisparoFilter>('todos');
  const [loteFilter, setLoteFilter] = useState('todos');
  const [searchQuery, setSearchQuery] = useState('');

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
        'pagamento_link_id, token, criado_em, link_status, valor_base, empresa_id, empresa_nome, responsavel_nome, responsavel_telefone, paciente_nome, lote_id, geracao_erro, envio_detalhe, envio_em, fila_erro, disparo_status';

      const buildQuery = () => {
        let q = supabase
          .from('vw_disparo_cobrancas')
          .select(campos)
          .order('criado_em', { ascending: false });
        if (periodFilter !== 'todos') {
          if (dateStart) q = q.gte('criado_em', dateStart);
          if (dateEnd) q = q.lte('criado_em', dateEnd + 'T23:59:59');
        }
        return q;
      };

      const todas: DisparoRow[] = [];
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
          todas.push(...(data as unknown as DisparoRow[]));
          offset += size;
          hasMore = data.length === size;
        } else {
          hasMore = false;
        }
      }
      setRows(todas);
    } catch (err) {
      console.error('Erro ao carregar disparos:', err);
      setError('Erro ao carregar o log de disparos');
    } finally {
      setIsLoading(false);
    }
  }, [periodFilter, startDate, endDate]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  // Lotes disponíveis (para focar num disparo específico)
  const lotes = useMemo(() => {
    const m = new Map<string, { data: string; qtd: number }>();
    rows.forEach((r) => {
      if (r.lote_id) {
        const cur = m.get(r.lote_id);
        if (cur) cur.qtd++;
        else m.set(r.lote_id, { data: r.criado_em, qtd: 1 });
      }
    });
    return [...m.entries()]
      .map(([id, v]) => ({ id, label: `${formatDate(v.data)} (${v.qtd})` }))
      .sort((a, b) => (a.label < b.label ? 1 : -1));
  }, [rows]);

  const temLote = useMemo(() => rows.some((r) => r.lote_id), [rows]);

  const filtered = useMemo(() => {
    let r = rows;
    if (statusFilter !== 'todos')
      r = r.filter((x) => x.disparo_status === statusFilter);
    if (loteFilter !== 'todos') r = r.filter((x) => x.lote_id === loteFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      r = r.filter(
        (x) =>
          x.responsavel_nome?.toLowerCase().includes(q) ||
          x.paciente_nome?.toLowerCase().includes(q) ||
          String(x.responsavel_telefone || '').includes(q)
      );
    }
    return r;
  }, [rows, statusFilter, loteFilter, searchQuery]);

  const resumo = useMemo(() => {
    const acc = {
      total: filtered.length,
      enviado: 0,
      falhou: 0,
      entregue_n8n: 0,
      na_fila: 0,
      erros: 0,
    };
    for (const r of filtered) {
      if (r.disparo_status === 'enviado') acc.enviado++;
      else if (r.disparo_status === 'falhou') acc.falhou++;
      else if (r.disparo_status === 'entregue_n8n') acc.entregue_n8n++;
      else if (r.disparo_status === 'na_fila') acc.na_fila++;
      else if (
        r.disparo_status === 'erro_entrega' ||
        r.disparo_status === 'erro_geracao'
      )
        acc.erros++;
    }
    return acc;
  }, [filtered]);

  const handleExportPdf = useCallback(() => {
    if (filtered.length === 0) {
      toast({
        title: 'Nada para exportar',
        description: 'Nenhum disparo nos filtros selecionados.',
      });
      return;
    }
    setIsExporting(true);
    try {
      const partes: string[] = [];
      if (statusFilter !== 'todos')
        partes.push(`Status: ${DISPARO_LABEL[statusFilter]}`);
      if (loteFilter !== 'todos') {
        const lote = lotes.find((l) => l.id === loteFilter);
        if (lote) partes.push(`Lote: ${lote.label}`);
      }
      if (searchQuery) partes.push(`Busca: "${searchQuery}"`);

      gerarRelatorioDisparosPdf(filtered, {
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
    statusFilter,
    loteFilter,
    searchQuery,
    lotes,
    periodFilter,
    toast,
  ]);

  const resumoCards: Array<{
    label: string;
    value: number;
    className: string;
  }> = [
    { label: 'Disparos', value: resumo.total, className: 'text-foreground' },
    { label: 'Enviados', value: resumo.enviado, className: 'text-green-600' },
    { label: 'Falhou', value: resumo.falhou, className: 'text-red-600' },
    {
      label: 'Entregue ao n8n',
      value: resumo.entregue_n8n,
      className: 'text-blue-600',
    },
    { label: 'Na fila', value: resumo.na_fila, className: 'text-amber-600' },
    { label: 'Erros', value: resumo.erros, className: 'text-red-700' },
  ];

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Log de disparos
          </span>
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {filtered.length} {filtered.length === 1 ? 'disparo' : 'disparos'}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPdf}
              disabled={isExporting || isLoading}
              title="Exporta o log filtrado em PDF"
            >
              <Download className="h-4 w-4 mr-2" />
              {isExporting ? 'Gerando...' : 'Exportar PDF'}
            </Button>
          </div>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Envio do link de cada cobrança por WhatsApp: gerado → entregue ao n8n
          → enviado/falhou. Use para achar erros ou disparos que não saíram.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Aviso: entregue_n8n sem confirmação do WhatsApp */}
        {!isLoading && !error && resumo.entregue_n8n > 0 && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>{resumo.entregue_n8n}</strong> disparo(s) saíram do
              sistema mas ainda sem confirmação do WhatsApp. O resultado real
              (enviado / falhou) aparece aqui quando o fluxo n8n registra o
              envio.
            </AlertDescription>
          </Alert>
        )}

        {/* Filtros */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as DisparoFilter)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="enviado">Enviado</SelectItem>
              <SelectItem value="falhou">Falhou</SelectItem>
              <SelectItem value="entregue_n8n">Entregue ao n8n</SelectItem>
              <SelectItem value="na_fila">Na fila</SelectItem>
              <SelectItem value="erro_entrega">Erro de entrega</SelectItem>
              <SelectItem value="erro_geracao">Erro na geração</SelectItem>
              <SelectItem value="sem_disparo">Sem disparo</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={loteFilter}
            onValueChange={setLoteFilter}
            disabled={!temLote}
          >
            <SelectTrigger>
              <SelectValue placeholder="Lote" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os lotes</SelectItem>
              {lotes.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  Lote {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Responsável, paciente ou telefone..."
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

        {/* Resumo */}
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
            <p>Nenhum disparo nesse período/filtros.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Detalhe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.pagamento_link_id}>
                    <TableCell className="font-medium">
                      {r.responsavel_nome || '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.responsavel_telefone
                        ? String(r.responsavel_telefone)
                        : '—'}
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
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          'font-normal',
                          DISPARO_BADGE[r.disparo_status]
                        )}
                        title={
                          r.envio_em
                            ? `Envio registrado em ${formatDate(r.envio_em)}`
                            : undefined
                        }
                      >
                        {DISPARO_LABEL[r.disparo_status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate">
                      {r.envio_detalhe || r.fila_erro || r.geracao_erro || ''}
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
