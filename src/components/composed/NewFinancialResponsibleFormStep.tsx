import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import { PhoneInput } from '@/components/primitives/PhoneInput';
import { Checkbox } from '@/components/primitives/checkbox';
import {
  Loader2,
  Check,
  AlertTriangle,
  ChevronRight,
  Database,
  Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  validateWhatsAppOnly,
  findPersonByCpf,
  findPersonByPhone,
} from '@/lib/financial-responsible-api';
import {
  fetchAddressByCep,
  type EnderecoViaCepDataExtended,
} from '@/lib/enderecos-api';

// AI dev note: NewFinancialResponsibleFormStep - Formulário completo de responsável financeiro
// Valida WhatsApp, busca pessoa existente por CPF/telefone
// Busca CEP primeiro no Supabase, depois no ViaCEP para reutilizar dados já cadastrados

export interface NewFinancialResponsibleData {
  phone: string; // Limpo (ex: 61981446666)
  nome: string;
  cpf: string; // Limpo (apenas números)
  email: string;
  endereco: {
    cep: string;
    logradouro: string;
    numero: string;
    complemento?: string;
    bairro: string;
    cidade: string;
    estado: string;
  };
  useSameAddress: boolean;
  existingPersonId?: string; // Se pessoa já existe
}

export interface NewFinancialResponsibleFormStepProps {
  onContinue: (data: NewFinancialResponsibleData) => void;
  onBack?: () => void;
  patientAddress?: {
    cep: string;
    logradouro: string;
    numero: string;
    complemento?: string;
    bairro: string;
    cidade: string;
    estado: string;
  };
  className?: string;
}

export const NewFinancialResponsibleFormStep =
  React.memo<NewFinancialResponsibleFormStepProps>(
    ({ onContinue, onBack, patientAddress, className }) => {
      // Estados do formulário
      const [phone, setPhone] = useState('');
      const [nome, setNome] = useState('');
      const [cpf, setCpf] = useState('');
      const [email, setEmail] = useState('');
      const [useSameAddress, setUseSameAddress] = useState(false);

      // Estados do endereço
      const [cep, setCep] = useState('');
      const [logradouro, setLogradouro] = useState('');
      const [numero, setNumero] = useState('');
      const [complemento, setComplemento] = useState('');
      const [bairro, setBairro] = useState('');
      const [cidade, setCidade] = useState('');
      const [estado, setEstado] = useState('');

      // Estados de validação
      const [isValidatingPhone, setIsValidatingPhone] = useState(false);
      const [phoneValid, setPhoneValid] = useState(false);
      const [isSearchingCep, setIsSearchingCep] = useState(false);
      const [cepFound, setCepFound] = useState(false);
      const [cepSource, setCepSource] = useState<'supabase' | 'viacep' | null>(
        null
      );
      const [existingPersonId, setExistingPersonId] = useState<string>();
      const [errors, setErrors] = useState<Record<string, string>>({});

      // Usar endereço do paciente
      useEffect(() => {
        if (useSameAddress && patientAddress) {
          setCep(patientAddress.cep);
          setLogradouro(patientAddress.logradouro);
          setNumero(patientAddress.numero);
          setComplemento(patientAddress.complemento || '');
          setBairro(patientAddress.bairro);
          setCidade(patientAddress.cidade);
          setEstado(patientAddress.estado);
          setCepFound(true);
        } else if (!useSameAddress) {
          // Limpar endereço ao desmarcar
          setCep('');
          setLogradouro('');
          setNumero('');
          setComplemento('');
          setBairro('');
          setCidade('');
          setEstado('');
          setCepFound(false);
        }
      }, [useSameAddress, patientAddress]);

      // Validar telefone (WhatsApp)
      useEffect(() => {
        const cleanPhone = phone.replace(/\D/g, '');
        if (cleanPhone.length !== 11) {
          setPhoneValid(false);
          return;
        }

        const timeoutId = setTimeout(async () => {
          setIsValidatingPhone(true);

          try {
            const result = await validateWhatsAppOnly(phone);
            setPhoneValid(result.exists);

            if (!result.exists) {
              setErrors((prev) => ({ ...prev, phone: 'WhatsApp inválido' }));
            } else {
              setErrors((prev) => ({ ...prev, phone: '' }));

              // Buscar se pessoa já existe por telefone
              const existingPerson = await findPersonByPhone(cleanPhone);
              if (existingPerson) {
                setExistingPersonId(existingPerson.id);
                setNome(existingPerson.nome);
                setCpf(existingPerson.cpf_cnpj || '');
                setEmail(existingPerson.email || '');
              }
            }
          } catch (error) {
            console.error('Erro ao validar WhatsApp:', error);
            setErrors((prev) => ({ ...prev, phone: 'Erro ao validar' }));
          } finally {
            setIsValidatingPhone(false);
          }
        }, 800);

        return () => clearTimeout(timeoutId);
      }, [phone]);

      // Buscar pessoa por CPF
      useEffect(() => {
        const cleanCpf = cpf.replace(/\D/g, '');
        if (cleanCpf.length !== 11) return;

        const timeoutId = setTimeout(async () => {
          try {
            const existingPerson = await findPersonByCpf(cleanCpf);
            if (existingPerson) {
              setExistingPersonId(existingPerson.id);
              setNome(existingPerson.nome);
              setEmail(existingPerson.email || '');
              setPhone(
                existingPerson.telefone
                  ? existingPerson.telefone.toString()
                  : ''
              );
            }
          } catch (error) {
            console.error('Erro ao buscar por CPF:', error);
          }
        }, 500);

        return () => clearTimeout(timeoutId);
      }, [cpf]);

      // Handler para buscar CEP
      const handleSearchCep = useCallback(async () => {
        const cleanCep = cep.replace(/\D/g, '');
        if (cleanCep.length !== 8) return;

        setIsSearchingCep(true);
        setErrors((prev) => ({ ...prev, cep: '' }));

        try {
          const result = await fetchAddressByCep(cep);

          if (result.success && result.data) {
            const addressData: EnderecoViaCepDataExtended = result.data;
            setLogradouro(addressData.logradouro);
            setBairro(addressData.bairro);
            setCidade(addressData.cidade);
            setEstado(addressData.estado);
            setCepFound(true);
            setCepSource(addressData.source);
          } else {
            setErrors((prev) => ({ ...prev, cep: 'CEP não encontrado' }));
            setCepFound(false);
            setCepSource(null);
          }
        } catch (error) {
          console.error('Erro ao buscar CEP:', error);
          setErrors((prev) => ({ ...prev, cep: 'Erro ao buscar CEP' }));
          setCepFound(false);
          setCepSource(null);
        } finally {
          setIsSearchingCep(false);
        }
      }, [cep]);

      // Auto-buscar CEP quando completo
      useEffect(() => {
        const cleanCep = cep.replace(/\D/g, '');
        if (cleanCep.length === 8 && !useSameAddress) {
          handleSearchCep();
        }
      }, [cep, useSameAddress, handleSearchCep]);

      // Validar formulário
      const validateForm = useCallback((): boolean => {
        const newErrors: Record<string, string> = {};

        if (!phoneValid)
          newErrors.phone = 'Telefone WhatsApp válido é obrigatório';
        if (!nome.trim()) newErrors.nome = 'Nome é obrigatório';
        if (cpf.replace(/\D/g, '').length !== 11)
          newErrors.cpf = 'CPF inválido';
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const hasSpecialChars = /[àáâãäåèéêëìíîïòóôõöùúûü]/i.test(email);

        if (!emailRegex.test(email)) {
          newErrors.email = 'E-mail inválido';
        } else if (hasSpecialChars) {
          newErrors.email =
            'E-mail não pode conter caracteres especiais (ã, ç, é, etc)';
        }

        if (!useSameAddress) {
          if (cep.replace(/\D/g, '').length !== 8)
            newErrors.cep = 'CEP inválido';
          if (!logradouro.trim())
            newErrors.logradouro = 'Logradouro é obrigatório';
          if (!numero.trim()) newErrors.numero = 'Número é obrigatório';
          if (!bairro.trim()) newErrors.bairro = 'Bairro é obrigatório';
          if (!cidade.trim()) newErrors.cidade = 'Cidade é obrigatória';
          if (!estado.trim()) newErrors.estado = 'Estado é obrigatório';
        } else if (patientAddress) {
          // Validar se endereço do paciente está completo
          if (!patientAddress.cep || !patientAddress.numero) {
            newErrors.useSameAddress = 'Endereço do paciente incompleto';
          }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
      }, [
        phoneValid,
        nome,
        cpf,
        email,
        useSameAddress,
        cep,
        logradouro,
        numero,
        bairro,
        cidade,
        estado,
        patientAddress,
      ]);

      // Handler para continuar
      const handleContinue = useCallback(() => {
        if (!validateForm()) return;

        const data: NewFinancialResponsibleData = {
          phone: phone.replace(/\D/g, ''),
          nome: nome.trim(),
          cpf: cpf.replace(/\D/g, ''),
          email: email.trim(),
          endereco:
            useSameAddress && patientAddress
              ? {
                  cep: patientAddress.cep,
                  logradouro: patientAddress.logradouro,
                  numero: patientAddress.numero,
                  complemento: patientAddress.complemento,
                  bairro: patientAddress.bairro,
                  cidade: patientAddress.cidade,
                  estado: patientAddress.estado,
                }
              : {
                  cep: cep.replace(/\D/g, ''),
                  logradouro,
                  numero,
                  complemento,
                  bairro,
                  cidade,
                  estado,
                },
          useSameAddress,
          existingPersonId,
        };

        onContinue(data);
      }, [
        validateForm,
        phone,
        nome,
        cpf,
        email,
        useSameAddress,
        patientAddress,
        cep,
        logradouro,
        numero,
        complemento,
        bairro,
        cidade,
        estado,
        existingPersonId,
        onContinue,
      ]);

      return (
        <div className={cn('space-y-6', className)}>
          {/* Título */}
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-respira-text-primary">
              Dados do Responsável Financeiro
            </h2>
            <p className="text-sm text-respira-text-secondary">
              Preencha os dados completos do responsável financeiro
            </p>
          </div>

          {/* Alerta se pessoa existe */}
          {existingPersonId && (
            <div className="p-3 bg-respira-primary-50 border border-respira-primary-200 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-respira-primary-600">
                <Check className="h-4 w-4" />
                <span>
                  Pessoa já cadastrada no sistema. Dados carregados
                  automaticamente.
                </span>
              </div>
            </div>
          )}

          {/* Formulário */}
          <div className="space-y-4">
            {/* Telefone */}
            <div className="space-y-2">
              <Label htmlFor="phone">WhatsApp *</Label>
              <PhoneInput
                value={phone}
                onChange={setPhone}
                placeholder="(00) 00000-0000"
                disabled={isValidatingPhone}
              />
              {isValidatingPhone && (
                <p className="text-xs text-respira-text-secondary animate-pulse">
                  Validando...
                </p>
              )}
              {phoneValid && (
                <div className="flex items-center gap-2 text-xs text-respira-success">
                  <Check className="h-3 w-3" />
                  <span>WhatsApp válido</span>
                </div>
              )}
              {errors.phone && (
                <div className="flex items-center gap-2 text-xs text-respira-error">
                  <AlertTriangle className="h-3 w-3" />
                  <span>{errors.phone}</span>
                </div>
              )}
            </div>

            {/* Nome */}
            <div className="space-y-2">
              <Label htmlFor="nome">Nome completo *</Label>
              <Input
                id="nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome completo"
              />
              {errors.nome && (
                <p className="text-xs text-respira-error">{errors.nome}</p>
              )}
            </div>

            {/* CPF */}
            <div className="space-y-2">
              <Label htmlFor="cpf">CPF *</Label>
              <Input
                id="cpf"
                value={cpf}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '');
                  const formatted = value.replace(
                    /(\d{3})(\d{3})(\d{3})(\d{2})/,
                    '$1.$2.$3-$4'
                  );
                  setCpf(formatted);
                }}
                placeholder="000.000.000-00"
                maxLength={14}
              />
              {errors.cpf && (
                <p className="text-xs text-respira-error">{errors.cpf}</p>
              )}
            </div>

            {/* E-mail */}
            <div className="space-y-2">
              <Label htmlFor="email">E-mail *</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemplo.com"
              />
              {errors.email && (
                <p className="text-xs text-respira-error">{errors.email}</p>
              )}
            </div>

            {/* Checkbox: Usar mesmo endereço */}
            {patientAddress && (
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={useSameAddress}
                  onCheckedChange={(checked) =>
                    setUseSameAddress(checked as boolean)
                  }
                />
                <span className="text-sm text-respira-text-primary">
                  Usar o mesmo endereço do paciente
                </span>
              </label>
            )}

            {/* Campos de endereço (se não usar mesmo endereço) */}
            {!useSameAddress && (
              <>
                {/* CEP */}
                <div className="space-y-2">
                  <Label htmlFor="cep">CEP *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="cep"
                      value={cep}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '');
                        const formatted = value.replace(
                          /^(\d{5})(\d)/,
                          '$1-$2'
                        );
                        setCep(formatted);
                      }}
                      placeholder="00000-000"
                      maxLength={9}
                    />
                    {isSearchingCep && (
                      <Loader2 className="h-5 w-5 animate-spin text-respira-primary-500" />
                    )}
                    {cepFound && (
                      <Check className="h-5 w-5 text-respira-success" />
                    )}
                  </div>
                  {errors.cep && (
                    <p className="text-xs text-respira-error">{errors.cep}</p>
                  )}
                  {cepFound && (
                    <div className="space-y-1">
                      <p className="text-xs text-respira-success flex items-center gap-1">
                        <Check className="h-3 w-3" />
                        {logradouro && bairro
                          ? 'Endereço encontrado. Informe apenas o número e complemento.'
                          : 'Endereço encontrado. Preencha os campos vazios manualmente.'}
                      </p>
                      <p className="text-xs text-respira-text-secondary flex items-center gap-1">
                        {cepSource === 'supabase' ? (
                          <>
                            <Database className="h-3 w-3" />
                            Dados do sistema
                          </>
                        ) : (
                          <>
                            <Globe className="h-3 w-3" />
                            Dados do ViaCEP
                          </>
                        )}
                      </p>
                    </div>
                  )}
                </div>

                {/* Logradouro */}
                <div className="space-y-2">
                  <Label htmlFor="logradouro">Logradouro *</Label>
                  <Input
                    id="logradouro"
                    value={logradouro}
                    onChange={(e) => setLogradouro(e.target.value)}
                    placeholder="Rua, Avenida, etc"
                    disabled={
                      cepFound &&
                      (cepSource === 'supabase' || logradouro !== '')
                    }
                  />
                  {errors.logradouro && (
                    <p className="text-xs text-respira-error">
                      {errors.logradouro}
                    </p>
                  )}
                </div>

                {/* Número e Complemento */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="numero">Número *</Label>
                    <Input
                      id="numero"
                      value={numero}
                      onChange={(e) => setNumero(e.target.value)}
                      placeholder="123"
                    />
                    {errors.numero && (
                      <p className="text-xs text-respira-error">
                        {errors.numero}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="complemento">Complemento</Label>
                    <Input
                      id="complemento"
                      value={complemento}
                      onChange={(e) => setComplemento(e.target.value)}
                      placeholder="Apto, Bloco, etc"
                    />
                  </div>
                </div>

                {/* Bairro */}
                <div className="space-y-2">
                  <Label htmlFor="bairro">Bairro *</Label>
                  <Input
                    id="bairro"
                    value={bairro}
                    onChange={(e) => setBairro(e.target.value)}
                    placeholder="Bairro"
                    disabled={
                      cepFound && (cepSource === 'supabase' || bairro !== '')
                    }
                  />
                  {errors.bairro && (
                    <p className="text-xs text-respira-error">
                      {errors.bairro}
                    </p>
                  )}
                </div>

                {/* Cidade e Estado */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cidade">Cidade *</Label>
                    <Input
                      id="cidade"
                      value={cidade}
                      onChange={(e) => setCidade(e.target.value)}
                      placeholder="Cidade"
                      disabled={
                        cepFound && (cepSource === 'supabase' || cidade !== '')
                      }
                    />
                    {errors.cidade && (
                      <p className="text-xs text-respira-error">
                        {errors.cidade}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="estado">Estado *</Label>
                    <Input
                      id="estado"
                      value={estado}
                      onChange={(e) => setEstado(e.target.value.toUpperCase())}
                      placeholder="UF"
                      maxLength={2}
                      disabled={
                        cepFound && (cepSource === 'supabase' || estado !== '')
                      }
                    />
                    {errors.estado && (
                      <p className="text-xs text-respira-error">
                        {errors.estado}
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Botões */}
          <div className="flex flex-col sm:flex-row gap-3">
            {onBack && (
              <Button variant="outline" onClick={onBack} className="sm:w-auto">
                Voltar
              </Button>
            )}
            <Button
              onClick={handleContinue}
              disabled={!phoneValid || isValidatingPhone}
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

NewFinancialResponsibleFormStep.displayName = 'NewFinancialResponsibleFormStep';
