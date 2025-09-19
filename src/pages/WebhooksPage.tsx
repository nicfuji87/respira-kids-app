import React from 'react';
import { WebhookManagement } from '@/components/domain/system/WebhookManagement';

// AI dev note: WebhooksPage - Página principal para gerenciamento de webhooks
// Usa o componente domain WebhookManagement

export const WebhooksPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Webhooks</h1>
        <p className="text-muted-foreground">
          Configure webhooks para receber notificações de eventos do sistema
        </p>
      </div>

      <WebhookManagement />
    </div>
  );
};
