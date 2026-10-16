import React from 'react';
import { WebhookManagement } from '@/components/domain/system/WebhookManagement';

// AI dev note: WebhooksPage - Página principal para gerenciamento de webhooks
// Usa o componente domain WebhookManagement

export const WebhooksPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <WebhookManagement />
    </div>
  );
};
