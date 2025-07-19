import React, { useState, useEffect } from 'react';
import {
  History,
  Wand2,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Bell,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Switch } from '@/components/primitives/switch';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { Badge } from '@/components/primitives/badge';
import { Skeleton } from '@/components/primitives/skeleton';
import { Label } from '@/components/primitives/label';
import { cn } from '@/lib/utils';
import type { PatientHistoryProps } from '@/types/patient-details';

// AI dev note: PatientHistory - Component Composed com toggle AI + notificações
// Gerencia geração automática de histórico compilado usando Edge Function
// Combina primitivos Switch, Card, Button, Alert para interface AI

export const PatientHistory = React.memo<PatientHistoryProps>(
  ({ patientId, className }) => {
    const [history, setHistory] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [autoGenerate, setAutoGenerate] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastGenerated, setLastGenerated] = useState<string | null>(null);
    const [evolutionsCount, setEvolutionsCount] = useState(0);

    // Simular carregamento inicial
    useEffect(() => {
      const loadHistory = async () => {
        if (!patientId) return;

        try {
          setIsLoading(true);
          setError(null);

          // TODO: Implementar API para buscar histórico existente
          // Por agora, simular dados
          await new Promise((resolve) => setTimeout(resolve, 1000));

          // Mock data
          setHistory('');
          setLastGenerated(null);
          setEvolutionsCount(0);
        } catch (err) {
          console.error('Erro ao carregar histórico:', err);
          setError('Erro ao carregar histórico do paciente');
        } finally {
          setIsLoading(false);
        }
      };

      loadHistory();
    }, [patientId]);

    const handleGenerateHistory = async () => {
      if (isGenerating) return;

      try {
        setIsGenerating(true);
        setError(null);

        // TODO: Implementar chamada para patient-history-ai Edge Function
        // Por agora, simular geração
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Mock generated history
        const mockHistory = `
## HISTÓRICO COMPILADO - EVOLUÇÃO DO PACIENTE

### Resumo da Condição Inicial
Paciente iniciou tratamento de fisioterapia respiratória pediátrica com quadro de...

### Principais Intervenções Realizadas
- Técnicas de higiene brônquica
- Exercícios respiratórios específicos
- Orientações posturais

### Evolução e Progressos Observados
Demonstrou melhora significativa em...

### Status Atual e Recomendações
Continuar protocolo atual com ajustes em...
        `.trim();

        setHistory(mockHistory);
        setLastGenerated(new Date().toISOString());
        setEvolutionsCount(8); // Mock count
        setAutoGenerate(true);

        // Toast notification (será implementado via toast do projeto)
        console.log('🎉 Histórico compilado gerado com sucesso!');
      } catch (err) {
        console.error('Erro ao gerar histórico:', err);
        setError('Erro ao gerar histórico compilado');
      } finally {
        setIsGenerating(false);
      }
    };

    const formatDate = (dateString: string) => {
      return new Date(dateString).toLocaleString('pt-BR');
    };

    // Loading state
    if (isLoading) {
      return (
        <Card className={cn('w-full', className)}>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-6 w-12" />
            </div>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className={cn('w-full', className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Histórico do Paciente
            {autoGenerate && (
              <Badge variant="secondary" className="ml-auto">
                <Bell className="h-3 w-3 mr-1" />
                Auto IA
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Controle de Geração Automática */}
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div className="flex-1 space-y-1">
              <Label
                htmlFor={`auto-generate-${patientId}`}
                className="text-sm font-medium cursor-pointer"
              >
                Geração Automática com IA
              </Label>
              <p className="text-xs text-muted-foreground">
                Gera automaticamente histórico compilado das evoluções
              </p>
            </div>
            <Switch
              id={`auto-generate-${patientId}`}
              checked={autoGenerate}
              onCheckedChange={setAutoGenerate}
              disabled={isGenerating}
            />
          </div>

          {/* Informações sobre Geração */}
          {evolutionsCount > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {evolutionsCount} evolução{evolutionsCount !== 1 ? 'ões' : ''}{' '}
                disponível{evolutionsCount !== 1 ? 'eis' : ''}
              </span>
              {lastGenerated && (
                <span className="text-muted-foreground">
                  Última geração: {formatDate(lastGenerated)}
                </span>
              )}
            </div>
          )}

          {/* Botão de Geração Manual */}
          {(!history || error) && (
            <div className="text-center py-8 space-y-4">
              <div className="text-muted-foreground">
                {evolutionsCount === 0 ? (
                  <p>Nenhuma evolução encontrada para gerar histórico</p>
                ) : (
                  <p>Clique no botão abaixo para gerar o histórico compilado</p>
                )}
              </div>

              {evolutionsCount > 0 && (
                <Button
                  onClick={handleGenerateHistory}
                  disabled={isGenerating}
                  size="lg"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Gerando Histórico...
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-4 w-4 mr-2" />
                      Gerar Histórico com IA
                    </>
                  )}
                </Button>
              )}
            </div>
          )}

          {/* Histórico Gerado */}
          {history && !error && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  Histórico Compilado
                </Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateHistory}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3 mr-1" />
                  )}
                  Regenerar
                </Button>
              </div>

              <div className="prose prose-sm max-w-none p-4 border rounded-lg bg-background">
                <div
                  className="whitespace-pre-wrap text-sm"
                  dangerouslySetInnerHTML={{
                    __html: history.replace(/\n/g, '<br/>'),
                  }}
                />
              </div>
            </div>
          )}

          {/* Erro */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Notificação Automática */}
          {autoGenerate && !history && evolutionsCount > 0 && !error && (
            <Alert>
              <Bell className="h-4 w-4" />
              <AlertDescription>
                A geração automática está ativada. O histórico será atualizado
                automaticamente quando novas evoluções forem adicionadas.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    );
  }
);

PatientHistory.displayName = 'PatientHistory';
