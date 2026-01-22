import React from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  subYears,
  startOfYear,
  endOfYear,
  addDays,
  subDays,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Receipt,
  Calendar,
  AlertCircle,
  BarChart3,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  FileText,
  CalendarDays,
  Users,
  User,
  Building2,
  Stethoscope,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Input,
  Label,
} from '@/components/primitives';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';
import {
  BarChart,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// AI dev note: Dashboard financeiro com indicadores principais
// Exibe métricas, gráficos e alertas para controle financeiro
// Integra dados de lançamentos, contas a pagar e recorrências
// Filtros: período (mês atual, anterior, etc) e conta/sócio (consolidado, individual)
// Para cálculo por sócio:
//   - eh_divisao_socios = true → aplica percentual_divisao do sócio
//   - eh_divisao_socios = false → só conta se pessoa_responsavel_id = id do sócio

interface DashboardData {
  // Métricas do período selecionado
  receitasPeriodo: number;
  despesasPeriodo: number;
  saldoPeriodo: number;
  // Métricas do período de comparação
  receitasComparacao: number;
  despesasComparacao: number;
  saldoComparacao: number;
  // Contas a pagar/receber
  contasVencidas: number;
  contasVencerHoje: number;
  contasVencerSemana: number;
  valorTotalPendente: number;
  // Evolução mensal
  evolucaoMensal: {
    mes: string;
    receitas: number;
    despesas: number;
    saldo: number;
  }[];
  // Despesas por categoria
  despesasPorCategoria: {
    categoria: string;
    valor: number;
    percentual: number;
    cor: string;
  }[];
  // Últimos lançamentos
  ultimosLancamentos: {
    id: string;
    data: string;
    descricao: string;
    tipo: 'receita' | 'despesa';
    valor: number;
    valorOriginal: number;
    status: string;
    ehDivisao: boolean;
  }[];
  // Contas próximas do vencimento
  contasProximasVencimento: {
    id: string;
    descricao: string;
    vencimento: string;
    valor: number;
    diasParaVencer: number;
  }[];
  // Info do período
  periodoLabel: string;
  comparacaoLabel: string;
  // Info da conta selecionada
  contaLabel: string;
  // Resumo de gastos não atribuídos (para alertar usuário)
  gastosNaoAtribuidos: number;
  totalNaoAtribuidos: number;
}

interface Socio {
  id: string;
  pessoa_id: string;
  percentual_divisao: number;
  nome: string;
}

interface Empresa {
  id: string;
  nome_fantasia: string;
}

interface Profissional {
  id: string;
  nome: string;
}

type PeriodType =
  | 'mes_atual'
  | 'mes_anterior'
  | 'ultimos_30_dias'
  | 'ultimos_3_meses'
  | 'ano_atual'
  | 'ano_anterior'
  | 'personalizado';
type ContaType = 'consolidado' | string; // 'consolidado' ou pessoa_id do sócio
type FaturamentoFilterType = 'todos' | string; // 'todos' ou empresa_id/profissional_id
type FaturamentoModeType = 'empresa' | 'profissional';

interface DateRange {
  from: Date;
  to: Date;
}

interface FinancialDashboardProps {
  className?: string;
}

// Cores default para categorias sem cor definida
const DEFAULT_COLORS = [
  '#8884d8',
  '#82ca9d',
  '#ffc658',
  '#ff7300',
  '#0088fe',
  '#00C49F',
  '#FFBB28',
  '#FF8042',
  '#a4de6c',
  '#d0ed57',
];

interface LancamentoFinanceiro {
  id: string;
  tipo_lancamento: 'receita' | 'despesa';
  valor_total: number;
  eh_divisao_socios: boolean;
  pessoa_responsavel_id: string | null;
  data_emissao: string;
  data_competencia: string;
  descricao: string;
  status_lancamento: string;
  categoria?: { nome?: string; cor?: string } | null;
}

export const FinancialDashboard = React.memo<FinancialDashboardProps>(
  ({ className }) => {
    const [isLoading, setIsLoading] = React.useState(true);
    const [selectedPeriod, setSelectedPeriod] =
      React.useState<PeriodType>('mes_atual');
    const [selectedConta, setSelectedConta] =
      React.useState<ContaType>('consolidado');
    const [socios, setSocios] = React.useState<Socio[]>([]);
    const [empresas, setEmpresas] = React.useState<Empresa[]>([]);
    const [profissionais, setProfissionais] = React.useState<Profissional[]>(
      []
    );
    const [faturamentoMode, setFaturamentoMode] =
      React.useState<FaturamentoModeType>('empresa');
    const [faturamentoFilter, setFaturamentoFilter] =
      React.useState<FaturamentoFilterType>('todos');
    const [customDateRange, setCustomDateRange] = React.useState<DateRange>({
      from: startOfMonth(new Date()),
      to: endOfMonth(new Date()),
    });
    const [showCustomDatePicker, setShowCustomDatePicker] =
      React.useState(false);
    const [dashboardData, setDashboardData] =
      React.useState<DashboardData | null>(null);
    const { toast } = useToast();

    // Carregar sócios, empresas e profissionais
    React.useEffect(() => {
      const loadInitialData = async () => {
        // Carregar sócios
        const { data: sociosData } = await supabase
          .from('configuracao_divisao_socios')
          .select(
            `
            id,
            pessoa_id,
            percentual_divisao,
            pessoa:pessoa_id (nome)
          `
          )
          .eq('ativo', true);

        if (sociosData) {
          const sociosList = sociosData.map(
            (s: {
              id: string;
              pessoa_id: string;
              pessoa: { nome: string };
            }) => ({
              id: s.id,
              pessoa_id: s.pessoa_id,
              percentual_divisao: parseFloat(s.percentual_divisao),
              nome: s.pessoa?.nome || 'Sócio',
            })
          );
          setSocios(sociosList);
        }

        // Carregar empresas de faturamento
        const { data: empresasData } = await supabase
          .from('pessoa_empresas')
          .select('id, nome_fantasia')
          .eq('ativo', true);

        if (empresasData) {
          setEmpresas(empresasData);
        }

        // Carregar profissionais que podem atender
        const { data: profissionaisData } = await supabase
          .from('pessoas')
          .select('id, nome')
          .eq('ativo', true)
          .or('role.eq.profissional,pode_atender.eq.true')
          .order('nome');

        if (profissionaisData) {
          setProfissionais(profissionaisData);
        }
      };
      loadInitialData();
    }, []);

    // Função para calcular valor baseado no filtro de conta
    const calcularValorPorConta = React.useCallback(
      (
        lancamento: LancamentoFinanceiro,
        contaSelecionada: ContaType,
        sociosList: Socio[]
      ): number => {
        // Consolidado: retorna valor total
        if (contaSelecionada === 'consolidado') {
          return lancamento.valor_total;
        }

        // Busca sócio selecionado
        const socioSelecionado = sociosList.find(
          (s) => s.pessoa_id === contaSelecionada
        );
        if (!socioSelecionado) return 0;

        // Se é divisão entre sócios
        if (lancamento.eh_divisao_socios) {
          // Aplica percentual de divisão
          return (
            lancamento.valor_total * (socioSelecionado.percentual_divisao / 100)
          );
        }

        // Se NÃO é divisão: só conta se for responsabilidade do sócio selecionado
        if (lancamento.pessoa_responsavel_id === contaSelecionada) {
          return lancamento.valor_total;
        }

        // Se não tem responsável atribuído e não é divisão, não conta para nenhum sócio individual
        return 0;
      },
      []
    );

    // Calcula as datas baseado no período selecionado
    const getDateRanges = React.useCallback(
      (
        period: PeriodType
      ): {
        inicio: Date;
        fim: Date;
        inicioComparacao: Date;
        fimComparacao: Date;
        periodoLabel: string;
        comparacaoLabel: string;
        mesesEvolucao: number;
      } => {
        const hoje = new Date();

        switch (period) {
          case 'mes_atual': {
            const inicio = startOfMonth(hoje);
            const fim = endOfMonth(hoje);
            const inicioComparacao = startOfMonth(subMonths(hoje, 1));
            const fimComparacao = endOfMonth(subMonths(hoje, 1));
            return {
              inicio,
              fim,
              inicioComparacao,
              fimComparacao,
              periodoLabel: format(inicio, "MMMM 'de' yyyy", { locale: ptBR }),
              comparacaoLabel: 'vs mês anterior',
              mesesEvolucao: 6,
            };
          }
          case 'mes_anterior': {
            const mesAnterior = subMonths(hoje, 1);
            const inicio = startOfMonth(mesAnterior);
            const fim = endOfMonth(mesAnterior);
            const inicioComparacao = startOfMonth(subMonths(hoje, 2));
            const fimComparacao = endOfMonth(subMonths(hoje, 2));
            return {
              inicio,
              fim,
              inicioComparacao,
              fimComparacao,
              periodoLabel: format(inicio, "MMMM 'de' yyyy", { locale: ptBR }),
              comparacaoLabel: 'vs mês anterior',
              mesesEvolucao: 6,
            };
          }
          case 'ultimos_30_dias': {
            const inicio = subDays(hoje, 30);
            const fim = hoje;
            const inicioComparacao = subDays(hoje, 60);
            const fimComparacao = subDays(hoje, 31);
            return {
              inicio,
              fim,
              inicioComparacao,
              fimComparacao,
              periodoLabel: `${format(inicio, 'dd/MM')} - ${format(fim, 'dd/MM/yyyy')}`,
              comparacaoLabel: 'vs 30 dias anteriores',
              mesesEvolucao: 6,
            };
          }
          case 'ultimos_3_meses': {
            const inicio = startOfMonth(subMonths(hoje, 2));
            const fim = endOfMonth(hoje);
            const inicioComparacao = startOfMonth(subMonths(hoje, 5));
            const fimComparacao = endOfMonth(subMonths(hoje, 3));
            return {
              inicio,
              fim,
              inicioComparacao,
              fimComparacao,
              periodoLabel: `${format(inicio, 'MMM', { locale: ptBR })} - ${format(fim, 'MMM yyyy', { locale: ptBR })}`,
              comparacaoLabel: 'vs 3 meses anteriores',
              mesesEvolucao: 6,
            };
          }
          case 'ano_atual': {
            const inicio = startOfYear(hoje);
            const fim = endOfYear(hoje);
            const inicioComparacao = startOfYear(subYears(hoje, 1));
            const fimComparacao = endOfYear(subYears(hoje, 1));
            return {
              inicio,
              fim,
              inicioComparacao,
              fimComparacao,
              periodoLabel: format(inicio, 'yyyy'),
              comparacaoLabel: 'vs ano anterior',
              mesesEvolucao: 12,
            };
          }
          case 'ano_anterior': {
            const anoAnterior = subYears(hoje, 1);
            const inicio = startOfYear(anoAnterior);
            const fim = endOfYear(anoAnterior);
            const inicioComparacao = startOfYear(subYears(hoje, 2));
            const fimComparacao = endOfYear(subYears(hoje, 2));
            return {
              inicio,
              fim,
              inicioComparacao,
              fimComparacao,
              periodoLabel: format(inicio, 'yyyy'),
              comparacaoLabel: 'vs ano anterior',
              mesesEvolucao: 12,
            };
          }
          case 'personalizado': {
            const inicio = customDateRange.from;
            const fim = customDateRange.to;
            const diffDays = Math.ceil(
              (fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)
            );
            const inicioComparacao = subDays(inicio, diffDays + 1);
            const fimComparacao = subDays(inicio, 1);
            const mesesDiff = Math.ceil(diffDays / 30);
            return {
              inicio,
              fim,
              inicioComparacao,
              fimComparacao,
              periodoLabel: `${format(inicio, 'dd/MM/yyyy')} - ${format(fim, 'dd/MM/yyyy')}`,
              comparacaoLabel: 'vs período anterior',
              mesesEvolucao: Math.max(6, mesesDiff * 2),
            };
          }
          default:
            return getDateRanges('mes_atual');
        }
      },
      [customDateRange]
    );

    // Função para buscar faturamento (receitas de agendamentos)
    const buscarFaturamento = React.useCallback(
      async (
        dataInicio: Date,
        dataFim: Date,
        mode: FaturamentoModeType,
        filter: FaturamentoFilterType
      ): Promise<number> => {
        // Query base para agendamentos pagos no período
        let query = supabase
          .from('agendamentos')
          .select('valor_servico, profissional_id, empresa_fatura')
          .gte('data_hora', format(dataInicio, 'yyyy-MM-dd'))
          .lte('data_hora', format(dataFim, 'yyyy-MM-dd') + 'T23:59:59')
          .eq('ativo', true);

        // Buscar status "pago"
        const { data: statusPago } = await supabase
          .from('pagamento_status')
          .select('id')
          .eq('codigo', 'pago')
          .single();

        if (statusPago) {
          query = query.eq('status_pagamento_id', statusPago.id);
        }

        // Aplicar filtro por modo
        if (filter !== 'todos') {
          if (mode === 'empresa') {
            query = query.eq('empresa_fatura', filter);
          } else {
            query = query.eq('profissional_id', filter);
          }
        }

        const { data, error } = await query;

        if (error) {
          console.error('Erro ao buscar faturamento:', error);
          return 0;
        }

        return (
          data?.reduce(
            (sum, a) => sum + (parseFloat(a.valor_servico) || 0),
            0
          ) || 0
        );
      },
      []
    );

    // Carregar dados do dashboard
    const loadDashboardData = React.useCallback(async () => {
      try {
        setIsLoading(true);

        const hoje = new Date();
        const {
          inicio,
          fim,
          inicioComparacao,
          fimComparacao,
          periodoLabel,
          comparacaoLabel,
          mesesEvolucao,
        } = getDateRanges(selectedPeriod);

        // Buscar faturamento (receitas de agendamentos) do período
        const receitasFaturamentoPeriodo = await buscarFaturamento(
          inicio,
          fim,
          faturamentoMode,
          faturamentoFilter
        );
        const receitasFaturamentoComparacao = await buscarFaturamento(
          inicioComparacao,
          fimComparacao,
          faturamentoMode,
          faturamentoFilter
        );

        // Buscar lançamentos do período selecionado (apenas despesas)
        const { data: lancamentosPeriodo, error: error1 } = await supabase
          .from('lancamentos_financeiros')
          .select(
            'id, tipo_lancamento, valor_total, eh_divisao_socios, pessoa_responsavel_id, data_emissao, descricao, status_lancamento'
          )
          .gte('data_competencia', format(inicio, 'yyyy-MM-dd'))
          .lte('data_competencia', format(fim, 'yyyy-MM-dd'))
          .in('status_lancamento', ['validado', 'pago']);

        if (error1) throw error1;

        // Buscar lançamentos do período de comparação
        const { data: lancamentosComparacao, error: error2 } = await supabase
          .from('lancamentos_financeiros')
          .select(
            'id, tipo_lancamento, valor_total, eh_divisao_socios, pessoa_responsavel_id'
          )
          .gte('data_competencia', format(inicioComparacao, 'yyyy-MM-dd'))
          .lte('data_competencia', format(fimComparacao, 'yyyy-MM-dd'))
          .in('status_lancamento', ['validado', 'pago']);

        if (error2) throw error2;

        // Calcular gastos não atribuídos (eh_divisao_socios = false E pessoa_responsavel_id IS NULL)
        const lancamentosNaoAtribuidos =
          (lancamentosPeriodo as LancamentoFinanceiro[] | null)?.filter(
            (l) => !l.eh_divisao_socios && !l.pessoa_responsavel_id
          ) || [];
        const gastosNaoAtribuidos = lancamentosNaoAtribuidos.length;
        const totalNaoAtribuidos = lancamentosNaoAtribuidos.reduce(
          (sum, l) => sum + l.valor_total,
          0
        );

        // Calcular totais do período selecionado
        // Receitas: vêm do faturamento (agendamentos pagos)
        const receitasPeriodo = receitasFaturamentoPeriodo;

        // Despesas: vêm dos lançamentos financeiros com filtro de conta
        const despesasPeriodo =
          (lancamentosPeriodo as LancamentoFinanceiro[] | null)
            ?.filter((l) => l.tipo_lancamento === 'despesa')
            .reduce(
              (sum, l) => sum + calcularValorPorConta(l, selectedConta, socios),
              0
            ) || 0;
        const saldoPeriodo = receitasPeriodo - despesasPeriodo;

        // Calcular totais do período de comparação
        const receitasComparacao = receitasFaturamentoComparacao;
        const despesasComparacao =
          (lancamentosComparacao as LancamentoFinanceiro[] | null)
            ?.filter((l) => l.tipo_lancamento === 'despesa')
            .reduce(
              (sum, l) => sum + calcularValorPorConta(l, selectedConta, socios),
              0
            ) || 0;
        const saldoComparacao = receitasComparacao - despesasComparacao;

        // Buscar contas a pagar pendentes
        const { data: contasPendentes, error: error3 } = await supabase
          .from('contas_pagar')
          .select(
            `
            id,
            data_vencimento,
            valor_parcela,
            lancamento:lancamento_id (
              descricao,
              eh_divisao_socios,
              pessoa_responsavel_id
            )
          `
          )
          .eq('status_pagamento', 'pendente');

        if (error3) throw error3;

        // Filtrar contas pendentes por conta selecionada
        const contasPendentesFiltradas =
          selectedConta === 'consolidado'
            ? contasPendentes
            : contasPendentes?.filter(
                (c: {
                  lancamento?: {
                    eh_divisao_socios?: boolean;
                    pessoa_responsavel_id?: string | null;
                  };
                }) => {
                  const lancamento = c.lancamento;
                  if (!lancamento) return false;
                  if (lancamento.eh_divisao_socios) return true; // Conta para todos se é dividido
                  return lancamento.pessoa_responsavel_id === selectedConta;
                }
              );

        // Calcular contas vencidas e a vencer
        const contasVencidas =
          contasPendentesFiltradas?.filter(
            (c) => new Date(c.data_vencimento) < hoje
          ).length || 0;
        const contasVencerHoje =
          contasPendentesFiltradas?.filter(
            (c) =>
              format(new Date(c.data_vencimento), 'yyyy-MM-dd') ===
              format(hoje, 'yyyy-MM-dd')
          ).length || 0;
        const contasVencerSemana =
          contasPendentesFiltradas?.filter((c) => {
            const vencimento = new Date(c.data_vencimento);
            return vencimento >= hoje && vencimento <= addDays(hoje, 7);
          }).length || 0;

        // Calcular valor pendente considerando divisão
        const valorTotalPendente =
          contasPendentesFiltradas?.reduce(
            (
              sum,
              c: {
                valor_parcela: number;
                lancamento?:
                  | {
                      eh_divisao_socios?: boolean;
                      pessoa_responsavel_id?: string | null;
                    }
                  | {
                      eh_divisao_socios?: boolean;
                      pessoa_responsavel_id?: string | null;
                    }[];
              }
            ) => {
              // Handle array or object from Supabase join
              const lancamentoData = Array.isArray(c.lancamento)
                ? c.lancamento[0]
                : c.lancamento;
              if (selectedConta === 'consolidado') {
                return sum + c.valor_parcela;
              }
              const socio = socios.find((s) => s.pessoa_id === selectedConta);
              if (lancamentoData?.eh_divisao_socios && socio) {
                return sum + c.valor_parcela * (socio.percentual_divisao / 100);
              }
              if (lancamentoData?.pessoa_responsavel_id === selectedConta) {
                return sum + c.valor_parcela;
              }
              return sum;
            },
            0
          ) || 0;

        // Buscar evolução dos últimos meses (baseado no período)
        const evolucaoMensal = [];
        for (let i = mesesEvolucao - 1; i >= 0; i--) {
          const mes = subMonths(hoje, i);
          const inicioMes = startOfMonth(mes);
          const fimMes = endOfMonth(mes);

          // Receitas do faturamento (agendamentos pagos)
          const receitasMes = await buscarFaturamento(
            inicioMes,
            fimMes,
            faturamentoMode,
            faturamentoFilter
          );

          // Despesas dos lançamentos
          const { data: lancamentosMes, error } = await supabase
            .from('lancamentos_financeiros')
            .select(
              'id, tipo_lancamento, valor_total, eh_divisao_socios, pessoa_responsavel_id'
            )
            .gte('data_competencia', format(inicioMes, 'yyyy-MM-dd'))
            .lte('data_competencia', format(fimMes, 'yyyy-MM-dd'))
            .in('status_lancamento', ['validado', 'pago']);

          if (error) throw error;

          const despesas =
            (lancamentosMes as LancamentoFinanceiro[] | null)
              ?.filter((l) => l.tipo_lancamento === 'despesa')
              .reduce(
                (sum, l) =>
                  sum + calcularValorPorConta(l, selectedConta, socios),
                0
              ) || 0;

          evolucaoMensal.push({
            mes: format(mes, 'MMM', { locale: ptBR }),
            receitas: receitasMes,
            despesas,
            saldo: receitasMes - despesas,
          });
        }

        // Buscar despesas por categoria do período selecionado
        const { data: despesasCategoria, error: error4 } = await supabase
          .from('lancamentos_financeiros')
          .select(
            `
            id,
            valor_total,
            eh_divisao_socios,
            pessoa_responsavel_id,
            categoria:categoria_contabil_id (
              nome,
              cor
            )
          `
          )
          .eq('tipo_lancamento', 'despesa')
          .gte('data_competencia', format(inicio, 'yyyy-MM-dd'))
          .lte('data_competencia', format(fim, 'yyyy-MM-dd'))
          .in('status_lancamento', ['validado', 'pago']);

        if (error4) throw error4;

        // Agrupar por categoria com valores ajustados
        const categoriasMap = new Map<string, { valor: number; cor: string }>();
        (
          despesasCategoria as
            | {
                id: string;
                valor_total: number;
                eh_divisao_socios: boolean;
                pessoa_responsavel_id: string | null;
                categoria: { nome: string; cor: string } | null;
              }[]
            | null
        )?.forEach((d) => {
          // Create a LancamentoFinanceiro-like object for calcularValorPorConta
          const lancamentoLike = {
            valor_total: d.valor_total,
            eh_divisao_socios: d.eh_divisao_socios,
            pessoa_responsavel_id: d.pessoa_responsavel_id,
          };
          const valorAjustado = calcularValorPorConta(
            lancamentoLike as LancamentoFinanceiro,
            selectedConta,
            socios
          );
          if (valorAjustado === 0) return; // Não conta se valor é 0

          // Handle categoria as potentially array from Supabase join
          const catData = Array.isArray(d.categoria)
            ? d.categoria[0]
            : d.categoria;
          const catNome = catData?.nome || 'Sem categoria';
          const catCor = catData?.cor || '';
          const atual = categoriasMap.get(catNome) || { valor: 0, cor: catCor };
          categoriasMap.set(catNome, {
            valor: atual.valor + valorAjustado,
            cor: catCor || atual.cor,
          });
        });

        const totalDespesasCategoria = Array.from(
          categoriasMap.values()
        ).reduce((sum, cat) => sum + cat.valor, 0);

        const despesasPorCategoria = Array.from(categoriasMap.entries())
          .map(([categoria, data], index) => ({
            categoria,
            valor: data.valor,
            percentual:
              totalDespesasCategoria > 0
                ? (data.valor / totalDespesasCategoria) * 100
                : 0,
            cor: data.cor || DEFAULT_COLORS[index % DEFAULT_COLORS.length],
          }))
          .sort((a, b) => b.valor - a.valor)
          .slice(0, 5); // Top 5 categorias

        // Buscar últimos lançamentos do período
        const ultimosLancamentos =
          (lancamentosPeriodo as LancamentoFinanceiro[] | null)
            ?.filter((l) => {
              const valorAjustado = calcularValorPorConta(
                l,
                selectedConta,
                socios
              );
              return valorAjustado > 0;
            })
            .sort(
              (a, b) =>
                new Date(b.data_emissao).getTime() -
                new Date(a.data_emissao).getTime()
            )
            .slice(0, 5)
            .map((l) => ({
              id: l.id,
              data: l.data_emissao,
              descricao: l.descricao,
              tipo: l.tipo_lancamento as 'receita' | 'despesa',
              valor: calcularValorPorConta(l, selectedConta, socios),
              valorOriginal: l.valor_total,
              status: l.status_lancamento,
              ehDivisao: l.eh_divisao_socios,
            })) || [];

        // Buscar contas próximas do vencimento
        const contasProximasVencimento =
          (
            contasPendentesFiltradas as Array<{
              id: string;
              data_vencimento: string;
              valor_parcela: number;
              lancamento?:
                | {
                    descricao?: string;
                    eh_divisao_socios?: boolean;
                    pessoa_responsavel_id?: string;
                  }
                | {
                    descricao?: string;
                    eh_divisao_socios?: boolean;
                    pessoa_responsavel_id?: string;
                  }[]
                | null;
            }> | null
          )
            ?.filter((c) => {
              const vencimento = new Date(c.data_vencimento);
              return vencimento >= hoje && vencimento <= addDays(hoje, 7);
            })
            .map((c) => {
              // Handle lancamento as potentially array from Supabase join
              const lancamentoData = Array.isArray(c.lancamento)
                ? c.lancamento[0]
                : c.lancamento;

              let valorAjustado = c.valor_parcela;
              if (selectedConta !== 'consolidado') {
                const socio = socios.find((s) => s.pessoa_id === selectedConta);
                if (lancamentoData?.eh_divisao_socios && socio) {
                  valorAjustado =
                    c.valor_parcela * (socio.percentual_divisao / 100);
                }
              }
              return {
                id: c.id,
                descricao: lancamentoData?.descricao || 'Sem descrição',
                vencimento: c.data_vencimento,
                valor: valorAjustado,
                diasParaVencer: Math.ceil(
                  (new Date(c.data_vencimento).getTime() - hoje.getTime()) /
                    (1000 * 60 * 60 * 24)
                ),
              };
            })
            .sort((a, b) => a.diasParaVencer - b.diasParaVencer)
            .slice(0, 5) || [];

        // Determinar label da conta
        let contaLabel = 'Consolidado';
        if (selectedConta !== 'consolidado') {
          const socio = socios.find((s) => s.pessoa_id === selectedConta);
          contaLabel = socio?.nome.split(' ')[0] || 'Sócio'; // Primeiro nome
        }

        setDashboardData({
          receitasPeriodo,
          despesasPeriodo,
          saldoPeriodo,
          receitasComparacao,
          despesasComparacao,
          saldoComparacao,
          contasVencidas,
          contasVencerHoje,
          contasVencerSemana,
          valorTotalPendente,
          evolucaoMensal,
          despesasPorCategoria,
          ultimosLancamentos,
          contasProximasVencimento,
          periodoLabel,
          comparacaoLabel,
          contaLabel,
          gastosNaoAtribuidos,
          totalNaoAtribuidos,
        });
      } catch (error) {
        console.error('Erro ao carregar dashboard:', error);
        toast({
          variant: 'destructive',
          title: 'Erro ao carregar dashboard',
          description: 'Não foi possível carregar os dados do dashboard.',
        });
      } finally {
        setIsLoading(false);
      }
    }, [
      toast,
      selectedPeriod,
      selectedConta,
      socios,
      getDateRanges,
      calcularValorPorConta,
      buscarFaturamento,
      faturamentoMode,
      faturamentoFilter,
    ]);

    React.useEffect(() => {
      if (
        (socios.length > 0 || selectedConta === 'consolidado') &&
        empresas.length > 0
      ) {
        loadDashboardData();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadDashboardData, socios.length, empresas.length]);

    // Quando o período personalizado muda, recarregar dados
    const handleCustomDateConfirm = () => {
      setShowCustomDatePicker(false);
      if (selectedPeriod === 'personalizado') {
        loadDashboardData();
      }
    };

    // Calcular variações percentuais
    const getVariacao = (atual: number, anterior: number) => {
      if (anterior === 0) return atual > 0 ? 100 : 0;
      return ((atual - anterior) / anterior) * 100;
    };

    const formatCurrency = (value: number) => {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(value);
    };

    const formatPercent = (value: number) => {
      const signal = value > 0 ? '+' : '';
      return `${signal}${value.toFixed(1)}%`;
    };

    const handlePeriodChange = (value: string) => {
      const period = value as PeriodType;
      setSelectedPeriod(period);
      if (period === 'personalizado') {
        setShowCustomDatePicker(true);
      }
    };

    if (isLoading || !dashboardData) {
      return (
        <div className={`space-y-6 ${className}`}>
          <div className="grid gap-4 md:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-4 w-20" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-32" />
                  <Skeleton className="h-3 w-16 mt-2" />
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {[...Array(2)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-32" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-64 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      );
    }

    const variacaoReceitas = getVariacao(
      dashboardData.receitasPeriodo,
      dashboardData.receitasComparacao
    );
    const variacaoDespesas = getVariacao(
      dashboardData.despesasPeriodo,
      dashboardData.despesasComparacao
    );
    const variacaoSaldo = getVariacao(
      dashboardData.saldoPeriodo,
      dashboardData.saldoComparacao
    );

    return (
      <div className={`space-y-6 ${className}`}>
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold">Dashboard Financeiro</h2>
            <p className="text-muted-foreground">
              {dashboardData.periodoLabel}
              {selectedConta !== 'consolidado' && (
                <span className="ml-2">
                  •{' '}
                  <span className="font-medium">
                    {dashboardData.contaLabel}
                  </span>
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {/* Filtro de Faturamento (Receitas) */}
            <div className="flex items-center gap-1">
              <Select
                value={faturamentoMode}
                onValueChange={(v: FaturamentoModeType) => {
                  setFaturamentoMode(v);
                  setFaturamentoFilter('todos');
                }}
              >
                <SelectTrigger className="w-[120px]">
                  <div className="flex items-center gap-2">
                    {faturamentoMode === 'empresa' ? (
                      <Building2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <Stethoscope className="h-4 w-4 text-green-600" />
                    )}
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="empresa">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Empresa
                    </div>
                  </SelectItem>
                  <SelectItem value="profissional">
                    <div className="flex items-center gap-2">
                      <Stethoscope className="h-4 w-4" />
                      Profissional
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={faturamentoFilter}
                onValueChange={setFaturamentoFilter}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {faturamentoMode === 'empresa'
                    ? empresas.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.nome_fantasia}
                        </SelectItem>
                      ))
                    : profissionais.map((prof) => (
                        <SelectItem key={prof.id} value={prof.id}>
                          {prof.nome.split(' ')[0]}
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filtro de Conta/Sócio (Despesas) */}
            <Select value={selectedConta} onValueChange={setSelectedConta}>
              <SelectTrigger className="w-[160px]">
                <div className="flex items-center gap-2">
                  {selectedConta === 'consolidado' ? (
                    <Users className="h-4 w-4" />
                  ) : (
                    <User className="h-4 w-4" />
                  )}
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="consolidado">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Consolidado
                  </div>
                </SelectItem>
                {socios.map((socio) => (
                  <SelectItem key={socio.pessoa_id} value={socio.pessoa_id}>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      {socio.nome.split(' ')[0]} ({socio.percentual_divisao}%)
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Filtro de Período */}
            <Select value={selectedPeriod} onValueChange={handlePeriodChange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mes_atual">Mês Atual</SelectItem>
                <SelectItem value="mes_anterior">Mês Anterior</SelectItem>
                <SelectItem value="ultimos_30_dias">Últimos 30 dias</SelectItem>
                <SelectItem value="ultimos_3_meses">Últimos 3 meses</SelectItem>
                <SelectItem value="ano_atual">Ano Atual</SelectItem>
                <SelectItem value="ano_anterior">Ano Anterior</SelectItem>
                <SelectItem value="personalizado">Personalizado</SelectItem>
              </SelectContent>
            </Select>

            {selectedPeriod === 'personalizado' && (
              <Popover
                open={showCustomDatePicker}
                onOpenChange={setShowCustomDatePicker}
              >
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon">
                    <CalendarDays className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-4" align="end">
                  <div className="space-y-4">
                    <h4 className="font-medium">Período Personalizado</h4>
                    <div className="grid gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="from">Data Inicial</Label>
                        <Input
                          id="from"
                          type="date"
                          value={format(customDateRange.from, 'yyyy-MM-dd')}
                          onChange={(e) =>
                            setCustomDateRange((prev) => ({
                              ...prev,
                              from: new Date(e.target.value + 'T00:00:00'),
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="to">Data Final</Label>
                        <Input
                          id="to"
                          type="date"
                          value={format(customDateRange.to, 'yyyy-MM-dd')}
                          onChange={(e) =>
                            setCustomDateRange((prev) => ({
                              ...prev,
                              to: new Date(e.target.value + 'T23:59:59'),
                            }))
                          }
                        />
                      </div>
                    </div>
                    <Button
                      onClick={handleCustomDateConfirm}
                      className="w-full"
                    >
                      Aplicar
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>

        {/* Alerta de gastos não atribuídos */}
        {selectedConta !== 'consolidado' &&
          dashboardData.gastosNaoAtribuidos > 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Gastos não atribuídos</AlertTitle>
              <AlertDescription>
                Existem <strong>{dashboardData.gastosNaoAtribuidos}</strong>{' '}
                lançamentos individuais (
                {formatCurrency(dashboardData.totalNaoAtribuidos)}) sem
                responsável atribuído. Esses valores não aparecem na visão
                individual. Atribua um responsável nos lançamentos.
              </AlertDescription>
            </Alert>
          )}

        {/* Alertas de contas */}
        {(dashboardData.contasVencidas > 0 ||
          dashboardData.contasVencerHoje > 0) && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Atenção às contas pendentes!</AlertTitle>
            <AlertDescription className="mt-2">
              <div className="space-y-1">
                {dashboardData.contasVencidas > 0 && (
                  <p>
                    • {dashboardData.contasVencidas} conta
                    {dashboardData.contasVencidas !== 1 ? 's' : ''} vencida
                    {dashboardData.contasVencidas !== 1 ? 's' : ''}
                  </p>
                )}
                {dashboardData.contasVencerHoje > 0 && (
                  <p>
                    • {dashboardData.contasVencerHoje} conta
                    {dashboardData.contasVencerHoje !== 1 ? 's' : ''} vence
                    {dashboardData.contasVencerHoje === 1 ? '' : 'm'} hoje
                  </p>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Cards de Métricas */}
        <div className="grid gap-4 md:grid-cols-3">
          {/* Receitas */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-medium">
                  Receitas
                  <span className="ml-1 text-xs text-muted-foreground font-normal">
                    (
                    {faturamentoFilter === 'todos'
                      ? faturamentoMode === 'empresa'
                        ? 'Todas empresas'
                        : 'Todos profissionais'
                      : (faturamentoMode === 'empresa'
                          ? empresas.find((e) => e.id === faturamentoFilter)
                              ?.nome_fantasia
                          : profissionais
                              .find((p) => p.id === faturamentoFilter)
                              ?.nome.split(' ')[0]) || 'Filtrado'}
                    )
                  </span>
                </CardTitle>
                <Receipt className="h-4 w-4 text-green-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(dashboardData.receitasPeriodo)}
              </div>
              <div className="flex items-center gap-2 mt-2 text-sm">
                {variacaoReceitas !== 0 && (
                  <>
                    {variacaoReceitas > 0 ? (
                      <ArrowUpRight className="h-4 w-4 text-green-600" />
                    ) : (
                      <ArrowDownRight className="h-4 w-4 text-red-600" />
                    )}
                    <span
                      className={
                        variacaoReceitas > 0 ? 'text-green-600' : 'text-red-600'
                      }
                    >
                      {formatPercent(variacaoReceitas)}
                    </span>
                  </>
                )}
                <span className="text-muted-foreground">
                  {dashboardData.comparacaoLabel}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Despesas */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-medium">
                  Despesas
                  {selectedConta !== 'consolidado' && (
                    <span className="ml-1 text-xs text-muted-foreground font-normal">
                      ({dashboardData.contaLabel})
                    </span>
                  )}
                </CardTitle>
                <DollarSign className="h-4 w-4 text-red-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {formatCurrency(dashboardData.despesasPeriodo)}
              </div>
              <div className="flex items-center gap-2 mt-2 text-sm">
                {variacaoDespesas !== 0 && (
                  <>
                    {variacaoDespesas > 0 ? (
                      <ArrowUpRight className="h-4 w-4 text-red-600" />
                    ) : (
                      <ArrowDownRight className="h-4 w-4 text-green-600" />
                    )}
                    <span
                      className={
                        variacaoDespesas > 0 ? 'text-red-600' : 'text-green-600'
                      }
                    >
                      {formatPercent(variacaoDespesas)}
                    </span>
                  </>
                )}
                <span className="text-muted-foreground">
                  {dashboardData.comparacaoLabel}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Saldo */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-medium">
                  Saldo
                  {selectedConta !== 'consolidado' && (
                    <span className="ml-1 text-xs text-muted-foreground font-normal">
                      ({dashboardData.contaLabel})
                    </span>
                  )}
                </CardTitle>
                {dashboardData.saldoPeriodo >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-blue-600" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-orange-600" />
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold ${
                  dashboardData.saldoPeriodo >= 0
                    ? 'text-blue-600'
                    : 'text-orange-600'
                }`}
              >
                {formatCurrency(dashboardData.saldoPeriodo)}
              </div>
              <div className="flex items-center gap-2 mt-2 text-sm">
                {variacaoSaldo !== 0 && (
                  <>
                    {variacaoSaldo > 0 ? (
                      <ArrowUpRight className="h-4 w-4 text-green-600" />
                    ) : (
                      <ArrowDownRight className="h-4 w-4 text-red-600" />
                    )}
                    <span
                      className={
                        variacaoSaldo > 0 ? 'text-green-600' : 'text-red-600'
                      }
                    >
                      {formatPercent(Math.abs(variacaoSaldo))}
                    </span>
                  </>
                )}
                <span className="text-muted-foreground">
                  {dashboardData.comparacaoLabel}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Gráficos */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Evolução Mensal */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Evolução Mensal
                {selectedConta !== 'consolidado' && (
                  <Badge
                    variant="secondary"
                    className="ml-2 text-xs font-normal"
                  >
                    {dashboardData.contaLabel}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {selectedPeriod === 'ano_atual' ||
                selectedPeriod === 'ano_anterior'
                  ? 'Últimos 12 meses'
                  : 'Últimos 6 meses'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {dashboardData.evolucaoMensal.some(
                (m) => m.receitas > 0 || m.despesas > 0
              ) ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={dashboardData.evolucaoMensal}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="mes" />
                    <YAxis />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      labelStyle={{ color: '#000' }}
                    />
                    <Legend />
                    <Bar dataKey="receitas" fill="#10b981" name="Receitas" />
                    <Bar dataKey="despesas" fill="#ef4444" name="Despesas" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-[300px] text-center">
                  <BarChart3 className="h-12 w-12 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Nenhum dado para exibir no período selecionado
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Despesas por Categoria */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PieChart className="h-5 w-5" />
                Despesas por Categoria
                {selectedConta !== 'consolidado' && (
                  <Badge
                    variant="secondary"
                    className="ml-2 text-xs font-normal"
                  >
                    {dashboardData.contaLabel}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>Top 5 categorias do período</CardDescription>
            </CardHeader>
            <CardContent>
              {dashboardData.despesasPorCategoria.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={300}>
                    <RechartsPieChart>
                      <Pie
                        data={dashboardData.despesasPorCategoria}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ percentual }) => `${percentual.toFixed(1)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="valor"
                        nameKey="categoria"
                      >
                        {dashboardData.despesasPorCategoria.map(
                          (entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.cor} />
                          )
                        )}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value)}
                      />
                      <Legend />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                  <div className="mt-4 space-y-2">
                    {dashboardData.despesasPorCategoria.map((cat, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded"
                            style={{ backgroundColor: cat.cor }}
                          />
                          <span className="text-muted-foreground truncate max-w-[150px]">
                            {cat.categoria}
                          </span>
                        </div>
                        <span className="font-medium">
                          {formatCurrency(cat.valor)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-[300px] text-center">
                  <PieChart className="h-12 w-12 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Nenhuma despesa no período selecionado
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tabelas */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Contas a Vencer */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Próximos Vencimentos
              </CardTitle>
              <CardDescription>
                Contas a vencer nos próximos 7 dias
              </CardDescription>
            </CardHeader>
            <CardContent>
              {dashboardData.contasProximasVencimento.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Calendar className="h-12 w-12 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Nenhuma conta a vencer nos próximos dias
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {dashboardData.contasProximasVencimento.map((conta) => (
                    <div
                      key={conta.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-medium line-clamp-1">
                          {conta.descricao}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(conta.vencimento), 'dd/MM/yyyy')}
                          <Badge variant="secondary" className="text-xs">
                            {conta.diasParaVencer === 0
                              ? 'Hoje'
                              : `${conta.diasParaVencer} dia${conta.diasParaVencer !== 1 ? 's' : ''}`}
                          </Badge>
                        </div>
                      </div>
                      <span className="text-sm font-bold">
                        {formatCurrency(conta.valor)}
                      </span>
                    </div>
                  ))}
                  <div className="pt-3 border-t">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        Total pendente
                      </span>
                      <span className="font-bold">
                        {formatCurrency(dashboardData.valorTotalPendente)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Últimos Lançamentos */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Últimos Lançamentos
              </CardTitle>
              <CardDescription>
                Lançamentos mais recentes do período
              </CardDescription>
            </CardHeader>
            <CardContent>
              {dashboardData.ultimosLancamentos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Nenhum lançamento no período selecionado
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {dashboardData.ultimosLancamentos.map((lancamento) => (
                    <div
                      key={lancamento.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-medium line-clamp-1">
                          {lancamento.descricao}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(lancamento.data), 'dd/MM/yyyy')}
                          {lancamento.status === 'pre_lancamento' && (
                            <Badge variant="secondary" className="text-xs">
                              Pré-lançamento
                            </Badge>
                          )}
                          {selectedConta !== 'consolidado' &&
                            lancamento.ehDivisao && (
                              <Badge variant="outline" className="text-xs">
                                50%
                              </Badge>
                            )}
                        </div>
                      </div>
                      <div className="text-right">
                        <span
                          className={`text-sm font-bold ${
                            lancamento.tipo === 'receita'
                              ? 'text-green-600'
                              : 'text-red-600'
                          }`}
                        >
                          {lancamento.tipo === 'receita' ? '+' : '-'}
                          {formatCurrency(lancamento.valor)}
                        </span>
                        {selectedConta !== 'consolidado' &&
                          lancamento.ehDivisao &&
                          lancamento.valor !== lancamento.valorOriginal && (
                            <p className="text-xs text-muted-foreground line-through">
                              {formatCurrency(lancamento.valorOriginal)}
                            </p>
                          )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }
);

FinancialDashboard.displayName = 'FinancialDashboard';
