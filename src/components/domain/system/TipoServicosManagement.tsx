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
  TipoServico,
  TipoServicoCreateInput,
  SystemEntityFilters,
} from '@/types/system-config';
import {
  fetchTipoServicos,
  createTipoServico,
  updateTipoServico,
  deleteTipoServico,
  toggleTipoServicoStatus,
} from '@/lib/servicos-api';
import { fetchPrecosProfissional } from '@/lib/preco-servico';
import { Button } from '@/components/primitives/button';
import { PrecosProfissionalDialog } from './PrecosProfissionalDialog';

// AI dev note: TipoServicosManagement combina GenericTable + GenericForm
// Demonstra padrão Domain usando componentes Composed reutilizáveis para tipos de serviço

export const TipoServicosManagement: React.FC = () => {
  const [data, setData] = useState<TipoServico[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters] = useState<SystemEntityFilters>({
    page: 1,
    limit: 10,
  });

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TipoServico | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Preço por profissional: quantas exceções cada serviço tem + dialog
  const [excecoesPorServico, setExcecoesPorServico] = useState<
    Record<string, number>
  >({});
  const [servicoPrecos, setServicoPrecos] = useState<TipoServico | null>(null);

  // Form
  const form = useForm<TipoServicoCreateInput>({
    defaultValues: {
      nome: '',
      descricao: '',
      duracao_minutos: 60,
      valor: 0,
      cor: '#3B82F6',
      ativo: true,
    },
  });

  // === DATA LOADING ===
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchTipoServicos(filters);
      if (result.success && result.data) {
        setData(result.data.data);
      } else {
        toast({
          title: 'Erro',
          description: result.error || 'Erro ao carregar tipos de serviço',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Erro',
        description: 'Erro inesperado ao carregar tipos de serviço',
        variant: 'destructive',
      });
    }
    try {
      const precos = await fetchPrecosProfissional();
      const contagem: Record<string, number> = {};
      for (const chave of precos.keys()) {
        const tipoId = chave.split(':')[0];
        contagem[tipoId] = (contagem[tipoId] || 0) + 1;
      }
      setExcecoesPorServico(contagem);
    } catch {
      // Contagem é só informativa
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
      descricao: '',
      duracao_minutos: 60,
      valor: 0,
      cor: '#3B82F6',
      ativo: true,
    };

    form.reset(defaultValues);
    setEditingItem(null);

    // Pequeno delay para garantir que o form seja resetado antes do modal abrir
    setTimeout(() => {
      setIsFormOpen(true);
    }, 50);
  };

  const handleEdit = (item: TipoServico) => {
    // Garantir que todos os valores sejam válidos para evitar React.Children.only error
    const formValues = {
      nome: item.nome || '',
      descricao: item.descricao || '',
      duracao_minutos: item.duracao_minutos || 60,
      valor: parseFloat(item.valor?.toString() || '0'),
      cor: item.cor || '#3B82F6',
      ativo: Boolean(item.ativo),
    };

    form.reset(formValues);
    setEditingItem(item);
    setIsFormOpen(true);
  };

  const handleSubmit = async (formData: TipoServicoCreateInput) => {
    setIsSubmitting(true);

    try {
      let result;

      if (editingItem) {
        // Ao editar, manter ID original
        result = await updateTipoServico({
          ...formData,
          id: editingItem.id,
        });
      } else {
        // Ao criar, novo serviço
        result = await createTipoServico(formData);
      }

      if (result.success) {
        toast({
          title: 'Sucesso',
          description: `Tipo de serviço ${editingItem ? 'atualizado' : 'criado'} com sucesso`,
        });
        setIsFormOpen(false);
        loadData();
      } else {
        toast({
          title: 'Erro',
          description: result.error || 'Erro ao salvar tipo de serviço',
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

  const handleDelete = async (item: TipoServico) => {
    const result = await deleteTipoServico(item.id);

    if (result.success) {
      toast({
        title: 'Sucesso',
        description: 'Tipo de serviço excluído com sucesso',
      });
      loadData();
    } else {
      toast({
        title: 'Erro',
        description: result.error || 'Erro ao excluir tipo de serviço',
        variant: 'destructive',
      });
    }
  };

  const handleToggleStatus = async (item: TipoServico) => {
    const result = await toggleTipoServicoStatus(item.id, !item.ativo);

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
  const columns: GenericTableColumn<TipoServico>[] = [
    {
      key: 'nome',
      label: 'Nome',
      className: 'font-medium',
    },
    {
      key: 'descricao',
      label: 'Descrição',
      render: (item) => item.descricao || '-',
      className: 'text-muted-foreground max-w-xs truncate hidden md:table-cell',
    },
    {
      key: 'duracao_minutos',
      label: 'Duração',
      render: (item) => `${item.duracao_minutos} min`,
      className: 'w-24 text-center hidden md:table-cell',
    },
    {
      key: 'valor',
      label: 'Valor',
      render: (item) =>
        new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        }).format(parseFloat(item.valor?.toString() || '0')),
      className: 'w-32 text-right',
    },
    {
      key: 'precos_profissional',
      label: 'Por profissional',
      render: (item) => {
        const n = excecoesPorServico[item.id] || 0;
        return (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setServicoPrecos(item)}
            title="Definir preço deste serviço por profissional"
          >
            {n === 0 ? 'Mesmo preço' : `${n} com preço próprio`}
          </Button>
        );
      },
      className: 'w-36',
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
      className: 'w-32 hidden md:table-cell',
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
      className: 'w-24',
    },
    {
      key: 'created_at',
      label: 'Criado em',
      render: (item) => new Date(item.created_at).toLocaleDateString('pt-BR'),
      className: 'w-32 text-sm text-muted-foreground hidden md:table-cell',
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
          confirmDeleteTitle={`Excluir o tipo de serviço "${item.nome}"?`}
          confirmDeleteDescription="Esta ação não pode ser desfeita."
        />
      ),
      className: 'w-16',
    },
  ];

  // === FORM FIELDS ===
  const formFields: FormField[] = [
    {
      name: 'nome',
      label: 'Nome',
      type: 'text',
      placeholder: 'Ex: Fisioterapia Respiratória, Avaliação',
      required: true,
    },
    {
      name: 'descricao',
      label: 'Descrição',
      type: 'textarea',
      placeholder: 'Descrição detalhada do serviço oferecido',
    },
    {
      name: 'duracao_minutos',
      label: 'Duração (minutos)',
      type: 'number',
      placeholder: '60',
      required: true,
    },
    {
      name: 'valor',
      label: 'Valor (R$)',
      type: 'number',
      placeholder: '0.00',
      required: true,
    },
    {
      name: 'cor',
      label: 'Cor',
      type: 'color',
      required: true,
    },
  ];

  return (
    <>
      <GenericTable
        title="Tipos de Serviço"
        description="Gerenciar serviços oferecidos pela clínica"
        data={data}
        columns={columns}
        loading={loading}
        onAdd={handleAdd}
        addButtonText="Novo Serviço"
        searchPlaceholder="Buscar por nome ou descrição..."
        emptyMessage="Nenhum tipo de serviço encontrado"
        itemsPerPage={filters.limit}
      />

      <GenericForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleSubmit}
        form={form}
        fields={formFields}
        title={editingItem ? 'Editar Tipo de Serviço' : 'Novo Tipo de Serviço'}
        description={
          editingItem
            ? 'Altere os dados do tipo de serviço'
            : 'Preencha os dados para criar um novo serviço'
        }
        isEditing={!!editingItem}
        loading={isSubmitting}
      />

      <PrecosProfissionalDialog
        servico={servicoPrecos}
        onClose={() => setServicoPrecos(null)}
        onSaved={loadData}
      />
    </>
  );
};

TipoServicosManagement.displayName = 'TipoServicosManagement';
