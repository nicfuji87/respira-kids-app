import React from 'react';
import { GenericForm, type FormField } from './GenericForm';
import type { UseFormReturn } from 'react-hook-form';

// AI dev note: WebhookForm - Formulário para criar/editar webhooks
// Usa GenericForm com campos específicos para webhook

export interface WebhookFormData {
  url: string;
  eventos: string[];
  ativo: boolean;
  headers?: string;
}

interface WebhookFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: WebhookFormData) => void | Promise<void>;
  form: UseFormReturn<WebhookFormData>;
  isEditing?: boolean;
  loading?: boolean;
}

const eventOptions = [
  { value: 'user_created', label: 'Usuário Criado' },
  { value: 'patient_created', label: 'Paciente Criado' },
  { value: 'appointment_created', label: 'Agendamento Criado' },
  { value: 'evolution_created', label: 'Evolução Criada' },
  { value: 'orcamento_gerado', label: 'Orçamento Gerado' },
  { value: 'webhook_failed', label: 'Webhook Falhou' },
  { value: 'registration_error', label: 'Erro no Cadastro' },
];

export const WebhookForm = React.memo<WebhookFormProps>(
  ({ isOpen, onClose, onSubmit, form, isEditing = false, loading = false }) => {
    // Campos específicos do webhook
    const fields: FormField[] = [
      {
        name: 'url',
        label: 'URL do Webhook',
        type: 'text',
        placeholder: 'https://example.com/webhook',
        required: true,
        description: 'URL HTTPS que receberá as notificações',
      },
      {
        name: 'eventos',
        label: 'Eventos para Notificar',
        type: 'multiselect',
        required: true,
        options: eventOptions,
        description: 'Selecione quais eventos devem disparar este webhook',
      },
      {
        name: 'headers',
        label: 'Headers de Autorização (JSON)',
        type: 'textarea',
        placeholder:
          '{"Authorization": "Bearer seu-token", "X-API-Key": "sua-chave"}',
        description:
          'Headers customizados em formato JSON para autenticação (opcional)',
      },
      {
        name: 'ativo',
        label: 'Status',
        type: 'switch',
        description: 'Webhook ativo recebe notificações',
      },
    ];

    return (
      <GenericForm
        isOpen={isOpen}
        onClose={onClose}
        onSubmit={onSubmit}
        form={form}
        fields={fields}
        title={isEditing ? 'Editar Webhook' : 'Novo Webhook'}
        description={
          isEditing
            ? 'Altere as configurações do webhook'
            : 'Configure um novo webhook para receber notificações'
        }
        isEditing={isEditing}
        loading={loading}
        submitText={isEditing ? 'Salvar Alterações' : 'Criar Webhook'}
      />
    );
  }
);

WebhookForm.displayName = 'WebhookForm';
