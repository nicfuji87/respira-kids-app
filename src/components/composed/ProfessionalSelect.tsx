import React, { useState, useEffect } from 'react';
import { UserCheck, Mail, Phone, Badge as BadgeIcon } from 'lucide-react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { Badge } from '@/components/primitives/badge';
import { Avatar } from '@/components/primitives/avatar';
import { cn } from '@/lib/utils';
import { fetchProfissionais } from '@/lib/calendar-services';
import type { SupabasePessoa } from '@/types/supabase-calendar';

// AI dev note: ProfessionalSelect combina Select e Avatar para seleção de profissionais
// Lista apenas profissionais ativos e aprovados com informações visuais

export interface ProfessionalSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
}

export const ProfessionalSelect = React.memo<ProfessionalSelectProps>(
  ({
    value,
    onValueChange,
    className,
    placeholder = 'Selecionar profissional...',
    disabled = false,
    required = false,
    error,
  }) => {
    const [professionals, setProfessionals] = useState<SupabasePessoa[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Buscar profissionais do Supabase
    useEffect(() => {
      const loadProfessionals = async () => {
        setIsLoading(true);
        try {
          const data = await fetchProfissionais();
          setProfessionals(data);
        } catch (error) {
          console.error('Erro ao carregar profissionais:', error);
        } finally {
          setIsLoading(false);
        }
      };

      loadProfessionals();
    }, []);

    // Encontrar profissional selecionado
    const selectedProfessional = professionals.find((p) => p.id === value);

    const formatPhoneNumber = (
      phone: number | bigint | null | undefined
    ): string => {
      if (!phone) return '';
      const phoneStr = phone.toString();
      if (phoneStr.length === 11) {
        return `(${phoneStr.slice(0, 2)}) ${phoneStr.slice(2, 7)}-${phoneStr.slice(7)}`;
      }
      return phoneStr;
    };

    const renderProfessionalInfo = (professional: SupabasePessoa) => {
      return (
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            {professional.foto_perfil ? (
              <img
                src={professional.foto_perfil}
                alt={professional.nome}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-muted">
                <UserCheck className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
          </Avatar>

          <div className="flex flex-col gap-1 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{professional.nome}</span>
              {professional.registro_profissional && (
                <Badge variant="secondary" className="text-xs">
                  {professional.registro_profissional}
                </Badge>
              )}
            </div>

            {professional.especialidade && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <BadgeIcon className="h-3 w-3" />
                <span>{professional.especialidade}</span>
              </div>
            )}

            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {professional.email && (
                <div className="flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  <span>{professional.email}</span>
                </div>
              )}
              {professional.telefone && (
                <div className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  <span>{formatPhoneNumber(professional.telefone)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    };

    const renderSelectedValue = () => {
      if (!selectedProfessional) return null;

      return (
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6">
            {selectedProfessional.foto_perfil ? (
              <img
                src={selectedProfessional.foto_perfil}
                alt={selectedProfessional.nome}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-muted">
                <UserCheck className="h-3 w-3 text-muted-foreground" />
              </div>
            )}
          </Avatar>
          <span>{selectedProfessional.nome}</span>
          {selectedProfessional.especialidade && (
            <Badge variant="outline" className="text-xs">
              {selectedProfessional.especialidade}
            </Badge>
          )}
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

          <SelectContent className="max-h-80">
            {professionals.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {isLoading
                  ? 'Carregando profissionais...'
                  : 'Nenhum profissional disponível.'}
              </div>
            ) : (
              professionals.map((professional) => (
                <SelectItem
                  key={professional.id}
                  value={professional.id}
                  className="p-3"
                >
                  {renderProfessionalInfo(professional)}
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

ProfessionalSelect.displayName = 'ProfessionalSelect';
