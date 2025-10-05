import React, { useState, useCallback } from 'react';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import { MapPin } from 'lucide-react';
import { ProgressIndicator } from '@/components/composed/ProgressIndicator';
import { cn } from '@/lib/utils';
import {
  fetchAddressByCep,
  type EnderecoViaCepData,
} from '@/lib/enderecos-api';
import { Loader2, MapPin, Check } from 'lucide-react';

// AI dev note: AddressStep - Etapa de cadastro de endereço do responsável
// Integra com ViaCEP para busca automática por CEP
// Verifica se endereço já existe no banco (UNIQUE constraint no CEP)

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

    // Formatar CEP automaticamente
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
    };

    // Buscar CEP via ViaCEP
    const handleSearchCep = useCallback(async () => {
      console.log('🔍 [AddressStep] Buscando CEP:', cep);

      if (!cep) {
        setErrors((prev) => ({ ...prev, cep: 'Digite um CEP para buscar' }));
        return;
      }

      const cleanCep = cep.replace(/\D/g, '');
      if (cleanCep.length !== 8) {
        setErrors((prev) => ({ ...prev, cep: 'CEP deve ter 8 dígitos' }));
        return;
      }

      setIsSearchingCep(true);
      setErrors((prev) => ({ ...prev, cep: '' }));

      try {
        const result = await fetchAddressByCep(cep);

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
    }, [cep]);

    // Permitir busca com Enter
    const handleCepKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSearchCep();
      }
    };

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
      <div className={cn('w-full max-w-md mx-auto space-y-6', className)}>
        <ProgressIndicator currentStep={4} totalSteps={10} />

        {/* Título */}
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">
            Endereço do Responsável
          </h2>
          <p className="text-sm text-muted-foreground">
            Informe o endereço residencial para cadastro
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* CEP com busca */}
          <div className="space-y-2">
            <Label htmlFor="cep" className="text-base">
              CEP <span className="text-destructive">*</span>
            </Label>
            <div className="flex gap-2">
              <Input
                id="cep"
                type="text"
                placeholder="00000-000"
                value={cep}
                onChange={(e) => handleCepChange(e.target.value)}
                onKeyDown={handleCepKeyDown}
                maxLength={9}
                className={cn(
                  'h-12 text-base flex-1',
                  errors.cep && 'border-destructive'
                )}
              />
              <Button
                type="button"
                onClick={handleSearchCep}
                disabled={isSearchingCep || cep.replace(/\D/g, '').length !== 8}
                size="lg"
                className="h-12 px-6"
              >
                {isSearchingCep ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Buscando...
                  </>
                ) : cepFound ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Buscar
                  </>
                ) : (
                  <>
                    <MapPin className="w-4 h-4 mr-2" />
                    Buscar
                  </>
                )}
              </Button>
            </div>
            {errors.cep && (
              <p className="text-sm text-destructive">{errors.cep}</p>
            )}
            {cepFound && (
              <p className="text-sm text-green-600 dark:text-green-400 flex items-center">
                <Check className="w-4 h-4 mr-1" />
                Endereço encontrado
              </p>
            )}
          </div>

          {/* Logradouro */}
          <div className="space-y-2">
            <Label htmlFor="logradouro" className="text-base">
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
              disabled={isSearchingCep}
              className={cn(
                'h-12 text-base',
                errors.logradouro && 'border-destructive'
              )}
            />
            {errors.logradouro && (
              <p className="text-sm text-destructive">{errors.logradouro}</p>
            )}
          </div>

          {/* Número e Complemento */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="numero" className="text-base">
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
                className={cn(
                  'h-12 text-base',
                  errors.numero && 'border-destructive'
                )}
              />
              {errors.numero && (
                <p className="text-sm text-destructive">{errors.numero}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="complemento" className="text-base">
                Complemento
              </Label>
              <Input
                id="complemento"
                type="text"
                placeholder="Apto 101"
                value={complemento}
                onChange={(e) => setComplemento(e.target.value)}
                className="h-12 text-base"
              />
            </div>
          </div>

          {/* Bairro */}
          <div className="space-y-2">
            <Label htmlFor="bairro" className="text-base">
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
              disabled={isSearchingCep}
              className={cn(
                'h-12 text-base',
                errors.bairro && 'border-destructive'
              )}
            />
            {errors.bairro && (
              <p className="text-sm text-destructive">{errors.bairro}</p>
            )}
          </div>

          {/* Cidade e Estado */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cidade" className="text-base">
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
                disabled={isSearchingCep}
                className={cn(
                  'h-12 text-base',
                  errors.cidade && 'border-destructive'
                )}
              />
              {errors.cidade && (
                <p className="text-sm text-destructive">{errors.cidade}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="estado" className="text-base">
                Estado <span className="text-destructive">*</span>
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
                disabled={isSearchingCep}
                maxLength={2}
                className={cn(
                  'h-12 text-base',
                  errors.estado && 'border-destructive'
                )}
              />
              {errors.estado && (
                <p className="text-sm text-destructive">{errors.estado}</p>
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            💡 Digite o CEP e clique em "Buscar" para preenchimento automático
          </p>

          {/* Botões */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              className="flex-1"
            >
              Voltar
            </Button>
            <Button type="submit" className="flex-1">
              Continuar
            </Button>
          </div>
        </form>
      </div>
    );
  }
);

AddressStep.displayName = 'AddressStep';
