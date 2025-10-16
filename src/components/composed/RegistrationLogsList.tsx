import React from 'react';
import { GenericTable, type GenericTableColumn } from './GenericTable';
import { Badge } from '@/components/primitives/badge';
import { Button } from '@/components/primitives/button';
import { Eye, AlertCircle, CheckCircle, Clock, XCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { RegistrationLog } from '@/lib/supabase/registration-logs';

// AI dev note: RegistrationLogsList - Lista de logs de cadastro público
// Mostra eventos, erros e progresso de cada sessão de cadastro

interface RegistrationLogsListProps {
  logs: RegistrationLog[];
  loading?: boolean;
  onViewDetails: (log: RegistrationLog) => void;
}

const eventTypeLabels: Record<string, string> = {
  step_started: 'Iniciou Etapa',
  step_completed: 'Completou Etapa',
  validation_error: 'Erro de Validação',
  api_error: 'Erro de API',
  success: 'Sucesso',
};

const eventTypeColors: Record<
  string,
  'secondary' | 'default' | 'outline' | 'destructive'
> = {
  step_started: 'secondary',
  step_completed: 'default',
  validation_error: 'outline',
  api_error: 'destructive',
  success: 'default',
};

const eventTypeIcons: Record<string, React.ReactNode> = {
  step_started: <Clock className="h-3 w-3" />,
  step_completed: <CheckCircle className="h-3 w-3" />,
  validation_error: <AlertCircle className="h-3 w-3" />,
  api_error: <XCircle className="h-3 w-3" />,
  success: <CheckCircle className="h-3 w-3" />,
};

const stepNameLabels: Record<string, string> = {
  whatsapp: 'WhatsApp',
  responsible: 'Responsável',
  address: 'Endereço',
  patient: 'Paciente',
  pediatrician: 'Pediatra',
  review: 'Revisão',
  finalization: 'Finalização',
};

export const RegistrationLogsList = React.memo<RegistrationLogsListProps>(
  ({ logs, loading = false, onViewDetails }) => {
    const columns: GenericTableColumn<RegistrationLog>[] = [
      {
        key: 'event_type',
        label: 'Evento',
        render: (log) => (
          <Badge
            variant={
              log.event_type ? eventTypeColors[log.event_type] : 'outline'
            }
            className="flex items-center gap-1 w-fit"
          >
            {log.event_type && eventTypeIcons[log.event_type]}
            {log.event_type ? eventTypeLabels[log.event_type] : 'Desconhecido'}
          </Badge>
        ),
      },
      {
        key: 'step_name',
        label: 'Etapa',
        render: (log) => (
          <Badge variant="secondary" className="w-fit">
            {log.step_name
              ? stepNameLabels[log.step_name] || log.step_name
              : '-'}
          </Badge>
        ),
      },
      {
        key: 'session_id',
        label: 'Session ID',
        render: (log) => (
          <div className="font-mono text-xs max-w-[120px]">
            <span className="truncate block cursor-help" title={log.session_id}>
              {log.session_id.substring(0, 8)}...
            </span>
          </div>
        ),
      },
      {
        key: 'error_message',
        label: 'Erro',
        render: (log) => (
          <div className="max-w-xs">
            {log.error_message ? (
              <span
                className="text-sm text-destructive truncate block cursor-help"
                title={log.error_message}
              >
                {log.error_message}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">-</span>
            )}
          </div>
        ),
      },
      {
        key: 'ip_address',
        label: 'IP',
        render: (log) => (
          <span className="text-sm font-mono">{log.ip_address || '-'}</span>
        ),
      },
      {
        key: 'created_at',
        label: 'Data',
        render: (log) => (
          <span className="text-sm text-muted-foreground">
            {formatDistanceToNow(new Date(log.created_at), {
              addSuffix: true,
              locale: ptBR,
            })}
          </span>
        ),
      },
      {
        key: 'actions',
        label: 'Ações',
        render: (log) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onViewDetails(log)}
            title="Ver Detalhes Completos"
          >
            <Eye className="h-4 w-4" />
          </Button>
        ),
        className: 'w-20',
      },
    ];

    return (
      <GenericTable
        title="Logs de Eventos"
        description="Registro de eventos durante o processo de cadastro público"
        data={logs}
        columns={columns}
        loading={loading}
        emptyMessage="Nenhum log de cadastro encontrado."
        itemsPerPage={50}
      />
    );
  }
);

RegistrationLogsList.displayName = 'RegistrationLogsList';
