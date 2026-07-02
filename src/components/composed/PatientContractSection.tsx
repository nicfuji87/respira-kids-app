// AI dev note: PatientContractSection - Componente Composed para gerenciar contratos de pacientes
// Exibe status do contrato e permite visualização/geração baseado em permissões

import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  AlertCircle,
  Clock,
  CheckCircle,
  Send,
  Loader2,
  RotateCw,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { useToast } from '@/components/primitives/use-toast';
import { fetchPatientContract } from '@/lib/patient-api';
import {
  generateContract,
  buildContractVariablesForPatient,
} from '@/lib/contract-api';
import { ContractViewModal } from './ContractViewModal';
import { RefazerContratoDialog } from './RefazerContratoDialog';
import { supabase } from '@/lib/supabase';

interface PatientContractSectionProps {
  patientId: string;
  userRole?: 'admin' | 'profissional' | 'secretaria' | null;
  onContractGenerated?: () => void;
}

type ContractStatus = 'SEM_CONTRATO' | 'AGUARDANDO' | 'ASSINADO';

export const PatientContractSection = React.memo<PatientContractSectionProps>(
  ({ patientId, userRole, onContractGenerated }) => {
    const [contract, setContract] = useState<{
      id: string;
      nome_contrato: string;
      conteudo_final: string;
      arquivo_url: string | null;
      status_contrato: string | null;
      data_geracao: string | null;
      data_assinatura: string | null;
      is_legacy?: boolean;
    } | null>(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [resending, setResending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isRefazerOpen, setIsRefazerOpen] = useState(false);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const { toast } = useToast();

    const canManageContract = userRole === 'admin' || userRole === 'secretaria';

    // AI dev note: Determinar status do contrato baseado no arquivo_url
    const contractStatus = React.useMemo<ContractStatus>(() => {
      if (!contract) return 'SEM_CONTRATO';
      if (!contract.arquivo_url || contract.arquivo_url === 'Aguardando') {
        return 'AGUARDANDO';
      }
      return 'ASSINADO';
    }, [contract]);

    // Buscar contrato do paciente
    const loadContract = useCallback(async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetchPatientContract(patientId);

        if (response.error) {
          setError(response.error);
        } else {
          setContract(response.contract);
        }
      } catch (err) {
        console.error('Erro ao carregar contrato:', err);
        setError('Erro ao carregar informações do contrato');
      } finally {
        setLoading(false);
      }
    }, [patientId]);

    useEffect(() => {
      loadContract();
    }, [loadContract]);

    // Validar campos obrigatórios para gerar contrato
    const validatePatientData = useCallback(async () => {
      const errors: string[] = [];

      try {
        // Buscar dados completos do paciente
        const { data: patientData, error: patientError } = await supabase
          .from('pessoas')
          .select(
            `
            id,
            nome,
            data_nascimento,
            cpf_cnpj,
            autorizacao_uso_cientifico,
            autorizacao_uso_redes_sociais,
            autorizacao_uso_do_nome,
            responsavel_cobranca_id,
            id_endereco,
            enderecos!id_endereco (
              id,
              cep,
              logradouro,
              bairro,
              cidade,
              estado
            ),
            numero_endereco,
            complemento_endereco
          `
          )
          .eq('id', patientId)
          .single();

        if (patientError || !patientData) {
          errors.push('Erro ao buscar dados do paciente');
          return { errors, patientData: null, responsavelLegalData: null };
        }

        // Validar autorizações
        if (
          patientData.autorizacao_uso_cientifico === null ||
          patientData.autorizacao_uso_redes_sociais === null ||
          patientData.autorizacao_uso_do_nome === null
        ) {
          errors.push('Autorizações não preenchidas');
        }

        // Validar endereço
        if (!patientData.id_endereco) {
          errors.push('Endereço não cadastrado');
        }

        // Validar responsável legal - buscar relacionamento
        const { data: responsavelLegalData } = await supabase
          .from('pessoa_responsaveis')
          .select(
            `
            id,
            id_responsavel,
            tipo_responsabilidade,
            pessoas!id_responsavel (
              id,
              nome,
              cpf_cnpj,
              email,
              telefone
            )
          `
          )
          .eq('id_pessoa', patientId)
          .eq('ativo', true)
          .in('tipo_responsabilidade', ['legal', 'ambos'])
          .limit(1)
          .maybeSingle();

        if (!responsavelLegalData) {
          errors.push('Responsável legal não cadastrado');
        }

        // Validar responsável financeiro
        if (!patientData.responsavel_cobranca_id) {
          errors.push('Responsável financeiro não definido');
        }

        return { errors, patientData, responsavelLegalData };
      } catch (err) {
        console.error('Erro na validação:', err);
        errors.push('Erro ao validar dados');
        return { errors, patientData: null, responsavelLegalData: null };
      }
    }, [patientId]);

    // Handler para gerar contrato
    const handleGenerateContract = useCallback(async () => {
      // Verificar permissões
      if (userRole !== 'admin' && userRole !== 'secretaria') {
        toast({
          title: 'Sem permissão',
          description:
            'Apenas administradores e secretária podem gerar contratos',
          variant: 'destructive',
        });
        return;
      }

      // Se já existe contrato (novo ou legado), não permitir regerar
      if (contract) {
        toast({
          title: 'Contrato já existe',
          description: contract.is_legacy
            ? 'Este paciente já possui um contrato do sistema anterior'
            : 'Este paciente já possui um contrato gerado',
          variant: 'destructive',
        });
        return;
      }

      try {
        setGenerating(true);
        setValidationErrors([]);

        // Validar dados obrigatórios
        const {
          errors,
          patientData: validatedPatient,
          responsavelLegalData,
        } = await validatePatientData();
        if (errors.length > 0) {
          setValidationErrors(errors);

          // Disparar webhook se as autorizações não estiverem preenchidas e tivermos os dados necessários
          if (
            errors.includes('Autorizações não preenchidas') &&
            validatedPatient &&
            responsavelLegalData?.pessoas
          ) {
            try {
              // AI dev note: Supabase TS types infer joins as arrays, but .maybeSingle() returns a single object at runtime
              const pessoaResponsavel =
                responsavelLegalData.pessoas as unknown as {
                  id: string;
                  nome: string;
                  cpf_cnpj: string | null;
                  email: string | null;
                  telefone: number | null;
                };
              const webhookPayload = {
                evento: 'solicitar_autorizacao_consentimento',
                payload: {
                  tipo: 'solicitar_autorizacao_consentimento',
                  timestamp: new Date().toISOString(),
                  webhook_id: crypto.randomUUID(),
                  data: {
                    paciente: {
                      id: patientId,
                      nome: validatedPatient.nome,
                      cpf: validatedPatient.cpf_cnpj || null,
                    },
                    responsavel_legal: {
                      id: pessoaResponsavel.id,
                      nome: pessoaResponsavel.nome,
                      telefone: pessoaResponsavel.telefone || null,
                      email: pessoaResponsavel.email || null,
                    },
                  },
                },
                status: 'pendente',
                tentativas: 0,
                max_tentativas: 3,
              };

              const { error: webhookError } = await supabase
                .from('webhook_queue')
                .insert(webhookPayload);

              if (webhookError) throw webhookError;

              toast({
                title: 'Solicitação de Autorizações',
                description:
                  'Autorizações não preenchidas. Uma solicitação de consentimento foi enviada ao responsável legal via WhatsApp.',
              });
            } catch (err) {
              console.error('Erro ao disparar webhook de consentimento:', err);
              toast({
                title: 'Erro ao solicitar autorizações',
                description:
                  'Não foi possível enviar a solicitação para o responsável automaticamente.',
                variant: 'destructive',
              });
            }
          }
          return;
        }

        // AI dev note: variáveis montadas por buildContractVariablesForPatient
        // (fonte única — mesma projeção usada no "refazer"). Trata as autorizações
        // de forma independente e busca o CPF dos responsáveis em `pessoas`.
        const contractVariables =
          await buildContractVariablesForPatient(patientId);

        // Gerar contrato (insere em user_contracts com status 'gerado')
        const newContract = await generateContract(
          patientId,
          contractVariables
        );

        // AI dev note: Marcar como "Aguardando" até o upload do PDF no bucket ser concluído
        await supabase
          .from('user_contracts')
          .update({
            arquivo_url: 'Aguardando',
            status_contrato: 'gerado',
          })
          .eq('id', newContract.id);

        // AI dev note: Chamar edge function send-contract-webhook que:
        // 1) Gera o PDF via generate-contract-pdf
        // 2) Faz upload em respira-contracts/{pessoa_id}/{contract_id}.pdf
        // 3) Gera signed URL de 24h
        // 4) Enfileira evento contrato_gerado em webhook_queue para o n8n/Assinafy
        const { data: webhookResult, error: webhookError } =
          await supabase.functions.invoke('send-contract-webhook', {
            body: {
              contractId: newContract.id,
              reenvio: false,
            },
          });

        if (webhookError || !webhookResult?.success) {
          console.error(
            'Contrato gerado, mas falha ao enviar webhook:',
            webhookError || webhookResult
          );
          toast({
            title: 'Contrato gerado com aviso',
            description:
              'O contrato foi criado, mas o envio automático falhou. Use "Reenviar contrato" para tentar novamente.',
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Contrato gerado com sucesso!',
            description:
              'O responsável receberá o contrato por e-mail para assinatura.',
          });
        }

        // Atualizar estado local (arquivo_url já foi atualizado pela edge function, mas
        // aqui mantemos o placeholder "Aguardando" para a UI exibir status "AGUARDANDO"
        // até que a assinatura real chegue via n8n)
        setContract({
          ...newContract,
          arquivo_url: 'Aguardando',
          status_contrato: 'gerado',
        });

        onContractGenerated?.();
      } catch (err) {
        console.error('Erro ao gerar contrato:', err);
        toast({
          title: 'Erro ao gerar contrato',
          description: err instanceof Error ? err.message : 'Erro desconhecido',
          variant: 'destructive',
        });
      } finally {
        setGenerating(false);
      }
    }, [
      patientId,
      userRole,
      contract,
      validatePatientData,
      toast,
      onContractGenerated,
    ]);

    // AI dev note: Handler para reenviar contrato pendente de assinatura.
    // Só disponível no estado AGUARDANDO para admin/secretaria. Chama a edge
    // function send-contract-webhook com reenvio=true, que gera o PDF novamente,
    // faz upload (x-upsert) e enfileira novo evento contrato_gerado para o n8n.
    const handleResendContract = useCallback(async () => {
      if (userRole !== 'admin' && userRole !== 'secretaria') {
        toast({
          title: 'Sem permissão',
          description:
            'Apenas administradores e secretária podem reenviar contratos',
          variant: 'destructive',
        });
        return;
      }

      if (!contract || !contract.id) {
        toast({
          title: 'Contrato não encontrado',
          description: 'Não foi possível identificar o contrato para reenvio.',
          variant: 'destructive',
        });
        return;
      }

      try {
        setResending(true);

        const { data: webhookResult, error: webhookError } =
          await supabase.functions.invoke('send-contract-webhook', {
            body: {
              contractId: contract.id,
              reenvio: true,
            },
          });

        if (webhookError || !webhookResult?.success) {
          throw new Error(
            webhookResult?.error ||
              webhookError?.message ||
              'Falha ao reenviar contrato'
          );
        }

        toast({
          title: 'Contrato reenviado!',
          description:
            'O responsável receberá o contrato novamente por e-mail para assinatura.',
        });
      } catch (err) {
        console.error('Erro ao reenviar contrato:', err);
        toast({
          title: 'Erro ao reenviar contrato',
          description: err instanceof Error ? err.message : 'Erro desconhecido',
          variant: 'destructive',
        });
      } finally {
        setResending(false);
      }
    }, [contract, userRole, toast]);

    if (loading) {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Contrato
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      );
    }

    if (error) {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Contrato
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      );
    }

    return (
      <>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Contrato
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Status do contrato */}
            {contractStatus === 'SEM_CONTRATO' && (
              <>
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Este paciente não possui contrato
                  </AlertDescription>
                </Alert>

                {/* Erros de validação */}
                {validationErrors.length > 0 && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <div className="space-y-1">
                        <p className="font-medium">Dados incompletos:</p>
                        <ul className="list-disc list-inside space-y-1">
                          {validationErrors.map((error, index) => (
                            <li key={index} className="text-sm">
                              {error}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Botão gerar contrato */}
                {(userRole === 'admin' || userRole === 'secretaria') && (
                  <Button
                    onClick={handleGenerateContract}
                    disabled={generating}
                    className="w-full"
                  >
                    {generating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Gerando contrato...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Gerar Contrato
                      </>
                    )}
                  </Button>
                )}
              </>
            )}

            {contractStatus === 'AGUARDANDO' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-yellow-600">
                    <Clock className="h-3 w-3 mr-1" />
                    Aguardando Assinatura
                  </Badge>
                  {contract?.data_geracao && (
                    <span className="text-sm text-muted-foreground">
                      Gerado em{' '}
                      {new Date(contract.data_geracao).toLocaleDateString(
                        'pt-BR'
                      )}
                    </span>
                  )}
                </div>

                <Alert>
                  <AlertDescription>
                    O contrato foi enviado para o responsável e está aguardando
                    assinatura
                  </AlertDescription>
                </Alert>

                <Button
                  onClick={() => setIsModalOpen(true)}
                  variant="outline"
                  className="w-full"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Ver Contrato
                </Button>

                {/* AI dev note: Botão de reenvio só aparece para admin/secretaria */}
                {(userRole === 'admin' || userRole === 'secretaria') && (
                  <Button
                    onClick={handleResendContract}
                    disabled={resending}
                    variant="default"
                    className="w-full"
                  >
                    {resending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Reenviando...
                      </>
                    ) : (
                      <>
                        <RotateCw className="h-4 w-4 mr-2" />
                        Reenviar Contrato
                      </>
                    )}
                  </Button>
                )}

                {/* AI dev note: Refazer regera o contrato a partir dos dados
                    atuais (ajustando autorizações) e reenvia — com auditoria. */}
                {canManageContract && (
                  <Button
                    onClick={() => setIsRefazerOpen(true)}
                    variant="outline"
                    className="w-full"
                  >
                    <RotateCw className="h-4 w-4 mr-2" />
                    Refazer Contrato
                  </Button>
                )}
              </div>
            )}

            {contractStatus === 'ASSINADO' && (
              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <Badge
                      variant="default"
                      className="text-green-600 bg-green-100"
                    >
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Contrato Assinado
                    </Badge>
                    {contract?.data_assinatura && (
                      <span className="text-sm text-muted-foreground">
                        Assinado em{' '}
                        {new Date(contract.data_assinatura).toLocaleDateString(
                          'pt-BR'
                        )}
                      </span>
                    )}
                  </div>

                  {/* Indicador de contrato legado */}
                  {contract?.is_legacy && (
                    <Alert>
                      <AlertDescription className="text-xs">
                        Este é um contrato do sistema anterior. Apenas
                        visualização do PDF está disponível.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>

                {/* Se for contrato legado, abrir link diretamente */}
                {contract?.is_legacy ? (
                  <Button
                    onClick={() =>
                      window.open(contract.arquivo_url || '', '_blank')
                    }
                    variant="outline"
                    className="w-full"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Abrir Contrato (PDF)
                  </Button>
                ) : (
                  <Button
                    onClick={() => setIsModalOpen(true)}
                    variant="outline"
                    className="w-full"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Ver Contrato
                  </Button>
                )}

                {/* AI dev note: Refazer contrato assinado (ex.: correção de
                    cláusula). Não disponível para contratos legados. */}
                {canManageContract && !contract?.is_legacy && (
                  <Button
                    onClick={() => setIsRefazerOpen(true)}
                    variant="outline"
                    className="w-full"
                  >
                    <RotateCw className="h-4 w-4 mr-2" />
                    Refazer Contrato
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modal de visualização do contrato - apenas para contratos novos */}
        {contract && !contract.is_legacy && (
          <ContractViewModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            contractId={contract.id}
            contractContent={contract.conteudo_final}
            pdfUrl={
              contract.arquivo_url && contract.arquivo_url !== 'Aguardando'
                ? contract.arquivo_url
                : undefined
            }
            patientName={contract.nome_contrato.split(' - ')[1] || 'Paciente'}
          />
        )}

        {/* Diálogo de refazer contrato (admin/secretária) */}
        {canManageContract && (
          <RefazerContratoDialog
            isOpen={isRefazerOpen}
            onClose={() => setIsRefazerOpen(false)}
            patientId={patientId}
            onDone={loadContract}
          />
        )}
      </>
    );
  }
);

PatientContractSection.displayName = 'PatientContractSection';
