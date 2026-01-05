import React from 'react';
import { GenericTable, type GenericTableColumn } from './GenericTable';
import { Badge } from '@/components/primitives/badge';
import { Button } from '@/components/primitives/button';
import { RefreshCw, Eye } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// AI dev note: WebhookLogs - Histórico de envios de webhooks
// Mostra dados da webhook_queue com opções de reenvio

export interface WebhookLog {
  id: string;
  evento: string;
  payload: Record<string, unknown>;
  status: 'pendente' | 'processando' | 'processado' | 'erro';
  tentativas: number;
  max_tentativas: number;
  erro?: string;
  created_at: string;
  processado_em?: string;
  proximo_retry?: string;
}

interface WebhookLogsProps {
  logs: WebhookLog[];
  loading?: boolean;
  onRetry: (log: WebhookLog) => void;
  onViewPayload: (log: WebhookLog) => void;
}

const eventLabels: Record<string, string> = {
  user_created: 'Usuário Criado',
  patient_created: 'Paciente Criado',
  appointment_created: 'Agendamento Criado',
  evolution_created: 'Evolução Criada',
  orcamento_gerado: 'Orçamento Gerado',
  certificado_gerado: 'Certificado Gerado',
  atestado_gerado: 'Atestado Gerado',
  webhook_failed: 'Webhook Falhou',
  registration_error: 'Erro no Cadastro',
};

const statusColors = {
  pendente: 'secondary',
  processando: 'outline',
  processado: 'default',
  erro: 'destructive',
} as const;

const statusLabels = {
  pendente: 'Pendente',
  processando: 'Processando',
  processado: 'Processado',
  erro: 'Erro',
};

export const WebhookLogs = React.memo<WebhookLogsProps>(
  ({ logs, loading = false, onRetry, onViewPayload }) => {
    const columns: GenericTableColumn<WebhookLog>[] = [
      {
        key: 'evento',
        label: 'Evento',
        render: (log) => (
          <Badge variant="outline">
            {eventLabels[log.evento] || log.evento}
          </Badge>
        ),
      },
      {
        key: 'status',
        label: 'Status',
        render: (log) => (
          <Badge variant={statusColors[log.status]}>
            {statusLabels[log.status]}
          </Badge>
        ),
      },
      {
        key: 'tentativas',
        label: 'Tentativas',
        render: (log) => (
          <span className="text-sm">
            {log.tentativas}/{log.max_tentativas}
          </span>
        ),
      },
      {
        key: 'created_at',
        label: 'Criado',
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
        key: 'processado_em',
        label: 'Processado',
        render: (log) => (
          <span className="text-sm text-muted-foreground">
            {log.processado_em
              ? formatDistanceToNow(new Date(log.processado_em), {
                  addSuffix: true,
                  locale: ptBR,
                })
              : '-'}
          </span>
        ),
      },
      {
        key: 'erro',
        label: 'Erro',
        render: (log) => (
          <div className="max-w-xs">
            {log.erro ? (
              <span
                className="text-sm text-destructive truncate block"
                title={log.erro}
              >
                {log.erro}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">-</span>
            )}
          </div>
        ),
      },
      {
        key: 'actions',
        label: 'Ações',
        render: (log) => (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onViewPayload(log)}
              title="Ver Payload"
            >
              <Eye className="h-4 w-4" />
            </Button>
            {(log.status === 'erro' || log.status === 'pendente') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRetry(log)}
                title="Reenviar Webhook"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}
          </div>
        ),
        className: 'w-24',
      },
    ];

    return (
      <GenericTable
        title="Histórico de Webhooks"
        description="Log de todos os webhooks enviados pelo sistema"
        data={logs}
        columns={columns}
        loading={loading}
        emptyMessage="Nenhum webhook foi enviado ainda."
        itemsPerPage={20}
      />
    );
  }
);

WebhookLogs.displayName = 'WebhookLogs';
