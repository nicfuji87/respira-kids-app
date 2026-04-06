import React, { useState, useCallback } from 'react';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/primitives/radio-group';
import { CPFInput } from '@/components/primitives/CPFInput';
import { DateInput } from '@/components/primitives/DateInput';
import { validateCPF } from '@/lib/cpf-validator';
import { cn } from '@/lib/utils';

// AI dev note: PatientDataStep - Etapa de cadastro de dados do paciente
// Campos obrigatórios: nome, data_nascimento, sexo
// Campos opcionais: cpf_cnpj (obrigatório se NF no nome do paciente)

export interface PatientData {
  nome: string;
  dataNascimento: string; // ISO format YYYY-MM-DD
  sexo: 'M' | 'F';
  cpf?: string; // Somente se emitir nota no nome do paciente
  emitirNotaNomePaciente: boolean; // Define se NF será no nome do paciente ou responsável
  // AI dev note: Nota fiscal será emitida com dados do responsável financeiro
  // Dados do paciente estarão nas observações da NF-e
}

export interface PatientDataStepProps {
  onContinue: (data: PatientData) => void;
  onBack?: () => void;
  initialData?: Partial<PatientData>;
  className?: string;
  responsavelCpf?: string;
}

export const PatientDataStep = React.memo<PatientDataStepProps>(
  ({ onContinue, onBack, initialData, className, responsavelCpf }) => {
    const [nome, setNome] = useState(initialData?.nome || '');
    const [dataNascimento, setDataNascimento] = useState(
      initialData?.dataNascimento || ''
    );
    const [sexo, setSexo] = useState<'M' | 'F' | ''>(initialData?.sexo || '');
    const [emitirNotaNomePaciente, setEmitirNotaNomePaciente] = useState(
      initialData?.emitirNotaNomePaciente || false
    );
    const [cpf, setCpf] = useState(initialData?.cpf || '');
    const [errors, setErrors] = useState<Record<string, string>>({});

    console.log('📝 [PatientDataStep] Renderizado');

    const validateForm = useCallback((): boolean => {
      const newErrors: Record<string, string> = {};

      // Nome completo obrigatório
      if (!nome.trim()) {
        newErrors.nome = 'Nome completo é obrigatório';
      } else if (nome.trim().split(' ').length < 2) {
        newErrors.nome = 'Por favor, insira o nome completo';
      }

      // Data de nascimento obrigatória
      if (!dataNascimento) {
        newErrors.dataNascimento = 'Data de nascimento é obrigatória';
      }

      // Sexo obrigatório
      if (!sexo) {
        newErrors.sexo = 'Selecione o sexo do paciente';
      }

      // CPF: obrigatório se emitir nota no nome do paciente, mas sempre validar se preenchido
      if (emitirNotaNomePaciente && !cpf) {
        newErrors.cpf =
          'CPF é obrigatório para emissão de nota fiscal no nome do paciente';
      } else if (cpf && cpf.trim() !== '') {
        const validation = validateCPF(cpf);
        if (!validation.valid) {
          newErrors.cpf = validation.error || 'CPF inválido';
        } else if (responsavelCpf) {
          // AI dev note: Evitar que o pai/mãe insira o próprio CPF no campo do paciente
          const cpfLimpo = cpf.replace(/\D/g, '');
          const responsavelCpfLimpo = responsavelCpf.replace(/\D/g, '');
          if (cpfLimpo === responsavelCpfLimpo) {
            const cpfFormatado = `${cpfLimpo.slice(0, 3)}.${cpfLimpo.slice(3, 6)}.${cpfLimpo.slice(6, 9)}-${cpfLimpo.slice(9)}`;
            newErrors.cpf = `Este CPF (${cpfFormatado}) já está cadastrado como responsável. Insira o CPF do paciente.`;
          }
        }
      }

      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    }, [
      nome,
      dataNascimento,
      sexo,
      emitirNotaNomePaciente,
      cpf,
      responsavelCpf,
    ]);

    const handleContinue = useCallback(() => {
      console.log('➡️ [PatientDataStep] handleContinue');

      if (!validateForm()) {
        console.log('❌ [PatientDataStep] Validação falhou:', errors);
        return;
      }

      // AI dev note: Incluir CPF sempre que preenchido, independente da opção de nota fiscal
      // O CPF do paciente é um dado importante para o cadastro, não apenas para NF
      const patientData: PatientData = {
        nome: nome.trim(),
        dataNascimento,
        sexo: sexo as 'M' | 'F',
        emitirNotaNomePaciente,
        ...(cpf && cpf.trim() && { cpf: cpf.trim() }),
      };

      console.log('✅ [PatientDataStep] Dados válidos:', patientData);
      onContinue(patientData);
    }, [
      nome,
      dataNascimento,
      sexo,
      emitirNotaNomePaciente,
      cpf,
      validateForm,
      onContinue,
      errors,
    ]);

    return (
      <div className={cn('w-full px-4 space-y-6', className)}>
        {/* Título */}
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold text-foreground">
            Dados do Paciente
          </h2>
          <p className="text-xs text-muted-foreground">
            Preencha as informações do paciente que será atendido
          </p>
        </div>

        {/* Form SEM container branco - campos soltos */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleContinue();
          }}
          className="space-y-5"
        >
          {/* Nome completo */}
          <div className="space-y-1.5">
            <Label
              htmlFor="nome"
              className="text-xs text-muted-foreground font-normal"
            >
              Nome completo do paciente{' '}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id="nome"
              type="text"
              placeholder="Ex: João Silva Santos"
              value={nome}
              onChange={(e) => {
                setNome(e.target.value);
                if (errors.nome) setErrors((prev) => ({ ...prev, nome: '' }));
              }}
              className={cn('h-11', errors.nome && 'border-destructive')}
            />
            {errors.nome && (
              <p className="text-xs text-destructive">{errors.nome}</p>
            )}
          </div>

          {/* Data de nascimento, Sexo e CPF */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label
                htmlFor="dataNascimento"
                className="text-xs text-muted-foreground font-normal"
              >
                Data de nascimento <span className="text-destructive">*</span>
              </Label>
              <DateInput
                id="dataNascimento"
                value={dataNascimento}
                onChange={(value) => {
                  setDataNascimento(value);
                  if (errors.dataNascimento)
                    setErrors((prev) => ({ ...prev, dataNascimento: '' }));
                }}
                placeholder="DD/MM/AAAA"
                className={cn(
                  'h-11',
                  errors.dataNascimento && 'border-destructive'
                )}
              />
              {errors.dataNascimento && (
                <p className="text-xs text-destructive">
                  {errors.dataNascimento}
                </p>
              )}
            </div>

            {/* Sexo */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground font-normal">
                Sexo <span className="text-destructive">*</span>
              </Label>
              <RadioGroup
                value={sexo}
                onValueChange={(value) => {
                  setSexo(value as 'M' | 'F');
                  if (errors.sexo) setErrors((prev) => ({ ...prev, sexo: '' }));
                }}
                className="flex gap-2 h-11"
              >
                <div className="flex items-center justify-center space-x-2 flex-1 rounded-lg border border-border hover:bg-accent/50 transition-colors">
                  <RadioGroupItem value="M" id="sexo-m" />
                  <Label
                    htmlFor="sexo-m"
                    className="cursor-pointer text-sm font-normal"
                  >
                    M
                  </Label>
                </div>
                <div className="flex items-center justify-center space-x-2 flex-1 rounded-lg border border-border hover:bg-accent/50 transition-colors">
                  <RadioGroupItem value="F" id="sexo-f" />
                  <Label
                    htmlFor="sexo-f"
                    className="cursor-pointer text-sm font-normal"
                  >
                    F
                  </Label>
                </div>
              </RadioGroup>
              {errors.sexo && (
                <p className="text-xs text-destructive">{errors.sexo}</p>
              )}
            </div>

            {/* CPF */}
            <div className="space-y-1.5">
              <Label
                htmlFor="cpf-paciente"
                className="text-xs text-muted-foreground font-normal"
              >
                CPF
              </Label>
              <CPFInput
                id="cpf-paciente"
                value={cpf}
                onChange={(value) => {
                  setCpf(value);
                  if (errors.cpf) setErrors((prev) => ({ ...prev, cpf: '' }));
                }}
                placeholder="000.000.000-00"
                className={cn('h-11', errors.cpf && 'border-destructive')}
              />
              {errors.cpf && (
                <p className="text-xs text-destructive">{errors.cpf}</p>
              )}
            </div>
          </div>

          {/* Divisor */}
          <div className="border-t border-border"></div>

          {/* Nota Fiscal */}
          <div className="space-y-3">
            <Label className="text-xs text-muted-foreground font-normal">
              Emissão de Nota Fiscal <span className="text-destructive">*</span>
            </Label>

            <RadioGroup
              value={emitirNotaNomePaciente ? 'paciente' : 'responsavel'}
              onValueChange={(value) =>
                setEmitirNotaNomePaciente(value === 'paciente')
              }
              className="space-y-2"
            >
              <div className="flex items-start space-x-3 p-3 rounded-lg border border-border hover:bg-accent/20 transition-colors">
                <RadioGroupItem
                  value="responsavel"
                  id="nf-responsavel"
                  className="mt-0.5"
                />
                <Label
                  htmlFor="nf-responsavel"
                  className="flex-1 cursor-pointer"
                >
                  <div className="text-sm font-medium">
                    No nome do responsável financeiro
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    A nota fiscal será emitida com os dados do responsável
                  </p>
                </Label>
              </div>
              <div className="flex items-start space-x-3 p-3 rounded-lg border border-border hover:bg-accent/20 transition-colors">
                <RadioGroupItem
                  value="paciente"
                  id="nf-paciente"
                  className="mt-0.5"
                />
                <Label htmlFor="nf-paciente" className="flex-1 cursor-pointer">
                  <div className="text-sm font-medium">No nome do paciente</div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Será necessário o CPF do paciente
                  </p>
                </Label>
              </div>
            </RadioGroup>

            {emitirNotaNomePaciente && (
              <p className="text-xs text-amber-600 dark:text-amber-400 italic">
                ⚠️ O CPF do paciente é obrigatório para esta opção
              </p>
            )}
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

PatientDataStep.displayName = 'PatientDataStep';
