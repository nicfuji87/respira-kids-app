// AI dev note: PediatraSelect - FASE 4.1 do plano aprovado
// Componente Composed para seleção de pediatras com suporte a múltiplas seleções
import React, { useState, useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import { Label } from '@/components/primitives/label';
import { X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchPediatras, type Pediatra } from '@/lib/pediatra-api';

export interface PediatraSelectProps {
  value?: string[];
  onChange?: (pediatras: string[]) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
  placeholder?: string;
  error?: string;
}

export const PediatraSelect: React.FC<PediatraSelectProps> = ({
  value = [],
  onChange,
  disabled = false,
  className,
  label = 'Médicos Pediatras',
  placeholder = 'Selecione os pediatras',
  error,
}) => {
  const [pediatras, setPediatras] = useState<Pediatra[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPediatra, setSelectedPediatra] = useState<string>('');

  // AI dev note: Carregar pediatras disponíveis
  useEffect(() => {
    const loadPediatras = async () => {
      try {
        setLoading(true);
        const data = await fetchPediatras();
        setPediatras(data);
      } catch (error) {
        console.error('Erro ao carregar pediatras:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPediatras();
  }, []);

  // AI dev note: Adicionar pediatra à seleção
  const handleAddPediatra = () => {
    if (!selectedPediatra || value.includes(selectedPediatra)) {
      return;
    }

    const newValue = [...value, selectedPediatra];
    onChange?.(newValue);
    setSelectedPediatra('');
  };

  // AI dev note: Remover pediatra da seleção
  const handleRemovePediatra = (pediatraId: string) => {
    const newValue = value.filter((id) => id !== pediatraId);
    onChange?.(newValue);
  };

  // AI dev note: Obter nome do pediatra pelo ID
  const getPediatraName = (pediatraId: string): string => {
    const pediatra = pediatras.find((p) => p.id === pediatraId);
    return pediatra
      ? `${pediatra.nome}${pediatra.crm ? ` (CRM: ${pediatra.crm})` : ''}`
      : '';
  };

  // AI dev note: Filtrar pediatras disponíveis (não selecionados)
  const availablePediatras = pediatras.filter((p) => !value.includes(p.id));

  return (
    <div className={cn('space-y-3', className)}>
      {label && <Label>{label}</Label>}

      {/* Lista de pediatras selecionados */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((pediatraId) => (
            <Badge
              key={pediatraId}
              variant="secondary"
              className="flex items-center gap-1 px-2 py-1"
            >
              <span className="text-sm">{getPediatraName(pediatraId)}</span>
              {!disabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => handleRemovePediatra(pediatraId)}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </Badge>
          ))}
        </div>
      )}

      {/* Seletor para adicionar novos pediatras */}
      {!disabled && availablePediatras.length > 0 && (
        <div className="flex gap-2">
          <Select
            value={selectedPediatra}
            onValueChange={setSelectedPediatra}
            disabled={loading}
          >
            <SelectTrigger className="flex-1">
              <SelectValue
                placeholder={loading ? 'Carregando...' : placeholder}
              />
            </SelectTrigger>
            <SelectContent>
              {availablePediatras.map((pediatra) => (
                <SelectItem key={pediatra.id} value={pediatra.id}>
                  <div className="flex flex-col">
                    <span className="font-medium">{pediatra.nome}</span>
                    {pediatra.crm && (
                      <span className="text-sm text-muted-foreground">
                        CRM: {pediatra.crm} - {pediatra.especialidade}
                      </span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddPediatra}
            disabled={!selectedPediatra}
            className="shrink-0"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Estado vazio */}
      {!disabled && availablePediatras.length === 0 && value.length === 0 && (
        <div className="text-sm text-muted-foreground py-2">
          Nenhum pediatra disponível
        </div>
      )}

      {/* Mensagem de erro */}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
};

PediatraSelect.displayName = 'PediatraSelect';
