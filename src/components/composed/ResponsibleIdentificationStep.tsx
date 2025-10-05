import React, { useState } from 'react';
import { Label } from '@/components/primitives/label';
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/primitives/radio-group';
import { Button } from '@/components/primitives/button';
import { Card } from '@/components/primitives/card';
import { cn } from '@/lib/utils';
import { User, Users } from 'lucide-react';

// AI dev note: ResponsibleIdentificationStep - Etapa 2 do cadastro público
// Pergunta se a pessoa é o responsável legal pelo paciente

export interface ResponsibleIdentificationStepProps {
  onContinue: (isSelfResponsible: boolean) => void;
  onBack?: () => void;
  className?: string;
  defaultValue?: boolean;
}

export const ResponsibleIdentificationStep =
  React.memo<ResponsibleIdentificationStepProps>(
    ({ onContinue, onBack, className, defaultValue }) => {
      const [selectedValue, setSelectedValue] = useState<string>(
        defaultValue !== undefined ? (defaultValue ? 'yes' : 'no') : ''
      );

      const handleContinue = () => {
        if (selectedValue) {
          onContinue(selectedValue === 'yes');
        }
      };

      return (
        <div className={cn('w-full max-w-md mx-auto space-y-6', className)}>
          {/* Título e descrição */}
          <div className="text-center space-y-2">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">
              Identificação
            </h2>
            <p className="text-base text-muted-foreground">
              Precisamos saber quem está realizando o cadastro
            </p>
          </div>

          {/* Pergunta principal */}
          <Card className="p-6">
            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-lg font-semibold text-foreground">
                  Você é o responsável legal pelo paciente?
                </Label>
                <p className="text-sm text-muted-foreground">
                  Responsável legal é quem tem autoridade para tomar decisões
                  sobre o tratamento
                </p>
              </div>

              <RadioGroup
                value={selectedValue}
                onValueChange={setSelectedValue}
                className="space-y-3"
              >
                {/* Opção: Sim */}
                <label
                  htmlFor="option-yes"
                  className={cn(
                    'flex items-start space-x-3 p-4 rounded-lg border-2 cursor-pointer transition-all',
                    'hover:bg-accent/50',
                    selectedValue === 'yes'
                      ? 'border-primary bg-primary/5'
                      : 'border-border'
                  )}
                >
                  <RadioGroupItem
                    value="yes"
                    id="option-yes"
                    className="mt-1"
                  />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <User className="w-5 h-5 text-primary" />
                      <span className="font-medium text-foreground">
                        Sim, sou eu
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Sou o responsável legal (pai, mãe, tutor) ou estou
                      cadastrando a mim mesmo
                    </p>
                  </div>
                </label>

                {/* Opção: Não */}
                <label
                  htmlFor="option-no"
                  className={cn(
                    'flex items-start space-x-3 p-4 rounded-lg border-2 cursor-pointer transition-all',
                    'hover:bg-accent/50',
                    selectedValue === 'no'
                      ? 'border-primary bg-primary/5'
                      : 'border-border'
                  )}
                >
                  <RadioGroupItem value="no" id="option-no" className="mt-1" />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-primary" />
                      <span className="font-medium text-foreground">
                        Não, estou cadastrando para outra pessoa
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Vou precisar dos dados do responsável legal
                    </p>
                  </div>
                </label>
              </RadioGroup>
            </div>
          </Card>

          {/* Ações */}
          <div className="flex flex-col sm:flex-row gap-3">
            {onBack && (
              <Button
                type="button"
                variant="outline"
                onClick={onBack}
                size="lg"
                className="w-full sm:w-auto"
              >
                ← Voltar
              </Button>
            )}
            <Button
              type="button"
              onClick={handleContinue}
              disabled={!selectedValue}
              size="lg"
              className="w-full flex-1 text-base font-semibold"
            >
              Continuar →
            </Button>
          </div>

          {/* Informação adicional */}
          <p className="text-xs text-center text-muted-foreground">
            💡 O responsável legal terá acesso a todas as informações do
            tratamento
          </p>
        </div>
      );
    }
  );

ResponsibleIdentificationStep.displayName = 'ResponsibleIdentificationStep';
