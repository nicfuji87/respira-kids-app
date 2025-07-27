import React, { useState, useEffect } from 'react';
import { Button } from '@/components/primitives/button';
import { Textarea } from '@/components/primitives/textarea';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Switch } from '@/components/primitives/switch';
import { Label } from '@/components/primitives/label';
import { Skeleton } from '@/components/primitives/skeleton';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { Save } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { fetchPatientHistory, savePatientHistory } from '@/lib/patient-api';
import { cn } from '@/lib/utils';
import type { PatientHistoryProps } from '@/types/patient-details';

// AI dev note: PatientHistory - Component Composed com toggle IA por paciente
// IA ON: histórico automático readonly | IA OFF: campo editável para admin
// Profissional/secretaria: apenas visualização

export const PatientHistory = React.memo<PatientHistoryProps>(
  ({ patientId, className }) => {
    const { user } = useAuth();
    const [history, setHistory] = useState<string>('');
    const [editableHistory, setEditableHistory] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isAiActive, setIsAiActive] = useState(true);
    const [isTogglingAI, setIsTogglingAI] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [lastGenerated, setLastGenerated] = useState<string | null>(null);
    // const [isAiGenerated, setIsAiGenerated] = useState<boolean | null>(null);

    const userRole = user?.role as
      | 'admin'
      | 'profissional'
      | 'secretaria'
      | null;
    const userRoleAlternative = user?.pessoa?.role as
      | 'admin'
      | 'profissional'
      | 'secretaria'
      | null;
    const isAdmin = userRole === 'admin' || userRoleAlternative === 'admin';
    const canToggleAI = isAdmin;
    const canEditManually = isAdmin && !isAiActive;

    // Carregar dados iniciais
    useEffect(() => {
      const loadData = async () => {
        if (!patientId || !user?.id) return;

        try {
          setIsLoading(true);
          setError(null);

          // Carregar histórico existente
          const historyResult = await fetchPatientHistory(patientId);

          if (historyResult.history) {
            setHistory(historyResult.history);
            // setIsAiGenerated(historyResult.isAiGenerated);
            setLastGenerated(historyResult.lastGenerated);

            // Determinar estado do toggle baseado na presença de conteúdo IA
            setIsAiActive(historyResult.isAiGenerated !== false);
          } else {
            // Se não há histórico, deixar IA ativa por padrão para novos pacientes
            setIsAiActive(true);
            setEditableHistory('');
          }
        } catch (err) {
          console.error('Erro ao carregar dados do histórico:', err);
          setError('Erro ao carregar histórico do paciente');
        } finally {
          setIsLoading(false);
        }
      };

      loadData();
    }, [patientId, user?.id]);

    // Toggle IA ON/OFF para este paciente específico
    const handleToggleAI = async (newValue: boolean) => {
      if (!isAdmin || isTogglingAI) {
        return;
      }

      try {
        setIsTogglingAI(true);
        setError(null);
        setSuccessMessage(null);

        setIsAiActive(newValue);

        if (newValue) {
          // Se ativando IA, usar histórico atual como base
          setSuccessMessage(
            'IA ativada! O histórico será atualizado automaticamente nas próximas evoluções.'
          );
        } else {
          // Se desativando IA, preparar para edição manual
          setEditableHistory(history || '');
          setSuccessMessage(
            'IA desativada. Agora você pode editar o histórico manualmente.'
          );
        }

        // Limpar mensagem após 4 segundos
        setTimeout(() => setSuccessMessage(null), 4000);
      } catch (err) {
        console.error('Erro ao alterar configuração da IA:', err);
        setError('Erro interno do servidor');
      } finally {
        setIsTogglingAI(false);
      }
    };

    // Salvar histórico manual (quando IA está desligada)
    const handleSaveManualHistory = async () => {
      if (!user?.id || isSaving || !canEditManually) return;

      try {
        setIsSaving(true);
        setError(null);
        setSuccessMessage(null);

        const result = await savePatientHistory(
          patientId,
          editableHistory,
          user.id
        );

        if (result.success) {
          setHistory(editableHistory);
          setLastGenerated(new Date().toISOString());
          // setIsAiGenerated(false);
          setSuccessMessage('Histórico salvo com sucesso!');

          // Limpar mensagem após 3 segundos
          setTimeout(() => setSuccessMessage(null), 3000);
        } else {
          setError(result.error || 'Erro ao salvar histórico');
        }
      } catch (err) {
        console.error('Erro ao salvar histórico:', err);
        setError('Erro interno do servidor');
      } finally {
        setIsSaving(false);
      }
    };

    // Loading state
    if (isLoading) {
      return (
        <Card className={cn('', className)}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Histórico do Paciente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className={cn('', className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Histórico do Paciente
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Controles superiores */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {lastGenerated && (
                  <span className="text-sm text-muted-foreground">
                    Atualizado em{' '}
                    {new Date(lastGenerated).toLocaleDateString('pt-BR')}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Toggle IA para este paciente (apenas admin) */}
              {canToggleAI && (
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor="patient-ai-toggle"
                    className="text-sm font-medium"
                  >
                    Gerado por IA
                  </Label>
                  <Switch
                    id="patient-ai-toggle"
                    checked={isAiActive}
                    onCheckedChange={handleToggleAI}
                    disabled={isTogglingAI}
                  />
                  {isTogglingAI && (
                    <Loader2 className="h-4 w-4 animate-spin ml-2" />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Área de conteúdo */}
          <div className="space-y-4">
            {isAiActive ? (
              // Modo IA Ativa - Histórico automático (readonly)
              <div className="space-y-4">
                <Label className="text-sm font-medium">
                  Histórico de evoluções
                </Label>
                {history ? (
                  <div className="rounded-md border p-4 bg-muted/30">
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">
                      {history}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Bot className="mx-auto h-12 w-12 mb-4 opacity-50" />
                    <p className="text-lg font-medium mb-2">
                      Aguardando geração automática
                    </p>
                    <p className="text-sm">
                      O histórico será gerado automaticamente após as evoluções
                      do paciente
                    </p>
                  </div>
                )}
              </div>
            ) : // Modo Manual - Campo editável (apenas admin)
            canEditManually ? (
              <div className="space-y-4">
                <Label htmlFor="manual-history">
                  Histórico Manual (editável - máx. 1500 caracteres)
                </Label>
                <Textarea
                  id="manual-history"
                  value={editableHistory}
                  onChange={(e) =>
                    setEditableHistory(e.target.value.substring(0, 1500))
                  }
                  placeholder="Digite o histórico do paciente..."
                  className="min-h-[200px] resize-none"
                  maxLength={1500}
                />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {editableHistory.length}/1500 caracteres
                  </span>
                  <Button
                    onClick={handleSaveManualHistory}
                    size="sm"
                    disabled={isSaving || !editableHistory.trim()}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Salvar Histórico
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              // Usuário não-admin em modo manual
              <div className="space-y-4">
                <Label className="text-sm font-medium">Histórico Manual</Label>
                {history ? (
                  <div className="rounded-md border p-4 bg-muted/50">
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">
                      {history}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <BotOff className="mx-auto h-12 w-12 mb-4 opacity-50" />
                    <p className="text-lg font-medium mb-2">
                      Aguardando edição manual
                    </p>
                    <p className="text-sm">
                      Um administrador precisa criar o histórico manualmente
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mensagens de feedback */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {successMessage && (
            <Alert className="border-green-200 bg-green-50 text-green-800">
              <Bell className="h-4 w-4" />
              <AlertDescription>{successMessage}</AlertDescription>
            </Alert>
          )}

          {/* Informações sobre funcionamento */}
          <div className="rounded-md border p-3 bg-muted/30">
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Como funciona:
            </h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              {isAdmin ? (
                <>
                  <li>
                    • <strong>IA Ativa:</strong> histórico é gerado
                    automaticamente após cada evolução
                  </li>
                  <li>
                    • <strong>IA Inativa:</strong> você pode editar o histórico
                    diretamente no campo de texto
                  </li>
                  <li>
                    • <strong>Toggle individual:</strong> cada paciente pode ter
                    configuração independente
                  </li>
                  <li>
                    • <strong>Limite:</strong> máximo de 1.500 caracteres por
                    histórico manual
                  </li>
                </>
              ) : (
                <>
                  <li>
                    • Histórico gerado automaticamente por IA ou editado pelo
                    administrador
                  </li>
                  <li>
                    • Configuração controlada pelos administradores do sistema
                  </li>
                  <li>
                    • Atualizado quando novas evoluções são adicionadas (modo
                    IA)
                  </li>
                </>
              )}
            </ul>
          </div>
        </CardContent>
      </Card>
    );
  }
);

PatientHistory.displayName = 'PatientHistory';
