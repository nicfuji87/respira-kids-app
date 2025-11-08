import React from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
} from 'date-fns';
import {
  FileText,
  Download,
  Filter,
  Calendar,
  DollarSign,
  Receipt,
  TrendingUp,
  Users,
  BarChart3,
  Printer,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Badge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Checkbox,
  Separator,
  Alert,
  AlertDescription,
} from '@/components/primitives';
import { DatePicker } from '@/components/composed';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';

// AI dev note: Componente para geração de relatórios financeiros mensais
// Permite filtrar por período, categoria, fornecedor e tipo
// Exporta para CSV e gera preview para impressão

interface RelatorioData {
  // Resumo geral
  totalReceitas: number;
  totalDespesas: number;
  saldo: number;
  quantidadeLancamentos: number;
  ticketMedio: number;
  // Por categoria
  categorias: {
    id: string;
    nome: string;
    tipo: 'receita' | 'despesa';
    valor: number;
    percentual: number;
    quantidade: number;
  }[];
  // Por fornecedor
  fornecedores: {
    id: string;
    nome: string;
    valor: number;
    quantidade: number;
  }[];
  // Por sócio (se aplicável)
  socios?: {
    id: string;
    nome: string;
    valorTotal: number;
    valorDividido: number;
    valorIndividual: number;
  }[];
  // Detalhamento
  lancamentos: {
    id: string;
    data: string;
    tipo: 'receita' | 'despesa';
    descricao: string;
    fornecedor?: string;
    categoria: string;
    valor: number;
    parcelas: string;
    divisaoSocios: boolean;
  }[];
}

interface FiltrosRelatorio {
  dataInicio: Date;
  dataFim: Date;
  tipo: 'todos' | 'receita' | 'despesa';
  categoriaId?: string;
  fornecedorId?: string;
  apenasValidados: boolean;
  incluirDivisaoSocios: boolean;
}

interface RelatorioMensalProps {
  className?: string;
}

export const RelatorioMensal = React.memo<RelatorioMensalProps>(
  ({ className }) => {
    const [isLoading, setIsLoading] = React.useState(false);
    const [relatorioData, setRelatorioData] =
      React.useState<RelatorioData | null>(null);
    const [showFiltros, setShowFiltros] = React.useState(false);
    const [categorias, setCategorias] = React.useState<
      { id: string; nome: string }[]
    >([]);
    const [fornecedores, setFornecedores] = React.useState<
      { id: string; nome: string }[]
    >([]);
    const { toast } = useToast();

    // Estado dos filtros
    const hoje = new Date();
    const [filtros, setFiltros] = React.useState<FiltrosRelatorio>({
      dataInicio: startOfMonth(hoje),
      dataFim: endOfMonth(hoje),
      tipo: 'todos',
      categoriaId: undefined,
      fornecedorId: undefined,
      apenasValidados: true,
      incluirDivisaoSocios: false,
    });

    // Carregar dados auxiliares
    React.useEffect(() => {
      const loadAuxData = async () => {
        try {
          // Carregar categorias
          const { data: catData } = await supabase
            .from('categorias_contabeis')
            .select('id, nome')
            .eq('ativo', true)
            .order('nome');

          setCategorias(catData || []);

          // Carregar fornecedores
          const { data: fornData } = await supabase
            .from('fornecedores')
            .select('id, nome_razao_social, nome_fantasia')
            .eq('ativo', true)
            .order('nome_razao_social');

          setFornecedores(
            fornData?.map((f) => ({
              id: f.id,
              nome: f.nome_fantasia || f.nome_razao_social,
            })) || []
          );
        } catch (error) {
          console.error('Erro ao carregar dados auxiliares:', error);
        }
      };

      loadAuxData();
    }, []);

    // Gerar relatório
    const gerarRelatorio = async () => {
      try {
        setIsLoading(true);

        // Query base
        let query = supabase
          .from('lancamentos_financeiros')
          .select(
            `
            *,
            fornecedor:fornecedor_id (
              nome_razao_social,
              nome_fantasia
            ),
            categoria:categoria_contabil_id (
              nome,
              codigo
            ),
            divisao_socios:lancamento_divisao_socios (
              pessoa:pessoa_id (
                nome
              ),
              percentual,
              valor
            )
          `
          )
          .gte('data_competencia', format(filtros.dataInicio, 'yyyy-MM-dd'))
          .lte('data_competencia', format(filtros.dataFim, 'yyyy-MM-dd'));

        // Filtros
        if (filtros.tipo !== 'todos') {
          query = query.eq('tipo_lancamento', filtros.tipo);
        }
        if (filtros.categoriaId) {
          query = query.eq('categoria_contabil_id', filtros.categoriaId);
        }
        if (filtros.fornecedorId) {
          query = query.eq('fornecedor_id', filtros.fornecedorId);
        }
        if (filtros.apenasValidados) {
          query = query.eq('status_lancamento', 'validado');
        }

        const { data: lancamentos, error } = await query;
        if (error) throw error;

        // Processar dados
        const totalReceitas =
          lancamentos
            ?.filter((l) => l.tipo_lancamento === 'receita')
            .reduce((sum, l) => sum + l.valor_total, 0) || 0;
        const totalDespesas =
          lancamentos
            ?.filter((l) => l.tipo_lancamento === 'despesa')
            .reduce((sum, l) => sum + l.valor_total, 0) || 0;
        const saldo = totalReceitas - totalDespesas;
        const quantidadeLancamentos = lancamentos?.length || 0;
        const ticketMedio =
          quantidadeLancamentos > 0
            ? (totalReceitas + totalDespesas) / quantidadeLancamentos
            : 0;

        // Agrupar por categoria
        const categoriasMap = new Map<
          string,
          {
            nome: string;
            tipo: 'receita' | 'despesa';
            valor: number;
            quantidade: number;
          }
        >();

        lancamentos?.forEach((l) => {
          const catId = l.categoria_contabil_id;
          const catNome = l.categoria?.nome || 'Sem categoria';
          const atual = categoriasMap.get(catId) || {
            nome: catNome,
            tipo: l.tipo_lancamento,
            valor: 0,
            quantidade: 0,
          };
          categoriasMap.set(catId, {
            ...atual,
            valor: atual.valor + l.valor_total,
            quantidade: atual.quantidade + 1,
          });
        });

        const categoriasRelatorio = Array.from(categoriasMap.entries())
          .map(([id, data]) => ({
            id,
            ...data,
            percentual:
              (data.valor /
                (data.tipo === 'receita' ? totalReceitas : totalDespesas)) *
              100,
          }))
          .sort((a, b) => b.valor - a.valor);

        // Agrupar por fornecedor
        const fornecedoresMap = new Map<
          string,
          {
            nome: string;
            valor: number;
            quantidade: number;
          }
        >();

        lancamentos?.forEach((l) => {
          if (l.fornecedor_id) {
            const fornId = l.fornecedor_id;
            const fornNome =
              l.fornecedor?.nome_fantasia ||
              l.fornecedor?.nome_razao_social ||
              'Desconhecido';
            const atual = fornecedoresMap.get(fornId) || {
              nome: fornNome,
              valor: 0,
              quantidade: 0,
            };
            fornecedoresMap.set(fornId, {
              ...atual,
              valor: atual.valor + l.valor_total,
              quantidade: atual.quantidade + 1,
            });
          }
        });

        const fornecedoresRelatorio = Array.from(fornecedoresMap.entries())
          .map(([id, data]) => ({ id, ...data }))
          .sort((a, b) => b.valor - a.valor);

        // Processar sócios se incluir divisão
        let sociosRelatorio = undefined;
        if (filtros.incluirDivisaoSocios) {
          const sociosMap = new Map<
            string,
            {
              nome: string;
              valorTotal: number;
              valorDividido: number;
              valorIndividual: number;
            }
          >();

          // Buscar lançamentos individuais dos sócios
          const { data: pessoas } = await supabase
            .from('pessoas')
            .select('id, nome')
            .in('role', ['profissional', 'admin'])
            .eq('ativo', true);

          for (const pessoa of pessoas || []) {
            let valorDividido = 0;

            // Somar valores de lançamentos com divisão
            lancamentos?.forEach((l) => {
              if (l.eh_divisao_socios && l.divisao_socios) {
                const divisao = l.divisao_socios.find(
                  (d: { pessoa: { nome: string }; valor: number }) =>
                    d.pessoa.nome === pessoa.nome
                );
                if (divisao) {
                  valorDividido += divisao.valor;
                }
              }
            });

            // TODO: Buscar lançamentos individuais (sem divisão) de cada sócio
            const valorIndividual = 0; // Placeholder

            sociosMap.set(pessoa.id, {
              nome: pessoa.nome,
              valorTotal: valorDividido + valorIndividual,
              valorDividido,
              valorIndividual,
            });
          }

          sociosRelatorio = Array.from(sociosMap.entries())
            .map(([id, data]) => ({ id, ...data }))
            .filter((s) => s.valorTotal > 0)
            .sort((a, b) => b.valorTotal - a.valorTotal);
        }

        // Preparar lançamentos detalhados
        const lancamentosRelatorio =
          lancamentos?.map((l) => ({
            id: l.id,
            data: l.data_emissao,
            tipo: l.tipo_lancamento as 'receita' | 'despesa',
            descricao: l.descricao,
            fornecedor:
              l.fornecedor?.nome_fantasia ||
              l.fornecedor?.nome_razao_social ||
              '-',
            categoria: l.categoria?.nome || 'Sem categoria',
            valor: l.valor_total,
            parcelas:
              l.quantidade_parcelas > 1
                ? `${l.quantidade_parcelas}x`
                : 'À vista',
            divisaoSocios: l.eh_divisao_socios,
          })) || [];

        setRelatorioData({
          totalReceitas,
          totalDespesas,
          saldo,
          quantidadeLancamentos,
          ticketMedio,
          categorias: categoriasRelatorio,
          fornecedores: fornecedoresRelatorio,
          socios: sociosRelatorio,
          lancamentos: lancamentosRelatorio,
        });

        toast({
          title: 'Relatório gerado',
          description: 'Os dados foram processados com sucesso.',
        });
      } catch (error) {
        console.error('Erro ao gerar relatório:', error);
        toast({
          variant: 'destructive',
          title: 'Erro ao gerar relatório',
          description: 'Não foi possível processar os dados.',
        });
      } finally {
        setIsLoading(false);
      }
    };

    // Exportar CSV
    const exportarCSV = () => {
      if (!relatorioData) return;

      try {
        // Cabeçalho do relatório
        const header = [
          `Relatório Financeiro - ${format(filtros.dataInicio, 'dd/MM/yyyy')} a ${format(filtros.dataFim, 'dd/MM/yyyy')}`,
          '',
          `Total de Receitas: ${formatCurrency(relatorioData.totalReceitas)}`,
          `Total de Despesas: ${formatCurrency(relatorioData.totalDespesas)}`,
          `Saldo: ${formatCurrency(relatorioData.saldo)}`,
          `Quantidade de Lançamentos: ${relatorioData.quantidadeLancamentos}`,
          `Ticket Médio: ${formatCurrency(relatorioData.ticketMedio)}`,
          '',
          'DETALHAMENTO DOS LANÇAMENTOS',
          '',
        ].join('\n');

        // Cabeçalho da tabela
        const tableHeaders = [
          'Data',
          'Tipo',
          'Descrição',
          'Fornecedor/Cliente',
          'Categoria',
          'Valor',
          'Parcelas',
          'Divisão Sócios',
        ];

        // Linhas da tabela
        const rows = relatorioData.lancamentos.map((l) => [
          format(new Date(l.data), 'dd/MM/yyyy'),
          l.tipo === 'receita' ? 'Receita' : 'Despesa',
          l.descricao,
          l.fornecedor,
          l.categoria,
          formatCurrency(l.valor),
          l.parcelas,
          l.divisaoSocios ? 'Sim' : 'Não',
        ]);

        // Montar CSV
        const csvContent = [
          header,
          tableHeaders.join(';'),
          ...rows.map((row) => row.join(';')),
        ].join('\n');

        // Criar blob e download
        const blob = new Blob(['\ufeff' + csvContent], {
          type: 'text/csv;charset=utf-8;',
        });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `relatorio_financeiro_${format(new Date(), 'yyyy-MM-dd')}.csv`;
        link.click();

        toast({
          title: 'Relatório exportado',
          description: 'Arquivo CSV gerado com sucesso.',
        });
      } catch (error) {
        console.error('Erro ao exportar:', error);
        toast({
          variant: 'destructive',
          title: 'Erro na exportação',
          description: 'Não foi possível gerar o arquivo CSV.',
        });
      }
    };

    const formatCurrency = (value: number) => {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(value);
    };

    const handlePeriodoRapido = (periodo: string) => {
      const hoje = new Date();

      switch (periodo) {
        case 'mes_atual':
          setFiltros((prev) => ({
            ...prev,
            dataInicio: startOfMonth(hoje),
            dataFim: endOfMonth(hoje),
          }));
          break;
        case 'mes_anterior': {
          const mesAnterior = new Date(
            hoje.getFullYear(),
            hoje.getMonth() - 1,
            1
          );
          setFiltros((prev) => ({
            ...prev,
            dataInicio: startOfMonth(mesAnterior),
            dataFim: endOfMonth(mesAnterior),
          }));
          break;
        }
        case 'trimestre': {
          const inicioTrimestre = new Date(
            hoje.getFullYear(),
            Math.floor(hoje.getMonth() / 3) * 3,
            1
          );
          setFiltros((prev) => ({
            ...prev,
            dataInicio: inicioTrimestre,
            dataFim: hoje,
          }));
          break;
        }
        case 'ano_atual':
          setFiltros((prev) => ({
            ...prev,
            dataInicio: startOfYear(hoje),
            dataFim: endOfYear(hoje),
          }));
          break;
      }
    };

    return (
      <div className={className}>
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Relatórios Financeiros
                </CardTitle>
                <CardDescription>
                  Gere relatórios detalhados e exportáveis
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFiltros(true)}
                >
                  <Filter className="mr-2 h-4 w-4" />
                  Filtros
                </Button>
                {relatorioData && (
                  <>
                    <Button variant="outline" size="sm" onClick={exportarCSV}>
                      <Download className="mr-2 h-4 w-4" />
                      Exportar CSV
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.print()}
                    >
                      <Printer className="mr-2 h-4 w-4" />
                      Imprimir
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Período selecionado */}
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              Período: {format(filtros.dataInicio, 'dd/MM/yyyy')} a{' '}
              {format(filtros.dataFim, 'dd/MM/yyyy')}
              {(filtros.tipo !== 'todos' ||
                filtros.categoriaId ||
                filtros.fornecedorId) && (
                <>
                  <Separator orientation="vertical" className="h-4" />
                  <span>Com filtros aplicados</span>
                </>
              )}
            </div>
          </CardHeader>

          <CardContent>
            {!relatorioData ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-medium">
                  Configure os filtros e gere seu relatório
                </h3>
                <p className="mb-6 max-w-sm text-sm text-muted-foreground">
                  Selecione o período e outros filtros para gerar um relatório
                  detalhado
                </p>
                <div className="flex gap-2">
                  {['mes_atual', 'mes_anterior', 'trimestre', 'ano_atual'].map(
                    (periodo) => (
                      <Button
                        key={periodo}
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          handlePeriodoRapido(periodo);
                          gerarRelatorio();
                        }}
                      >
                        {periodo === 'mes_atual' && 'Mês Atual'}
                        {periodo === 'mes_anterior' && 'Mês Anterior'}
                        {periodo === 'trimestre' && 'Trimestre'}
                        {periodo === 'ano_atual' && 'Ano Atual'}
                      </Button>
                    )
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Resumo Geral */}
                <div className="grid gap-4 md:grid-cols-5">
                  <Card>
                    <CardContent className="p-4">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-muted-foreground">
                          Receitas
                        </p>
                        <p className="text-xl font-bold text-green-600">
                          {formatCurrency(relatorioData.totalReceitas)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-muted-foreground">
                          Despesas
                        </p>
                        <p className="text-xl font-bold text-red-600">
                          {formatCurrency(relatorioData.totalDespesas)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-muted-foreground">
                          Saldo
                        </p>
                        <p
                          className={`text-xl font-bold ${
                            relatorioData.saldo >= 0
                              ? 'text-blue-600'
                              : 'text-orange-600'
                          }`}
                        >
                          {formatCurrency(relatorioData.saldo)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-muted-foreground">
                          Lançamentos
                        </p>
                        <p className="text-xl font-bold">
                          {relatorioData.quantidadeLancamentos}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-muted-foreground">
                          Ticket Médio
                        </p>
                        <p className="text-xl font-bold">
                          {formatCurrency(relatorioData.ticketMedio)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Tabs de detalhamento */}
                <Tabs defaultValue="lancamentos" className="w-full">
                  <TabsList>
                    <TabsTrigger value="lancamentos">Lançamentos</TabsTrigger>
                    <TabsTrigger value="categorias">Por Categoria</TabsTrigger>
                    <TabsTrigger value="fornecedores">
                      Por Fornecedor
                    </TabsTrigger>
                    {relatorioData.socios && (
                      <TabsTrigger value="socios">Por Sócio</TabsTrigger>
                    )}
                  </TabsList>

                  {/* Lançamentos */}
                  <TabsContent value="lancamentos">
                    {relatorioData.lancamentos.length === 0 ? (
                      <Alert>
                        <AlertDescription>
                          Nenhum lançamento encontrado no período selecionado.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Descrição</TableHead>
                            <TableHead>Fornecedor/Cliente</TableHead>
                            <TableHead>Categoria</TableHead>
                            <TableHead className="text-right">Valor</TableHead>
                            <TableHead>Parcelas</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {relatorioData.lancamentos.map((lancamento) => (
                            <TableRow key={lancamento.id}>
                              <TableCell>
                                {format(
                                  new Date(lancamento.data),
                                  'dd/MM/yyyy'
                                )}
                              </TableCell>
                              <TableCell>
                                {lancamento.tipo === 'receita' ? (
                                  <Badge
                                    variant="outline"
                                    className="text-green-600"
                                  >
                                    <Receipt className="mr-1 h-3 w-3" />
                                    Receita
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="text-red-600"
                                  >
                                    <DollarSign className="mr-1 h-3 w-3" />
                                    Despesa
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <div>
                                  <p className="font-medium">
                                    {lancamento.descricao}
                                  </p>
                                  {lancamento.divisaoSocios && (
                                    <Badge
                                      variant="secondary"
                                      className="text-xs mt-1"
                                    >
                                      <Users className="mr-1 h-3 w-3" />
                                      Divisão entre sócios
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>{lancamento.fornecedor}</TableCell>
                              <TableCell>{lancamento.categoria}</TableCell>
                              <TableCell
                                className={`text-right font-medium ${
                                  lancamento.tipo === 'receita'
                                    ? 'text-green-600'
                                    : 'text-red-600'
                                }`}
                              >
                                {formatCurrency(lancamento.valor)}
                              </TableCell>
                              <TableCell>{lancamento.parcelas}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </TabsContent>

                  {/* Por Categoria */}
                  <TabsContent value="categorias">
                    <div className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        {/* Receitas por Categoria */}
                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                              <TrendingUp className="h-4 w-4 text-green-600" />
                              Receitas por Categoria
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            {relatorioData.categorias.filter(
                              (c) => c.tipo === 'receita'
                            ).length === 0 ? (
                              <p className="text-sm text-muted-foreground text-center py-4">
                                Nenhuma receita no período
                              </p>
                            ) : (
                              <div className="space-y-3">
                                {relatorioData.categorias
                                  .filter((c) => c.tipo === 'receita')
                                  .map((cat) => (
                                    <div key={cat.id} className="space-y-1">
                                      <div className="flex items-center justify-between text-sm">
                                        <span>{cat.nome}</span>
                                        <span className="font-medium">
                                          {formatCurrency(cat.valor)}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                                          <div
                                            className="bg-green-600 h-2 rounded-full"
                                            style={{
                                              width: `${cat.percentual}%`,
                                            }}
                                          />
                                        </div>
                                        <span className="text-xs text-muted-foreground w-12 text-right">
                                          {cat.percentual.toFixed(1)}%
                                        </span>
                                      </div>
                                      <p className="text-xs text-muted-foreground">
                                        {cat.quantidade} lançamento
                                        {cat.quantidade !== 1 ? 's' : ''}
                                      </p>
                                    </div>
                                  ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>

                        {/* Despesas por Categoria */}
                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                              <TrendingUp className="h-4 w-4 text-red-600" />
                              Despesas por Categoria
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            {relatorioData.categorias.filter(
                              (c) => c.tipo === 'despesa'
                            ).length === 0 ? (
                              <p className="text-sm text-muted-foreground text-center py-4">
                                Nenhuma despesa no período
                              </p>
                            ) : (
                              <div className="space-y-3">
                                {relatorioData.categorias
                                  .filter((c) => c.tipo === 'despesa')
                                  .map((cat) => (
                                    <div key={cat.id} className="space-y-1">
                                      <div className="flex items-center justify-between text-sm">
                                        <span>{cat.nome}</span>
                                        <span className="font-medium">
                                          {formatCurrency(cat.valor)}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                                          <div
                                            className="bg-red-600 h-2 rounded-full"
                                            style={{
                                              width: `${cat.percentual}%`,
                                            }}
                                          />
                                        </div>
                                        <span className="text-xs text-muted-foreground w-12 text-right">
                                          {cat.percentual.toFixed(1)}%
                                        </span>
                                      </div>
                                      <p className="text-xs text-muted-foreground">
                                        {cat.quantidade} lançamento
                                        {cat.quantidade !== 1 ? 's' : ''}
                                      </p>
                                    </div>
                                  ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    </div>
                  </TabsContent>

                  {/* Por Fornecedor */}
                  <TabsContent value="fornecedores">
                    {relatorioData.fornecedores.length === 0 ? (
                      <Alert>
                        <AlertDescription>
                          Nenhum lançamento com fornecedor no período
                          selecionado.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Fornecedor/Cliente</TableHead>
                            <TableHead className="text-center">
                              Quantidade
                            </TableHead>
                            <TableHead className="text-right">
                              Valor Total
                            </TableHead>
                            <TableHead className="text-right">
                              Ticket Médio
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {relatorioData.fornecedores.map((fornecedor) => (
                            <TableRow key={fornecedor.id}>
                              <TableCell className="font-medium">
                                {fornecedor.nome}
                              </TableCell>
                              <TableCell className="text-center">
                                {fornecedor.quantidade}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {formatCurrency(fornecedor.valor)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(
                                  fornecedor.valor / fornecedor.quantidade
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </TabsContent>

                  {/* Por Sócio */}
                  {relatorioData.socios && (
                    <TabsContent value="socios">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Sócio</TableHead>
                            <TableHead className="text-right">
                              Valor Dividido
                            </TableHead>
                            <TableHead className="text-right">
                              Valor Individual
                            </TableHead>
                            <TableHead className="text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {relatorioData.socios.map((socio) => (
                            <TableRow key={socio.id}>
                              <TableCell className="font-medium">
                                {socio.nome}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(socio.valorDividido)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(socio.valorIndividual)}
                              </TableCell>
                              <TableCell className="text-right font-bold">
                                {formatCurrency(socio.valorTotal)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TabsContent>
                  )}
                </Tabs>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dialog de Filtros */}
        <Dialog open={showFiltros} onOpenChange={setShowFiltros}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filtros do Relatório
              </DialogTitle>
              <DialogDescription>
                Configure os filtros para gerar o relatório
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Período */}
              <div className="space-y-2">
                <Label>Período</Label>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePeriodoRapido('mes_atual')}
                  >
                    Mês Atual
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePeriodoRapido('mes_anterior')}
                  >
                    Mês Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePeriodoRapido('trimestre')}
                  >
                    Trimestre
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePeriodoRapido('ano_atual')}
                  >
                    Ano
                  </Button>
                </div>
                <div className="grid gap-2 md:grid-cols-2 mt-2">
                  <div className="space-y-2">
                    <Label>Data Início</Label>
                    <DatePicker
                      value={format(filtros.dataInicio, 'yyyy-MM-dd')}
                      onChange={(date) =>
                        setFiltros((prev) => ({
                          ...prev,
                          dataInicio: new Date(date),
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Data Fim</Label>
                    <DatePicker
                      value={format(filtros.dataFim, 'yyyy-MM-dd')}
                      onChange={(date) =>
                        setFiltros((prev) => ({
                          ...prev,
                          dataFim: new Date(date),
                        }))
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Tipo */}
              <div className="space-y-2">
                <Label>Tipo de Lançamento</Label>
                <Select
                  value={filtros.tipo}
                  onValueChange={(value) =>
                    setFiltros((prev) => ({
                      ...prev,
                      tipo: value as 'todos' | 'receita' | 'despesa',
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="receita">Apenas Receitas</SelectItem>
                    <SelectItem value="despesa">Apenas Despesas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Categoria */}
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select
                  value={filtros.categoriaId || '__all__'}
                  onValueChange={(value) => {
                    const normalized = value === '__all__' ? undefined : value;
                    setFiltros((prev) => ({
                      ...prev,
                      categoriaId: normalized,
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todas as categorias" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todas as categorias</SelectItem>
                    {categorias.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Fornecedor */}
              <div className="space-y-2">
                <Label>Fornecedor/Cliente</Label>
                <Select
                  value={filtros.fornecedorId || '__all__'}
                  onValueChange={(value) => {
                    const normalized = value === '__all__' ? undefined : value;
                    setFiltros((prev) => ({
                      ...prev,
                      fornecedorId: normalized,
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os fornecedores" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">
                      Todos os fornecedores
                    </SelectItem>
                    {fornecedores.map((forn) => (
                      <SelectItem key={forn.id} value={forn.id}>
                        {forn.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Opções */}
              <div className="space-y-2">
                <Label>Opções</Label>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="validados"
                      checked={filtros.apenasValidados}
                      onCheckedChange={(checked) =>
                        setFiltros((prev) => ({
                          ...prev,
                          apenasValidados: checked as boolean,
                        }))
                      }
                    />
                    <label
                      htmlFor="validados"
                      className="text-sm cursor-pointer"
                    >
                      Apenas lançamentos validados
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="divisao"
                      checked={filtros.incluirDivisaoSocios}
                      onCheckedChange={(checked) =>
                        setFiltros((prev) => ({
                          ...prev,
                          incluirDivisaoSocios: checked as boolean,
                        }))
                      }
                    />
                    <label htmlFor="divisao" className="text-sm cursor-pointer">
                      Incluir análise por sócio
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowFiltros(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  setShowFiltros(false);
                  gerarRelatorio();
                }}
                disabled={isLoading}
              >
                <BarChart3 className="mr-2 h-4 w-4" />
                {isLoading ? 'Gerando...' : 'Gerar Relatório'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }
);

RelatorioMensal.displayName = 'RelatorioMensal';
