import React, { useState, useCallback } from 'react';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import { cn } from '@/lib/utils';
import { AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { validateWhatsAppAndGetJID } from '@/lib/patient-registration-api';

// AI dev note: FinancialResponsibleDataStep - Cadastro de novo responsável financeiro
// Diferenças do ResponsibleDataStep:
// 1. Email pode ser igual ao do legal (sem validação)
// 2. WhatsApp valida apenas existência + JID (sem enviar código)
// 3. CPF já foi informado na etapa anterior

export interface FinancialResponsibleFullData {
  cpf: string; // Já vem da etapa anterior
  nome: string;
  email: string;
  whatsapp: string;
  whatsappJid: string;
}

export interface FinancialResponsibleDataStepProps {
  onContinue: (data: FinancialResponsibleFullData) => void;
  onBack?: () => void;
  cpf: string; // CPF já informado na etapa anterior
  legalResponsibleEmail?: string; // Email do responsável legal (sugestão)
  className?: string;
}

export const FinancialResponsibleDataStep =
  React.memo<FinancialResponsibleDataStepProps>(
    ({ onContinue, onBack, cpf, legalResponsibleEmail, className }) => {
      const [nome, setNome] = useState('');
      const [email, setEmail] = useState(legalResponsibleEmail || '');
      const [whatsapp, setWhatsapp] = useState('');
      const [whatsappJid, setWhatsappJid] = useState('');
      const [errors, setErrors] = useState<Record<string, string>>({});
      const [isValidatingWhatsApp, setIsValidatingWhatsApp] = useState(false);
      const [whatsappValid, setWhatsappValid] = useState<boolean | null>(null);

      console.log('💰 [FinancialResponsibleDataStep] Renderizado - CPF:', cpf);

      // Formatar WhatsApp
      const formatWhatsApp = (value: string) => {
        const numbers = value.replace(/\D/g, '');
        if (numbers.length <= 11) {
          return numbers
            .replace(/(\d{2})(\d)/, '($1) $2')
            .replace(/(\d{5})(\d)/, '$1-$2');
        }
        return value;
      };

      const handleWhatsAppChange = (value: string) => {
        const formatted = formatWhatsApp(value);
        setWhatsapp(formatted);
        setWhatsappValid(null);
        setWhatsappJid('');
        setErrors((prev) => ({ ...prev, whatsapp: '' }));
      };

      const handleWhatsAppBlur = useCallback(async () => {
        const cleanPhone = whatsapp.replace(/\D/g, '');

        if (cleanPhone.length !== 11) {
          setWhatsappValid(null);
          return;
        }

        console.log(
          '📱 [FinancialResponsibleDataStep] Validando WhatsApp:',
          cleanPhone
        );
        setIsValidatingWhatsApp(true);

        try {
          const result = await validateWhatsAppAndGetJID(cleanPhone);

          if (result.error) {
            setErrors((prev) => ({ ...prev, whatsapp: result.error! }));
            setWhatsappValid(false);
            setIsValidatingWhatsApp(false);
            return;
          }

          setWhatsappValid(result.exists);
          if (result.exists && result.jid) {
            setWhatsappJid(result.jid);
            console.log(
              '✅ [FinancialResponsibleDataStep] WhatsApp válido, JID:',
              result.jid
            );
          } else {
            setErrors((prev) => ({
              ...prev,
              whatsapp: 'Este número não está cadastrado no WhatsApp',
            }));
          }
        } catch (err) {
          console.error(
            '❌ [FinancialResponsibleDataStep] Erro ao validar:',
            err
          );
          setErrors((prev) => ({
            ...prev,
            whatsapp: 'Erro ao validar WhatsApp. Tente novamente.',
          }));
          setWhatsappValid(false);
        } finally {
          setIsValidatingWhatsApp(false);
        }
      }, [whatsapp]);

      const validate = useCallback((): boolean => {
        const newErrors: Record<string, string> = {};

        if (!nome.trim()) {
          newErrors.nome = 'Nome é obrigatório';
        }

        if (!email.trim()) {
          newErrors.email = 'Email é obrigatório';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          newErrors.email = 'Email inválido';
        }

        if (!whatsapp.trim()) {
          newErrors.whatsapp = 'WhatsApp é obrigatório';
        } else if (whatsapp.replace(/\D/g, '').length !== 11) {
          newErrors.whatsapp = 'WhatsApp deve ter 11 dígitos';
        } else if (!whatsappValid) {
          newErrors.whatsapp = 'WhatsApp deve ser validado';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
      }, [nome, email, whatsapp, whatsappValid]);

      const handleContinue = useCallback(() => {
        console.log('➡️ [FinancialResponsibleDataStep] handleContinue');

        if (!validate()) {
          return;
        }

        onContinue({
          cpf,
          nome: nome.trim(),
          email: email.trim(),
          whatsapp: whatsapp.replace(/\D/g, ''),
          whatsappJid,
        });
      }, [cpf, nome, email, whatsapp, whatsappJid, validate, onContinue]);

      return (
        <div className={cn('w-full px-4 space-y-6', className)}>
          {/* Título */}
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold text-foreground">
              Cadastrar Responsável Financeiro
            </h2>
            <p className="text-xs text-muted-foreground">
              Preencha os dados do responsável financeiro
            </p>
          </div>

          <div className="space-y-5">
            {/* Info */}
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    CPF:{' '}
                    {cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    Complete os dados abaixo para cadastrar o responsável
                    financeiro.
                  </p>
                </div>
              </div>
            </div>

            {/* Nome Completo */}
            <div className="space-y-2">
              <Label
                htmlFor="nome"
                className="text-xs text-muted-foreground font-normal"
              >
                Nome Completo <span className="text-destructive">*</span>
              </Label>
              <Input
                id="nome"
                type="text"
                placeholder="Nome completo"
                value={nome}
                onChange={(e) => {
                  setNome(e.target.value);
                  setErrors((prev) => ({ ...prev, nome: '' }));
                }}
                className={cn('h-11', errors.nome && 'border-destructive')}
              />
              {errors.nome && (
                <p className="text-xs text-destructive flex items-center gap-2">
                  <AlertCircle className="w-3 h-3" />
                  {errors.nome}
                </p>
              )}
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label
                htmlFor="email"
                className="text-xs text-muted-foreground font-normal"
              >
                Email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="email@exemplo.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrors((prev) => ({ ...prev, email: '' }));
                }}
                className={cn('h-11', errors.email && 'border-destructive')}
              />
              {legalResponsibleEmail && email === legalResponsibleEmail && (
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  ℹ️ Usando mesmo email do responsável legal
                </p>
              )}
              {errors.email && (
                <p className="text-xs text-destructive flex items-center gap-2">
                  <AlertCircle className="w-3 h-3" />
                  {errors.email}
                </p>
              )}
            </div>

            {/* WhatsApp */}
            <div className="space-y-2">
              <Label
                htmlFor="whatsapp"
                className="text-xs text-muted-foreground font-normal"
              >
                WhatsApp <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="whatsapp"
                  type="text"
                  placeholder="(00) 00000-0000"
                  value={whatsapp}
                  onChange={(e) => handleWhatsAppChange(e.target.value)}
                  onBlur={handleWhatsAppBlur}
                  className={cn(
                    'h-11 pr-10',
                    errors.whatsapp && 'border-destructive',
                    whatsappValid && 'border-green-500'
                  )}
                  maxLength={15}
                  disabled={isValidatingWhatsApp}
                />
                {isValidatingWhatsApp && (
                  <Loader2 className="w-4 h-4 absolute right-3 top-3.5 animate-spin text-muted-foreground" />
                )}
                {whatsappValid && !isValidatingWhatsApp && (
                  <CheckCircle2 className="w-4 h-4 absolute right-3 top-3.5 text-green-600" />
                )}
              </div>
              {whatsappValid && (
                <p className="text-xs text-green-600 flex items-center gap-2">
                  <CheckCircle2 className="w-3 h-3" />
                  WhatsApp válido
                </p>
              )}
              {errors.whatsapp && (
                <p className="text-xs text-destructive flex items-center gap-2">
                  <AlertCircle className="w-3 h-3" />
                  {errors.whatsapp}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Validaremos se este número existe no WhatsApp (não enviaremos
                código).
              </p>
            </div>

            {/* Botões */}
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
                onClick={handleContinue}
                className="flex-1 h-12"
                disabled={!nome || !email || !whatsappValid}
              >
                Continuar
              </Button>
            </div>
          </div>
        </div>
      );
    }
  );

FinancialResponsibleDataStep.displayName = 'FinancialResponsibleDataStep';
