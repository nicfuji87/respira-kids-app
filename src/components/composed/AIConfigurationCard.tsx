import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  Bot,
  Zap,
  Clock,
  Database,
  Activity,
  AlertCircle,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Switch } from '@/components/primitives/switch';
import { Label } from '@/components/primitives/label';
import { Badge } from '@/components/primitives/badge';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { Separator } from '@/components/primitives/separator';
import { Button } from '@/components/primitives/button';
import { useAuth } from '@/hooks/useAuth';
import { checkAIHistoryStatus, updateAIHistoryStatus } from '@/lib/patient-api';
import { supabase } from '@/lib/supabase';

// AI dev note: AIConfigurationCard - Configurações de IA para admins
// Inclui toggle para histórico automático de pacientes e monitoramento da queue

interface QueueStatus {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
  last_24h: number;
}

export const AIConfigurationCard: React.FC = () => {
  const { user } = useAuth();
  const [isAiActive, setIsAiActive] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isToggling, setIsToggling] = useState<boolean>(false);
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [isLoadingQueue, setIsLoadingQueue] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isAdmin = user?.role === 'admin';

  // Carregar configuração inicial
  useEffect(() => {
    const loadConfiguration = async () => {
      if (!isAdmin || !user?.id) return;

      try {
        setIsLoading(true);
        setError(null);

        const result = await checkAIHistoryStatus(user.id);
        if (!result.error) {
          setIsAiActive(result.isActive);
        } else {
          setError(result.error);
        }
      } catch (err) {
        console.error('Erro ao carregar configuração de IA:', err);
        setError('Erro ao carregar configurações');
      } finally {
        setIsLoading(false);
      }
    };

    loadConfiguration();
  }, [isAdmin, user?.id]);

  // Carregar status da queue
  const loadQueueStatus = useCallback(async () => {
    if (!isAdmin) return;

    try {
      setIsLoadingQueue(true);

      const { data, error } = await supabase.rpc(
        'get_patient_history_queue_status'
      );

      if (error) {
        console.error('Erro ao carregar status da queue:', error);
        return;
      }

      setQueueStatus(data);
    } catch (error) {
      console.error('Erro ao carregar status da queue:', error);
    } finally {
      setIsLoadingQueue(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      loadQueueStatus();
      // Atualizar a cada 30 segundos
      const interval = setInterval(loadQueueStatus, 30000);
      return () => clearInterval(interval);
    }
  }, [isAdmin, loadQueueStatus]);

  // Toggle IA
  const handleToggleAI = async (newValue: boolean) => {
    if (!isAdmin || !user?.id || isToggling) return;

    try {
      setIsToggling(true);
      setError(null);
      setSuccessMessage(null);

      const result = await updateAIHistoryStatus(user.id, newValue);

      if (result.success) {
        setIsAiActive(newValue);
        setSuccessMessage(
          newValue
            ? 'IA ativada! Histórico será atualizado automaticamente após cada evolução.'
            : 'IA desativada. Históricos não serão mais gerados automaticamente.'
        );

        // Limpar mensagem após 5 segundos
        setTimeout(() => setSuccessMessage(null), 5000);
      } else {
        setError(result.error || 'Erro ao alterar configuração da IA');
      }
    } catch (err) {
      console.error('Erro ao alterar configuração da IA:', err);
      setError('Erro interno do servidor');
    } finally {
      setIsToggling(false);
    }
  };

  // Processar queue manualmente
  const handleProcessQueue = async () => {
    if (!isAdmin) return;

    try {
      setIsLoadingQueue(true);

      const { error } = await supabase.rpc(
        'auto_process_patient_history_queue'
      );

      if (error) {
        setError('Erro ao processar queue: ' + error.message);
      } else {
        setSuccessMessage('Queue processada com sucesso!');
        setTimeout(() => setSuccessMessage(null), 3000);
        // Recarregar status
        loadQueueStatus();
      }
    } catch (err) {
      console.error('Erro ao processar queue:', err);
      setError('Erro interno do servidor');
    } finally {
      setIsLoadingQueue(false);
    }
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          Configurações de IA
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Toggle Principal de IA */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label
                htmlFor="ai-history-toggle"
                className="text-base font-medium"
              >
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
                <Switch
                  id="ai-history-toggle"
                  checked={isAiActive}
                  onCheckedChange={handleToggleAI}
                  disabled={isToggling}
                />
              )}
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2">
            <Badge variant={isAiActive ? 'default' : 'secondary'}>
              {isAiActive ? 'IA Ativa' : 'IA Inativa'}
            </Badge>
            {isToggling && (
              <span className="text-sm text-muted-foreground">
                Atualizando...
              </span>
            )}
          </div>
        </div>

        <Separator />

        {/* Status da Queue */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              <Label className="text-base font-medium">
                Queue de Processamento
              </Label>
            </div>
            <Button
              onClick={handleProcessQueue}
              size="sm"
              variant="outline"
              disabled={isLoadingQueue}
            >
              {isLoadingQueue ? (
                <>
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <Zap className="mr-2 h-3 w-3" />
                  Processar Queue
                </>
              )}
            </Button>
          </div>

          {queueStatus && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="flex items-center gap-2 p-2 bg-yellow-50 rounded-md">
                <Clock className="h-4 w-4 text-yellow-600" />
                <div>
                  <div className="text-sm font-medium text-yellow-900">
                    Pendente
                  </div>
                  <div className="text-xs text-yellow-700">
                    {queueStatus.pending}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-md">
                <Activity className="h-4 w-4 text-blue-600" />
                <div>
                  <div className="text-sm font-medium text-blue-900">
                    Processando
                  </div>
                  <div className="text-xs text-blue-700">
                    {queueStatus.processing}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 p-2 bg-green-50 rounded-md">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <div>
                  <div className="text-sm font-medium text-green-900">
                    Concluído
                  </div>
                  <div className="text-xs text-green-700">
                    {queueStatus.completed}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 p-2 bg-red-50 rounded-md">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <div>
                  <div className="text-sm font-medium text-red-900">Falhas</div>
                  <div className="text-xs text-red-700">
                    {queueStatus.failed}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            {queueStatus && (
              <span>
                Total: {queueStatus.total} itens • Últimas 24h:{' '}
                {queueStatus.last_24h} itens
              </span>
            )}
          </div>
        </div>

        <Separator />

        {/* Informações do Sistema */}
        <div className="space-y-3">
          <Label className="text-sm font-medium flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Como funciona:
          </Label>
          <ul className="text-xs text-muted-foreground space-y-1 ml-6">
            <li>
              • Quando uma nova evolução é salva, automaticamente é adicionada à
              queue
            </li>
            <li>
              • A IA processa a queue e gera o histórico atualizado do paciente
            </li>
            <li>
              • O histórico fica disponível na seção "Histórico do Paciente"
            </li>
            <li>• O processamento acontece em background via Edge Functions</li>
            <li>• Em caso de falha, o sistema tenta novamente até 3 vezes</li>
          </ul>
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
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};
