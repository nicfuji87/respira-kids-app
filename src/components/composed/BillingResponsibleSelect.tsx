import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Loader2,
  AlertCircle,
  User,
  AlertTriangle,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { cn } from '@/lib/utils';
import {
  fetchPatientResponsibles,
  updateBillingResponsible,
} from '@/lib/patient-api';
import {
  validateResponsibleForAsaas,
  type AsaasValidationResult,
} from '@/lib/asaas-validation';
import { supabase } from '@/lib/supabase';

// AI dev note: BillingResponsibleSelect - Composed component que reutiliza Select primitive
// Lista paciente + responsáveis ativos, permite admin/secretaria alterar responsável cobrança

interface BillingResponsibleSelectProps {
  patientId: string;
  currentResponsibleId?: string;
  currentResponsibleName?: string;
  userRole?: 'admin' | 'profissional' | 'secretaria' | null;
  onUpdate?: (responsibleId: string, responsibleName: string) => void;
  disabled?: boolean;
  className?: string;
}

interface ResponsibleOption {
  id: string;
  nome: string;
  ativo: boolean;
}

export const BillingResponsibleSelect =
  React.memo<BillingResponsibleSelectProps>(
    ({
      patientId,
      currentResponsibleId,
      currentResponsibleName,
      userRole,
      onUpdate,
      disabled = false,
      className,
    }) => {
      const [responsibles, setResponsibles] = useState<ResponsibleOption[]>([]);
      const [loading, setLoading] = useState(true);
      const [updating, setUpdating] = useState(false);
      const [error, setError] = useState<string | null>(null);
      const [asaasValidation, setAsaasValidation] =
        useState<AsaasValidationResult | null>(null);
      const [validatingAsaas, setValidatingAsaas] = useState(false);

      // Verificar se usuário pode editar
      const canEdit = userRole === 'admin' || userRole === 'secretaria';

      // Carregar responsáveis do paciente
      useEffect(() => {
        const loadResponsibles = async () => {
          setLoading(true);
          setError(null);

          try {
            const { responsibles: data, error: apiError } =
              await fetchPatientResponsibles(patientId);

            if (apiError) {
              setError(apiError);
              return;
            }

            setResponsibles(data);
          } catch (err) {
            setError('Erro ao carregar responsáveis');
            console.error('Erro ao carregar responsáveis:', err);
          } finally {
            setLoading(false);
          }
        };

        if (patientId) {
          loadResponsibles();
        }
      }, [patientId]);

      // AI dev note: Validar dados ASAAS do responsável selecionado em tempo real
      useEffect(() => {
        const validateCurrentResponsible = async () => {
          if (!currentResponsibleId) {
            setAsaasValidation(null);
            return;
          }

          setValidatingAsaas(true);

          try {
            // Buscar dados completos do responsável via vw_usuarios_admin
            const { data: responsibleData, error: responsibleError } =
              await supabase
                .from('vw_usuarios_admin')
                .select('nome, cpf_cnpj, email, telefone, cep, numero_endereco')
                .eq('id', currentResponsibleId)
                .single();

            if (responsibleError || !responsibleData) {
              console.error(
                '❌ Erro ao buscar dados do responsável:',
                responsibleError
              );
              setAsaasValidation(null);
              return;
            }

            // Validar dados para ASAAS
            const validation = validateResponsibleForAsaas({
              nome: responsibleData.nome,
              cpf_cnpj: responsibleData.cpf_cnpj,
              email: responsibleData.email,
              telefone: responsibleData.telefone,
              cep: responsibleData.cep,
              numero_endereco: responsibleData.numero_endereco,
            });

            setAsaasValidation(validation);
          } catch (err) {
            console.error('❌ Erro ao validar responsável:', err);
            setAsaasValidation(null);
          } finally {
            setValidatingAsaas(false);
          }
        };

        validateCurrentResponsible();
      }, [currentResponsibleId]);

      // Atualizar responsável pela cobrança
      const handleResponsibleChange = async (responsibleId: string) => {
        const responsible = responsibles.find((r) => r.id === responsibleId);
        if (!responsible) return;

        setUpdating(true);
        setError(null);

        try {
          const { success, error: apiError } = await updateBillingResponsible(
            patientId,
            responsibleId,
            userRole
          );

          if (!success) {
            setError(apiError || 'Erro ao atualizar responsável');
            return;
          }

          // Notificar atualização
          onUpdate?.(responsible.id, responsible.nome);
        } catch (err) {
          setError('Erro ao atualizar responsável');
          console.error('Erro ao atualizar responsável:', err);
        } finally {
          setUpdating(false);
        }
      };

      // Renderizar estado de loading
      if (loading) {
        return (
          <div
            className={cn(
              'flex items-center gap-2 text-sm text-muted-foreground',
              className
            )}
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Carregando responsáveis...</span>
          </div>
        );
      }

      // Renderizar erro
      if (error) {
        return (
          <Alert className={cn('border-red-200', className)}>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">{error}</AlertDescription>
          </Alert>
        );
      }

      // Renderizar apenas visualização para profissional
      if (!canEdit) {
        return (
          <div className={cn('flex items-start gap-3', className)}>
            <CreditCard className="h-4 w-4 text-muted-foreground mt-1" />
            <div className="flex-1">
              <p className="text-sm font-medium">Responsável pela Cobrança</p>
              <p className="text-sm text-muted-foreground">
                {currentResponsibleName || 'Não definido'}
              </p>
            </div>
          </div>
        );
      }

      // Renderizar select editável
      return (
        <div className={cn('space-y-2', className)}>
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <label className="text-sm font-medium">
              Responsável pela Cobrança
            </label>
          </div>

          <Select
            value={currentResponsibleId || ''}
            onValueChange={handleResponsibleChange}
            disabled={disabled || updating || responsibles.length === 0}
          >
            <SelectTrigger className="w-full">
              {updating ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Atualizando...</span>
                </div>
              ) : (
                <SelectValue placeholder="Selecione o responsável pela cobrança" />
              )}
            </SelectTrigger>

            <SelectContent>
              {responsibles.map((responsible) => (
                <SelectItem key={responsible.id} value={responsible.id}>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    <span>{responsible.nome}</span>
                    {responsible.id === patientId && (
                      <span className="text-xs text-muted-foreground">
                        (Próprio paciente)
                      </span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* AI dev note: Aviso de dados incompletos para ASAAS */}
          {asaasValidation && !asaasValidation.isValid && !validatingAsaas && (
            <Alert variant="destructive" className="mt-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-semibold text-sm">
                    ⚠️ Não é possível gerar cobrança para este responsável
                  </p>

                  {asaasValidation.missingFields.length > 0 && (
                    <div>
                      <p className="text-xs font-medium">
                        Campos obrigatórios faltando:
                      </p>
                      <ul className="text-xs list-disc list-inside ml-2 mt-1">
                        {asaasValidation.missingFields.map((field) => (
                          <li key={field}>{field}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {asaasValidation.warnings.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-medium">Avisos:</p>
                      <ul className="text-xs list-disc list-inside ml-2 mt-1">
                        {asaasValidation.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <p className="text-xs mt-2 opacity-90">
                    Complete o cadastro do responsável antes de gerar cobranças.
                  </p>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Loading da validação ASAAS */}
          {validatingAsaas && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Validando dados para cobrança...</span>
            </div>
          )}

          {responsibles.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Nenhum responsável encontrado para este paciente
            </p>
          )}
        </div>
      );
    }
  );

BillingResponsibleSelect.displayName = 'BillingResponsibleSelect';
