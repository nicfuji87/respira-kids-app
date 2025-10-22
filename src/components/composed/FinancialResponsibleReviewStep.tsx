import React from 'react';
import { Button } from '@/components/primitives/button';
import { ChevronRight, User, Users, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ResponsibleData } from './ResponsiblePhoneValidationStep';
import type { SelectedPatient } from './PatientSelectionStep';
import type { FinancialResponsibleTypeData } from './FinancialResponsibleTypeStep';
import type { NewFinancialResponsibleData } from './NewFinancialResponsibleFormStep';

// AI dev note: FinancialResponsibleReviewStep - Revisão final dos dados antes de submeter
// Mostra resumo completo de todos os dados coletados

export interface FinancialResponsibleReviewStepProps {
  responsible: ResponsibleData;
  selectedPatients: SelectedPatient[];
  responsibleType: FinancialResponsibleTypeData;
  newResponsibleData?: NewFinancialResponsibleData;
  onConfirm: () => void;
  onBack?: () => void;
  isSubmitting?: boolean;
  className?: string;
}

export const FinancialResponsibleReviewStep =
  React.memo<FinancialResponsibleReviewStepProps>(
    ({
      responsible,
      selectedPatients,
      responsibleType,
      newResponsibleData,
      onConfirm,
      onBack,
      isSubmitting,
      className,
    }) => {
      return (
        <div className={cn('space-y-6', className)}>
          {/* Título */}
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-respira-text-primary">
              Revisão dos Dados
            </h2>
            <p className="text-sm text-respira-text-secondary">
              Confira todos os dados antes de finalizar o cadastro
            </p>
          </div>

          {/* Card: Quem está cadastrando */}
          <div className="p-4 border border-respira-primary-200 rounded-lg space-y-3">
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-respira-primary-600" />
              <h3 className="font-semibold text-respira-text-primary">
                Responsável cadastrando
              </h3>
            </div>
            <div className="pl-7 space-y-1 text-sm">
              {responsible.nome && (
                <p className="text-respira-text-primary">{responsible.nome}</p>
              )}
              <p className="text-respira-text-secondary">
                Telefone: {responsible.telefone}
              </p>
            </div>
          </div>

          {/* Card: Pacientes selecionados */}
          <div className="p-4 border border-respira-primary-200 rounded-lg space-y-3">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-respira-primary-600" />
              <h3 className="font-semibold text-respira-text-primary">
                Pacientes ({selectedPatients.length})
              </h3>
            </div>
            <div className="pl-7 space-y-2">
              {selectedPatients.map((patient) => (
                <div key={patient.id} className="text-sm space-y-1">
                  <p className="font-medium text-respira-text-primary">
                    {patient.nome}
                  </p>
                  {patient.data_nascimento && (
                    <p className="text-xs text-respira-text-secondary">
                      Nascimento:{' '}
                      {new Date(patient.data_nascimento).toLocaleDateString(
                        'pt-BR'
                      )}
                    </p>
                  )}
                  {patient.responsavel_legal_nome && (
                    <p className="text-xs text-respira-text-secondary">
                      Resp. Legal: {patient.responsavel_legal_nome}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Card: Responsável Financeiro */}
          <div className="p-4 border border-respira-primary-200 rounded-lg space-y-3">
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-respira-primary-600" />
              <h3 className="font-semibold text-respira-text-primary">
                Responsável Financeiro
              </h3>
            </div>

            {responsibleType.isSelf ? (
              <div className="pl-7 text-sm">
                <p className="text-respira-text-primary">
                  {responsible.nome || 'Você mesmo'}
                </p>
                <p className="text-xs text-respira-text-secondary">
                  O responsável que está cadastrando será também o responsável
                  financeiro
                </p>
              </div>
            ) : newResponsibleData ? (
              <div className="pl-7 space-y-3 text-sm">
                <div>
                  <p className="font-medium text-respira-text-primary">
                    {newResponsibleData.nome}
                  </p>
                  <p className="text-xs text-respira-text-secondary">
                    CPF:{' '}
                    {newResponsibleData.cpf.replace(
                      /(\d{3})(\d{3})(\d{3})(\d{2})/,
                      '$1.$2.$3-$4'
                    )}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-respira-text-secondary">
                    Telefone:{' '}
                    {newResponsibleData.phone.replace(
                      /(\d{2})(\d{5})(\d{4})/,
                      '($1) $2-$3'
                    )}
                  </p>
                  <p className="text-xs text-respira-text-secondary">
                    E-mail: {newResponsibleData.email}
                  </p>
                </div>

                {newResponsibleData.useSameAddress ? (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-respira-primary-500 mt-0.5" />
                    <p className="text-xs text-respira-text-secondary">
                      Usando o mesmo endereço do paciente
                    </p>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-respira-primary-500 mt-0.5" />
                    <div className="text-xs text-respira-text-secondary">
                      <p>
                        {newResponsibleData.endereco.logradouro},{' '}
                        {newResponsibleData.endereco.numero}
                        {newResponsibleData.endereco.complemento
                          ? ` - ${newResponsibleData.endereco.complemento}`
                          : ''}
                      </p>
                      <p>
                        {newResponsibleData.endereco.bairro} -{' '}
                        {newResponsibleData.endereco.cidade}/
                        {newResponsibleData.endereco.estado}
                      </p>
                      <p>
                        CEP:{' '}
                        {newResponsibleData.endereco.cep.replace(
                          /(\d{5})(\d{3})/,
                          '$1-$2'
                        )}
                      </p>
                    </div>
                  </div>
                )}

                {newResponsibleData.existingPersonId && (
                  <div className="p-2 bg-respira-primary-50 border border-respira-primary-200 rounded text-xs text-respira-primary-600">
                    Esta pessoa já está cadastrada no sistema
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Botões */}
          <div className="flex flex-col sm:flex-row gap-3">
            {onBack && (
              <Button
                variant="outline"
                onClick={onBack}
                disabled={isSubmitting}
                className="sm:w-auto"
              >
                Voltar
              </Button>
            )}
            <Button
              onClick={onConfirm}
              disabled={isSubmitting}
              className="flex-1 sm:flex-none"
            >
              {isSubmitting ? 'Processando...' : 'Confirmar Cadastro'}
              {!isSubmitting && <ChevronRight className="ml-2 h-4 w-4" />}
            </Button>
          </div>
        </div>
      );
    }
  );

FinancialResponsibleReviewStep.displayName = 'FinancialResponsibleReviewStep';
