import React, { useState, useEffect } from 'react';
import { MapPin, Edit, Save, XCircle, FileText } from 'lucide-react';
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
  EvolutionFormModal,
  type LocationOption,
} from '@/components/composed';
import type {
  TipoEvolucao,
  EvolucaoRespiratoria,
  EvolucaoMotoraAssimetria,
} from '@/types/evolucao-clinica';
import { RichTextEditor } from '@/components/primitives/rich-text-editor';
import { cn, formatDateTimeBR } from '@/lib/utils';
import {
  fetchConsultaStatus,
  fetchTiposServico,
  fetchRelatoriosEvolucao,
  saveRelatorioEvolucao,
  updateRelatorioEvolucao,
  updateRelatorioEvolucaoCompleta,
  fetchProfissionais,
} from '@/lib/calendar-services';
// AI dev note: generatePatientHistoryAI e checkAIHistoryStatus removidos -
// agora são chamados apenas via modal de evolução estruturada
import type {
  SupabaseAgendamentoCompletoFlat,
  SupabaseConsultaStatus,
  SupabaseTipoServico,
  SupabaseRelatorioEvolucaoCompleto,
  SupabasePessoa,
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
  // AI dev note: profissional_id só pode ser alterado por admin
  profissional_id?: string;
}

interface FormData {
  dataHora: string;
  timeHora: string;
  localId: string;
  valorServico: string;
  statusConsultaId: string;
  tipoServicoId: string;
  empresaFaturaId: string;
  // AI dev note: profissionalId só pode ser alterado por admin
  profissionalId: string;
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
        empresaFaturaId: '',
        profissionalId: '',
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

      // AI dev note: Estado para profissionais (apenas admin pode alterar profissional responsável)
      const [profissionaisOptions, setProfissionaisOptions] = useState<
        SupabasePessoa[]
      >([]);
      const [isLoadingProfissionais, setIsLoadingProfissionais] =
        useState(false);

      // AI dev note: Estado para histórico de auditoria (apenas admin vê)
      const [auditLogs, setAuditLogs] = useState<
        Array<{
          id: string;
          campo_alterado: string;
          valor_anterior: string;
          valor_novo: string;
          created_at: string;
          alterado_por_nome?: string;
        }>
      >([]);
      const [isLoadingAuditLogs, setIsLoadingAuditLogs] = useState(false);

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

      // Estado para modal de evolução estruturada
      const [showEvolutionModal, setShowEvolutionModal] = useState(false);
      const [editingEvolucaoData, setEditingEvolucaoData] = useState<{
        id: string;
        tipo_evolucao?: TipoEvolucao;
        evolucao_respiratoria?: EvolucaoRespiratoria;
        evolucao_motora_assimetria?: EvolucaoMotoraAssimetria;
      } | null>(null);

      // Estados para dados da fatura associada
      const [faturaData, setFaturaData] = useState<{
        link_nfe: string | null;
        id_asaas: string | null;
      } | null>(null);

      const { user } = useAuth();
      const { toast } = useToast();

      // AI dev note: Auto-save de evolução removido - agora usamos apenas evolução estruturada

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

      // AI dev note: Carregar profissionais apenas para admin (para alterar profissional responsável)
      useEffect(() => {
        const loadProfissionais = async () => {
          // Apenas admin pode alterar profissional
          if (userRole !== 'admin') {
            setProfissionaisOptions([]);
            return;
          }

          setIsLoadingProfissionais(true);
          try {
            const profissionais = await fetchProfissionais();
            setProfissionaisOptions(profissionais);
          } catch (error) {
            console.error('Erro ao carregar profissionais:', error);
          } finally {
            setIsLoadingProfissionais(false);
          }
        };

        if (isOpen && userRole === 'admin') {
          loadProfissionais();
        }
      }, [isOpen, userRole]);

      // AI dev note: Carregar histórico de auditoria apenas para admin
      useEffect(() => {
        const loadAuditLogs = async () => {
          if (userRole !== 'admin' || !appointment?.id) {
            setAuditLogs([]);
            return;
          }

          setIsLoadingAuditLogs(true);
          try {
            const { data, error } = await supabase
              .from('agendamento_audit_log')
              .select(
                `
                id,
                campo_alterado,
                valor_anterior,
                valor_novo,
                created_at,
                alterado_por:pessoas!agendamento_audit_log_alterado_por_fkey(nome)
              `
              )
              .eq('agendamento_id', appointment.id)
              .order('created_at', { ascending: false });

            if (error) {
              console.error('Erro ao carregar logs de auditoria:', error);
              setAuditLogs([]);
              return;
            }

            // Mapear para o formato esperado
            // AI dev note: alterado_por pode vir como objeto ou array dependendo da query
            const formattedLogs = (data || []).map((log) => {
              const alteradoPor = log.alterado_por as
                | { nome: string }
                | { nome: string }[]
                | null;
              const nome = Array.isArray(alteradoPor)
                ? alteradoPor[0]?.nome
                : alteradoPor?.nome;

              return {
                id: log.id,
                campo_alterado: log.campo_alterado,
                valor_anterior: log.valor_anterior,
                valor_novo: log.valor_novo,
                created_at: log.created_at,
                alterado_por_nome: nome || 'Sistema',
              };
            });

            setAuditLogs(formattedLogs);
          } catch (error) {
            console.error('Erro ao carregar logs de auditoria:', error);
            setAuditLogs([]);
          } finally {
            setIsLoadingAuditLogs(false);
          }
        };

        if (isOpen && userRole === 'admin' && appointment?.id) {
          loadAuditLogs();
        }
      }, [isOpen, userRole, appointment?.id]);

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
            empresaFaturaId: appointment.empresa_fatura_id || '',
            profissionalId: appointment.profissional_id || '',
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

        return false;
      };

      const handleStartEdit = (evolucao: SupabaseRelatorioEvolucaoCompleto) => {
        // AI dev note: Se a evolução tem dados estruturados (JSONB), abrir modal de edição
        // Caso contrário, usar edição de texto simples (legado)
        if (
          evolucao.evolucao_respiratoria ||
          evolucao.evolucao_motora_assimetria
        ) {
          // Abrir modal com dados existentes para edição
          setEditingEvolucaoData({
            id: evolucao.id,
            tipo_evolucao: evolucao.tipo_evolucao as TipoEvolucao | undefined,
            evolucao_respiratoria: evolucao.evolucao_respiratoria as
              | EvolucaoRespiratoria
              | undefined,
            evolucao_motora_assimetria: evolucao.evolucao_motora_assimetria as
              | EvolucaoMotoraAssimetria
              | undefined,
          });
          setShowEvolutionModal(true);
        } else {
          // Edição de texto simples (evoluções legadas)
          setEditingEvolucaoId(evolucao.id);
          setEditingContent(evolucao.conteudo || '');
        }
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

      // Handler para salvar evolução estruturada (criar ou editar)
      const handleSaveStructuredEvolution = async (dados: {
        tipo_evolucao: TipoEvolucao;
        evolucao_respiratoria?: EvolucaoRespiratoria;
        evolucao_motora_assimetria?: EvolucaoMotoraAssimetria;
      }) => {
        if (!appointment || !user?.pessoa?.id) return;

        const isEditing = !!editingEvolucaoData;

        setIsSavingEvolucao(true);
        try {
          // Gerar texto resumido baseado nos dados estruturados
          let conteudoResumo = `📋 Evolução Estruturada (${dados.tipo_evolucao === 'respiratoria' ? 'Respiratória' : 'Motora/Assimetria'})\n\n`;

          if (
            dados.tipo_evolucao === 'respiratoria' &&
            dados.evolucao_respiratoria
          ) {
            const ev = dados.evolucao_respiratoria;

            // AVALIAÇÃO INICIAL (ANTES)
            conteudoResumo += `═══════════════════════════════════════════\n`;
            conteudoResumo += `📋 AVALIAÇÃO INICIAL (ANTES)\n`;
            conteudoResumo += `═══════════════════════════════════════════\n\n`;

            // 1. Estado Geral da Criança
            conteudoResumo += `👶 Estado Geral da Criança\n`;
            if (ev.estado_geral_antes.nivel_consciencia) {
              const nivelMap: Record<string, string> = {
                acordado: 'Acordado',
                sonolento: 'Sonolento',
                dormindo: 'Dormindo',
              };
              let consciencia =
                nivelMap[ev.estado_geral_antes.nivel_consciencia] ||
                ev.estado_geral_antes.nivel_consciencia;
              if (
                ev.estado_geral_antes.nivel_consciencia === 'acordado' &&
                ev.estado_geral_antes.estado_acordado
              ) {
                consciencia += ` → ${ev.estado_geral_antes.estado_acordado === 'ativo' ? 'Ativo' : 'Hipoativo'}`;
              }
              conteudoResumo += `   • Nível de consciência: ${consciencia}\n`;
            }
            // Comportamento
            const comportamentos = [];
            if (ev.estado_geral_antes.comportamento_calmo)
              comportamentos.push('Calmo');
            if (ev.estado_geral_antes.comportamento_irritado)
              comportamentos.push('Irritado');
            if (ev.estado_geral_antes.comportamento_choroso)
              comportamentos.push('Choroso');
            if (ev.estado_geral_antes.comportamento_agitado)
              comportamentos.push('Agitado');
            if (comportamentos.length > 0) {
              conteudoResumo += `   • Comportamento: ${comportamentos.join(', ')}\n`;
            }

            // 2. Sinais Vitais
            const temSinaisVitais =
              ev.estado_geral_antes.temperatura_aferida ||
              ev.estado_geral_antes.frequencia_cardiaca ||
              ev.estado_geral_antes.saturacao_o2;
            if (temSinaisVitais) {
              conteudoResumo += `\n🌡️ Sinais Vitais\n`;
              if (ev.estado_geral_antes.temperatura_aferida) {
                conteudoResumo += `   • Temperatura: ${ev.estado_geral_antes.temperatura_aferida}°C\n`;
              }
              if (ev.estado_geral_antes.frequencia_cardiaca) {
                conteudoResumo += `   • FC: ${ev.estado_geral_antes.frequencia_cardiaca} bpm\n`;
              }
              if (ev.estado_geral_antes.saturacao_o2) {
                conteudoResumo += `   • SpO₂ (inicial): ${ev.estado_geral_antes.saturacao_o2}%\n`;
              }
              if (
                ev.estado_geral_antes.necessita_suporte_o2 &&
                ev.estado_geral_antes.saturacao_com_suporte
              ) {
                conteudoResumo += `   • SpO₂ c/ suporte: ${ev.estado_geral_antes.saturacao_com_suporte}%\n`;
              }
            }

            // 3. Contexto Clínico
            const temContextoClinico =
              ev.estado_geral_antes.infeccao_recente ||
              ev.estado_geral_antes.episodios_recorrentes_sibilancia ||
              ev.estado_geral_antes.contato_pessoas_sintomaticas ||
              ev.estado_geral_antes.uso_medicacao_respiratoria ||
              ev.estado_geral_antes.inicio_sintomas_dias;
            if (temContextoClinico) {
              conteudoResumo += `\n📋 Contexto Clínico Recente (relato do responsável)\n`;
              if (ev.estado_geral_antes.inicio_sintomas_dias) {
                conteudoResumo += `   • Início dos sintomas: há ${ev.estado_geral_antes.inicio_sintomas_dias} dias\n`;
              }
              if (ev.estado_geral_antes.infeccao_recente)
                conteudoResumo += `   • Infecção respiratória recente\n`;
              if (ev.estado_geral_antes.episodios_recorrentes_sibilancia)
                conteudoResumo += `   • Episódios recorrentes de sibilância\n`;
              if (ev.estado_geral_antes.contato_pessoas_sintomaticas)
                conteudoResumo += `   • Contato recente com pessoas sintomáticas\n`;
              if (ev.estado_geral_antes.uso_medicacao_respiratoria)
                conteudoResumo += `   • Uso recente de medicação respiratória\n`;
            }

            // 4. Repercussões Funcionais
            const repercussoes = [];
            if (ev.estado_geral_antes.dificuldade_alimentar)
              repercussoes.push('Dificuldade alimentar');
            if (ev.estado_geral_antes.interrupcoes_sono)
              repercussoes.push('Interrupções do sono');
            if (ev.estado_geral_antes.piora_noturna)
              repercussoes.push('Piora noturna dos sintomas');
            if (ev.estado_geral_antes.irritabilidade_respiratoria)
              repercussoes.push('Irritabilidade associada à respiração');
            if (repercussoes.length > 0) {
              conteudoResumo += `\n⚠️ Repercussões Funcionais (relato do responsável)\n`;
              conteudoResumo += `   • ${repercussoes.join(', ')}\n`;
            }

            // 5. Sinais Associados (relato do responsável)
            const sinaisAssociados = [];
            if (ev.estado_geral_antes.tosse_seca_referida)
              sinaisAssociados.push('Tosse seca');
            if (ev.estado_geral_antes.tosse_produtiva_referida)
              sinaisAssociados.push('Tosse produtiva');
            if (ev.estado_geral_antes.chiado_referido)
              sinaisAssociados.push('Sibilo referido');
            if (ev.estado_geral_antes.cansaco_respiratorio)
              sinaisAssociados.push('Cansaço respiratório');
            if (ev.estado_geral_antes.esforco_respiratorio)
              sinaisAssociados.push('Esforço respiratório percebido');
            if (ev.estado_geral_antes.respiracao_ruidosa)
              sinaisAssociados.push('Respiração ruidosa');
            if (sinaisAssociados.length > 0) {
              conteudoResumo += `\n🔍 Sinais Associados (relato do responsável)\n`;
              conteudoResumo += `   • ${sinaisAssociados.join(', ')}\n`;
            }

            // 6. Sintomas Respiratórios - Tosse (avaliação do profissional)
            if (ev.estado_geral_antes.tosse) {
              conteudoResumo += `\n😷 Sintomas Respiratórios (avaliação do profissional)\n`;
              const tosseMap: Record<string, string> = {
                ausente: 'Ausente',
                seca: 'Seca',
                produtiva: 'Produtiva',
              };
              let tosseInfo = `   • Tosse: ${tosseMap[ev.estado_geral_antes.tosse] || ev.estado_geral_antes.tosse}`;
              if (
                ev.estado_geral_antes.tosse === 'produtiva' &&
                ev.estado_geral_antes.tosse_eficacia
              ) {
                tosseInfo += ` → ${ev.estado_geral_antes.tosse_eficacia === 'eficaz' ? 'Eficaz' : 'Ineficaz'}`;
                if (
                  ev.estado_geral_antes.tosse_eficacia === 'eficaz' &&
                  ev.estado_geral_antes.tosse_destino
                ) {
                  tosseInfo += ` → ${ev.estado_geral_antes.tosse_destino === 'degluticao' ? '😮‍💨 Deglutição' : 'Expectoração'}`;
                  if (ev.estado_geral_antes.tosse_destino === 'expectoracao') {
                    if (ev.estado_geral_antes.secrecao_cor) {
                      const corMap: Record<string, string> = {
                        clara: 'Clara/Hialina',
                        amarelada: 'Amarelada',
                        esverdeada: 'Esverdeada',
                        sanguinolenta: 'Sanguinolenta',
                      };
                      tosseInfo += ` | Cor: ${corMap[ev.estado_geral_antes.secrecao_cor] || ev.estado_geral_antes.secrecao_cor}`;
                    }
                    if (ev.estado_geral_antes.secrecao_quantidade) {
                      const qtdMap: Record<string, string> = {
                        pouca: 'Pouca',
                        moderada: 'Moderada',
                        abundante: 'Abundante',
                      };
                      tosseInfo += ` | Qtd: ${qtdMap[ev.estado_geral_antes.secrecao_quantidade] || ev.estado_geral_antes.secrecao_quantidade}`;
                    }
                  }
                }
              }
              conteudoResumo += tosseInfo + '\n';
            }

            // Observações do Estado Geral
            if (ev.estado_geral_antes.observacoes) {
              conteudoResumo += `\n📝 Observações (Estado Geral)\n`;
              conteudoResumo += `   ${ev.estado_geral_antes.observacoes}\n`;
            }

            // AVALIAÇÃO RESPIRATÓRIA (ANTES)
            conteudoResumo += `\n═══════════════════════════════════════════\n`;
            conteudoResumo += `🩺 AVALIAÇÃO RESPIRATÓRIA (ANTES)\n`;
            conteudoResumo += `═══════════════════════════════════════════\n\n`;

            const padrao = ev.avaliacao_antes.padrao_respiratorio;
            conteudoResumo += `🫁 Padrão Respiratório\n`;
            if (padrao.ritmo_respiratorio) {
              const ritmoMap: Record<string, string> = {
                eupneico: 'Eupneico',
                bradipneico: 'Bradipneico',
                taquipneico: 'Taquipneico',
              };
              conteudoResumo += `   • Ritmo: ${ritmoMap[padrao.ritmo_respiratorio] || padrao.ritmo_respiratorio}\n`;
            }
            if (padrao.dispneia !== null) {
              conteudoResumo += `   • Dispneia: ${padrao.dispneia ? '✓ Presente' : '✗ Ausente'}\n`;
            }
            if (padrao.dispneia) {
              const sinaisDispneia = ev.avaliacao_antes.sinais_dispneia;
              const sinais = [];
              if (sinaisDispneia.uso_musculatura_acessoria)
                sinais.push('Uso musculatura acessória');
              if (sinaisDispneia.batimento_asa_nasal)
                sinais.push('Batimento asa nasal');
              if (sinaisDispneia.tiragem_intercostal)
                sinais.push('Tiragem intercostal');
              if (sinaisDispneia.tiragem_subcostal)
                sinais.push('Tiragem subcostal');
              if (sinaisDispneia.tiragem_supraclavicular)
                sinais.push('Tiragem supraclavicular');
              if (sinaisDispneia.retracao_furcula)
                sinais.push('Retração de fúrcula');
              if (sinaisDispneia.gemencia) sinais.push('Gemência');
              if (sinaisDispneia.postura_antalgica)
                sinais.push('Postura antálgica');
              if (sinaisDispneia.tempo_expiratorio_prolongado)
                sinais.push('Tempo expiratório prolongado');
              if (sinais.length > 0) {
                conteudoResumo += `   • Sinais de dispneia: ${sinais.join(', ')}\n`;
              }
            }
            if (padrao.classificacao_clinica) {
              const classMap: Record<string, string> = {
                taquipneico_sem_dispneia: 'Taquipneico sem dispneia',
                dispneico_sem_taquipneia: 'Dispneico sem taquipneia',
                taquidispneico: 'Taquidispneico',
              };
              conteudoResumo += `   • Classificação: ${classMap[padrao.classificacao_clinica] || padrao.classificacao_clinica}\n`;
            }

            // Ausculta Pulmonar - por hemitórax
            const ausculta = ev.avaliacao_antes.ausculta;
            const hd = ausculta.hemitorax_direito;
            const he = ausculta.hemitorax_esquerdo;

            const mvMap: Record<string, string> = {
              preservado: 'Preservado',
              diminuido: 'Diminuído',
              abolido: 'Abolido',
            };

            conteudoResumo += `\n👂 Ausculta Pulmonar\n`;

            // Hemitórax Direito
            conteudoResumo += `   ▸ Hemitórax Direito:\n`;
            if (hd.murmurio_vesicular) {
              conteudoResumo += `     • MV: ${mvMap[hd.murmurio_vesicular] || hd.murmurio_vesicular}\n`;
            }
            const ruidosD = [];
            if (hd.ruidos_ausentes) ruidosD.push('Sem ruídos adventícios');
            if (hd.sibilos) ruidosD.push('Sibilos');
            if (hd.roncos) ruidosD.push('Roncos');
            if (hd.roncos_transmissao) ruidosD.push('Roncos de Transmissão');
            if (hd.estertores_finos) ruidosD.push('Estertores finos');
            if (hd.estertores_grossos) ruidosD.push('Estertores grossos');
            if (ruidosD.length > 0) {
              conteudoResumo += `     • Ruídos: ${ruidosD.join(', ')}\n`;
            }
            const locD = [];
            if (hd.localizacao_difusos) locD.push('Difusos');
            if (hd.localizacao_apice) locD.push('Ápice');
            if (hd.localizacao_terco_medio) locD.push('Terço médio');
            if (hd.localizacao_base) locD.push('Base');
            if (locD.length > 0) {
              conteudoResumo += `     • Localização: ${locD.join(', ')}\n`;
            }

            // Hemitórax Esquerdo
            conteudoResumo += `   ▸ Hemitórax Esquerdo:\n`;
            if (he.murmurio_vesicular) {
              conteudoResumo += `     • MV: ${mvMap[he.murmurio_vesicular] || he.murmurio_vesicular}\n`;
            }
            const ruidosE = [];
            if (he.ruidos_ausentes) ruidosE.push('Sem ruídos adventícios');
            if (he.sibilos) ruidosE.push('Sibilos');
            if (he.roncos) ruidosE.push('Roncos');
            if (he.roncos_transmissao) ruidosE.push('Roncos de Transmissão');
            if (he.estertores_finos) ruidosE.push('Estertores finos');
            if (he.estertores_grossos) ruidosE.push('Estertores grossos');
            if (ruidosE.length > 0) {
              conteudoResumo += `     • Ruídos: ${ruidosE.join(', ')}\n`;
            }
            const locE = [];
            if (he.localizacao_difusos) locE.push('Difusos');
            if (he.localizacao_apice) locE.push('Ápice');
            if (he.localizacao_terco_medio) locE.push('Terço médio');
            if (he.localizacao_base) locE.push('Base');
            if (locE.length > 0) {
              conteudoResumo += `     • Localização: ${locE.join(', ')}\n`;
            }

            // Observações da Ausculta
            if (ausculta.observacoes) {
              conteudoResumo += `\n📝 Observações (Ausculta)\n`;
              conteudoResumo += `   ${ausculta.observacoes}\n`;
            }

            // INTERVENÇÃO
            conteudoResumo += `\n═══════════════════════════════════════════\n`;
            conteudoResumo += `💪 INTERVENÇÃO REALIZADA\n`;
            conteudoResumo += `═══════════════════════════════════════════\n\n`;

            const tecnicas = [];
            if (ev.intervencao.afe) tecnicas.push('AFE');
            if (ev.intervencao.vibrocompressao)
              tecnicas.push('Vibrocompressão');
            if (ev.intervencao.expiração_lenta_prolongada)
              tecnicas.push('Expiração Lenta Prolongada');
            if (ev.intervencao.rta) tecnicas.push('RTA');
            if (ev.intervencao.epap) tecnicas.push('EPAP');
            if (ev.intervencao.epap_selo_dagua)
              tecnicas.push("EPAP Selo d'Água");
            if (ev.intervencao.redirecionamento_fluxo)
              tecnicas.push('Redirecionamento de Fluxo');
            if (ev.intervencao.posicionamentos_terapeuticos)
              tecnicas.push('Posicionamentos Terapêuticos');
            if (ev.intervencao.estimulo_tosse)
              tecnicas.push('Estímulo à Tosse');
            if (ev.intervencao.nebulizacao) tecnicas.push('Nebulização');
            if (tecnicas.length > 0) {
              conteudoResumo += `🔧 Técnicas Utilizadas\n`;
              conteudoResumo += `   • ${tecnicas.join(', ')}\n`;
            }
            if (ev.intervencao.peep_valor) {
              conteudoResumo += `   • PEEP utilizado: ${ev.intervencao.peep_valor} cmH₂O\n`;
            }
            if (ev.intervencao.aspiracao) {
              conteudoResumo += `\n🔴 Aspiração Realizada\n`;
              const tipoMap: Record<string, string> = {
                nao_invasiva: 'Não Invasiva (VAS)',
                invasiva: 'Invasiva',
                ambas: 'Ambas',
              };
              conteudoResumo += `   • Tipo: ${tipoMap[ev.intervencao.aspiracao_tipo || ''] || 'Realizada'}\n`;
              if (ev.intervencao.aspiracao_quantidade) {
                const qtdMap: Record<string, string> = {
                  pequena: 'Pequena',
                  moderada: 'Moderada',
                  grande: 'Grande',
                };
                conteudoResumo += `   • Quantidade: ${qtdMap[ev.intervencao.aspiracao_quantidade] || ev.intervencao.aspiracao_quantidade}\n`;
              }
              if (ev.intervencao.aspiracao_aspecto) {
                const aspectoMap: Record<string, string> = {
                  clara: 'Clara/Hialina',
                  amarelada: 'Amarelada',
                  esverdeada: 'Esverdeada',
                  sanguinolenta: 'Sanguinolenta',
                  espessa: 'Espessa',
                  fluida: 'Fluida',
                };
                conteudoResumo += `   • Aspecto: ${aspectoMap[ev.intervencao.aspiracao_aspecto] || ev.intervencao.aspiracao_aspecto}\n`;
              }
              if (ev.intervencao.aspiracao_sangramento) {
                const sangMap: Record<string, string> = {
                  nao: 'Não',
                  rajas_sangue: 'Rajas de sangue',
                  sangramento_ativo: 'Sangramento ativo',
                };
                conteudoResumo += `   • Sangramento: ${sangMap[ev.intervencao.aspiracao_sangramento] || ev.intervencao.aspiracao_sangramento}\n`;
              }
            }

            // Observações da Intervenção
            if (ev.intervencao.observacoes) {
              conteudoResumo += `\n📝 Observações (Intervenção)\n`;
              conteudoResumo += `   ${ev.intervencao.observacoes}\n`;
            }

            // RESPOSTA AO TRATAMENTO (DEPOIS)
            conteudoResumo += `\n═══════════════════════════════════════════\n`;
            conteudoResumo += `✅ RESPOSTA AO TRATAMENTO (DEPOIS)\n`;
            conteudoResumo += `═══════════════════════════════════════════\n\n`;

            // Sinais Vitais Após
            const temSinaisVitaisApos =
              ev.avaliacao_depois.saturacao_o2 ||
              ev.avaliacao_depois.frequencia_cardiaca;
            if (temSinaisVitaisApos) {
              conteudoResumo += `🌡️ Sinais Vitais Após Intervenção\n`;
              if (ev.avaliacao_depois.saturacao_o2) {
                conteudoResumo += `   • SpO₂: ${ev.avaliacao_depois.saturacao_o2}%\n`;
              }
              if (ev.avaliacao_depois.frequencia_cardiaca) {
                conteudoResumo += `   • FC: ${ev.avaliacao_depois.frequencia_cardiaca} bpm\n`;
              }
            }

            // Resposta Clínica
            const temRespostaClinica =
              ev.avaliacao_depois.melhora_padrao_respiratorio ||
              ev.avaliacao_depois.eliminacao_secrecao ||
              ev.avaliacao_depois.reducao_desconforto;
            if (temRespostaClinica) {
              conteudoResumo += `\n📈 Resposta Clínica\n`;
              if (ev.avaliacao_depois.melhora_padrao_respiratorio) {
                conteudoResumo += `   ✓ Melhora do padrão respiratório\n`;
              }
              if (ev.avaliacao_depois.eliminacao_secrecao) {
                conteudoResumo += `   ✓ Eliminação de secreção\n`;
              }
              if (ev.avaliacao_depois.reducao_desconforto) {
                conteudoResumo += `   ✓ Redução do desconforto\n`;
              }
            }

            // Tolerância e Comportamento
            if (
              ev.avaliacao_depois.tolerancia_manuseio ||
              ev.avaliacao_depois.choro_durante_atendimento
            ) {
              conteudoResumo += `\n👶 Tolerância ao Atendimento\n`;
              if (ev.avaliacao_depois.tolerancia_manuseio) {
                const tolMap: Record<string, string> = {
                  boa: '✓ Boa',
                  regular: '⚠ Regular',
                  ruim: '✗ Ruim',
                };
                conteudoResumo += `   • Tolerância ao manuseio: ${tolMap[ev.avaliacao_depois.tolerancia_manuseio] || ev.avaliacao_depois.tolerancia_manuseio}\n`;
              }
              if (ev.avaliacao_depois.choro_durante_atendimento) {
                const choroMap: Record<string, string> = {
                  ausente: 'Ausente',
                  leve: 'Leve',
                  moderado: 'Moderado',
                  intenso: 'Intenso',
                };
                conteudoResumo += `   • Choro durante atendimento: ${choroMap[ev.avaliacao_depois.choro_durante_atendimento] || ev.avaliacao_depois.choro_durante_atendimento}\n`;
              }
            }

            // Mudanças na ausculta
            conteudoResumo += `\n👂 Mudança na Ausculta Pulmonar\n`;
            if (ev.avaliacao_depois.ausculta_sem_alteracao) {
              conteudoResumo += `   • Sem alteração (manteve-se igual)\n`;
            } else {
              const mudancasAusculta = [];
              if (ev.avaliacao_depois.ausculta_melhorou)
                mudancasAusculta.push('Melhora geral');
              if (ev.avaliacao_depois.ausculta_reducao_roncos)
                mudancasAusculta.push('↓ Redução de roncos');
              if (ev.avaliacao_depois.ausculta_reducao_sibilos)
                mudancasAusculta.push('↓ Redução de sibilos');
              if (ev.avaliacao_depois.ausculta_reducao_estertores)
                mudancasAusculta.push('↓ Redução de estertores');
              if (ev.avaliacao_depois.ausculta_melhora_mv)
                mudancasAusculta.push('↑ Melhora do MV');
              if (mudancasAusculta.length > 0) {
                conteudoResumo += `   • ${mudancasAusculta.join(', ')}\n`;
              }
            }

            // Observações da Resposta
            if (ev.avaliacao_depois.observacoes) {
              conteudoResumo += `\n📝 Observações (Resposta ao Tratamento)\n`;
              conteudoResumo += `   ${ev.avaliacao_depois.observacoes}\n`;
            }

            // ORIENTAÇÕES
            const temOrientacoes =
              ev.orientacoes.higiene_nasal ||
              ev.orientacoes.posicionamento_dormir ||
              ev.orientacoes.sinais_alerta;
            if (temOrientacoes) {
              conteudoResumo += `\n═══════════════════════════════════════════\n`;
              conteudoResumo += `📚 ORIENTAÇÕES FORNECIDAS AOS RESPONSÁVEIS\n`;
              conteudoResumo += `═══════════════════════════════════════════\n\n`;

              if (ev.orientacoes.higiene_nasal) {
                conteudoResumo += `🧴 Higiene Nasal\n`;
                if (ev.orientacoes.higiene_nasal_tecnica_demonstrada)
                  conteudoResumo += `   ✓ Técnica demonstrada\n`;
                if (ev.orientacoes.higiene_nasal_frequencia_orientada)
                  conteudoResumo += `   ✓ Frequência orientada conforme idade\n`;
              }
              if (ev.orientacoes.posicionamento_dormir) {
                conteudoResumo += `\n🛏️ Posicionamento para Dormir e Repouso\n`;
                if (ev.orientacoes.posicionamento_cabeca_elevada)
                  conteudoResumo += `   ✓ Cabeça elevada\n`;
                if (ev.orientacoes.posicionamento_alternancia_decubitos)
                  conteudoResumo += `   ✓ Alternância de decúbitos\n`;
                if (ev.orientacoes.posicionamento_prono)
                  conteudoResumo += `   ✓ Prono\n`;
                if (ev.orientacoes.posicionamento_decubito_lateral_direito)
                  conteudoResumo += `   ✓ Decúbito lateral direito\n`;
                if (ev.orientacoes.posicionamento_decubito_lateral_esquerdo)
                  conteudoResumo += `   ✓ Decúbito lateral esquerdo\n`;
              }
              if (ev.orientacoes.sinais_alerta) {
                conteudoResumo += `\n⚠️ Sinais de Alerta Orientados\n`;
                if (ev.orientacoes.sinais_alerta_esforco_respiratorio)
                  conteudoResumo += `   ✓ Aumento do esforço respiratório\n`;
                if (ev.orientacoes.sinais_alerta_piora_tosse_chiado)
                  conteudoResumo += `   ✓ Piora da tosse ou chiado\n`;
                if (ev.orientacoes.sinais_alerta_queda_saturacao)
                  conteudoResumo += `   ✓ Queda de saturação (quando monitorada)\n`;
                if (ev.orientacoes.sinais_alerta_piora_diurese)
                  conteudoResumo += `   ✓ Piora da diurese\n`;
                if (ev.orientacoes.sinais_alerta_febre)
                  conteudoResumo += `   ✓ Febre\n`;
                if (ev.orientacoes.sinais_alerta_prostracao)
                  conteudoResumo += `   ✓ Prostração\n`;
              }
              if (ev.orientacoes.outras) {
                conteudoResumo += `\n📝 Outras Orientações\n`;
                conteudoResumo += `   ${ev.orientacoes.outras}\n`;
              }
            }

            // CONDUTA
            conteudoResumo += `\n═══════════════════════════════════════════\n`;
            conteudoResumo += `🎯 CONDUTA E PLANO\n`;
            conteudoResumo += `═══════════════════════════════════════════\n\n`;

            if (ev.conduta.manter_fisioterapia) {
              conteudoResumo += `   ✓ Manter Fisioterapia Respiratória\n`;
              if (ev.conduta.frequencia_sugerida) {
                const freqMap: Record<string, string> = {
                  diaria: 'Diária',
                  '2x_semana': '2x por semana',
                  '3x_semana': '3x por semana',
                  semanal: 'Semanal',
                  quinzenal: 'Quinzenal',
                  mensal: 'Mensal',
                };
                conteudoResumo += `   • Frequência sugerida: ${freqMap[ev.conduta.frequencia_sugerida] || ev.conduta.frequencia_sugerida}\n`;
              }
            }
            if (ev.conduta.alta) {
              conteudoResumo += `   ✓ Alta Completa do tratamento\n`;
            }
            if (ev.conduta.alta_parcial) {
              conteudoResumo += `   ⚠ Alta Parcial / Acompanhamento\n`;
              if (ev.conduta.frequencia_sugerida) {
                const freqMap: Record<string, string> = {
                  diaria: 'Diária',
                  '2x_semana': '2x por semana',
                  '3x_semana': '3x por semana',
                  semanal: 'Semanal',
                  quinzenal: 'Quinzenal',
                  mensal: 'Mensal',
                };
                conteudoResumo += `   • Frequência: ${freqMap[ev.conduta.frequencia_sugerida] || ev.conduta.frequencia_sugerida}\n`;
              }
            }
            if (ev.conduta.reavaliacao_dias) {
              conteudoResumo += `   • Reavaliação em: ${ev.conduta.reavaliacao_dias} dias\n`;
            }
            if (ev.conduta.encaminhamento_medico) {
              conteudoResumo += `   ⚠ Encaminhamento Médico Necessário\n`;
              if (ev.conduta.motivo_encaminhamento) {
                conteudoResumo += `   • Motivo: ${ev.conduta.motivo_encaminhamento}\n`;
              }
              if (ev.conduta.especialista_encaminhamento) {
                conteudoResumo += `   • Especialista: ${ev.conduta.especialista_encaminhamento}\n`;
              }
            }

            // Observações da Conduta
            if (ev.conduta.observacoes) {
              conteudoResumo += `\n📝 Observações (Conduta)\n`;
              conteudoResumo += `   ${ev.conduta.observacoes}\n`;
            }

            // Fechamento
            conteudoResumo += `\n═══════════════════════════════════════════\n`;
          }

          if (
            dados.tipo_evolucao === 'motora_assimetria' &&
            dados.evolucao_motora_assimetria
          ) {
            const ev = dados.evolucao_motora_assimetria;
            if (ev.craniometria?.cvai_percentual) {
              conteudoResumo += `• CVAI: ${ev.craniometria.cvai_percentual.toFixed(1)}%\n`;
            }
            if (
              ev.intervencao.alongamentos ||
              ev.intervencao.fortalecimento ||
              ev.intervencao.tummy_time
            ) {
              conteudoResumo += `• Intervenção: `;
              const tecnicas = [];
              if (ev.intervencao.alongamentos) tecnicas.push('Alongamentos');
              if (ev.intervencao.fortalecimento)
                tecnicas.push('Fortalecimento');
              if (ev.intervencao.tummy_time) tecnicas.push('Tummy Time');
              conteudoResumo += tecnicas.join(', ') + '\n';
            }
          }

          // Extrair dados de analytics para colunas de dashboard
          let analyticsData = undefined;
          if (
            dados.tipo_evolucao === 'respiratoria' &&
            dados.evolucao_respiratoria
          ) {
            const ev = dados.evolucao_respiratoria;
            const hd = ev.avaliacao_antes.ausculta.hemitorax_direito;
            const he = ev.avaliacao_antes.ausculta.hemitorax_esquerdo;
            analyticsData = {
              // Estado Geral da Criança
              nivel_consciencia:
                ev.estado_geral_antes.nivel_consciencia || null,
              estado_acordado: ev.estado_geral_antes.estado_acordado || null,
              comportamento_calmo:
                ev.estado_geral_antes.comportamento_calmo || false,
              comportamento_irritado:
                ev.estado_geral_antes.comportamento_irritado || false,
              comportamento_choroso:
                ev.estado_geral_antes.comportamento_choroso || false,
              comportamento_agitado:
                ev.estado_geral_antes.comportamento_agitado || false,
              tolerancia_manuseio:
                ev.avaliacao_depois.tolerancia_manuseio || null,
              choro_atendimento:
                ev.avaliacao_depois.choro_durante_atendimento || null,
              // Sinais Vitais
              temperatura_aferida:
                ev.estado_geral_antes.temperatura_aferida || null,
              frequencia_cardiaca:
                ev.estado_geral_antes.frequencia_cardiaca || null,
              spo2_antes: ev.estado_geral_antes.saturacao_o2 || null,
              necessita_suporte_o2:
                ev.estado_geral_antes.necessita_suporte_o2 || false,
              spo2_com_suporte:
                ev.estado_geral_antes.saturacao_com_suporte || null,
              // Contexto Clínico
              episodios_recorrentes_sibilancia:
                ev.estado_geral_antes.episodios_recorrentes_sibilancia || false,
              contato_pessoas_sintomaticas:
                ev.estado_geral_antes.contato_pessoas_sintomaticas || false,
              uso_medicacao_respiratoria:
                ev.estado_geral_antes.uso_medicacao_respiratoria || false,
              inicio_sintomas_dias:
                ev.estado_geral_antes.inicio_sintomas_dias || null,
              // Repercussões Funcionais
              interrupcoes_sono:
                ev.estado_geral_antes.interrupcoes_sono || false,
              irritabilidade_respiratoria:
                ev.estado_geral_antes.irritabilidade_respiratoria || false,
              // Sinais Associados (relato do responsável)
              tosse_seca_referida:
                ev.estado_geral_antes.tosse_seca_referida || false,
              tosse_produtiva_referida:
                ev.estado_geral_antes.tosse_produtiva_referida || false,
              chiado: ev.estado_geral_antes.chiado_referido || false,
              cansaco_respiratorio:
                ev.estado_geral_antes.cansaco_respiratorio || false,
              esforco_respiratorio:
                ev.estado_geral_antes.esforco_respiratorio || false,
              respiracao_ruidosa:
                ev.estado_geral_antes.respiracao_ruidosa || false,
              // Sintomas Respiratórios - Tosse
              tosse_tipo: ev.estado_geral_antes.tosse || null,
              tosse_eficacia: ev.estado_geral_antes.tosse_eficacia || null,
              tosse_destino: ev.estado_geral_antes.tosse_destino || null,
              // Avaliação Respiratória
              ritmo_respiratorio:
                ev.avaliacao_antes.padrao_respiratorio.ritmo_respiratorio ||
                null,
              dispneia_presente:
                ev.avaliacao_antes.padrao_respiratorio.dispneia || false,
              classificacao_clinica:
                ev.avaliacao_antes.padrao_respiratorio.classificacao_clinica ||
                null,
              // Ausculta - consolidado (compatibilidade)
              murmurio_vesicular:
                hd.murmurio_vesicular || he.murmurio_vesicular || null,
              sibilos: hd.sibilos || he.sibilos || false,
              roncos: hd.roncos || he.roncos || false,
              estertores:
                hd.estertores_finos || he.estertores_finos
                  ? 'finos'
                  : hd.estertores_grossos || he.estertores_grossos
                    ? 'grossos'
                    : null,
              // Ausculta - Hemitórax Direito
              mv_direito: hd.murmurio_vesicular || null,
              sibilos_direito: hd.sibilos || false,
              roncos_direito: hd.roncos || false,
              roncos_transmissao_direito: hd.roncos_transmissao || false,
              estertores_finos_direito: hd.estertores_finos || false,
              estertores_grossos_direito: hd.estertores_grossos || false,
              // Ausculta - Hemitórax Esquerdo
              mv_esquerdo: he.murmurio_vesicular || null,
              sibilos_esquerdo: he.sibilos || false,
              roncos_esquerdo: he.roncos || false,
              roncos_transmissao_esquerdo: he.roncos_transmissao || false,
              estertores_finos_esquerdo: he.estertores_finos || false,
              estertores_grossos_esquerdo: he.estertores_grossos || false,
              // Intervenção
              tecnica_afe: ev.intervencao.afe || false,
              tecnica_vibrocompressao: ev.intervencao.vibrocompressao || false,
              tecnica_rta: ev.intervencao.rta || false,
              tecnica_epap:
                ev.intervencao.epap || ev.intervencao.epap_selo_dagua || false,
              tecnica_aspiracao: ev.intervencao.aspiracao || false,
              aspiracao_tipo: ev.intervencao.aspiracao_tipo || null,
              peep_valor: ev.intervencao.peep_valor || null,
              // Resposta ao Tratamento
              spo2_depois: ev.avaliacao_depois.saturacao_o2 || null,
              frequencia_cardiaca_depois:
                ev.avaliacao_depois.frequencia_cardiaca || null,
              melhora_padrao_respiratorio:
                ev.avaliacao_depois.melhora_padrao_respiratorio || false,
              eliminacao_secrecao:
                ev.avaliacao_depois.eliminacao_secrecao || false,
              reducao_desconforto:
                ev.avaliacao_depois.reducao_desconforto || false,
              ausculta_sem_alteracao:
                ev.avaliacao_depois.ausculta_sem_alteracao || false,
              ausculta_melhorou: ev.avaliacao_depois.ausculta_melhorou || false,
              // Conduta
              manter_fisioterapia: ev.conduta.manter_fisioterapia || false,
              frequencia_sugerida: ev.conduta.frequencia_sugerida || null,
              alta_completa: ev.conduta.alta || false,
              alta_parcial: ev.conduta.alta_parcial || false,
              encaminhamento_medico: ev.conduta.encaminhamento_medico || false,
              // Observações (campos de texto)
              obs_estado_geral: ev.estado_geral_antes.observacoes || null,
              obs_ausculta: ev.avaliacao_antes.ausculta.observacoes || null,
              obs_intervencao: ev.intervencao.observacoes || null,
              obs_resposta_tratamento: ev.avaliacao_depois.observacoes || null,
              obs_conduta: ev.conduta.observacoes || null,
            };
          }

          // Salvar ou atualizar evolução com dados estruturados
          // AI dev note: Salvamos os dados JSONB junto com o resumo em texto e colunas de analytics
          if (isEditing && editingEvolucaoData) {
            // MODO EDIÇÃO - Atualizar evolução existente
            await updateRelatorioEvolucaoCompleta({
              id: editingEvolucaoData.id,
              conteudo: conteudoResumo,
              atualizado_por: user.pessoa.id,
              // Campos JSONB para evolução estruturada
              tipo_evolucao: dados.tipo_evolucao,
              evolucao_respiratoria: dados.evolucao_respiratoria as
                | Record<string, unknown>
                | undefined,
              evolucao_motora_assimetria: dados.evolucao_motora_assimetria as
                | Record<string, unknown>
                | undefined,
              // Colunas de analytics para dashboard
              analytics: analyticsData,
            });
          } else {
            // MODO CRIAÇÃO - Criar nova evolução
            await saveRelatorioEvolucao({
              id_agendamento: appointment.id,
              conteudo: conteudoResumo,
              criado_por: user.pessoa.id,
              // Campos JSONB para evolução estruturada
              tipo_evolucao: dados.tipo_evolucao,
              evolucao_respiratoria: dados.evolucao_respiratoria as
                | Record<string, unknown>
                | undefined,
              evolucao_motora_assimetria: dados.evolucao_motora_assimetria as
                | Record<string, unknown>
                | undefined,
              // Colunas de analytics para dashboard
              analytics: analyticsData,
            });
          }

          // Recarregar evoluções
          const evolucoesList = await fetchRelatoriosEvolucao(appointment.id);
          setEvolucoes(evolucoesList);

          // Limpar estado de edição
          setEditingEvolucaoData(null);
          setShowEvolutionModal(false);
        } catch (error) {
          console.error('Erro ao salvar evolução estruturada:', error);
          throw error;
        } finally {
          setIsSavingEvolucao(false);
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

          // AI dev note: Apenas admin pode alterar profissional responsável
          // A mudança é registrada no audit log pelo backend
          if (
            userRole === 'admin' &&
            formData.profissionalId &&
            formData.profissionalId !== appointment.profissional_id
          ) {
            updateData.profissional_id = formData.profissionalId;
          }

          // Salvar agendamento através da callback do parent (para manter o flow existente)
          onSave(updateData);

          // AI dev note: Evolução agora é salva apenas via modal estruturado (EvolutionFormModal)
          // O campo de texto livre foi removido - toda evolução usa o formato estruturado

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
        <>
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

              <ScrollArea className="flex-1 h-full w-full">
                <div className="space-y-6 p-4 sm:p-6 w-full">
                  {/* Paciente */}
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                      <Label className="text-sm font-medium whitespace-nowrap">
                        Paciente:
                      </Label>
                      <Button
                        variant="link"
                        size="sm"
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onPatientClick?.(appointment.paciente_id);
                        }}
                        className="h-auto p-0 text-left justify-start font-bold cursor-pointer text-sm whitespace-normal"
                      >
                        {appointment.paciente_nome}
                      </Button>
                    </div>
                    {appointment.responsavel_legal_nome &&
                      appointment.responsavel_legal_id && (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                          <Label className="text-sm font-medium whitespace-nowrap">
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
                            className="h-auto p-0 text-left justify-start font-normal cursor-pointer text-sm whitespace-normal"
                          >
                            {appointment.responsavel_legal_nome}
                          </Button>
                        </div>
                      )}
                  </div>

                  <Separator />

                  {/* Data e Hora - Layout Responsivo */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="data">Data</Label>
                      <DatePicker
                        value={formData.dataHora}
                        onChange={(value) =>
                          handleInputChange('dataHora', value)
                        }
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
                            linkNfe={
                              faturaData?.link_nfe || appointment.link_nfe
                            }
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
                    <Label className="text-sm font-medium">
                      Responsável pelo Atendimento:
                    </Label>

                    {/* AI dev note: Apenas admin pode alterar profissional responsável */}
                    {userRole === 'admin' ? (
                      <Select
                        value={formData.profissionalId}
                        onValueChange={(value) =>
                          handleInputChange('profissionalId', value)
                        }
                        disabled={isLoadingProfissionais}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecionar profissional..." />
                        </SelectTrigger>
                        <SelectContent>
                          {profissionaisOptions.map((profissional) => (
                            <SelectItem
                              key={profissional.id}
                              value={profissional.id}
                            >
                              {profissional.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex items-start gap-2">
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
                    )}

                    {appointment.profissional_especialidade &&
                      userRole !== 'admin' && (
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
                                      className="h-8 w-8 p-0"
                                      title="Editar evolução"
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                  )}
                              </div>

                              {editingEvolucaoId === evolucao.id ? (
                                <div className="space-y-2">
                                  {/* AI dev note: Usar RichTextEditor ao invés de Textarea para manter formatação */}
                                  <RichTextEditor
                                    value={editingContent}
                                    onChange={(value) =>
                                      setEditingContent(value)
                                    }
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
                        {/* Botão para evolução estruturada */}
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => setShowEvolutionModal(true)}
                          disabled={isSavingEvolucao}
                          className="flex items-center gap-2 w-full"
                        >
                          <FileText className="h-4 w-4" />
                          {evolucoes.length > 0
                            ? 'Adicionar Nova Evolução'
                            : 'Registrar Evolução'}
                        </Button>
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

                        {/* AI dev note: Histórico de alterações de profissional - apenas admin */}
                        {userRole === 'admin' && (
                          <div className="mt-3">
                            {isLoadingAuditLogs ? (
                              <div className="text-xs text-muted-foreground">
                                Carregando histórico...
                              </div>
                            ) : auditLogs.length > 0 ? (
                              <div className="space-y-2">
                                <div className="text-xs font-medium text-muted-foreground">
                                  Histórico de Alterações:
                                </div>
                                {auditLogs.map((log) => (
                                  <div
                                    key={log.id}
                                    className="text-xs border-l-2 border-amber-400 pl-2 py-1 bg-amber-50/50 rounded-r"
                                  >
                                    <div>
                                      <strong className="text-foreground">
                                        {log.campo_alterado ===
                                        'profissional_id'
                                          ? 'Profissional alterado'
                                          : log.campo_alterado}
                                      </strong>{' '}
                                      por{' '}
                                      <span className="text-foreground">
                                        {log.alterado_por_nome}
                                      </span>{' '}
                                      em{' '}
                                      {new Date(log.created_at).toLocaleString(
                                        'pt-BR'
                                      )}
                                    </div>
                                    <div className="text-muted-foreground mt-0.5">
                                      De:{' '}
                                      <span className="text-red-600">
                                        {log.valor_anterior
                                          ?.replace(/^[^(]+\(/, '')
                                          .replace(/\)$/, '') || 'N/A'}
                                      </span>{' '}
                                      → Para:{' '}
                                      <span className="text-green-600">
                                        {log.valor_novo
                                          ?.replace(/^[^(]+\(/, '')
                                          .replace(/\)$/, '') || 'N/A'}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : null}
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
                  disabled={isSavingEvolucao || !isEdited}
                >
                  {isSavingEvolucao ? 'Salvando...' : 'Salvar Alterações'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Modal de Evolução Estruturada */}
          <EvolutionFormModal
            isOpen={showEvolutionModal}
            onClose={() => {
              setShowEvolutionModal(false);
              setEditingEvolucaoData(null);
            }}
            onSave={handleSaveStructuredEvolution}
            tipoServico={appointment.servico_nome}
            patientName={appointment.paciente_nome}
            existingData={
              editingEvolucaoData
                ? {
                    tipo_evolucao: editingEvolucaoData.tipo_evolucao,
                    evolucao_respiratoria:
                      editingEvolucaoData.evolucao_respiratoria,
                    evolucao_motora_assimetria:
                      editingEvolucaoData.evolucao_motora_assimetria,
                  }
                : undefined
            }
            mode={editingEvolucaoData ? 'edit' : 'create'}
          />
        </>
      );
    }
  );

AppointmentDetailsManager.displayName = 'AppointmentDetailsManager';
