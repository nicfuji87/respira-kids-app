import React, { useState, useEffect } from 'react';
import { Clock, DollarSign } from 'lucide-react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { Badge } from '@/components/primitives/badge';
import { cn } from '@/lib/utils';
import { fetchTiposServico } from '@/lib/calendar-services';
import type { SupabaseTipoServico } from '@/types/supabase-calendar';

// AI dev note: ServiceTypeSelect combina Select com informações visuais de tipos de serviço
// Mostra duração, valor e cor para facilitar seleção

export interface ServiceTypeSelectProps {
  value?: string;
  onValueChange: (value: string, serviceData?: SupabaseTipoServico) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
}

export const ServiceTypeSelect = React.memo<ServiceTypeSelectProps>(
  ({
    value,
    onValueChange,
    className,
    placeholder = 'Selecionar tipo de serviço...',
    disabled = false,
    required = false,
    error,
  }) => {
    const [serviceTypes, setServiceTypes] = useState<SupabaseTipoServico[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Buscar tipos de serviço do Supabase
    useEffect(() => {
      const loadServiceTypes = async () => {
        setIsLoading(true);
        try {
          const data = await fetchTiposServico();
          setServiceTypes(data);
        } catch (error) {
          console.error('Erro ao carregar tipos de serviço:', error);
        } finally {
          setIsLoading(false);
        }
      };

      loadServiceTypes();
    }, []);

    // Encontrar tipo de serviço selecionado
    const selectedServiceType = serviceTypes.find((s) => s.id === value);

    const formatCurrency = (value: number): string => {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(value);
    };

    const formatDuration = (minutes: number): string => {
      if (minutes < 60) {
        return `${minutes}min`;
      }
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      if (remainingMinutes === 0) {
        return `${hours}h`;
      }
      return `${hours}h ${remainingMinutes}min`;
    };

    const handleValueChange = (serviceId: string) => {
      const serviceData = serviceTypes.find((s) => s.id === serviceId);
      onValueChange(serviceId, serviceData);
    };

    const renderServiceTypeInfo = (serviceType: SupabaseTipoServico) => {
      return (
        <div className="flex items-center gap-3">
          {/* Indicador de cor */}
          <div
            className="h-4 w-4 rounded-full border border-border"
            style={{ backgroundColor: serviceType.cor }}
          />

          <div className="flex flex-col gap-1 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{serviceType.nome}</span>
            </div>

            {serviceType.descricao && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {serviceType.descricao}
              </p>
            )}

            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{formatDuration(serviceType.duracao_minutos)}</span>
              </div>

              <div className="flex items-center gap-1 text-muted-foreground">
                <DollarSign className="h-3 w-3" />
                <span>{formatCurrency(serviceType.valor)}</span>
              </div>
            </div>
          </div>
        </div>
      );
    };

    const renderSelectedValue = () => {
      if (!selectedServiceType) return null;

      return (
        <div className="flex items-center gap-2">
          <div
            className="h-3 w-3 rounded-full border border-border"
            style={{ backgroundColor: selectedServiceType.cor }}
          />
          <span>{selectedServiceType.nome}</span>
          <Badge variant="outline" className="text-xs">
            {formatCurrency(selectedServiceType.valor)}
          </Badge>
        </div>
      );
    };

    return (
      <div className={cn('space-y-2', className)}>
        <Select
          value={value}
          onValueChange={handleValueChange}
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

          <SelectContent className="max-h-80">
            {serviceTypes.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {isLoading
                  ? 'Carregando tipos de serviço...'
                  : 'Nenhum tipo de serviço disponível.'}
              </div>
            ) : (
              serviceTypes.map((serviceType) => (
                <SelectItem
                  key={serviceType.id}
                  value={serviceType.id}
                  className="p-3"
                >
                  {renderServiceTypeInfo(serviceType)}
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

ServiceTypeSelect.displayName = 'ServiceTypeSelect';
