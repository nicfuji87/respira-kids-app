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
  LocalAtendimento, 
  LocalAtendimentoCreateInput,
  SystemEntityFilters 
} from '@/types/system-config';
import {
  fetchLocaisAtendimento,
  createLocalAtendimento,
  updateLocalAtendimento,
  deleteLocalAtendimento,
  toggleLocalAtendimentoStatus,
} from '@/lib/locais-api';

// AI dev note: LocaisAtendimentoManagement combina GenericTable + GenericForm
// Demonstra padrão Domain usando componentes Composed reutilizáveis para locais de atendimento

export const LocaisAtendimentoManagement: React.FC = () => {
  const [data, setData] = useState<LocalAtendimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters] = useState<SystemEntityFilters>({
    page: 1,
    limit: 10
  });

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LocalAtendimento | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form
  const form = useForm<LocalAtendimentoCreateInput>({
    defaultValues: {
      nome: '',
      tipo_local: 'clinica',
      numero_endereco: '',
      complemento_endereco: '',
      ativo: true
    }
  });

  // === DATA LOADING ===
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchLocaisAtendimento(filters);
      if (result.success && result.data) {
        setData(result.data.data);
      } else {
        toast({
          title: 'Erro',
          description: result.error || 'Erro ao carregar locais de atendimento',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro inesperado ao carregar locais de atendimento',
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
      nome: '',
      tipo_local: 'clinica' as const,
      numero_endereco: '',
      complemento_endereco: '',
      ativo: true
    };
    
    form.reset(defaultValues);
    setEditingItem(null);
    
    // Pequeno delay para garantir que o form seja resetado antes do modal abrir
    setTimeout(() => {
      setIsFormOpen(true);
    }, 50);
  };

  const handleEdit = (item: LocalAtendimento) => {
    // Garantir que todos os valores sejam válidos para evitar React.Children.only error
    const formValues = {
      nome: item.nome || '',
      tipo_local: item.tipo_local || 'clinica' as const,
      numero_endereco: item.numero_endereco || '',
      complemento_endereco: item.complemento_endereco || '',
      ativo: Boolean(item.ativo)
    };
    
    form.reset(formValues);
    setEditingItem(item);
    setIsFormOpen(true);
  };

  const handleSubmit = async (formData: LocalAtendimentoCreateInput) => {
    setIsSubmitting(true);
    
    try {
      let result;
      
      if (editingItem) {
        // Ao editar, manter ID original
        result = await updateLocalAtendimento({
          ...formData,
          id: editingItem.id
        });
      } else {
        // Ao criar, novo local
        result = await createLocalAtendimento(formData);
      }

      if (result.success) {
        toast({
          title: 'Sucesso',
          description: `Local de atendimento ${editingItem ? 'atualizado' : 'criado'} com sucesso`,
        });
        setIsFormOpen(false);
        loadData();
      } else {
        toast({
          title: 'Erro',
          description: result.error || 'Erro ao salvar local de atendimento',
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

  const handleDelete = async (item: LocalAtendimento) => {
    if (!confirm(`Tem certeza que deseja excluir "${item.nome}"?`)) {
      return;
    }

    const result = await deleteLocalAtendimento(item.id);
    
    if (result.success) {
      toast({
        title: 'Sucesso',
        description: 'Local de atendimento excluído com sucesso',
      });
      loadData();
    } else {
      toast({
        title: 'Erro',
        description: result.error || 'Erro ao excluir local de atendimento',
        variant: 'destructive',
      });
    }
  };

  const handleToggleStatus = async (item: LocalAtendimento) => {
    const result = await toggleLocalAtendimentoStatus(item.id, !item.ativo);
    
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

  // === HELPER FUNCTIONS ===
  const getTipoLocalLabel = (tipo: string) => {
    const labels = {
      'clinica': 'Clínica',
      'domiciliar': 'Domiciliar',
      'externa': 'Externa'
    };
    return labels[tipo as keyof typeof labels] || tipo;
  };

  const getTipoLocalBadgeColor = (tipo: string) => {
    const colors = {
      'clinica': 'bg-blue-100 text-blue-800',
      'domiciliar': 'bg-green-100 text-green-800',
      'externa': 'bg-orange-100 text-orange-800'
    };
    return colors[tipo as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  // === TABLE CONFIGURATION ===
  const columns: GenericTableColumn<LocalAtendimento>[] = [
    {
      key: 'nome',
      label: 'Nome',
      className: 'font-medium'
    },
    {
      key: 'tipo_local',
      label: 'Tipo',
      render: (item) => (
        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getTipoLocalBadgeColor(item.tipo_local)}`}>
          {getTipoLocalLabel(item.tipo_local)}
        </span>
      ),
      className: 'w-32'
    },
    {
      key: 'endereco',
      label: 'Endereço',
      render: (item) => {
        // Se tem endereço cadastrado, mostrar o endereço completo
        if (item.endereco) {
          const enderecoCompleto = [
            item.endereco.logradouro,
            item.numero_endereco,
            item.endereco.bairro,
            item.endereco.cidade,
            item.endereco.estado
          ].filter(Boolean).join(', ');
          
          return enderecoCompleto || '-';
        }
        
        // Fallback para número e complemento apenas (casos antigos)
        const enderecoParts = [
          item.numero_endereco,
          item.complemento_endereco
        ].filter(Boolean);
        return enderecoParts.length > 0 ? enderecoParts.join(', ') : '-';
      },
      className: 'text-muted-foreground max-w-xs truncate'
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
      name: 'nome',
      label: 'Nome',
      type: 'text',
      placeholder: 'Ex: Clínica - Sala 1, Atendimento Domiciliar',
      required: true
    },
    {
      name: 'tipo_local',
      label: 'Tipo de Local',
      type: 'select',
      required: true,
      options: [
        { value: 'clinica', label: 'Clínica' },
        { value: 'domiciliar', label: 'Domiciliar' },
        { value: 'externa', label: 'Externa' }
      ]
    },
    {
      name: 'numero_endereco',
      label: 'Número/Endereço',
      type: 'text',
      placeholder: 'Ex: 311, Rua das Flores 123'
    },
    {
      name: 'complemento_endereco',
      label: 'Complemento',
      type: 'text',
      placeholder: 'Ex: Bloco A, Apt 205, Sala 3'
    }
  ];

  return (
    <>
      <GenericTable
        title="Locais de Atendimento"
        description="Gerenciar locais onde os atendimentos são realizados"
        data={data}
        columns={columns}
        loading={loading}
        onAdd={handleAdd}
        addButtonText="Novo Local"
        searchPlaceholder="Buscar por nome ou tipo..."
        emptyMessage="Nenhum local de atendimento encontrado"
        itemsPerPage={filters.limit}
      />

      <GenericForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleSubmit}
        form={form}
        fields={formFields}
        title={editingItem ? 'Editar Local de Atendimento' : 'Novo Local de Atendimento'}
        description={
          editingItem 
            ? 'Altere os dados do local de atendimento' 
            : 'Preencha os dados para criar um novo local'
        }
        isEditing={!!editingItem}
        loading={isSubmitting}
      />
    </>
  );
};

LocaisAtendimentoManagement.displayName = 'LocaisAtendimentoManagement'; 