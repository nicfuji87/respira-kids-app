import React, { useState, useEffect } from 'react';
import { FileText, Save, Loader2, Check, AlertCircle } from 'lucide-react';
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
import type { PatientAnamnesisProps } from '@/types/patient-details';

// AI dev note: PatientAnamnesis - Component Composed reutilizando EvolutionEditor
// Contexto específico para anamnese inicial do paciente usando relatorio_evolucao
// Combina primitivos Card, Button, Alert com EvolutionEditor existente

export const PatientAnamnesis = React.memo<PatientAnamnesisProps>(
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
        console.error('Erro ao salvar anamnese:', err);
        setError(
          err instanceof Error ? err.message : 'Erro ao salvar anamnese'
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

    return (
      <Card className={cn('w-full', className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Anamnese do Paciente
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Editor de Anamnese */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Registre informações detalhadas sobre a história clínica, queixas
              principais e dados relevantes do paciente.
            </p>

            <EvolutionEditor
              value={value}
              onChange={handleValueChange}
              disabled={isSaving}
              placeholder="Digite a anamnese do paciente aqui... Você pode usar texto, áudio e ferramentas de IA para melhorar o conteúdo."
              className="min-h-[300px]"
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
              <AlertDescription>Anamnese salva com sucesso!</AlertDescription>
            </Alert>
          )}

          {/* Ações */}
          {hasChanges && (
            <div className="flex justify-end space-x-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={handleReset}
                disabled={isSaving}
              >
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={isSaving || !value.trim()}>
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Salvar Anamnese
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
);

PatientAnamnesis.displayName = 'PatientAnamnesis';
