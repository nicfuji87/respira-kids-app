import React, { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from '@/components/primitives/use-toast';
import {
  GenericTable,
  StatusBadge,
  CRUDActions,
  ContractTemplateEditor,
  type GenericTableColumn,
} from '@/components/composed';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import type { 
  ContractTemplate, 
  ContractTemplateCreateInput,
  SystemEntityFilters 
} from '@/types/system-config';
import {
  fetchContractTemplates,
  createContractTemplate,
  updateContractTemplate,
  deleteContractTemplate,
  toggleContractTemplateStatus,
  createTemplateVersion,
} from '@/lib/contract-templates-api';
import { FileText, Plus, Copy } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

// AI dev note: ContractTemplateManagement combina GenericTable + ContractTemplateEditor
// Gerenciamento completo de templates de contrato com versionamento

export const ContractTemplateManagement: React.FC = () => {
  const { user } = useAuth();
  const [data, setData] = useState<ContractTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters] = useState<SystemEntityFilters>({
    page: 1,
    limit: 10
  });

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ContractTemplate | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form
  const form = useForm<ContractTemplateCreateInput>({
    defaultValues: {
      nome: '',
      descricao: '',
      conteudo_template: '',
      variaveis_disponiveis: [],
      versao: 1,
      ativo: true
    }
  });

  // === FETCH DATA ===
  const loadData = useCallback(async () => {
    setLoading(true);
    const result = await fetchContractTemplates(filters);
    
    if (result.success && result.data) {
      setData(result.data.data);
    } else {
      toast({
        title: 'Erro',
        description: result.error || 'Erro ao carregar modelos de contrato',
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
    const defaultValues = {
      nome: '',
      descricao: '',
      conteudo_template: '',
      variaveis_disponiveis: [],
      versao: 1,
      ativo: true
    };
    
    form.reset(defaultValues);
    setEditingItem(null);
    setIsFormOpen(true);
  };

  const handleEdit = (item: ContractTemplate) => {
    const editValues = {
      nome: item.nome || '',
      descricao: item.descricao || '',
      conteudo_template: item.conteudo_template || '',
      variaveis_disponiveis: item.variaveis_disponiveis || [],
      versao: item.versao || 1,
      ativo: item.ativo ?? true
    };
    
    form.reset(editValues);
    setEditingItem(item);
    setIsFormOpen(true);
  };

  const handleSubmit = async (data: ContractTemplateCreateInput) => {
    if (!user?.pessoa?.id) {
      toast({
        title: 'Erro',
        description: 'Usuário não encontrado',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      let result;

      if (editingItem) {
        // Edição
        result = await updateContractTemplate({
          id: editingItem.id,
          ...data
        }, user.pessoa.id);
      } else {
        // Criação - gerar código automaticamente
        result = await createContractTemplate(data, user.pessoa.id);
      }

      if (result.success) {
        toast({
          title: 'Sucesso',
          description: editingItem ? 'Modelo atualizado com sucesso' : 'Modelo criado com sucesso',
        });
        setIsFormOpen(false);
        setEditingItem(null);
        form.reset();
        loadData();
      } else {
        toast({
          title: 'Erro',
          description: result.error || 'Erro ao salvar modelo de contrato',
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

  const handleDelete = async (item: ContractTemplate) => {
    if (!confirm(`Tem certeza que deseja excluir "${item.nome}"?`)) {
      return;
    }

    const result = await deleteContractTemplate(item.id, user?.pessoa?.id);
    
    if (result.success) {
      toast({
        title: 'Sucesso',
        description: 'Modelo excluído com sucesso',
      });
      loadData();
    } else {
      toast({
        title: 'Erro',
        description: result.error || 'Erro ao excluir modelo',
        variant: 'destructive',
      });
    }
  };

  const handleToggleStatus = async (item: ContractTemplate) => {
    const result = await toggleContractTemplateStatus(item.id, !item.ativo, user?.pessoa?.id);
    
    if (result.success) {
      toast({
        title: 'Sucesso',
        description: `Modelo ${!item.ativo ? 'ativado' : 'desativado'} com sucesso`,
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

  const handleCreateVersion = async (item: ContractTemplate) => {
    if (!user?.pessoa?.id) {
      toast({
        title: 'Erro',
        description: 'Usuário não encontrado',
        variant: 'destructive',
      });
      return;
    }

    const result = await createTemplateVersion(
      item.id,
      {
        nome: `${item.nome} (v${item.versao + 1})`,
        descricao: item.descricao,
        conteudo_template: item.conteudo_template,
        variaveis_disponiveis: item.variaveis_disponiveis,
        ativo: true
      },
      user.pessoa.id
    );

    if (result.success) {
      toast({
        title: 'Sucesso',
        description: 'Nova versão criada com sucesso',
      });
      loadData();
    } else {
      toast({
        title: 'Erro',
        description: result.error || 'Erro ao criar nova versão',
        variant: 'destructive',
      });
    }
  };

  // === TABLE CONFIGURATION ===
  const columns: GenericTableColumn<ContractTemplate>[] = [
    {
      key: 'nome',
      label: 'Nome',
      render: (item) => (
        <div className="flex flex-col">
          <span className="font-medium">{item.nome}</span>
          {item.descricao && (
            <span className="text-sm text-muted-foreground line-clamp-1">
              {item.descricao}
            </span>
          )}
        </div>
      ),
      className: 'min-w-[200px]'
    },
    {
      key: 'versao',
      label: 'Versão',
      render: (item) => (
        <Badge variant="outline" className="w-fit">
          v{item.versao}
        </Badge>
      ),
      className: 'w-20'
    },
    {
      key: 'variaveis_disponiveis',
      label: 'Variáveis',
      render: (item) => (
        <Badge variant="secondary" className="w-fit">
          {Array.isArray(item.variaveis_disponiveis) ? item.variaveis_disponiveis.length : 0}
        </Badge>
      ),
      className: 'w-24'
    },
    {
      key: 'ativo',
      label: 'Status',
      render: (item) => (
        <button
          onClick={() => handleToggleStatus(item)}
          className="cursor-pointer"
          title={`Clique para ${item.ativo ? 'desativar' : 'ativar'}`}
        >
          <StatusBadge ativo={item.ativo} />
        </button>
      ),
      className: 'w-20'
    },
    {
      key: 'created_at',
      label: 'Criado em',
      render: (item) => (
        <div className="text-sm text-muted-foreground">
          {new Date(item.created_at).toLocaleDateString('pt-BR')}
        </div>
      ),
      className: 'w-32'
    },
    {
      key: 'actions',
      label: 'Ações',
      render: (item) => (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCreateVersion(item)}
            className="flex items-center gap-1"
            title="Criar nova versão"
          >
            <Copy className="h-3 w-3" />
            <span className="hidden sm:inline">Versionar</span>
          </Button>
          <CRUDActions
            onEdit={() => handleEdit(item)}
            onDelete={() => handleDelete(item)}
            onToggleStatus={() => handleToggleStatus(item)}
            canToggleStatus={true}
          />
        </div>
      ),
      className: 'w-40'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-2xl font-bold">Modelos de Contrato</h2>
            <p className="text-muted-foreground">
              Gerencie modelos de contrato com variáveis dinâmicas
            </p>
          </div>
        </div>
        <Button onClick={handleAdd} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Novo Modelo
        </Button>
      </div>

      {/* Table */}
      <GenericTable
        data={data}
        columns={columns}
        loading={loading}
        onAdd={handleAdd}
        searchPlaceholder="Buscar por nome ou descrição..."
        itemsPerPage={10}
      />

      {/* Modal */}
      <ContractTemplateEditor
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingItem(null);
          form.reset();
        }}
        onSubmit={handleSubmit}
        form={form}
        isEditing={!!editingItem}
        loading={isSubmitting}
      />
    </div>
  );
};

ContractTemplateManagement.displayName = 'ContractTemplateManagement'; 