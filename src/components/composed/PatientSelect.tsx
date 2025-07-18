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
// DEBUG: Logs mantidos para verificar correção da perda de foco

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

  // Campos anteriores para compatibilidade (se existirem)
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
    console.log(
      '🔄 [DEBUG] useDebounce - input value:',
      value,
      'delay:',
      delay
    );
    const handler = setTimeout(() => {
      console.log('⏰ [DEBUG] useDebounce - setting debounced value:', value);
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
    error,
  }) => {
    console.log('🏗️ [DEBUG] PatientSelect - render with value:', value);

    const [patients, setPatients] = useState<PatientOption[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // AI dev note: Debounce otimizado - reduzido para 200ms para melhor UX
    const debouncedSearch = useDebounce(searchTerm, 200);

    // Buscar pacientes do Supabase
    useEffect(() => {
      console.log('🚀 [DEBUG] PatientSelect useEffect - INICIANDO EXECUÇÃO');

      const loadPatients = async () => {
        console.log(
          '📡 [DEBUG] loadPatients - função chamada, setando loading=true'
        );
        setIsLoading(true);

        try {
          console.log('🔄 [DEBUG] loadPatients - chamando fetchPacientes()');
          const data = await fetchPacientes();
          console.log(
            '✅ [DEBUG] loadPatients - fetchPacientes retornou:',
            typeof data,
            Array.isArray(data) ? data.length : 'não é array'
          );

          if (Array.isArray(data)) {
            console.log(
              '📋 [DEBUG] loadPatients - primeiros 3 pacientes:',
              data.slice(0, 3).map((p) => ({ id: p.id, nome: p.nome }))
            );
            setPatients(data as PatientOption[]);
          } else {
            console.error(
              '❌ [DEBUG] loadPatients - fetchPacientes não retornou array:',
              data
            );
            setPatients([]);
          }
        } catch (error) {
          console.error('❌ [DEBUG] loadPatients - ERRO CAPTURADO:', error);
          console.error(
            '❌ [DEBUG] loadPatients - erro stack:',
            error instanceof Error ? error.stack : 'sem stack'
          );
          setPatients([]);
        } finally {
          console.log(
            '🏁 [DEBUG] loadPatients - finalizando, setando loading=false'
          );
          setIsLoading(false);
        }
      };

      console.log(
        '📞 [DEBUG] PatientSelect useEffect - chamando loadPatients()'
      );
      loadPatients().catch((error) => {
        console.error(
          '💥 [DEBUG] PatientSelect useEffect - erro não capturado na função loadPatients:',
          error
        );
      });

      console.log(
        '✅ [DEBUG] PatientSelect useEffect - FIM DA EXECUÇÃO DO useEffect'
      );
    }, []);

    // Encontrar paciente selecionado para display
    const selectedPatient = useMemo(() => {
      if (!value || patients.length === 0) return null;
      return patients.find((p) => p.id === value) || null;
    }, [value, patients]);

    // Filtrar pacientes baseado na busca com normalização de acentos
    // AI dev note: Busca unificada - procura tanto no nome do paciente quanto dos responsáveis
    const filteredPatients = useMemo(() => {
      console.log(
        '🔍 [DEBUG] filteredPatients - debouncedSearch:',
        `"${debouncedSearch}"`,
        'length:',
        debouncedSearch.trim().length
      );
      console.log(
        '👥 [DEBUG] filteredPatients - total de pacientes carregados:',
        patients.length
      );
      console.log('⏳ [DEBUG] filteredPatients - isLoading:', isLoading);

      // AI dev note: Não filtrar se ainda estiver carregando pacientes
      if (isLoading) {
        console.log(
          '⌛ [DEBUG] filteredPatients - ainda carregando, aguardando...'
        );
        return [];
      }

      // Verificar se os pacientes foram carregados
      if (patients.length === 0) {
        console.log(
          '📭 [DEBUG] filteredPatients - nenhum paciente carregado ainda'
        );
        return [];
      }

      // Só mostrar sugestões se tiver 2+ caracteres
      if (!debouncedSearch.trim() || debouncedSearch.trim().length < 2) {
        console.log(
          '⏹️ [DEBUG] filteredPatients - muito poucos caracteres, retornando array vazio'
        );
        return [];
      }

      const normalizedSearch = normalizeText(debouncedSearch);
      console.log(
        '🔤 [DEBUG] filteredPatients - normalized search:',
        `"${normalizedSearch}"`
      );

      // Debug: testar normalização com alguns pacientes
      if (patients.length > 0) {
        console.log(
          '🧪 [DEBUG] filteredPatients - testando busca unificada nos primeiros 3 pacientes:'
        );
        patients.slice(0, 3).forEach((p, index) => {
          const normalizedNome = normalizeText(p.nome || '');
          const normalizedResponsaveis = normalizeText(
            p.nomes_responsaveis || ''
          );
          const nomeMatch = normalizedNome.includes(normalizedSearch);
          const responsavelMatch =
            normalizedResponsaveis.includes(normalizedSearch);
          console.log(
            `  ${index + 1}. "${p.nome}" | Responsáveis: "${p.nomes_responsaveis || 'nenhum'}"`
          );
          console.log(
            `      Nome match: ${nomeMatch} | Responsável match: ${responsavelMatch}`
          );
        });
      }

      const filtered = patients.filter((patient) => {
        // AI dev note: Verificar se o campo nome existe e não é nulo
        if (!patient.nome) {
          return false;
        }

        // Buscar por nome do paciente (normalizado)
        const normalizedNome = normalizeText(patient.nome);
        if (normalizedNome.includes(normalizedSearch)) {
          console.log(
            '✅ [DEBUG] filteredPatients - match por nome do paciente:',
            patient.nome
          );
          return true;
        }

        // AI dev note: NOVA FUNCIONALIDADE - Buscar por nome dos responsáveis
        if (patient.nomes_responsaveis) {
          const normalizedResponsaveis = normalizeText(
            patient.nomes_responsaveis
          );
          if (normalizedResponsaveis.includes(normalizedSearch)) {
            console.log(
              '✅ [DEBUG] filteredPatients - match por nome do responsável:',
              patient.nomes_responsaveis
            );
            console.log(
              '    👶 [DEBUG] - paciente correspondente:',
              patient.nome
            );
            return true;
          }
        }

        // Buscar por email do paciente (normalizado)
        if (
          patient.email &&
          normalizeText(patient.email).includes(normalizedSearch)
        ) {
          console.log(
            '✅ [DEBUG] filteredPatients - match por email:',
            patient.email
          );
          return true;
        }

        // Busca por responsável legal (nome e email)
        if (
          patient.responsavel_legal_nome &&
          normalizeText(patient.responsavel_legal_nome).includes(
            normalizedSearch
          )
        ) {
          console.log(
            '✅ [DEBUG] filteredPatients - match por resp. legal (nome):',
            patient.responsavel_legal_nome
          );
          return true;
        }

        if (
          patient.responsavel_legal_email &&
          normalizeText(patient.responsavel_legal_email).includes(
            normalizedSearch
          )
        ) {
          console.log(
            '✅ [DEBUG] filteredPatients - match por resp. legal (email):',
            patient.responsavel_legal_email
          );
          return true;
        }

        // Busca por responsável financeiro (nome e email)
        if (
          patient.responsavel_financeiro_nome &&
          normalizeText(patient.responsavel_financeiro_nome).includes(
            normalizedSearch
          )
        ) {
          console.log(
            '✅ [DEBUG] filteredPatients - match por resp. financeiro (nome):',
            patient.responsavel_financeiro_nome
          );
          return true;
        }

        if (
          patient.responsavel_financeiro_email &&
          normalizeText(patient.responsavel_financeiro_email).includes(
            normalizedSearch
          )
        ) {
          console.log(
            '✅ [DEBUG] filteredPatients - match por resp. financeiro (email):',
            patient.responsavel_financeiro_email
          );
          return true;
        }

        return false;
      });

      console.log(
        '📊 [DEBUG] filteredPatients - resultado:',
        filtered.length,
        'pacientes filtrados'
      );
      if (filtered.length > 0) {
        console.log(
          '🔍 [DEBUG] Primeiros 3 pacientes filtrados com detalhes de responsáveis:'
        );
        filtered.slice(0, 3).forEach((p, idx) => {
          console.log(`  ${idx + 1}. Paciente: "${p.nome}"`);
          console.log(
            `     nomes_responsaveis: "${p.nomes_responsaveis || 'vazio'}"`
          );
          console.log(
            `     responsavel_legal_nome: "${p.responsavel_legal_nome || 'vazio'}"`
          );
          console.log(
            `     responsavel_financeiro_nome: "${p.responsavel_financeiro_nome || 'vazio'}"`
          );
        });
      }
      if (filtered.length > 0) {
        console.log(
          '👥 [DEBUG] filteredPatients - primeiros resultados:',
          filtered.slice(0, 3).map((p) => p.nome)
        );
      } else {
        console.log(
          '❌ [DEBUG] filteredPatients - nenhum paciente passou no filtro'
        );

        // Debug especial: testar especificamente busca unificada
        if (normalizedSearch.length >= 2) {
          console.log(
            '🔬 [DEBUG] filteredPatients - debug especial para busca unificada:'
          );
          const allMatches = patients.filter((p) => {
            const nomeMatch =
              p.nome && normalizeText(p.nome).includes(normalizedSearch);
            const responsavelMatch =
              p.nomes_responsaveis &&
              normalizeText(p.nomes_responsaveis).includes(normalizedSearch);
            return nomeMatch || responsavelMatch;
          });
          console.log(
            `  📝 Total de matches (paciente + responsável): ${allMatches.length}`
          );
          allMatches.forEach((p, index) => {
            const matchType = normalizeText(p.nome || '').includes(
              normalizedSearch
            )
              ? 'paciente'
              : 'responsável';
            console.log(
              `  🧪 ${index + 1}. "${p.nome}" via ${matchType} | Responsáveis: "${p.nomes_responsaveis || 'nenhum'}"`
            );
          });
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
        console.log(
          '✅ [DEBUG] handlePatientSelect - paciente selecionado:',
          patient.nome,
          'id:',
          patient.id
        );
        console.log(
          '📤 [DEBUG] handlePatientSelect - chamando onValueChange com id:',
          patient.id
        );
        onValueChange(patient.id);
        setIsOpen(false);
      },
      [onValueChange]
    );

    const handleOpenChange = useCallback((open: boolean) => {
      console.log('👁️ [DEBUG] Popover onOpenChange:', open);
      setIsOpen(open);
    }, []);

    // AI dev note: Callback para mudanças no campo de busca
    const handleSearchChange = useCallback((search: string) => {
      console.log(
        '🔍 [DEBUG] handleSearchChange - search value:',
        `"${search}"`
      );
      setSearchTerm(search);
    }, []);

    const renderPatientInfo = (patient: PatientOption) => {
      const hasResponsaveis =
        patient.responsavel_legal_nome ||
        patient.responsavel_financeiro_nome ||
        patient.nomes_responsaveis;
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

      const matchViaResponsavel =
        matchViaRespLegal || matchViaRespFinanceiro || matchViaRespGenerico;

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

            {/* AI dev note: Mostrar responsáveis quando relevante para a busca */}
            {patient.nomes_responsaveis &&
              (matchViaResponsavel || hasResponsaveis) && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">
                    Responsável: {patient.nomes_responsaveis}
                  </span>
                </div>
              )}

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
            className="w-[--radix-popover-trigger-width] p-1"
            align="start"
          >
            <Command shouldFilter={false} className="overflow-hidden">
              <CommandInput
                placeholder="Digite para buscar pacientes..."
                value={searchTerm}
                onValueChange={handleSearchChange}
                className="h-9"
              />
              <CommandList className="overflow-y-auto">
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
