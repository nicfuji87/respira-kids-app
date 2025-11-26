import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapPin, Edit, Save, XCircle } from 'lucide-react';
import { useToast } from '@/components/primitives/use-toast';
import { ToastAction } from '@/components/primitives/toast';
import { parseSupabaseDatetime } from '@/lib/calendar-mappers';

import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import { Badge } from '@/components/primitives/badge';
import { Separator } from '@/components/primitives/separator';
import { ScrollArea } from '@/components/primitives/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import {
  DatePicker,
  StatusPaymentDisplay,
  LocationSelect,
  SessionMediaManager,
  EvolutionEditor,
  type LocationOption,
} from '@/components/composed';
import { RichTextEditor } from '@/components/primitives/rich-text-editor';
import { cn, formatDateTimeBR } from '@/lib/utils';
import {
  fetchConsultaStatus,
  fetchTiposServico,
  fetchRelatoriosEvolucao,
  saveRelatorioEvolucao,
  updateRelatorioEvolucao,
} from '@/lib/calendar-services';
import {
  generatePatientHistoryAI,
  checkAIHistoryStatus,
} from '@/lib/patient-api';
import type {
  SupabaseAgendamentoCompletoFlat,
  SupabaseConsultaStatus,
  SupabaseTipoServico,
  SupabaseRelatorioEvolucaoCompleto,
} from '@/types/supabase-calendar';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

// AI dev note: AppointmentDetailsManager é um DOMAIN que combina COMPOSED específicos
// para gerenciar detalhes completos de agendamentos médicos com permissões por role

export interface AppointmentDetailsManagerProps {
  isOpen: boolean;
  onClose: () => void;
  appointment?: SupabaseAgendamentoCompletoFlat | null;
  userRole: 'admin' | 'profissional' | 'secretaria' | null;
  locaisAtendimento: LocationOption[];
  isLoadingLocais?: boolean;
  onSave: (appointmentData: AppointmentUpdateData) => void;
  onNfeAction?: (appointmentId: string, linkNfe?: string) => void;
  onPatientClick?: (patientId: string | null) => void;
  onProfessionalClick?: (professionalId: string) => void;
  className?: string;
}

export interface AppointmentUpdateData {
  id: string;
  data_hora?: string;
  local_id?: string;
  valor_servico?: number;
  status_consulta_id?: string;
  status_pagamento_id?: string;
  tipo_servico_id?: string;
  empresa_fatura?: string;
}

interface FormData {
  dataHora: string;
  timeHora: string;
  localId: string;
  valorServico: string;
  statusConsultaId: string;
  tipoServicoId: string;
  evolucaoServico: string;
  empresaFaturaId: string;
}

export const AppointmentDetailsManager =
  React.memo<AppointmentDetailsManagerProps>(
    ({
      isOpen,
      onClose,
      appointment,
      userRole,
      locaisAtendimento,
      isLoadingLocais = false,
      onSave,
      onNfeAction,
      onPatientClick,
      onProfessionalClick,
      className,
    }) => {
      const [formData, setFormData] = useState<FormData>({
        dataHora: '',
        timeHora: '',
        localId: '',
        valorServico: '',
        statusConsultaId: '',
        tipoServicoId: '',
        evolucaoServico: '',
        empresaFaturaId: '',
      });

      const [isEdited, setIsEdited] = useState(false);
      const [consultaStatusOptions, setConsultaStatusOptions] = useState<
        SupabaseConsultaStatus[]
      >([]);
      const [isLoadingStatus, setIsLoadingStatus] = useState(false);
      const [tipoServicoOptions, setTipoServicoOptions] = useState<
        SupabaseTipoServico[]
      >([]);
      const [isLoadingTipoServico, setIsLoadingTipoServico] = useState(false);

      // Estados para status de pagamento
      const [pagamentoStatusOptions, setPagamentoStatusOptions] = useState<
        Array<{ id: string; codigo: string; descricao: string }>
      >([]);

      // Estado para empresas de faturamento (NOVO)
      const [empresasOptions, setEmpresasOptions] = useState<
        Array<{ id: string; razao_social: string; nome_fantasia?: string }>
      >([]);
      const [isLoadingEmpresas, setIsLoadingEmpresas] = useState(false);

      // Estados para evolução
      const [evolucoes, setEvolucoes] = useState<
        SupabaseRelatorioEvolucaoCompleto[]
      >([]);
      // AI dev note: Iniciar como true para evitar flash do badge "Evolução Pendente" enquanto carrega
      const [isLoadingEvolucoes, setIsLoadingEvolucoes] = useState(true);
      const [isSavingEvolucao, setIsSavingEvolucao] = useState(false);

      // Estados para edição de evoluções
      const [editingEvolucaoId, setEditingEvolucaoId] = useState<string | null>(
        null
      );
      const [editingContent, setEditingContent] = useState<string>('');
      const [isSavingEdit, setIsSavingEdit] = useState(false);

      // Estado para emissão de NFe
      const [isEmitingNfe, setIsEmitingNfe] = useState(false);

      // Estados para dados da fatura associada
      const [faturaData, setFaturaData] = useState<{
        link_nfe: string | null;
        id_asaas: string | null;
      } | null>(null);

      const { user } = useAuth();
      const { toast } = useToast();

      // AI dev note: Auto-save da evolução no localStorage para evitar perda de texto
      // quando o modal é fechado acidentalmente (ex: clicar fora do modal)
      const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
      const getAutoSaveKey = useCallback(
        () => (appointment ? `evolucao_draft_${appointment.id}` : null),
        [appointment]
      );

      // Recuperar rascunho do localStorage quando abrir o modal
      useEffect(() => {
        if (!isOpen || !appointment) return;

        const key = getAutoSaveKey();
        if (!key) return;

        const savedDraft = localStorage.getItem(key);
        if (savedDraft) {
          try {
            const draft = JSON.parse(savedDraft);
            // Verificar se o rascunho tem conteúdo e é recente (menos de 24h)
            const isRecent = Date.now() - draft.timestamp < 24 * 60 * 60 * 1000;
            if (draft.content && isRecent && !formData.evolucaoServico) {
              toast({
                title: 'Rascunho recuperado',
                description:
                  'Encontramos uma evolução não salva. O texto foi restaurado.',
                action: (
                  <ToastAction
                    altText="Descartar rascunho"
                    onClick={() => {
                      localStorage.removeItem(key);
                      setFormData((prev) => ({ ...prev, evolucaoServico: '' }));
                    }}
                  >
                    Descartar
                  </ToastAction>
                ),
              });
              setFormData((prev) => ({
                ...prev,
                evolucaoServico: draft.content,
              }));
            }
          } catch {
            // Ignorar erros de parse
            localStorage.removeItem(key);
          }
        }
      }, [
        isOpen,
        appointment,
        getAutoSaveKey,
        toast,
        formData.evolucaoServico,
      ]);

      // Auto-save da evolução no localStorage (debounced)
      useEffect(() => {
        const key = getAutoSaveKey();
        if (!key || !isOpen) return;

        // Limpar timeout anterior
        if (autoSaveTimeoutRef.current) {
          clearTimeout(autoSaveTimeoutRef.current);
        }

        // Só salvar se tiver conteúdo
        if (formData.evolucaoServico.trim()) {
          autoSaveTimeoutRef.current = setTimeout(() => {
            localStorage.setItem(
              key,
              JSON.stringify({
                content: formData.evolucaoServico,
                timestamp: Date.now(),
              })
            );
          }, 1000); // Debounce de 1 segundo
        }

        return () => {
          if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current);
          }
        };
      }, [formData.evolucaoServico, getAutoSaveKey, isOpen]);

      // Estados para confirmação de datas
      const [pastDateConfirmed, setPastDateConfirmed] = useState(false);
      const [futureWeekConfirmed, setFutureWeekConfirmed] = useState(false);

      // AI dev note: Regra de negócio - bloquear edição de data/hora quando:
      // 1. Status da consulta = 'finalizado' OU 'cancelado'
      // 2. Status de pagamento = 'pago'
      const isEditingBlocked = React.useMemo(() => {
        if (!appointment) return false;

        const statusConsulta =
          appointment.status_consulta_codigo?.toLowerCase() || '';
        const statusPagamento =
          appointment.status_pagamento_codigo?.toLowerCase() || '';

        return (
          statusConsulta === 'finalizado' ||
          statusConsulta === 'cancelado' ||
          statusPagamento === 'pago'
        );
      }, [appointment]);

      // Função wrapper para emitir NFe (apenas para casos de emissão)
      const handleEmitirNfe = async () => {
        const statusLower =
          appointment?.status_pagamento_nome?.toLowerCase() || '';
        const linkNfe = faturaData?.link_nfe || appointment?.link_nfe;

        // Só executar se for realmente um caso de "Emitir NFe"
        if (statusLower.includes('pago') && !linkNfe && onNfeAction) {
          setIsEmitingNfe(true);
          try {
            await onNfeAction(appointment?.id || '', linkNfe || undefined);
          } finally {
            setIsEmitingNfe(false);
          }
        }
      };

      // Carregar dados da fatura associada se existir fatura_id
      useEffect(() => {
        const loadFaturaData = async () => {
          // Type assertion for fatura_id which may not be in the base type
          const appointmentWithFatura = appointment as typeof appointment & {
            fatura_id?: string;
          };
          if (!appointmentWithFatura?.fatura_id || !isOpen) {
            setFaturaData(null);
            return;
          }

          try {
            const { data: fatura, error } = await supabase
              .from('faturas')
              .select('link_nfe, id_asaas')
              .eq('id', appointmentWithFatura.fatura_id)
              .single();

            if (error) {
              console.error('Erro ao carregar dados da fatura:', error);
              setFaturaData(null);
            } else {
              setFaturaData({
                link_nfe: fatura.link_nfe,
                id_asaas: fatura.id_asaas,
              });
              console.log('🔍 Dados da fatura carregados:', {
                fatura_id: appointmentWithFatura.fatura_id,
                link_nfe: fatura.link_nfe,
                id_asaas: fatura.id_asaas,
              });
            }
          } catch (error) {
            console.error('Erro inesperado ao carregar fatura:', error);
            setFaturaData(null);
          }
        };

        loadFaturaData();
      }, [appointment, isOpen]);

      // Carregar opções de status de consulta
      useEffect(() => {
        const loadConsultaStatus = async () => {
          setIsLoadingStatus(true);
          try {
            const status = await fetchConsultaStatus();
            setConsultaStatusOptions(status);
          } catch (error) {
            console.error('Erro ao carregar status de consulta:', error);
          } finally {
            setIsLoadingStatus(false);
          }
        };

        if (isOpen) {
          loadConsultaStatus();
        }
      }, [isOpen]);

      // Carregar opções de tipos de serviço
      useEffect(() => {
        const loadTiposServico = async () => {
          setIsLoadingTipoServico(true);
          try {
            const tipos = await fetchTiposServico();
            setTipoServicoOptions(tipos);
          } catch (error) {
            console.error('Erro ao carregar tipos de serviço:', error);
          } finally {
            setIsLoadingTipoServico(false);
          }
        };

        if (isOpen) {
          loadTiposServico();
        }
      }, [isOpen]);

      // Carregar opções de status de pagamento
      useEffect(() => {
        const loadPagamentoStatus = async () => {
          try {
            const { data, error } = await supabase
              .from('pagamento_status')
              .select('id, codigo, descricao')
              .eq('ativo', true)
              .order('descricao');

            if (error) {
              console.error('Erro ao carregar status de pagamento:', error);
              return;
            }

            setPagamentoStatusOptions(data || []);
          } catch (error) {
            console.error('Erro ao carregar status de pagamento:', error);
          }
        };

        if (isOpen) {
          loadPagamentoStatus();
        }
      }, [isOpen]);

      // Carregar opções de empresas de faturamento (NOVO)
      useEffect(() => {
        const loadEmpresas = async () => {
          setIsLoadingEmpresas(true);
          try {
            // Buscar empresas ativas usando Supabase
            const { data: empresas, error } = await supabase
              .from('pessoa_empresas')
              .select('id, razao_social, nome_fantasia')
              .eq('ativo', true)
              .order('razao_social');

            if (error) {
              console.error('Erro ao carregar empresas:', error);
              return;
            }

            setEmpresasOptions(empresas || []);
          } catch (error) {
            console.error('Erro ao carregar empresas:', error);
          } finally {
            setIsLoadingEmpresas(false);
          }
        };

        if (isOpen) {
          loadEmpresas();
        }
      }, [isOpen]);

      // Inicializar formulário quando appointment mudar
      useEffect(() => {
        if (appointment && isOpen) {
          // AI dev note: Extrair data/hora sem conversão de timezone para manter horário exato do Supabase
          const dateTimeString = appointment.data_hora;
          const [datePart, timePart] = dateTimeString.split('T');
          const timeWithoutTz = timePart.replace(/[+-]\d{2}$/, ''); // Remove timezone info (+00, -03, etc)

          setFormData({
            dataHora: datePart,
            timeHora: timeWithoutTz.substring(0, 5), // HH:mm format
            localId: appointment.local_id || '',
            valorServico: appointment.valor_servico,
            statusConsultaId: appointment.status_consulta_id,
            tipoServicoId: appointment.tipo_servico_id,
            evolucaoServico: '',
            empresaFaturaId: appointment.empresa_fatura_id || '',
          });
          setIsEdited(false);
          setPastDateConfirmed(false);
          setFutureWeekConfirmed(false);
        }
      }, [appointment, isOpen]);

      // Carregar evoluções existentes quando appointment mudar
      useEffect(() => {
        const loadEvolucoes = async () => {
          // AI dev note: Resetar estados quando modal não está aberto
          if (!isOpen) {
            setEvolucoes([]);
            setIsLoadingEvolucoes(true);
            return;
          }

          if (!appointment) return;

          setIsLoadingEvolucoes(true);
          try {
            const evolucoesList = await fetchRelatoriosEvolucao(appointment.id);
            setEvolucoes(evolucoesList);
          } catch (error) {
            console.error('Erro ao carregar evoluções:', error);
          } finally {
            setIsLoadingEvolucoes(false);
          }
        };

        loadEvolucoes();
      }, [appointment, isOpen]);

      const handleInputChange = (field: keyof FormData, value: string) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        setIsEdited(true);
      };

      // Funções para edição de evoluções
      const canEditEvolucao = (
        evolucao: SupabaseRelatorioEvolucaoCompleto
      ): boolean => {
        if (!user?.pessoa?.id) return false;

        // Admin pode editar todas
        if (userRole === 'admin') return true;

        // Profissional pode editar apenas suas próprias
        if (userRole === 'profissional') {
          return evolucao.criado_por === user.pessoa.id;
        }

        // Secretaria não pode editar nenhuma
        return false;
      };

      const handleStartEdit = (evolucao: SupabaseRelatorioEvolucaoCompleto) => {
        setEditingEvolucaoId(evolucao.id);
        setEditingContent(evolucao.conteudo || '');
      };

      const handleCancelEdit = () => {
        setEditingEvolucaoId(null);
        setEditingContent('');
      };

      const handleSaveEdit = async () => {
        if (!editingEvolucaoId || !user?.pessoa?.id || !appointment) return;

        setIsSavingEdit(true);
        try {
          await updateRelatorioEvolucao({
            id: editingEvolucaoId,
            conteudo: editingContent,
            atualizado_por: user.pessoa.id,
          });

          // Recarregar evoluções
          const evolucoesList = await fetchRelatoriosEvolucao(appointment.id);
          setEvolucoes(evolucoesList);

          // Limpar estado de edição
          setEditingEvolucaoId(null);
          setEditingContent('');
        } catch (error) {
          console.error('Erro ao salvar edição da evolução:', error);
        } finally {
          setIsSavingEdit(false);
        }
      };

      // AI dev note: Helper para sanitizar campos UUID vazios
      const sanitizeUuid = (value: string): string | undefined => {
        return value && value.trim() !== '' ? value : undefined;
      };

      const handleSaveAll = async () => {
        if (!appointment || !user) return;

        setIsSavingEvolucao(true);

        try {
          // Validar campos obrigatórios
          if (!formData.dataHora || !formData.timeHora) {
            throw new Error('Data e hora são obrigatórias');
          }

          // AI dev note: Verificar se a data/hora foi realmente alterada
          const dataHoraCompleta = `${formData.dataHora}T${formData.timeHora}:00`;
          const appointmentDate = parseSupabaseDatetime(dataHoraCompleta);
          const originalDate = parseSupabaseDatetime(appointment.data_hora);

          // AI dev note: Só validar datas se realmente houve mudança na data/hora
          // Isso evita o toast desnecessário quando apenas salvamos evolução
          const dateTimeChanged =
            appointmentDate.getTime() !== originalDate.getTime();

          if (dateTimeChanged) {
            const now = new Date();
            const oneWeekFromNow = new Date();
            oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);

            // Verificar se é data passada
            if (appointmentDate < now && !pastDateConfirmed) {
              setIsSavingEvolucao(false);
              const { dismiss } = toast({
                title: 'Data anterior à data atual',
                description:
                  'Você está editando para uma data anterior à data atual. Deseja confirmar esta alteração?',
                variant: 'default',
                action: (
                  <ToastAction
                    altText="Confirmar alteração"
                    onClick={() => {
                      dismiss();
                      setPastDateConfirmed(true);
                      setTimeout(() => handleSaveAll(), 100);
                    }}
                  >
                    Confirmar
                  </ToastAction>
                ),
              });
              return;
            }

            // Verificar se é mais de 1 semana no futuro
            if (appointmentDate > oneWeekFromNow && !futureWeekConfirmed) {
              setIsSavingEvolucao(false);
              const { dismiss } = toast({
                title: 'Agendamento para mais de 1 semana',
                description:
                  'Você está editando para mais de 1 semana após a data atual. Deseja confirmar esta alteração?',
                variant: 'default',
                action: (
                  <ToastAction
                    altText="Confirmar alteração"
                    onClick={() => {
                      dismiss();
                      setFutureWeekConfirmed(true);
                      setTimeout(() => handleSaveAll(), 100);
                    }}
                  >
                    Confirmar
                  </ToastAction>
                ),
              });
              return;
            }
          }

          // Salvar agendamento primeiro

          const updateData: AppointmentUpdateData = {
            id: appointment.id,
            data_hora: dataHoraCompleta,
            local_id: sanitizeUuid(formData.localId),
            status_consulta_id: sanitizeUuid(formData.statusConsultaId),
            tipo_servico_id: sanitizeUuid(formData.tipoServicoId),
            empresa_fatura: sanitizeUuid(formData.empresaFaturaId),
          };

          // Só admin/secretaria pode alterar valor
          if (
            (userRole === 'admin' || userRole === 'secretaria') &&
            formData.valorServico !== appointment.valor_servico
          ) {
            const novoValor = parseFloat(formData.valorServico);
            updateData.valor_servico = novoValor;

            // AI dev note: Se valor zerado, alterar status de pagamento para 'pago' automaticamente
            if (novoValor === 0) {
              const statusPago = pagamentoStatusOptions.find(
                (s) => s.codigo === 'pago'
              );
              if (statusPago) {
                updateData.status_pagamento_id = statusPago.id;
              }
            }
          }

          // Salvar agendamento através da callback do parent (para manter o flow existente)
          onSave(updateData);

          // Se há evolução, salvar também
          if (formData.evolucaoServico.trim()) {
            // AI dev note: Guard clause - verificar se user.pessoa?.id existe antes de salvar evolução
            if (!user.pessoa?.id) {
              throw new Error(
                'Usuário não possui pessoa associada. Contate o administrador.'
              );
            }

            await saveRelatorioEvolucao({
              id_agendamento: appointment.id,
              conteudo: formData.evolucaoServico.trim(),
              criado_por: user.pessoa.id,
            });

            // Recarregar evoluções
            const evolucoesList = await fetchRelatoriosEvolucao(appointment.id);
            setEvolucoes(evolucoesList);

            // Trigger automático: gerar histórico com IA se ativo
            try {
              const { isActive } = await checkAIHistoryStatus(user.pessoa.id);
              if (isActive) {
                // Executar em background sem bloquear a UI
                generatePatientHistoryAI(
                  appointment.paciente_id,
                  user.pessoa.id
                )
                  .then((result) => {
                    if (result.success) {
                      console.log(
                        '[DEBUG] Histórico do paciente atualizado automaticamente pela IA'
                      );
                    } else {
                      console.warn(
                        '[DEBUG] Falha na geração automática de histórico:',
                        result.error
                      );
                    }
                  })
                  .catch((error) => {
                    console.error(
                      '[DEBUG] Erro na geração automática de histórico:',
                      error
                    );
                  });
              }
            } catch (error) {
              console.warn(
                '[DEBUG] Erro ao verificar status da IA para histórico:',
                error
              );
            }

            // Limpar campo de evolução e rascunho do localStorage
            setFormData((prev) => ({ ...prev, evolucaoServico: '' }));
            const key = getAutoSaveKey();
            if (key) localStorage.removeItem(key);
          }

          setIsEdited(false);
        } catch (error) {
          console.error('Erro ao salvar alterações:', error);

          // Tratar erro RLS especificamente
          if (
            error &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === '42501'
          ) {
            throw new Error(
              'Você não tem permissão para salvar evolução. Contate o administrador.'
            );
          }

          // AI dev note: Tratar erro de foreign key (usuário não existe na tabela pessoas)
          if (
            error &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === '23503'
          ) {
            throw new Error(
              'Erro de referência de usuário. Verifique se seu perfil está completo.'
            );
          }

          throw error;
        } finally {
          setIsSavingEvolucao(false);
        }
      };

      if (!appointment) {
        return null;
      }

      return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
          <DialogContent
            className={cn(
              'max-w-[95vw] sm:max-w-[600px] lg:max-w-[700px]',
              className
            )}
          >
            <DialogHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DialogTitle>Detalhes do Agendamento</DialogTitle>
                  {appointment?.agenda_compartilhada_id && (
                    <Badge variant="secondary" className="text-xs">
                      🔗 Agenda Compartilhada
                    </Badge>
                  )}
                </div>
                {/* Badge de Evolução Pendente - o X de fechar é do Dialog */}
                {!isLoadingEvolucoes && evolucoes.length === 0 && (
                  <Badge
                    variant="outline"
                    className="text-xs px-2 py-1 bg-yellow-50 text-yellow-800 border-yellow-200"
                  >
                    Evolução Pendente
                  </Badge>
                )}
              </div>
            </DialogHeader>

            <ScrollArea className="max-h-[70vh] sm:max-h-[600px] pr-2 sm:pr-6">
              <div className="space-y-6 py-4 overflow-x-auto">
                {/* Paciente */}
                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    <Label className="text-sm font-medium">Paciente:</Label>
                    <Button
                      variant="link"
                      size="sm"
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onPatientClick?.(appointment.paciente_id);
                      }}
                      className="h-auto p-0 text-left justify-start font-bold cursor-pointer text-sm"
                    >
                      {appointment.paciente_nome}
                    </Button>
                  </div>
                  {appointment.responsavel_legal_nome &&
                    appointment.responsavel_legal_id && (
                      <div className="flex items-start gap-2">
                        <Label className="text-sm font-medium">
                          Responsável Legal:
                        </Label>
                        <Button
                          variant="link"
                          size="sm"
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (appointment.responsavel_legal_id) {
                              onPatientClick?.(
                                appointment.responsavel_legal_id
                              );
                            }
                          }}
                          className="h-auto p-0 text-left justify-start font-normal cursor-pointer text-sm"
                        >
                          {appointment.responsavel_legal_nome}
                        </Button>
                      </div>
                    )}
                </div>

                <Separator />

                {/* Data e Hora - Layout Inline */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="data">Data</Label>
                    <DatePicker
                      value={formData.dataHora}
                      onChange={(value) => handleInputChange('dataHora', value)}
                      disabled={isEditingBlocked}
                    />
                    {isEditingBlocked && (
                      <p className="text-xs text-muted-foreground">
                        Data não pode ser alterada (consulta{' '}
                        {appointment.status_consulta_codigo === 'finalizado'
                          ? 'finalizada'
                          : appointment.status_consulta_codigo === 'cancelado'
                            ? 'cancelada'
                            : 'com pagamento confirmado'}
                        )
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="time">Horário</Label>
                    <Input
                      id="time"
                      type="time"
                      value={formData.timeHora}
                      onChange={(e) =>
                        handleInputChange('timeHora', e.target.value)
                      }
                      className="h-9"
                      disabled={isEditingBlocked}
                    />
                  </div>
                </div>

                {/* Local e Valor - Layout Inline Responsivo */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Local */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-primary" />
                      <LocationSelect
                        value={formData.localId}
                        onChange={(value) =>
                          handleInputChange('localId', value)
                        }
                        locais={locaisAtendimento}
                        isLoading={isLoadingLocais}
                        placeholder="Selecione o local"
                      />
                    </div>
                  </div>

                  {/* Valor e Status de Pagamento */}
                  <div className="space-y-4">
                    {userRole === 'admin' || userRole === 'secretaria' ? (
                      <>
                        {/* AI dev note: Para admin/secretaria, exibir APENAS valor_servico, NUNCA comissão */}

                        <Label className="text-sm font-medium">
                          Valor do Serviço
                        </Label>
                        <Input
                          id="valor"
                          type="number"
                          min="0"
                          step="0.01"
                          value={formData.valorServico}
                          onChange={(e) =>
                            handleInputChange('valorServico', e.target.value)
                          }
                          placeholder="0.00"
                        />
                        <StatusPaymentDisplay
                          status={appointment.status_pagamento_nome}
                          statusColor={appointment.status_pagamento_cor}
                          valor={appointment.valor_servico}
                          userRole={userRole}
                          linkNfe={faturaData?.link_nfe || appointment.link_nfe}
                          idAsaas={
                            faturaData?.id_asaas ||
                            appointment.id_pagamento_externo
                          }
                          isEmitingNfe={isEmitingNfe}
                          hideValue={
                            userRole === 'admin' || userRole === 'secretaria'
                          }
                          inlineButtons={
                            userRole === 'admin' || userRole === 'secretaria'
                          }
                          onNfeAction={handleEmitirNfe}
                        />
                      </>
                    ) : null}
                    {/* AI dev note: Profissional não visualiza valores ou comissões em detalhes do agendamento */}
                  </div>
                </div>

                {/* Serviço e Status - Layout Inline Responsivo */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Serviço */}
                  <div className="space-y-3">
                    {/* AI dev note: Substituído badge por Select editável para todos os roles conforme solicitado */}
                    <Label className="text-sm font-medium">
                      Tipo de Serviço
                    </Label>
                    <Select
                      value={formData.tipoServicoId}
                      onValueChange={(value) =>
                        handleInputChange('tipoServicoId', value)
                      }
                      disabled={isLoadingTipoServico}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar tipo de serviço..." />
                      </SelectTrigger>
                      <SelectContent>
                        {tipoServicoOptions.map((tipo) => (
                          <SelectItem key={tipo.id} value={tipo.id}>
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: tipo.cor }}
                              />
                              {tipo.nome}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Status da Consulta */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Status</Label>
                    <Select
                      value={formData.statusConsultaId}
                      onValueChange={(value) =>
                        handleInputChange('statusConsultaId', value)
                      }
                      disabled={isLoadingStatus}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Alterar status..." />
                      </SelectTrigger>
                      <SelectContent>
                        {consultaStatusOptions.map((status) => (
                          <SelectItem key={status.id} value={status.id}>
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: status.cor }}
                              />
                              {status.descricao}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                {/* Responsável pelo Atendimento */}
                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    <Label className="text-sm font-medium">
                      Responsável pelo Atendimento:
                    </Label>
                    <Button
                      variant="link"
                      size="sm"
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onProfessionalClick?.(appointment.profissional_id);
                      }}
                      className="h-auto p-0 text-left justify-start font-normal cursor-pointer text-sm"
                    >
                      {appointment.profissional_nome}
                    </Button>
                  </div>
                  {appointment.profissional_especialidade && (
                    <div className="text-sm text-muted-foreground">
                      {appointment.profissional_especialidade}
                    </div>
                  )}
                </div>

                {/* Empresa de Faturamento - Visível apenas para admin e secretaria */}
                {(userRole === 'admin' || userRole === 'secretaria') && (
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">
                      Empresa para Faturamento:
                    </Label>
                    <Select
                      value={formData.empresaFaturaId}
                      onValueChange={(value) =>
                        handleInputChange('empresaFaturaId', value)
                      }
                      disabled={isLoadingEmpresas}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar empresa para faturamento..." />
                      </SelectTrigger>
                      <SelectContent>
                        {empresasOptions.map((empresa) => (
                          <SelectItem key={empresa.id} value={empresa.id}>
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {empresa.razao_social}
                              </span>
                              {empresa.nome_fantasia && (
                                <span className="text-sm text-muted-foreground">
                                  {empresa.nome_fantasia}
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <Separator />

                {/* Evolução do Paciente */}
                <div className="space-y-4">
                  <Label htmlFor="evolucao" className="text-sm font-medium">
                    Evolução do Paciente
                  </Label>

                  {/* Histórico de evoluções */}
                  {isLoadingEvolucoes ? (
                    <div className="text-sm text-muted-foreground">
                      Carregando evoluções...
                    </div>
                  ) : evolucoes.length > 0 ? (
                    <div className="space-y-3">
                      <div className="text-sm font-medium text-muted-foreground">
                        Histórico de Evoluções
                      </div>
                      <div className="space-y-3 max-h-48 overflow-y-auto">
                        {evolucoes.map((evolucao) => (
                          <div
                            key={evolucao.id}
                            className="border rounded-lg p-3 bg-muted/30"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-sm text-muted-foreground">
                                {evolucao.criado_por_nome ||
                                  'Usuário desconhecido'}{' '}
                                •{' '}
                                {new Date(evolucao.created_at).toLocaleString(
                                  'pt-BR'
                                )}
                                {evolucao.atualizado_por && (
                                  <span className="ml-2 text-xs">
                                    (editado)
                                  </span>
                                )}
                              </div>
                              {canEditEvolucao(evolucao) &&
                                editingEvolucaoId !== evolucao.id && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleStartEdit(evolucao)}
                                    className="h-6 w-6 p-0"
                                  >
                                    <Edit className="h-3 w-3" />
                                  </Button>
                                )}
                            </div>

                            {editingEvolucaoId === evolucao.id ? (
                              <div className="space-y-2">
                                {/* AI dev note: Usar RichTextEditor ao invés de Textarea para manter formatação */}
                                <RichTextEditor
                                  value={editingContent}
                                  onChange={(value) => setEditingContent(value)}
                                  minHeight={80}
                                  maxHeight={200}
                                  disabled={isSavingEdit}
                                  editorBackgroundColor="white"
                                />
                                <div className="flex items-center gap-2 justify-end">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleCancelEdit}
                                    disabled={isSavingEdit}
                                    className="h-6 px-2"
                                  >
                                    <XCircle className="h-3 w-3 mr-1" />
                                    Cancelar
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleSaveEdit}
                                    disabled={
                                      isSavingEdit || !editingContent.trim()
                                    }
                                    className="h-6 px-2"
                                  >
                                    <Save className="h-3 w-3 mr-1" />
                                    {isSavingEdit ? 'Salvando...' : 'Salvar'}
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div
                                className="text-sm whitespace-pre-wrap"
                                dangerouslySetInnerHTML={{
                                  __html: evolucao.conteudo || '',
                                }}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      Nenhuma evolução registrada ainda.
                    </div>
                  )}

                  {/* Campo para nova evolução - apenas admin e profissional podem salvar */}
                  {userRole !== 'secretaria' && (
                    <div className="space-y-3">
                      <EvolutionEditor
                        value={formData.evolucaoServico}
                        onChange={(value) =>
                          handleInputChange('evolucaoServico', value)
                        }
                        placeholder="Digite ou grave a evolução do atendimento..."
                        disabled={isSavingEvolucao}
                      />
                    </div>
                  )}

                  {/* Mídias da Sessão (Fotos e Vídeos) */}
                  <SessionMediaManager
                    agendamentoId={appointment.id}
                    userRole={userRole}
                    criadoPor={user?.pessoa?.id}
                    disabled={isSavingEvolucao}
                  />

                  {/* Seção de Auditoria */}
                  <Separator className="my-4" />
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground font-medium">
                      Informações de Auditoria
                    </Label>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div>
                        Criado por:{' '}
                        <strong className="text-foreground">
                          {appointment.criado_por_nome ||
                            appointment.agendado_por_nome ||
                            'Sistema'}
                        </strong>{' '}
                        em {formatDateTimeBR(appointment.created_at)}
                      </div>
                      {appointment.updated_at &&
                        appointment.created_at !== appointment.updated_at && (
                          <div>
                            Última alteração:{' '}
                            <strong className="text-foreground">
                              {appointment.atualizado_por_nome || 'Sistema'}
                            </strong>{' '}
                            em {formatDateTimeBR(appointment.updated_at)}
                          </div>
                        )}
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>

            {/* Footer fixo com botão Salvar - SEMPRE VISÍVEL */}
            <div className="border-t p-4 flex justify-end gap-2 bg-background">
              <Button
                variant="outline"
                onClick={onClose}
                disabled={isSavingEvolucao}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSaveAll}
                disabled={
                  isSavingEvolucao ||
                  (!isEdited && !formData.evolucaoServico.trim())
                }
              >
                {isSavingEvolucao ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      );
    }
  );

AppointmentDetailsManager.displayName = 'AppointmentDetailsManager';
