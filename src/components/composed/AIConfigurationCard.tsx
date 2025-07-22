import React, { useState, useEffect } from 'react';
import { Wand2, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Switch } from '@/components/primitives/switch';
import { Label } from '@/components/primitives/label';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { Badge } from '@/components/primitives/badge';
import { useAuth } from '@/hooks/useAuth';
import { checkAIHistoryStatus, updateAIHistoryStatus } from '@/lib/patient-api';
import { cn } from '@/lib/utils';

// AI dev note: AIConfigurationCard - Component Composed para configurações de IA
// Combina primitivos Switch, Card, Alert para controle de recursos de IA

export interface AIConfigurationCardProps {
  userRole: 'admin' | 'profissional' | 'secretaria' | null;
  className?: string;
}

export const AIConfigurationCard = React.memo<AIConfigurationCardProps>(
  ({ userRole, className }) => {
    const { user } = useAuth();
    const [historyAIEnabled, setHistoryAIEnabled] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Verificar se user pode configurar IA
    const canConfigureAI = userRole === 'admin' || userRole === 'profissional';

    // Carregar configuração atual
    useEffect(() => {
      const loadAISettings = async () => {
        if (!user?.id || !canConfigureAI) return;

        try {
          setIsLoading(true);
          setError(null);

          const { isActive, error: checkError } = await checkAIHistoryStatus(user.id);
          
          if (checkError) {
            setError(checkError);
          } else {
            setHistoryAIEnabled(isActive);
          }
        } catch (err) {
          console.error('Erro ao carregar configurações de IA:', err);
          setError('Erro ao carregar configurações');
        } finally {
          setIsLoading(false);
        }
      };

      loadAISettings();
    }, [user?.id, canConfigureAI]);

    // Salvar alteração de configuração
    const handleAIToggle = async (enabled: boolean) => {
      if (!user?.id || isSaving) return;

      try {
        setIsSaving(true);
        setError(null);
        setSuccessMessage(null);

        const { success, error: updateError } = await updateAIHistoryStatus(user.id, enabled);

        if (success) {
          setHistoryAIEnabled(enabled);
          setSuccessMessage(
            enabled 
              ? 'IA ativada! O histórico será gerado automaticamente.'
              : 'IA desativada. Você pode editar o histórico manualmente.'
          );
          
          // Limpar mensagem de sucesso após 3 segundos
          setTimeout(() => setSuccessMessage(null), 3000);
        } else {
          setError(updateError || 'Erro ao salvar configuração');
        }
      } catch (err) {
        console.error('Erro ao atualizar configuração de IA:', err);
        setError('Erro interno do servidor');
      } finally {
        setIsSaving(false);
      }
    };

    // Se usuário não pode configurar IA
    if (!canConfigureAI) {
      return (
        <Card className={cn('', className)}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5" />
              Inteligência Artificial
            </CardTitle>
            <CardDescription>
              Configurações de recursos de IA para automação
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Apenas administradores e profissionais podem configurar recursos de IA.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className={cn('', className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            Inteligência Artificial
          </CardTitle>
          <CardDescription>
            Configure recursos de IA para automação de tarefas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Histórico Automático de Pacientes */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="history-ai" className="text-base font-medium">
                  Histórico Automático de Pacientes
                </Label>
                <p className="text-sm text-muted-foreground">
                  Gera automaticamente o histórico do paciente após cada evolução
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Switch
                      id="history-ai"
                      checked={historyAIEnabled}
                      onCheckedChange={handleAIToggle}
                      disabled={isSaving}
                    />
                    {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                  </>
                )}
              </div>
            </div>

            {/* Status atual */}
            {!isLoading && (
              <div className="flex items-center gap-2">
                <Badge variant={historyAIEnabled ? "default" : "secondary"}>
                  {historyAIEnabled ? 'Ativo' : 'Inativo'}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {historyAIEnabled 
                    ? 'Histórico será gerado automaticamente'
                    : 'Histórico deve ser editado manualmente'
                  }
                </span>
              </div>
            )}

            {/* Informações adicionais */}
            <div className="rounded-md border p-3 space-y-2">
              <h4 className="text-sm font-medium">Como funciona:</h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Quando ativo: histórico é atualizado após cada evolução</li>
                <li>Máximo de 1.500 caracteres por histórico</li>
                <li>Compila todas as evoluções anteriores do paciente</li>
                <li>
                  {userRole === 'admin' 
                    ? 'Como admin, você pode editar manualmente quando desativado'
                    : 'Quando desativado, apenas admins podem editar'
                  }
                </li>
              </ul>
            </div>
          </div>

          {/* Mensagens de feedback */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {successMessage && (
            <Alert className="border-green-200 bg-green-50 text-green-800">
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>{successMessage}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    );
  }
);

AIConfigurationCard.displayName = 'AIConfigurationCard'; 