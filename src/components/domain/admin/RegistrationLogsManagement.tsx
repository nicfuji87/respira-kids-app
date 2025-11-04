import React, { useState, useEffect, useCallback } from 'react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/primitives/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { Badge } from '@/components/primitives/badge';
import { toast } from '@/components/primitives/use-toast';
import { RegistrationLogsList } from '@/components/composed/RegistrationLogsList';
import {
  GenericTable,
  type GenericTableColumn,
} from '@/components/composed/GenericTable';
import { Search, X, FileJson, Activity, Database } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  fetchRegistrationLogs,
  fetchLogDetails,
  fetchAllApiLogs,
  fetchAllFormData,
  type RegistrationLog,
  type RegistrationFormData,
  type RegistrationApiLog,
  type LogFilters,
} from '@/lib/supabase/registration-logs';

// AI dev note: RegistrationLogsManagement - Gerencia visualização de logs de cadastro público
// 3 tabs: Eventos, Formulários, API
// Filtros: session_id, event_type, step_name, data

export const RegistrationLogsManagement = React.memo(() => {
  // Estados
  const [logs, setLogs] = useState<RegistrationLog[]>([]);
  const [formDataLogs, setFormDataLogs] = useState<RegistrationFormData[]>([]);
  const [apiLogs, setApiLogs] = useState<RegistrationApiLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<RegistrationLog | null>(null);
  const [detailsData, setDetailsData] = useState<{
    logs: RegistrationLog[];
    formData: RegistrationFormData[];
    apiLogs: RegistrationApiLog[];
  } | null>(null);

  // Filtros
  const [filters, setFilters] = useState<LogFilters>({
    session_id: '',
    event_type: 'all',
    step_name: 'all',
    limit: 100,
  });

  // Carregar logs
  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      // Buscar dados de todas as 3 tabelas em paralelo
      const [logsResult, apiLogsResult, formDataResult] = await Promise.all([
        fetchRegistrationLogs(filters),
        fetchAllApiLogs(100),
        fetchAllFormData(100),
      ]);

      if (logsResult.error) {
        console.error('Erro ao carregar logs:', logsResult.error);
      }
      if (apiLogsResult.error) {
        console.error('Erro ao carregar logs de API:', apiLogsResult.error);
      }
      if (formDataResult.error) {
        console.error(
          'Erro ao carregar dados de formulário:',
          formDataResult.error
        );
      }

      setLogs(logsResult.data || []);
      setApiLogs(apiLogsResult.data || []);
      setFormDataLogs(formDataResult.data || []);
    } catch (error) {
      console.error('Erro ao carregar logs:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os logs de cadastro.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Ver detalhes de uma sessão
  const handleViewDetails = useCallback(async (log: RegistrationLog) => {
    setSelectedLog(log);
    setIsDetailsOpen(true);

    try {
      const details = await fetchLogDetails(log.session_id);
      setDetailsData(details);
    } catch (error) {
      console.error('Erro ao carregar detalhes:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os detalhes da sessão.',
        variant: 'destructive',
      });
    }
  }, []);

  // Limpar filtros
  const handleClearFilters = useCallback(() => {
    setFilters({
      session_id: '',
      event_type: 'all',
      step_name: 'all',
      limit: 100,
    });
  }, []);

  // Colunas para FormData
  const formDataColumns: GenericTableColumn<RegistrationFormData>[] = [
    {
      key: 'step_name',
      label: 'Etapa',
      render: (item) => <Badge variant="secondary">{item.step_name}</Badge>,
    },
    {
      key: 'is_valid',
      label: 'Válido',
      render: (item) => (
        <Badge variant={item.is_valid ? 'default' : 'destructive'}>
          {item.is_valid ? 'Sim' : 'Não'}
        </Badge>
      ),
    },
    {
      key: 'created_at',
      label: 'Data',
      render: (item) => (
        <span className="text-sm text-muted-foreground">
          {formatDistanceToNow(new Date(item.created_at), {
            addSuffix: true,
            locale: ptBR,
          })}
        </span>
      ),
    },
  ];

  // Colunas para API Logs
  const apiLogsColumns: GenericTableColumn<RegistrationApiLog>[] = [
    {
      key: 'http_status',
      label: 'Status HTTP',
      render: (item) => (
        <Badge
          variant={
            item.http_status &&
            item.http_status >= 200 &&
            item.http_status < 300
              ? 'default'
              : 'destructive'
          }
        >
          {item.http_status || '-'}
        </Badge>
      ),
    },
    {
      key: 'duration_ms',
      label: 'Duração',
      render: (item) => (
        <span className="text-sm">
          {item.duration_ms ? `${item.duration_ms}ms` : '-'}
        </span>
      ),
    },
    {
      key: 'error_type',
      label: 'Tipo de Erro',
      render: (item) => (
        <Badge variant={item.error_type ? 'destructive' : 'outline'}>
          {item.error_type || 'Nenhum'}
        </Badge>
      ),
    },
    {
      key: 'edge_function_version',
      label: 'Versão',
      render: (item) => (
        <span className="text-sm font-mono">
          v{item.edge_function_version || '?'}
        </span>
      ),
    },
    {
      key: 'created_at',
      label: 'Data',
      render: (item) => (
        <span className="text-sm text-muted-foreground">
          {formatDistanceToNow(new Date(item.created_at), {
            addSuffix: true,
            locale: ptBR,
          })}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="flex flex-col md:flex-row gap-4 p-4 border rounded-lg bg-muted/30">
        <div className="flex-1">
          <Label htmlFor="session_id" className="text-xs">
            Session ID
          </Label>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="session_id"
              placeholder="Buscar por session_id..."
              value={filters.session_id}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, session_id: e.target.value }))
              }
              className="pl-8"
            />
          </div>
        </div>

        <div className="w-full md:w-48">
          <Label htmlFor="event_type" className="text-xs">
            Tipo de Evento
          </Label>
          <Select
            value={filters.event_type}
            onValueChange={(value) =>
              setFilters((prev) => ({ ...prev, event_type: value }))
            }
          >
            <SelectTrigger id="event_type">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="step_started">Iniciou Etapa</SelectItem>
              <SelectItem value="step_completed">Completou Etapa</SelectItem>
              <SelectItem value="validation_error">
                Erro de Validação
              </SelectItem>
              <SelectItem value="api_error">Erro de API</SelectItem>
              <SelectItem value="success">Sucesso</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="w-full md:w-48">
          <Label htmlFor="step_name" className="text-xs">
            Etapa
          </Label>
          <Select
            value={filters.step_name}
            onValueChange={(value) =>
              setFilters((prev) => ({ ...prev, step_name: value }))
            }
          >
            <SelectTrigger id="step_name">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="responsible">Responsável</SelectItem>
              <SelectItem value="address">Endereço</SelectItem>
              <SelectItem value="patient">Paciente</SelectItem>
              <SelectItem value="pediatrician">Pediatra</SelectItem>
              <SelectItem value="review">Revisão</SelectItem>
              <SelectItem value="finalization">Finalização</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearFilters}
            disabled={
              !filters.session_id &&
              filters.event_type === 'all' &&
              filters.step_name === 'all'
            }
          >
            <X className="h-4 w-4 mr-2" />
            Limpar
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="logs" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="logs" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Eventos
          </TabsTrigger>
          <TabsTrigger value="form-data" className="flex items-center gap-2">
            <FileJson className="h-4 w-4" />
            Formulários
          </TabsTrigger>
          <TabsTrigger value="api" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            API
          </TabsTrigger>
        </TabsList>

        <TabsContent value="logs" className="space-y-6">
          <RegistrationLogsList
            logs={logs}
            loading={loading}
            onViewDetails={handleViewDetails}
          />
        </TabsContent>

        <TabsContent value="form-data" className="space-y-6">
          <GenericTable
            title="Dados de Formulário"
            description="Snapshots dos dados do formulário em cada etapa (dados sensíveis anonimizados)"
            data={formDataLogs}
            columns={formDataColumns}
            loading={loading}
            emptyMessage="Nenhum dado de formulário encontrado."
            itemsPerPage={50}
          />
        </TabsContent>

        <TabsContent value="api" className="space-y-6">
          <GenericTable
            title="Logs de API"
            description="Chamadas à Edge Function de cadastro público"
            data={apiLogs}
            columns={apiLogsColumns}
            loading={loading}
            emptyMessage="Nenhum log de API encontrado."
            itemsPerPage={50}
          />
        </TabsContent>
      </Tabs>

      {/* Modal de Detalhes */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da Sessão</DialogTitle>
            <DialogDescription>
              Session ID:{' '}
              <span className="font-mono text-xs">
                {selectedLog?.session_id}
              </span>
            </DialogDescription>
          </DialogHeader>

          {detailsData && (
            <div className="space-y-4">
              {/* Timeline de Eventos */}
              <div>
                <h3 className="text-sm font-semibold mb-2">
                  Timeline de Eventos ({detailsData.logs.length})
                </h3>
                <div className="space-y-2 max-h-64 overflow-auto">
                  {detailsData.logs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 border rounded-lg bg-muted/30 text-sm"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="secondary">
                          {log.event_type || 'Desconhecido'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(log.created_at), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </span>
                      </div>
                      {log.step_name && (
                        <p className="text-xs text-muted-foreground">
                          Etapa: {log.step_name}
                        </p>
                      )}
                      {log.error_message && (
                        <p className="text-xs text-destructive mt-1">
                          {log.error_message}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Dados de Formulário */}
              {detailsData.formData.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">
                    Dados de Formulário ({detailsData.formData.length})
                  </h3>
                  <div className="max-h-64 overflow-auto">
                    <pre className="text-xs bg-muted p-4 rounded-lg">
                      {JSON.stringify(detailsData.formData, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {/* Logs de API */}
              {detailsData.apiLogs.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">
                    Logs de API ({detailsData.apiLogs.length})
                  </h3>
                  <div className="max-h-64 overflow-auto">
                    <pre className="text-xs bg-muted p-4 rounded-lg">
                      {JSON.stringify(detailsData.apiLogs, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
});

RegistrationLogsManagement.displayName = 'RegistrationLogsManagement';
