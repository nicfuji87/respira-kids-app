// AI dev note: Formulário de dados do candidato (1 tela, antes das perguntas).
// Campos 'multi' e 'select' são renderizados como chips para manter o visual leve.

import React, { useCallback, useMemo } from 'react';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import { Button } from '@/components/primitives/button';
import { cn } from '@/lib/utils';
import { DADOS_FIELDS } from '@/lib/processo-seletivo-questions';
import type { CandidatoDados } from '@/types/processo-seletivo';

interface EstagioDadosFormProps {
  value: CandidatoDados;
  onChange: (patch: Partial<CandidatoDados>) => void;
  onContinue: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const EstagioDadosForm = React.memo<EstagioDadosFormProps>(
  ({ value, onChange, onContinue }) => {
    const isValid = useMemo(() => {
      const nomeOk = (value.nome || '').trim().length >= 3;
      const emailOk = EMAIL_RE.test((value.email || '').trim());
      const telOk = (value.telefone || '').trim().length >= 8;
      return nomeOk && emailOk && telOk;
    }, [value.nome, value.email, value.telefone]);

    const toggleMulti = useCallback(
      (field: keyof CandidatoDados, optValue: string) => {
        const current = (value[field] as string[] | undefined) || [];
        const next = current.includes(optValue)
          ? current.filter((v) => v !== optValue)
          : [...current, optValue];
        onChange({ [field]: next } as Partial<CandidatoDados>);
      },
      [value, onChange]
    );

    return (
      <div className="w-full flex flex-col gap-6 animate-in fade-in slide-in-from-right-2 duration-400">
        <div className="space-y-2">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground leading-tight">
            Vamos começar com seus dados
          </h2>
          <p className="text-base text-muted-foreground">
            Assim conseguimos entrar em contato com você. Campos com{' '}
            <span className="text-vermelho-kids">*</span> são obrigatórios.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {DADOS_FIELDS.map((field) => {
            const fieldKey = `dados-${field.id}`;
            const colSpan = field.fullWidth ? 'sm:col-span-2' : '';

            // Campos de texto
            if (
              field.type === 'text' ||
              field.type === 'email' ||
              field.type === 'tel'
            ) {
              return (
                <div key={fieldKey} className={cn('space-y-1.5', colSpan)}>
                  <Label htmlFor={fieldKey} className="text-foreground">
                    {field.label}
                    {field.required && (
                      <span className="text-vermelho-kids ml-0.5">*</span>
                    )}
                  </Label>
                  <Input
                    id={fieldKey}
                    type={field.type}
                    inputMode={field.type === 'tel' ? 'tel' : undefined}
                    placeholder={field.placeholder}
                    value={(value[field.id] as string | undefined) || ''}
                    onChange={(e) =>
                      onChange({
                        [field.id]: e.target.value,
                      } as Partial<CandidatoDados>)
                    }
                    className="h-11 rounded-xl border-2 border-border/60 bg-card focus-visible:border-azul-respira focus-visible:ring-2 focus-visible:ring-azul-respira/30"
                  />
                </div>
              );
            }

            // Chips (multi / select)
            const selectedValues =
              field.type === 'multi'
                ? (value[field.id] as string[] | undefined) || []
                : value[field.id]
                  ? [value[field.id] as string]
                  : [];

            return (
              <div key={fieldKey} className={cn('space-y-2', colSpan)}>
                <Label className="text-foreground">{field.label}</Label>
                <div className="flex flex-wrap gap-2">
                  {field.options?.map((opt) => {
                    const isSelected = selectedValues.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() =>
                          field.type === 'multi'
                            ? toggleMulti(field.id, opt.value)
                            : onChange({
                                [field.id]: opt.value,
                              } as Partial<CandidatoDados>)
                        }
                        className={cn(
                          'px-4 py-2 rounded-full border-2 text-sm font-medium transition-all duration-200',
                          isSelected
                            ? 'border-azul-respira bg-azul-respira/10 text-roxo-titulo'
                            : 'border-border/60 bg-card text-foreground hover:border-azul-respira/50'
                        )}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end pt-2">
          <Button
            size="lg"
            onClick={onContinue}
            disabled={!isValid}
            className="w-full sm:w-auto min-w-[200px] h-12 rounded-full"
          >
            Continuar
          </Button>
        </div>
      </div>
    );
  }
);

EstagioDadosForm.displayName = 'EstagioDadosForm';
