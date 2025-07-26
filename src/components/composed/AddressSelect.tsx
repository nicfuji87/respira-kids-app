import React, { useState, useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { Button } from '@/components/primitives/button';
import { Label } from '@/components/primitives/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/primitives/dialog';
import { Plus, Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { CepSearch } from './CepSearch';
import { createEndereco, type EnderecoViaCepData } from '@/lib/enderecos-api';
import { toast } from '@/components/primitives/use-toast';

// AI dev note: AddressSelect é um componente Composed para seleção/criação de endereço
// Permite escolher endereço existente ou cadastrar novo via CEP

export interface AddressSelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

interface Endereco {
  id: string;
  cep: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  estado: string;
}

export const AddressSelect: React.FC<AddressSelectProps> = ({
  value,
  onValueChange,
  disabled = false,
  placeholder = 'Selecione um endereço',
  className,
}) => {
  const [enderecos, setEnderecos] = useState<Endereco[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewAddressModal, setShowNewAddressModal] = useState(false);
  const [newCep, setNewCep] = useState('');
  const [newAddress, setNewAddress] = useState<EnderecoViaCepData | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchEnderecos();
  }, []);

  const fetchEnderecos = async () => {
    try {
      const { data, error } = await supabase
        .from('enderecos')
        .select('id, cep, logradouro, bairro, cidade, estado')
        .order('cidade, logradouro');

      if (error) {
        console.error('Erro ao carregar endereços:', error);
        return;
      }

      setEnderecos(data || []);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNewAddress = async () => {
    if (!newAddress) return;

    setSaving(true);
    try {
      const result = await createEndereco({
        cep: newAddress.cep,
        logradouro: newAddress.logradouro,
        bairro: newAddress.bairro,
        cidade: newAddress.cidade,
        estado: newAddress.estado,
      });

      if (result.success && result.data) {
        toast({
          title: 'Endereço cadastrado com sucesso',
        });

        // Recarregar lista
        await fetchEnderecos();

        // Selecionar o novo endereço
        onValueChange?.(result.data.id);

        // Fechar modal
        setShowNewAddressModal(false);
        setNewCep('');
        setNewAddress(null);
      } else {
        toast({
          title: 'Erro ao cadastrar endereço',
          description: result.error,
          variant: 'destructive',
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const formatAddress = (endereco: Endereco) => {
    return `${endereco.logradouro}, ${endereco.bairro} - ${endereco.cidade}/${endereco.estado} (${endereco.cep})`;
  };

  return (
    <div className={cn('space-y-2', className)}>
      <Label>Endereço</Label>
      <div className="flex gap-2">
        <Select
          value={value}
          onValueChange={onValueChange}
          disabled={disabled || loading}
        >
          <SelectTrigger className="flex-1">
            <SelectValue
              placeholder={loading ? 'Carregando...' : placeholder}
            />
          </SelectTrigger>
          <SelectContent>
            {enderecos.map((endereco) => (
              <SelectItem key={endereco.id} value={endereco.id}>
                {formatAddress(endereco)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setShowNewAddressModal(true)}
          disabled={disabled}
          title="Cadastrar novo endereço"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Modal para cadastrar novo endereço */}
      <Dialog open={showNewAddressModal} onOpenChange={setShowNewAddressModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Home className="h-5 w-5" />
              Cadastrar Novo Endereço
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <CepSearch
              cep={newCep}
              onCepChange={setNewCep}
              onAddressFound={(address) => setNewAddress(address)}
              showAddressPreview={true}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowNewAddressModal(false);
                setNewCep('');
                setNewAddress(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSaveNewAddress}
              disabled={!newAddress || saving}
            >
              {saving ? 'Salvando...' : 'Cadastrar Endereço'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

AddressSelect.displayName = 'AddressSelect';
