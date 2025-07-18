import React from 'react';
import { Label } from '@/components/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';

// AI dev note: LocationSelect é um COMPOSED que combina Select + Label
// para seleção específica de locais de atendimento com carregamento de dados

export interface LocationOption {
  id: string;
  nome: string;
  tipo_local: string;
  ativo: boolean;
}

export interface LocationSelectProps {
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  locais: LocationOption[];
  isLoading?: boolean;
  className?: string;
  label?: string;
  placeholder?: string;
}

export const LocationSelect = React.memo<LocationSelectProps>(
  ({
    value,
    onChange,
    disabled = false,
    locais,
    isLoading = false,
    className,
    label = 'Local de Atendimento',
    placeholder = 'Selecione o local',
  }) => {
    // Filtrar apenas locais ativos
    const locaisAtivos = locais.filter((local) => local.ativo);

    return (
      <div className={`space-y-2 ${className || ''}`}>
        <Label htmlFor="location-select">{label}</Label>
        <Select
          value={value}
          onValueChange={onChange}
          disabled={disabled || isLoading}
        >
          <SelectTrigger id="location-select">
            <SelectValue
              placeholder={isLoading ? 'Carregando locais...' : placeholder}
            />
          </SelectTrigger>
          <SelectContent>
            {locaisAtivos.length === 0 ? (
              <SelectItem value="no-locations-available" disabled>
                {isLoading ? 'Carregando...' : 'Nenhum local disponível'}
              </SelectItem>
            ) : (
              locaisAtivos
                .filter((local) => local.id && local.id.trim() !== '')
                .map((local) => (
                  <SelectItem key={local.id} value={local.id}>
                    {local.nome}
                  </SelectItem>
                ))
            )}
          </SelectContent>
        </Select>
      </div>
    );
  }
);

LocationSelect.displayName = 'LocationSelect';
