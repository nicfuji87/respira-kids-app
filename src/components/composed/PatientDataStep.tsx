import React, { useState, useCallback } from 'react';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/primitives/radio-group';
import { Card } from '@/components/ui/card';
import { CPFInput } from '@/components/primitives/CPFInput';
import { DateInput } from '@/components/primitives/DateInput';
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
}

export const PatientDataStep = React.memo<PatientDataStepProps>(
  ({ onContinue, onBack, initialData, className }) => {
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

      // CPF obrigatório se emitir nota no nome do paciente
      if (emitirNotaNomePaciente && !cpf) {
        newErrors.cpf =
          'CPF é obrigatório para emissão de nota fiscal no nome do paciente';
      }

      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    }, [nome, dataNascimento, sexo, emitirNotaNomePaciente, cpf]);

    const handleContinue = useCallback(() => {
      console.log('➡️ [PatientDataStep] handleContinue');

      if (!validateForm()) {
        console.log('❌ [PatientDataStep] Validação falhou:', errors);
        return;
      }

      const patientData: PatientData = {
        nome: nome.trim(),
        dataNascimento,
        sexo: sexo as 'M' | 'F',
        emitirNotaNomePaciente,
        ...(emitirNotaNomePaciente && cpf && { cpf }),
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
      <div className={cn('w-full max-w-md mx-auto space-y-6', className)}>
        {/* Título */}
        <div className="text-center space-y-2">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground">
            Dados do Paciente
          </h2>
          <p className="text-base text-muted-foreground">
            Preencha as informações do paciente que será atendido
          </p>
        </div>

        <Card className="p-6 space-y-5">
          {/* Nome completo */}
          <div className="space-y-2">
            <Label htmlFor="nome" className="text-base">
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
              className={cn(
                'h-12 text-base',
                errors.nome && 'border-destructive'
              )}
            />
            {errors.nome && (
              <p className="text-sm text-destructive">{errors.nome}</p>
            )}
          </div>

          {/* Data de nascimento */}
          <div className="space-y-2">
            <Label htmlFor="dataNascimento" className="text-base">
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
                'h-12 text-base',
                errors.dataNascimento && 'border-destructive'
              )}
            />
            {errors.dataNascimento && (
              <p className="text-sm text-destructive">
                {errors.dataNascimento}
              </p>
            )}
          </div>

          {/* Sexo */}
          <div className="space-y-3">
            <Label className="text-base">
              Sexo <span className="text-destructive">*</span>
            </Label>
            <RadioGroup
              value={sexo}
              onValueChange={(value) => {
                setSexo(value as 'M' | 'F');
                if (errors.sexo) setErrors((prev) => ({ ...prev, sexo: '' }));
              }}
              className="space-y-2"
            >
              <div className="flex items-center space-x-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors">
                <RadioGroupItem value="M" id="sexo-m" />
                <Label
                  htmlFor="sexo-m"
                  className="flex-1 cursor-pointer text-base"
                >
                  Masculino
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors">
                <RadioGroupItem value="F" id="sexo-f" />
                <Label
                  htmlFor="sexo-f"
                  className="flex-1 cursor-pointer text-base"
                >
                  Feminino
                </Label>
              </div>
            </RadioGroup>
            {errors.sexo && (
              <p className="text-sm text-destructive">{errors.sexo}</p>
            )}
          </div>

          {/* Nota fiscal */}
          <div className="space-y-3 pt-4 border-t border-border">
            <Label className="text-base">
              Emissão da Nota Fiscal <span className="text-destructive">*</span>
            </Label>
            <RadioGroup
              value={emitirNotaNomePaciente ? 'paciente' : 'responsavel'}
              onValueChange={(value) =>
                setEmitirNotaNomePaciente(value === 'paciente')
              }
              className="space-y-2"
            >
              <div className="flex items-start space-x-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors">
                <RadioGroupItem
                  value="responsavel"
                  id="nf-responsavel"
                  className="mt-1"
                />
                <Label
                  htmlFor="nf-responsavel"
                  className="flex-1 cursor-pointer"
                >
                  <div className="text-base font-medium">
                    No nome do responsável financeiro
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    A nota fiscal será emitida com os dados do responsável
                    financeiro. Os dados do paciente constarão nas observações
                    da NF-e.
                  </p>
                </Label>
              </div>
              <div className="flex items-start space-x-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors">
                <RadioGroupItem
                  value="paciente"
                  id="nf-paciente"
                  className="mt-1"
                />
                <Label htmlFor="nf-paciente" className="flex-1 cursor-pointer">
                  <div className="text-base font-medium">
                    No nome do paciente
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    A nota fiscal será emitida com o CPF do paciente
                  </p>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* CPF do paciente (se emitir nota no nome dele) */}
          {emitirNotaNomePaciente && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
              <Label htmlFor="cpf" className="text-base">
                CPF do paciente <span className="text-destructive">*</span>
              </Label>
              <CPFInput
                id="cpf"
                value={cpf}
                onChange={(value) => {
                  setCpf(value);
                  if (errors.cpf) setErrors((prev) => ({ ...prev, cpf: '' }));
                }}
                placeholder="000.000.000-00"
                className={cn(
                  'h-12 text-base',
                  errors.cpf && 'border-destructive'
                )}
              />
              {errors.cpf && (
                <p className="text-sm text-destructive">{errors.cpf}</p>
              )}
              <p className="text-xs text-muted-foreground">
                O CPF é obrigatório para emissão da nota fiscal no nome do
                paciente
              </p>
            </div>
          )}
        </Card>

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
          >
            Continuar
          </Button>
        </div>
      </div>
    );
  }
);

PatientDataStep.displayName = 'PatientDataStep';
