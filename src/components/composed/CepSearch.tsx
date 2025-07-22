import React, { useState } from 'react';
import { Search, Loader2, MapPin } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import { Card, CardContent } from '@/components/primitives/card';
import { cn } from '@/lib/utils';
import { fetchAddressByCep, type EnderecoViaCepData } from '@/lib/enderecos-api';

// AI dev note: CepSearch é um componente Composed para busca de CEP
// Integra com ViaCEP e permite preenchimento automático de endereços

export interface CepSearchProps {
  cep: string;
  onCepChange: (cep: string) => void;
  onAddressFound: (address: EnderecoViaCepData) => void;
  disabled?: boolean;
  showAddressPreview?: boolean;
  className?: string;
}

export const CepSearch: React.FC<CepSearchProps> = ({
  cep,
  onCepChange,
  onAddressFound,
  disabled = false,
  showAddressPreview = true,
  className
}) => {
  const [isSearching, setIsSearching] = useState(false);
  const [foundAddress, setFoundAddress] = useState<EnderecoViaCepData | null>(null);
  const [error, setError] = useState<string>('');

  // Formatar CEP automaticamente
  const handleCepChange = (value: string) => {
    // Remover caracteres não numéricos
    const numericValue = value.replace(/\D/g, '');
    
    // Aplicar máscara CEP
    const formattedCep = numericValue.replace(/^(\d{5})(\d)/, '$1-$2');
    
    onCepChange(formattedCep);
    
    // Limpar endereço anterior se CEP foi alterado
    if (foundAddress && formattedCep !== foundAddress.cep) {
      setFoundAddress(null);
      setError('');
    }
  };

  const handleSearchCep = async () => {
    if (!cep) {
      setError('Digite um CEP para buscar');
      return;
    }

    setIsSearching(true);
    setError('');
    setFoundAddress(null);

    try {
      const result = await fetchAddressByCep(cep);
      
      if (result.success && result.data) {
        setFoundAddress(result.data);
        onAddressFound(result.data);
      } else {
        setError(result.error || 'CEP não encontrado');
      }
    } catch (error) {
      setError('Erro ao buscar CEP');
      console.error('Erro na busca de CEP:', error);
    } finally {
      setIsSearching(false);
    }
  };

  // Permitir busca com Enter
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearchCep();
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Campo CEP com botão de busca */}
      <div className="space-y-2">
        <Label htmlFor="cep">CEP</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="cep"
              type="text"
              placeholder="12345-678"
              value={cep}
              onChange={(e) => handleCepChange(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={disabled || isSearching}
              className="pl-10"
              maxLength={9}
            />
          </div>
          
          <Button
            type="button"
            variant="outline"
            onClick={handleSearchCep}
            disabled={disabled || isSearching || !cep || cep.length < 9}
            className="px-4"
          >
            {isSearching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {isSearching ? 'Buscando...' : 'Buscar'}
          </Button>
        </div>
        
        {/* Mensagem de erro */}
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
      </div>

      {/* Preview do endereço encontrado */}
      {showAddressPreview && foundAddress && (
        <Card className="bg-green-50 border-green-200">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div className="space-y-1">
                <p className="font-medium text-green-800">
                  Endereço encontrado:
                </p>
                <p className="text-sm text-green-700">
                  {foundAddress.logradouro}
                </p>
                <p className="text-sm text-green-700">
                  {foundAddress.bairro} - {foundAddress.cidade}/{foundAddress.estado}
                </p>
                <p className="text-xs text-green-600">
                  CEP: {foundAddress.cep}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

CepSearch.displayName = 'CepSearch'; 