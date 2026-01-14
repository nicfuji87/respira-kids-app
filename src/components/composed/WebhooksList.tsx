import React from 'react';
import { GenericTable, type GenericTableColumn } from './GenericTable';
import { Badge } from '@/components/primitives/badge';
import { Button } from '@/components/primitives/button';
import { Edit, Trash2, TestTube } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// AI dev note: WebhooksList - Lista de webhooks configurados
// Combina GenericTable com ações específicas de webhook

export interface Webhook {
  id: string;
  url: string;
  eventos: string[];
  ativo: boolean;
  created_at: string;
  updated_at: string;
  headers?: Record<string, unknown>;
}

interface WebhooksListProps {
  webhooks: Webhook[];
  loading?: boolean;
  onAdd: () => void;
  onEdit: (webhook: Webhook) => void;
  onDelete: (webhook: Webhook) => void;
  onTest: (webhook: Webhook) => void;
}

const eventLabels: Record<string, string> = {
  user_created: 'Usuário Criado',
  patient_created: 'Paciente Criado',
  appointment_created: 'Agendamento Criado',
  evolution_created: 'Evolução Criada',
  orcamento_gerado: 'Orçamento Gerado',
  certificado_gerado: 'Certificado Gerado',
  atestado_gerado: 'Atestado Gerado',
  relatorio_clinico_gerado: 'Relatório Clínico Gerado',
  webhook_failed: 'Webhook Falhou',
  registration_error: 'Erro no Cadastro',
};

export const WebhooksList = React.memo<WebhooksListProps>(
  ({ webhooks, loading = false, onAdd, onEdit, onDelete, onTest }) => {
    const columns: GenericTableColumn<Webhook>[] = [
      {
        key: 'url',
        label: 'URL',
        render: (webhook) => (
          <div className="max-w-xs">
            <div className="truncate font-mono text-sm">{webhook.url}</div>
          </div>
        ),
      },
      {
        key: 'eventos',
        label: 'Eventos',
        render: (webhook) => (
          <div className="flex flex-wrap gap-1">
            {webhook.eventos.slice(0, 3).map((evento) => (
              <Badge key={evento} variant="secondary" className="text-xs">
                {eventLabels[evento] || evento}
              </Badge>
            ))}
            {webhook.eventos.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{webhook.eventos.length - 3}
              </Badge>
            )}
          </div>
        ),
      },
      {
        key: 'ativo',
        label: 'Status',
        render: (webhook) => (
          <Badge variant={webhook.ativo ? 'default' : 'secondary'}>
            {webhook.ativo ? 'Ativo' : 'Inativo'}
          </Badge>
        ),
      },
      {
        key: 'created_at',
        label: 'Criado',
        render: (webhook) => (
          <span className="text-sm text-muted-foreground">
            {formatDistanceToNow(new Date(webhook.created_at), {
              addSuffix: true,
              locale: ptBR,
            })}
          </span>
        ),
      },
      {
        key: 'actions',
        label: 'Ações',
        render: (webhook) => (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onTest(webhook)}
              disabled={!webhook.ativo}
              title="Testar Webhook"
            >
              <TestTube className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(webhook)}
              title="Editar Webhook"
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(webhook)}
              title="Deletar Webhook"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
        className: 'w-32',
      },
    ];

    return (
      <GenericTable
        title="Webhooks"
        description="URLs que recebem notificações de eventos do sistema"
        data={webhooks}
        columns={columns}
        loading={loading}
        onAdd={onAdd}
        addButtonText="Novo Webhook"
        emptyMessage="Nenhum webhook configurado. Configure um webhook para receber notificações de eventos."
        itemsPerPage={10}
      />
    );
  }
);

WebhooksList.displayName = 'WebhooksList';
