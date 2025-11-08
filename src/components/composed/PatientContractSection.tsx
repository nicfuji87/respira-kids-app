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
import { generateContract } from '@/lib/contract-api';
import type { ContractVariables } from '@/lib/contract-api';
import { ContractViewModal } from './ContractViewModal';
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
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const { toast } = useToast();

    // AI dev note: Determinar status do contrato baseado no arquivo_url
    const contractStatus = React.useMemo<ContractStatus>(() => {
      if (!contract) return 'SEM_CONTRATO';
      if (!contract.arquivo_url || contract.arquivo_url === 'Aguardando') {
        return 'AGUARDANDO';
      }
      return 'ASSINADO';
    }, [contract]);

    // Buscar contrato do paciente
    useEffect(() => {
      const loadContract = async () => {
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
      };

      loadContract();
    }, [patientId]);

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
          return errors;
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
          .single();

        if (!responsavelLegalData) {
          errors.push('Responsável legal não cadastrado');
        }

        // Validar responsável financeiro
        if (!patientData.responsavel_cobranca_id) {
          errors.push('Responsável financeiro não definido');
        }

        return errors;
      } catch (err) {
        console.error('Erro na validação:', err);
        errors.push('Erro ao validar dados');
        return errors;
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
        const errors = await validatePatientData();
        if (errors.length > 0) {
          setValidationErrors(errors);
          return;
        }

        // Buscar todos os dados necessários para o contrato
        const { data: patientData } = await supabase
          .from('pacientes_com_responsaveis_view')
          .select('*')
          .eq('id', patientId)
          .single();

        if (!patientData) {
          throw new Error('Dados do paciente não encontrados');
        }

        // Buscar pediatra
        await supabase
          .from('paciente_pediatra')
          .select(
            `
            pessoa_pediatra!inner(
              pessoa_id,
              pessoas!pessoa_id(nome)
            )
          `
          )
          .eq('paciente_id', patientId)
          .eq('ativo', true)
          .limit(1)
          .maybeSingle();

        // Formatar data brasileira
        const formatarDataBrasileira = (dataISO: string): string => {
          if (!dataISO) return '';
          const [year, month, day] = dataISO.split('-');
          return `${day}/${month}/${year}`;
        };

        // Formatar telefone
        const formatarTelefone = (telefone: bigint | number | null): string => {
          if (!telefone) return '';
          const tel = telefone.toString();
          if (tel.length === 11) {
            return `(${tel.slice(0, 2)}) ${tel.slice(2, 7)}-${tel.slice(7)}`;
          }
          return tel;
        };

        // Montar variáveis do contrato
        const contractVariables: ContractVariables = {
          // Responsável Legal
          responsavelLegalNome: patientData.responsavel_legal_nome || '',
          responsavelLegalCpf: patientData.responsavel_legal_cpf || '',
          responsavelLegalTelefone: formatarTelefone(
            patientData.responsavel_legal_telefone
          ),
          responsavelLegalEmail: patientData.responsavel_legal_email || '',
          responsavelLegalFinanceiro:
            patientData.responsavel_legal_id ===
            patientData.responsavel_financeiro_id
              ? 'e Financeiro'
              : '',

          // Cláusula condicional para responsável financeiro diferente
          clausulaResponsavelFinanceiro:
            patientData.responsavel_legal_id !==
              patientData.responsavel_financeiro_id &&
            patientData.responsavel_financeiro_nome
              ? `\n\n**Parágrafo único:** Os pagamentos referentes aos serviços prestados serão realizados por **${patientData.responsavel_financeiro_nome}**, CPF nº ${patientData.responsavel_financeiro_cpf || ''}, telefone ${formatarTelefone(patientData.responsavel_financeiro_telefone)}, email ${patientData.responsavel_financeiro_email || ''}, na qualidade de **RESPONSÁVEL FINANCEIRO**.`
              : '',

          // Variáveis antigas (compatibilidade)
          contratante: patientData.responsavel_legal_nome || '',
          cpf: patientData.responsavel_legal_cpf || '',
          telefone: formatarTelefone(patientData.responsavel_legal_telefone),
          email: patientData.responsavel_legal_email || '',

          // Endereço
          endereco_completo: [
            patientData.logradouro,
            patientData.numero_endereco && `, ${patientData.numero_endereco}`,
            patientData.complemento_endereco &&
              ` ${patientData.complemento_endereco}`,
            patientData.bairro && `, ${patientData.bairro}`,
            patientData.cidade && `, ${patientData.cidade}`,
            patientData.estado && ` - ${patientData.estado}`,
            patientData.cep && `, CEP ${patientData.cep}`,
          ]
            .filter(Boolean)
            .join(''),

          logradouro: patientData.logradouro || '',
          numero: patientData.numero_endereco || '',
          complemento: patientData.complemento_endereco,
          bairro: patientData.bairro || '',
          cidade: patientData.cidade || '',
          uf: patientData.estado || '',
          cep: patientData.cep || '',

          // Paciente
          paciente: patientData.nome || '',
          dnPac: formatarDataBrasileira(patientData.data_nascimento || ''),
          cpfPac: patientData.cpf_cnpj || 'não fornecido',

          // Data
          hoje: new Date().toLocaleDateString('pt-BR'),

          // Autorizações
          autorizo:
            patientData.autorizacao_uso_cientifico ||
            patientData.autorizacao_uso_redes_sociais
              ? 'autorizo'
              : 'não autorizo',

          fimTerapeutico: (() => {
            const cientifico = patientData.autorizacao_uso_cientifico;
            const redesSociais = patientData.autorizacao_uso_redes_sociais;

            if (cientifico && redesSociais) {
              return 'para fins terapêuticos, com o objetivo de aprimorar os procedimentos técnicos dos aplicadores e a evolução clínica do paciente, sejam eles impressos, ou digitais, em divulgações científicas, jornalísticas e publicitárias, produções fotográficas; em materiais impressos; publicações internas e externas; palestras e materiais EAD; programas televisivos; redes sociais e outros dessa natureza. Sempre sem fins lucrativos, permitido igualmente a disponibilização deste material em DVD ou outra forma de mídia em acervos de biblioteca, periódicos, entre outros';
            }
            if (cientifico && !redesSociais) {
              return 'para fins terapêuticos, com o objetivo de aprimorar os procedimentos técnicos dos aplicadores e a evolução clínica do paciente, sejam eles impressos, ou digitais, porém a CONTRATANTE não autoriza em divulgações científicas, jornalísticas e publicitárias, produções fotográficas; em materiais impressos; publicações internas e externas; palestras e materiais EAD; programas televisivos; redes sociais e outros dessa natureza. Sempre sem fins lucrativos, permitido igualmente a disponibilização deste material em DVD ou outra forma de mídia em acervos de biblioteca, periódicos, entre outros';
            }
            return 'para fins terapêuticos, com o objetivo de aprimorar os procedimentos técnicos dos aplicadores e a evolução clínica do paciente, sejam eles impressos, ou digitais, em divulgações científicas, jornalísticas e publicitárias, produções fotográficas; em materiais impressos; publicações internas e externas; palestras e materiais EAD; programas televisivos; redes sociais e outros dessa natureza. Sempre sem fins lucrativos, permitido igualmente a disponibilização deste material em DVD ou outra forma de mídia em acervos de biblioteca, periódicos, entre outros';
          })(),

          vinculoNome: patientData.autorizacao_uso_do_nome
            ? 'poderão'
            : 'não poderão',
        };

        // Gerar contrato
        const newContract = await generateContract(
          patientId,
          contractVariables
        );

        // Atualizar status para "Aguardando" no arquivo_url
        await supabase
          .from('user_contracts')
          .update({
            arquivo_url: 'Aguardando',
            status_contrato: 'pendente',
          })
          .eq('id', newContract.id);

        // Enviar webhook para notificar sobre novo contrato
        const webhookPayload = {
          evento: 'contrato_gerado',
          payload: {
            contrato_id: newContract.id,
            paciente_id: patientId,
            paciente_nome: patientData.nome,
            responsavel_nome: patientData.responsavel_legal_nome,
            responsavel_telefone: patientData.responsavel_legal_telefone,
            responsavel_email: patientData.responsavel_legal_email,
          },
        };

        // Inserir na fila de webhooks
        await supabase.from('webhook_queue').insert(webhookPayload);

        // Atualizar estado local
        setContract({
          ...newContract,
          arquivo_url: 'Aguardando',
          status_contrato: 'pendente',
        });

        toast({
          title: 'Contrato gerado com sucesso!',
          description: 'O responsável receberá o contrato para assinatura.',
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
      </>
    );
  }
);

PatientContractSection.displayName = 'PatientContractSection';
