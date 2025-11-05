import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { User, Phone, Mail, Check, ChevronsUpDown } from 'lucide-react';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/primitives/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/primitives/popover';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import { cn, normalizeText } from '@/lib/utils';
import { fetchPacientes } from '@/lib/calendar-services';
import type { SupabasePessoa } from '@/types/supabase-calendar';

// AI dev note: PatientSelect corrigido com Combobox pattern do shadcn/ui
// Usa CommandInput para manter foco apropriadamente durante autocomplete
// BUSCA COMPLETA: Nome, email, CPF e telefone (do paciente e dos responsáveis)
// Ao digitar 'Nicolas' (responsável), aparece 'Henrique' (paciente) na lista

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
  // Campos da nova view pacientes_com_responsaveis_view
  nomes_responsaveis?: string; // Responsáveis concatenados com ' | '
  access_type?: string; // Tipo de acesso para RLS

  // Campos adicionais
  cpf_cnpj?: string | null;

  // Campos anteriores para compatibilidade (se existirem)
  responsavel_legal_nome?: string;
  responsavel_legal_email?: string;
  responsavel_legal_telefone?: number;
  responsavel_legal_cpf?: string | null;
  responsavel_financeiro_nome?: string;
  responsavel_financeiro_email?: string;
  responsavel_financeiro_telefone?: number;
  responsavel_financeiro_cpf?: string | null;
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
    placeholder = 'Buscar por nome, email, telefone ou CPF...',
    disabled = false,
    error,
  }) => {
    const [patients, setPatients] = useState<PatientOption[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // AI dev note: Debounce otimizado - reduzido para 200ms para melhor UX
    const debouncedSearch = useDebounce(searchTerm, 200);

    // Buscar pacientes do Supabase
    useEffect(() => {
      const loadPatients = async () => {
        setIsLoading(true);

        try {
          const data = await fetchPacientes();

          if (Array.isArray(data)) {
            setPatients(data as PatientOption[]);
          } else {
            setPatients([]);
          }
        } catch {
          setPatients([]);
        } finally {
          setIsLoading(false);
        }
      };

      loadPatients().catch(() => {});
    }, []);

    // Encontrar paciente selecionado para display
    const selectedPatient = useMemo(() => {
      if (!value || patients.length === 0) return null;
      return patients.find((p) => p.id === value) || null;
    }, [value, patients]);

    // Filtrar pacientes baseado na busca com normalização de acentos
    // AI dev note: Busca unificada - procura tanto no nome do paciente quanto dos responsáveis
    const filteredPatients = useMemo(() => {
      // AI dev note: Não filtrar se ainda estiver carregando pacientes
      if (isLoading) {
        return [];
      }

      // Verificar se os pacientes foram carregados
      if (patients.length === 0) {
        return [];
      }

      // Só mostrar sugestões se tiver 2+ caracteres
      if (!debouncedSearch.trim() || debouncedSearch.trim().length < 2) {
        return [];
      }

      // AI dev note: Busca flexível - separar palavras para busca AND (todas devem estar presentes)
      const searchWords = debouncedSearch
        .trim()
        .split(/\s+/)
        .filter((word) => word.length > 0);
      const normalizedSearchWords = searchWords.map((word) =>
        normalizeText(word)
      );

      const filtered = patients.filter((patient) => {
        // AI dev note: Verificar se o campo nome existe e não é nulo
        if (!patient.nome) {
          return false;
        }

        // Função helper para verificar se todas as palavras estão presentes em um texto
        const matchesAllWords = (text: string) => {
          const normalizedText = normalizeText(text);
          return normalizedSearchWords.every((word) =>
            normalizedText.includes(word)
          );
        };

        // Buscar por nome do paciente (normalizado) - busca flexível
        if (matchesAllWords(patient.nome)) {
          return true;
        }

        // AI dev note: NOVA FUNCIONALIDADE - Buscar por nome dos responsáveis
        if (
          patient.nomes_responsaveis &&
          matchesAllWords(patient.nomes_responsaveis)
        ) {
          return true;
        }

        // Buscar por email do paciente (normalizado)
        if (patient.email && matchesAllWords(patient.email)) {
          return true;
        }

        // Buscar por CPF do paciente
        if (patient.cpf_cnpj && matchesAllWords(patient.cpf_cnpj)) {
          return true;
        }

        // Buscar por telefone do paciente (converter para string para buscar)
        if (patient.telefone) {
          const telefoneStr = patient.telefone.toString();
          if (matchesAllWords(telefoneStr)) {
            return true;
          }
        }

        // Busca por responsável legal (nome e email)
        if (
          patient.responsavel_legal_nome &&
          matchesAllWords(patient.responsavel_legal_nome)
        ) {
          return true;
        }

        if (
          patient.responsavel_legal_email &&
          matchesAllWords(patient.responsavel_legal_email)
        ) {
          return true;
        }

        // Busca por CPF do responsável legal
        if (
          patient.responsavel_legal_cpf &&
          matchesAllWords(patient.responsavel_legal_cpf)
        ) {
          return true;
        }

        // Busca por telefone do responsável legal
        if (patient.responsavel_legal_telefone) {
          const telefoneStr = patient.responsavel_legal_telefone.toString();
          if (matchesAllWords(telefoneStr)) {
            return true;
          }
        }

        // Busca por responsável financeiro (nome e email)
        if (
          patient.responsavel_financeiro_nome &&
          matchesAllWords(patient.responsavel_financeiro_nome)
        ) {
          return true;
        }

        if (
          patient.responsavel_financeiro_email &&
          matchesAllWords(patient.responsavel_financeiro_email)
        ) {
          return true;
        }

        // Busca por CPF do responsável financeiro
        if (
          patient.responsavel_financeiro_cpf &&
          matchesAllWords(patient.responsavel_financeiro_cpf)
        ) {
          return true;
        }

        // Busca por telefone do responsável financeiro
        if (patient.responsavel_financeiro_telefone) {
          const telefoneStr =
            patient.responsavel_financeiro_telefone.toString();
          if (matchesAllWords(telefoneStr)) {
            return true;
          }
        }

        return false;
      });

      if (filtered.length > 0) {
        // trimmed debug output
      }
      if (filtered.length > 0) {
        // Results found - show them
      } else {
        // Debug especial: testar especificamente busca unificada
        if (normalizedSearchWords.length >= 1) {
          const allMatches = patients.filter((p) => {
            const matchesAllWords = (text: string) => {
              const normalizedText = normalizeText(text);
              return normalizedSearchWords.every((word) =>
                normalizedText.includes(word)
              );
            };

            const nomeMatch = p.nome && matchesAllWords(p.nome);
            const responsavelMatch =
              p.nomes_responsaveis && matchesAllWords(p.nomes_responsaveis);
            return nomeMatch || responsavelMatch;
          });

          allMatches.forEach(() => {});
        }
      }

      return filtered;
    }, [patients, debouncedSearch, isLoading]); // AI dev note: Adicionado isLoading como dependência

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

    const handlePatientSelect = useCallback(
      (patient: PatientOption) => {
        onValueChange(patient.id);
        setIsOpen(false);
      },
      [onValueChange]
    );

    const handleOpenChange = useCallback((open: boolean) => {
      setIsOpen(open);
    }, []);

    // AI dev note: Callback para mudanças no campo de busca
    const handleSearchChange = useCallback((search: string) => {
      setSearchTerm(search);
    }, []);

    const renderPatientInfo = (patient: PatientOption) => {
      const isSelected = value === patient.id;

      // AI dev note: Detectar se match foi via responsável e qual tipo
      const normalizedSearch = normalizeText(debouncedSearch);
      const matchViaNome =
        patient.nome && normalizeText(patient.nome).includes(normalizedSearch);

      // Detectar match específico por tipo de responsável
      const matchViaRespLegal =
        !matchViaNome &&
        patient.responsavel_legal_nome &&
        normalizeText(patient.responsavel_legal_nome).includes(
          normalizedSearch
        );
      const matchViaRespFinanceiro =
        !matchViaNome &&
        patient.responsavel_financeiro_nome &&
        normalizeText(patient.responsavel_financeiro_nome).includes(
          normalizedSearch
        );
      const matchViaRespGenerico =
        !matchViaNome &&
        !matchViaRespLegal &&
        !matchViaRespFinanceiro &&
        patient.nomes_responsaveis &&
        normalizeText(patient.nomes_responsaveis).includes(normalizedSearch);

      return (
        <div className="flex items-center gap-3 w-full">
          <div className="flex items-center gap-2 flex-shrink-0">
            <User className="h-4 w-4 text-muted-foreground" />
            {isSelected && <Check className="h-4 w-4 text-primary" />}
          </div>

          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{patient.nome}</span>
              {/* AI dev note: Badges específicos por tipo de responsável */}
              {matchViaRespLegal && (
                <Badge variant="secondary" className="text-xs">
                  via resp. legal
                </Badge>
              )}
              {matchViaRespFinanceiro && (
                <Badge
                  variant="outline"
                  className="text-xs border-orange-300 text-orange-700"
                >
                  via resp. financeiro
                </Badge>
              )}
              {matchViaRespGenerico && (
                <Badge variant="secondary" className="text-xs">
                  via responsável
                </Badge>
              )}
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

            {/* Badges específicos por tipo de responsável com cores distintivas */}
            {(patient.responsavel_legal_nome ||
              patient.responsavel_financeiro_nome) && (
              <div className="flex flex-wrap gap-1 mt-1">
                {patient.responsavel_legal_nome && (
                  <Badge
                    variant="outline"
                    className="text-xs border-blue-300 text-blue-700"
                  >
                    Legal: {patient.responsavel_legal_nome}
                  </Badge>
                )}
                {patient.responsavel_financeiro_nome && (
                  <Badge
                    variant="outline"
                    className="text-xs border-orange-300 text-orange-700"
                  >
                    Financeiro: {patient.responsavel_financeiro_nome}
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
        <Popover open={isOpen} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={isOpen}
              disabled={disabled || isLoading}
              className={cn(
                'w-full justify-between text-left font-normal',
                !selectedPatient && 'text-muted-foreground',
                error && 'border-destructive'
              )}
            >
              {selectedPatient ? (
                <span className="truncate">{selectedPatient.nome}</span>
              ) : (
                <span>{isLoading ? 'Carregando...' : placeholder}</span>
              )}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>

          <PopoverContent
            className="w-[--radix-popover-trigger-width] p-0"
            align="start"
          >
            {/* AI dev note: Scroll otimizado para mobile com -webkit-overflow-scrolling e touch-action */}
            <Command
              shouldFilter={false}
              className="flex flex-col max-h-[400px]"
            >
              <CommandInput
                placeholder="Buscar por nome, email, telefone ou CPF..."
                value={searchTerm}
                onValueChange={handleSearchChange}
                className="h-9 flex-shrink-0"
              />
              <CommandList
                className="max-h-[300px] overflow-y-auto overflow-x-hidden [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent"
                style={
                  {
                    WebkitOverflowScrolling: 'touch',
                    touchAction: 'pan-y',
                    overscrollBehavior: 'contain',
                  } as React.CSSProperties
                }
              >
                {filteredPatients.length === 0 ? (
                  <CommandEmpty>
                    {isLoading
                      ? 'Carregando pacientes...'
                      : searchTerm.length < 2
                        ? 'Digite pelo menos 2 caracteres para buscar'
                        : 'Nenhum paciente encontrado'}
                  </CommandEmpty>
                ) : (
                  <CommandGroup className="[&_[cmdk-item]]:touch-pan-y">
                    {filteredPatients.map((patient) => (
                      <CommandItem
                        key={patient.id}
                        value={patient.id}
                        onSelect={() => handlePatientSelect(patient)}
                        className="p-3 cursor-pointer touch-pan-y"
                        style={{ touchAction: 'pan-y' } as React.CSSProperties}
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
