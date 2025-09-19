import React, { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from '@/components/primitives/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  GenericTable,
  GenericForm,
  StatusBadge,
  CRUDActions,
  type GenericTableColumn,
  type FormField,
} from '@/components/composed';
import {
  fetchComissoes,
  createComissao,
  updateComissao,
  deleteComissao,
  toggleComissaoStatus,
  fetchProfissionaisParaComissao,
  fetchTiposServicoParaComissao,
  type ComissaoProfissional,
  type ComissaoCreateInput,
  type ComissaoFilters,
} from '@/lib/comissao-api';

// AI dev note: ComissaoManagement gerencia comissões de profissionais por tipo de serviço
// Permite admin configurar valores fixos ou percentuais que profissionais recebem

export const ComissaoManagement: React.FC = () => {
  const { user } = useAuth();
  const [data, setData] = useState<ComissaoProfissional[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters] = useState<ComissaoFilters>({
    page: 1,
    limit: 10,
  });

  // Options for selects
  const [profissionais, setProfissionais] = useState<
    Array<{ id: string; nome: string }>
  >([]);
  const [tiposServico, setTiposServico] = useState<
    Array<{ id: string; nome: string }>
  >([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ComissaoProfissional | null>(
    null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form
  const form = useForm<ComissaoCreateInput>({
    defaultValues: {
      id_profissional: '',
      id_servico: '',
      tipo_recebimento: 'percentual',
      valor_fixo: 0,
      valor_percentual: 50,
    },
  });

  // Watcher para tipo_recebimento
  const tipoRecebimento = form.watch('tipo_recebimento');

  // === DATA LOADING ===
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchComissoes(filters);
      if (result.success && result.data) {
        setData(result.data);
      } else {
        toast({
          title: 'Erro',
          description: result.error || 'Erro ao carregar comissões',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Erro',
        description: 'Erro inesperado ao carregar comissões',
        variant: 'destructive',
      });
    }
    setLoading(false);
  }, [filters]);

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true);
    try {
      const [profResult, servicosResult] = await Promise.all([
        fetchProfissionaisParaComissao(),
        fetchTiposServicoParaComissao(),
      ]);

      if (profResult.success && profResult.data) {
        setProfissionais(profResult.data);
      }

      if (servicosResult.success && servicosResult.data) {
        setTiposServico(servicosResult.data);
      }
    } catch (error) {
      console.error('Erro ao carregar opções:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar opções do formulário',
        variant: 'destructive',
      });
    }
    setLoadingOptions(false);
  }, []);

  useEffect(() => {
    loadData();
    loadOptions();
  }, [loadData, loadOptions]);

  // === FORM HANDLERS ===
  const handleAdd = () => {
    const defaultValues = {
      id_profissional: '',
      id_servico: '',
      tipo_recebimento: 'percentual' as const,
      valor_fixo: 0,
      valor_percentual: 50,
    };

    form.reset(defaultValues);
    setEditingItem(null);

    setTimeout(() => {
      setIsFormOpen(true);
    }, 50);
  };

  const handleEdit = (item: ComissaoProfissional) => {
    const formValues = {
      id_profissional: item.id_profissional || '',
      id_servico: item.id_servico || '',
      tipo_recebimento: item.tipo_recebimento as 'fixo' | 'percentual',
      valor_fixo: item.valor_fixo ? parseFloat(item.valor_fixo.toString()) : 0,
      valor_percentual: item.valor_percentual
        ? parseFloat(item.valor_percentual.toString())
        : 0,
    };

    form.reset(formValues);
    setEditingItem(item);
    setIsFormOpen(true);
  };

  const handleSubmit = async (formData: ComissaoCreateInput) => {
    setIsSubmitting(true);

    try {
      let result;
      const userId = user?.pessoa?.id || undefined;

      if (editingItem) {
        result = await updateComissao(
          {
            ...formData,
            id: editingItem.id,
          },
          userId
        );
      } else {
        result = await createComissao(formData, userId);
      }

      if (result.success) {
        toast({
          title: 'Sucesso',
          description: `Comissão ${editingItem ? 'atualizada' : 'criada'} com sucesso`,
        });
        setIsFormOpen(false);
        loadData();
      } else {
        toast({
          title: 'Erro',
          description: result.error || 'Erro ao salvar comissão',
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

  const handleDelete = async (item: ComissaoProfissional) => {
    if (
      !confirm(
        `Tem certeza que deseja excluir a comissão de "${item.profissional_nome}" para "${item.servico_nome}"?`
      )
    ) {
      return;
    }

    const userId = user?.pessoa?.id || undefined;
    const result = await deleteComissao(item.id, userId);

    if (result.success) {
      toast({
        title: 'Sucesso',
        description: 'Comissão excluída com sucesso',
      });
      loadData();
    } else {
      toast({
        title: 'Erro',
        description: result.error || 'Erro ao excluir comissão',
        variant: 'destructive',
      });
    }
  };

  const handleToggleStatus = async (item: ComissaoProfissional) => {
    const userId = user?.pessoa?.id || undefined;
    const result = await toggleComissaoStatus(item.id, !item.ativo, userId);

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
  const columns: GenericTableColumn<ComissaoProfissional>[] = [
    {
      key: 'profissional_nome',
      label: 'Profissional',
      className: 'font-medium',
    },
    {
      key: 'servico_nome',
      label: 'Serviço',
      className: 'font-medium',
    },
    {
      key: 'tipo_recebimento',
      label: 'Tipo',
      render: (item) => (
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            item.tipo_recebimento === 'fixo'
              ? 'bg-blue-100 text-blue-800'
              : 'bg-green-100 text-green-800'
          }`}
        >
          {item.tipo_recebimento === 'fixo' ? 'Valor Fixo' : 'Percentual'}
        </span>
      ),
      className: 'w-32',
    },
    {
      key: 'valor',
      label: 'Valor',
      render: (item) => {
        if (item.tipo_recebimento === 'fixo' && item.valor_fixo) {
          return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
          }).format(parseFloat(item.valor_fixo.toString()));
        }
        if (item.tipo_recebimento === 'percentual' && item.valor_percentual) {
          return `${parseFloat(item.valor_percentual.toString())}%`;
        }
        return '-';
      },
      className: 'w-32 text-right',
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
      className: 'w-32 text-sm text-muted-foreground',
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
      className: 'w-16',
    },
  ];

  // === FORM FIELDS ===
  const formFields: FormField[] = [
    {
      name: 'id_profissional',
      label: 'Profissional',
      type: 'select',
      required: true,
      options: profissionais.map((p) => ({
        label: p.nome,
        value: p.id,
      })),
      disabled: loadingOptions,
      placeholder: 'Selecione o profissional',
    },
    {
      name: 'id_servico',
      label: 'Tipo de Serviço',
      type: 'select',
      required: true,
      options: tiposServico.map((s) => ({
        label: s.nome,
        value: s.id,
      })),
      disabled: loadingOptions,
      placeholder: 'Selecione o tipo de serviço',
    },
    {
      name: 'tipo_recebimento',
      label: 'Tipo de Comissão',
      type: 'select',
      required: true,
      options: [
        { label: 'Valor Fixo', value: 'fixo' },
        { label: 'Percentual', value: 'percentual' },
      ],
    },
    ...(tipoRecebimento === 'fixo'
      ? [
          {
            name: 'valor_fixo' as const,
            label: 'Valor Fixo (R$)',
            type: 'number' as const,
            placeholder: '0.00',
            required: true,
          },
        ]
      : [
          {
            name: 'valor_percentual' as const,
            label: 'Percentual (%)',
            type: 'number' as const,
            placeholder: '50',
            required: true,
          },
        ]),
  ];

  return (
    <>
      <GenericTable
        title="Comissões de Profissionais"
        description="Configurar comissões por profissional e tipo de serviço"
        data={data}
        columns={columns}
        loading={loading}
        onAdd={handleAdd}
        addButtonText="Nova Comissão"
        searchPlaceholder="Buscar por profissional ou serviço..."
        emptyMessage="Nenhuma comissão encontrada"
        itemsPerPage={filters.limit}
      />

      <GenericForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleSubmit}
        form={form}
        fields={formFields}
        title={editingItem ? 'Editar Comissão' : 'Nova Comissão'}
        description={
          editingItem
            ? 'Altere os dados da comissão'
            : 'Configure a comissão para um profissional e tipo de serviço'
        }
        isEditing={!!editingItem}
        loading={isSubmitting}
      />
    </>
  );
};
