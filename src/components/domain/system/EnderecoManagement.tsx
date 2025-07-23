import React, { useState, useEffect, useCallback } from 'react';
import { toast } from '@/components/primitives/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/primitives/dialog';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import { MapPin } from 'lucide-react';
import {
  GenericTable,
  CRUDActions,
  CepSearch,
  type GenericTableColumn,
} from '@/components/composed';
import type { 
  Endereco, 
  EnderecoCreateInput,
  SystemEntityFilters 
} from '@/types/system-config';
import type { EnderecoViaCepData } from '@/lib/enderecos-api';
import {
  fetchEnderecos,
  createEndereco,
  updateEndereco,
  deleteEndereco,
} from '@/lib/enderecos-api';

// AI dev note: EnderecoManagement combina GenericTable + CepSearch + formulário customizado
// Demonstra padrão Domain com componente Composed especializado para CEP

export const EnderecoManagement: React.FC = () => {
  const [data, setData] = useState<Endereco[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters] = useState<SystemEntityFilters>({
    page: 1,
    limit: 10
  });

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Endereco | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form data
  const [formData, setFormData] = useState<EnderecoCreateInput>({
    cep: '',
    logradouro: '',
    bairro: '',
    cidade: '',
    estado: ''
  });

  // === DATA LOADING ===
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchEnderecos(filters);
      if (result.success && result.data) {
        setData(result.data.data);
      } else {
        toast({
          title: 'Erro',
          description: result.error || 'Erro ao carregar endereços',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Erro',
        description: 'Erro inesperado ao carregar endereços',
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
    setFormData({
      cep: '',
      logradouro: '',
      bairro: '',
      cidade: '',
      estado: ''
    });
    setEditingItem(null);
    setIsFormOpen(true);
  };

  const handleEdit = (item: Endereco) => {
    setFormData({
      cep: item.cep,
      logradouro: item.logradouro,
      bairro: item.bairro,
      cidade: item.cidade,
      estado: item.estado
    });
    setEditingItem(item);
    setIsFormOpen(true);
  };

  const handleAddressFound = (address: EnderecoViaCepData) => {
    setFormData({
      cep: address.cep,
      logradouro: address.logradouro,
      bairro: address.bairro,
      cidade: address.cidade,
      estado: address.estado
    });
  };

  const handleInputChange = (field: keyof EnderecoCreateInput, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validação básica
    if (!formData.cep || !formData.logradouro || !formData.bairro || !formData.cidade || !formData.estado) {
      toast({
        title: 'Erro',
        description: 'Todos os campos são obrigatórios',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    
    try {
      let result;
      
      if (editingItem) {
        // Ao editar, manter ID original
        result = await updateEndereco({
          ...formData,
          id: editingItem.id
        });
      } else {
        // Ao criar, novo endereço
        result = await createEndereco(formData);
      }

      if (result.success) {
        toast({
          title: 'Sucesso',
          description: `Endereço ${editingItem ? 'atualizado' : 'criado'} com sucesso`,
        });
        setIsFormOpen(false);
        loadData();
      } else {
        toast({
          title: 'Erro',
          description: result.error || 'Erro ao salvar endereço',
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

  const handleDelete = async (item: Endereco) => {
    if (!confirm(`Tem certeza que deseja excluir o endereço "${item.logradouro}, ${item.cidade}"?`)) {
      return;
    }

    const result = await deleteEndereco(item.id);
    
    if (result.success) {
      toast({
        title: 'Sucesso',
        description: 'Endereço excluído com sucesso',
      });
      loadData();
    } else {
      toast({
        title: 'Erro',
        description: result.error || 'Erro ao excluir endereço',
        variant: 'destructive',
      });
    }
  };

  // === TABLE CONFIGURATION ===
  const columns: GenericTableColumn<Endereco>[] = [
    {
      key: 'cep',
      label: 'CEP',
      className: 'font-medium w-24'
    },
    {
      key: 'logradouro',
      label: 'Logradouro',
      className: 'font-medium'
    },
    {
      key: 'bairro',
      label: 'Bairro',
      className: 'text-muted-foreground'
    },
    {
      key: 'cidade',
      label: 'Cidade',
      className: 'font-medium'
    },
    {
      key: 'estado',
      label: 'UF',
      className: 'w-16 text-center font-medium'
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
          ativo={true}
          canToggleStatus={false}
        />
      ),
      className: 'w-16'
    }
  ];

  return (
    <>
      <GenericTable
        title="Endereços"
        description="Gerenciar endereços utilizados no sistema"
        data={data}
        columns={columns}
        loading={loading}
        onAdd={handleAdd}
        addButtonText="Novo Endereço"
        searchPlaceholder="Buscar por CEP, logradouro, bairro ou cidade..."
        emptyMessage="Nenhum endereço encontrado"
        itemsPerPage={filters.limit}
      />

      {/* Modal customizado para endereços */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              {editingItem ? 'Editar Endereço' : 'Novo Endereço'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Componente de busca por CEP (apenas para novos endereços) */}
            {!editingItem && (
              <CepSearch
                cep={formData.cep}
                onCepChange={(cep) => handleInputChange('cep', cep)}
                onAddressFound={handleAddressFound}
                disabled={isSubmitting}
              />
            )}

            {/* CEP (readonly se editando) */}
            {editingItem && (
              <div className="space-y-2">
                <Label htmlFor="cep">CEP</Label>
                <Input
                  id="cep"
                  type="text"
                  value={formData.cep}
                  disabled={true}
                  className="bg-muted"
                />
              </div>
            )}

            {/* Logradouro */}
            <div className="space-y-2">
              <Label htmlFor="logradouro">Logradouro *</Label>
              <Input
                id="logradouro"
                type="text"
                placeholder="Ex: Rua das Flores"
                value={formData.logradouro}
                onChange={(e) => handleInputChange('logradouro', e.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>

            {/* Bairro */}
            <div className="space-y-2">
              <Label htmlFor="bairro">Bairro *</Label>
              <Input
                id="bairro"
                type="text"
                placeholder="Ex: Centro"
                value={formData.bairro}
                onChange={(e) => handleInputChange('bairro', e.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>

            {/* Cidade e Estado */}
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="cidade">Cidade *</Label>
                <Input
                  id="cidade"
                  type="text"
                  placeholder="Ex: São Paulo"
                  value={formData.cidade}
                  onChange={(e) => handleInputChange('cidade', e.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="estado">UF *</Label>
                <Input
                  id="estado"
                  type="text"
                  placeholder="SP"
                  value={formData.estado}
                  onChange={(e) => handleInputChange('estado', e.target.value.toUpperCase())}
                  disabled={isSubmitting}
                  maxLength={2}
                  required
                />
              </div>
            </div>

            {/* Botões */}
            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsFormOpen(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Salvando...' : editingItem ? 'Atualizar' : 'Criar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

EnderecoManagement.displayName = 'EnderecoManagement'; 