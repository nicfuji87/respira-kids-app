import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  CreditCard,
  User,
  Search,
  X,
  Receipt,
  ExternalLink,
  FileText,
  AlertCircle,
  RefreshCw,
  ChevronRight,
  Bell,
  Download,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/primitives/alert-dialog';
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
import { useToast } from '@/components/primitives/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { DatePicker } from './DatePicker';
import { cn } from '@/lib/utils';
import { emitirNfeFatura } from '@/lib/faturas-api';
import {
  gerarRelatorioNfePdf,
  statusNfe,
  type FaturaNfeRow,
} from '@/lib/pdf/relatorio-nfe';
import {
  computeDateRange,
  PERIOD_LABELS,
  type PeriodFilter,
} from '@/lib/date-range';
import type { FaturaComDetalhes } from '@/types/faturas';
import { useAuth } from '@/hooks/useAuth';
import {
  FinancialNfeEmissaoMassa,
  type FaturaParaNfe,
} from './FinancialNfeEmissaoMassa';
import { supabase } from '@/lib/supabase';

// AI dev note: Lista de faturas para área financeira com otimizações de performance
// Mesmos filtros e paginação da lista de consultas

type StatusFilter =
  | 'todos'
  | 'pago'
  | 'pendente'
  | 'atrasado'
  | 'cancelado'
  | 'estornado';

// AI dev note: filtro por status da NFe. 'nao_emitida' significa FATURA PAGA sem
// nota (as que deveriam ter nota) — não inclui pendentes/canceladas sem nota.
// AI dev note: 'pendente_acao' = paga sem nota OU nota em erro. É o conjunto que o
// dono precisa resolver no fechamento do mês, e o alvo da emissão em massa — junta
// num filtro só os dois casos que a mesma ação (emitirNfeFatura) já sabe tratar.
type NfeFilter =
  | 'todos'
  | 'emitida'
  | 'erro'
  | 'nao_emitida'
  | 'pendente_acao'
  | 'sincronizando';

// Fonte única de "esta fatura precisa de emissão?" — usada no filtro da lista, no
// PDF e na emissão em massa, para os três nunca divergirem.
const nfePendenteDeAcao = (f: { status: string; link_nfe?: string | null }) =>
  f.status === 'pago' &&
  (statusNfe(f.link_nfe) === 'nao_emitida' || statusNfe(f.link_nfe) === 'erro');

type SortOption =
  | 'data_desc'
  | 'data_asc'
  | 'responsavel_asc'
  | 'responsavel_desc'
  | 'valor_desc'
  | 'valor_asc';

interface FinancialFaturasListProps {
  onFaturaClick?: (fatura: FaturaComDetalhes) => void;
  className?: string;
}

export const FinancialFaturasList: React.FC<FinancialFaturasListProps> = ({
  onFaturaClick,
  className,
}) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [faturas, setFaturas] = useState<FaturaComDetalhes[]>([]);
  const [filteredFaturas, setFilteredFaturas] = useState<FaturaComDetalhes[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEmitingNfe, setIsEmitingNfe] = useState<string | null>(null);
  // AI dev note: IDs de faturas que acabaram de ter NFe (re)emitida e estão
  // aguardando o resultado assíncrono via webhook (ASAAS -> n8n -> Supabase).
  // Durante a REEMISSÃO, o ASAAS dispara um webhook de CANCELAMENTO da nota
  // antiga que (legitimamente) grava link_nfe = '' — isso faria o botão voltar
  // para "Emitir NFe" no meio do processo. Enquanto a fatura estiver neste set,
  // forçamos o botão a "Gerando NFe" e mantemos o polling, até o link_nfe chegar
  // a um estado terminal (URL real ou 'erro').
  const [awaitingNfe, setAwaitingNfe] = useState<Set<string>>(new Set());
  // AI dev note: Armazena a fatura para a qual queremos abrir o diálogo de
  // "cancelar e reemitir NFe". Quando null, o diálogo fica fechado.
  const [faturaToCancelReissue, setFaturaToCancelReissue] =
    useState<FaturaComDetalhes | null>(null);

  // Estados de filtro
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('mes_atual');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('data_desc');
  const [professionalFilter, setProfessionalFilter] = useState<string>('todos');
  const [empresaFilter, setEmpresaFilter] = useState<string>('todos');
  const [nfeFilter, setNfeFilter] = useState<NfeFilter>('todos');
  const [isExporting, setIsExporting] = useState(false);
  // Emissão de NFe em massa: null = diálogo fechado
  const [isCarregandoMassa, setIsCarregandoMassa] = useState(false);
  const [faturasParaEmissaoMassa, setFaturasParaEmissaoMassa] = useState<
    FaturaParaNfe[] | null
  >(null);

  // Estados de paginação
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const PAGE_SIZE = 100; // AI dev note: 100 faturas por página

  // Estados de totais (todos os registros do filtro, não apenas da página)
  const [totalSummary, setTotalSummary] = useState({
    totalValue: 0,
    totalServico: 0,
    totalAcrescimo: 0,
    paidCount: 0,
    unpaidCount: 0,
    nfeEmittedCount: 0,
    nfeNotEmittedCount: 0,
  });

  // Listas para filtros
  const [professionals, setProfessionals] = useState<
    Array<{ id: string; nome: string }>
  >([]);
  const [empresas, setEmpresas] = useState<Array<{ id: string; nome: string }>>(
    []
  );

  // AI dev note: Busca otimizada com paginação e select de campos específicos
  const fetchFaturas = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // AI dev note: intervalo de datas centralizado em computeDateRange (mesma
      // regra reaproveitada pela exportação PDF).
      const { dateStart, dateEnd } = computeDateRange(
        periodFilter,
        startDate,
        endDate
      );

      // AI dev note: Select apenas campos necessários para performance
      const selectFields = [
        'id',
        'id_asaas',
        'valor_total',
        'status',
        'vencimento',
        'created_at',
        'empresa_id',
        'empresa_razao_social',
        'empresa_nome_fantasia',
        'responsavel_id',
        'responsavel_nome',
        'responsavel_cpf',
        'link_nfe',
        'status_nfe',
        'qtd_consultas',
        'periodo_inicio',
        'periodo_fim',
        'profissionais_envolvidos',
        'pacientes_atendidos',
        'lembretes_enviados',
        'ultimo_lembrete_em',
      ].join(',');

      // AI dev note: Buscar count COM OS MESMOS FILTROS aplicados
      let countQuery = supabase
        .from('vw_faturas_completas')
        .select('id', { count: 'exact', head: true });

      // Aplicar filtros apenas se não for 'todos'
      if (periodFilter !== 'todos') {
        if (dateStart) {
          countQuery = countQuery.gte('created_at', dateStart);
        }
        if (dateEnd) {
          countQuery = countQuery.lte('created_at', dateEnd + 'T23:59:59');
        }
      }

      const { count } = await countQuery;
      setTotalCount(count || 0);

      // AI dev note: Buscar totais usando agregação no banco (sem limite de 1000)
      // Buscar todas as faturas com filtros aplicados para calcular totais
      let allFaturasQuery = supabase
        .from('vw_faturas_completas')
        .select('valor_total, valor_servico, status, link_nfe');

      // Aplicar mesmos filtros de período
      if (periodFilter !== 'todos') {
        if (dateStart) {
          allFaturasQuery = allFaturasQuery.gte('created_at', dateStart);
        }
        if (dateEnd) {
          allFaturasQuery = allFaturasQuery.lte(
            'created_at',
            dateEnd + 'T23:59:59'
          );
        }
      }

      // Buscar TODAS as faturas em lotes para evitar limite de 1000
      const allFaturas: Array<{
        valor_total: number;
        valor_servico: number | null;
        status: string;
        link_nfe: string | null;
      }> = [];
      let currentOffset = 0;
      const batchSize = 1000;
      let hasMoreRecords = true;

      while (hasMoreRecords) {
        const { data: batchData, error: batchError } =
          await allFaturasQuery.range(
            currentOffset,
            currentOffset + batchSize - 1
          );

        if (batchError) {
          console.error('❌ Erro ao buscar lote de faturas:', batchError);
          break;
        }

        if (batchData && batchData.length > 0) {
          allFaturas.push(...batchData);
          currentOffset += batchSize;
          hasMoreRecords = batchData.length === batchSize;
        } else {
          hasMoreRecords = false;
        }
      }

      // Calcular totais com TODOS os registros
      const totalValue = allFaturas.reduce(
        (sum, item) => sum + (item.valor_total || 0),
        0
      );
      // AI dev note: serviço (receita líquida) x acréscimo de cartão (repasse ao
      // cliente). totalValue é o BRUTO cobrado; acréscimo = bruto - serviço.
      const totalServico = allFaturas.reduce(
        (sum, item) => sum + (item.valor_servico ?? item.valor_total ?? 0),
        0
      );
      const totalAcrescimo = Math.max(0, totalValue - totalServico);
      const paidCount = allFaturas.filter(
        (item) => item.status === 'pago'
      ).length;
      const unpaidCount = allFaturas.filter(
        (item) =>
          item.status !== 'pago' &&
          item.status !== 'cancelado' &&
          item.status !== 'estornado'
      ).length;
      const nfeEmittedCount = allFaturas.filter(
        (item) => item.link_nfe && item.link_nfe.trim() !== ''
      ).length;
      const nfeNotEmittedCount = allFaturas.filter(
        (item) =>
          item.status === 'pago' &&
          (!item.link_nfe || item.link_nfe.trim() === '')
      ).length;

      console.log('📊 Totais de Faturas (com lotes):', {
        periodFilter,
        totalRegistros: allFaturas.length,
        totalValue,
        paidCount,
        unpaidCount,
        nfeEmittedCount,
        nfeNotEmittedCount,
        dateStart,
        dateEnd,
      });

      setTotalSummary({
        totalValue,
        totalServico,
        totalAcrescimo,
        paidCount,
        unpaidCount,
        nfeEmittedCount,
        nfeNotEmittedCount,
      });

      // Buscar dados com paginação
      const from = currentPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from('vw_faturas_completas')
        .select(selectFields)
        .range(from, to)
        .order('created_at', { ascending: false });

      // Aplicar filtros apenas se não for 'todos'
      if (periodFilter !== 'todos') {
        if (dateStart) {
          query = query.gte('created_at', dateStart);
        }
        if (dateEnd) {
          query = query.lte('created_at', dateEnd + 'T23:59:59');
        }
      }

      const { data, error: fetchError } = await query;

      setHasMore((count || 0) > to + 1);

      if (fetchError) throw fetchError;

      // Mapear para interface FaturaComDetalhes
      const faturasComDetalhes: FaturaComDetalhes[] = (data || []).map(
        (fatura) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const f = fatura as any;
          return {
            ...f,
            consultas_periodo:
              f.periodo_inicio && f.periodo_fim
                ? {
                    inicio: String(f.periodo_inicio),
                    fim: String(f.periodo_fim),
                  }
                : undefined,
            url_asaas:
              f.id_asaas && typeof f.id_asaas === 'string'
                ? `https://www.asaas.com/i/${f.id_asaas.replace('pay_', '')}`
                : undefined,
          } as FaturaComDetalhes;
        }
      );

      setFaturas(faturasComDetalhes);

      // Extrair listas únicas para filtros
      const uniqueProfessionals = Array.from(
        new Set(
          faturasComDetalhes
            .flatMap((f) => f.profissionais_envolvidos || [])
            .filter(Boolean)
        )
      ).map((nome, idx) => ({ id: `prof_${idx}`, nome }));
      setProfessionals(uniqueProfessionals);

      const uniqueEmpresas = Array.from(
        new Map(
          faturasComDetalhes
            .filter(
              (f) =>
                f.empresa_id &&
                (f.empresa_razao_social || f.empresa_nome_fantasia)
            )
            .map((f) => [
              f.empresa_id!,
              {
                id: f.empresa_id!,
                nome:
                  f.empresa_razao_social ||
                  f.empresa_nome_fantasia ||
                  'Sem nome',
              },
            ])
        ).values()
      );
      setEmpresas([...uniqueEmpresas]);
    } catch (err) {
      console.error('Erro ao buscar faturas:', err);
      setError('Erro ao carregar faturas');
    } finally {
      setIsLoading(false);
    }
  }, [periodFilter, startDate, endDate, currentPage]);

  // Aplicar filtros locais e ordenação
  useEffect(() => {
    let filtered = [...faturas];

    // Filtro de status
    if (statusFilter !== 'todos') {
      filtered = filtered.filter((f) => f.status === statusFilter);
    }

    // Filtro de profissional
    if (professionalFilter !== 'todos') {
      filtered = filtered.filter((f) =>
        f.profissionais_envolvidos?.includes(professionalFilter)
      );
    }

    // Filtro de empresa
    if (empresaFilter !== 'todos') {
      filtered = filtered.filter((f) => f.empresa_id === empresaFilter);
    }

    // AI dev note: Filtro por status da NFe. 'nao_emitida' considera só faturas
    // PAGAS sem nota (as que deveriam ter), não pendentes/canceladas sem nota.
    if (nfeFilter !== 'todos') {
      filtered = filtered.filter((f) => {
        const ns = statusNfe(f.link_nfe);
        if (nfeFilter === 'pendente_acao') return nfePendenteDeAcao(f);
        if (nfeFilter === 'nao_emitida') {
          return f.status === 'pago' && ns === 'nao_emitida';
        }
        return ns === nfeFilter;
      });
    }

    // Filtro de busca
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((f) =>
        f.responsavel_nome?.toLowerCase().includes(query)
      );
    }

    // Ordenação
    filtered.sort((a, b) => {
      switch (sortOption) {
        case 'responsavel_asc':
          return (a.responsavel_nome || '').localeCompare(
            b.responsavel_nome || '',
            'pt-BR'
          );
        case 'responsavel_desc':
          return (b.responsavel_nome || '').localeCompare(
            a.responsavel_nome || '',
            'pt-BR'
          );
        case 'data_asc':
          return (
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        case 'data_desc':
          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        case 'valor_asc':
          return a.valor_total - b.valor_total;
        case 'valor_desc':
          return b.valor_total - a.valor_total;
        default:
          return 0;
      }
    });

    setFilteredFaturas(filtered);
  }, [
    faturas,
    statusFilter,
    professionalFilter,
    empresaFilter,
    nfeFilter,
    searchQuery,
    sortOption,
  ]);

  // Carregar faturas ao montar ou mudar filtros
  useEffect(() => {
    fetchFaturas();
  }, [fetchFaturas]);

  // AI dev note: Enquanto houver alguma fatura com NFe em 'sincronizando',
  // recarregamos periodicamente. O link_nfe é atualizado de forma assíncrona
  // por webhook (ASAAS -> n8n -> Supabase), então fazemos polling para o botão
  // transicionar sozinho de "Gerando NFe" para "Ver NFe" / "Cancelar e reemitir"
  // sem o usuário precisar atualizar a página.
  useEffect(() => {
    const temNfeSincronizando = faturas.some(
      (f) => f.link_nfe === 'sincronizando'
    );
    if (!temNfeSincronizando && awaitingNfe.size === 0) return;

    const intervalId = setInterval(() => {
      fetchFaturas();
    }, 8000);

    return () => clearInterval(intervalId);
  }, [faturas, fetchFaturas, awaitingNfe]);

  // AI dev note: Quando o link_nfe de uma fatura aguardada chega a um estado
  // terminal (URL real da NFe ou 'erro'), removemos do set para o botão refletir
  // o resultado final ("Ver NFe" ou "Cancelar e reemitir"). Estados intermediários
  // (''/null/'sincronizando') mantêm a fatura aguardando.
  useEffect(() => {
    if (awaitingNfe.size === 0) return;
    setAwaitingNfe((prev) => {
      const next = new Set(prev);
      faturas.forEach((f) => {
        const v = f.link_nfe;
        const terminal = !!v && v !== 'sincronizando';
        if (terminal) next.delete(f.id);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [faturas, awaitingNfe]);

  // Função para emitir NFe
  const handleEmitirNfe = async (fatura: FaturaComDetalhes) => {
    if (!user?.pessoa?.id) {
      toast({
        title: 'Erro de autenticação',
        description: 'Usuário não autenticado.',
        variant: 'destructive',
      });
      return;
    }

    setIsEmitingNfe(fatura.id);

    try {
      const result = await emitirNfeFatura(fatura.id, user.pessoa.id);

      if (result.success) {
        toast({
          title: 'NFe solicitada',
          description:
            'A nota fiscal está sendo gerada e será disponibilizada em breve.',
        });

        // AI dev note: Marcar como aguardando resultado para o botão não voltar
        // para "Emitir NFe" quando o webhook de cancelamento da nota antiga
        // gravar link_nfe = '' durante a reemissão. Removido quando link_nfe
        // chegar a um estado terminal (URL/'erro') ou por timeout de segurança.
        setAwaitingNfe((prev) => new Set(prev).add(fatura.id));
        window.setTimeout(() => {
          setAwaitingNfe((prev) => {
            const next = new Set(prev);
            next.delete(fatura.id);
            return next;
          });
        }, 120000);

        fetchFaturas();
      } else {
        toast({
          title: 'Erro ao emitir NFe',
          description:
            result.error || 'Erro desconhecido ao emitir nota fiscal',
          variant: 'destructive',
        });
        // AI dev note: Recarregar também no erro — emitirNfeFatura marca a fatura
        // como 'erro', então a lista precisa atualizar para o botão passar a
        // oferecer "Cancelar e reemitir NFe".
        fetchFaturas();
      }
    } catch (err) {
      console.error('Erro ao emitir NFe:', err);
      toast({
        title: 'Erro ao emitir NFe',
        description: 'Ocorreu um erro ao processar a solicitação',
        variant: 'destructive',
      });
    } finally {
      setIsEmitingNfe(null);
    }
  };

  // AI dev note: busca TODAS as faturas do período + aplica os MESMOS filtros locais
  // da lista. Extraído porque agora tem dois consumidores (Exportar PDF e Emitir NFe
  // em massa) e eles PRECISAM enxergar exatamente o mesmo conjunto — se divergirem, o
  // PDF diz uma coisa e a emissão faz outra.
  const fetchFaturasDoFiltro = useCallback(async (): Promise<
    FaturaComDetalhes[]
  > => {
    const { dateStart, dateEnd } = computeDateRange(
      periodFilter,
      startDate,
      endDate
    );
    const campos =
      'id, created_at, status, valor_total, link_nfe, responsavel_nome, empresa_id, empresa_razao_social, empresa_nome_fantasia, pacientes_atendidos, profissionais_envolvidos';

    const buildQuery = () => {
      let q = supabase
        .from('vw_faturas_completas')
        .select(campos)
        .order('created_at', { ascending: false });
      if (periodFilter !== 'todos') {
        if (dateStart) q = q.gte('created_at', dateStart);
        if (dateEnd) q = q.lte('created_at', dateEnd + 'T23:59:59');
      }
      return q;
    };

    const todas: Array<Record<string, unknown>> = [];
    let offset = 0;
    const size = 1000;
    let hasMoreRows = true;
    while (hasMoreRows) {
      const { data, error: batchErr } = await buildQuery().range(
        offset,
        offset + size - 1
      );
      if (batchErr) throw batchErr;
      if (data && data.length > 0) {
        todas.push(...(data as Array<Record<string, unknown>>));
        offset += size;
        hasMoreRows = data.length === size;
      } else {
        hasMoreRows = false;
      }
    }

    let rows = todas as unknown as FaturaComDetalhes[];
    if (statusFilter !== 'todos') {
      rows = rows.filter((f) => f.status === statusFilter);
    }
    if (empresaFilter !== 'todos') {
      rows = rows.filter((f) => f.empresa_id === empresaFilter);
    }
    if (professionalFilter !== 'todos') {
      rows = rows.filter((f) =>
        f.profissionais_envolvidos?.includes(professionalFilter)
      );
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter((f) => f.responsavel_nome?.toLowerCase().includes(q));
    }
    if (nfeFilter !== 'todos') {
      rows = rows.filter((f) => {
        const ns = statusNfe(f.link_nfe);
        if (nfeFilter === 'pendente_acao') return nfePendenteDeAcao(f);
        if (nfeFilter === 'nao_emitida') {
          return f.status === 'pago' && ns === 'nao_emitida';
        }
        return ns === nfeFilter;
      });
    }
    return rows;
  }, [
    periodFilter,
    startDate,
    endDate,
    statusFilter,
    empresaFilter,
    professionalFilter,
    searchQuery,
    nfeFilter,
  ]);

  // AI dev note: abre a emissão em massa sobre o conjunto do filtro, já reduzido ao
  // que é elegível (paga + sem nota ou em erro) — mesmo que o filtro de NFe esteja
  // em 'todos', nunca tentamos emitir sobre fatura não paga ou que já tem nota.
  const handleAbrirEmissaoMassa = useCallback(async () => {
    setIsCarregandoMassa(true);
    try {
      const rows = await fetchFaturasDoFiltro();
      const elegiveis = rows.filter(nfePendenteDeAcao);
      if (elegiveis.length === 0) {
        toast({
          title: 'Nenhuma nota a emitir',
          description:
            'Nenhuma fatura paga sem nota (ou com erro) no filtro atual.',
        });
        return;
      }
      setFaturasParaEmissaoMassa(
        elegiveis.map((f) => ({
          id: f.id,
          responsavel_nome: f.responsavel_nome,
          valor_total: f.valor_total,
          link_nfe: f.link_nfe,
        }))
      );
    } catch (err) {
      console.error('Erro ao carregar faturas para emissão em massa:', err);
      toast({
        title: 'Erro ao carregar faturas',
        description: 'Não foi possível montar a lista de emissão.',
        variant: 'destructive',
      });
    } finally {
      setIsCarregandoMassa(false);
    }
  }, [fetchFaturasDoFiltro, toast]);

  const handleExportPdf = useCallback(async () => {
    setIsExporting(true);
    try {
      const rows = await fetchFaturasDoFiltro();

      if (rows.length === 0) {
        toast({
          title: 'Nada para exportar',
          description: 'Nenhuma fatura corresponde aos filtros selecionados.',
        });
        return;
      }

      // Rótulo dos filtros ativos para o cabeçalho do PDF
      const partes: string[] = [];
      if (statusFilter !== 'todos') partes.push(`Status: ${statusFilter}`);
      if (nfeFilter !== 'todos') {
        const nfeLabels: Record<Exclude<NfeFilter, 'todos'>, string> = {
          emitida: 'emitida',
          erro: 'com erro',
          nao_emitida: 'não emitida',
          pendente_acao: 'pendente de emissão',
          sincronizando: 'sincronizando',
        };
        partes.push(`NFe: ${nfeLabels[nfeFilter]}`);
      }
      if (empresaFilter !== 'todos') {
        const emp = empresas.find((e) => e.id === empresaFilter);
        if (emp) partes.push(`Empresa: ${emp.nome}`);
      }
      if (professionalFilter !== 'todos')
        partes.push(`Profissional: ${professionalFilter}`);
      if (searchQuery) partes.push(`Busca: "${searchQuery}"`);

      gerarRelatorioNfePdf(rows as FaturaNfeRow[], {
        periodoLabel: PERIOD_LABELS[periodFilter],
        filtrosLabel: partes.length ? partes.join(' · ') : undefined,
        geradoEm: new Date(),
      });

      toast({
        title: 'PDF gerado',
        description: `${rows.length} fatura(s) exportada(s).`,
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
    fetchFaturasDoFiltro,
    periodFilter,
    statusFilter,
    empresaFilter,
    professionalFilter,
    nfeFilter,
    searchQuery,
    empresas,
    toast,
  ]);

  // AI dev note: Função para formatar data SEM conversão de timezone
  // Mantém exatamente como vem do Supabase
  const formatDate = (dateString: string) => {
    if (!dateString) return '--/--/----';
    // Extrair data diretamente da string sem criar objeto Date
    const [datePart] = dateString.split('T');
    const [year, month, day] = datePart.split('-');
    return `${day}/${month}/${year}`;
  };

  // AI dev note: Função para formatar data e hora convertendo de UTC para horário de Brasília (UTC-3)
  const formatDateTime = (dateString: string) => {
    if (!dateString) return '--/--/---- --:--';

    // Criar objeto Date a partir da string UTC
    const dateUTC = new Date(dateString);

    // Converter para horário de Brasília usando toLocaleString
    const dateBrasilia = dateUTC.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    return dateBrasilia;
  };

  // Função para formatar valor
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  // Função para obter badge de status
  const getStatusBadge = (status: FaturaComDetalhes['status']) => {
    const variants = {
      pago: 'default',
      pendente: 'secondary',
      atrasado: 'destructive',
      cancelado: 'outline',
      estornado: 'outline',
    } as const;

    const colors = {
      pago: '#10B981',
      pendente: '#F59E0B',
      atrasado: '#EF4444',
      cancelado: '#6B7280',
      estornado: '#7C3AED',
    };

    return (
      <Badge
        variant={variants[status]}
        style={{
          backgroundColor: `${colors[status]}15`,
          borderColor: colors[status],
          color: colors[status],
        }}
      >
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  // Função para determinar estado do botão NFe
  // AI dev note: Trata também os estados 'sincronizando' e 'erro' do link_nfe.
  // Em 'erro' o botão permite cancelar a NFe em erro e reemitir (diálogo de confirmação).
  const getNfeButtonConfig = (fatura: FaturaComDetalhes) => {
    if (fatura.status !== 'pago') {
      return null;
    }

    const isProcessing = isEmitingNfe === fatura.id;
    const linkNfe = fatura.link_nfe;

    if (isProcessing) {
      return {
        text: 'Emitindo NFe...',
        icon: FileText,
        className: 'text-gray-500',
        disabled: true,
        action: null,
      };
    }

    // AI dev note: Enquanto aguardamos o resultado assíncrono da (re)emissão,
    // manter "Gerando NFe" mesmo que o link_nfe esteja momentaneamente vazio
    // por causa do webhook de cancelamento da nota antiga. Evita o botão piscar
    // para "Emitir NFe" no meio do processo.
    if (awaitingNfe.has(fatura.id)) {
      return {
        text: 'Gerando NFe',
        icon: FileText,
        className: 'text-gray-500',
        disabled: true,
        action: null,
      };
    }

    if (!linkNfe) {
      return {
        text: 'Emitir NFe',
        icon: FileText,
        className: 'text-blue-600 hover:text-blue-800',
        disabled: false,
        action: () => handleEmitirNfe(fatura),
      };
    }

    if (linkNfe === 'sincronizando') {
      return {
        text: 'Gerando NFe',
        icon: FileText,
        className: 'text-gray-500',
        disabled: true,
        action: null,
      };
    }

    if (linkNfe === 'erro') {
      return {
        text: 'Erro. Cancelar e reemitir NFe',
        icon: RefreshCw,
        className: 'text-red-600 hover:text-red-800',
        disabled: false,
        action: () => {
          // AI dev note: Mostrar toast com o erro real do ASAAS antes da confirmação
          toast({
            title: 'Erro na emissão da NFe',
            description:
              fatura.status_nfe ||
              'A emissão da nota fiscal falhou. Clique em confirmar para cancelar a NFe anterior e emitir novamente.',
            variant: 'destructive',
          });
          setFaturaToCancelReissue(fatura);
        },
      };
    }

    return {
      text: 'Ver NFe',
      icon: ExternalLink,
      className: 'text-green-600 hover:text-green-800',
      disabled: false,
      action: () => window.open(linkNfe, '_blank'),
    };
  };

  // Loading state
  if (isLoading && currentPage === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Faturas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Faturas</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button onClick={fetchFaturas} className="mt-4">
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span>Faturas</span>
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {filteredFaturas.length} fatura
                {filteredFaturas.length !== 1 ? 's' : ''}
              </Badge>
              {/* AI dev note: exporta TODAS as faturas do período+filtros em PDF
                  (útil p/ caçar NFe não emitida / com erro em lote). */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportPdf}
                disabled={isExporting || isLoading}
                title="Exporta as faturas do período e filtros atuais em PDF"
              >
                <Download className="h-4 w-4 mr-2" />
                {isExporting ? 'Gerando...' : 'Exportar PDF'}
              </Button>
              {/* AI dev note: emissão em massa age sobre TODO o conjunto do filtro
                  (não só a página), reduzido ao que é elegível. Só aparece quando o
                  filtro de NFe isola algo acionável, para não virar um botão de
                  "emitir tudo" clicável por engano no meio da lista completa. */}
              {(nfeFilter === 'pendente_acao' ||
                nfeFilter === 'nao_emitida' ||
                nfeFilter === 'erro') && (
                <Button
                  size="sm"
                  onClick={handleAbrirEmissaoMassa}
                  disabled={isCarregandoMassa || isLoading}
                  title="Emite as notas das faturas pagas do filtro atual (as com erro são canceladas e reemitidas)"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  {isCarregandoMassa ? 'Carregando...' : 'Emitir NFe em massa'}
                </Button>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Filtros */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4">
            {/* Filtro de Período */}
            <Select
              value={periodFilter}
              onValueChange={(value) => {
                setPeriodFilter(value as PeriodFilter);
                setCurrentPage(0);
              }}
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

            {/* Filtro de Status */}
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as StatusFilter)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="atrasado">Atrasado</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
                <SelectItem value="estornado">Estornado</SelectItem>
              </SelectContent>
            </Select>

            {/* Filtro de Profissional */}
            <Select
              value={professionalFilter}
              onValueChange={setProfessionalFilter}
            >
              <SelectTrigger>
                <SelectValue placeholder="Profissional" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {professionals.map((prof) => (
                  <SelectItem key={prof.id} value={prof.nome}>
                    {prof.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Filtro de Empresa */}
            <Select value={empresaFilter} onValueChange={setEmpresaFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Empresa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                {empresas.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Filtro de NFe */}
            <Select
              value={nfeFilter}
              onValueChange={(value) => setNfeFilter(value as NfeFilter)}
            >
              <SelectTrigger>
                <SelectValue placeholder="NFe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">NFe: todas</SelectItem>
                <SelectItem value="pendente_acao">
                  NFe pendente (emitir)
                </SelectItem>
                <SelectItem value="emitida">NFe emitida</SelectItem>
                <SelectItem value="erro">NFe com erro</SelectItem>
                <SelectItem value="nao_emitida">NFe não emitida</SelectItem>
                <SelectItem value="sincronizando">NFe sincronizando</SelectItem>
              </SelectContent>
            </Select>

            {/* Ordenação */}
            <Select
              value={sortOption}
              onValueChange={(value) => setSortOption(value as SortOption)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Ordenar por" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="data_desc">Data (mais recente)</SelectItem>
                <SelectItem value="data_asc">Data (mais antiga)</SelectItem>
                <SelectItem value="responsavel_asc">Responsável A-Z</SelectItem>
                <SelectItem value="responsavel_desc">
                  Responsável Z-A
                </SelectItem>
                <SelectItem value="valor_desc">Valor (maior)</SelectItem>
                <SelectItem value="valor_asc">Valor (menor)</SelectItem>
              </SelectContent>
            </Select>

            {/* Busca */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar responsável..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2"
                >
                  <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
          </div>

          {/* Datas personalizadas */}
          {periodFilter === 'personalizado' && (
            <div className="flex gap-3 items-center">
              <DatePicker
                value={startDate}
                onChange={(date) => {
                  setStartDate(date);
                  setCurrentPage(0);
                }}
                placeholder="Data inicial"
              />
              <span className="text-muted-foreground">até</span>
              <DatePicker
                value={endDate}
                onChange={(date) => {
                  setEndDate(date);
                  setCurrentPage(0);
                }}
                placeholder="Data final"
              />
            </div>
          )}

          {/* Lista de Faturas */}
          {filteredFaturas.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma fatura encontrada com os filtros aplicados.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {filteredFaturas.map((fatura) => {
                const nfeConfig = getNfeButtonConfig(fatura);
                const NfeIcon = nfeConfig?.icon;

                return (
                  <div
                    key={fatura.id}
                    className={cn(
                      'group relative border rounded-lg p-4 hover:shadow-md transition-all cursor-pointer bg-card',
                      onFaturaClick && 'hover:border-primary'
                    )}
                    onClick={() => onFaturaClick?.(fatura)}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <CreditCard className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium text-sm">
                            Fatura #{fatura.id.slice(0, 8)}
                          </span>
                          {getStatusBadge(fatura.status)}
                          {/* AI dev note: contador de lembretes desta cobrança ASAAS,
                              preenchido pelo fluxo n8n via fn_registrar_lembrete_fatura. */}
                          {(fatura.lembretes_enviados ?? 0) > 0 && (
                            <Badge
                              variant="outline"
                              className="gap-1 border-orange-300 text-orange-700"
                              title={
                                fatura.ultimo_lembrete_em
                                  ? `Último lembrete em ${formatDateTime(fatura.ultimo_lembrete_em)}`
                                  : undefined
                              }
                            >
                              <Bell className="h-3 w-3" />
                              {fatura.lembretes_enviados}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <User className="h-3 w-3" />
                          <span>
                            {fatura.responsavel_nome || 'Sem responsável'}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-primary">
                          {formatCurrency(fatura.valor_total)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {fatura.qtd_consultas || 0} consulta
                          {fatura.qtd_consultas !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>

                    {/* Detalhes */}
                    <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                      <div>
                        <div className="text-muted-foreground mb-1">
                          Vencimento
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3" />
                          {fatura.vencimento
                            ? formatDate(fatura.vencimento)
                            : 'Não definido'}
                        </div>
                        {fatura.pago_em && fatura.status !== 'atrasado' && (
                          <div className="flex items-center gap-2 mt-1 text-green-600 font-medium text-xs">
                            <Calendar className="h-3 w-3" />
                            Pago: {formatDateTime(fatura.pago_em)}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="text-muted-foreground mb-1">
                          Criada em
                        </div>
                        <div>{formatDate(fatura.created_at)}</div>
                      </div>
                    </div>

                    {/* Empresa */}
                    {fatura.empresa_razao_social && (
                      <div className="text-sm mb-3">
                        <div className="text-muted-foreground mb-1">
                          Empresa
                        </div>
                        <div>{fatura.empresa_razao_social}</div>
                      </div>
                    )}

                    {/* Ações */}
                    <div className="flex items-center gap-2 pt-3 border-t">
                      {fatura.url_asaas && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(fatura.url_asaas, '_blank');
                          }}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Ver no ASAAS
                        </Button>
                      )}

                      {nfeConfig && NfeIcon && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            nfeConfig.action?.();
                          }}
                          disabled={nfeConfig.disabled}
                          className={nfeConfig.className}
                        >
                          <NfeIcon className="h-4 w-4 mr-2" />
                          {nfeConfig.text}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Resumo - Totais de TODOS os registros do filtro */}
          {!isLoading && !error && filteredFaturas.length > 0 && (
            <div className="mt-4 p-4 bg-muted/30 rounded-lg">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">
                    Total de faturas:
                  </span>
                  <p className="font-semibold">{totalCount}</p>
                </div>
                {/* AI dev note: receita (serviço/líquido) separada do bruto cobrado.
                    O acréscimo de cartão é repasse das taxas ao cliente, não receita. */}
                <div>
                  <span className="text-muted-foreground">
                    Faturamento de serviços:
                  </span>
                  <p className="font-semibold text-verde-pipa">
                    {formatCurrency(totalSummary.totalServico)}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    Acréscimo cartão:
                  </span>
                  <p className="font-semibold text-muted-foreground">
                    {formatCurrency(totalSummary.totalAcrescimo)}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Total cobrado:</span>
                  <p className="font-semibold">
                    {formatCurrency(totalSummary.totalValue)}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Pagas:</span>
                  <p className="font-semibold text-green-500">
                    {totalSummary.paidCount}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Não pagas:</span>
                  <p className="font-semibold text-orange-500">
                    {totalSummary.unpaidCount}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">NFe emitidas:</span>
                  <p className="font-semibold text-blue-500">
                    {totalSummary.nfeEmittedCount}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    NFe não emitidas:
                  </span>
                  <p className="font-semibold text-gray-500">
                    {totalSummary.nfeNotEmittedCount}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Paginação */}
          {!isLoading && !error && totalCount > PAGE_SIZE && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Mostrando {currentPage * PAGE_SIZE + 1} -{' '}
                {Math.min((currentPage + 1) * PAGE_SIZE, totalCount)} de{' '}
                {totalCount} faturas
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(0)}
                  disabled={currentPage === 0}
                  title="Primeira página"
                >
                  <ChevronRight className="h-4 w-4 rotate-180 mr-1" />
                  <ChevronRight className="h-4 w-4 rotate-180 -ml-3" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                >
                  <ChevronRight className="h-4 w-4 rotate-180 mr-1" />
                  Anterior
                </Button>
                <div className="px-3 py-1 text-sm font-medium bg-muted rounded">
                  Página {currentPage + 1} de{' '}
                  {Math.ceil(totalCount / PAGE_SIZE)}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => p + 1)}
                  disabled={!hasMore}
                >
                  Próxima
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentPage(Math.ceil(totalCount / PAGE_SIZE) - 1)
                  }
                  disabled={!hasMore}
                  title="Última página"
                >
                  <ChevronRight className="h-4 w-4 ml-1" />
                  <ChevronRight className="h-4 w-4 -ml-3" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI dev note: Confirmação antes de cancelar a NFe em erro e reemitir.
        Cancelar NFe tem efeito fiscal, por isso exigimos confirmação explícita. */}
      <AlertDialog
        open={!!faturaToCancelReissue}
        onOpenChange={(open) => {
          if (!open) setFaturaToCancelReissue(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar e reemitir NFe?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  A nota fiscal anterior está com erro e será{' '}
                  <strong>cancelada (ou excluída) no ASAAS</strong> antes de
                  emitir uma nova.
                </p>
                {faturaToCancelReissue?.status_nfe ? (
                  <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
                    <strong>Erro anterior:</strong>{' '}
                    {faturaToCancelReissue.status_nfe}
                  </p>
                ) : null}
                <p>
                  Essa ação tem efeito fiscal caso a nota já tenha sido
                  autorizada pela prefeitura. Deseja continuar?
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const fatura = faturaToCancelReissue;
                setFaturaToCancelReissue(null);
                if (fatura) {
                  handleEmitirNfe(fatura);
                }
              }}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Cancelar e reemitir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <FinancialNfeEmissaoMassa
        faturas={faturasParaEmissaoMassa || []}
        open={!!faturasParaEmissaoMassa}
        onOpenChange={(open) => {
          if (!open) setFaturasParaEmissaoMassa(null);
        }}
        onConcluido={fetchFaturas}
      />
    </>
  );
};
