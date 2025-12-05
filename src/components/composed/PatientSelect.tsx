import React, { useState, useEffect, useCallback } from 'react';
import { Phone, Mail, Check, ChevronsUpDown, X, Loader2 } from 'lucide-react';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/primitives/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/primitives/avatar';
import { cn, normalizeText } from '@/lib/utils';
import { searchPacientes, fetchPacienteById } from '@/lib/calendar-services';
import type { SupabasePessoa } from '@/types/supabase-calendar';

// AI dev note: PatientSelect com BUSCA SERVER-SIDE
// A busca é feita diretamente no Supabase, não carrega todos os pacientes no cliente
// Isso permite escalar para milhares de pacientes sem problemas de performance
// Solução para o problema do limite de 1000 registros do Supabase

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
  nomes_responsaveis?: string;
  cpf_cnpj?: string | null;
  responsavel_legal_nome?: string;
  responsavel_legal_email?: string;
  responsavel_legal_telefone?: number;
  responsavel_legal_cpf?: string | null;
  responsavel_financeiro_nome?: string;
  responsavel_financeiro_email?: string;
  responsavel_financeiro_telefone?: number;
  responsavel_financeiro_cpf?: string | null;
}

// AI dev note: Hook para debounce de busca - 300ms para server-side
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
    // AI dev note: Estado separado para resultados da busca e paciente selecionado
    const [searchResults, setSearchResults] = useState<PatientOption[]>([]);
    const [selectedPatient, setSelectedPatient] =
      useState<PatientOption | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    // AI dev note: Detectar se é mobile para usar modal fullscreen
    useEffect(() => {
      const checkMobile = () => {
        setIsMobile(window.innerWidth <= 768 || 'ontouchstart' in window);
      };
      checkMobile();
      window.addEventListener('resize', checkMobile);
      return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // AI dev note: Debounce de 300ms para busca server-side (evita muitas requisições)
    const debouncedSearch = useDebounce(searchTerm, 300);

    // AI dev note: Carregar dados do paciente selecionado quando value mudar
    useEffect(() => {
      const loadSelectedPatient = async () => {
        if (!value) {
          setSelectedPatient(null);
          return;
        }

        // Se já temos o paciente em cache, não buscar novamente
        if (selectedPatient?.id === value) {
          return;
        }

        // Verificar se está nos resultados da busca
        const fromResults = searchResults.find((p) => p.id === value);
        if (fromResults) {
          setSelectedPatient(fromResults);
          return;
        }

        // Buscar do servidor
        const patient = await fetchPacienteById(value);
        if (patient) {
          setSelectedPatient(patient as PatientOption);
        }
      };

      loadSelectedPatient().catch(console.error);
    }, [value, searchResults, selectedPatient?.id]);

    // AI dev note: BUSCA SERVER-SIDE - Buscar no Supabase quando digitar
    useEffect(() => {
      const performSearch = async () => {
        if (!debouncedSearch || debouncedSearch.trim().length < 2) {
          setSearchResults([]);
          return;
        }

        setIsSearching(true);

        try {
          const results = await searchPacientes(debouncedSearch);
          setSearchResults(results as PatientOption[]);
        } catch (err) {
          console.error('Erro na busca:', err);
          setSearchResults([]);
        } finally {
          setIsSearching(false);
        }
      };

      performSearch().catch(console.error);
    }, [debouncedSearch]);

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

    const getInitials = (name: string): string => {
      return name
        .split(' ')
        .map((word) => word.charAt(0))
        .join('')
        .substring(0, 2)
        .toUpperCase();
    };

    const handlePatientSelect = useCallback(
      (patient: PatientOption) => {
        setSelectedPatient(patient);
        onValueChange(patient.id);
        setIsOpen(false);
        setSearchTerm('');
      },
      [onValueChange]
    );

    const handleSearchChange = useCallback((search: string) => {
      setSearchTerm(search);
    }, []);

    const renderPatientInfo = (patient: PatientOption) => {
      const isSelected = value === patient.id;
      const normalizedSearch = normalizeText(debouncedSearch);

      // Detectar se match foi via responsável
      const matchViaNome =
        patient.nome && normalizeText(patient.nome).includes(normalizedSearch);
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
            <Avatar className="h-8 w-8 ring-1 ring-border">
              {patient.foto_perfil ? (
                <AvatarImage
                  src={patient.foto_perfil}
                  alt={patient.nome}
                  className="object-cover"
                />
              ) : (
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                  {getInitials(patient.nome)}
                </AvatarFallback>
              )}
            </Avatar>
            {isSelected && <Check className="h-4 w-4 text-primary" />}
          </div>

          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{patient.nome}</span>
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

    // AI dev note: Mensagem de status da busca
    const getStatusMessage = () => {
      if (isSearching) {
        return (
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Buscando...</span>
          </div>
        );
      }
      if (searchTerm.length < 2) {
        return 'Digite pelo menos 2 caracteres para buscar';
      }
      if (searchResults.length === 0) {
        return 'Nenhum paciente encontrado';
      }
      return null;
    };

    return (
      <div className={cn('space-y-2', className)}>
        {isMobile ? (
          <>
            <Button
              variant="outline"
              onClick={() => setIsOpen(true)}
              disabled={disabled}
              className={cn(
                'w-full justify-between text-left font-normal',
                !selectedPatient && 'text-muted-foreground',
                error && 'border-destructive'
              )}
            >
              {selectedPatient ? (
                <span className="truncate">{selectedPatient.nome}</span>
              ) : (
                <span>{placeholder}</span>
              )}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
              <DialogContent className="h-full max-h-full sm:max-h-[90vh] p-0 flex flex-col">
                <DialogHeader className="px-4 py-3 border-b">
                  <DialogTitle className="flex items-center justify-between">
                    <span>Selecionar Paciente</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setIsOpen(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </DialogTitle>
                </DialogHeader>

                <div className="px-4 py-3 border-b">
                  <input
                    type="text"
                    placeholder="Buscar por nome, email, telefone ou CPF..."
                    value={searchTerm}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="w-full p-2 border rounded-md outline-none text-sm"
                    autoFocus
                  />
                </div>

                <div className="flex-1 overflow-y-auto px-4">
                  {searchResults.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      {getStatusMessage()}
                    </div>
                  ) : (
                    <div className="py-2">
                      {searchResults.map((patient) => (
                        <div
                          key={patient.id}
                          onClick={() => handlePatientSelect(patient)}
                          className="p-3 hover:bg-accent cursor-pointer rounded-md mb-2"
                        >
                          {renderPatientInfo(patient)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </>
        ) : (
          <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                disabled={disabled}
                className={cn(
                  'w-full justify-between text-left font-normal',
                  !selectedPatient && 'text-muted-foreground',
                  error && 'border-destructive'
                )}
              >
                {selectedPatient ? (
                  <span className="truncate">{selectedPatient.nome}</span>
                ) : (
                  <span>{placeholder}</span>
                )}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[600px] p-0"
              align="start"
              sideOffset={5}
            >
              <div className="flex flex-col max-h-[400px]">
                <div className="flex items-center border-b px-3 py-2">
                  <input
                    type="text"
                    placeholder="Buscar por nome, email, telefone ou CPF..."
                    value={searchTerm}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="flex-1 outline-none text-sm"
                    autoFocus
                  />
                  {isSearching && (
                    <Loader2 className="h-4 w-4 animate-spin ml-2 text-muted-foreground" />
                  )}
                </div>

                <div className="overflow-y-auto" style={{ maxHeight: '350px' }}>
                  {searchResults.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      {getStatusMessage()}
                    </div>
                  ) : (
                    <div>
                      {searchResults.map((patient) => (
                        <div
                          key={patient.id}
                          onClick={() => handlePatientSelect(patient)}
                          className="p-3 hover:bg-accent cursor-pointer border-b last:border-b-0"
                        >
                          {renderPatientInfo(patient)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }
);

PatientSelect.displayName = 'PatientSelect';
