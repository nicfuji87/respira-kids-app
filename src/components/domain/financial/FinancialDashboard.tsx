import React from 'react';
import { format, startOfMonth, endOfMonth, subMonths, addDays } from 'date-fns';
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

interface DashboardData {
  // Métricas do mês atual
  receitasMesAtual: number;
  despesasMesAtual: number;
  saldoMesAtual: number;
  // Métricas do mês anterior
  receitasMesAnterior: number;
  despesasMesAnterior: number;
  saldoMesAnterior: number;
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
    status: string;
  }[];
  // Contas próximas do vencimento
  contasProximasVencimento: {
    id: string;
    descricao: string;
    vencimento: string;
    valor: number;
    diasParaVencer: number;
  }[];
}

interface FinancialDashboardProps {
  className?: string;
}

export const FinancialDashboard = React.memo<FinancialDashboardProps>(
  ({ className }) => {
    const [isLoading, setIsLoading] = React.useState(true);
    const [selectedPeriod, setSelectedPeriod] = React.useState('mes_atual');
    const [dashboardData, setDashboardData] =
      React.useState<DashboardData | null>(null);
    const { toast } = useToast();

    // Carregar dados do dashboard
    const loadDashboardData = React.useCallback(async () => {
      try {
        setIsLoading(true);

        const hoje = new Date();
        const inicioMesAtual = startOfMonth(hoje);
        const fimMesAtual = endOfMonth(hoje);
        const inicioMesAnterior = startOfMonth(subMonths(hoje, 1));
        const fimMesAnterior = endOfMonth(subMonths(hoje, 1));

        // Buscar lançamentos do mês atual e anterior
        const { data: lancamentosMesAtual, error: error1 } = await supabase
          .from('lancamentos_financeiros')
          .select('tipo_lancamento, valor_total')
          .gte('data_competencia', format(inicioMesAtual, 'yyyy-MM-dd'))
          .lte('data_competencia', format(fimMesAtual, 'yyyy-MM-dd'))
          .eq('status_lancamento', 'validado');

        if (error1) throw error1;

        const { data: lancamentosMesAnterior, error: error2 } = await supabase
          .from('lancamentos_financeiros')
          .select('tipo_lancamento, valor_total')
          .gte('data_competencia', format(inicioMesAnterior, 'yyyy-MM-dd'))
          .lte('data_competencia', format(fimMesAnterior, 'yyyy-MM-dd'))
          .eq('status_lancamento', 'validado');

        if (error2) throw error2;

        // Calcular totais
        const receitasMesAtual =
          lancamentosMesAtual
            ?.filter((l) => l.tipo_lancamento === 'receita')
            .reduce((sum, l) => sum + l.valor_total, 0) || 0;
        const despesasMesAtual =
          lancamentosMesAtual
            ?.filter((l) => l.tipo_lancamento === 'despesa')
            .reduce((sum, l) => sum + l.valor_total, 0) || 0;
        const saldoMesAtual = receitasMesAtual - despesasMesAtual;

        const receitasMesAnterior =
          lancamentosMesAnterior
            ?.filter((l) => l.tipo_lancamento === 'receita')
            .reduce((sum, l) => sum + l.valor_total, 0) || 0;
        const despesasMesAnterior =
          lancamentosMesAnterior
            ?.filter((l) => l.tipo_lancamento === 'despesa')
            .reduce((sum, l) => sum + l.valor_total, 0) || 0;
        const saldoMesAnterior = receitasMesAnterior - despesasMesAnterior;

        // Buscar contas a pagar pendentes
        const { data: contasPendentes, error: error3 } = await supabase
          .from('contas_pagar')
          .select(
            `
            id,
            data_vencimento,
            valor_parcela,
            lancamento:lancamento_id (
              descricao
            )
          `
          )
          .eq('status_pagamento', 'pendente');

        if (error3) throw error3;

        // Calcular contas vencidas e a vencer
        const contasVencidas =
          contasPendentes?.filter((c) => new Date(c.data_vencimento) < hoje)
            .length || 0;
        const contasVencerHoje =
          contasPendentes?.filter(
            (c) =>
              format(new Date(c.data_vencimento), 'yyyy-MM-dd') ===
              format(hoje, 'yyyy-MM-dd')
          ).length || 0;
        const contasVencerSemana =
          contasPendentes?.filter((c) => {
            const vencimento = new Date(c.data_vencimento);
            return vencimento >= hoje && vencimento <= addDays(hoje, 7);
          }).length || 0;
        const valorTotalPendente =
          contasPendentes?.reduce((sum, c) => sum + c.valor_parcela, 0) || 0;

        // Buscar evolução dos últimos 6 meses
        const evolucaoMensal = [];
        for (let i = 5; i >= 0; i--) {
          const mes = subMonths(hoje, i);
          const inicio = startOfMonth(mes);
          const fim = endOfMonth(mes);

          const { data: lancamentosMes, error } = await supabase
            .from('lancamentos_financeiros')
            .select('tipo_lancamento, valor_total')
            .gte('data_competencia', format(inicio, 'yyyy-MM-dd'))
            .lte('data_competencia', format(fim, 'yyyy-MM-dd'))
            .eq('status_lancamento', 'validado');

          if (error) throw error;

          const receitas =
            lancamentosMes
              ?.filter((l) => l.tipo_lancamento === 'receita')
              .reduce((sum, l) => sum + l.valor_total, 0) || 0;
          const despesas =
            lancamentosMes
              ?.filter((l) => l.tipo_lancamento === 'despesa')
              .reduce((sum, l) => sum + l.valor_total, 0) || 0;

          evolucaoMensal.push({
            mes: format(mes, 'MMM', { locale: ptBR }),
            receitas,
            despesas,
            saldo: receitas - despesas,
          });
        }

        // Buscar despesas por categoria do mês atual
        const { data: despesasCategoria, error: error4 } = await supabase
          .from('lancamentos_financeiros')
          .select(
            `
            valor_total,
            categoria:categoria_contabil_id (
              nome,
              cor
            )
          `
          )
          .eq('tipo_lancamento', 'despesa')
          .gte('data_competencia', format(inicioMesAtual, 'yyyy-MM-dd'))
          .lte('data_competencia', format(fimMesAtual, 'yyyy-MM-dd'))
          .eq('status_lancamento', 'validado');

        if (error4) throw error4;

        // Agrupar por categoria
        const categoriasMap = new Map<string, { valor: number; cor: string }>();
        (
          despesasCategoria as
            | {
                valor_total: number;
                categoria?: { nome?: string; cor?: string } | null;
              }[]
            | null
        )?.forEach((d) => {
          const catNome = d.categoria?.nome || 'Sem categoria';
          const catCor = d.categoria?.cor || '#94a3b8';
          const atual = categoriasMap.get(catNome) || { valor: 0, cor: catCor };
          categoriasMap.set(catNome, {
            valor: atual.valor + d.valor_total,
            cor: catCor,
          });
        });

        const totalDespesasCategoria = Array.from(
          categoriasMap.values()
        ).reduce((sum, cat) => sum + cat.valor, 0);

        const despesasPorCategoria = Array.from(categoriasMap.entries())
          .map(([categoria, data]) => ({
            categoria,
            valor: data.valor,
            percentual: (data.valor / totalDespesasCategoria) * 100,
            cor: data.cor,
          }))
          .sort((a, b) => b.valor - a.valor)
          .slice(0, 5); // Top 5 categorias

        // Buscar últimos lançamentos
        const { data: ultimosLanc, error: error5 } = await supabase
          .from('lancamentos_financeiros')
          .select(
            'id, data_emissao, descricao, tipo_lancamento, valor_total, status_lancamento'
          )
          .order('created_at', { ascending: false })
          .limit(5);

        if (error5) throw error5;

        const ultimosLancamentos =
          ultimosLanc?.map((l) => ({
            id: l.id,
            data: l.data_emissao,
            descricao: l.descricao,
            tipo: l.tipo_lancamento as 'receita' | 'despesa',
            valor: l.valor_total,
            status: l.status_lancamento,
          })) || [];

        // Buscar contas próximas do vencimento
        const contasProximasVencimento =
          (
            contasPendentes as Array<{
              id: string;
              data_vencimento: string;
              valor_parcela: number;
              lancamento?: { descricao?: string } | null;
            }> | null
          )
            ?.filter((c) => {
              const vencimento = new Date(c.data_vencimento);
              return vencimento >= hoje && vencimento <= addDays(hoje, 7);
            })
            .map((c) => ({
              id: c.id,
              descricao: c.lancamento?.descricao || 'Sem descrição',
              vencimento: c.data_vencimento,
              valor: c.valor_parcela,
              diasParaVencer: Math.ceil(
                (new Date(c.data_vencimento).getTime() - hoje.getTime()) /
                  (1000 * 60 * 60 * 24)
              ),
            }))
            .sort((a, b) => a.diasParaVencer - b.diasParaVencer)
            .slice(0, 5) || [];

        setDashboardData({
          receitasMesAtual,
          despesasMesAtual,
          saldoMesAtual,
          receitasMesAnterior,
          despesasMesAnterior,
          saldoMesAnterior,
          contasVencidas,
          contasVencerHoje,
          contasVencerSemana,
          valorTotalPendente,
          evolucaoMensal,
          despesasPorCategoria,
          ultimosLancamentos,
          contasProximasVencimento,
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
    }, [toast]);

    React.useEffect(() => {
      loadDashboardData();
    }, [loadDashboardData]);

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
      dashboardData.receitasMesAtual,
      dashboardData.receitasMesAnterior
    );
    const variacaoDespesas = getVariacao(
      dashboardData.despesasMesAtual,
      dashboardData.despesasMesAnterior
    );
    const variacaoSaldo = getVariacao(
      dashboardData.saldoMesAtual,
      dashboardData.saldoMesAnterior
    );

    return (
      <div className={`space-y-6 ${className}`}>
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold">Dashboard Financeiro</h2>
            <p className="text-muted-foreground">
              {format(new Date(), "MMMM 'de' yyyy", { locale: ptBR })}
            </p>
          </div>
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mes_atual">Mês Atual</SelectItem>
              <SelectItem value="ultimos_30_dias">Últimos 30 dias</SelectItem>
              <SelectItem value="ultimos_3_meses">Últimos 3 meses</SelectItem>
              <SelectItem value="ano_atual">Ano Atual</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Alertas */}
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
                </CardTitle>
                <Receipt className="h-4 w-4 text-green-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(dashboardData.receitasMesAtual)}
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
                <span className="text-muted-foreground">vs mês anterior</span>
              </div>
            </CardContent>
          </Card>

          {/* Despesas */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-medium">
                  Despesas
                </CardTitle>
                <DollarSign className="h-4 w-4 text-red-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {formatCurrency(dashboardData.despesasMesAtual)}
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
                <span className="text-muted-foreground">vs mês anterior</span>
              </div>
            </CardContent>
          </Card>

          {/* Saldo */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-medium">Saldo</CardTitle>
                {dashboardData.saldoMesAtual >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-blue-600" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-orange-600" />
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold ${
                  dashboardData.saldoMesAtual >= 0
                    ? 'text-blue-600'
                    : 'text-orange-600'
                }`}
              >
                {formatCurrency(dashboardData.saldoMesAtual)}
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
                <span className="text-muted-foreground">vs mês anterior</span>
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
              </CardTitle>
              <CardDescription>Últimos 6 meses</CardDescription>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>

          {/* Despesas por Categoria */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PieChart className="h-5 w-5" />
                Despesas por Categoria
              </CardTitle>
              <CardDescription>Top 5 categorias do mês</CardDescription>
            </CardHeader>
            <CardContent>
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
                  >
                    {dashboardData.despesasPorCategoria.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.cor} />
                    ))}
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
                      <span className="text-muted-foreground">
                        {cat.categoria}
                      </span>
                    </div>
                    <span className="font-medium">
                      {formatCurrency(cat.valor)}
                    </span>
                  </div>
                ))}
              </div>
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
              <CardDescription>Lançamentos mais recentes</CardDescription>
            </CardHeader>
            <CardContent>
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
                      </div>
                    </div>
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
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }
);

FinancialDashboard.displayName = 'FinancialDashboard';
