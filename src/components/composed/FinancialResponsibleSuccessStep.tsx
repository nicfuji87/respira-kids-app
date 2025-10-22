import React from 'react';
import { Button } from '@/components/primitives/button';
import { CheckCircle2, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';

// AI dev note: FinancialResponsibleSuccessStep - Página de sucesso após cadastro
// Igual ao padrão do cadastro de paciente

export interface FinancialResponsibleSuccessStepProps {
  responsibleName: string;
  patientsCount: number;
  patientNames: string[];
  onAddAnother?: () => void;
  className?: string;
}

export const FinancialResponsibleSuccessStep =
  React.memo<FinancialResponsibleSuccessStepProps>(
    ({
      responsibleName,
      patientsCount,
      patientNames,
      onAddAnother,
      className,
    }) => {
      return (
        <div className={cn('space-y-6 text-center', className)}>
          {/* Ícone de Sucesso */}
          <div className="flex justify-center">
            <div className="rounded-full bg-respira-success-50 p-6">
              <CheckCircle2 className="h-16 w-16 text-respira-success" />
            </div>
          </div>

          {/* Título e Mensagem */}
          <div className="space-y-3">
            <h2 className="text-3xl font-bold text-respira-text-primary">
              Cadastro Concluído!
            </h2>
            <p className="text-base text-respira-text-secondary">
              Responsável financeiro cadastrado com sucesso
            </p>
          </div>

          {/* Detalhes */}
          <div className="p-6 bg-respira-primary-50 border border-respira-primary-200 rounded-lg space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-respira-text-primary">
                Responsável Financeiro
              </p>
              <p className="text-lg font-semibold text-respira-primary-600">
                {responsibleName}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-respira-text-primary">
                Vinculado a {patientsCount} paciente
                {patientsCount > 1 ? 's' : ''}
              </p>
              <div className="space-y-1">
                {patientNames.map((name, index) => (
                  <p
                    key={index}
                    className="text-sm text-respira-text-secondary"
                  >
                    • {name}
                  </p>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-respira-primary-200">
              <p className="text-xs text-respira-text-secondary">
                Data do cadastro:{' '}
                {new Date().toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>

          {/* Mensagem Informativa */}
          <div className="p-4 bg-respira-accent-50 border border-respira-accent-200 rounded-lg">
            <p className="text-sm text-respira-text-secondary">
              Uma notificação foi enviada para o responsável financeiro
              informando sobre o cadastro.
            </p>
          </div>

          {/* Botões de Ação */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            {onAddAnother && (
              <Button onClick={onAddAnother} className="flex-1 sm:flex-none">
                <UserPlus className="mr-2 h-4 w-4" />
                Cadastrar outro responsável
              </Button>
            )}
          </div>
        </div>
      );
    }
  );

FinancialResponsibleSuccessStep.displayName = 'FinancialResponsibleSuccessStep';
