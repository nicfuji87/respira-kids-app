import React, { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from '@/components/primitives/use-toast';
import {
  GenericTable,
  GenericForm,
  StatusBadge,
  CRUDActions,
  type GenericTableColumn,
  type FormField,
} from '@/components/composed';
import type { 
  PessoaTipo, 
  PessoaTipoCreateInput,
  SystemEntityFilters 
} from '@/types/system-config';
import {
  fetchPessoaTipos,
  createPessoaTipo,
  updatePessoaTipo,
  deletePessoaTipo,
  togglePessoaTipoStatus,
} from '@/lib/pessoa-tipos-api';

// AI dev note: PersonTypesManagement combina GenericTable + GenericForm
// Demonstra padrão Domain usando componentes Composed reutilizáveis

export const PersonTypesManagement: React.FC = () => {
  const [data, setData] = useState<PessoaTipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters] = useState<SystemEntityFilters>({
    page: 1,
    limit: 10
  });

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PessoaTipo | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form
  const form = useForm<PessoaTipoCreateInput>({
    defaultValues: {
      codigo: '',
      nome: '',
      descricao: '',
      ativo: true
    }
  });

  // === FETCH DATA ===
  const loadData = useCallback(async () => {
    setLoading(true);
    const result = await fetchPessoaTipos(filters);
    
    if (result.success && result.data) {
      setData(result.data.data);
      // setTotal(result.data.total); // This line was removed as per the edit hint
    } else {
      toast({
        title: 'Erro',
        description: result.error || 'Erro ao carregar tipos de pessoa',
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
      codigo: '',
      nome: '',
      descricao: '',
      ativo: true
    };
    
    form.reset(defaultValues);
    setEditingItem(null);
    
    // Pequeno delay para garantir que o form seja resetado antes do modal abrir
    setTimeout(() => {
      setIsFormOpen(true);
    }, 50);
  };

  const handleEdit = (item: PessoaTipo) => {
    // Garantir que todos os valores sejam válidos para evitar React.Children.only error
    const formValues = {
      codigo: item.codigo || '',
      nome: item.nome || '',
      descricao: item.descricao || '',
      ativo: Boolean(item.ativo) // Garantir que seja boolean
    };
    
    form.reset(formValues);
    setEditingItem(item);
    setIsFormOpen(true);
  };

  const handleSubmit = async (formData: PessoaTipoCreateInput) => {
    setIsSubmitting(true);
    
    try {
      let result;
      
      if (editingItem) {
        result = await updatePessoaTipo({
          ...formData,
          id: editingItem.id
        });
      } else {
        result = await createPessoaTipo(formData);
      }

      if (result.success) {
        toast({
          title: 'Sucesso',
          description: `Tipo de pessoa ${editingItem ? 'atualizado' : 'criado'} com sucesso`,
        });
        setIsFormOpen(false);
        loadData();
      } else {
        toast({
          title: 'Erro',
          description: result.error || 'Erro ao salvar tipo de pessoa',
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

  const handleDelete = async (item: PessoaTipo) => {
    if (!confirm(`Tem certeza que deseja excluir "${item.nome}"?`)) {
      return;
    }

    const result = await deletePessoaTipo(item.id);
    
    if (result.success) {
      toast({
        title: 'Sucesso',
        description: 'Tipo de pessoa excluído com sucesso',
      });
      loadData();
    } else {
      toast({
        title: 'Erro',
        description: result.error || 'Erro ao excluir tipo de pessoa',
        variant: 'destructive',
      });
    }
  };

  const handleToggleStatus = async (item: PessoaTipo) => {
    const result = await togglePessoaTipoStatus(item.id, !item.ativo);
    
    if (result.success) {
      toast({
        title: 'Sucesso',
        description: `Status alterado para ${!item.ativo ? 'ativo' : 'inativo'}`,
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
  const columns: GenericTableColumn<PessoaTipo>[] = [
    {
      key: 'codigo',
      label: 'Código',
      className: 'w-32'
    },
    {
      key: 'nome',
      label: 'Nome',
      className: 'font-medium'
    },
    {
      key: 'descricao',
      label: 'Descrição',
      render: (item) => item.descricao || '-',
      className: 'text-muted-foreground'
    },
    {
      key: 'ativo',
      label: 'Status',
      render: (item) => (
        <button
          onClick={() => handleToggleStatus(item)}
          className="cursor-pointer hover:opacity-80 transition-opacity"
          title={`Clique para ${item.ativo ? 'desativar' : 'ativar'}`}
        >
          <StatusBadge ativo={item.ativo} />
        </button>
      ),
      className: 'w-24'
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
          ativo={item.ativo}
          canToggleStatus={false}
        />
      ),
      className: 'w-16'
    }
  ];

  // === FORM FIELDS ===
  const formFields: FormField[] = [
    {
      name: 'codigo',
      label: 'Código',
      type: 'text',
      placeholder: 'Ex: PACIENTE, PROFISSIONAL',
      required: true,
      description: 'Código único para identificar o tipo'
    },
    {
      name: 'nome',
      label: 'Nome',
      type: 'text',
      placeholder: 'Ex: Paciente, Profissional, Responsável',
      required: true
    },
    {
      name: 'descricao',
      label: 'Descrição',
      type: 'textarea',
      placeholder: 'Descrição opcional do tipo de pessoa'
    },
    {
      name: 'ativo',
      label: 'Status',
      type: 'switch'
    }
  ];

  return (
    <>
      <GenericTable
        title="Tipos de Pessoa"
        description="Gerenciar categorias de pessoas no sistema"
        data={data}
        columns={columns}
        loading={loading}
        onAdd={handleAdd}
        addButtonText="Novo Tipo"
        searchPlaceholder="Buscar por código ou nome..."
        emptyMessage="Nenhum tipo de pessoa encontrado"
        itemsPerPage={filters.limit}
      />

      <GenericForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleSubmit}
        form={form}
        fields={formFields}
        title={editingItem ? 'Editar Tipo de Pessoa' : 'Novo Tipo de Pessoa'}
        description={
          editingItem 
            ? 'Altere os dados do tipo de pessoa' 
            : 'Preencha os dados para criar um novo tipo'
        }
        isEditing={!!editingItem}
        loading={isSubmitting}
      />
    </>
  );
};

PersonTypesManagement.displayName = 'PersonTypesManagement'; 