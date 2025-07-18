import React, { useState, useEffect } from 'react';
import { Circle } from 'lucide-react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { cn } from '@/lib/utils';
import { fetchPagamentoStatus } from '@/lib/calendar-services';
import type { SupabasePagamentoStatus } from '@/types/supabase-calendar';

// AI dev note: PagamentoStatusSelect combina Select com indicadores visuais de pagamento
// Mostra cores dos status para facilitar identificação visual do status de pagamento

export interface PagamentoStatusSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  defaultToPendente?: boolean; // Pré-selecionar "pendente" por padrão
}

export const PagamentoStatusSelect = React.memo<PagamentoStatusSelectProps>(
  ({
    value,
    onValueChange,
    className,
    placeholder = 'Selecionar status do pagamento...',
    disabled = false,
    required = false,
    error,
    defaultToPendente = true,
  }) => {
    const [pagamentoStatuses, setPagamentoStatuses] = useState<
      SupabasePagamentoStatus[]
    >([]);
    const [isLoading, setIsLoading] = useState(false);

    // Buscar status de pagamento do Supabase
    useEffect(() => {
      const loadPagamentoStatuses = async () => {
        setIsLoading(true);
        try {
          const data = await fetchPagamentoStatus();
          setPagamentoStatuses(data);

          // Auto-selecionar "pendente" se solicitado e nenhum valor definido
          if (defaultToPendente && !value && data.length > 0) {
            const pendenteStatus = data.find(
              (s) =>
                s.codigo?.toLowerCase() === 'pendente' ||
                s.descricao?.toLowerCase().includes('pendente')
            );
            if (pendenteStatus) {
              onValueChange(pendenteStatus.id);
            }
          }
        } catch (error) {
          console.error('Erro ao carregar status de pagamento:', error);
        } finally {
          setIsLoading(false);
        }
      };

      loadPagamentoStatuses();
    }, [defaultToPendente, value, onValueChange]);

    // Encontrar status selecionado
    const selectedStatus = pagamentoStatuses.find((s) => s.id === value);

    const renderStatusInfo = (status: SupabasePagamentoStatus) => {
      return (
        <div className="flex items-center gap-3">
          <Circle
            className="h-4 w-4"
            style={{ color: status.cor }}
            fill={status.cor}
          />
          <span className="font-medium">{status.descricao}</span>
        </div>
      );
    };

    const renderSelectedValue = () => {
      if (!selectedStatus) return null;

      return (
        <div className="flex items-center gap-2">
          <Circle
            className="h-3 w-3"
            style={{ color: selectedStatus.cor }}
            fill={selectedStatus.cor}
          />
          <span>{selectedStatus.descricao}</span>
        </div>
      );
    };

    return (
      <div className={cn('space-y-2', className)}>
        <Select
          value={value}
          onValueChange={onValueChange}
          disabled={disabled || isLoading}
          required={required}
        >
          <SelectTrigger className={cn(error && 'border-destructive')}>
            <SelectValue
              placeholder={isLoading ? 'Carregando...' : placeholder}
            >
              {renderSelectedValue()}
            </SelectValue>
          </SelectTrigger>

          <SelectContent>
            {pagamentoStatuses.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {isLoading
                  ? 'Carregando status...'
                  : 'Nenhum status disponível.'}
              </div>
            ) : (
              pagamentoStatuses.map((status) => (
                <SelectItem key={status.id} value={status.id} className="p-3">
                  {renderStatusInfo(status)}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }
);

PagamentoStatusSelect.displayName = 'PagamentoStatusSelect';
