import React, { useState } from 'react';
import { Shield, Loader2, Check, AlertCircle } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Switch } from '@/components/primitives/switch';
import { Button } from '@/components/primitives/button';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { Label } from '@/components/primitives/label';
import { cn } from '@/lib/utils';
import type {
  PatientConsentFormProps,
  PatientConsent,
} from '@/types/patient-details';

// AI dev note: PatientConsentForm - Component Composed para gerenciar consentimentos do paciente
// Combina primitivos Switch, Card, Button para interface de autorização
// Gerencia 3 tipos: uso científico, redes sociais, uso do nome

export const PatientConsentForm = React.memo<PatientConsentFormProps>(
  ({ patientId, initialValues, onUpdate, disabled = false, className }) => {
    const [values, setValues] = useState<PatientConsent>(initialValues);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const hasChanges =
      values.autorizacao_uso_cientifico !==
        initialValues.autorizacao_uso_cientifico ||
      values.autorizacao_uso_redes_sociais !==
        initialValues.autorizacao_uso_redes_sociais ||
      values.autorizacao_uso_nome !== initialValues.autorizacao_uso_nome;

    const handleConsentChange = (
      field: keyof PatientConsent,
      value: boolean
    ) => {
      setValues((prev) => ({ ...prev, [field]: value }));
      setSuccess(false);
      setError(null);
    };

    const handleSave = async () => {
      if (!hasChanges) return;

      try {
        setIsLoading(true);
        setError(null);

        await onUpdate(values);

        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Erro ao salvar consentimentos';
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    const handleReset = () => {
      setValues(initialValues);
      setError(null);
      setSuccess(false);
    };

    return (
      <Card className={cn('w-full', className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Consentimentos e Autorizações
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Uso Científico */}
          <div className="flex items-start justify-between space-x-4">
            <div className="flex-1 space-y-1">
              <Label
                htmlFor={`consent-scientific-${patientId}`}
                className="text-sm font-medium"
              >
                Autorização para Uso Científico
              </Label>
              <p className="text-sm text-muted-foreground">
                Autoriza o uso dos dados para fins de pesquisa científica e
                acadêmica
              </p>
            </div>
            <Switch
              id={`consent-scientific-${patientId}`}
              checked={values.autorizacao_uso_cientifico}
              onCheckedChange={(checked) =>
                handleConsentChange('autorizacao_uso_cientifico', checked)
              }
              disabled={disabled || isLoading}
            />
          </div>

          {/* Redes Sociais */}
          <div className="flex items-start justify-between space-x-4">
            <div className="flex-1 space-y-1">
              <Label
                htmlFor={`consent-social-${patientId}`}
                className="text-sm font-medium"
              >
                Autorização para Redes Sociais
              </Label>
              <p className="text-sm text-muted-foreground">
                Autoriza o uso de fotos e informações em redes sociais da
                clínica
              </p>
            </div>
            <Switch
              id={`consent-social-${patientId}`}
              checked={values.autorizacao_uso_redes_sociais}
              onCheckedChange={(checked) =>
                handleConsentChange('autorizacao_uso_redes_sociais', checked)
              }
              disabled={disabled || isLoading}
            />
          </div>

          {/* Uso do Nome */}
          <div className="flex items-start justify-between space-x-4">
            <div className="flex-1 space-y-1">
              <Label
                htmlFor={`consent-name-${patientId}`}
                className="text-sm font-medium"
              >
                Autorização para Uso do Nome
              </Label>
              <p className="text-sm text-muted-foreground">
                Autoriza a divulgação do nome em materiais promocionais e
                testemunhos
              </p>
            </div>
            <Switch
              id={`consent-name-${patientId}`}
              checked={values.autorizacao_uso_nome}
              onCheckedChange={(checked) =>
                handleConsentChange('autorizacao_uso_nome', checked)
              }
              disabled={disabled || isLoading}
            />
          </div>

          {/* Feedback de Status */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert>
              <Check className="h-4 w-4" />
              <AlertDescription>
                Consentimentos atualizados com sucesso!
              </AlertDescription>
            </Alert>
          )}

          {/* Ações */}
          {hasChanges && (
            <div className="flex justify-end space-x-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={handleReset}
                disabled={isLoading}
              >
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar Alterações'
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
);

PatientConsentForm.displayName = 'PatientConsentForm';
