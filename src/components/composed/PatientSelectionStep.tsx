import React, { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/primitives/input';
import { Button } from '@/components/primitives/button';
import { Checkbox } from '@/components/primitives/checkbox';
import { Search, AlertTriangle, Users, ChevronRight } from 'lucide-react';
import { cn, formatDateBR } from '@/lib/utils';
import {
  fetchPatientsByResponsible,
  searchPatientsByName,
  type PatientWithResponsible,
  type PatientSearchResult,
} from '@/lib/financial-responsible-api';

// AI dev note: PatientSelectionStep - Seleção de pacientes para vincular responsável financeiro
// Mostra lista de pacientes vinculados ao responsável ou busca por nome
// Permite seleção múltipla via checkboxes

export interface SelectedPatient {
  id: string;
  nome: string;
  data_nascimento: string | null;
  responsavel_legal_nome: string | null;
}

export interface PatientSelectionStepProps {
  responsibleId?: string; // Se responsável existe, buscar pacientes vinculados
  onContinue: (selectedPatients: SelectedPatient[]) => void;
  onBack?: () => void;
  className?: string;
}

export const PatientSelectionStep = React.memo<PatientSelectionStepProps>(
  ({ responsibleId, onContinue, onBack, className }) => {
    const [viewMode, setViewMode] = useState<'list' | 'search'>(
      responsibleId ? 'list' : 'search'
    );
    const [linkedPatients, setLinkedPatients] = useState<
      PatientWithResponsible[]
    >([]);
    const [searchResults, setSearchResults] = useState<PatientSearchResult[]>(
      []
    );
    const [selectedPatientIds, setSelectedPatientIds] = useState<Set<string>>(
      new Set()
    );
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    // Carregar pacientes vinculados ao responsável (se existir)
    useEffect(() => {
      if (!responsibleId || viewMode !== 'list') return;

      const loadLinkedPatients = async () => {
        setIsLoading(true);
        setErrorMessage('');

        try {
          const patients = await fetchPatientsByResponsible(responsibleId);
          setLinkedPatients(patients);

          if (patients.length === 0) {
            setErrorMessage('Nenhum paciente vinculado encontrado.');
            setViewMode('search');
          }
        } catch (error) {
          console.error('Erro ao carregar pacientes:', error);
          setErrorMessage('Erro ao carregar pacientes. Tente novamente.');
        } finally {
          setIsLoading(false);
        }
      };

      loadLinkedPatients();
    }, [responsibleId, viewMode]);

    // Buscar pacientes por nome (debounce de 500ms)
    useEffect(() => {
      if (viewMode !== 'search' || searchTerm.length < 3) {
        setSearchResults([]);
        return;
      }

      const timeoutId = setTimeout(async () => {
        setIsSearching(true);
        setErrorMessage('');

        try {
          const results = await searchPatientsByName(searchTerm);
          setSearchResults(results);

          if (results.length === 0) {
            setErrorMessage('Nenhum paciente encontrado com esse nome.');
          }
        } catch (error) {
          console.error('Erro na busca:', error);
          setErrorMessage('Erro ao buscar pacientes. Tente novamente.');
        } finally {
          setIsSearching(false);
        }
      }, 500);

      return () => clearTimeout(timeoutId);
    }, [searchTerm, viewMode]);

    // Handler para toggle de seleção
    const handleTogglePatient = useCallback((patientId: string) => {
      setSelectedPatientIds((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(patientId)) {
          newSet.delete(patientId);
        } else {
          newSet.add(patientId);
        }
        return newSet;
      });
    }, []);

    // Handler para continuar
    const handleContinue = useCallback(() => {
      const selectedPatients: SelectedPatient[] = [];

      if (viewMode === 'list') {
        linkedPatients.forEach((patient) => {
          if (selectedPatientIds.has(patient.id)) {
            selectedPatients.push({
              id: patient.id,
              nome: patient.nome,
              data_nascimento: patient.data_nascimento,
              responsavel_legal_nome: patient.responsavel_legal_nome,
            });
          }
        });
      } else {
        searchResults.forEach((patient) => {
          if (selectedPatientIds.has(patient.id)) {
            selectedPatients.push({
              id: patient.id,
              nome: patient.nome,
              data_nascimento: patient.data_nascimento,
              responsavel_legal_nome: patient.responsavel_legal_nome,
            });
          }
        });
      }

      onContinue(selectedPatients);
    }, [
      viewMode,
      linkedPatients,
      searchResults,
      selectedPatientIds,
      onContinue,
    ]);

    // Renderização
    return (
      <div className={cn('space-y-6', className)}>
        {/* Título e Descrição */}
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-respira-text-primary">
            Selecionar Paciente(s)
          </h2>
          <p className="text-sm text-respira-text-secondary">
            Selecione os pacientes que terão o responsável financeiro adicionado
          </p>
        </div>

        {/* Toggle de visualização */}
        {responsibleId && linkedPatients.length > 0 && (
          <div className="flex gap-2">
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('list')}
            >
              <Users className="h-4 w-4 mr-2" />
              Meus pacientes ({linkedPatients.length})
            </Button>
            <Button
              variant={viewMode === 'search' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('search')}
            >
              <Search className="h-4 w-4 mr-2" />
              Buscar por nome
            </Button>
          </div>
        )}

        {/* Lista de pacientes vinculados */}
        {viewMode === 'list' && (
          <div className="space-y-3">
            {isLoading ? (
              <p className="text-sm text-respira-text-secondary animate-pulse">
                Carregando pacientes...
              </p>
            ) : linkedPatients.length > 0 ? (
              <div className="space-y-2">
                {linkedPatients.map((patient) => (
                  <label
                    key={patient.id}
                    className={cn(
                      'flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors',
                      selectedPatientIds.has(patient.id)
                        ? 'border-respira-primary-500 bg-respira-primary-50'
                        : 'border-respira-primary-200 hover:border-respira-primary-300'
                    )}
                  >
                    <Checkbox
                      checked={selectedPatientIds.has(patient.id)}
                      onCheckedChange={() => handleTogglePatient(patient.id)}
                    />
                    <div className="flex-1 space-y-1">
                      <p className="font-medium text-respira-text-primary">
                        {patient.nome}
                      </p>
                      {patient.data_nascimento && (
                        <p className="text-xs text-respira-text-secondary">
                          {/* AI dev note: Usar formatDateBR para evitar bug de timezone */}
                          Nascimento: {formatDateBR(patient.data_nascimento)}
                        </p>
                      )}
                      {patient.responsavel_legal_nome && (
                        <p className="text-xs text-respira-text-secondary">
                          Resp. Legal: {patient.responsavel_legal_nome}
                        </p>
                      )}
                      {patient.responsavel_financeiro_nome && (
                        <p className="text-xs text-respira-warning">
                          Resp. Financeiro atual:{' '}
                          {patient.responsavel_financeiro_nome}
                        </p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        )}

        {/* Busca por nome */}
        {viewMode === 'search' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-respira-text-primary">
                Nome do paciente
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-respira-text-secondary" />
                <Input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Digite o nome completo do paciente (mínimo 3 caracteres)"
                  className="pl-10"
                />
              </div>

              {isSearching && (
                <p className="text-xs text-respira-text-secondary animate-pulse">
                  Buscando...
                </p>
              )}
            </div>

            {/* Resultados da busca */}
            {searchResults.length > 0 && (
              <div className="space-y-2">
                {searchResults.map((patient) => (
                  <label
                    key={patient.id}
                    className={cn(
                      'flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors',
                      selectedPatientIds.has(patient.id)
                        ? 'border-respira-primary-500 bg-respira-primary-50'
                        : 'border-respira-primary-200 hover:border-respira-primary-300'
                    )}
                  >
                    <Checkbox
                      checked={selectedPatientIds.has(patient.id)}
                      onCheckedChange={() => handleTogglePatient(patient.id)}
                    />
                    <div className="flex-1 space-y-1">
                      <p className="font-medium text-respira-text-primary">
                        {patient.nome}
                      </p>
                      {patient.data_nascimento && (
                        <p className="text-xs text-respira-text-secondary">
                          {/* AI dev note: Usar formatDateBR para evitar bug de timezone */}
                          Nascimento: {formatDateBR(patient.data_nascimento)}
                        </p>
                      )}
                      {patient.cidade && (
                        <p className="text-xs text-respira-text-secondary">
                          Cidade: {patient.cidade}
                        </p>
                      )}
                      {patient.responsavel_legal_nome && (
                        <p className="text-xs text-respira-text-secondary">
                          Resp. Legal: {patient.responsavel_legal_nome}
                        </p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Mensagem de erro */}
        {errorMessage && (
          <div className="flex items-center gap-2 text-sm text-respira-warning">
            <AlertTriangle className="h-4 w-4" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Contador de selecionados */}
        {selectedPatientIds.size > 0 && (
          <div className="p-3 bg-respira-primary-50 border border-respira-primary-200 rounded-lg">
            <p className="text-sm text-respira-text-primary">
              {selectedPatientIds.size} paciente(s) selecionado(s)
            </p>
          </div>
        )}

        {/* Botões de ação */}
        <div className="flex flex-col sm:flex-row gap-3">
          {onBack && (
            <Button variant="outline" onClick={onBack} className="sm:w-auto">
              Voltar
            </Button>
          )}
          <Button
            onClick={handleContinue}
            disabled={selectedPatientIds.size === 0}
            className="flex-1 sm:flex-none"
          >
            Continuar
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }
);

PatientSelectionStep.displayName = 'PatientSelectionStep';
