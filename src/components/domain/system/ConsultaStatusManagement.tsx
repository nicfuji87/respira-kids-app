import React, { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from '@/components/primitives/use-toast';
import {
  GenericTable,
  GenericForm,
  CRUDActions,
  type GenericTableColumn,
  type FormField,
} from '@/components/composed';
import type { 
  ConsultaStatus, 
  ConsultaStatusCreateInput,
  SystemEntityFilters 
} from '@/types/system-config';
import {
  fetchConsultaStatus,
  createConsultaStatus,
  updateConsultaStatus,
  deleteConsultaStatus,
} from '@/lib/consulta-status-api';

// AI dev note: ConsultaStatusManagement combina GenericTable + GenericForm
// Demonstra padrão Domain usando componentes Composed reutilizáveis para status de consulta

export const ConsultaStatusManagement: React.FC = () => {
  const [data, setData] = useState<ConsultaStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters] = useState<SystemEntityFilters>({
    page: 1,
    limit: 10
  });

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ConsultaStatus | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form
  const form = useForm<ConsultaStatusCreateInput>({
    defaultValues: {
      descricao: '',
      cor: '#3B82F6'
    }
  });

  // === DATA LOADING ===
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchConsultaStatus(filters);
      if (result.success && result.data) {
        setData(result.data.data);
      } else {
        toast({
          title: 'Erro',
          description: result.error || 'Erro ao carregar status de consulta',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Erro',
        description: 'Erro inesperado ao carregar status de consulta',
        variant: 'destructive',
      });
    }
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // === FORM HANDLERS ===
  const handleAdd = () => {
    // Garantir que o form seja resetado corretamente
    const defaultValues = {
      descricao: '',
      cor: '#3B82F6'
    };
    
    form.reset(defaultValues);
    setEditingItem(null);
    
    // Pequeno delay para garantir que o form seja resetado antes do modal abrir
    setTimeout(() => {
      setIsFormOpen(true);
    }, 50);
  };

  const handleEdit = (item: ConsultaStatus) => {
    // Garantir que todos os valores sejam válidos para evitar React.Children.only error
    const formValues = {
      descricao: item.descricao || '',
      cor: item.cor || '#3B82F6'
    };
    
    form.reset(formValues);
    setEditingItem(item);
    setIsFormOpen(true);
  };

  const handleSubmit = async (formData: ConsultaStatusCreateInput) => {
    setIsSubmitting(true);
    
    try {
      let result;
      
      if (editingItem) {
        // Ao editar, preservar código original
        result = await updateConsultaStatus({
          ...formData,
          id: editingItem.id,
          codigo: editingItem.codigo // Preservar código original
        });
      } else {
        // Ao criar, gerar código automático baseado na descrição
        const codigo = formData.descricao
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // Remove acentos
          .replace(/[^a-z0-9]/g, '_')      // Substitui caracteres especiais por _
          .replace(/_+/g, '_')             // Remove múltiplos _ consecutivos
          .replace(/^_|_$/g, '');          // Remove _ do início e fim
          
        result = await createConsultaStatus({
          ...formData,
          codigo
        });
      }

      if (result.success) {
        toast({
          title: 'Sucesso',
          description: `Status de consulta ${editingItem ? 'atualizado' : 'criado'} com sucesso`,
        });
        setIsFormOpen(false);
        loadData();
      } else {
        toast({
          title: 'Erro',
          description: result.error || 'Erro ao salvar status de consulta',
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

  const handleDelete = async (item: ConsultaStatus) => {
    if (!confirm(`Tem certeza que deseja excluir "${item.descricao}"?`)) {
      return;
    }

    const result = await deleteConsultaStatus(item.id);
    
    if (result.success) {
      toast({
        title: 'Sucesso',
        description: 'Status de consulta excluído com sucesso',
      });
      loadData();
    } else {
      toast({
        title: 'Erro',
        description: result.error || 'Erro ao excluir status de consulta',
        variant: 'destructive',
      });
    }
  };

  // === TABLE CONFIGURATION ===
  const columns: GenericTableColumn<ConsultaStatus>[] = [
    {
      key: 'codigo',
      label: 'Código',
      className: 'w-32'
    },
    {
      key: 'descricao',
      label: 'Descrição',
      className: 'font-medium'
    },
    {
      key: 'cor',
      label: 'Cor',
      render: (item) => (
        <div className="flex items-center gap-2">
          <div 
            className="w-4 h-4 rounded-full border border-gray-300"
            style={{ backgroundColor: item.cor }}
          />
          <code className="text-xs text-muted-foreground">{item.cor}</code>
        </div>
      ),
      className: 'w-32'
    },
    {
      key: 'created_at',
      label: 'Criado em',
      render: (item) => new Date(item.created_at).toLocaleDateString('pt-BR'),
      className: 'w-32 text-sm text-muted-foreground'
    },
    {
      key: 'actions',
      label: 'Ações',
      render: (item) => (
        <CRUDActions
          onEdit={() => handleEdit(item)}
          onDelete={() => handleDelete(item)}
          canToggleStatus={false}
        />
      ),
      className: 'w-16'
    }
  ];

  // === FORM FIELDS ===
  const formFields: FormField[] = [
    {
      name: 'descricao',
      label: 'Descrição',
      type: 'text',
      placeholder: 'Ex: Agendado, Confirmado, Finalizado',
      required: true
    },
    {
      name: 'cor',
      label: 'Cor',
      type: 'color',
      required: true
    }
  ];

  return (
    <>
      <GenericTable
        title="Status de Consulta"
        description="Gerenciar status disponíveis para consultas"
        data={data}
        columns={columns}
        loading={loading}
        onAdd={handleAdd}
        addButtonText="Novo Status"
        searchPlaceholder="Buscar por código ou descrição..."
        emptyMessage="Nenhum status de consulta encontrado"
        itemsPerPage={filters.limit}
      />

      <GenericForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleSubmit}
        form={form}
        fields={formFields}
        title={editingItem ? 'Editar Status de Consulta' : 'Novo Status de Consulta'}
        description={
          editingItem 
            ? 'Altere os dados do status de consulta' 
            : 'Preencha os dados para criar um novo status'
        }
        isEditing={!!editingItem}
        loading={isSubmitting}
      />
    </>
  );
};

ConsultaStatusManagement.displayName = 'ConsultaStatusManagement'; 