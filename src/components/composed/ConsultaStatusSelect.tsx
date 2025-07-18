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
import { fetchConsultaStatus } from '@/lib/calendar-services';
import type { SupabaseConsultaStatus } from '@/types/supabase-calendar';

// AI dev note: ConsultaStatusSelect combina Select com indicadores visuais de status
// Mostra cores dos status para facilitar identificação visual

export interface ConsultaStatusSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  defaultToAgendado?: boolean; // Pré-selecionar "agendado" por padrão
}

export const ConsultaStatusSelect = React.memo<ConsultaStatusSelectProps>(
  ({
    value,
    onValueChange,
    className,
    placeholder = 'Selecionar status da consulta...',
    disabled = false,
    required = false,
    error,
    defaultToAgendado = true,
  }) => {
    const [consultaStatuses, setConsultaStatuses] = useState<
      SupabaseConsultaStatus[]
    >([]);
    const [isLoading, setIsLoading] = useState(false);

    // Buscar status de consulta do Supabase
    useEffect(() => {
      const loadConsultaStatuses = async () => {
        setIsLoading(true);
        try {
          const data = await fetchConsultaStatus();
          setConsultaStatuses(data);

          // Auto-selecionar "agendado" se solicitado e nenhum valor definido
          if (defaultToAgendado && !value && data.length > 0) {
            const agendadoStatus = data.find(
              (s) =>
                s.codigo?.toLowerCase() === 'agendado' ||
                s.descricao?.toLowerCase().includes('agendado')
            );
            if (agendadoStatus) {
              onValueChange(agendadoStatus.id);
            }
          }
        } catch (error) {
          console.error('Erro ao carregar status de consulta:', error);
        } finally {
          setIsLoading(false);
        }
      };

      loadConsultaStatuses();
    }, [defaultToAgendado, value, onValueChange]);

    // Encontrar status selecionado
    const selectedStatus = consultaStatuses.find((s) => s.id === value);

    const renderStatusInfo = (status: SupabaseConsultaStatus) => {
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
            {consultaStatuses.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {isLoading
                  ? 'Carregando status...'
                  : 'Nenhum status disponível.'}
              </div>
            ) : (
              consultaStatuses.map((status) => (
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

ConsultaStatusSelect.displayName = 'ConsultaStatusSelect';
