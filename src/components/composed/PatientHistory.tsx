import React, { useState, useEffect } from 'react';
import {
  History,
  Loader2,
  AlertTriangle,
  Bell,
  Edit,
  Save,
  X,
  Settings,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { Badge } from '@/components/primitives/badge';
import { Skeleton } from '@/components/primitives/skeleton';
import { Label } from '@/components/primitives/label';
import { Textarea } from '@/components/primitives/textarea';
import { Switch } from '@/components/primitives/switch';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchPatientHistory,
  savePatientHistory,
  checkAIHistoryStatus,
  updateAIHistoryStatus,
} from '@/lib/patient-api';
import { cn } from '@/lib/utils';
import type { PatientHistoryProps } from '@/types/patient-details';

// AI dev note: PatientHistory - Component Composed com toggle IA para admin apenas
// IA ON: automático após evoluções | IA OFF: edição manual para admin
// Profissional/secretaria: apenas visualização

export const PatientHistory = React.memo<PatientHistoryProps>(
  ({ patientId, className }) => {
    const { user } = useAuth();
    const [history, setHistory] = useState<string>('');
    const [editingHistory, setEditingHistory] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [isAiActive, setIsAiActive] = useState(true);
    const [isTogglingAI, setIsTogglingAI] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [lastGenerated, setLastGenerated] = useState<string | null>(null);
    const [isAiGenerated, setIsAiGenerated] = useState<boolean | null>(null);

    const userRole = user?.role as 'admin' | 'profissional' | 'secretaria' | null;
    const isAdmin = userRole === 'admin';
    const canEditManually = isAdmin && !isAiActive;
    const canToggleAI = isAdmin;

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
            setLastGenerated(historyResult.lastGenerated);
            setIsAiGenerated(historyResult.isAiGenerated);
          }

          // Carregar configuração de IA (apenas para admin)
          if (isAdmin) {
            const aiStatusResult = await checkAIHistoryStatus(user.id);
            if (!aiStatusResult.error) {
              setIsAiActive(aiStatusResult.isActive);
            }
          }
        } catch (err) {
          console.error('Erro ao carregar dados do histórico:', err);
          setError('Erro ao carregar histórico do paciente');
        } finally {
          setIsLoading(false);
        }
      };

      loadData();
    }, [patientId, user?.id, isAdmin]);

    // Toggle IA ON/OFF (apenas admin)
    const handleToggleAI = async (newValue: boolean) => {
      if (!isAdmin || !user?.id || isTogglingAI) return;

      try {
        setIsTogglingAI(true);
        setError(null);
        setSuccessMessage(null);

        const result = await updateAIHistoryStatus(user.id, newValue);

        if (result.success) {
          setIsAiActive(newValue);
          setSuccessMessage(
            newValue 
              ? 'IA ativada! Histórico será atualizado automaticamente.'
              : 'IA desativada. Agora você pode editar manualmente.'
          );
          
          // Limpar mensagem após 3 segundos
          setTimeout(() => setSuccessMessage(null), 3000);
        } else {
          setError(result.error || 'Erro ao alterar configuração da IA');
        }
      } catch (err) {
        console.error('Erro ao alterar configuração da IA:', err);
        setError('Erro interno do servidor');
      } finally {
        setIsTogglingAI(false);
      }
    };

    // Iniciar edição manual (apenas admin com IA desligada)
    const handleStartEdit = () => {
      setEditingHistory(history);
      setIsEditing(true);
      setError(null);
      setSuccessMessage(null);
    };

    // Cancelar edição
    const handleCancelEdit = () => {
      setEditingHistory('');
      setIsEditing(false);
    };

    // Salvar edição manual
    const handleSaveEdit = async () => {
      if (!user?.id || isSaving) return;

      try {
        setIsSaving(true);
        setError(null);
        setSuccessMessage(null);

        const result = await savePatientHistory(patientId, editingHistory, user.id);

        if (result.success) {
          setHistory(editingHistory);
          setLastGenerated(new Date().toISOString());
          setIsAiGenerated(false);
          setIsEditing(false);
          setEditingHistory('');
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
                <Badge variant={isAiActive ? "default" : "secondary"}>
                  {isAiActive ? "IA Ativa" : "Manual"}
                </Badge>
                {lastGenerated && (
                  <span className="text-sm text-muted-foreground">
                    Atualizado em {new Date(lastGenerated).toLocaleDateString('pt-BR')}
                  </span>
                )}
                {isAiGenerated !== null && (
                  <Badge variant={isAiGenerated ? "outline" : "secondary"}>
                    {isAiGenerated ? "Gerado por IA" : "Manual"}
                  </Badge>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Toggle IA (apenas admin) */}
              {canToggleAI && (
                <div className="flex items-center gap-2">
                  <Label htmlFor="ai-toggle" className="text-sm font-medium">
                    IA Automática
                  </Label>
                  <Switch
                    id="ai-toggle"
                    checked={isAiActive}
                    onCheckedChange={handleToggleAI}
                    disabled={isTogglingAI}
                  />
                  {isTogglingAI && (
                    <Loader2 className="h-4 w-4 animate-spin ml-2" />
                  )}
                </div>
              )}

              {/* Botão Editar (apenas admin com IA desligada) */}
              {canEditManually && !isEditing && (
                <Button
                  onClick={handleStartEdit}
                  size="sm"
                  variant="outline"
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Editar
                </Button>
              )}
            </div>
          </div>

          {/* Área de conteúdo */}
          <div className="space-y-4">
            {isEditing ? (
              // Modo de edição (apenas admin com IA desligada)
              <div className="space-y-4">
                <Label htmlFor="history-edit">Editar Histórico (máx. 1500 caracteres)</Label>
                <Textarea
                  id="history-edit"
                  value={editingHistory}
                  onChange={(e) => setEditingHistory(e.target.value.substring(0, 1500))}
                  placeholder="Digite o histórico do paciente..."
                  className="min-h-[200px] resize-none"
                  maxLength={1500}
                />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {editingHistory.length}/1500 caracteres
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handleCancelEdit}
                      size="sm"
                      variant="outline"
                      disabled={isSaving}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Cancelar
                    </Button>
                    <Button
                      onClick={handleSaveEdit}
                      size="sm"
                      disabled={isSaving || !editingHistory.trim()}
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Salvar
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              // Modo de visualização
              <div className="space-y-4">
                {history ? (
                  <div className="rounded-md border p-4 bg-muted/50">
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">
                      {history}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <History className="mx-auto h-12 w-12 mb-4 opacity-50" />
                    <p className="text-lg font-medium mb-2">Nenhum histórico encontrado</p>
                    <p className="text-sm">
                      {isAiActive
                        ? 'O histórico será gerado automaticamente após evoluções'
                        : isAdmin
                        ? 'Clique em "Editar" para criar um histórico manual'
                        : 'Aguarde o administrador criar o histórico'
                      }
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
          {!isEditing && (
            <div className="rounded-md border p-3 bg-muted/30">
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Como funciona:
              </h4>
              <ul className="text-xs text-muted-foreground space-y-1">
                {isAdmin ? (
                  <>
                    <li>• <strong>IA Ativa:</strong> histórico atualizado automaticamente após cada evolução</li>
                    <li>• <strong>IA Inativa:</strong> você pode editar o histórico manualmente</li>
                    <li>• <strong>Limite:</strong> máximo de 1.500 caracteres por histórico</li>
                    <li>• <strong>Fonte:</strong> compila todas as evoluções anteriores do paciente</li>
                  </>
                ) : (
                  <>
                    <li>• Histórico gerado automaticamente ou pelo administrador</li>
                    <li>• Atualizado quando novas evoluções são adicionadas</li>
                    <li>• Compila todas as evoluções anteriores do paciente</li>
                  </>
                )}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
);

PatientHistory.displayName = 'PatientHistory';
