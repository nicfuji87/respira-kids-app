// AI dev note: PatientsList - Componente Composed para lista paginada de pacientes
// Lista com 20 itens por página, busca integrada e navegação para detalhes
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { fetchPatients } from '@/lib/patient-api';
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
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalPatients, setTotalPatients] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('nome');

  const navigate = useNavigate();
  const ITEMS_PER_PAGE = 20;

  // AI dev note: Alfabeto para navegação
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  // AI dev note: Função para carregar pacientes com debounce
  const loadPatients = useCallback(
    async (
      search: string,
      page: number,
      letter?: string | null,
      sort?: SortOption
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
          sort || 'nome'
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

  // AI dev note: Carregar inicial
  useEffect(() => {
    loadPatients('', 1, selectedLetter, sortBy);
  }, [loadPatients, selectedLetter, sortBy]);

  // AI dev note: Debounce para busca - removido currentPage da dependência
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setCurrentPage(1); // Sempre resetar para página 1 ao buscar
      loadPatients(searchTerm, 1, selectedLetter, sortBy);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchTerm, selectedLetter, sortBy, loadPatients]);

  // AI dev note: Carregar pacientes quando a página muda
  useEffect(() => {
    if (currentPage > 1) {
      loadPatients(searchTerm, currentPage, selectedLetter, sortBy);
    }
  }, [currentPage, loadPatients, searchTerm, selectedLetter, sortBy]);

  // AI dev note: Função para navegar para detalhes do paciente
  const handlePatientClick = (patientId: string) => {
    if (onPatientSelect) {
      onPatientSelect(patientId);
    } else {
      navigate(`/pacientes/${patientId}`);
    }
  };

  // AI dev note: Funções de paginação
  const goToFirstPage = () => {
    if (currentPage !== 1 && !loading) {
      setCurrentPage(1);
    }
  };
  const goToPrevPage = () => {
    if (currentPage > 1 && !loading) {
      setCurrentPage(currentPage - 1);
    }
  };
  const goToNextPage = () => {
    if (currentPage < totalPages && !loading) {
      setCurrentPage(currentPage + 1);
    }
  };
  const goToLastPage = () => {
    if (currentPage !== totalPages && !loading) {
      setCurrentPage(totalPages);
    }
  };

  // AI dev note: Funções de navegação por letra
  const handleLetterClick = (letter: string) => {
    setSelectedLetter(letter);
    setSearchTerm(''); // Limpar busca ao selecionar letra
    setCurrentPage(1);
  };

  const clearLetterFilter = () => {
    setSelectedLetter(null);
    setCurrentPage(1);
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
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Campo de busca com autocomplete */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
          <Input
            type="text"
            placeholder="Buscar pacientes por nome, email, telefone ou CPF..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-4"
          />
          {searchLoading && (
            <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Filtro de ordenação */}
        <div className="flex gap-2">
          <Button
            variant={sortBy === 'nome' ? 'default' : 'outline'}
            size="default"
            onClick={() => {
              setSortBy('nome');
              setCurrentPage(1);
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
              setSortBy('updated_at');
              setSelectedLetter(null); // Limpar filtro de letra ao ordenar por data
              setCurrentPage(1);
            }}
            className="flex items-center gap-2"
          >
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">Últimos atualizados</span>
          </Button>
        </div>
      </div>

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
        // Skeleton loading
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, index) => (
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
                        {/* Bolinha de status de pagamento */}
                        {(patient.total_consultas_pagamento || 0) > 0 && (
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-3 h-3 rounded-full ${
                                patient.todas_consultas_pagas
                                  ? 'bg-green-500' // Verde se todas pagas
                                  : patient.tem_consultas_atrasadas
                                    ? 'bg-red-500' // Vermelho se tem atrasadas
                                    : 'bg-yellow-500' // Amarelo se tem pendentes
                              }`}
                              title={
                                patient.todas_consultas_pagas
                                  ? 'Todas as consultas pagas'
                                  : patient.tem_consultas_atrasadas
                                    ? `${patient.consultas_atrasadas} consulta${patient.consultas_atrasadas !== 1 ? 's' : ''} atrasada${patient.consultas_atrasadas !== 1 ? 's' : ''}`
                                    : `${patient.consultas_pendentes} consulta${patient.consultas_pendentes !== 1 ? 's' : ''} pendente${patient.consultas_pendentes !== 1 ? 's' : ''}`
                              }
                            />
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
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={goToPrevPage}
            disabled={currentPage === 1 || loading}
          >
            <ChevronLeft className="h-4 w-4" />
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
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={goToLastPage}
            disabled={currentPage === totalPages || loading}
          >
            <ChevronsRight className="h-4 w-4" />
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
