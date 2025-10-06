import React, { useState, useEffect } from 'react';
import { Label } from '@/components/primitives/label';
import { Input } from '@/components/primitives/input';
import { Button } from '@/components/primitives/button';
import { CPFInput, validateCPF } from '@/components/primitives/CPFInput';
import { cn } from '@/lib/utils';
import { AlertCircle } from 'lucide-react';

// AI dev note: ResponsibleDataStep - Etapa 3 do cadastro público
// Coleta dados do responsável legal (nome, CPF, email, data nascimento)

export interface ResponsibleData {
  nome: string;
  cpf: string;
  email: string;
}

export interface ResponsibleDataStepProps {
  onContinue: (data: ResponsibleData) => void;
  onBack?: () => void;
  className?: string;
  defaultValues?: Partial<ResponsibleData>;
  whatsappNumber?: string; // Número já validado
}

// Função auxiliar para capitalizar primeira letra de cada palavra
const capitalize = (text: string): string => {
  return text
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export const ResponsibleDataStep = React.memo<ResponsibleDataStepProps>(
  ({ onContinue, onBack, className, defaultValues, whatsappNumber }) => {
    const [nome, setNome] = useState(defaultValues?.nome || '');
    const [cpf, setCpf] = useState(defaultValues?.cpf || '');
    const [email, setEmail] = useState(defaultValues?.email || '');

    const [errors, setErrors] = useState<
      Partial<Record<keyof ResponsibleData, string>>
    >({});
    const [touched, setTouched] = useState<
      Partial<Record<keyof ResponsibleData, boolean>>
    >({});

    // Validação em tempo real quando campo é tocado
    useEffect(() => {
      if (touched.nome && nome.trim().length > 0 && nome.trim().length < 3) {
        setErrors((prev) => ({
          ...prev,
          nome: 'Nome deve ter pelo menos 3 caracteres',
        }));
      } else if (touched.nome) {
        setErrors((prev) => ({ ...prev, nome: undefined }));
      }
    }, [nome, touched.nome]);

    useEffect(() => {
      if (touched.cpf && cpf.replace(/\D/g, '').length === 11) {
        if (!validateCPF(cpf)) {
          setErrors((prev) => ({ ...prev, cpf: 'CPF inválido' }));
        } else {
          setErrors((prev) => ({ ...prev, cpf: undefined }));
        }
      }
    }, [cpf, touched.cpf]);

    useEffect(() => {
      if (touched.email && email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          setErrors((prev) => ({ ...prev, email: 'Email inválido' }));
        } else {
          setErrors((prev) => ({ ...prev, email: undefined }));
        }
      }
    }, [email, touched.email]);

    const handleBlur = (field: keyof ResponsibleData) => {
      setTouched((prev) => ({ ...prev, [field]: true }));
    };

    const handleNomeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      // Capitalizar automaticamente
      const capitalized = capitalize(e.target.value);
      setNome(capitalized);
    };

    const handleContinue = () => {
      // Marcar todos como tocados
      setTouched({
        nome: true,
        cpf: true,
        email: true,
      });

      // Validação final
      const finalErrors: Partial<Record<keyof ResponsibleData, string>> = {};

      if (!nome.trim() || nome.trim().length < 3) {
        finalErrors.nome = 'Nome completo é obrigatório';
      }

      const cpfDigits = cpf.replace(/\D/g, '');
      if (cpfDigits.length !== 11 || !validateCPF(cpf)) {
        finalErrors.cpf = 'CPF válido é obrigatório';
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailRegex.test(email)) {
        finalErrors.email = 'Email válido é obrigatório';
      }

      if (Object.keys(finalErrors).length > 0) {
        setErrors(finalErrors);
        return;
      }

      // Prosseguir
      onContinue({
        nome: nome.trim(),
        cpf,
        email: email.toLowerCase(),
      });
    };

    const isValid =
      nome.trim().length >= 3 &&
      cpf.replace(/\D/g, '').length === 11 &&
      validateCPF(cpf) &&
      email &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
      Object.values(errors).every((e) => !e);

    return (
      <div className={cn('w-full px-4 space-y-6', className)}>
        {/* Título e descrição */}
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold text-foreground">
            Dados do Responsável Legal
          </h2>
          <p className="text-xs text-muted-foreground">
            Preencha as informações do responsável legal pelo tratamento
          </p>
          {whatsappNumber && (
            <p className="text-xs text-muted-foreground font-medium mt-2">
              📱 WhatsApp: {whatsappNumber}
            </p>
          )}
        </div>

        <div className="bg-card rounded-lg shadow-sm border border-border p-5 space-y-4">
          <h3 className="text-sm font-medium text-foreground/80 uppercase tracking-wide">
            Informações Pessoais
          </h3>

          <div className="space-y-4">
            {/* Nome completo */}
            <div className="space-y-1.5">
              <Label
                htmlFor="nome"
                className="text-xs text-muted-foreground font-normal"
              >
                Nome completo <span className="text-destructive">*</span>
              </Label>
              <Input
                id="nome"
                type="text"
                value={nome}
                onChange={handleNomeChange}
                onBlur={() => handleBlur('nome')}
                placeholder="Maria Silva Santos"
                className="h-11"
                autoComplete="name"
                autoFocus
              />
              {errors.nome && touched.nome && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.nome}
                </p>
              )}
            </div>

            {/* CPF */}
            <div className="space-y-1.5">
              <Label
                htmlFor="cpf"
                className="text-xs text-muted-foreground font-normal"
              >
                CPF <span className="text-destructive">*</span>
              </Label>
              <CPFInput
                id="cpf"
                value={cpf}
                onChange={setCpf}
                onBlur={() => handleBlur('cpf')}
                errorMessage={touched.cpf ? errors.cpf : undefined}
                autoComplete="off"
                className="h-11"
              />
              <p className="text-xs text-muted-foreground/70 italic">
                💡 Obrigatório para emissão de Nota Fiscal
              </p>
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <Label
                htmlFor="email"
                className="text-xs text-muted-foreground font-normal"
              >
                Email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => handleBlur('email')}
                placeholder="maria@email.com"
                className="h-11"
                autoComplete="email"
              />
              {errors.email && touched.email && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.email}
                </p>
              )}
              <p className="text-xs text-muted-foreground/70 italic">
                💡 Avisos de agendamento e cobranças serão enviados por email
              </p>
            </div>
          </div>
        </div>

        {/* Ações */}
        <div className="flex gap-3">
          {onBack && (
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              className="flex-1 h-12"
            >
              Voltar
            </Button>
          )}
          <Button
            type="button"
            onClick={handleContinue}
            disabled={!isValid}
            className="flex-1 h-12"
          >
            Continuar
          </Button>
        </div>

        {/* Informação adicional */}
        <p className="text-xs text-center text-muted-foreground/70 italic">
          🔒 Seus dados são protegidos conforme a LGPD
        </p>
      </div>
    );
  }
);

ResponsibleDataStep.displayName = 'ResponsibleDataStep';
