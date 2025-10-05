import React, { useState, useCallback } from 'react';
import { Button } from '@/components/primitives/button';
import { Label } from '@/components/primitives/label';
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/primitives/radio-group';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { AlertCircle } from 'lucide-react';

// AI dev note: FinancialResponsibleStep - Etapa para definir responsável financeiro
// Pergunta se o responsável financeiro é o mesmo que o legal ou outra pessoa
// Se for outra pessoa, precisará cadastrar dados completos (nome, CPF, email, WhatsApp, endereço)

export interface FinancialResponsibleStepProps {
  onContinue: (isSameAsLegal: boolean) => void;
  onBack?: () => void;
  defaultValue?: boolean;
  className?: string;
}

export const FinancialResponsibleStep =
  React.memo<FinancialResponsibleStepProps>(
    ({ onContinue, onBack, defaultValue, className }) => {
      const [isSameAsLegal, setIsSameAsLegal] = useState<boolean | null>(
        defaultValue !== undefined ? defaultValue : null
      );
      const [error, setError] = useState('');

      console.log('💰 [FinancialResponsibleStep] Renderizado');

      const handleContinue = useCallback(() => {
        console.log(
          '➡️ [FinancialResponsibleStep] handleContinue - isSameAsLegal:',
          isSameAsLegal
        );

        if (isSameAsLegal === null) {
          setError('Selecione uma opção para continuar');
          return;
        }

        onContinue(isSameAsLegal);
      }, [isSameAsLegal, onContinue]);

      return (
        <div className={cn('w-full max-w-md mx-auto space-y-6', className)}>
          {/* Título */}
          <div className="text-center space-y-2">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">
              Responsável Financeiro
            </h2>
            <p className="text-base text-muted-foreground">
              Quem será responsável pelos pagamentos e recebimento de notas
              fiscais?
            </p>
          </div>

          <Card className="p-6 space-y-5">
            {/* Explicação */}
            <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    O que é o responsável financeiro?
                  </p>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    É a pessoa que receberá as cobranças, notificações de
                    pagamento e as notas fiscais dos atendimentos. Pode ser a
                    mesma pessoa que o responsável legal ou outra pessoa.
                  </p>
                </div>
              </div>
            </div>

            {/* Seleção */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">
                Quem é o responsável financeiro?{' '}
                <span className="text-destructive">*</span>
              </Label>

              <RadioGroup
                value={
                  isSameAsLegal === null
                    ? undefined
                    : isSameAsLegal
                      ? 'same'
                      : 'different'
                }
                onValueChange={(value) => {
                  setIsSameAsLegal(value === 'same');
                  setError('');
                }}
                className="space-y-3"
              >
                {/* Mesma pessoa */}
                <div
                  className={cn(
                    'flex items-start space-x-3 p-4 rounded-lg border-2 transition-all cursor-pointer',
                    isSameAsLegal === true
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50 hover:bg-accent/50'
                  )}
                >
                  <RadioGroupItem value="same" id="same" className="mt-1" />
                  <Label htmlFor="same" className="flex-1 cursor-pointer">
                    <div className="font-semibold text-base mb-1">
                      Eu mesmo (responsável legal)
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Serei eu quem receberá as cobranças e notas fiscais.
                      Usaremos os mesmos dados já cadastrados.
                    </p>
                  </Label>
                </div>

                {/* Pessoa diferente */}
                <div
                  className={cn(
                    'flex items-start space-x-3 p-4 rounded-lg border-2 transition-all cursor-pointer',
                    isSameAsLegal === false
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50 hover:bg-accent/50'
                  )}
                >
                  <RadioGroupItem
                    value="different"
                    id="different"
                    className="mt-1"
                  />
                  <Label htmlFor="different" className="flex-1 cursor-pointer">
                    <div className="font-semibold text-base mb-1">
                      Outra pessoa
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Outra pessoa será responsável pelos pagamentos.
                      Precisaremos cadastrar os dados completos dessa pessoa.
                    </p>
                  </Label>
                </div>
              </RadioGroup>

              {error && (
                <p className="text-sm text-destructive flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </p>
              )}
            </div>

            {/* Observação importante */}
            {isSameAsLegal === false && (
              <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                      Atenção
                    </p>
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      Na próxima etapa, você precisará fornecer:
                    </p>
                    <ul className="text-sm text-amber-700 dark:text-amber-300 list-disc list-inside space-y-1 mt-2">
                      <li>Nome completo do responsável financeiro</li>
                      <li>CPF (obrigatório para emissão de NF-e)</li>
                      <li>Email (para recebimento de cobranças e NF-e)</li>
                      <li>WhatsApp (diferente do responsável legal)</li>
                      <li>Endereço completo</li>
                    </ul>
                  </div>
                </div>
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
              disabled={isSameAsLegal === null}
            >
              Continuar
            </Button>
          </div>
        </div>
      );
    }
  );

FinancialResponsibleStep.displayName = 'FinancialResponsibleStep';
