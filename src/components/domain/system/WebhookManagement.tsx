import React, { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from '@/components/primitives/use-toast';
import { WebhooksList, type Webhook } from '@/components/composed/WebhooksList';
import {
  WebhookForm,
  type WebhookFormData,
} from '@/components/composed/WebhookForm';
import {
  WebhookLogs,
  type WebhookLog,
} from '@/components/composed/WebhookLogs';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/primitives/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/primitives/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { Button } from '@/components/primitives/button';
import { PlayCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// AI dev note: WebhookManagement - Componente domain que combina todos os composed
// Gerencia estado e integração com Supabase para webhooks

const webhookSchema = z.object({
  url: z
    .string()
    .url('URL deve ser válida')
    .startsWith('https://', 'URL deve usar HTTPS'),
  eventos: z.array(z.string()).min(1, 'Selecione pelo menos um evento'),
  ativo: z.boolean(),
  headers: z
    .string()
    .optional()
    .refine((val) => {
      if (!val || val.trim() === '') return true;
      try {
        JSON.parse(val);
        return true;
      } catch {
        return false;
      }
    }, 'Headers devem estar em formato JSON válido'),
});

export const WebhookManagement = React.memo(() => {
  // Estados
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isPayloadDialogOpen, setIsPayloadDialogOpen] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<Webhook | null>(null);
  const [selectedLog, setSelectedLog] = useState<WebhookLog | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Form
  const form = useForm<WebhookFormData>({
    resolver: zodResolver(webhookSchema),
    defaultValues: {
      url: '',
      eventos: [],
      ativo: true,
      headers: '',
    },
  });

  // Carregar webhooks
  const loadWebhooks = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('webhooks')
        .select('id, url, eventos, ativo, headers, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setWebhooks(data || []);
    } catch (error) {
      console.error('Erro ao carregar webhooks:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os webhooks.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // Carregar logs
  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const { data, error } = await supabase
        .from('webhook_queue')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Erro ao carregar logs:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar o histórico de webhooks.',
        variant: 'destructive',
      });
    } finally {
      setLogsLoading(false);
    }
  }, []);

  // Effect inicial
  useEffect(() => {
    loadWebhooks();
    loadLogs();
  }, [loadWebhooks, loadLogs]);

  // Handlers
  const handleAdd = useCallback(() => {
    form.reset({
      url: '',
      eventos: [],
      ativo: true,
      headers: '',
    });
    setIsEditing(false);
    setIsFormOpen(true);
  }, [form]);

  const handleEdit = useCallback(
    (webhook: Webhook) => {
      form.reset({
        url: webhook.url,
        eventos: webhook.eventos,
        ativo: webhook.ativo,
        headers:
          typeof webhook.headers === 'object'
            ? JSON.stringify(webhook.headers, null, 2)
            : webhook.headers || '',
      });
      setSelectedWebhook(webhook);
      setIsEditing(true);
      setIsFormOpen(true);
    },
    [form]
  );

  const handleDelete = useCallback((webhook: Webhook) => {
    setSelectedWebhook(webhook);
    setIsDeleteDialogOpen(true);
  }, []);

  const handleTest = useCallback(
    async (webhook: Webhook) => {
      try {
        // Inserir webhook de teste na queue
        const { error: insertError } = await supabase
          .from('webhook_queue')
          .insert({
            evento: 'webhook_test',
            payload: {
              tipo: 'webhook_test',
              timestamp: new Date().toISOString(),
              data: {
                test: true,
                webhook_id: webhook.id,
                message: 'Teste de webhook enviado manualmente',
                url_destino: webhook.url,
              },
              webhook_id: crypto.randomUUID(),
            },
            status: 'pendente',
            tentativas: 0,
            max_tentativas: 3,
          });

        if (insertError) throw insertError;

        // Testar URL com headers customizados se existirem
        const { data: testResult, error: testError } = await supabase.rpc(
          'send_webhook_with_auth',
          {
            webhook_url: webhook.url,
            webhook_payload: {
              tipo: 'webhook_test',
              timestamp: new Date().toISOString(),
              data: {
                test: true,
                webhook_id: webhook.id,
                message: 'Teste direto da interface',
                url_destino: webhook.url,
                agendamento_nicolas: '7fc38274-87a0-46f1-9bbd-1370763b63d4',
              },
              webhook_id: crypto.randomUUID(),
            },
            webhook_headers: webhook.headers || {},
          }
        );

        if (testError) {
          console.error('Erro no teste:', testError);
          throw testError;
        }

        const result = Array.isArray(testResult) ? testResult[0] : testResult;

        if (result?.sent) {
          toast({
            title: 'Teste Enviado com Sucesso! ✅',
            description: `Webhook enviado para ${webhook.url} (Status: ${result.status_code})\nResposta: ${result.response_preview}`,
          });
        } else {
          toast({
            title: 'Teste Falhou ❌',
            description: `Erro: ${result?.error_info || 'Erro desconhecido'} (Status: ${result?.status_code || 0})`,
            variant: 'destructive',
          });
        }

        // Recarregar logs para mostrar o teste
        loadLogs();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Erro desconhecido';
        console.error('Erro ao testar webhook:', errorMessage);
        toast({
          title: 'Erro',
          description: `Não foi possível enviar o teste: ${errorMessage}`,
          variant: 'destructive',
        });
      }
    },
    [loadLogs]
  );

  const handleSubmit = useCallback(
    async (data: WebhookFormData) => {
      try {
        // Processar headers se fornecidos
        let headersJson = null;
        if (data.headers && data.headers.trim()) {
          try {
            headersJson = JSON.parse(data.headers);
          } catch {
            throw new Error('Headers devem estar em formato JSON válido');
          }
        }

        if (isEditing && selectedWebhook) {
          // Editar
          const { error } = await supabase
            .from('webhooks')
            .update({
              url: data.url,
              eventos: data.eventos,
              ativo: data.ativo,
              headers: headersJson,
              updated_at: new Date().toISOString(),
            })
            .eq('id', selectedWebhook.id);

          if (error) throw error;

          toast({
            title: 'Sucesso',
            description: 'Webhook atualizado com sucesso.',
          });
        } else {
          // Criar
          const { error } = await supabase.from('webhooks').insert({
            url: data.url,
            eventos: data.eventos,
            ativo: data.ativo,
            headers: headersJson,
          });

          if (error) throw error;

          toast({
            title: 'Sucesso',
            description: 'Webhook criado com sucesso.',
          });
        }

        setIsFormOpen(false);
        loadWebhooks();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Erro desconhecido';
        console.error('Erro ao salvar webhook:', errorMessage);
        toast({
          title: 'Erro',
          description: `Não foi possível salvar o webhook: ${errorMessage}`,
          variant: 'destructive',
        });
      }
    },
    [isEditing, selectedWebhook, loadWebhooks]
  );

  const confirmDelete = useCallback(async () => {
    if (!selectedWebhook) return;

    try {
      const { error } = await supabase
        .from('webhooks')
        .delete()
        .eq('id', selectedWebhook.id);

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Webhook removido com sucesso.',
      });

      setIsDeleteDialogOpen(false);
      loadWebhooks();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Erro desconhecido';
      console.error('Erro ao remover webhook:', errorMessage);
      toast({
        title: 'Erro',
        description: `Não foi possível remover o webhook: ${errorMessage}`,
        variant: 'destructive',
      });
    }
  }, [selectedWebhook, loadWebhooks]);

  const handleRetry = useCallback(
    async (log: WebhookLog) => {
      try {
        // Inserir novamente na queue com status pendente
        const { error } = await supabase.from('webhook_queue').insert({
          evento: log.evento,
          payload: log.payload,
          status: 'pendente',
          tentativas: 0,
          max_tentativas: 3,
          proximo_retry: new Date().toISOString(),
        });

        if (error) throw error;

        toast({
          title: 'Sucesso',
          description: 'Webhook adicionado novamente à fila de processamento.',
        });

        loadLogs();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Erro desconhecido';
        console.error('Erro ao reenviar webhook:', errorMessage);
        toast({
          title: 'Erro',
          description: `Não foi possível reenviar o webhook: ${errorMessage}`,
          variant: 'destructive',
        });
      }
    },
    [loadLogs]
  );

  const handleViewPayload = useCallback((log: WebhookLog) => {
    setSelectedLog(log);
    setIsPayloadDialogOpen(true);
  }, []);

  // Processar toda a queue de webhooks pendentes
  const handleProcessQueue = useCallback(async () => {
    try {
      setLogsLoading(true);

      const { data: processResult, error: processError } = await supabase.rpc(
        'process_webhooks_simple'
      );

      if (processError) {
        console.error('Erro no processamento:', processError);
        throw processError;
      }

      const result = Array.isArray(processResult)
        ? processResult[0]
        : processResult;

      toast({
        title: 'Processamento Concluído ✅',
        description: `${result?.processed_count || 0} webhooks processados.\nDetalhes: ${result?.details || 'Nenhum detalhe'}`,
      });

      // Recarregar logs
      loadLogs();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Erro desconhecido';
      console.error('Erro ao processar queue:', errorMessage);
      toast({
        title: 'Erro',
        description: `Não foi possível processar a queue: ${errorMessage}`,
        variant: 'destructive',
      });
    } finally {
      setLogsLoading(false);
    }
  }, [loadLogs]);

  return (
    <div className="space-y-6">
      <Tabs defaultValue="webhooks" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="webhooks">Configuração</TabsTrigger>
          <TabsTrigger value="logs">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="webhooks" className="space-y-6">
          <WebhooksList
            webhooks={webhooks}
            loading={loading}
            onAdd={handleAdd}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onTest={handleTest}
          />
        </TabsContent>

        <TabsContent value="logs" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-medium">Histórico de Webhooks</h3>
              <p className="text-sm text-muted-foreground">
                Log de todos os webhooks enviados pelo sistema
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleProcessQueue}
              disabled={logsLoading}
            >
              <PlayCircle className="mr-2 h-4 w-4" />
              Processar Queue
            </Button>
          </div>

          <WebhookLogs
            logs={logs}
            loading={logsLoading}
            onRetry={handleRetry}
            onViewPayload={handleViewPayload}
          />
        </TabsContent>
      </Tabs>

      {/* Form Modal */}
      <WebhookForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleSubmit}
        form={form}
        isEditing={isEditing}
        loading={form.formState.isSubmitting}
      />

      {/* Delete Confirmation */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover este webhook? Esta ação não pode
              ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Payload Viewer */}
      <Dialog open={isPayloadDialogOpen} onOpenChange={setIsPayloadDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Payload do Webhook</DialogTitle>
            <DialogDescription>Dados enviados para o webhook</DialogDescription>
          </DialogHeader>

          <div className="max-h-96 overflow-auto">
            <pre className="text-sm bg-muted p-4 rounded-lg">
              {selectedLog ? JSON.stringify(selectedLog.payload, null, 2) : ''}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
});

WebhookManagement.displayName = 'WebhookManagement';
