import React, { useState, useEffect } from 'react';
import { Lightbulb, Save, Loader2, Check, AlertCircle } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { EvolutionEditor } from '@/components/composed/EvolutionEditor';
import { cn } from '@/lib/utils';
import type { PatientObservationsProps } from '@/types/patient-details';

// AI dev note: PatientObservations - Component Composed reutilizando EvolutionEditor
// Observações e preferências permanentes da pessoa (paciente ou responsável)
// Reutiliza EvolutionEditor (mesmo componente usado em anamnese e evoluções)

export const PatientObservations = React.memo<PatientObservationsProps>(
  ({ initialValue = '', onUpdate, className }) => {
    const [value, setValue] = useState(initialValue);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    // Sincronizar valor inicial
    useEffect(() => {
      setValue(initialValue);
      setHasChanges(false);
    }, [initialValue]);

    // Verificar mudanças
    useEffect(() => {
      setHasChanges(value !== initialValue);
    }, [value, initialValue]);

    const handleValueChange = (newValue: string) => {
      setValue(newValue);
      setError(null);
      setSuccess(false);
    };

    const handleSave = async () => {
      if (!hasChanges || isSaving) return;

      try {
        setIsSaving(true);
        setError(null);

        await onUpdate(value);

        setSuccess(true);
        setHasChanges(false);

        // Auto-hide success message
        setTimeout(() => setSuccess(false), 3000);
      } catch (err) {
        console.error('Erro ao salvar observações:', err);
        setError(
          err instanceof Error ? err.message : 'Erro ao salvar observações'
        );
      } finally {
        setIsSaving(false);
      }
    };

    const handleReset = () => {
      setValue(initialValue);
      setHasChanges(false);
      setError(null);
      setSuccess(false);
    };

    // AI dev note: Permitir uso sem Card quando className inclui 'shadow-none' (para uso em abas)
    const isWithinTabs = className?.includes('shadow-none');

    const content = (
      <>
        {/* Editor de Observações */}
        <div className="space-y-2">
          <EvolutionEditor
            value={value}
            onChange={handleValueChange}
            disabled={isSaving}
            placeholder="Exemplo: Paciente gosta de escutar Moana durante atendimento. Responsável prefere ser chamado de 'senhor'..."
            className="min-h-[200px]"
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
            <AlertDescription>Observações salvas com sucesso!</AlertDescription>
          </Alert>
        )}

        {/* Ações */}
        {hasChanges && (
          <div className="flex justify-end space-x-2 pt-4 border-t">
            <Button variant="outline" onClick={handleReset} disabled={isSaving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar Observações
                </>
              )}
            </Button>
          </div>
        )}
      </>
    );

    // Se está dentro de abas (shadow-none), retornar apenas conteúdo
    if (isWithinTabs) {
      return <div className={cn('w-full space-y-4', className)}>{content}</div>;
    }

    // Retornar com Card se não estiver em abas
    return (
      <Card className={cn('w-full', className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5" />
            Observações e Preferências
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">{content}</CardContent>
      </Card>
    );
  }
);

PatientObservations.displayName = 'PatientObservations';
