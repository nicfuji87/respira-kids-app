import React, { useState, useCallback } from 'react';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import { Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  fetchAddressByCep,
  type EnderecoViaCepData,
} from '@/lib/enderecos-api';

// AI dev note: AddressStep - Etapa de cadastro de endereço do responsável
// Integra com ViaCEP para busca automática por CEP
// Verifica se endereço já existe no banco (UNIQUE constraint no CEP)
// IMPORTANTE: Após buscar o CEP, os campos logradouro/bairro/cidade/estado são bloqueados
// Apenas número e complemento permanecem editáveis (evita duplicação de CEPs no banco)

export interface AddressData {
  cep: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  estado: string;
  numero: string;
  complemento?: string;
}

export interface AddressStepProps {
  onContinue: (data: AddressData) => void;
  onBack?: () => void;
  initialData?: Partial<AddressData>;
  className?: string;
}

export const AddressStep = React.memo<AddressStepProps>(
  ({ onContinue, onBack, initialData, className }) => {
    const [cep, setCep] = useState(initialData?.cep || '');
    const [logradouro, setLogradouro] = useState(initialData?.logradouro || '');
    const [bairro, setBairro] = useState(initialData?.bairro || '');
    const [cidade, setCidade] = useState(initialData?.cidade || '');
    const [estado, setEstado] = useState(initialData?.estado || '');
    const [numero, setNumero] = useState(initialData?.numero || '');
    const [complemento, setComplemento] = useState(
      initialData?.complemento || ''
    );

    const [isSearchingCep, setIsSearchingCep] = useState(false);
    const [cepFound, setCepFound] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    console.log('📍 [AddressStep] Renderizado');

    // Formatar CEP automaticamente e buscar quando completo
    const handleCepChange = (value: string) => {
      const numericValue = value.replace(/\D/g, '');
      const formattedCep = numericValue.replace(/^(\d{5})(\d)/, '$1-$2');

      setCep(formattedCep);

      // Limpar endereço anterior se CEP foi alterado
      if (cepFound && formattedCep !== initialData?.cep) {
        setLogradouro('');
        setBairro('');
        setCidade('');
        setEstado('');
        setCepFound(false);
      }

      if (errors.cep) setErrors((prev) => ({ ...prev, cep: '' }));

      // Buscar automaticamente quando CEP estiver completo (8 dígitos)
      if (numericValue.length === 8) {
        handleSearchCepAuto(formattedCep);
      }
    };

    // Buscar CEP via ViaCEP (automática)
    const handleSearchCepAuto = useCallback(async (cepToSearch: string) => {
      console.log(
        '🔍 [AddressStep] Buscando CEP automaticamente:',
        cepToSearch
      );

      const cleanCep = cepToSearch.replace(/\D/g, '');
      if (cleanCep.length !== 8) {
        return;
      }

      setIsSearchingCep(true);
      setErrors((prev) => ({ ...prev, cep: '' }));

      try {
        const result = await fetchAddressByCep(cepToSearch);

        if (result.success && result.data) {
          console.log('✅ [AddressStep] CEP encontrado:', result.data);

          const addressData: EnderecoViaCepData = result.data;
          setLogradouro(addressData.logradouro);
          setBairro(addressData.bairro);
          setCidade(addressData.cidade);
          setEstado(addressData.estado);
          setCepFound(true);
        } else {
          console.log('❌ [AddressStep] CEP não encontrado');
          setErrors((prev) => ({
            ...prev,
            cep: result.error || 'CEP não encontrado',
          }));
          setCepFound(false);
        }
      } catch (error) {
        console.error('❌ [AddressStep] Erro ao buscar CEP:', error);
        setErrors((prev) => ({
          ...prev,
          cep: 'Erro ao buscar CEP. Tente novamente.',
        }));
        setCepFound(false);
      } finally {
        setIsSearchingCep(false);
      }
    }, []);

    const validateForm = useCallback((): boolean => {
      const newErrors: Record<string, string> = {};

      if (!cep) {
        newErrors.cep = 'CEP é obrigatório';
      } else if (cep.replace(/\D/g, '').length !== 8) {
        newErrors.cep = 'CEP inválido';
      }

      if (!logradouro.trim()) {
        newErrors.logradouro = 'Logradouro é obrigatório';
      }

      if (!bairro.trim()) {
        newErrors.bairro = 'Bairro é obrigatório';
      }

      if (!cidade.trim()) {
        newErrors.cidade = 'Cidade é obrigatória';
      }

      if (!estado.trim()) {
        newErrors.estado = 'Estado é obrigatório';
      } else if (estado.trim().length !== 2) {
        newErrors.estado = 'Estado deve ser uma sigla de 2 caracteres (ex: SP, RJ, MG)';
      }

      if (!numero.trim()) {
        newErrors.numero = 'Número é obrigatório';
      }

      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    }, [cep, logradouro, bairro, cidade, estado, numero]);

    const handleSubmit = useCallback(
      (e: React.FormEvent) => {
        e.preventDefault();
        console.log('➡️ [AddressStep] handleSubmit');

        if (!validateForm()) {
          console.log('❌ [AddressStep] Validação falhou:', errors);
          return;
        }

        const addressData: AddressData = {
          cep: cep.replace(/\D/g, ''), // Salvar sem formatação
          logradouro: logradouro.trim(),
          bairro: bairro.trim(),
          cidade: cidade.trim(),
          estado: estado.trim(),
          numero: numero.trim(),
          ...(complemento.trim() && { complemento: complemento.trim() }),
        };

        console.log('✅ [AddressStep] Dados válidos:', addressData);
        console.log('🔍 [DEBUG] Estado details:', {
          raw: estado,
          trimmed: estado.trim(),
          length: estado.trim().length,
        });
        onContinue(addressData);
      },
      [
        cep,
        logradouro,
        bairro,
        cidade,
        estado,
        numero,
        complemento,
        validateForm,
        onContinue,
        errors,
      ]
    );

    return (
      <div className={cn('w-full px-4 space-y-6', className)}>
        {/* Título sem container */}
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold text-foreground">
            Endereço do Responsável
          </h2>
          <p className="text-xs text-muted-foreground">
            Informe o endereço residencial para cadastro
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* CEP com busca */}
          <div className="space-y-1.5">
            <Label
              htmlFor="cep"
              className="text-xs text-muted-foreground font-normal"
            >
              CEP <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id="cep"
                type="text"
                placeholder="00000-000"
                value={cep}
                onChange={(e) => handleCepChange(e.target.value)}
                maxLength={9}
                className={cn(
                  'h-12 text-base',
                  errors.cep && 'border-destructive'
                )}
                disabled={isSearchingCep}
              />
              {isSearchingCep && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
            {errors.cep && (
              <p className="text-sm text-destructive">{errors.cep}</p>
            )}
            {cepFound && (
              <p className="text-sm text-green-600 dark:text-green-400 flex items-center">
                <Check className="w-4 h-4 mr-1" />
                Endereço encontrado. Informe apenas o número e complemento.
              </p>
            )}
          </div>

          {/* Logradouro */}
          <div className="space-y-1.5">
            <Label
              htmlFor="logradouro"
              className="text-xs text-muted-foreground font-normal"
            >
              Logradouro <span className="text-destructive">*</span>
            </Label>
            <Input
              id="logradouro"
              type="text"
              placeholder="Rua, Avenida, Travessa..."
              value={logradouro}
              onChange={(e) => {
                setLogradouro(e.target.value);
                if (errors.logradouro)
                  setErrors((prev) => ({ ...prev, logradouro: '' }));
              }}
              disabled={isSearchingCep || cepFound}
              className={cn('h-11', errors.logradouro && 'border-destructive')}
            />
            {errors.logradouro && (
              <p className="text-xs text-destructive">{errors.logradouro}</p>
            )}
          </div>

          {/* Bairro */}
          <div className="space-y-1.5">
            <Label
              htmlFor="bairro"
              className="text-xs text-muted-foreground font-normal"
            >
              Bairro <span className="text-destructive">*</span>
            </Label>
            <Input
              id="bairro"
              type="text"
              placeholder="Centro, Jardim..."
              value={bairro}
              onChange={(e) => {
                setBairro(e.target.value);
                if (errors.bairro)
                  setErrors((prev) => ({ ...prev, bairro: '' }));
              }}
              disabled={isSearchingCep || cepFound}
              className={cn('h-11', errors.bairro && 'border-destructive')}
            />
            {errors.bairro && (
              <p className="text-xs text-destructive">{errors.bairro}</p>
            )}
          </div>

          {/* Cidade e Estado */}
          <div className="grid grid-cols-[1fr,100px] gap-3">
            <div className="space-y-1.5">
              <Label
                htmlFor="cidade"
                className="text-xs text-muted-foreground font-normal"
              >
                Cidade <span className="text-destructive">*</span>
              </Label>
              <Input
                id="cidade"
                type="text"
                placeholder="Brasília"
                value={cidade}
                onChange={(e) => {
                  setCidade(e.target.value);
                  if (errors.cidade)
                    setErrors((prev) => ({ ...prev, cidade: '' }));
                }}
                disabled={isSearchingCep || cepFound}
                className={cn('h-11', errors.cidade && 'border-destructive')}
              />
              {errors.cidade && (
                <p className="text-xs text-destructive">{errors.cidade}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="estado"
                className="text-xs text-muted-foreground font-normal"
              >
                UF <span className="text-destructive">*</span>
              </Label>
              <Input
                id="estado"
                type="text"
                placeholder="DF"
                value={estado}
                onChange={(e) => {
                  setEstado(e.target.value.toUpperCase());
                  if (errors.estado)
                    setErrors((prev) => ({ ...prev, estado: '' }));
                }}
                disabled={isSearchingCep || cepFound}
                maxLength={2}
                className={cn(
                  'h-11 text-center',
                  errors.estado && 'border-destructive'
                )}
              />
              {errors.estado && (
                <p className="text-xs text-destructive">{errors.estado}</p>
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground/70 italic">
            💡 O endereço será preenchido automaticamente ao digitar o CEP
            completo
          </p>

          {/* Número e Complemento */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label
                htmlFor="numero"
                className="text-xs text-muted-foreground font-normal"
              >
                Número <span className="text-destructive">*</span>
              </Label>
              <Input
                id="numero"
                type="text"
                placeholder="123"
                value={numero}
                onChange={(e) => {
                  setNumero(e.target.value);
                  if (errors.numero)
                    setErrors((prev) => ({ ...prev, numero: '' }));
                }}
                className={cn('h-11', errors.numero && 'border-destructive')}
              />
              {errors.numero && (
                <p className="text-xs text-destructive">{errors.numero}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="complemento"
                className="text-xs text-muted-foreground font-normal"
              >
                Complemento
              </Label>
              <Input
                id="complemento"
                type="text"
                placeholder="Apto 101"
                value={complemento}
                onChange={(e) => setComplemento(e.target.value)}
                className="h-11"
              />
            </div>
          </div>

          {/* Botões */}
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              className="flex-1 h-12"
            >
              Voltar
            </Button>
            <Button type="submit" className="flex-1 h-12">
              Continuar
            </Button>
          </div>
        </form>
      </div>
    );
  }
);

AddressStep.displayName = 'AddressStep';
