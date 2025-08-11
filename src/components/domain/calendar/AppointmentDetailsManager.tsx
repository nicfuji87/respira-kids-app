import React, { useState, useEffect } from 'react';
import { X, MapPin, Edit, Save, XCircle } from 'lucide-react';

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
import { Textarea } from '@/components/primitives/textarea';
import { cn } from '@/lib/utils';
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
  onPaymentAction?: (appointmentId: string) => void;
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
      onPaymentAction,
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

      // Estado para empresas de faturamento (NOVO)
      const [empresasOptions, setEmpresasOptions] = useState<
        Array<{ id: string; razao_social: string; nome_fantasia?: string }>
      >([]);
      const [isLoadingEmpresas, setIsLoadingEmpresas] = useState(false);

      // Estados para evolução
      const [evolucoes, setEvolucoes] = useState<
        SupabaseRelatorioEvolucaoCompleto[]
      >([]);
      const [isLoadingEvolucoes, setIsLoadingEvolucoes] = useState(false);
      const [isSavingEvolucao, setIsSavingEvolucao] = useState(false);

      // Estados para edição de evoluções
      const [editingEvolucaoId, setEditingEvolucaoId] = useState<string | null>(
        null
      );
      const [editingContent, setEditingContent] = useState<string>('');
      const [isSavingEdit, setIsSavingEdit] = useState(false);

      const { user } = useAuth();

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

      // Carregar opções de empresas de faturamento (NOVO)
      useEffect(() => {
        const loadEmpresas = async () => {
          setIsLoadingEmpresas(true);
          try {
            // Buscar empresas ativas usando Supabase
            const { supabase } = await import('@/lib/supabase');
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
            localId: appointment.local_atendimento_id || '',
            valorServico: appointment.valor_servico,
            statusConsultaId: appointment.status_consulta_id,
            tipoServicoId: appointment.tipo_servico_id,
            evolucaoServico: '',
            empresaFaturaId: appointment.empresa_fatura_id || '',
          });
          setIsEdited(false);
        }
      }, [appointment, isOpen]);

      // Carregar evoluções existentes quando appointment mudar
      useEffect(() => {
        const loadEvolucoes = async () => {
          if (!appointment || !isOpen) return;

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

          // Salvar agendamento primeiro
          const dataHoraCompleta = `${formData.dataHora}T${formData.timeHora}:00`;

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
            updateData.valor_servico = parseFloat(formData.valorServico);
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

            // Limpar campo de evolução
            setFormData((prev) => ({ ...prev, evolucaoServico: '' }));
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
                <DialogTitle>Detalhes do Agendamento</DialogTitle>
                <div className="flex items-center gap-2">
                  {!isLoadingEvolucoes && evolucoes.length === 0 && (
                    <Badge
                      variant="outline"
                      className="text-xs px-2 py-1 bg-yellow-50 text-yellow-800 border-yellow-200"
                    >
                      Evolução Pendente
                    </Badge>
                  )}
                  <Button variant="outline" onClick={onClose} size="sm">
                    <X className="h-4 w-4 mr-2" />
                    Fechar
                  </Button>
                </div>
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
                            onPatientClick?.(appointment.responsavel_legal_id);
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
                    />
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
                          status={appointment.status_pagamento_descricao}
                          statusColor={appointment.status_pagamento_cor}
                          valor={appointment.valor_servico}
                          userRole={userRole}
                          linkNfe={appointment.link_nfe}
                          hideValue={
                            userRole === 'admin' || userRole === 'secretaria'
                          }
                          inlineButtons={
                            userRole === 'admin' || userRole === 'secretaria'
                          }
                          onPaymentAction={() =>
                            onPaymentAction?.(appointment.id)
                          }
                          onNfeAction={() =>
                            onNfeAction?.(
                              appointment.id,
                              appointment.link_nfe || undefined
                            )
                          }
                        />
                      </>
                    ) : userRole === 'profissional' ? (
                      <>
                        {/* AI dev note: Para profissional, exibir APENAS comissão, NUNCA valor do serviço */}

                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">Valor:</span>
                          <span className="text-sm font-medium">
                            R${' '}
                            {parseFloat(
                              appointment.comissao_valor_calculado
                            ).toLocaleString('pt-BR', {
                              minimumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                        <StatusPaymentDisplay
                          status={appointment.status_pagamento_descricao}
                          statusColor={appointment.status_pagamento_cor}
                          valor={appointment.comissao_valor_calculado}
                          userRole={userRole}
                          linkNfe={appointment.link_nfe}
                          onPaymentAction={() =>
                            onPaymentAction?.(appointment.id)
                          }
                          onNfeAction={() =>
                            onNfeAction?.(
                              appointment.id,
                              appointment.link_nfe || undefined
                            )
                          }
                          hideValue={true}
                        />
                      </>
                    ) : null}
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
                                <Textarea
                                  value={editingContent}
                                  onChange={(e) =>
                                    setEditingContent(e.target.value)
                                  }
                                  className="min-h-[80px] text-sm"
                                  disabled={isSavingEdit}
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

                      <div className="flex justify-end">
                        <Button
                          onClick={handleSaveAll}
                          disabled={
                            isSavingEvolucao ||
                            (!isEdited && !formData.evolucaoServico.trim())
                          }
                          size="sm"
                        >
                          {isSavingEvolucao
                            ? 'Salvando...'
                            : 'Salvar Alterações'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Mídias da Sessão (Fotos e Vídeos) */}
                  <SessionMediaManager
                    agendamentoId={appointment.id}
                    userRole={userRole}
                    criadoPor={user?.pessoa?.id}
                    disabled={isSavingEvolucao}
                  />
                </div>
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      );
    }
  );

AppointmentDetailsManager.displayName = 'AppointmentDetailsManager';
