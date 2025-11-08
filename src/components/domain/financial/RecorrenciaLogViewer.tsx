import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  History,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Eye,
  Play,
  AlertCircle,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
  Alert,
  AlertDescription,
  AlertTitle,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/primitives';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';

// AI dev note: Componente para visualizar logs de processamento de recorrências
// Permite acompanhar execuções e executar manualmente o processamento

interface LogDetalhe {
  descricao: string;
  lancamento_id?: string;
  proxima_data?: string;
  erro?: string;
}

interface LogRecorrencia {
  id: string;
  executado_em: string;
  resultado: Record<string, unknown>;
  sucesso: boolean;
  mensagem?: string;
  lancamentos_criados: number;
  lancamentos_com_erro: number;
  detalhes?: LogDetalhe[];
}

interface RecorrenciaLogViewerProps {
  className?: string;
}

export const RecorrenciaLogViewer = React.memo<RecorrenciaLogViewerProps>(
  ({ className }) => {
    const [logs, setLogs] = React.useState<LogRecorrencia[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [isProcessing, setIsProcessing] = React.useState(false);
    const [showDetails, setShowDetails] = React.useState(false);
    const [selectedLog, setSelectedLog] = React.useState<LogRecorrencia | null>(
      null
    );
    const { toast } = useToast();

    // Carregar logs
    const loadLogs = React.useCallback(async () => {
      try {
        setIsLoading(true);

        const { data, error } = await supabase
          .from('lancamentos_recorrentes_log')
          .select('*')
          .order('executado_em', { ascending: false })
          .limit(20);

        if (error) throw error;
        setLogs(data || []);
      } catch (error) {
        console.error('Erro ao carregar logs:', error);
        toast({
          variant: 'destructive',
          title: 'Erro ao carregar logs',
          description:
            'Não foi possível carregar o histórico de processamento.',
        });
      } finally {
        setIsLoading(false);
      }
    }, [toast]);

    React.useEffect(() => {
      loadLogs();
    }, [loadLogs]);

    // Executar processamento manual
    const handleProcessarManual = async () => {
      try {
        setIsProcessing(true);

        const { data, error } = await supabase.rpc(
          'processar_lancamentos_recorrentes_manual'
        );

        if (error) throw error;

        toast({
          title: 'Processamento concluído',
          description: `${data.processados} lançamentos criados${data.erros > 0 ? `, ${data.erros} erros` : ''}`,
        });

        // Recarregar logs
        loadLogs();
      } catch (error) {
        console.error('Erro ao processar:', error);
        toast({
          variant: 'destructive',
          title: 'Erro no processamento',
          description: 'Não foi possível executar o processamento.',
        });
      } finally {
        setIsProcessing(false);
      }
    };

    const handleViewDetails = (log: LogRecorrencia) => {
      setSelectedLog(log);
      setShowDetails(true);
    };

    // Estatísticas dos logs
    const estatisticas = React.useMemo(() => {
      const ultimaSemana = logs.filter((log) => {
        const data = new Date(log.executado_em);
        const seteDiasAtras = new Date();
        seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
        return data >= seteDiasAtras;
      });

      const totalLancamentos = ultimaSemana.reduce(
        (sum, log) => sum + log.lancamentos_criados,
        0
      );
      const totalErros = ultimaSemana.reduce(
        (sum, log) => sum + log.lancamentos_com_erro,
        0
      );
      const taxaSucesso =
        ultimaSemana.length > 0
          ? (ultimaSemana.filter((log) => log.sucesso).length /
              ultimaSemana.length) *
            100
          : 0;

      return {
        totalExecucoes: ultimaSemana.length,
        totalLancamentos,
        totalErros,
        taxaSucesso,
      };
    }, [logs]);

    return (
      <>
        <Card className={className}>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Histórico de Processamento
                </CardTitle>
                <CardDescription>
                  Acompanhe as execuções automáticas de lançamentos recorrentes
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadLogs}
                  disabled={isLoading}
                >
                  <RefreshCw
                    className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
                  />
                  Atualizar
                </Button>
                <Button
                  size="sm"
                  onClick={handleProcessarManual}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <Clock className="mr-2 h-4 w-4 animate-pulse" />
                  ) : (
                    <Play className="mr-2 h-4 w-4" />
                  )}
                  Processar Agora
                </Button>
              </div>
            </div>

            {/* Cards de Estatísticas */}
            <div className="mt-4 grid gap-4 md:grid-cols-4">
              <Card>
                <CardContent className="p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">
                      Execuções (7 dias)
                    </p>
                    <p className="text-2xl font-bold">
                      {estatisticas.totalExecucoes}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">
                      Lançamentos Criados
                    </p>
                    <p className="text-2xl font-bold text-green-600">
                      {estatisticas.totalLancamentos}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">
                      Erros
                    </p>
                    <p className="text-2xl font-bold text-red-600">
                      {estatisticas.totalErros}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">
                      Taxa de Sucesso
                    </p>
                    <p className="text-2xl font-bold">
                      {estatisticas.taxaSucesso.toFixed(1)}%
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </CardHeader>

          <CardContent>
            {/* Info sobre cron job */}
            <Alert className="mb-4">
              <Clock className="h-4 w-4" />
              <AlertTitle>Processamento Automático</AlertTitle>
              <AlertDescription>
                Os lançamentos recorrentes são processados automaticamente todos
                os dias às 3h da manhã (horário de Brasília).
              </AlertDescription>
            </Alert>

            {/* Lista de Logs */}
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <History className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-medium">
                  Nenhum registro encontrado
                </h3>
                <p className="mb-4 text-sm text-muted-foreground">
                  Ainda não houve processamento de lançamentos recorrentes
                </p>
                <Button size="sm" onClick={handleProcessarManual}>
                  <Play className="mr-2 h-4 w-4" />
                  Executar Primeiro Processamento
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Lançamentos</TableHead>
                    <TableHead className="text-center">Erros</TableHead>
                    <TableHead>Mensagem</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">
                            {format(new Date(log.executado_em), 'dd/MM/yyyy')}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(log.executado_em), 'HH:mm:ss')}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {log.sucesso ? (
                          <Badge variant="outline" className="text-green-600">
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Sucesso
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <XCircle className="mr-1 h-3 w-3" />
                            Falha
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <span
                          className={
                            log.lancamentos_criados > 0
                              ? 'font-medium text-green-600'
                              : 'text-muted-foreground'
                          }
                        >
                          {log.lancamentos_criados}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span
                          className={
                            log.lancamentos_com_erro > 0
                              ? 'font-medium text-red-600'
                              : 'text-muted-foreground'
                          }
                        >
                          {log.lancamentos_com_erro}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm line-clamp-1">
                          {log.mensagem || 'Processamento automático'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleViewDetails(log)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Ver detalhes</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Dialog de Detalhes */}
        <Dialog open={showDetails} onOpenChange={setShowDetails}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Detalhes do Processamento</DialogTitle>
              <DialogDescription>
                {selectedLog &&
                  format(
                    new Date(selectedLog.executado_em),
                    "dd 'de' MMMM 'de' yyyy 'às' HH:mm",
                    { locale: ptBR }
                  )}
              </DialogDescription>
            </DialogHeader>

            {selectedLog && (
              <div className="space-y-4">
                {/* Resumo */}
                <div className="grid gap-4 md:grid-cols-3">
                  <Card>
                    <CardContent className="p-4">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-muted-foreground">
                          Status
                        </p>
                        {selectedLog.sucesso ? (
                          <div className="flex items-center gap-2 text-green-600">
                            <CheckCircle className="h-5 w-5" />
                            <span className="font-medium">Sucesso</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-red-600">
                            <XCircle className="h-5 w-5" />
                            <span className="font-medium">Falha</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-muted-foreground">
                          Criados
                        </p>
                        <p className="text-2xl font-bold text-green-600">
                          {selectedLog.lancamentos_criados}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-muted-foreground">
                          Erros
                        </p>
                        <p className="text-2xl font-bold text-red-600">
                          {selectedLog.lancamentos_com_erro}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Mensagem */}
                {selectedLog.mensagem && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Mensagem</AlertTitle>
                    <AlertDescription>{selectedLog.mensagem}</AlertDescription>
                  </Alert>
                )}

                {/* Detalhes */}
                {selectedLog.detalhes &&
                  Array.isArray(selectedLog.detalhes) &&
                  selectedLog.detalhes.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="font-medium">Detalhes dos Lançamentos</h3>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Descrição</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Próxima Data</TableHead>
                            <TableHead>Erro</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedLog.detalhes?.map(
                            (detalhe, index: number) => (
                              <TableRow key={index}>
                                <TableCell className="font-medium">
                                  {detalhe.descricao}
                                </TableCell>
                                <TableCell>
                                  {detalhe.lancamento_id ? (
                                    <Badge
                                      variant="outline"
                                      className="text-green-600"
                                    >
                                      <CheckCircle className="mr-1 h-3 w-3" />
                                      Criado
                                    </Badge>
                                  ) : (
                                    <Badge variant="destructive">
                                      <XCircle className="mr-1 h-3 w-3" />
                                      Erro
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {detalhe.proxima_data &&
                                    format(
                                      new Date(detalhe.proxima_data),
                                      'dd/MM/yyyy'
                                    )}
                                </TableCell>
                                <TableCell>
                                  {detalhe.erro && (
                                    <span className="text-sm text-red-600">
                                      {detalhe.erro}
                                    </span>
                                  )}
                                </TableCell>
                              </TableRow>
                            )
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDetails(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }
);

RecorrenciaLogViewer.displayName = 'RecorrenciaLogViewer';
