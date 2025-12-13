import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/primitives/button';
import { Label } from '@/components/primitives/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/primitives/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/primitives/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/primitives/command';
import { Plus, Home, Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { CepSearch } from './CepSearch';
import { createEndereco, type EnderecoViaCepData } from '@/lib/enderecos-api';
import { toast } from '@/components/primitives/use-toast';

// AI dev note: AddressSelect é um componente Composed para seleção/criação de endereço
// Permite escolher endereço existente ou cadastrar novo via CEP
// Usa Combobox (Popover + Command) para permitir busca/filtro enquanto digita

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
  placeholder = 'Buscar endereço...',
  className,
}) => {
  const [enderecos, setEnderecos] = useState<Endereco[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
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

  // Endereço selecionado para exibição no botão
  const selectedAddress = useMemo(() => {
    if (!value) return null;
    return enderecos.find((e) => e.id === value);
  }, [value, enderecos]);

  return (
    <div className={cn('space-y-2', className)}>
      <Label>Endereço</Label>
      <div className="flex gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="flex-1 justify-between font-normal"
              disabled={disabled || loading}
            >
              <span className="truncate">
                {loading
                  ? 'Carregando...'
                  : selectedAddress
                    ? formatAddress(selectedAddress)
                    : placeholder}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[var(--radix-popover-trigger-width)] p-0"
            align="start"
          >
            <Command>
              <CommandInput placeholder="Digite para buscar..." />
              <CommandList className="max-h-[300px] overflow-y-auto">
                <CommandEmpty>Nenhum endereço encontrado.</CommandEmpty>
                <CommandGroup>
                  {enderecos.map((endereco) => (
                    <CommandItem
                      key={endereco.id}
                      value={formatAddress(endereco)}
                      onSelect={() => {
                        onValueChange?.(endereco.id);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          value === endereco.id ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <span className="truncate">
                        {formatAddress(endereco)}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

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
