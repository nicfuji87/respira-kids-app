import React, { useState, useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { Label } from '@/components/primitives/label';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

// AI dev note: TypePersonSelect é um componente Composed para seleção de tipo de pessoa
// Carrega os tipos ativos do banco e permite seleção

export interface TypePersonSelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

interface TipoPessoa {
  id: string;
  codigo: string;
  nome: string;
  descricao: string;
}

export const TypePersonSelect: React.FC<TypePersonSelectProps> = ({
  value,
  onValueChange,
  disabled = false,
  placeholder = 'Selecione um tipo',
  className,
}) => {
  const [tiposPessoa, setTiposPessoa] = useState<TipoPessoa[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTiposPessoa = async () => {
      try {
        const { data, error } = await supabase
          .from('pessoa_tipos')
          .select('id, codigo, nome, descricao')
          .eq('ativo', true)
          .order('nome');

        if (error) {
          console.error('Erro ao carregar tipos de pessoa:', error);
          return;
        }

        setTiposPessoa(data || []);
      } finally {
        setLoading(false);
      }
    };

    fetchTiposPessoa();
  }, []);

  return (
    <div className={cn('space-y-2', className)}>
      <Label>Tipo de Pessoa</Label>
      <Select
        value={value}
        onValueChange={onValueChange}
        disabled={disabled || loading}
      >
        <SelectTrigger>
          <SelectValue placeholder={loading ? 'Carregando...' : placeholder} />
        </SelectTrigger>
        <SelectContent>
          {tiposPessoa.map((tipo) => (
            <SelectItem key={tipo.id} value={tipo.id}>
              {tipo.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

TypePersonSelect.displayName = 'TypePersonSelect';
