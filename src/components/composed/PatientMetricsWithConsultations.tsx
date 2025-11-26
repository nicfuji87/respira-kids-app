import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  DollarSign,
  AlertTriangle,
  Clock,
  Activity,
  Filter,
  MapPin,
  User,
  ChevronRight,
  CreditCard,
  X,
  Building2,
  ExternalLink,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';
import { Button } from '@/components/primitives/button';
import { Skeleton } from '@/components/primitives/skeleton';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { Checkbox } from '@/components/primitives/checkbox';
import { useToast } from '@/components/primitives/use-toast';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { DatePicker } from './DatePicker';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { processPayment } from '@/lib/asaas-api';
import { receivePaymentManual } from '@/lib/receive-payment-api';
import type { ProcessPaymentData } from '@/types/asaas';
import type {
  PatientMetricsProps,
  PatientMetrics as PatientMetricsData,
  RecentConsultation,
} from '@/types/patient-details';
import type { FaturaComDetalhes } from '@/types/faturas';
import {
  fetchFaturasPorPaciente,
  editarFatura,
  excluirFatura,
  emitirNfeFatura,
} from '@/lib/faturas-api';
import { generateChargeDescription } from '@/lib/charge-description';
import { FaturasList } from './FaturasList';
import {
  validateResponsibleForAsaas,
  getAsaasValidationErrorMessage,
  type AsaasValidationResult,
} from '@/lib/asaas-validation';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/primitives/tooltip';

// AI dev note: PatientMetricsWithConsultations - Componente unificado que combina métricas e lista de consultas
// Filtros compartilhados entre métricas e consultas, conforme solicitado pelo usuário

// AI dev note: Função utilitária para gerar URL do ASAAS a partir do ID de pagamento
const getAsaasPaymentUrl = (paymentId: string): string | null => {
  if (!paymentId?.trim() || !paymentId.startsWith('pay_')) {
    return null;
  }
  return `https://www.asaas.com/i/${paymentId.replace('pay_', '')}`;
};

type PeriodFilter =
  | 'ultimos_30'
  | 'ultimos_60'
  | 'ultimos_90'
  | 'mes_atual'
  | 'mes_anterior'
  | 'ultimo_ano'
  | 'personalizado'
  | 'todos';

interface PatientMetricsWithConsultationsProps extends PatientMetricsProps {
  onConsultationClick?: (consultationId: string) => void;
  // Modo edição de fatura
  editMode?: {
    faturaId: string;
    initialSelectedIds: string[];
    onUpdateSuccess: () => void;
  };
}

export const PatientMetricsWithConsultations =
  React.memo<PatientMetricsWithConsultationsProps>(
    ({ patientId, onConsultationClick, className, editMode, userRole }) => {
      const { user } = useAuth();
      const { toast } = useToast();
      const [metrics, setMetrics] = useState<PatientMetricsData | null>(null);
      const [consultations, setConsultations] = useState<RecentConsultation[]>(
        []
      );
      const [totalCount, setTotalCount] = useState(0);
      const [isLoading, setIsLoading] = useState(true);
      const [error, setError] = useState<string | null>(null);

      // Estados para faturas
      const [faturas, setFaturas] = useState<FaturaComDetalhes[]>([]);
      const [isLoadingFaturas, setIsLoadingFaturas] = useState(true);
      const [errorFaturas, setErrorFaturas] = useState<string | null>(null);

      // Estados do filtro compartilhado
      const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('todos');
      const [startDate, setStartDate] = useState<string>('');
      const [endDate, setEndDate] = useState<string>('');

      // Estados para seleção de consultas para cobrança
      const [isSelectionMode, setIsSelectionMode] = useState(!!editMode);
      const [selectedConsultations, setSelectedConsultations] = useState<
        string[]
      >(editMode?.initialSelectedIds || []);
      const [isGeneratingCharge, setIsGeneratingCharge] = useState(false);
      const [chargeError, setChargeError] = useState<string | null>(null);
      const [asaasValidation, setAsaasValidation] =
        useState<AsaasValidationResult | null>(null);

      // Estados para modo de edição de fatura
      const [editingFatura, setEditingFatura] =
        useState<FaturaComDetalhes | null>(null);
      const [originalSelectedIds, setOriginalSelectedIds] = useState<string[]>(
        []
      );
      const [reloadTrigger, setReloadTrigger] = useState(0);

      // Estados para exclusão de fatura
      const [faturaToDelete, setFaturaToDelete] =
        useState<FaturaComDetalhes | null>(null);
      const [isDeletingFatura, setIsDeletingFatura] = useState(false);

      // Estados para emissão de NFe
      const [isEmitingNfe, setIsEmitingNfe] = useState<string | null>(null); // faturaId sendo processada

      // Estados para recebimento de pagamento manual
      const [isReceivingPayment, setIsReceivingPayment] = useState<
        string | null
      >(null); // faturaId sendo processada

      // Estado para controlar "Ver todas as consultas"
      const [showAll, setShowAll] = useState(false);

      // Verificar se usuário tem permissão para gerar cobrança (admin ou secretaria)
      const canGenerateCharge =
        user?.pessoa?.role === 'admin' || user?.pessoa?.role === 'secretaria';

      // Handlers de seleção
      const toggleSelectionMode = () => {
        setIsSelectionMode(!isSelectionMode);
        setSelectedConsultations([]); // Limpar seleção ao entrar/sair do modo
        if (isSelectionMode) {
          setChargeError(null);
          setEditingFatura(null);
          setOriginalSelectedIds([]);
        }
      };

      const toggleConsultationSelection = (consultationId: string) => {
        setSelectedConsultations((prev) =>
          prev.includes(consultationId)
            ? prev.filter((id) => id !== consultationId)
            : [...prev, consultationId]
        );
      };

      const selectAllConsultations = () => {
        const selectableIds = selectableConsultations.map((c) => c.id);
        setSelectedConsultations(selectableIds);
      };

      const clearSelection = () => {
        setSelectedConsultations([]);
      };

      // Handler para editar fatura
      const handleUpdateFatura = async () => {
        if (!editingFatura || selectedConsultations.length === 0) return;

        setIsGeneratingCharge(true);
        setChargeError(null);

        try {
          // Determinar agendamentos a adicionar e remover
          const agendamentosOriginais = originalSelectedIds;
          const agendamentosAtuais = selectedConsultations;

          const agendamentosParaAdicionar = agendamentosAtuais.filter(
            (id) => !agendamentosOriginais.includes(id)
          );
          const agendamentosParaRemover = agendamentosOriginais.filter(
            (id) => !agendamentosAtuais.includes(id)
          );

          console.log('🔄 Editando fatura:', {
            faturaId: editingFatura.id,
            agendamentosParaAdicionar,
            agendamentosParaRemover,
            totalSelecionados: agendamentosAtuais.length,
          });

          const result = await editarFatura(
            editingFatura.id,
            {
              agendamentosParaAdicionar,
              agendamentosParaRemover,
            },
            user?.pessoa?.id || 'system'
          );

          if (result.success) {
            toast({
              title: 'Fatura atualizada com sucesso!',
              description: `Fatura sincronizada com ${agendamentosAtuais.length} consultas.`,
            });

            // Sair do modo de seleção e limpar estados
            setIsSelectionMode(false);
            setSelectedConsultations([]);
            setEditingFatura(null);
            setOriginalSelectedIds([]);

            // Recarregar dados das consultas e faturas
            setReloadTrigger((prev) => prev + 1);
          } else {
            setChargeError(
              result.error || 'Erro desconhecido ao atualizar fatura'
            );
          }
        } catch (error) {
          console.error('💥 Erro ao atualizar fatura:', error);
          setChargeError('Erro inesperado ao atualizar fatura');
        } finally {
          setIsGeneratingCharge(false);
        }
      };

      // Handler para excluir fatura
      const handleDeleteFatura = async () => {
        if (!faturaToDelete) return;

        setIsDeletingFatura(true);

        try {
          console.log('🗑️ Excluindo fatura:', faturaToDelete.id);

          const result = await excluirFatura(
            faturaToDelete.id,
            user?.pessoa?.id || 'system'
          );

          if (result.success) {
            toast({
              title: 'Fatura excluída com sucesso!',
              description:
                'A cobrança foi cancelada no ASAAS e os agendamentos foram desvinculados.',
            });

            // Fechar modal e recarregar dados
            setFaturaToDelete(null);
            setReloadTrigger((prev) => prev + 1);
          } else {
            toast({
              title: 'Erro ao excluir fatura',
              description:
                result.error || 'Erro desconhecido ao excluir fatura',
              variant: 'destructive',
            });
          }
        } catch (error) {
          console.error('💥 Erro ao excluir fatura:', error);
          toast({
            title: 'Erro ao excluir fatura',
            description: 'Erro inesperado ao excluir fatura',
            variant: 'destructive',
          });
        } finally {
          setIsDeletingFatura(false);
        }
      };

      // Handler para emitir NFe
      const handleEmitirNfe = async (fatura: FaturaComDetalhes) => {
        if (fatura.status !== 'pago') {
          toast({
            title: 'Erro',
            description: 'Apenas faturas pagas podem ter NFe emitida',
            variant: 'destructive',
          });
          return;
        }

        setIsEmitingNfe(fatura.id);

        try {
          console.log('📄 Iniciando emissão de NFe para fatura:', fatura.id);

          const result = await emitirNfeFatura(
            fatura.id,
            user?.pessoa?.id || 'system'
          );

          if (result.success) {
            toast({
              title: 'NFe em processamento',
              description:
                'A nota fiscal está sendo gerada. O status será atualizado automaticamente.',
            });

            // Recarregar dados para mostrar status "Gerando NFe"
            setReloadTrigger((prev) => prev + 1);
          } else {
            toast({
              title: 'Erro ao emitir NFe',
              description: result.error || 'Erro desconhecido ao emitir NFe',
              variant: 'destructive',
            });
          }
        } catch (error) {
          console.error('💥 Erro ao emitir NFe:', error);
          toast({
            title: 'Erro ao emitir NFe',
            description: 'Erro inesperado ao emitir NFe',
            variant: 'destructive',
          });
        } finally {
          setIsEmitingNfe(null);
        }
      };

      // Handler para receber pagamento manual
      const handleReceivePayment = async (fatura: FaturaComDetalhes) => {
        if (
          !['pendente', 'atrasado'].includes(fatura.status) ||
          !fatura.id_asaas
        ) {
          toast({
            title: 'Erro',
            description:
              'Apenas faturas pendentes ou atrasadas com ID do ASAAS podem ter pagamento confirmado',
            variant: 'destructive',
          });
          return;
        }

        setIsReceivingPayment(fatura.id);

        try {
          console.log(
            '💰 Confirmando recebimento manual para fatura:',
            fatura.id
          );

          const result = await receivePaymentManual({
            faturaId: fatura.id,
            userId: user?.pessoa?.id || 'system',
          });

          if (result.success) {
            toast({
              title: 'Pagamento confirmado!',
              description: `Recebimento de R$ ${result.data?.valor.toFixed(2)} confirmado no ASAAS com sucesso.`,
            });

            // Recarregar dados para mostrar novo status
            setReloadTrigger((prev) => prev + 1);
          } else {
            toast({
              title: 'Erro ao confirmar pagamento',
              description:
                result.error || 'Erro desconhecido ao confirmar recebimento',
              variant: 'destructive',
            });
          }
        } catch (error) {
          console.error('💥 Erro ao confirmar pagamento:', error);
          toast({
            title: 'Erro ao confirmar pagamento',
            description: 'Erro inesperado ao confirmar recebimento',
            variant: 'destructive',
          });
        } finally {
          setIsReceivingPayment(null);
        }
      };

      // Handler para gerar cobrança
      const handleGenerateCharge = async () => {
        console.log('🚀 Iniciando geração de cobrança...');

        if (selectedConsultations.length === 0) {
          console.log('❌ Nenhuma consulta selecionada');
          return;
        }

        setIsGeneratingCharge(true);
        setChargeError(null);

        try {
          console.log('📋 Consultas selecionadas:', selectedConsultations);

          // Buscar dados completos das consultas selecionadas
          const selectedConsultationData = consultations.filter((c) =>
            selectedConsultations.includes(c.id)
          );

          console.log(
            '📊 Dados das consultas filtradas:',
            selectedConsultationData
          );

          if (selectedConsultationData.length === 0) {
            throw new Error('Nenhuma consulta selecionada encontrada');
          }

          // AI dev note: Consultas gratuitas (valor zero) são permitidas no sistema
          // mas não devem ser incluídas em cobranças do ASAAS (que requer valor > 0)

          // Calcular valor total
          const totalValue = selectedConsultationData.reduce(
            (sum, consultation) => {
              const value = Number(consultation.valor_servico || 0);
              return sum + value;
            },
            0
          );

          console.log('💰 Valor total calculado:', totalValue);

          // Validar se há consultas com valor zero
          const consultasGratuitas = selectedConsultationData.filter(
            (c) => Number(c.valor_servico || 0) === 0
          );

          if (consultasGratuitas.length > 0) {
            throw new Error(
              `Não é possível gerar cobrança para ${consultasGratuitas.length} consulta(s) gratuita(s). ` +
                'Por favor, desmarque as consultas com valor R$ 0,00 antes de gerar a cobrança.'
            );
          }

          if (totalValue <= 0) {
            throw new Error('Valor total deve ser maior que zero');
          }

          // AI dev note: Validar se todas as consultas são da mesma empresa de faturamento
          const empresasUnicas = new Set(
            selectedConsultationData
              .map(
                (c) =>
                  (c as RecentConsultation & { empresa_fatura_id?: string })
                    .empresa_fatura_id
              )
              .filter((id) => id)
          );

          if (empresasUnicas.size > 1) {
            throw new Error(
              'Todas as consultas selecionadas devem ser da mesma empresa de faturamento. Por favor, selecione consultas de apenas uma empresa.'
            );
          }

          if (empresasUnicas.size === 0) {
            throw new Error(
              'As consultas selecionadas devem ter uma empresa de faturamento definida.'
            );
          }

          console.log('✅ Validação de empresa de faturamento passou:', {
            empresaId: Array.from(empresasUnicas)[0],
            totalConsultas: selectedConsultationData.length,
          });

          // Buscar dados completos do paciente com responsável de cobrança
          console.log('👤 Buscando dados do paciente:', patientId);

          const { data: patientData, error: patientError } = await supabase
            .from('pacientes_com_responsaveis_view')
            .select('*')
            .eq('id', patientId)
            .single();

          if (patientError || !patientData) {
            console.error('❌ Erro ao buscar dados do paciente:', patientError);
            throw new Error('Erro ao buscar dados do paciente');
          }

          console.log('✅ Dados do paciente encontrados:', patientData);

          const responsibleId =
            patientData.responsavel_cobranca_id || patientId;
          console.log('💳 Responsável pela cobrança:', responsibleId);

          // AI dev note: Validar dados do responsável de cobrança para ASAAS
          // Buscar dados completos do responsável incluindo endereço
          const { data: responsibleData, error: responsibleError } =
            await supabase
              .from('vw_agendamentos_completos')
              .select(
                'responsavel_cobranca_nome, responsavel_cobranca_cpf, responsavel_cobranca_email, responsavel_cobranca_telefone, responsavel_cobranca_cep, responsavel_cobranca_numero'
              )
              .eq('paciente_id', patientId)
              .limit(1)
              .single();

          if (responsibleError || !responsibleData) {
            console.error(
              '❌ Erro ao buscar dados do responsável:',
              responsibleError
            );
          }

          // Validar dados para ASAAS
          const validation = validateResponsibleForAsaas({
            nome: responsibleData?.responsavel_cobranca_nome,
            cpf_cnpj: responsibleData?.responsavel_cobranca_cpf,
            email: responsibleData?.responsavel_cobranca_email,
            telefone: responsibleData?.responsavel_cobranca_telefone,
            cep: responsibleData?.responsavel_cobranca_cep,
            numero_endereco: responsibleData?.responsavel_cobranca_numero,
          });

          if (!validation.isValid) {
            const errorMessage = getAsaasValidationErrorMessage(
              validation,
              responsibleData?.responsavel_cobranca_nome || 'Responsável'
            );
            console.error('❌ Validação ASAAS falhou:', validation);
            throw new Error(errorMessage);
          }

          console.log('✅ Validação ASAAS passou com sucesso');

          // Gerar descrição da cobrança
          const consultationDataForDescription = selectedConsultationData.map(
            (c) => {
              const extendedConsultation = c as RecentConsultation & {
                profissional_id?: string;
                tipo_servico_id?: string;
              };
              return {
                id: c.id,
                data_hora: c.data_hora,
                servico_nome: c.servico_nome,
                valor_servico: c.valor_servico,
                profissional_nome: c.profissional_nome || 'Profissional',
                profissional_id: extendedConsultation.profissional_id,
                tipo_servico_id: extendedConsultation.tipo_servico_id,
              };
            }
          );

          const patientDataForDescription = {
            nome: patientData.nome as string,
            cpf_cnpj: patientData.cpf_cnpj as string,
          };

          const description = await generateChargeDescription(
            consultationDataForDescription,
            patientDataForDescription
          );

          // Preparar dados para processamento
          const processData: ProcessPaymentData = {
            consultationIds: selectedConsultations,
            patientId: patientId,
            responsibleId: responsibleId,
            totalValue: totalValue,
            description: description,
          };

          console.log('⚙️ Processando cobrança:', processData);

          // Processar cobrança
          const result = await processPayment(
            processData,
            user?.pessoa?.id || 'system'
          );

          console.log('📥 Resultado do processamento:', result);

          if (result.success) {
            console.log('✅ Cobrança criada com sucesso:', result);

            // Limpar seleção
            setSelectedConsultations([]);
            setIsSelectionMode(false);

            toast({
              title: 'Cobrança criada com sucesso!',
              description: `ID do pagamento: ${result.asaasPaymentId}`,
            });

            // Recarregar dados das consultas e faturas
            setReloadTrigger((prev) => prev + 1);
          } else {
            console.error('❌ Falha no processamento:', result.error);
            throw new Error(
              result.error || 'Erro desconhecido ao gerar cobrança'
            );
          }
        } catch (error) {
          console.error('💥 Erro ao gerar cobrança:', error);
          const errorMessage =
            error instanceof Error ? error.message : 'Erro desconhecido';
          console.error('📝 Mensagem de erro para usuário:', errorMessage);
          setChargeError(errorMessage);

          // Toast de erro para feedback imediato
          toast({
            title: 'Erro ao gerar cobrança',
            description: errorMessage,
            variant: 'destructive',
          });
        } finally {
          console.log('🏁 Finalizando geração de cobrança');
          setIsGeneratingCharge(false);
        }
      };

      // AI dev note: Filtrar consultas selecionáveis para geração de fatura
      // REGRAS DE NEGÓCIO - Consultas devem ser INDISPONÍVEIS quando:
      // 1. Status da consulta = 'cancelado' (consultas canceladas não podem ser faturadas)
      // 2. Valor da consulta = 0 (consultas gratuitas não geram cobrança)
      // 3. Status de pagamento = 'pago' (consultas já pagas não podem ser refaturadas)
      // 4. Consulta já incluída em uma fatura (fatura_id não nulo ou id_pagamento_externo)
      // 5. Empresas diferentes (consultas de empresas diferentes não podem estar na mesma fatura)

      // Determinar empresa predominante nas consultas já selecionadas
      const selectedConsultationsData = consultations.filter((c) =>
        selectedConsultations.includes(c.id)
      );
      const selectedEmpresas = selectedConsultationsData
        .map(
          (c) =>
            (c as RecentConsultation & { empresa_fatura_id?: string })
              .empresa_fatura_id
        )
        .filter((id) => id);
      const empresaAtiva =
        selectedEmpresas.length > 0 ? selectedEmpresas[0] : null;

      const selectableConsultations = consultations.filter((c) => {
        const isFromCurrentFatura =
          editingFatura && originalSelectedIds.includes(c.id);
        const isPaid = c.status_pagamento?.toLowerCase() === 'pago';
        const hasNoFatura = !c.fatura_id && !c.id_pagamento_externo;

        // ✅ VALIDAÇÃO 1: Verificar se consulta está cancelada
        // AI dev note: Usar type assertion pois status_consulta_codigo vem da view mas não está na interface base
        const isCancelled =
          (c as RecentConsultation & { status_consulta_codigo?: string })
            .status_consulta_codigo === 'cancelado';

        // ✅ VALIDAÇÃO 2: Verificar se consulta tem valor zero
        const hasZeroValue = Number(c.valor_servico || 0) === 0;

        // ✅ VALIDAÇÃO 3: Verificar se é da mesma empresa (quando há empresa ativa)
        const consultaEmpresa = (
          c as RecentConsultation & { empresa_fatura_id?: string }
        ).empresa_fatura_id;
        const matchesEmpresa =
          !empresaAtiva || consultaEmpresa === empresaAtiva;

        // Status editáveis em faturas (não pagos)
        const editableStatuses = ['pendente', 'atrasado', 'cobranca_gerada'];
        const currentStatus = c.status_pagamento?.toLowerCase() || '';

        return (
          !isPaid && // ✅ NÃO PODE ESTAR PAGA
          !isCancelled && // ✅ NÃO PODE ESTAR CANCELADA
          !hasZeroValue && // ✅ NÃO PODE TER VALOR ZERO
          matchesEmpresa && // ✅ DEVE SER DA MESMA EMPRESA
          // Modo normal: apenas consultas pendentes sem fatura
          ((!editingFatura && currentStatus === 'pendente' && hasNoFatura) ||
            // Modo edição: APENAS consultas da própria fatura OU pendentes sem fatura alguma
            (editingFatura &&
              ((isFromCurrentFatura &&
                editableStatuses.includes(currentStatus)) ||
                (currentStatus === 'pendente' && hasNoFatura))))
        );
      });

      const selectedCount = selectedConsultations.length;

      // Função para calcular datas baseadas no período (compartilhada)
      const getDateRange = useCallback(
        (period: PeriodFilter) => {
          const today = new Date();
          const end = today.toISOString().split('T')[0];

          let start = '';
          switch (period) {
            case 'ultimos_30':
              start = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split('T')[0];
              break;
            case 'ultimos_60':
              start = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split('T')[0];
              break;
            case 'ultimos_90':
              start = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split('T')[0];
              break;
            case 'mes_atual':
              // Primeiro dia do mês atual
              start = new Date(today.getFullYear(), today.getMonth(), 1)
                .toISOString()
                .split('T')[0];
              break;
            case 'mes_anterior': {
              // Primeiro dia do mês anterior
              start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
                .toISOString()
                .split('T')[0];
              // Último dia do mês anterior
              const endOfLastMonth = new Date(
                today.getFullYear(),
                today.getMonth(),
                0
              )
                .toISOString()
                .split('T')[0];
              return { start, end: endOfLastMonth };
            }
            case 'ultimo_ano':
              start = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split('T')[0];
              break;
            case 'personalizado':
              return { start: startDate, end: endDate };
            case 'todos':
            default:
              return { start: '', end: '' };
          }

          return { start, end };
        },
        [startDate, endDate]
      );

      // AI dev note: Tipo para itens de métricas com campos essenciais para cálculo
      type MetricsItem = {
        valor_servico?: string | number | null;
        comissao_tipo_recebimento?: string | null;
      };

      // AI dev note: Função helper para calcular valores em métricas baseado no role
      // APENAS para profissional tem lógica especial
      const getCalculationValue = useCallback(
        (item: MetricsItem): number => {
          // APENAS profissional tem lógica especial
          if (userRole === 'profissional') {
            // Se tem comissão configurada, usar comissão
            if (
              item.comissao_tipo_recebimento &&
              item.valor_servico !== null &&
              item.valor_servico !== undefined
            ) {
              return parseFloat(item.valor_servico?.toString() || '0');
            }
          }

          // Para TODOS os outros casos (outros roles ou profissional sem comissão), usar valor integral
          return parseFloat(item.valor_servico?.toString() || '0');
        },
        [userRole]
      );

      // Função para carregar dados das consultas
      const loadData = useCallback(async () => {
        if (!patientId) return;

        try {
          setIsLoading(true);
          setError(null);

          // Calcular range de datas
          const { start, end } = getDateRange(periodFilter);

          // Query para métricas com filtros aplicados
          let metricsQuery = supabase
            .from('vw_agendamentos_completos')
            .select(
              `
              valor_servico,
              data_hora,
              status_consulta_codigo,
              status_pagamento_codigo
            `
            )
            .eq('paciente_id', patientId)
            .eq('ativo', true);

          // Query para consultas com filtros aplicados
          let consultationsQuery = supabase
            .from('vw_agendamentos_completos')
            .select(
              `
              id,
              data_hora,
              valor_servico,
              tipo_servico_id,
              servico_nome,
              tipo_servico_descricao,
              local_nome,
              status_consulta_nome,
              status_consulta_cor,
              status_consulta_codigo,
              status_pagamento_nome,
              status_pagamento_cor,
              status_pagamento_codigo,
              profissional_nome,
              profissional_id,
              possui_evolucao,
              empresa_fatura_id,
              empresa_fatura_razao_social,
              empresa_fatura_nome_fantasia,
              id_pagamento_externo,
              fatura_id,
              comissao_tipo_recebimento,
              valor_servico
            `
            )
            .eq('paciente_id', patientId)
            .eq('ativo', true);

          // Aplicar filtros de data se especificados
          // No modo de edição, incluir consultas da fatura atual independente do período
          if (start) {
            metricsQuery = metricsQuery.gte('data_hora', start);
            if (editingFatura) {
              consultationsQuery = consultationsQuery.or(
                `data_hora.gte.${start},fatura_id.eq.${editingFatura.id}`
              );
            } else {
              consultationsQuery = consultationsQuery.gte('data_hora', start);
            }
          }
          if (end) {
            metricsQuery = metricsQuery.lte('data_hora', end + 'T23:59:59');
            if (editingFatura) {
              consultationsQuery = consultationsQuery.or(
                `data_hora.lte.${end}T23:59:59,fatura_id.eq.${editingFatura.id}`
              );
            } else {
              consultationsQuery = consultationsQuery.lte(
                'data_hora',
                end + 'T23:59:59'
              );
            }
          }

          // Executar queries em paralelo
          let consultationsPromise;

          if (editingFatura || showAll) {
            // No modo de edição ou "Ver todas", carregar TODAS as consultas (sem limit)
            consultationsPromise = consultationsQuery.order('data_hora', {
              ascending: false,
            });
          } else {
            // Modo normal, aplicar limit
            consultationsPromise = consultationsQuery
              .order('data_hora', { ascending: false })
              .limit(5);
          }

          const [metricsResult, consultationsResult] = await Promise.all([
            metricsQuery,
            consultationsPromise,
          ]);

          if (metricsResult.error) {
            throw new Error(metricsResult.error.message);
          }
          if (consultationsResult.error) {
            throw new Error(consultationsResult.error.message);
          }

          const metricsData = metricsResult.data || [];
          const consultationsData = consultationsResult.data || [];

          // Calcular métricas
          const totalConsultas = metricsData.length;

          // Total Agendado: consultas que serão cobradas (excluir apenas canceladas e reagendado)
          const consultasAgendadasEfetivas = metricsData.filter((item) => {
            const statusConsulta = item.status_consulta_codigo;
            // Incluir 'faltou' pois será cobrado, excluir apenas 'cancelado' e 'reagendado'
            return !['cancelado', 'reagendado'].includes(statusConsulta);
          });

          const totalAgendado = consultasAgendadasEfetivas.reduce(
            (sum, item) => sum + getCalculationValue(item),
            0
          );

          console.log(
            `📊 Métricas calculadas - Total: ${metricsData.length}, Para cobrança: ${consultasAgendadasEfetivas.length}`
          );

          // Debug: verificar todos os status de pagamento
          const statusPagamentos = metricsData.reduce(
            (acc, item) => {
              const status = item.status_pagamento_codigo || 'null';
              acc[status] = (acc[status] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>
          );
          console.log('📊 Status de pagamento encontrados:', statusPagamentos);

          // Total Faturado: consultas com cobrança gerada (cobranca_gerada + pendente + pago + atrasado)
          const totalFaturado = metricsData
            .filter((item) => {
              const statusCode = item.status_pagamento_codigo;
              return [
                'cobranca_gerada',
                'pendente',
                'pago',
                'atrasado',
              ].includes(statusCode);
            })
            .reduce((sum, item) => sum + getCalculationValue(item), 0);

          // Valores por status específico de pagamento
          const consultasPagas = metricsData.filter(
            (item) => item.status_pagamento_codigo === 'pago'
          );
          const valorPago = consultasPagas.reduce(
            (sum, item) => sum + getCalculationValue(item),
            0
          );

          console.log(
            `💰 Debug Valor Pago: ${consultasPagas.length} consultas pagas, valor total: R$ ${valorPago}`
          );

          const valorPendente = metricsData
            .filter((item) => item.status_pagamento_codigo === 'pendente')
            .reduce((sum, item) => sum + getCalculationValue(item), 0);

          const valorEmAtraso = metricsData
            .filter((item) => item.status_pagamento_codigo === 'atrasado')
            .reduce((sum, item) => sum + getCalculationValue(item), 0);

          // Valor Cancelado: consultas canceladas
          const valorCancelado = metricsData
            .filter((item) => item.status_consulta_codigo === 'cancelado')
            .reduce((sum, item) => sum + getCalculationValue(item), 0);

          // Consultas por status
          const consultasFinalizadas = metricsData.filter(
            (item) => item.status_consulta_codigo === 'finalizado'
          ).length;
          const consultasAgendadas = metricsData.filter(
            (item) => item.status_consulta_codigo === 'agendado'
          ).length;
          const consultasCanceladas = metricsData.filter(
            (item) => item.status_consulta_codigo === 'cancelado'
          ).length;

          // Função auxiliar para converter string de data em timestamp (sem conversão de timezone)
          const parseDateTime = (dateString: string): number => {
            const [datePart, timePart] =
              dateString.split('T').length > 1
                ? dateString.split('T')
                : dateString.split(' ');

            const [year, month, day] = datePart.split('-');
            const [hour, minute, second] = timePart.split('+')[0].split(':');

            const date = new Date(
              parseInt(year),
              parseInt(month) - 1,
              parseInt(day),
              parseInt(hour),
              parseInt(minute),
              parseInt(second || '0')
            );

            return date.getTime();
          };

          // Última consulta
          const sortedConsultas = metricsData
            .filter((item) => item.status_consulta_codigo === 'finalizado')
            .sort(
              (a, b) => parseDateTime(b.data_hora) - parseDateTime(a.data_hora)
            );

          const ultimaConsulta = sortedConsultas[0]?.data_hora;
          const diasDesdeUltima = ultimaConsulta
            ? Math.floor(
                (Date.now() - parseDateTime(ultimaConsulta)) /
                  (1000 * 60 * 60 * 24)
              )
            : null;

          const calculatedMetrics: PatientMetricsData = {
            total_consultas: totalConsultas,
            total_faturado: totalFaturado, // Consultas com cobrança gerada
            total_agendado: totalAgendado, // Consultas que serão cobradas (excluir apenas canceladas/reagendado)
            valor_pendente: valorPendente,
            valor_em_atraso: valorEmAtraso,
            valor_pago: valorPago,
            valor_cancelado: valorCancelado, // Nova métrica
            dias_em_atraso: valorEmAtraso > 0 ? 30 : 0,
            ultima_consulta: ultimaConsulta || null,
            dias_desde_ultima_consulta: diasDesdeUltima || 0,
            consultas_finalizadas: consultasFinalizadas,
            consultas_agendadas: consultasAgendadas,
            consultas_canceladas: consultasCanceladas,
          };

          console.log('📊 Métricas finais:', {
            total_agendado: totalAgendado,
            total_faturado: totalFaturado,
            valor_pago: valorPago,
            valor_pendente: valorPendente,
            valor_em_atraso: valorEmAtraso,
            valor_cancelado: valorCancelado,
          });

          // Mapear dados das consultas
          const mappedConsultations: RecentConsultation[] =
            consultationsData.map(
              (item) =>
                ({
                  id: item.id,
                  data_hora: item.data_hora,
                  servico_nome: item.servico_nome || 'Serviço não especificado',
                  local_nome: item.local_nome || 'Local não especificado',
                  valor_servico: parseFloat(item.valor_servico || '0'),
                  status_consulta:
                    item.status_consulta_nome || 'Status não definido',
                  status_pagamento:
                    item.status_pagamento_nome || 'Status não definido',
                  status_cor_consulta: item.status_consulta_cor || '#gray',
                  status_cor_pagamento: item.status_pagamento_cor || '#gray',
                  profissional_nome:
                    item.profissional_nome || 'Profissional não especificado',
                  possui_evolucao: item.possui_evolucao || 'não',
                  empresa_fatura_nome:
                    item.empresa_fatura_razao_social ||
                    item.empresa_fatura_nome_fantasia ||
                    'Empresa não especificada',
                  id_pagamento_externo: item.id_pagamento_externo || '',
                  // Campos adicionais para geração de cobrança
                  tipo_servico_id: item.tipo_servico_id,
                  tipo_servico_descricao: item.tipo_servico_descricao,
                  profissional_id: item.profissional_id,
                  empresa_fatura_id: item.empresa_fatura_id,
                  // AI dev note: Campos de comissão para lógica de exibição
                  comissao_tipo_recebimento: item.comissao_tipo_recebimento,
                  // AI dev note: Campos de código de status para filtros de fatura
                  status_consulta_codigo: item.status_consulta_codigo,
                  status_pagamento_codigo: item.status_pagamento_codigo,
                }) as RecentConsultation & {
                  tipo_servico_id?: string;
                  tipo_servico_descricao?: string;
                  profissional_id?: string;
                  empresa_fatura_id?: string;
                }
            );

          setMetrics(calculatedMetrics);
          setConsultations(mappedConsultations);

          // Buscar total de consultas para exibir contador
          let totalQuery = supabase
            .from('vw_agendamentos_completos')
            .select('*', { count: 'exact', head: true })
            .eq('paciente_id', patientId)
            .eq('ativo', true);

          if (start) {
            totalQuery = totalQuery.gte('data_hora', start);
          }
          if (end) {
            totalQuery = totalQuery.lte('data_hora', end + 'T23:59:59');
          }

          const { count } = await totalQuery;
          setTotalCount(count || 0);
        } catch (err) {
          console.error('Erro ao carregar dados do paciente:', err);
          setError('Erro ao carregar dados do paciente');
        } finally {
          setIsLoading(false);
        }
      }, [
        patientId,
        periodFilter,
        editingFatura,
        showAll,
        getDateRange,
        getCalculationValue,
      ]);

      // useEffect para chamar loadData
      useEffect(() => {
        loadData();
      }, [loadData, reloadTrigger]);

      // Função para carregar faturas do paciente
      const loadFaturas = useCallback(async () => {
        if (!patientId) return;

        try {
          setIsLoadingFaturas(true);
          setErrorFaturas(null);

          // Aplicar os mesmos filtros de período das consultas
          const { start, end } = getDateRange(periodFilter);

          const filtrosFaturas = {
            ...(start && { periodo_inicio: start }),
            ...(end && { periodo_fim: end + 'T23:59:59' }),
          };

          const result = await fetchFaturasPorPaciente(
            patientId,
            5,
            filtrosFaturas
          );

          if (result.success) {
            setFaturas(result.data || []);
          } else {
            setErrorFaturas(result.error || 'Erro ao carregar faturas');
          }
        } catch (err) {
          console.error('Erro ao carregar faturas:', err);
          setErrorFaturas('Erro inesperado ao carregar faturas');
        } finally {
          setIsLoadingFaturas(false);
        }
      }, [patientId, periodFilter, getDateRange]);

      // useEffect para carregar faturas
      useEffect(() => {
        loadFaturas();
      }, [loadFaturas, reloadTrigger]);

      // Limpar seleção quando mudamos filtros
      useEffect(() => {
        if (isSelectionMode && !editingFatura) {
          setSelectedConsultations([]);
        }
      }, [periodFilter, startDate, endDate, isSelectionMode, editingFatura]);

      // AI dev note: Validar dados do responsável de cobrança para ASAAS quando consultas mudam
      useEffect(() => {
        const validateResponsible = async () => {
          if (selectedConsultations.length === 0) {
            setAsaasValidation(null);
            return;
          }

          try {
            const { data: responsibleData, error: responsibleError } =
              await supabase
                .from('vw_agendamentos_completos')
                .select(
                  'responsavel_cobranca_nome, responsavel_cobranca_cpf, responsavel_cobranca_email, responsavel_cobranca_telefone, responsavel_cobranca_cep, responsavel_cobranca_numero'
                )
                .eq('paciente_id', patientId)
                .limit(1)
                .single();

            if (responsibleError || !responsibleData) {
              console.error(
                '❌ Erro ao buscar dados do responsável:',
                responsibleError
              );
              return;
            }

            const validation = validateResponsibleForAsaas({
              nome: responsibleData.responsavel_cobranca_nome,
              cpf_cnpj: responsibleData.responsavel_cobranca_cpf,
              email: responsibleData.responsavel_cobranca_email,
              telefone: responsibleData.responsavel_cobranca_telefone,
              cep: responsibleData.responsavel_cobranca_cep,
              numero_endereco: responsibleData.responsavel_cobranca_numero,
            });

            setAsaasValidation(validation);
          } catch (error) {
            console.error('❌ Erro ao validar responsável:', error);
          }
        };

        validateResponsible();
      }, [selectedConsultations, patientId]);

      // Função para formatar valor monetário
      const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        }).format(value);
      };

      // AI dev note: Função para determinar valor correto baseado no role
      // APENAS para profissional: mostrar comissão se configurada, senão valor integral
      // Para TODOS os outros roles: sempre valor integral
      const getDisplayValue = (consultation: RecentConsultation): number => {
        // APENAS profissional tem lógica especial
        if (userRole === 'profissional') {
          // Se tem comissão configurada, mostrar comissão
          if (
            consultation.comissao_tipo_recebimento &&
            consultation.valor_servico !== null &&
            consultation.valor_servico !== undefined
          ) {
            return consultation.valor_servico;
          }
        }

        // Para TODOS os outros casos (outros roles ou profissional sem comissão), mostrar valor integral
        return consultation.valor_servico;
      };

      // Função para formatar data e hora (sem conversão de timezone)
      const formatDateTime = (dateString: string) => {
        // Parse manual para evitar conversão automática de timezone
        // Formato esperado: "2025-07-29T09:00:00+00:00" ou "2025-07-29 09:00:00+00"
        const [datePart, timePart] =
          dateString.split('T').length > 1
            ? dateString.split('T')
            : dateString.split(' ');

        const [year, month, day] = datePart.split('-');
        const [hour, minute] = timePart.split('+')[0].split(':'); // Remove timezone info

        // Criar data usando valores exatos sem conversão
        const date = new Date(
          parseInt(year),
          parseInt(month) - 1,
          parseInt(day)
        );

        return {
          date: date.toLocaleDateString('pt-BR'),
          time: `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`,
        };
      };

      // Loading state
      if (isLoading) {
        return (
          <Card className={cn('w-full', className)}>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            </CardContent>
          </Card>
        );
      }

      // Error state
      if (error || !metrics) {
        return (
          <Alert variant="destructive" className={className}>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {error || 'Não foi possível carregar os dados'}
            </AlertDescription>
          </Alert>
        );
      }

      return (
        <>
          <Card className={cn('w-full', className)}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Métricas do Paciente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Filtros compartilhados */}
              <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Período:</span>
                </div>

                <div className="flex flex-col md:flex-row gap-2 flex-1">
                  <Select
                    value={periodFilter}
                    onValueChange={(value: PeriodFilter) =>
                      setPeriodFilter(value)
                    }
                  >
                    <SelectTrigger className="w-full md:w-48">
                      <SelectValue placeholder="Selecione o período" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os dados</SelectItem>
                      <SelectItem value="mes_atual">Mês atual</SelectItem>
                      <SelectItem value="mes_anterior">Mês anterior</SelectItem>
                      <SelectItem value="ultimos_30">
                        Últimos 30 dias
                      </SelectItem>
                      <SelectItem value="ultimos_60">
                        Últimos 60 dias
                      </SelectItem>
                      <SelectItem value="ultimos_90">
                        Últimos 90 dias
                      </SelectItem>
                      <SelectItem value="ultimo_ano">Último ano</SelectItem>
                      <SelectItem value="personalizado">
                        Período personalizado
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {periodFilter === 'personalizado' && (
                    <div className="flex gap-2">
                      <DatePicker
                        value={startDate}
                        onChange={setStartDate}
                        placeholder="Data inicial"
                        className="w-full md:w-40"
                      />
                      <DatePicker
                        value={endDate}
                        onChange={setEndDate}
                        placeholder="Data final"
                        className="w-full md:w-40"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Primeira linha: Valores financeiros */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {/* Total Agendado (anteriormente Total Faturado) */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-medium text-muted-foreground">
                      Total Agendado
                    </span>
                  </div>
                  <p className="text-xl font-bold">
                    {formatCurrency(metrics.total_agendado || 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Todas exceto Cancelado e Reagendado
                  </p>
                </div>

                {/* Total Faturado (novo - apenas status específicos) */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-purple-500" />
                    <span className="text-sm font-medium text-muted-foreground">
                      Total Faturado
                    </span>
                  </div>
                  <p className="text-xl font-bold text-purple-600">
                    {formatCurrency(metrics.total_faturado)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Cobrança Gerada + Pendente + Pago + Atrasado
                  </p>
                </div>

                {/* Valor Pago */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-muted-foreground">
                      Valor Pago
                    </span>
                  </div>
                  <p className="text-xl font-bold text-green-600">
                    {formatCurrency(metrics.valor_pago || 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">Status: Pago</p>
                </div>

                {/* Valor Pendente */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-yellow-500" />
                    <span className="text-sm font-medium text-muted-foreground">
                      Valor Pendente
                    </span>
                  </div>
                  <p className="text-xl font-bold text-yellow-600">
                    {formatCurrency(metrics.valor_pendente)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Status: Pendente
                  </p>
                </div>

                {/* Valor em Atraso */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    <span className="text-sm font-medium text-muted-foreground">
                      Valor em Atraso
                    </span>
                  </div>
                  <p className="text-xl font-bold text-red-600">
                    {formatCurrency(metrics.valor_em_atraso)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Status: Atrasado
                  </p>
                </div>

                {/* Valor Cancelado */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <X className="h-4 w-4 text-gray-500" />
                    <span className="text-sm font-medium text-muted-foreground">
                      Valor Cancelado
                    </span>
                  </div>
                  <p className="text-xl font-bold text-gray-600">
                    {formatCurrency(metrics.valor_cancelado || 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Status: Cancelado
                  </p>
                </div>
              </div>

              {/* Segunda linha: Consultas */}
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-medium text-muted-foreground">
                      Total de Consultas
                    </span>
                  </div>
                  <p className="text-2xl font-bold">
                    {metrics.total_consultas}
                  </p>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div className="flex items-center gap-1">
                      <span>✅ Finalizadas:</span>
                      <span className="font-semibold">
                        {metrics.consultas_finalizadas || 0}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span>📅 Agendadas:</span>
                      <span className="font-semibold">
                        {metrics.consultas_agendadas || 0}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span>❌ Canceladas:</span>
                      <span className="font-semibold">
                        {metrics.consultas_canceladas || 0}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Seção de Últimas Faturas - Ocultar para role profissional */}
              {userRole !== 'profissional' && (
                <div className="border-t pt-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    <h3 className="text-lg font-medium">Últimas Faturas</h3>
                    {faturas.length > 0 && (
                      <Badge variant="outline">{faturas.length} total</Badge>
                    )}
                  </div>

                  <FaturasList
                    faturas={faturas}
                    loading={isLoadingFaturas}
                    error={errorFaturas}
                    maxItems={2}
                    onFaturaClick={(fatura) => {
                      // Abrir link do ASAAS ao clicar na fatura
                      if (fatura.url_asaas) {
                        window.open(fatura.url_asaas, '_blank');
                      }
                    }}
                    onFaturaEdit={(fatura) => {
                      // Iniciar modo de edição da fatura
                      console.log('🔄 Iniciando edição da fatura:', fatura);
                      setEditingFatura(fatura);
                      setIsSelectionMode(true);
                      setChargeError(null);

                      // Buscar agendamentos da fatura para inicializar seleção
                      (async () => {
                        try {
                          // Usar a mesma view que a lista para garantir consistência
                          const { data, error } = await supabase
                            .from('vw_agendamentos_completos')
                            .select(
                              'id, valor_servico, status_pagamento_codigo, status_pagamento_nome'
                            )
                            .eq('fatura_id', fatura.id)
                            .eq('paciente_id', patientId);

                          if (error) throw error;

                          const agendamentosIds = data?.map((a) => a.id) || [];
                          console.log(
                            '📋 Agendamentos da fatura encontrados via view:',
                            {
                              faturaId: fatura.id,
                              agendamentosIds,
                              totalAgendamentos: agendamentosIds.length,
                              statusDetalhes: data?.map((a) => ({
                                id: a.id.substring(0, 8),
                                status: a.status_pagamento_nome,
                              })),
                            }
                          );

                          setSelectedConsultations(agendamentosIds);
                          setOriginalSelectedIds(agendamentosIds);

                          // Forçar recarregamento da lista para sincronizar
                          setTimeout(() => {
                            console.log(
                              '🔄 Estados atualizados - recarregando...'
                            );
                          }, 100);
                        } catch (error) {
                          console.error(
                            'Erro ao buscar agendamentos da fatura:',
                            error
                          );
                          setChargeError(
                            'Erro ao carregar agendamentos da fatura'
                          );
                        }
                      })();
                    }}
                    onFaturaDelete={(fatura) => {
                      // Abrir modal de confirmação para exclusão
                      setFaturaToDelete(fatura);
                    }}
                    onEmitirNfe={handleEmitirNfe}
                    onReceivePayment={handleReceivePayment}
                    userRole={user?.pessoa?.role}
                    isEmitingNfe={isEmitingNfe}
                    isReceivingPayment={isReceivingPayment}
                    showCard={false}
                    showVerMais={false}
                  />
                </div>
              )}

              {/* Seção de Lista de Consultas */}
              <div className="space-y-4 border-t pt-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Calendar className="h-5 w-5 flex-shrink-0" />
                    <h3 className="text-base md:text-lg font-medium">
                      Lista de Consultas
                    </h3>
                    {totalCount > 0 && (
                      <Badge variant="outline">{totalCount} total</Badge>
                    )}
                  </div>

                  {/* Botão de seleção para cobrança - apenas para admin/secretaria */}
                  {(canGenerateCharge || editingFatura) &&
                    selectableConsultations.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        {isSelectionMode && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={selectAllConsultations}
                              disabled={
                                selectedConsultations.length ===
                                selectableConsultations.length
                              }
                            >
                              Todas
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={clearSelection}
                              disabled={selectedConsultations.length === 0}
                            >
                              Limpar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={toggleSelectionMode}
                              className="gap-1"
                            >
                              <X className="h-4 w-4" />
                              <span className="hidden sm:inline">Cancelar</span>
                            </Button>
                          </>
                        )}

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant={
                                  selectedCount > 0 ? 'default' : 'outline'
                                }
                                size="sm"
                                onClick={
                                  selectedCount > 0
                                    ? editingFatura
                                      ? handleUpdateFatura
                                      : handleGenerateCharge
                                    : toggleSelectionMode
                                }
                                disabled={
                                  isGeneratingCharge ||
                                  (selectedCount > 0 &&
                                    asaasValidation !== null &&
                                    !asaasValidation.isValid &&
                                    !editingFatura) ||
                                  undefined
                                }
                                className={
                                  selectedCount > 0 ? 'respira-gradient' : ''
                                }
                              >
                                <CreditCard className="h-4 w-4 flex-shrink-0" />
                                <span className="ml-1.5 sm:ml-2">
                                  {isGeneratingCharge ? (
                                    editingFatura ? (
                                      <>
                                        <span className="sm:hidden">
                                          Atualizando...
                                        </span>
                                        <span className="hidden sm:inline">
                                          Atualizando fatura...
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <span className="sm:hidden">
                                          Gerando...
                                        </span>
                                        <span className="hidden sm:inline">
                                          Gerando cobrança...
                                        </span>
                                      </>
                                    )
                                  ) : selectedCount > 0 ? (
                                    editingFatura ? (
                                      <>
                                        <span className="sm:hidden">
                                          Atualizar ({selectedCount})
                                        </span>
                                        <span className="hidden sm:inline">
                                          Atualizar Fatura com {selectedCount}{' '}
                                          consulta{selectedCount > 1 ? 's' : ''}
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <span className="sm:hidden">
                                          Gerar ({selectedCount})
                                        </span>
                                        <span className="hidden sm:inline">
                                          Gerar cobrança de {selectedCount}{' '}
                                          consulta
                                          {selectedCount > 1 ? 's' : ''}
                                        </span>
                                      </>
                                    )
                                  ) : editingFatura ? (
                                    <>
                                      <span className="sm:hidden">Editar</span>
                                      <span className="hidden sm:inline">
                                        Editar consultas da fatura
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      <span className="sm:hidden">
                                        Selecionar
                                      </span>
                                      <span className="hidden sm:inline">
                                        Escolher consultas para gerar cobrança
                                      </span>
                                    </>
                                  )}
                                </span>
                              </Button>
                            </TooltipTrigger>
                            {selectedCount > 0 &&
                              asaasValidation &&
                              !asaasValidation.isValid &&
                              !editingFatura && (
                                <TooltipContent className="max-w-xs">
                                  <div className="space-y-2">
                                    <p className="font-semibold">
                                      Não é possível gerar cobrança:
                                    </p>

                                    {asaasValidation.missingFields.length >
                                      0 && (
                                      <div>
                                        <p className="text-sm font-medium">
                                          Campos obrigatórios faltando:
                                        </p>
                                        <ul className="text-sm list-disc list-inside">
                                          {asaasValidation.missingFields.map(
                                            (field) => (
                                              <li key={field}>{field}</li>
                                            )
                                          )}
                                        </ul>
                                      </div>
                                    )}

                                    {asaasValidation.warnings.length > 0 && (
                                      <div>
                                        <p className="text-sm font-medium">
                                          Avisos:
                                        </p>
                                        <ul className="text-sm list-disc list-inside">
                                          {asaasValidation.warnings.map(
                                            (warning) => (
                                              <li key={warning}>{warning}</li>
                                            )
                                          )}
                                        </ul>
                                      </div>
                                    )}

                                    <p className="text-xs text-muted-foreground mt-2">
                                      Complete os dados do responsável
                                      financeiro antes de gerar a cobrança.
                                    </p>
                                  </div>
                                </TooltipContent>
                              )}
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    )}

                  {/* Exibir erro de cobrança se houver */}
                  {chargeError && (
                    <Alert className="mt-4">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Erro ao gerar cobrança:</strong> {chargeError}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setChargeError(null)}
                          className="ml-2 h-auto p-1"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>

                {consultations.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Nenhuma consulta encontrada no período</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {consultations.map((consultation) => {
                      const { date, time } = formatDateTime(
                        consultation.data_hora
                      );
                      // Lógica de selecionabilidade considerando modo de edição
                      const isFromCurrentFatura =
                        editingFatura &&
                        originalSelectedIds.includes(consultation.id);
                      const isPaid =
                        consultation.status_pagamento?.toLowerCase() === 'pago';
                      const hasNoFatura =
                        !consultation.fatura_id &&
                        !consultation.id_pagamento_externo;

                      // ✅ VALIDAÇÃO 1: Verificar se consulta está cancelada
                      // AI dev note: Usar type assertion pois status_consulta_codigo vem da view mas não está na interface base
                      const isCancelled =
                        (
                          consultation as RecentConsultation & {
                            status_consulta_codigo?: string;
                          }
                        ).status_consulta_codigo === 'cancelado';

                      // ✅ VALIDAÇÃO 2: Verificar se consulta tem valor zero
                      const hasZeroValue =
                        Number(consultation.valor_servico || 0) === 0;

                      // ✅ VALIDAÇÃO 3: Verificar se é da mesma empresa (quando há empresa ativa)
                      const consultaEmpresa = (
                        consultation as RecentConsultation & {
                          empresa_fatura_id?: string;
                        }
                      ).empresa_fatura_id;
                      const matchesEmpresa =
                        !empresaAtiva || consultaEmpresa === empresaAtiva;

                      // Status editáveis em faturas (não pagos)
                      const editableStatuses = [
                        'pendente',
                        'atrasado',
                        'cobranca_gerada',
                      ];
                      const currentStatus =
                        consultation.status_pagamento?.toLowerCase() || '';

                      const isSelectable =
                        !isPaid && // ✅ NÃO PODE ESTAR PAGA
                        !isCancelled && // ✅ NÃO PODE ESTAR CANCELADA
                        !hasZeroValue && // ✅ NÃO PODE TER VALOR ZERO
                        matchesEmpresa && // ✅ DEVE SER DA MESMA EMPRESA
                        // Modo normal: apenas consultas pendentes sem fatura
                        ((!editingFatura &&
                          currentStatus === 'pendente' &&
                          hasNoFatura) ||
                          // Modo edição: APENAS consultas da própria fatura OU pendentes sem fatura alguma
                          (editingFatura &&
                            ((isFromCurrentFatura &&
                              editableStatuses.includes(currentStatus)) ||
                              (currentStatus === 'pendente' && hasNoFatura))));

                      // Log informativo sobre consultas bloqueadas (para debug)
                      if (
                        isSelectionMode &&
                        !isSelectable &&
                        process.env.NODE_ENV === 'development'
                      ) {
                        const reasons = [];
                        if (isPaid) reasons.push('PAGA');
                        if (isCancelled) reasons.push('CANCELADA');
                        if (hasZeroValue) reasons.push('VALOR_ZERO');
                        if (!matchesEmpresa) reasons.push('EMPRESA_DIFERENTE');
                        if (consultation.fatura_id)
                          reasons.push('JÁ_TEM_FATURA');

                        console.log(
                          `🚫 Consulta bloqueada ${consultation.id.substring(0, 8)} - ${consultation.servico_nome}:`,
                          reasons.join(', ')
                        );
                      }

                      // Debug log para identificar problemas
                      if (
                        editingFatura &&
                        process.env.NODE_ENV === 'development'
                      ) {
                        console.log(
                          `🔍 Debug consulta ${consultation.id.substring(0, 8)}:`,
                          {
                            isFromCurrentFatura,
                            isPaid,
                            isCancelled,
                            hasZeroValue,
                            matchesEmpresa,
                            consultaEmpresa,
                            empresaAtiva,
                            currentStatus,
                            hasNoFatura,
                            hasIdPagamento: !!consultation.id_pagamento_externo,
                            hasFaturaId: !!consultation.fatura_id,
                            isSelectable,
                            editingFaturaId: editingFatura?.id.substring(0, 8),
                          }
                        );
                      }
                      const hasAsaasPayment = getAsaasPaymentUrl(
                        consultation.id_pagamento_externo || ''
                      );
                      const isSelected = selectedConsultations.includes(
                        consultation.id
                      );

                      return (
                        <div
                          key={consultation.id}
                          className={cn(
                            'flex items-start gap-4 p-4 border rounded-lg transition-colors',
                            !isSelectionMode &&
                              'hover:bg-muted/50 cursor-pointer',
                            isSelectionMode && !isSelectable && 'opacity-50',
                            isSelected && 'ring-2 ring-primary bg-primary/5'
                          )}
                          onClick={() => {
                            if (isSelectionMode && isSelectable) {
                              toggleConsultationSelection(consultation.id);
                            } else if (!isSelectionMode) {
                              onConsultationClick?.(consultation.id);
                            }
                          }}
                        >
                          {/* Checkbox para modo de seleção */}
                          {isSelectionMode && (
                            <div className="flex items-center pt-2">
                              <Checkbox
                                checked={isSelected}
                                disabled={!isSelectable}
                                onCheckedChange={() => {
                                  if (isSelectable) {
                                    toggleConsultationSelection(
                                      consultation.id
                                    );
                                  }
                                }}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          )}

                          {/* Ícone de data */}
                          <div className="flex flex-col items-center justify-center w-12 h-12 bg-blue-100 rounded-lg">
                            <Calendar className="h-5 w-5 text-blue-600" />
                            <span className="text-xs font-medium text-blue-600">
                              {date.split('/')[0]}
                            </span>
                          </div>

                          {/* Detalhes da consulta */}
                          <div className="flex-1 space-y-2">
                            <div className="flex items-start justify-between">
                              <div>
                                <h4 className="font-medium text-sm">
                                  {consultation.servico_nome}
                                </h4>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>
                                    {date} às {time}
                                  </span>
                                  {consultation.local_nome && (
                                    <>
                                      <span>•</span>
                                      <div className="flex items-center gap-1">
                                        <MapPin className="h-3 w-3" />
                                        <span>{consultation.local_nome}</span>
                                      </div>
                                    </>
                                  )}
                                </div>
                                <div className="flex flex-col gap-1 mt-1">
                                  {consultation.profissional_nome && (
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <User className="h-3 w-3" />
                                      <span>
                                        {consultation.profissional_nome}
                                      </span>
                                    </div>
                                  )}
                                  {consultation.empresa_fatura_nome && (
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <Building2 className="h-3 w-3" />
                                      <span>
                                        {consultation.empresa_fatura_nome}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="text-right">
                                <div className="text-sm font-medium">
                                  {formatCurrency(
                                    getDisplayValue(consultation)
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Status badges */}
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant="outline"
                                className="text-xs"
                                style={{
                                  borderColor: consultation.status_cor_consulta,
                                  color: consultation.status_cor_consulta,
                                }}
                              >
                                {consultation.status_consulta}
                              </Badge>
                              {/* Badge condicional: "Gerar Cobrança" ou Status real */}
                              {!hasAsaasPayment &&
                              isSelectable &&
                              canGenerateCharge ? (
                                <Badge
                                  variant="outline"
                                  className="text-xs cursor-pointer hover:bg-blue-50 transition-colors bg-blue-50 text-blue-700 border-blue-200"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!isSelectionMode) {
                                      setIsSelectionMode(true);
                                    }
                                    setSelectedConsultations([consultation.id]);
                                  }}
                                  title="Clique para gerar cobrança desta consulta"
                                >
                                  Gerar Cobrança
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="text-xs"
                                  style={{
                                    borderColor:
                                      consultation.status_cor_pagamento,
                                    color: consultation.status_cor_pagamento,
                                  }}
                                >
                                  {consultation.status_pagamento}
                                </Badge>
                              )}

                              {/* Badge de cobrança ASAAS - clicável */}
                              {hasAsaasPayment && (
                                <Badge
                                  variant="outline"
                                  className="text-xs px-1.5 py-0.5 h-5 bg-green-50 text-green-800 border-green-200 cursor-pointer hover:bg-green-100 transition-colors flex items-center gap-1"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (hasAsaasPayment) {
                                      window.open(hasAsaasPayment, '_blank');
                                    }
                                  }}
                                  title="Ver cobrança no ASAAS"
                                >
                                  <CreditCard className="h-3 w-3" />
                                  Cobrado no ASAAS
                                  <ExternalLink className="h-2.5 w-2.5" />
                                </Badge>
                              )}

                              {/* AI dev note: Badge de evolução - exibir quando não tem evolução e não está cancelado */}
                              {consultation.possui_evolucao === 'não' &&
                                consultation.status_consulta.toLowerCase() !==
                                  'cancelado' && (
                                  <Badge
                                    variant="outline"
                                    className="text-xs px-1.5 py-0.5 h-5 bg-yellow-50 text-yellow-800 border-yellow-200"
                                  >
                                    Evoluir Paciente
                                  </Badge>
                                )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Ver mais */}
                    {totalCount > consultations.length && (
                      <div className="text-center pt-4 border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowAll(!showAll);
                          }}
                        >
                          {showAll ? (
                            <>
                              Ver menos
                              <ChevronRight className="h-4 w-4 ml-1 rotate-90" />
                            </>
                          ) : (
                            <>
                              Ver todas as {totalCount} consultas
                              <ChevronRight className="h-4 w-4 ml-1" />
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Modal de confirmação para exclusão de fatura */}
          <AlertDialog
            open={!!faturaToDelete}
            onOpenChange={() => setFaturaToDelete(null)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir Fatura</AlertDialogTitle>
                <AlertDialogDescription>
                  Tem certeza que deseja excluir esta fatura de{' '}
                  <strong>
                    {faturaToDelete?.valor_total
                      ? new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        }).format(faturaToDelete.valor_total)
                      : 'R$ 0,00'}
                  </strong>
                  ?
                  <br />
                  <br />
                  Esta ação irá:
                  <ul className="list-disc list-inside mt-2 text-sm">
                    <li>Cancelar a cobrança no ASAAS</li>
                    <li>Desvincular os agendamentos</li>
                    <li>Marcar a fatura como excluída</li>
                  </ul>
                  <br />
                  <strong>Esta ação não pode ser desfeita.</strong>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeletingFatura}>
                  Cancelar
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteFatura}
                  disabled={isDeletingFatura}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {isDeletingFatura ? 'Excluindo...' : 'Sim, excluir fatura'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      );
    }
  );

PatientMetricsWithConsultations.displayName = 'PatientMetricsWithConsultations';
