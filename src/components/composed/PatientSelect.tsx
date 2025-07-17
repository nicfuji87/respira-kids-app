import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, User, Phone, Mail, Check } from 'lucide-react';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/primitives/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/primitives/popover';
import { Input } from '@/components/primitives/input';
import { Badge } from '@/components/primitives/badge';
import { cn, normalizeText } from '@/lib/utils';
import { fetchPacientes } from '@/lib/calendar-services';
import type { SupabasePessoa } from '@/types/supabase-calendar';

// AI dev note: PatientSelect agora usa autocomplete com Input para busca direta
// Busca por nome do paciente, responsável legal, responsável financeiro com normalização de acentos

export interface PatientSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
}

interface PatientOption extends SupabasePessoa {
  // Campos adicionais para responsáveis (se existirem)
  responsavel_legal_nome?: string;
  responsavel_legal_email?: string;
  responsavel_legal_telefone?: number;
  responsavel_financeiro_nome?: string;
  responsavel_financeiro_email?: string;
  responsavel_financeiro_telefone?: number;
}

// AI dev note: Hook para debounce de busca - otimiza performance
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export const PatientSelect = React.memo<PatientSelectProps>(
  ({
    value,
    onValueChange,
    className,
    placeholder = 'Digite o nome do paciente...',
    disabled = false,
    required = false,
    error,
  }) => {
    const [patients, setPatients] = useState<PatientOption[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [displayValue, setDisplayValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    // Debounce da busca para otimizar performance
    const debouncedSearch = useDebounce(searchTerm, 300);

    // Buscar pacientes do Supabase
    useEffect(() => {
      const loadPatients = async () => {
        setIsLoading(true);
        try {
          const data = await fetchPacientes();
          setPatients(data as PatientOption[]);
        } catch (error) {
          console.error('Erro ao carregar pacientes:', error);
        } finally {
          setIsLoading(false);
        }
      };

      loadPatients();
    }, []);

    // Atualizar display value quando value prop mudar
    useEffect(() => {
      if (value && patients.length > 0) {
        const selectedPatient = patients.find((p) => p.id === value);
        if (selectedPatient) {
          setDisplayValue(selectedPatient.nome);
        }
      } else if (!value) {
        setDisplayValue('');
        setSearchTerm('');
      }
    }, [value, patients]);

    // Filtrar pacientes baseado na busca com normalização de acentos
    const filteredPatients = useMemo(() => {
      // Só mostrar sugestões se tiver 2+ caracteres
      if (!debouncedSearch.trim() || debouncedSearch.trim().length < 2) {
        return [];
      }

      const normalizedSearch = normalizeText(debouncedSearch);

      return patients.filter((patient) => {
        // Buscar por nome do paciente (normalizado)
        if (normalizeText(patient.nome || '').includes(normalizedSearch))
          return true;

        // Buscar por email do paciente (normalizado)
        if (normalizeText(patient.email || '').includes(normalizedSearch))
          return true;

        // Buscar por nome do responsável legal (normalizado)
        if (
          normalizeText(patient.responsavel_legal_nome || '').includes(
            normalizedSearch
          )
        )
          return true;

        // Buscar por email do responsável legal (normalizado)
        if (
          normalizeText(patient.responsavel_legal_email || '').includes(
            normalizedSearch
          )
        )
          return true;

        // Buscar por nome do responsável financeiro (normalizado)
        if (
          normalizeText(patient.responsavel_financeiro_nome || '').includes(
            normalizedSearch
          )
        )
          return true;

        // Buscar por email do responsável financeiro (normalizado)
        if (
          normalizeText(patient.responsavel_financeiro_email || '').includes(
            normalizedSearch
          )
        )
          return true;

        return false;
      });
    }, [patients, debouncedSearch]);

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

    const handleInputChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setDisplayValue(newValue);
        setSearchTerm(newValue);

        // Abrir popover se tiver 2+ caracteres
        if (newValue.length >= 2) {
          setIsOpen(true);
        } else {
          setIsOpen(false);
        }

        // Limpar seleção se input foi alterado
        if (value && newValue !== patients.find((p) => p.id === value)?.nome) {
          onValueChange('');
        }
      },
      [value, patients, onValueChange]
    );

    const handlePatientSelect = useCallback(
      (patient: PatientOption) => {
        setDisplayValue(patient.nome);
        setSearchTerm(patient.nome);
        setIsOpen(false);
        onValueChange(patient.id);
      },
      [onValueChange]
    );

    const handleInputFocus = useCallback(() => {
      if (searchTerm.length >= 2) {
        setIsOpen(true);
      }
    }, [searchTerm]);

    const renderPatientInfo = (patient: PatientOption) => {
      const hasResponsaveis =
        patient.responsavel_legal_nome || patient.responsavel_financeiro_nome;
      const isSelected = value === patient.id;

      return (
        <div className="flex items-center gap-3 w-full">
          <div className="flex items-center gap-2 flex-shrink-0">
            <User className="h-4 w-4 text-muted-foreground" />
            {isSelected && <Check className="h-4 w-4 text-primary" />}
          </div>

          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{patient.nome}</span>
            </div>

            {patient.email && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{patient.email}</span>
              </div>
            )}

            {patient.telefone && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="h-3 w-3 flex-shrink-0" />
                <span>{formatPhoneNumber(patient.telefone)}</span>
              </div>
            )}

            {hasResponsaveis && (
              <div className="flex flex-wrap gap-1 mt-1">
                {patient.responsavel_legal_nome && (
                  <Badge variant="outline" className="text-xs">
                    Resp. Legal: {patient.responsavel_legal_nome}
                  </Badge>
                )}
                {patient.responsavel_financeiro_nome && (
                  <Badge variant="outline" className="text-xs">
                    Resp. Financ.: {patient.responsavel_financeiro_nome}
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>
      );
    };

    return (
      <div className={cn('space-y-2', className)}>
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={displayValue}
                onChange={handleInputChange}
                onFocus={handleInputFocus}
                placeholder={isLoading ? 'Carregando...' : placeholder}
                disabled={disabled || isLoading}
                required={required}
                className={cn('pl-10', error && 'border-destructive')}
                autoComplete="off"
              />
            </div>
          </PopoverTrigger>

          <PopoverContent
            className="w-[--radix-popover-trigger-width] p-0"
            align="start"
          >
            <Command shouldFilter={false}>
              <CommandList>
                {filteredPatients.length === 0 ? (
                  <CommandEmpty>
                    {isLoading
                      ? 'Carregando pacientes...'
                      : searchTerm.length < 2
                        ? 'Digite pelo menos 2 caracteres para buscar'
                        : 'Nenhum paciente encontrado'}
                  </CommandEmpty>
                ) : (
                  <CommandGroup>
                    {filteredPatients.map((patient) => (
                      <CommandItem
                        key={patient.id}
                        value={patient.id}
                        onSelect={() => handlePatientSelect(patient)}
                        className="p-3 cursor-pointer"
                      >
                        {renderPatientInfo(patient)}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }
);

PatientSelect.displayName = 'PatientSelect';
