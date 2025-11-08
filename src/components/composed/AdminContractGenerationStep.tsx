import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/primitives/button';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { ScrollArea } from '@/components/primitives/scroll-area';
import { Loader2, Send, FileText, CheckCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { generateContract, type ContractVariables } from '@/lib/contract-api';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/primitives/use-toast';

interface AdminContractGenerationStepProps {
  patientId: string;
  contractVariables: ContractVariables;
  onFinish: () => void;
  onBack: () => void;
}

// AI dev note: Geração e envio de contrato com feedback "Contrato enviado via WhatsApp"
export const AdminContractGenerationStep: React.FC<
  AdminContractGenerationStepProps
> = ({ patientId, contractVariables, onFinish, onBack }) => {
  const [contract, setContract] = useState<{
    id: string;
    nome_contrato: string;
    conteudo_final: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Gerar contrato ao montar componente
  useEffect(() => {
    const createContract = async () => {
      try {
        setLoading(true);
        setError(null);

        // Gerar contrato usando API existente
        const newContract = await generateContract(
          patientId,
          contractVariables
        );

        if (!newContract || !newContract.id) {
          throw new Error('Erro ao gerar contrato');
        }

        setContract(newContract);
      } catch (err) {
        console.error('Erro ao gerar contrato:', err);
        setError(err instanceof Error ? err.message : 'Erro ao gerar contrato');
      } finally {
        setLoading(false);
      }
    };

    createContract();
  }, [patientId, contractVariables]);

  const handleSendContract = async () => {
    if (!contract) return;

    try {
      setSending(true);
      setError(null);

      // Atualizar status do contrato para "Aguardando"
      const { error: updateError } = await supabase
        .from('user_contracts')
        .update({
          arquivo_url: 'Aguardando',
          status_contrato: 'pendente',
        })
        .eq('id', contract.id);

      if (updateError) {
        throw new Error('Erro ao atualizar status do contrato');
      }

      // Criar payload do webhook
      const webhookPayload = {
        type: 'contract_generated',
        contract_id: contract.id,
        patient_id: patientId,
        patient_name: contractVariables.paciente,
        responsible_name: contractVariables.responsavelLegalNome,
        responsible_whatsapp: contractVariables.responsavelLegalTelefone,
        contract_name: contract.nome_contrato,
        timestamp: new Date().toISOString(),
      };

      // Inserir na fila de webhooks
      const { error: webhookError } = await supabase
        .from('webhook_queue')
        .insert({
          type: 'contract_generated',
          payload: webhookPayload,
          status: 'pending',
          retry_count: 0,
        });

      if (webhookError) {
        console.error('Erro ao criar webhook:', webhookError);
        // Não bloquear o fluxo por erro no webhook
      }

      setSent(true);

      // Mostrar toast de sucesso
      toast({
        title: 'Contrato enviado!',
        description: 'Contrato enviado via WhatsApp para o responsável',
        duration: 5000,
      });

      // Aguardar um pouco antes de finalizar
      setTimeout(() => {
        onFinish();
      }, 2000);
    } catch (err) {
      console.error('Erro ao enviar contrato:', err);
      setError(err instanceof Error ? err.message : 'Erro ao enviar contrato');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-lg">Gerando contrato...</span>
      </div>
    );
  }

  if (error && !contract) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Voltar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold">Contrato Gerado</h2>
        <p className="text-muted-foreground">
          Revise o contrato e envie para o responsável
        </p>
      </div>

      {/* Preview do Contrato */}
      {contract && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {contract.nome_contrato}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] w-full border rounded-lg p-4">
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => (
                      <h1 className="text-xl font-bold mb-4 text-center">
                        {children}
                      </h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="text-lg font-semibold mb-3">{children}</h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-md font-semibold mb-2">{children}</h3>
                    ),
                    p: ({ children }) => (
                      <p className="mb-3 text-sm">{children}</p>
                    ),
                    ul: ({ children }) => (
                      <ul className="list-disc pl-5 mb-3 space-y-1">
                        {children}
                      </ul>
                    ),
                    li: ({ children }) => (
                      <li className="text-sm">{children}</li>
                    ),
                    strong: ({ children }) => (
                      <strong className="font-semibold">{children}</strong>
                    ),
                  }}
                >
                  {contract.conteudo_final}
                </ReactMarkdown>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Status de envio */}
      {sent && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800 font-medium">
            Contrato enviado via WhatsApp para o responsável
          </AlertDescription>
        </Alert>
      )}

      {/* Erro ao enviar */}
      {error && contract && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Botões de ação */}
      <div className="flex justify-between">
        <button
          type="button"
          onClick={onBack}
          disabled={sending || sent}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
        >
          Voltar
        </button>

        {!sent ? (
          <Button
            onClick={handleSendContract}
            disabled={sending || !contract}
            size="default"
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Enviar para Responsável via WhatsApp
              </>
            )}
          </Button>
        ) : (
          <Button onClick={onFinish} variant="default">
            <CheckCircle className="h-4 w-4 mr-2" />
            Concluir Cadastro
          </Button>
        )}
      </div>
    </div>
  );
};
