import React, { useState, useEffect } from 'react';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/primitives/radio-group';
import { Checkbox } from '@/components/primitives/checkbox';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { AlertCircle } from 'lucide-react';
import { validateCPF, formatCPF, formatCEP } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

interface AdminPatientDataStepProps {
  onContinue: (data: {
    nome: string;
    cpf: string;
    dataNascimento: string;
    sexo: string;
    email?: string;
    usarEmailResponsavel: boolean;
    usarEnderecoResponsavel: boolean;
    cep?: string;
    numeroEndereco?: string;
    complemento?: string;
  }) => void;
  onBack: () => void;
  responsavelData: {
    email?: string;
    endereco?: {
      cep: string;
    };
  };
  initialData?: {
    nome?: string;
    cpf?: string;
    dataNascimento?: string;
    sexo?: string;
    email?: string;
    usarEmailResponsavel?: boolean;
    usarEnderecoResponsavel?: boolean;
    cep?: string;
    numeroEndereco?: string;
    complemento?: string;
  };
}

// AI dev note: Dados do paciente com CPF obrigatório e auto-responsabilidade para maiores de idade
export const AdminPatientDataStep: React.FC<AdminPatientDataStepProps> = ({
  onContinue,
  onBack,
  responsavelData,
  initialData = {},
}) => {
  const [formData, setFormData] = useState({
    nome: initialData.nome || '',
    cpf: initialData.cpf || '',
    dataNascimento: initialData.dataNascimento || '',
    sexo: initialData.sexo || 'M',
    email: initialData.email || '',
    usarEmailResponsavel: initialData.usarEmailResponsavel ?? true,
    usarEnderecoResponsavel: initialData.usarEnderecoResponsavel ?? true,
    cep: initialData.cep || '',
    numeroEndereco: initialData.numeroEndereco || '',
    complemento: initialData.complemento || '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [cpfDuplicated, setCpfDuplicated] = useState(false);
  const [checkingCpf, setCheckingCpf] = useState(false);
  const [idade, setIdade] = useState<number | null>(null);
  const [addressData, setAddressData] = useState<{
    logradouro: string;
    bairro: string;
    cidade: string;
    estado: string;
  } | null>(null);
  const [, setLoadingCep] = useState(false);

  // Calcular idade quando data de nascimento mudar
  useEffect(() => {
    if (formData.dataNascimento) {
      const birthDate = new Date(formData.dataNascimento);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();

      if (
        monthDiff < 0 ||
        (monthDiff === 0 && today.getDate() < birthDate.getDate())
      ) {
        age--;
      }

      setIdade(age);
    } else {
      setIdade(null);
    }
  }, [formData.dataNascimento]);

  // Buscar endereço pelo CEP
  const fetchAddress = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;

    setLoadingCep(true);
    try {
      const response = await fetch(
        `https://viacep.com.br/ws/${cleanCep}/json/`
      );
      const data = await response.json();

      if (!data.erro) {
        setAddressData({
          logradouro: data.logradouro,
          bairro: data.bairro,
          cidade: data.localidade,
          estado: data.uf,
        });
      } else {
        setErrors((prev) => ({ ...prev, cep: 'CEP não encontrado' }));
      }
    } catch (error) {
      console.error('Erro ao buscar CEP:', error);
      setErrors((prev) => ({ ...prev, cep: 'Erro ao buscar CEP' }));
    } finally {
      setLoadingCep(false);
    }
  };

  // Verificar CPF duplicado
  const checkCpfDuplicate = async (cpf: string) => {
    const cleanCpf = cpf.replace(/\D/g, '');
    if (cleanCpf.length !== 11) return;

    setCheckingCpf(true);
    try {
      // AI dev note: Busca dupla para compatibilidade com dados existentes
      // Primeiro tenta sem formatação, depois com formatação
      let { data } = await supabase
        .from('pessoas')
        .select('id, nome')
        .eq('cpf_cnpj', cleanCpf)
        .eq('ativo', true)
        .single();

      // Se não encontrou, tentar com formatação (XXX.XXX.XXX-XX)
      if (!data) {
        const cpfFormatado = cleanCpf.replace(
          /(\d{3})(\d{3})(\d{3})(\d{2})/,
          '$1.$2.$3-$4'
        );
        const result = await supabase
          .from('pessoas')
          .select('id, nome')
          .eq('cpf_cnpj', cpfFormatado)
          .eq('ativo', true)
          .single();

        data = result.data;
      }

      if (data) {
        setCpfDuplicated(true);
        setErrors((prev) => ({
          ...prev,
          cpf: `CPF já cadastrado para: ${data.nome}`,
        }));
      } else {
        setCpfDuplicated(false);
        setErrors((prev) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { cpf: _cpf, ...rest } = prev;
          return rest;
        });
      }
    } catch {
      // Erro ao verificar CPF - assumir que não está duplicado
      setCpfDuplicated(false);
    } finally {
      setCheckingCpf(false);
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.nome.trim()) {
      newErrors.nome = 'Nome é obrigatório';
    }

    if (!formData.cpf) {
      newErrors.cpf = 'CPF é obrigatório';
    } else if (!validateCPF(formData.cpf)) {
      newErrors.cpf = 'CPF inválido';
    } else if (cpfDuplicated) {
      newErrors.cpf = errors.cpf || 'CPF já cadastrado';
    }

    if (!formData.dataNascimento) {
      newErrors.dataNascimento = 'Data de nascimento é obrigatória';
    }

    if (!formData.usarEmailResponsavel && !formData.email) {
      newErrors.email = 'Email é obrigatório';
    }

    if (!formData.usarEnderecoResponsavel) {
      if (!formData.cep) {
        newErrors.cep = 'CEP é obrigatório';
      }
      if (!formData.numeroEndereco) {
        newErrors.numeroEndereco = 'Número é obrigatório';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleContinue = () => {
    if (validateForm()) {
      onContinue({
        ...formData,
        email: formData.usarEmailResponsavel
          ? responsavelData.email
          : formData.email,
      });
    }
  };

  const handleCepChange = (value: string) => {
    setFormData((prev) => ({ ...prev, cep: value }));
    const cleanCep = value.replace(/\D/g, '');
    if (cleanCep.length === 8) {
      fetchAddress(cleanCep);
    }
  };

  const handleCpfChange = (value: string) => {
    setFormData((prev) => ({ ...prev, cpf: value }));
    const cleanCpf = value.replace(/\D/g, '');
    if (cleanCpf.length === 11) {
      checkCpfDuplicate(cleanCpf);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold">Dados do Paciente</h2>
        <p className="text-muted-foreground">Preencha os dados do paciente</p>
      </div>

      {/* Alerta para maioridade */}
      {idade !== null && idade >= 18 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Paciente maior de idade - pode ser seu próprio responsável legal
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        {/* Nome */}
        <div className="space-y-2">
          <Label htmlFor="nome">Nome Completo *</Label>
          <Input
            id="nome"
            value={formData.nome}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setFormData((prev) => ({ ...prev, nome: e.target.value }))
            }
            className={errors.nome ? 'border-red-500' : ''}
          />
          {errors.nome && <p className="text-sm text-red-500">{errors.nome}</p>}
        </div>

        {/* CPF */}
        <div className="space-y-2">
          <Label htmlFor="cpf">CPF *</Label>
          <Input
            id="cpf"
            placeholder="000.000.000-00"
            value={formData.cpf}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const formatted = formatCPF(e.target.value);
              handleCpfChange(formatted);
            }}
            maxLength={14}
            className={errors.cpf ? 'border-red-500' : ''}
          />
          {errors.cpf && <p className="text-sm text-red-500">{errors.cpf}</p>}
          {checkingCpf && (
            <p className="text-sm text-muted-foreground">Verificando CPF...</p>
          )}
        </div>

        {/* Data de Nascimento */}
        <div className="space-y-2">
          <Label htmlFor="dataNascimento">Data de Nascimento *</Label>
          <Input
            id="dataNascimento"
            type="date"
            value={formData.dataNascimento}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setFormData((prev) => ({
                ...prev,
                dataNascimento: e.target.value,
              }))
            }
            max={new Date().toISOString().split('T')[0]}
            className={errors.dataNascimento ? 'border-red-500' : ''}
          />
          {errors.dataNascimento && (
            <p className="text-sm text-red-500">{errors.dataNascimento}</p>
          )}
        </div>

        {/* Sexo */}
        <div className="space-y-2">
          <Label>Sexo *</Label>
          <RadioGroup
            value={formData.sexo}
            onValueChange={(value: string) =>
              setFormData((prev) => ({ ...prev, sexo: value }))
            }
          >
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="M" id="masculino" />
                <Label htmlFor="masculino">Masculino</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="F" id="feminino" />
                <Label htmlFor="feminino">Feminino</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="O" id="outro" />
                <Label htmlFor="outro">Outro</Label>
              </div>
            </div>
          </RadioGroup>
        </div>

        {/* Email */}
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="usarEmailResponsavel"
              checked={formData.usarEmailResponsavel}
              onCheckedChange={(checked: boolean | 'indeterminate') =>
                setFormData((prev) => ({
                  ...prev,
                  usarEmailResponsavel: !!checked,
                }))
              }
            />
            <Label htmlFor="usarEmailResponsavel">
              Usar mesmo email do responsável
              {responsavelData.email && (
                <span className="text-muted-foreground ml-1">
                  ({responsavelData.email})
                </span>
              )}
            </Label>
          </div>

          {!formData.usarEmailResponsavel && (
            <div>
              <Input
                type="email"
                placeholder="email@exemplo.com"
                value={formData.email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFormData((prev) => ({ ...prev, email: e.target.value }))
                }
                className={errors.email ? 'border-red-500' : ''}
              />
              {errors.email && (
                <p className="text-sm text-red-500">{errors.email}</p>
              )}
            </div>
          )}
        </div>

        {/* Endereço */}
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="usarEnderecoResponsavel"
              checked={formData.usarEnderecoResponsavel}
              onCheckedChange={(checked: boolean | 'indeterminate') =>
                setFormData((prev) => ({
                  ...prev,
                  usarEnderecoResponsavel: !!checked,
                }))
              }
            />
            <Label htmlFor="usarEnderecoResponsavel">
              Mesmo endereço do responsável
            </Label>
          </div>

          {!formData.usarEnderecoResponsavel && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cep">CEP *</Label>
                  <Input
                    id="cep"
                    placeholder="00000-000"
                    value={formData.cep}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const formatted = formatCEP(e.target.value);
                      handleCepChange(formatted);
                    }}
                    maxLength={9}
                    className={errors.cep ? 'border-red-500' : ''}
                  />
                  {errors.cep && (
                    <p className="text-sm text-red-500">{errors.cep}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="numero">Número *</Label>
                  <Input
                    id="numero"
                    value={formData.numeroEndereco}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setFormData((prev) => ({
                        ...prev,
                        numeroEndereco: e.target.value,
                      }))
                    }
                    className={errors.numeroEndereco ? 'border-red-500' : ''}
                  />
                  {errors.numeroEndereco && (
                    <p className="text-sm text-red-500">
                      {errors.numeroEndereco}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="complemento">Complemento</Label>
                <Input
                  id="complemento"
                  value={formData.complemento}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setFormData((prev) => ({
                      ...prev,
                      complemento: e.target.value,
                    }))
                  }
                  placeholder="Apto, Bloco, etc."
                />
              </div>

              {addressData && (
                <Alert>
                  <AlertDescription>
                    {addressData.logradouro}, {addressData.bairro} -{' '}
                    {addressData.cidade}/{addressData.estado}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Voltar
        </button>

        <button
          type="button"
          onClick={handleContinue}
          disabled={checkingCpf}
          className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:bg-gray-300"
        >
          Continuar
        </button>
      </div>
    </div>
  );
};
