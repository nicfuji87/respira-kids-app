import React, { useState } from 'react';
import { Button } from '@/components/primitives/button';
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/primitives/radio-group';
import { Label } from '@/components/primitives/label';
import { ChevronRight, User, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

// AI dev note: FinancialResponsibleTypeStep - Escolha do tipo de responsável financeiro
// Define se o responsável financeiro é o próprio usuário ou outra pessoa

export interface FinancialResponsibleTypeData {
  isSelf: boolean;
}

export interface FinancialResponsibleTypeStepProps {
  onContinue: (data: FinancialResponsibleTypeData) => void;
  onBack?: () => void;
  className?: string;
}

export const FinancialResponsibleTypeStep =
  React.memo<FinancialResponsibleTypeStepProps>(
    ({ onContinue, onBack, className }) => {
      const [selectedType, setSelectedType] = useState<'self' | 'other' | null>(
        null
      );

      const handleContinue = () => {
        if (!selectedType) return;
        onContinue({ isSelf: selectedType === 'self' });
      };

      return (
        <div className={cn('space-y-6', className)}>
          {/* Título e Descrição */}
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-respira-text-primary">
              Responsável Financeiro
            </h2>
            <p className="text-sm text-respira-text-secondary">
              Quem será o responsável financeiro pelos pacientes selecionados?
            </p>
          </div>

          {/* Radio Group */}
          <RadioGroup
            value={selectedType || ''}
            onValueChange={(value) =>
              setSelectedType(value as 'self' | 'other')
            }
            className="space-y-3"
          >
            {/* Opção: Eu mesmo */}
            <label
              className={cn(
                'flex items-start gap-4 p-4 border-2 rounded-lg cursor-pointer transition-all',
                selectedType === 'self'
                  ? 'border-respira-primary-500 bg-respira-primary-50'
                  : 'border-respira-primary-200 hover:border-respira-primary-300 hover:bg-respira-primary-50/50'
              )}
            >
              <RadioGroupItem value="self" id="self" className="mt-1" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <User className="h-5 w-5 text-respira-primary-600" />
                  <Label
                    htmlFor="self"
                    className="text-base font-medium text-respira-text-primary cursor-pointer"
                  >
                    Eu mesmo
                  </Label>
                </div>
                <p className="text-sm text-respira-text-secondary">
                  Você será o responsável financeiro pelos pacientes
                  selecionados
                </p>
              </div>
            </label>

            {/* Opção: Outra pessoa */}
            <label
              className={cn(
                'flex items-start gap-4 p-4 border-2 rounded-lg cursor-pointer transition-all',
                selectedType === 'other'
                  ? 'border-respira-primary-500 bg-respira-primary-50'
                  : 'border-respira-primary-200 hover:border-respira-primary-300 hover:bg-respira-primary-50/50'
              )}
            >
              <RadioGroupItem value="other" id="other" className="mt-1" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-respira-primary-600" />
                  <Label
                    htmlFor="other"
                    className="text-base font-medium text-respira-text-primary cursor-pointer"
                  >
                    Outra pessoa
                  </Label>
                </div>
                <p className="text-sm text-respira-text-secondary">
                  Cadastrar outra pessoa como responsável financeiro
                </p>
              </div>
            </label>
          </RadioGroup>

          {/* Botões de ação */}
          <div className="flex flex-col sm:flex-row gap-3">
            {onBack && (
              <Button variant="outline" onClick={onBack} className="sm:w-auto">
                Voltar
              </Button>
            )}
            <Button
              onClick={handleContinue}
              disabled={!selectedType}
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

FinancialResponsibleTypeStep.displayName = 'FinancialResponsibleTypeStep';
