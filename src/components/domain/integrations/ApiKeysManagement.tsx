import React, { useState, useEffect, useCallback } from 'react';
import { Key, AlertTriangle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Badge } from '@/components/primitives/badge';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { useToast } from '@/components/primitives/use-toast';
import {
  GenericTable,
  GenericForm,
  StatusBadge,
  CRUDActions,
  type GenericTableColumn,
  type FormField,
} from '@/components/composed';
import type { ApiKey, ApiKeyCreate } from '@/types/integrations';
import { SUPPORTED_SERVICES } from '@/types/integrations';
import {
  fetchApiKeys,
  createApiKey,
  updateApiKey,
  deleteApiKey,
  toggleApiKeyStatus,
  checkAdminRole,
} from '@/lib/integrations-api';
import { cn } from '@/lib/utils';

// AI dev note: ApiKeysManagement é um componente Domain para gerenciar chaves de API
// Foca na segurança e não exposição de chaves sensíveis no frontend
// Agora usa API real com verificação de role admin

export interface ApiKeysManagementProps {
  className?: string;
}

export const ApiKeysManagement = React.memo<ApiKeysManagementProps>(
  ({ className }) => {
    const [data, setData] = useState<ApiKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<ApiKey | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { toast } = useToast();

    // Form
    const form = useForm<ApiKeyCreate>({
      defaultValues: {
        service_name: 'openai',
        encrypted_key: '',
        label: '',
        service_url: '',
        instance_name: '',
        is_active: true,
      },
    });

    // === LOAD DATA ===
    const loadData = useCallback(async () => {
      setLoading(true);
      try {
        // Primeiro verificar se é admin
        const adminCheck = await checkAdminRole();

        if (!adminCheck.success) {
          toast({
            title: 'Erro de autenticação',
            description: adminCheck.error || 'Erro ao verificar permissões',
            variant: 'destructive',
          });
          setIsAdmin(false);
          setLoading(false);
          return;
        }

        setIsAdmin(adminCheck.data || false);

        if (!adminCheck.data) {
          setLoading(false);
          return; // Não carregar dados se não for admin
        }

        // Carregar chaves de API se for admin
        const result = await fetchApiKeys();

        if (result.success && result.data) {
          setData(result.data.data);
        } else {
          toast({
            title: 'Erro ao carregar chaves de API',
            description:
              result.error || 'Falha ao carregar configurações de integração',
            variant: 'destructive',
          });
        }
      } catch (error) {
        console.error('❌ Erro ao carregar dados:', error);
        toast({
          title: 'Erro inesperado',
          description: 'Falha ao carregar dados das integrações',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    }, [toast]);

    useEffect(() => {
      loadData();
    }, [loadData]);

    // === FORM HANDLERS ===
    const handleAdd = () => {
      const defaultValues = {
        service_name: 'openai' as const,
        encrypted_key: '',
        label: '',
        service_url: '',
        instance_name: '',
        is_active: true,
      };

      form.reset(defaultValues);
      setEditingItem(null);

      setTimeout(() => {
        setIsFormOpen(true);
      }, 50);
    };

    const handleEdit = (item: ApiKey) => {
      const formValues = {
        service_name: item.service_name,
        encrypted_key: '', // Não pré-popular chave sensível
        label: item.label || '',
        service_url: item.service_url || '',
        instance_name: item.instance_name || '',
        is_active: item.is_active,
      };

      form.reset(formValues);
      setEditingItem(item);
      setIsFormOpen(true);
    };

    const handleSubmit = async (formData: ApiKeyCreate) => {
      setIsSubmitting(true);

      try {
        let result;

        if (editingItem) {
          // Ao editar, só atualizar campos preenchidos
          const updateData: Record<string, string | boolean | undefined> = {
            label: formData.label,
            service_url: formData.service_url,
            instance_name: formData.instance_name,
            is_active: formData.is_active,
          };

          // Só atualizar chave se foi preenchida
          if (formData.encrypted_key && formData.encrypted_key.trim() !== '') {
            updateData.encrypted_key = formData.encrypted_key;
          }

          result = await updateApiKey(editingItem.id, updateData);
        } else {
          // Ao criar, todos os campos obrigatórios devem estar preenchidos
          result = await createApiKey(formData);
        }

        if (result.success) {
          const serviceConfig = SUPPORTED_SERVICES[formData.service_name];
          toast({
            title: 'Sucesso',
            description: `Integração com ${serviceConfig.label} ${editingItem ? 'atualizada' : 'criada'} com sucesso`,
          });
          setIsFormOpen(false);
          loadData();
        } else {
          toast({
            title: 'Erro',
            description: result.error || 'Erro ao salvar chave de API',
            variant: 'destructive',
          });
        }
      } catch {
        toast({
          title: 'Erro',
          description: 'Erro inesperado ao salvar',
          variant: 'destructive',
        });
      } finally {
        setIsSubmitting(false);
      }
    };

    const handleDelete = async (item: ApiKey) => {
      const result = await deleteApiKey(item.id);

      if (result.success) {
        const serviceConfig = SUPPORTED_SERVICES[item.service_name];
        toast({
          title: 'Sucesso',
          description: `Integração com ${serviceConfig.label} removida com sucesso`,
        });
        loadData();
      } else {
        toast({
          title: 'Erro',
          description: result.error || 'Erro ao excluir chave de API',
          variant: 'destructive',
        });
      }
    };

    const handleToggleStatus = async (item: ApiKey) => {
      const result = await toggleApiKeyStatus(item.id);

      if (result.success) {
        const serviceConfig = SUPPORTED_SERVICES[item.service_name];
        toast({
          title: 'Sucesso',
          description: `Integração com ${serviceConfig.label} ${!item.is_active ? 'ativada' : 'desativada'}`,
        });
        loadData();
      } else {
        toast({
          title: 'Erro',
          description: result.error || 'Erro ao alterar status',
          variant: 'destructive',
        });
      }
    };

    // === TABLE CONFIGURATION ===
    const formatEncryptedKey = (key: string) => {
      if (!key || key.length < 4) return '••••';
      return `••••${key.slice(-4)}`;
    };

    const columns: GenericTableColumn<ApiKey>[] = [
      {
        key: 'service_name',
        label: 'Serviço',
        render: (item) => {
          const config = SUPPORTED_SERVICES[item.service_name];
          return (
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-primary" />
              <Badge variant="outline">
                {config?.label || item.service_name}
              </Badge>
            </div>
          );
        },
        className: 'w-32',
      },
      {
        key: 'label',
        label: 'Label',
        className: 'font-medium',
      },
      {
        key: 'encrypted_key',
        label: 'Chave',
        render: (item) => (
          <span className="font-mono text-sm text-muted-foreground">
            {formatEncryptedKey(item.encrypted_key)}
          </span>
        ),
        className: 'w-24',
      },
      {
        key: 'service_url',
        label: 'URL',
        render: (item) => item.service_url || '-',
        className: 'text-muted-foreground text-sm max-w-32 truncate',
      },
      {
        key: 'is_active',
        label: 'Status',
        render: (item) => (
          <button
            onClick={() => handleToggleStatus(item)}
            className="cursor-pointer hover:opacity-80 transition-opacity"
            title={`Clique para ${item.is_active ? 'desativar' : 'ativar'}`}
          >
            <StatusBadge ativo={item.is_active} />
          </button>
        ),
        className: 'w-24',
      },
      {
        key: 'created_at',
        label: 'Criado em',
        render: (item) => new Date(item.created_at).toLocaleDateString('pt-BR'),
        className: 'w-32 text-sm text-muted-foreground',
      },
      {
        key: 'actions',
        label: 'Ações',
        render: (item) => (
          <CRUDActions
            onEdit={() => handleEdit(item)}
            onDelete={() => handleDelete(item)}
            onToggleStatus={() => handleToggleStatus(item)}
            ativo={item.is_active}
            canToggleStatus={true}
          />
        ),
        className: 'w-16',
      },
    ];

    // === FORM FIELDS ===
    const formFields: FormField[] = [
      {
        name: 'service_name',
        label: 'Serviço',
        type: 'select',
        required: true,
        options: Object.entries(SUPPORTED_SERVICES).map(([key, config]) => ({
          value: key,
          label: config.label,
        })),
      },
      {
        name: 'label',
        label: 'Label',
        type: 'text',
        placeholder: 'Ex: OpenAI Principal, Asaas Produção',
        required: true,
      },
      {
        name: 'encrypted_key',
        label: 'Chave API',
        type: 'password',
        placeholder: 'Insira a chave de API',
        required: !editingItem, // Obrigatório só na criação
      },
      {
        name: 'service_url',
        label: 'URL do Serviço',
        type: 'text',
        placeholder: 'https://api.exemplo.com',
        description: 'Necessário para Evolution API',
      },
      {
        name: 'instance_name',
        label: 'Nome da Instância',
        type: 'text',
        placeholder: 'nome-instancia',
        description: 'Necessário para Evolution API',
      },
    ];

    if (!isAdmin) {
      return (
        <div className={cn('space-y-6', className)}>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Você não tem permissão para gerenciar chaves de API. Por favor,
              entre em contato com o administrador.
            </AlertDescription>
          </Alert>
        </div>
      );
    }

    return (
      <>
        <GenericTable
          title="Chaves de API"
          description="Configure integrações com serviços externos de forma segura"
          data={data}
          columns={columns}
          loading={loading}
          onAdd={handleAdd}
          addButtonText="Nova Chave"
          searchPlaceholder="Buscar por serviço ou label..."
          emptyMessage="Nenhuma chave de API encontrada"
          itemsPerPage={10}
        />

        <GenericForm
          isOpen={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          onSubmit={handleSubmit}
          form={form}
          fields={formFields}
          title={editingItem ? 'Editar Chave de API' : 'Nova Chave de API'}
          description={
            editingItem
              ? 'Altere os dados da chave de API. Deixe a chave em branco para mantê-la inalterada.'
              : 'Preencha os dados para criar uma nova chave de API'
          }
          isEditing={!!editingItem}
          loading={isSubmitting}
        />
      </>
    );
  }
);

ApiKeysManagement.displayName = 'ApiKeysManagement';
