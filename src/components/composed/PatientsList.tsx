// AI dev note: PatientsList - Componente Composed para lista paginada de pacientes
// Lista com 20 itens por página, busca integrada e navegação para detalhes
// AI dev note: busca/letra/filtros/página vivem na URL (useSearchParams) para
// que voltar do detalhe restaure exatamente a vista; atualizações usam
// replace:true para não poluir o histórico a cada tecla/filtro.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search,
  User,
  Calendar,
  Phone,
  Mail,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  Stethoscope,
  Shield,
  Clock,
  SortAsc,
  Filter,
  CalendarDays,
  FileSignature,
} from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Card, CardContent } from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';
import { Skeleton } from '@/components/primitives/skeleton';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/primitives/avatar';
import { cn } from '@/lib/utils';
import { fetchPatients, type ContractStatusFilter } from '@/lib/patient-api';
import { fetchPediatras, type Pediatra } from '@/lib/pediatra-api';
import type { Usuario } from '@/types/usuarios';

export interface PatientsListProps {
  className?: string;
  onPatientSelect?: (patientId: string) => void;
}

type SortOption = 'nome' | 'updated_at';

export const PatientsList: React.FC<PatientsListProps> = ({
  className,
  onPatientSelect,
}) => {
  const [patients, setPatients] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [totalPatients, setTotalPatients] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);

  // AI dev note: Estado da vista derivado da URL (fonte de verdade). Params:
  // q, pagina, letra, ordem, pediatras (ids separados por vírgula), atend, contrato
  const [searchParams, setSearchParams] = useSearchParams();

  const searchTerm = searchParams.get('q') ?? '';
  const currentPage = (() => {
    const n = parseInt(searchParams.get('pagina') ?? '1', 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  })();
  const selectedLetter = searchParams.get('letra');
  const sortBy: SortOption =
    searchParams.get('ordem') === 'updated_at' ? 'updated_at' : 'nome';
  const pediatrasParam = searchParams.get('pediatras') ?? '';
  const selectedPediatras = useMemo(
    () => (pediatrasParam ? pediatrasParam.split(',').filter(Boolean) : []),
    [pediatrasParam]
  );
  const lastAppointmentDays = (() => {
    const raw = searchParams.get('atend');
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  })();
  const contractStatusParam = searchParams.get('contrato');
  const contractStatus: ContractStatusFilter | null =
    contractStatusParam === 'assinado' ||
    contractStatusParam === 'pendente' ||
    contractStatusParam === 'sem_contrato'
      ? contractStatusParam
      : null;

  // Helper único para atualizar a URL (null/'' remove o param)
  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(updates)) {
            if (value === null || value === '') {
              next.delete(key);
            } else {
              next.set(key, value);
            }
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  // Campo de busca local (a URL só é atualizada após o debounce)
  const [searchInput, setSearchInput] = useState(searchTerm);

  // AI dev note: Filtro de pediatras
  const [pediatras, setPediatras] = useState<Pediatra[]>([]);
  const [pediatrasLoading, setPediatrasLoading] = useState(true);
  const [showPediatraFilter, setShowPediatraFilter] = useState(false);

  // AI dev note: Filtro de último atendimento (customDays é só o input transitório)
  const [customDays, setCustomDays] = useState<string>('');
  const [showAppointmentFilter, setShowAppointmentFilter] = useState(false);

  // AI dev note: Filtro de status de contrato (assinado/pendente/sem_contrato)
  const [showContractFilter, setShowContractFilter] = useState(false);

  const navigate = useNavigate();
  const ITEMS_PER_PAGE = 20;

  // AI dev note: Alfabeto para navegação
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  // AI dev note: Carregar lista de pediatras para o filtro
  useEffect(() => {
    const loadPediatras = async () => {
      try {
        setPediatrasLoading(true);
        const data = await fetchPediatras();
        setPediatras(data);
      } catch (error) {
        console.error('Erro ao carregar pediatras:', error);
      } finally {
        setPediatrasLoading(false);
      }
    };
    loadPediatras();
  }, []);

  // AI dev note: Função para carregar pacientes com debounce
  const loadPatients = useCallback(
    async (
      search: string,
      page: number,
      letter?: string | null,
      sort?: SortOption,
      pediatraIds?: string[],
      appointmentDays?: number | null,
      contractStatusFilter?: ContractStatusFilter | null
    ) => {
      try {
        if (page === 1) {
          setSearchLoading(true);
          setLoading(false); // Garantir que loading principal não está ativo
        } else {
          setLoading(true);
          setSearchLoading(false); // Garantir que search loading não está ativo
        }
        setError(null);

        const response = await fetchPatients(
          search,
          page,
          ITEMS_PER_PAGE,
          letter || undefined,
          sort || 'nome',
          pediatraIds,
          appointmentDays || undefined,
          contractStatusFilter || null
        );

        if (response.success && response.data) {
          setPatients(response.data.data);
          setTotalPages(response.data.totalPages);
          setTotalPatients(response.data.total);
        } else {
          setError(response.error || 'Erro ao carregar pacientes');
          setPatients([]);
        }
      } catch (err) {
        console.error('Erro ao carregar pacientes:', err);
        setError('Erro ao carregar pacientes');
        setPatients([]);
      } finally {
        setLoading(false);
        setSearchLoading(false);
      }
    },
    []
  );

  // AI dev note: Efeito ÚNICO de carga — dispara sempre que a vista (URL)
  // muda. Também roda no mount, restaurando exatamente a vista ao voltar do
  // detalhe do paciente.
  useEffect(() => {
    loadPatients(
      searchTerm,
      currentPage,
      selectedLetter,
      sortBy,
      selectedPediatras,
      lastAppointmentDays,
      contractStatus
    );
  }, [
    loadPatients,
    searchTerm,
    currentPage,
    selectedLetter,
    sortBy,
    selectedPediatras,
    lastAppointmentDays,
    contractStatus,
  ]);

  // AI dev note: Debounce da busca — o input local só vai para a URL (param q)
  // após 300ms sem digitação; mudar a busca sempre volta para a página 1
  useEffect(() => {
    if (searchInput === searchTerm) return;
    const timeoutId = setTimeout(() => {
      updateParams({ q: searchInput || null, pagina: null });
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchInput, searchTerm, updateParams]);

  // AI dev note: Funções para filtro de pediatras
  const handlePediatraToggle = (pediatraId: string) => {
    const next = selectedPediatras.includes(pediatraId)
      ? selectedPediatras.filter((id) => id !== pediatraId)
      : [...selectedPediatras, pediatraId];
    updateParams({ pediatras: next.join(',') || null, pagina: null });
  };

  const clearPediatraFilter = () => {
    updateParams({ pediatras: null, pagina: null });
  };

  // AI dev note: Funções para filtro de último atendimento
  const appointmentFilterOptions = [
    { label: '7 dias', value: 7 },
    { label: '14 dias', value: 14 },
    { label: '30 dias', value: 30 },
    { label: '60 dias', value: 60 },
    { label: '90 dias', value: 90 },
  ];

  const handleAppointmentFilterChange = (days: number | null) => {
    setCustomDays('');
    updateParams({ atend: days ? String(days) : null, pagina: null });
  };

  const handleCustomDaysApply = () => {
    const days = parseInt(customDays, 10);
    if (!isNaN(days) && days > 0) {
      updateParams({ atend: String(days), pagina: null });
    }
  };

  const clearAppointmentFilter = () => {
    setCustomDays('');
    updateParams({ atend: null, pagina: null });
  };

  // AI dev note: Funções para filtro de status de contrato
  const contractStatusOptions: Array<{
    value: ContractStatusFilter;
    label: string;
    description: string;
  }> = [
    {
      value: 'assinado',
      label: 'Assinado',
      description: 'Pacientes com contrato assinado',
    },
    {
      value: 'pendente',
      label: 'Pendente de assinatura',
      description: 'Contrato gerado aguardando assinatura',
    },
    {
      value: 'sem_contrato',
      label: 'Sem contrato',
      description: 'Pacientes que ainda não possuem contrato',
    },
  ];

  const handleContractStatusChange = (status: ContractStatusFilter | null) => {
    updateParams({ contrato: status, pagina: null });
  };

  const clearContractFilter = () => {
    updateParams({ contrato: null, pagina: null });
  };

  const contractStatusLabel = (status: ContractStatusFilter): string =>
    contractStatusOptions.find((o) => o.value === status)?.label ?? '';

  // AI dev note: Função para navegar para detalhes do paciente
  const handlePatientClick = (patientId: string) => {
    if (onPatientSelect) {
      onPatientSelect(patientId);
    } else {
      navigate(`/pacientes/${patientId}`);
    }
  };

  // AI dev note: Funções de paginação (página 1 = sem param na URL)
  const setPage = (page: number) => {
    updateParams({ pagina: page <= 1 ? null : String(page) });
  };
  const goToFirstPage = () => {
    if (currentPage !== 1 && !loading) {
      setPage(1);
    }
  };
  const goToPrevPage = () => {
    if (currentPage > 1 && !loading) {
      setPage(currentPage - 1);
    }
  };
  const goToNextPage = () => {
    if (currentPage < totalPages && !loading) {
      setPage(currentPage + 1);
    }
  };
  const goToLastPage = () => {
    if (currentPage !== totalPages && !loading) {
      setPage(totalPages);
    }
  };

  // AI dev note: Funções de navegação por letra
  const handleLetterClick = (letter: string) => {
    setSearchInput(''); // Limpar busca ao selecionar letra
    updateParams({ letra: letter, q: null, pagina: null });
  };

  const clearLetterFilter = () => {
    updateParams({ letra: null, pagina: null });
  };

  // AI dev note: Função para formatar telefone
  const formatPhone = (phone: number | bigint | null) => {
    if (!phone) return null;
    const phoneStr = phone.toString();
    if (phoneStr.length === 11) {
      return phoneStr.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    } else if (phoneStr.length === 10) {
      return phoneStr.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    }
    return phoneStr;
  };

  // AI dev note: Extrair iniciais do nome para fallback do avatar
  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .map((word) => word.charAt(0))
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  // AI dev note: Função para calcular idade com suporte a meses para bebês
  const calculateAge = (birthDate: string | null) => {
    if (!birthDate) return null;
    const today = new Date();
    const birth = new Date(birthDate);
    let ageInYears = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();

    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birth.getDate())
    ) {
      ageInYears--;
    }

    // Se tem 0 ou 1 ano, calcular em meses
    if (ageInYears <= 1) {
      let ageInMonths = (today.getFullYear() - birth.getFullYear()) * 12;
      ageInMonths -= birth.getMonth();
      ageInMonths += today.getMonth();

      // Ajustar se o dia atual for menor que o dia de nascimento
      if (today.getDate() < birth.getDate()) {
        ageInMonths--;
      }

      ageInMonths = Math.max(0, ageInMonths);

      // Se tem menos de 24 meses, mostrar em meses
      if (ageInMonths < 24) {
        return `${ageInMonths} ${ageInMonths === 1 ? 'mês' : 'meses'}`;
      }
    }

    return `${ageInYears} ${ageInYears === 1 ? 'ano' : 'anos'}`;
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Campo de busca e filtros */}
      {/* AI dev note: busca ocupa a linha toda (w-full) até xl; filtros usam flex-wrap.
          Antes o container virava uma única linha já em sm (640px), espremendo a busca
          em tablets/telas médias - o campo ficava minúsculo e o texto digitado não aparecia. */}
      <div className="flex flex-col xl:flex-row gap-3">
        {/* Campo de busca com autocomplete */}
        <div className="relative w-full xl:flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
          <Input
            type="text"
            placeholder="Buscar pacientes por nome, email, telefone ou CPF..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-10 pr-4"
          />
          {searchLoading && (
            <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Filtros - AI dev note: flex-wrap permite que os botoes quebrem linha em
            telas menores, mantendo a busca utilizavel */}
        <div className="flex flex-wrap gap-2">
          {/* Filtro de ordenação */}
          <div className="flex gap-2">
            <Button
              variant={sortBy === 'nome' ? 'default' : 'outline'}
              size="default"
              onClick={() => {
                updateParams({ ordem: null, pagina: null });
              }}
              className="flex items-center gap-2"
            >
              <SortAsc className="h-4 w-4" />
              <span className="hidden sm:inline">Alfabético</span>
            </Button>
            <Button
              variant={sortBy === 'updated_at' ? 'default' : 'outline'}
              size="default"
              onClick={() => {
                // Limpar filtro de letra ao ordenar por data
                updateParams({
                  ordem: 'updated_at',
                  letra: null,
                  pagina: null,
                });
              }}
              className="flex items-center gap-2"
            >
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">Últimos atualizados</span>
            </Button>
          </div>

          {/* Botão de filtro de pediatras */}
          <Button
            variant={selectedPediatras.length > 0 ? 'default' : 'outline'}
            size="default"
            onClick={() => setShowPediatraFilter(!showPediatraFilter)}
            className="flex items-center gap-2"
          >
            <Filter className="h-4 w-4" />
            <span className="hidden sm:inline">Pediatras</span>
            {selectedPediatras.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {selectedPediatras.length}
              </Badge>
            )}
          </Button>

          {/* Botão de filtro de último atendimento */}
          <Button
            variant={lastAppointmentDays !== null ? 'default' : 'outline'}
            size="default"
            onClick={() => setShowAppointmentFilter(!showAppointmentFilter)}
            className="flex items-center gap-2"
          >
            <CalendarDays className="h-4 w-4" />
            <span className="hidden sm:inline">Último Atend.</span>
            {lastAppointmentDays !== null && (
              <Badge variant="secondary" className="ml-1">
                {lastAppointmentDays}d
              </Badge>
            )}
          </Button>

          {/* Botão de filtro de status de contrato */}
          <Button
            variant={contractStatus !== null ? 'default' : 'outline'}
            size="default"
            onClick={() => setShowContractFilter(!showContractFilter)}
            className="flex items-center gap-2"
          >
            <FileSignature className="h-4 w-4" />
            <span className="hidden sm:inline">Contrato</span>
            {contractStatus !== null && (
              <Badge variant="secondary" className="ml-1">
                {contractStatusLabel(contractStatus)}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      {/* Filtro de pediatras expandido */}
      {showPediatraFilter && (
        <div className="p-4 bg-muted/50 rounded-lg space-y-3 border">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium flex items-center gap-2">
              <Stethoscope className="h-4 w-4" />
              Filtrar por Pediatra
            </span>
            {selectedPediatras.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearPediatraFilter}
                className="text-xs"
              >
                Limpar filtro
              </Button>
            )}
          </div>

          {pediatrasLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando pediatras...
            </div>
          ) : pediatras.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Nenhum pediatra cadastrado
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1 pr-2">
              {pediatras.map((pediatra) => (
                <label
                  key={pediatra.id}
                  className="flex items-center gap-3 p-2 rounded-md hover:bg-muted cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedPediatras.includes(pediatra.id)}
                    onChange={() => handlePediatraToggle(pediatra.id)}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm">{pediatra.nome}</span>
                </label>
              ))}
            </div>
          )}

          {/* Pediatras selecionados */}
          {selectedPediatras.length > 0 && (
            <div className="text-sm text-muted-foreground pt-2 border-t">
              <strong>{selectedPediatras.length}</strong> pediatra(s)
              selecionado(s)
            </div>
          )}
        </div>
      )}

      {/* Filtro de último atendimento expandido */}
      {showAppointmentFilter && (
        <div className="p-4 bg-muted/50 rounded-lg space-y-3 border">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Filtrar por Último Atendimento
            </span>
            {lastAppointmentDays !== null && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAppointmentFilter}
                className="text-xs"
              >
                Limpar filtro
              </Button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {appointmentFilterOptions.map((option) => (
              <Button
                key={option.value}
                variant={
                  lastAppointmentDays === option.value ? 'default' : 'outline'
                }
                size="sm"
                onClick={() => handleAppointmentFilterChange(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>

          {/* Input personalizado */}
          <div className="flex items-center gap-2">
            <Input
              type="number"
              placeholder="Dias personalizados"
              value={customDays}
              onChange={(e) => setCustomDays(e.target.value)}
              className="w-40"
              min="1"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleCustomDaysApply}
              disabled={!customDays || parseInt(customDays, 10) <= 0}
            >
              Aplicar
            </Button>
          </div>

          {/* Info do filtro ativo */}
          {lastAppointmentDays !== null && (
            <div className="text-sm text-muted-foreground pt-2 border-t">
              Mostrando pacientes com atendimentos nos últimos{' '}
              <strong>{lastAppointmentDays}</strong> dias
            </div>
          )}
        </div>
      )}

      {/* Filtro de status de contrato expandido */}
      {showContractFilter && (
        <div className="p-4 bg-muted/50 rounded-lg space-y-3 border">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium flex items-center gap-2">
              <FileSignature className="h-4 w-4" />
              Filtrar por Status de Contrato
            </span>
            {contractStatus !== null && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearContractFilter}
                className="text-xs"
              >
                Limpar filtro
              </Button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {contractStatusOptions.map((option) => (
              <Button
                key={option.value}
                variant={
                  contractStatus === option.value ? 'default' : 'outline'
                }
                size="sm"
                onClick={() => handleContractStatusChange(option.value)}
                title={option.description}
              >
                {option.label}
              </Button>
            ))}
          </div>

          {/* Info do filtro ativo */}
          {contractStatus !== null && (
            <div className="text-sm text-muted-foreground pt-2 border-t">
              Mostrando pacientes com contrato{' '}
              <strong>
                {contractStatusLabel(contractStatus).toLowerCase()}
              </strong>
            </div>
          )}
        </div>
      )}

      {/* Navegação alfabética - apenas quando ordenado alfabeticamente */}
      {sortBy === 'nome' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1">
            <Button
              variant={selectedLetter === null ? 'default' : 'outline'}
              size="sm"
              onClick={clearLetterFilter}
              className="h-8 w-12 text-xs"
            >
              Todos
            </Button>
            {ALPHABET.map((letter) => (
              <Button
                key={letter}
                variant={selectedLetter === letter ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleLetterClick(letter)}
                className="h-8 w-8 text-xs p-0"
              >
                {letter}
              </Button>
            ))}
          </div>

          {selectedLetter && (
            <div className="text-sm text-muted-foreground">
              Mostrando pacientes que começam com "{selectedLetter}"
            </div>
          )}
        </div>
      )}

      {/* Indicador de ordenação por últimos atualizados */}
      {sortBy === 'updated_at' && (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Clock className="h-4 w-4" />
          <span>Mostrando pacientes ordenados por últimos atualizados</span>
        </div>
      )}

      {/* Informações de resultados */}
      {!loading && !error && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {totalPatients > 0
              ? `${totalPatients} paciente${totalPatients !== 1 ? 's' : ''} encontrado${totalPatients !== 1 ? 's' : ''}`
              : 'Nenhum paciente encontrado'}
          </span>
          {totalPages > 1 && (
            <span>
              Página {currentPage} de {totalPages}
            </span>
          )}
        </div>
      )}

      {/* Lista de pacientes */}
      {loading && currentPage === 1 ? (
        // Skeleton loading (páginas têm 20 itens; 10 equilibra fidelidade e render)
        <div className="space-y-4">
          {Array.from({ length: 10 }).map((_, index) => (
            <Card key={index}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-40" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : patients.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              Nenhum paciente encontrado
            </h3>
            <p className="text-muted-foreground">
              {searchTerm
                ? 'Tente ajustar os termos de busca'
                : 'Não há pacientes cadastrados no sistema'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {patients.map((patient) => (
            <Card
              key={patient.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => handlePatientClick(patient.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  {/* AI dev note: Avatar com foto de perfil do paciente */}
                  <Avatar className="h-12 w-12 shrink-0 ring-2 ring-border">
                    {patient.foto_perfil ? (
                      <AvatarImage
                        src={patient.foto_perfil}
                        alt={patient.nome}
                        className="object-cover"
                      />
                    ) : (
                      <AvatarFallback className="bg-primary/10 text-primary font-medium">
                        {getInitials(patient.nome)}
                      </AvatarFallback>
                    )}
                  </Avatar>

                  {/* Informações principais */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-lg truncate">
                          {patient.nome}
                        </h3>

                        {/* Informações básicas */}
                        <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-muted-foreground">
                          {patient.data_nascimento && (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              <span>
                                {calculateAge(patient.data_nascimento)}
                              </span>
                            </div>
                          )}

                          {patient.telefone && (
                            <div className="flex items-center gap-1">
                              <Phone className="h-4 w-4" />
                              <span>{formatPhone(patient.telefone)}</span>
                            </div>
                          )}

                          {patient.email && (
                            <div className="flex items-center gap-1">
                              <Mail className="h-4 w-4" />
                              <span className="truncate">{patient.email}</span>
                            </div>
                          )}
                        </div>

                        {/* Responsável Legal */}
                        {patient.responsavel_legal_nome && (
                          <div className="flex items-center gap-1 mt-2">
                            <Shield className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">
                              Responsável: {patient.responsavel_legal_nome}
                            </span>
                          </div>
                        )}

                        {/* Pediatras */}
                        {patient.pediatras_nomes && (
                          <div className="flex items-center gap-1 mt-2">
                            <Stethoscope className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">
                              Pediatra: {patient.pediatras_nomes}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Status de pagamento e consultas */}
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {/* AI dev note: Badge com TEXTO (não só cor/tooltip) —
                            estado de pagamento legível sem hover e acessível */}
                        {(patient.total_consultas_pagamento || 0) > 0 && (
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-xs font-medium',
                                patient.todas_consultas_pagas
                                  ? 'border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300'
                                  : patient.tem_consultas_atrasadas
                                    ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300'
                                    : 'border-yellow-300 bg-yellow-50 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-300'
                              )}
                            >
                              {patient.todas_consultas_pagas
                                ? 'Em dia'
                                : patient.tem_consultas_atrasadas
                                  ? `${patient.consultas_atrasadas} atrasada${patient.consultas_atrasadas !== 1 ? 's' : ''}`
                                  : `${patient.consultas_pendentes} pendente${patient.consultas_pendentes !== 1 ? 's' : ''}`}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {patient.consultas_pagas}/
                              {patient.total_consultas_pagamento}
                            </span>
                          </div>
                        )}

                        {/* Badge de total de consultas */}
                        {patient.total_agendamentos > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {patient.total_agendamentos} consulta
                            {patient.total_agendamentos !== 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={goToFirstPage}
            disabled={currentPage === 1 || loading}
            aria-label="Primeira página"
          >
            <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={goToPrevPage}
            disabled={currentPage === 1 || loading}
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>

          <div className="flex items-center gap-2 px-4">
            <span className="text-sm text-muted-foreground">
              Página {currentPage} de {totalPages}
            </span>
            {loading && (
              <Loader2 className="h-4 w-4 animate-spin text-primary ml-2" />
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={goToNextPage}
            disabled={currentPage === totalPages || loading}
            aria-label="Próxima página"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={goToLastPage}
            disabled={currentPage === totalPages || loading}
            aria-label="Última página"
          >
            <ChevronsRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      )}

      {/* Loading para mudança de página */}
      {loading && currentPage > 1 && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">
            Carregando página {currentPage}...
          </span>
        </div>
      )}
    </div>
  );
};

PatientsList.displayName = 'PatientsList';
