import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import { cn } from '@/lib/utils';
import {
  searchPediatricians,
  type PediatricianSearchResult,
} from '@/lib/pediatra-api';
import { Loader2, Search, UserPlus, Check } from 'lucide-react';

// AI dev note: PediatricianStep - Etapa de seleção/cadastro de pediatra
// Usa autocomplete inteligente para evitar duplicação de cadastros
// Remove prefixos "Dr.", "Dra." automaticamente antes de buscar
// Permite cadastro de novo pediatra se não encontrado

export interface PediatricianData {
  id?: string; // Se existente, ID da pessoa_pediatra
  pessoaId?: string; // Se existente, ID da pessoas
  nome: string;
  crm?: string;
  isNew: boolean; // true se é um novo pediatra sendo cadastrado
  noPediatrician?: boolean; // true se não possui pediatra
}

export interface PediatricianStepProps {
  onContinue: (data: PediatricianData) => void;
  onBack?: () => void;
  initialData?: Partial<PediatricianData>;
  className?: string;
}

export const PediatricianStep = React.memo<PediatricianStepProps>(
  ({ onContinue, onBack, initialData, className }) => {
    const [nome, setNome] = useState(initialData?.nome || '');
    const [crm, setCrm] = useState(initialData?.crm || '');
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<
      PediatricianSearchResult[]
    >([]);
    const [selectedPediatrician, setSelectedPediatrician] =
      useState<PediatricianSearchResult | null>(null);
    const [showNewPediatricianForm, setShowNewPediatricianForm] =
      useState(false);
    const [noPediatrician, setNoPediatrician] = useState(
      initialData?.noPediatrician || false
    );
    const [errors, setErrors] = useState<Record<string, string>>({});

    // Validar se começou com Dr. ou Dra.
    const startsWithDoctor = /^(dr\.?|dra\.?)\s+/i.test(nome.trim());

    // Debounce para busca
    useEffect(() => {
      const timeoutId = setTimeout(() => {
        if (startsWithDoctor) {
          // Se começou com Dr./Dra., mostrar erro
          setErrors({
            nome: 'Não é necessário colocar "Dr." ou "Dra.". Digite apenas o nome do pediatra.',
          });
          setSearchResults([]);
          return;
        }

        if (
          nome.trim().length >= 2 &&
          !selectedPediatrician &&
          !showNewPediatricianForm
        ) {
          handleSearch(nome);
        } else if (nome.trim().length < 2) {
          setSearchResults([]);
        }
      }, 500);

      return () => clearTimeout(timeoutId);
    }, [nome]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSearch = useCallback(async (searchTerm: string) => {
      console.log('🔍 [PediatricianStep] Buscando pediatra:', searchTerm);

      setIsSearching(true);

      try {
        const results = await searchPediatricians(searchTerm);
        console.log('✅ [PediatricianStep] Resultados:', results);
        setSearchResults(results);
      } catch (error) {
        console.error('❌ [PediatricianStep] Erro ao buscar:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, []);

    const handleSelectPediatrician = useCallback(
      (pediatrician: PediatricianSearchResult) => {
        console.log(
          '✅ [PediatricianStep] Pediatra selecionado:',
          pediatrician
        );

        setSelectedPediatrician(pediatrician);
        setNome(pediatrician.nome);
        setCrm(pediatrician.crm || '');
        setSearchResults([]);
        setShowNewPediatricianForm(false);

        if (errors.nome) setErrors((prev) => ({ ...prev, nome: '' }));
      },
      [errors.nome]
    );

    const handleCreateNew = useCallback(() => {
      console.log('🆕 [PediatricianStep] Criar novo pediatra');

      setShowNewPediatricianForm(true);
      setSearchResults([]);
      setSelectedPediatrician(null);
    }, []);

    const handleClearSelection = useCallback(() => {
      console.log('🔄 [PediatricianStep] Limpar seleção');

      setSelectedPediatrician(null);
      setShowNewPediatricianForm(false);
      setSearchResults([]);
    }, []);

    const validateForm = useCallback((): boolean => {
      const newErrors: Record<string, string> = {};

      // Se não possui pediatra, está ok
      if (noPediatrician) {
        return true;
      }

      if (!nome.trim()) {
        newErrors.nome =
          'Nome do pediatra é obrigatório ou selecione "Não possui pediatra"';
      } else if (nome.trim().length < 3) {
        newErrors.nome = 'Nome deve ter pelo menos 3 caracteres';
      }

      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    }, [nome, noPediatrician]);

    const handleContinue = useCallback(() => {
      if (!validateForm()) {
        return;
      }

      const pediatricianData: PediatricianData = noPediatrician
        ? {
            nome: 'Não Informado',
            isNew: true,
            noPediatrician: true,
          }
        : {
            nome: nome.trim(),
            isNew: !selectedPediatrician,
            ...(selectedPediatrician && {
              id: selectedPediatrician.id,
              pessoaId: selectedPediatrician.pessoaId,
            }),
            ...(crm.trim() && { crm: crm.trim() }),
          };

      onContinue(pediatricianData);
    }, [
      nome,
      crm,
      selectedPediatrician,
      validateForm,
      onContinue,
      noPediatrician,
    ]);

    return (
      <div className={cn('w-full px-4 space-y-6', className)}>
        {/* Título */}
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold text-foreground">
            Pediatra do Paciente
          </h2>
          <p className="text-xs text-muted-foreground">
            Informe o pediatra que acompanha o paciente
          </p>
        </div>

        <div className="space-y-5">
          {/* Opção: Não possui pediatra */}
          <div className="flex items-center space-x-3 p-3 bg-muted/50 rounded-lg border border-border">
            <input
              type="checkbox"
              id="no-pediatrician"
              checked={noPediatrician}
              onChange={(e) => {
                setNoPediatrician(e.target.checked);
                if (e.target.checked) {
                  setNome('');
                  setSelectedPediatrician(null);
                  setSearchResults([]);
                  setShowNewPediatricianForm(false);
                  setErrors({});
                }
              }}
              className="w-4 h-4 text-primary focus:ring-primary border-gray-300 rounded"
            />
            <Label
              htmlFor="no-pediatrician"
              className="flex-1 cursor-pointer text-base"
            >
              Não possui pediatra
            </Label>
          </div>

          {!noPediatrician && (
            <>
              {/* Campo de busca/nome */}
              <div className="space-y-2">
                <Label htmlFor="nome" className="text-base">
                  Nome do Pediatra <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                    {isSearching ? (
                      <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
                    ) : (
                      <Search className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <Input
                    id="nome"
                    type="text"
                    placeholder="Digite o nome do pediatra..."
                    value={nome}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      setNome(newValue);
                      if (selectedPediatrician) handleClearSelection();

                      // Validar se começa com Dr./Dra.
                      if (/^(dr\.?|dra\.?)\s+/i.test(newValue.trim())) {
                        setErrors({
                          nome: 'Não é necessário colocar "Dr." ou "Dra.". Digite apenas o nome do pediatra.',
                        });
                      } else if (errors.nome) {
                        setErrors((prev) => ({ ...prev, nome: '' }));
                      }
                    }}
                    disabled={!!selectedPediatrician}
                    className={cn(
                      'h-12 text-base pl-10 pr-10',
                      errors.nome && 'border-destructive',
                      selectedPediatrician &&
                        'bg-green-50 dark:bg-green-950/20 border-green-500'
                    )}
                  />
                  {selectedPediatrician && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                  )}
                </div>
                {errors.nome && (
                  <p className="text-sm text-destructive">{errors.nome}</p>
                )}
                {selectedPediatrician && (
                  <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                      <p className="text-sm font-medium text-green-900 dark:text-green-100">
                        Pediatra selecionado
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleClearSelection}
                      className="h-8 text-xs"
                    >
                      Alterar
                    </Button>
                  </div>
                )}
              </div>

              {/* Resultados da busca */}
              {searchResults.length > 0 && !selectedPediatrician && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <Label className="text-sm font-medium">
                    Pediatras encontrados:
                  </Label>
                  <div className="border border-border rounded-lg divide-y divide-border max-h-60 overflow-y-auto">
                    {searchResults.map((result) => (
                      <button
                        key={result.id}
                        type="button"
                        onClick={() => handleSelectPediatrician(result)}
                        className="w-full p-3 text-left hover:bg-accent transition-colors"
                      >
                        <div className="font-medium">{result.nome}</div>
                        {result.crm && (
                          <div className="text-sm text-muted-foreground mt-1">
                            CRM: {result.crm}
                            {result.especialidade &&
                              ` • ${result.especialidade}`}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCreateNew}
                    className="w-full"
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    Não encontrei, cadastrar novo pediatra
                  </Button>
                </div>
              )}

              {/* Sem resultados */}
              {!isSearching &&
                searchResults.length === 0 &&
                nome.trim().length >= 2 &&
                !selectedPediatrician &&
                !showNewPediatricianForm && (
                  <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg animate-in fade-in duration-300">
                    <p className="text-sm text-amber-900 dark:text-amber-100 mb-3">
                      Nenhum pediatra encontrado com esse nome.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCreateNew}
                      className="w-full"
                    >
                      <UserPlus className="w-4 h-4 mr-2" />
                      Cadastrar novo pediatra
                    </Button>
                  </div>
                )}

              <p className="text-xs text-muted-foreground pt-2">
                💡 Digite ao menos 2 caracteres para buscar. Não é necessário
                colocar "Dr." ou "Dra.".
              </p>
            </>
          )}
        </div>

        {/* Botões de navegação */}
        <div className="flex gap-3">
          {onBack && (
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              size="lg"
              className="flex-1 h-12 text-base"
            >
              Voltar
            </Button>
          )}
          <Button
            onClick={handleContinue}
            size="lg"
            className="flex-1 h-12 text-base font-semibold"
            disabled={(!nome.trim() && !noPediatrician) || isSearching}
          >
            Continuar
          </Button>
        </div>
      </div>
    );
  }
);

PediatricianStep.displayName = 'PediatricianStep';
