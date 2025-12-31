import React, { useState, useCallback, useMemo } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Calendar,
  MapPin,
  Building2,
  AlertCircle,
  Clock,
  Phone,
} from 'lucide-react';
import { format, differenceInHours } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Button } from '@/components/primitives/button';
import { parseSupabaseDatetime } from '@/lib/calendar-mappers';
import { Label } from '@/components/primitives/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { ScrollArea } from '@/components/primitives/scroll-area';
import { ProgressIndicator } from '@/components/composed/ProgressIndicator';
import { SharedScheduleWhatsAppValidationStep } from '@/components/composed/SharedScheduleWhatsAppValidationStep';
import { AccessDeniedMessage } from '@/components/composed/AccessDeniedMessage';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/primitives/use-toast';
import {
  selectSlotAndCreateAppointment,
  checkExistingAppointment,
  rescheduleAppointment,
} from '@/lib/shared-schedule-api';
import { supabase } from '@/lib/supabase';
import type {
  AgendaCompartilhadaCompleta,
  WizardDataSelecao,
} from '@/types/shared-schedule';
import type { ExistingUserFullData } from '@/components/composed/WhatsAppValidationStep';

// AI dev note: SharedScheduleSelectorWizard - Domain
// Wizard público para responsáveis selecionarem horários
// Inclui validação WhatsApp obrigatória + steps dinâmicos (skip se apenas 1 opção)
// SEM exibir valor e duração dos serviços conforme solicitado

// AI dev note: REGRAS DE ANTECEDÊNCIA
// - Agendamento: mínimo 8 horas de antecedência
// - Alteração/Cancelamento: mínimo 24 horas de antecedência
const HORAS_MINIMAS_AGENDAMENTO = 8;
const HORAS_MINIMAS_ALTERACAO = 24;

// AI dev note: Função utilitária para verificar se slot está dentro do prazo mínimo
const isSlotWithinMinimumHours = (
  slotDataHora: string,
  horasMinimas: number
): boolean => {
  const now = new Date();
  // Parse do horário do slot (formato: 2025-01-02T14:00:00+00:00 ou similar)
  const slotDate = new Date(slotDataHora);
  const horasAteSlot = differenceInHours(slotDate, now);
  return horasAteSlot < horasMinimas;
};

export interface SharedScheduleSelectorWizardProps {
  agenda: AgendaCompartilhadaCompleta;
  onSuccess?: (agendamentoId: string) => void;
  className?: string;
}

type Step =
  | 'whatsapp-validation'
  | 'access-denied'
  | 'select-patient'
  | 'select-service'
  | 'select-location'
  | 'select-company'
  | 'select-slot'
  | 'confirmation'
  | 'success';

export const SharedScheduleSelectorWizard =
  React.memo<SharedScheduleSelectorWizardProps>(
    ({ agenda, onSuccess, className }) => {
      const { toast } = useToast();
      const [currentStep, setCurrentStep] = useState<Step>(
        'whatsapp-validation'
      );
      const [isSubmitting, setIsSubmitting] = useState(false);

      // Dados do responsável validado
      const [responsavelId, setResponsavelId] = useState<string>('');
      const [responsavelNome, setResponsavelNome] = useState<string>('');
      const [responsavelWhatsapp, setResponsavelWhatsapp] = useState<number>(0);
      const [pacientesDoResponsavel, setPacientesDoResponsavel] = useState<
        Array<{ id: string; nome: string }>
      >([]);

      // Dados da seleção
      const [wizardData, setWizardData] = useState<Partial<WizardDataSelecao>>(
        {}
      );

      // Estados de reagendamento
      const [isRescheduling, setIsRescheduling] = useState(false);
      const [existingAppointmentId, setExistingAppointmentId] = useState<
        string | null
      >(null);
      const [oldSlotId, setOldSlotId] = useState<string | null>(null);
      const [showRescheduleDialog, setShowRescheduleDialog] = useState(false);
      const [existingAppointmentData, setExistingAppointmentData] = useState<{
        data_hora: string;
        tipo_servico_nome: string;
        local_nome: string | null;
      } | null>(null);

      // Carregar pacientes do responsável
      const loadPacientes = useCallback(async (responsavelId: string) => {
        try {
          const { data, error } = await supabase
            .from('pessoa_responsaveis')
            .select(
              `
            paciente:pessoas!pessoa_responsaveis_id_pessoa_fkey (
              id,
              nome,
              ativo
            )
          `
            )
            .eq('id_responsavel', responsavelId)
            .eq('ativo', true);

          if (error) throw error;

          const pacientes = (data || [])
            .map((item: unknown) => (item as { paciente?: unknown })?.paciente)
            .filter(
              (p: unknown): p is { id: string; nome: string; ativo: boolean } =>
                !!p &&
                typeof (p as { ativo?: boolean }).ativo === 'boolean' &&
                (p as { ativo: boolean }).ativo
            )
            .map((p) => ({ id: p.id, nome: p.nome }));

          setPacientesDoResponsavel(pacientes);
          return pacientes;
        } catch (error) {
          console.error('Erro ao carregar pacientes:', error);
          return [];
        }
      }, []);

      // Handler: WhatsApp validado
      const handleWhatsAppValidated = useCallback(
        async (personId: string, userData?: ExistingUserFullData) => {
          setResponsavelId(personId);
          setResponsavelNome(userData?.nome || '');
          setResponsavelWhatsapp(
            userData?.telefone ? Number(userData.telefone) : 0
          );

          // Carregar pacientes
          const pacientes = await loadPacientes(personId);

          if (pacientes.length === 0) {
            toast({
              title: 'Nenhum paciente cadastrado',
              description: 'Entre em contato para cadastrar pacientes',
              variant: 'destructive',
            });
            setCurrentStep('access-denied');
            return;
          }

          setCurrentStep('select-patient');
        },
        [loadPacientes, toast]
      );

      // Handler: Responsável NÃO cadastrado
      const handleAccessDenied = useCallback(() => {
        setCurrentStep('access-denied');
      }, []);

      // Determinar próximo step (skip se apenas 1 opção)
      const getNextStep = useCallback(
        (fromStep: Step): Step => {
          if (fromStep === 'select-patient') {
            // Se apenas 1 serviço, skip
            if (agenda.servicos.length === 1) {
              setWizardData((prev) => ({
                ...prev,
                tipo_servico_id: agenda.servicos[0].id,
                tipo_servico_nome: agenda.servicos[0].nome,
              }));
              return getNextStep('select-service');
            }
            return 'select-service';
          }

          if (fromStep === 'select-service') {
            // Se apenas 1 local, skip
            if (agenda.locais.length === 1) {
              setWizardData((prev) => ({
                ...prev,
                local_id: agenda.locais[0].id,
                local_nome: agenda.locais[0].nome,
              }));
              return getNextStep('select-location');
            }
            return 'select-location';
          }

          if (fromStep === 'select-location') {
            // Se apenas 1 empresa, skip
            if (agenda.empresas.length === 1) {
              setWizardData((prev) => ({
                ...prev,
                empresa_id: agenda.empresas[0].id,
                empresa_nome: agenda.empresas[0].razao_social,
              }));
              return getNextStep('select-company');
            }
            return 'select-company';
          }

          if (fromStep === 'select-company') {
            return 'select-slot';
          }

          if (fromStep === 'select-slot') {
            return 'confirmation';
          }

          return fromStep;
        },
        [agenda]
      );

      const handleNext = useCallback(async () => {
        // Validações por step
        if (currentStep === 'select-patient') {
          if (!wizardData.paciente_id) {
            toast({
              title: 'Selecione um paciente',
              variant: 'destructive',
            });
            return;
          }

          // AI dev note: Verificar se paciente já tem agendamento nesta agenda
          try {
            const checkResult = await checkExistingAppointment(
              agenda.id,
              wizardData.paciente_id
            );

            if (checkResult.success && checkResult.data?.hasAppointment) {
              const existing = checkResult.data.existingAppointment!;
              setExistingAppointmentId(existing.agendamento_id);
              setOldSlotId(existing.slot_id);
              setExistingAppointmentData({
                data_hora: existing.data_hora,
                tipo_servico_nome: existing.tipo_servico_nome,
                local_nome: existing.local_nome,
              });
              setShowRescheduleDialog(true);
              return; // Não avança até decidir
            }
          } catch (error) {
            console.error('Erro ao verificar agendamento:', error);
            // Continua normalmente em caso de erro na verificação
          }

          setCurrentStep(getNextStep('select-patient'));
        } else if (currentStep === 'select-service') {
          if (!wizardData.tipo_servico_id) {
            toast({
              title: 'Selecione um serviço',
              variant: 'destructive',
            });
            return;
          }
          setCurrentStep(getNextStep('select-service'));
        } else if (currentStep === 'select-location') {
          if (!wizardData.local_id) {
            toast({
              title: 'Selecione um local',
              variant: 'destructive',
            });
            return;
          }
          setCurrentStep(getNextStep('select-location'));
        } else if (currentStep === 'select-company') {
          if (!wizardData.empresa_id) {
            toast({
              title: 'Selecione uma empresa',
              variant: 'destructive',
            });
            return;
          }
          setCurrentStep(getNextStep('select-company'));
        } else if (currentStep === 'select-slot') {
          if (!wizardData.slot_id) {
            toast({
              title: 'Selecione um horário',
              variant: 'destructive',
            });
            return;
          }
          setCurrentStep('confirmation');
        } else if (currentStep === 'confirmation') {
          handleConfirm();
        }
      }, [currentStep, wizardData, toast, getNextStep, agenda.id]);

      const handleBack = useCallback(() => {
        if (currentStep === 'select-patient') {
          setCurrentStep('whatsapp-validation');
        } else if (currentStep === 'select-service') {
          setCurrentStep('select-patient');
        } else if (currentStep === 'select-location') {
          // Voltar para service ou patient (dependendo se skippou)
          if (agenda.servicos.length === 1) {
            setCurrentStep('select-patient');
          } else {
            setCurrentStep('select-service');
          }
        } else if (currentStep === 'select-company') {
          if (agenda.locais.length === 1) {
            if (agenda.servicos.length === 1) {
              setCurrentStep('select-patient');
            } else {
              setCurrentStep('select-service');
            }
          } else {
            setCurrentStep('select-location');
          }
        } else if (currentStep === 'select-slot') {
          if (agenda.empresas.length === 1) {
            if (agenda.locais.length === 1) {
              if (agenda.servicos.length === 1) {
                setCurrentStep('select-patient');
              } else {
                setCurrentStep('select-service');
              }
            } else {
              setCurrentStep('select-location');
            }
          } else {
            setCurrentStep('select-company');
          }
        } else if (currentStep === 'confirmation') {
          setCurrentStep('select-slot');
        }
      }, [currentStep, agenda]);

      // Confirmar e criar/reagendar agendamento
      const handleConfirm = useCallback(async () => {
        try {
          setIsSubmitting(true);

          if (
            !wizardData.paciente_id ||
            !wizardData.tipo_servico_id ||
            !wizardData.empresa_id ||
            !wizardData.slot_id
          ) {
            throw new Error('Dados incompletos');
          }

          // AI dev note: REAGENDAMENTO - Editar agendamento existente
          if (isRescheduling && existingAppointmentId && oldSlotId) {
            console.log('🔄 Reagendando agendamento existente');

            const rescheduleResult = await rescheduleAppointment(
              agenda.id,
              existingAppointmentId,
              oldSlotId,
              wizardData.slot_id,
              wizardData.slot_data_hora!
            );

            if (!rescheduleResult.success) {
              toast({
                title: 'Erro ao reagendar',
                description:
                  rescheduleResult.error || 'Este horário não está disponível',
                variant: 'destructive',
              });
              setCurrentStep('select-slot');
              return;
            }

            setCurrentStep('success');
            toast({
              title: 'Reagendamento confirmado!',
              description: 'Seu horário foi alterado com sucesso',
            });

            if (onSuccess) {
              onSuccess(existingAppointmentId);
            }
            return;
          }

          // NOVO AGENDAMENTO
          console.log('🎯 Criando novo agendamento');

          // Buscar status "agendado"
          const { data: statusAgendado } = await supabase
            .from('consulta_status')
            .select('id')
            .eq('codigo', 'agendado')
            .single();

          // Buscar status "pendente"
          const { data: statusPendente } = await supabase
            .from('pagamento_status')
            .select('id')
            .eq('codigo', 'pendente')
            .single();

          if (!statusAgendado || !statusPendente) {
            throw new Error('Status não encontrados no sistema');
          }

          const result = await selectSlotAndCreateAppointment(
            {
              agenda_id: agenda.id,
              slot_id: wizardData.slot_id,
              paciente_id: wizardData.paciente_id,
              responsavel_id: responsavelId,
              responsavel_whatsapp: responsavelWhatsapp,
              tipo_servico_id: wizardData.tipo_servico_id,
              local_id: wizardData.local_id || null,
              empresa_id: wizardData.empresa_id,
            },
            statusAgendado.id,
            statusPendente.id
          );

          if (!result.success || !result.data) {
            // Erro ao reservar slot - pode ser race condition ou conflito de horário
            toast({
              title: 'Horário não disponível',
              description:
                result.error ||
                'Este horário já foi reservado. Por favor, escolha outro horário disponível.',
              variant: 'destructive',
            });

            // VOLTAR PARA A ETAPA DE SELEÇÃO DE SLOT para escolher outro
            setCurrentStep('select-slot');

            // RECARREGAR SLOTS DISPONÍVEIS (removendo o que já foi reservado)
            try {
              const { data: slotsAtualizados, error: slotsError } =
                await supabase
                  .from('agenda_slots')
                  .select('*')
                  .eq('agenda_id', agenda.id)
                  .eq('disponivel', true)
                  .order('data_hora', { ascending: true });

              if (slotsError) throw slotsError;

              console.log(
                '🔄 [SharedScheduleSelectorWizard] Slots atualizados após conflito:',
                slotsAtualizados?.length
              );

              // Atualizar a lista de slots no estado (se necessário)
              // Nota: A lista será atualizada automaticamente na próxima renderização
            } catch (reloadError) {
              console.error('Erro ao recarregar slots:', reloadError);
            }

            return; // Não continuar com o fluxo
          }

          setCurrentStep('success');
          toast({
            title: 'Agendamento confirmado!',
            description: 'Você receberá uma confirmação em breve',
          });

          if (onSuccess) {
            onSuccess(result.data.agendamento_id);
          }
        } catch (error) {
          console.error('Erro ao confirmar agendamento:', error);
          toast({
            title: 'Erro ao confirmar agendamento',
            description:
              error instanceof Error ? error.message : 'Tente novamente',
            variant: 'destructive',
          });
        } finally {
          setIsSubmitting(false);
        }
      }, [
        wizardData,
        agenda,
        responsavelId,
        responsavelWhatsapp,
        toast,
        onSuccess,
        isRescheduling,
        existingAppointmentId,
        oldSlotId,
      ]);

      // Progress (calcular dinamicamente baseado nos skips)
      const { stepNumber, totalSteps } = useMemo(() => {
        const steps: Step[] = ['whatsapp-validation', 'select-patient'];

        if (agenda.servicos.length > 1) steps.push('select-service');
        if (agenda.locais.length > 1) steps.push('select-location');
        if (agenda.empresas.length > 1) steps.push('select-company');

        steps.push('select-slot', 'confirmation');

        const currentIndex = steps.indexOf(currentStep);
        return {
          stepNumber: currentIndex + 1,
          totalSteps: steps.length,
        };
      }, [currentStep, agenda]);

      // Renderizar step atual
      const renderStep = () => {
        switch (currentStep) {
          case 'whatsapp-validation':
            return (
              <SharedScheduleWhatsAppValidationStep
                onValidated={handleWhatsAppValidated}
                onAccessDenied={handleAccessDenied}
              />
            );

          case 'access-denied':
            return <AccessDeniedMessage />;

          case 'select-patient':
            return (
              <div className="space-y-4">
                <div className="text-center space-y-2">
                  <h3 className="text-lg font-semibold">
                    Bem-vindo, {responsavelNome.split(' ')[0]}! 👋
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Selecione o paciente para este agendamento
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="paciente">Paciente *</Label>
                  <Select
                    value={wizardData.paciente_id || ''}
                    onValueChange={(value) => {
                      const paciente = pacientesDoResponsavel.find(
                        (p) => p.id === value
                      );
                      setWizardData((prev) => ({
                        ...prev,
                        paciente_id: value,
                        paciente_nome: paciente?.nome || '',
                      }));
                    }}
                  >
                    <SelectTrigger id="paciente">
                      <SelectValue placeholder="Selecione o paciente" />
                    </SelectTrigger>
                    <SelectContent>
                      {pacientesDoResponsavel.map((paciente) => (
                        <SelectItem key={paciente.id} value={paciente.id}>
                          {paciente.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );

          case 'select-service':
            return (
              <div className="space-y-4">
                <div className="text-center space-y-2">
                  <h3 className="text-lg font-semibold">Escolha o Serviço</h3>
                  <p className="text-sm text-muted-foreground">
                    Selecione o tipo de atendimento desejado
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {agenda.servicos.map((servico) => (
                    <Card
                      key={servico.id}
                      className={cn(
                        'cursor-pointer transition-all hover:shadow-md',
                        wizardData.tipo_servico_id === servico.id &&
                          'ring-2 ring-primary bg-primary/5'
                      )}
                      onClick={() => {
                        setWizardData((prev) => ({
                          ...prev,
                          tipo_servico_id: servico.id,
                          tipo_servico_nome: servico.nome,
                        }));
                      }}
                    >
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">
                          {servico.nome}
                        </CardTitle>
                        {servico.descricao && (
                          <CardDescription className="text-xs">
                            {servico.descricao}
                          </CardDescription>
                        )}
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </div>
            );

          case 'select-location':
            return (
              <div className="space-y-4">
                <div className="text-center space-y-2">
                  <h3 className="text-lg font-semibold">Escolha o Local</h3>
                  <p className="text-sm text-muted-foreground">
                    Onde prefere realizar o atendimento?
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {agenda.locais.map((local) => (
                    <Card
                      key={local.id}
                      className={cn(
                        'cursor-pointer transition-all hover:shadow-md',
                        wizardData.local_id === local.id &&
                          'ring-2 ring-primary bg-primary/5'
                      )}
                      onClick={() => {
                        setWizardData((prev) => ({
                          ...prev,
                          local_id: local.id,
                          local_nome: local.nome,
                        }));
                      }}
                    >
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <MapPin className="w-4 h-4" />
                          {local.nome}
                        </CardTitle>
                        <CardDescription className="text-xs capitalize">
                          {local.tipo_local}
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </div>
            );

          case 'select-company':
            return (
              <div className="space-y-4">
                <div className="text-center space-y-2">
                  <h3 className="text-lg font-semibold">Escolha a Empresa</h3>
                  <p className="text-sm text-muted-foreground">
                    Selecione a empresa para emissão da NFe
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {agenda.empresas.map((empresa) => (
                    <Card
                      key={empresa.id}
                      className={cn(
                        'cursor-pointer transition-all hover:shadow-md',
                        wizardData.empresa_id === empresa.id &&
                          'ring-2 ring-primary bg-primary/5'
                      )}
                      onClick={() => {
                        setWizardData((prev) => ({
                          ...prev,
                          empresa_id: empresa.id,
                          empresa_nome:
                            empresa.nome_fantasia || empresa.razao_social,
                        }));
                      }}
                    >
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Building2 className="w-4 h-4" />
                          {empresa.nome_fantasia || empresa.razao_social}
                        </CardTitle>
                        {empresa.cnpj && (
                          <CardDescription className="text-xs">
                            CNPJ: {empresa.cnpj}
                          </CardDescription>
                        )}
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </div>
            );

          case 'select-slot': {
            // AI dev note: REGRA DE 8 HORAS - Filtrar slots que estão muito próximos
            const slotsDisponiveis = agenda.slots.filter(
              (slot) =>
                !isSlotWithinMinimumHours(
                  slot.data_hora,
                  HORAS_MINIMAS_AGENDAMENTO
                )
            );

            // Agrupar slots por data
            // AI dev note: Usar parseSupabaseDatetime para manter horário exato (sem conversão de timezone)
            const grupos: Record<string, typeof agenda.slots> = {};
            slotsDisponiveis.forEach((slot) => {
              const date = parseSupabaseDatetime(slot.data_hora);
              const key = format(date, 'yyyy-MM-dd');
              if (!grupos[key]) grupos[key] = [];
              grupos[key].push(slot);
            });
            const slotsPorData = grupos;

            // AI dev note: Mensagem quando não há slots disponíveis após filtro de 8h
            if (slotsDisponiveis.length === 0) {
              return (
                <div className="space-y-6 text-center py-8">
                  <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <Clock className="w-8 h-8 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold">
                      Nenhum horário disponível
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto">
                      Todos os horários estão com menos de{' '}
                      {HORAS_MINIMAS_AGENDAMENTO} horas de antecedência.
                      <br />
                      <br />
                      <span className="font-medium">
                        Para agendar com menos de {HORAS_MINIMAS_AGENDAMENTO}h
                        de antecedência, entre em contato com a recepção.
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-primary">
                    <Phone className="w-4 h-4" />
                    <span className="font-medium">Contate a recepção</span>
                  </div>
                </div>
              );
            }

            return (
              <div className="space-y-4">
                <div className="text-center space-y-2">
                  <h3 className="text-lg font-semibold">Escolha o Horário</h3>
                  <p className="text-sm text-muted-foreground">
                    {slotsDisponiveis.length} horário
                    {slotsDisponiveis.length !== 1 ? 's' : ''} disponíve
                    {slotsDisponiveis.length !== 1 ? 'is' : 'l'}
                  </p>
                </div>

                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-4">
                    {Object.entries(slotsPorData)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([dateKey, slots]) => {
                        // dateKey está no formato yyyy-MM-dd, criar Date simples
                        const [year, month, day] = dateKey
                          .split('-')
                          .map(Number);
                        const date = new Date(year, month - 1, day);
                        const diaFormatado = format(
                          date,
                          "EEEE, dd 'de' MMMM",
                          {
                            locale: ptBR,
                          }
                        );

                        return (
                          <div key={dateKey} className="space-y-2">
                            <p className="text-sm font-medium capitalize">
                              {diaFormatado}
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {slots
                                .sort((a, b) =>
                                  a.data_hora.localeCompare(b.data_hora)
                                )
                                .map((slot) => {
                                  // AI dev note: Usar parseSupabaseDatetime para manter horário exato (sem conversão de timezone)
                                  const hora = format(
                                    parseSupabaseDatetime(slot.data_hora),
                                    'HH:mm'
                                  );
                                  const isSelected =
                                    wizardData.slot_id === slot.id;

                                  return (
                                    <Button
                                      key={slot.id}
                                      variant={
                                        isSelected ? 'default' : 'outline'
                                      }
                                      className={cn(
                                        'h-auto py-3',
                                        isSelected && 'ring-2 ring-primary'
                                      )}
                                      onClick={() => {
                                        setWizardData((prev) => ({
                                          ...prev,
                                          slot_id: slot.id,
                                          slot_data_hora: slot.data_hora,
                                        }));
                                      }}
                                    >
                                      <Calendar className="w-4 h-4 mr-2" />
                                      {hora}
                                    </Button>
                                  );
                                })}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </ScrollArea>
              </div>
            );
          }

          case 'confirmation': {
            // AI dev note: Usar parseSupabaseDatetime para manter horário exato (sem conversão de timezone)
            const slotDate = wizardData.slot_data_hora
              ? parseSupabaseDatetime(wizardData.slot_data_hora)
              : null;

            return (
              <div className="space-y-6">
                <div className="text-center space-y-2">
                  <h3 className="text-lg font-semibold">Confirme os Dados</h3>
                  <p className="text-sm text-muted-foreground">
                    Revise as informações antes de confirmar o agendamento
                  </p>
                </div>

                <Card className="bg-primary/5">
                  <CardHeader>
                    <CardTitle className="text-base">
                      Resumo do Agendamento
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="grid grid-cols-2 gap-2">
                      <span className="text-muted-foreground">
                        Responsável:
                      </span>
                      <span className="font-medium">{responsavelNome}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <span className="text-muted-foreground">Paciente:</span>
                      <span className="font-medium">
                        {wizardData.paciente_nome}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <span className="text-muted-foreground">Serviço:</span>
                      <span className="font-medium">
                        {wizardData.tipo_servico_nome}
                      </span>
                    </div>

                    {wizardData.local_nome && (
                      <div className="grid grid-cols-2 gap-2">
                        <span className="text-muted-foreground">Local:</span>
                        <span className="font-medium">
                          {wizardData.local_nome}
                        </span>
                      </div>
                    )}

                    {wizardData.empresa_nome && (
                      <div className="grid grid-cols-2 gap-2">
                        <span className="text-muted-foreground">Empresa:</span>
                        <span className="font-medium">
                          {wizardData.empresa_nome}
                        </span>
                      </div>
                    )}

                    {slotDate && (
                      <div className="grid grid-cols-2 gap-2">
                        <span className="text-muted-foreground">
                          Data/Hora:
                        </span>
                        <span className="font-medium">
                          {format(slotDate, "EEEE, dd/MM 'às' HH:mm", {
                            locale: ptBR,
                          })}
                        </span>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <span className="text-muted-foreground">
                        Profissional:
                      </span>
                      <span className="font-medium">
                        {agenda.profissional_nome}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          }

          case 'success':
            return (
              <div className="text-center space-y-6 py-8">
                <div className="mx-auto w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>

                <div className="space-y-2">
                  <h3 className="text-xl font-semibold">
                    Agendamento Confirmado!
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Seu agendamento foi realizado com sucesso.
                    <br />
                    Você receberá uma confirmação no WhatsApp em breve.
                  </p>
                </div>

                <Button
                  onClick={() => window.location.reload()}
                  className="mt-4"
                >
                  Voltar ao Início
                </Button>
              </div>
            );

          default:
            return null;
        }
      };

      const showNavigation =
        currentStep !== 'whatsapp-validation' &&
        currentStep !== 'access-denied' &&
        currentStep !== 'success';

      const showProgress =
        currentStep !== 'whatsapp-validation' &&
        currentStep !== 'access-denied' &&
        currentStep !== 'success';

      return (
        <div className={cn('w-full max-w-2xl mx-auto', className)}>
          {/* Header da Agenda */}
          {currentStep !== 'whatsapp-validation' &&
            currentStep !== 'access-denied' && (
              <div className="mb-6 text-center space-y-2">
                <h2 className="text-2xl font-bold">{agenda.titulo}</h2>
                <p className="text-sm text-muted-foreground">
                  {agenda.profissional_nome}
                  {agenda.profissional_especialidade &&
                    ` • ${agenda.profissional_especialidade}`}
                </p>
              </div>
            )}

          {/* Progress */}
          {showProgress && (
            <ProgressIndicator
              currentStep={stepNumber}
              totalSteps={totalSteps}
              className="mb-6"
            />
          )}

          {/* Step Content */}
          <div className="mb-6">{renderStep()}</div>

          {/* Navigation Buttons */}
          {showNavigation && (
            <div className="flex items-center justify-between">
              {currentStep !== 'select-patient' ? (
                <Button
                  variant="outline"
                  onClick={handleBack}
                  disabled={isSubmitting}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Voltar
                </Button>
              ) : (
                <div />
              )}

              <Button onClick={handleNext} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processando...
                  </>
                ) : currentStep === 'confirmation' ? (
                  <>
                    {isRescheduling
                      ? 'Confirmar Reagendamento'
                      : 'Confirmar Agendamento'}
                    <Check className="w-4 h-4 ml-2" />
                  </>
                ) : (
                  <>
                    Próximo
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Dialog de Reagendamento */}
          <Dialog
            open={showRescheduleDialog}
            onOpenChange={setShowRescheduleDialog}
          >
            <DialogContent>
              <DialogHeader>
                <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-3">
                  <AlertCircle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                </div>
                <DialogTitle className="text-center">
                  Agendamento Existente
                </DialogTitle>
                <DialogDescription className="text-center space-y-4">
                  {wizardData.paciente_nome} já tem um horário agendado nesta
                  agenda.
                  {existingAppointmentData && (
                    <Card className="bg-primary/5 mt-4">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">
                          Agendamento Atual
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <span>
                            {format(
                              parseSupabaseDatetime(
                                existingAppointmentData.data_hora
                              ),
                              "EEEE, dd/MM 'às' HH:mm",
                              { locale: ptBR }
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">
                            Serviço:
                          </span>
                          <span>
                            {existingAppointmentData.tipo_servico_nome}
                          </span>
                        </div>
                        {existingAppointmentData.local_nome && (
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-muted-foreground" />
                            <span>{existingAppointmentData.local_nome}</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                  <p className="text-sm mt-4">O que deseja fazer?</p>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="sm:flex-col gap-2">
                {/* AI dev note: REGRA DE 24 HORAS - Verificar se pode alterar */}
                {existingAppointmentData &&
                isSlotWithinMinimumHours(
                  existingAppointmentData.data_hora,
                  HORAS_MINIMAS_ALTERACAO
                ) ? (
                  <div className="w-full space-y-4">
                    <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-center">
                      <Clock className="w-6 h-6 text-destructive mx-auto mb-2" />
                      <p className="text-sm font-medium text-destructive">
                        Alterações só podem ser realizadas com pelo menos{' '}
                        {HORAS_MINIMAS_ALTERACAO}h de antecedência
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Entre em contato com a recepção para alterar ou cancelar
                        este agendamento.
                      </p>
                    </div>
                    <div className="flex items-center justify-center gap-2 text-primary">
                      <Phone className="w-4 h-4" />
                      <span className="font-medium text-sm">
                        Contate a recepção
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowRescheduleDialog(false);
                        setWizardData((prev) => ({
                          ...prev,
                          paciente_id: undefined,
                          paciente_nome: undefined,
                        }));
                      }}
                      className="w-full"
                    >
                      Entendi
                    </Button>
                  </div>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowRescheduleDialog(false);
                        // Reseta paciente para escolher outro
                        setWizardData((prev) => ({
                          ...prev,
                          paciente_id: undefined,
                          paciente_nome: undefined,
                        }));
                      }}
                      className="w-full"
                    >
                      Manter Este Horário
                    </Button>
                    <Button
                      onClick={() => {
                        setIsRescheduling(true);
                        setShowRescheduleDialog(false);
                        setCurrentStep(getNextStep('select-patient'));
                      }}
                      className="w-full"
                    >
                      Trocar de Horário
                    </Button>
                  </>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      );
    }
  );

SharedScheduleSelectorWizard.displayName = 'SharedScheduleSelectorWizard';
