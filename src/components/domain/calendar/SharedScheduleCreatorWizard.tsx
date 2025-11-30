import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  X,
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  AlertTriangle,
} from 'lucide-react';

import { Button } from '@/components/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import { DatePicker } from '@/components/composed/DatePicker';
import { Checkbox } from '@/components/primitives/checkbox';
import { ScrollArea } from '@/components/primitives/scroll-area';
import { ProgressIndicator } from '@/components/composed/ProgressIndicator';
import { ScheduleLinkDisplay } from '@/components/composed/ScheduleLinkDisplay';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/primitives/use-toast';
import {
  createSharedSchedule,
  generateUniqueToken,
  isTokenAvailable,
  checkSlotConflict,
  type AppointmentConflictDetail,
} from '@/lib/shared-schedule-api';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type {
  ServicoDetalhado,
  LocalDetalhado,
  EmpresaDetalhada,
} from '@/types/shared-schedule';

// AI dev note: SharedScheduleCreatorWizard - Domain
// Wizard para criar agenda compartilhada
// Steps: 1) Informações básicas, 2) Serviços, 3) Locais/Empresas, 4) Horários, 5) Confirmação

export interface SharedScheduleCreatorWizardProps {
  isOpen: boolean;
  onClose: () => void;
  profissionalId: string;
  userId: string;
  onSuccess?: (agendaId: string, link: string) => void;
  className?: string;
}

type Step =
  | 'basic-info'
  | 'services'
  | 'locations-companies'
  | 'slots'
  | 'success';

interface WizardData {
  titulo: string;
  data_inicio: string;
  data_fim: string;
  servicos_ids: string[];
  locais_ids: string[];
  empresas_ids: string[];
  slots_data_hora: string[];
  link?: string;
}

export const SharedScheduleCreatorWizard =
  React.memo<SharedScheduleCreatorWizardProps>(
    ({ isOpen, onClose, profissionalId, userId, onSuccess, className }) => {
      const { toast } = useToast();
      const [currentStep, setCurrentStep] = useState<Step>('basic-info');
      const [isSubmitting, setIsSubmitting] = useState(false);
      const [wizardData, setWizardData] = useState<WizardData>({
        titulo: '',
        data_inicio: '',
        data_fim: '',
        servicos_ids: [],
        locais_ids: [],
        empresas_ids: [],
        slots_data_hora: [],
      });

      // Estados para options (carregados no mount)
      const [servicos, setServicos] = useState<ServicoDetalhado[]>([]);
      const [locais, setLocais] = useState<LocalDetalhado[]>([]);
      const [empresas, setEmpresas] = useState<EmpresaDetalhada[]>([]);
      const [isLoadingOptions, setIsLoadingOptions] = useState(true);

      // Estados para step de slots
      const [selectedDate, setSelectedDate] = useState<string>('');
      const [, setSelectedTimes] = useState<string[]>([]);
      const [timeInput, setTimeInput] = useState<string>('');

      // AI dev note: Estado para validação em tempo real de conflitos
      const [slotConflict, setSlotConflict] =
        useState<AppointmentConflictDetail | null>(null);
      const [isCheckingConflict, setIsCheckingConflict] = useState(false);

      // Carregar opções quando dialog abre
      React.useEffect(() => {
        if (isOpen) {
          loadOptions();
        }
      }, [isOpen]);

      // AI dev note: Verificar conflito em tempo real quando data+hora mudam
      useEffect(() => {
        const checkConflict = async () => {
          // Limpar conflito anterior
          setSlotConflict(null);

          // Só verificar se temos data e hora válidas
          if (!selectedDate || !timeInput) return;

          // Validar formato HH:mm
          const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
          if (!timeRegex.test(timeInput)) return;

          const dateTime = `${selectedDate}T${timeInput}:00`;

          // Não verificar se já está na lista (será tratado no handleAddTime)
          if (wizardData.slots_data_hora.includes(dateTime)) return;

          setIsCheckingConflict(true);
          try {
            const result = await checkSlotConflict(profissionalId, dateTime);
            if (result.success && result.data) {
              setSlotConflict(result.data);
            }
          } catch (error) {
            console.error('Erro ao verificar conflito:', error);
          } finally {
            setIsCheckingConflict(false);
          }
        };

        // Debounce de 300ms para não fazer muitas requisições
        const timeoutId = setTimeout(checkConflict, 300);
        return () => clearTimeout(timeoutId);
      }, [selectedDate, timeInput, profissionalId, wizardData.slots_data_hora]);

      const loadOptions = async () => {
        try {
          setIsLoadingOptions(true);

          // Buscar serviços ativos
          const { data: servicosData } = await import('@/lib/supabase').then(
            ({ supabase }) =>
              supabase
                .from('tipo_servicos')
                .select(
                  'id, nome, descricao, duracao_minutos, valor, cor, ativo'
                )
                .eq('ativo', true)
                .order('nome')
          );

          // Buscar locais ativos
          const { data: locaisData } = await import('@/lib/supabase').then(
            ({ supabase }) =>
              supabase
                .from('locais_atendimento')
                .select('id, nome, tipo_local, ativo')
                .eq('ativo', true)
                .order('nome')
          );

          // Buscar empresas ativas
          const { data: empresasData } = await import('@/lib/supabase').then(
            ({ supabase }) =>
              supabase
                .from('pessoa_empresas')
                .select('id, razao_social, nome_fantasia, cnpj, ativo')
                .eq('ativo', true)
                .order('razao_social')
          );

          setServicos((servicosData || []) as ServicoDetalhado[]);
          setLocais((locaisData || []) as LocalDetalhado[]);
          setEmpresas((empresasData || []) as EmpresaDetalhada[]);
        } catch (error) {
          console.error('Erro ao carregar opções:', error);
          toast({
            title: 'Erro ao carregar opções',
            description: 'Tente novamente mais tarde',
            variant: 'destructive',
          });
        } finally {
          setIsLoadingOptions(false);
        }
      };

      // Handlers de navegação
      const handleNext = useCallback(() => {
        // Validar step atual antes de avançar
        if (currentStep === 'basic-info') {
          if (!wizardData.titulo.trim()) {
            toast({
              title: 'Título obrigatório',
              description: 'Informe um título para a agenda',
              variant: 'destructive',
            });
            return;
          }
          if (!wizardData.data_inicio || !wizardData.data_fim) {
            toast({
              title: 'Período obrigatório',
              description: 'Selecione as datas de início e fim',
              variant: 'destructive',
            });
            return;
          }
          if (wizardData.data_inicio > wizardData.data_fim) {
            toast({
              title: 'Período inválido',
              description: 'A data de início deve ser anterior à data de fim',
              variant: 'destructive',
            });
            return;
          }
          setCurrentStep('services');
        } else if (currentStep === 'services') {
          if (wizardData.servicos_ids.length === 0) {
            toast({
              title: 'Selecione ao menos um serviço',
              variant: 'destructive',
            });
            return;
          }
          setCurrentStep('locations-companies');
        } else if (currentStep === 'locations-companies') {
          if (wizardData.locais_ids.length === 0) {
            toast({
              title: 'Selecione ao menos um local',
              variant: 'destructive',
            });
            return;
          }
          if (wizardData.empresas_ids.length === 0) {
            toast({
              title: 'Selecione ao menos uma empresa',
              variant: 'destructive',
            });
            return;
          }
          setCurrentStep('slots');
        } else if (currentStep === 'slots') {
          if (wizardData.slots_data_hora.length === 0) {
            toast({
              title: 'Adicione ao menos um horário',
              variant: 'destructive',
            });
            return;
          }
          handleSubmit();
        }
      }, [currentStep, wizardData, toast]);

      const handleBack = useCallback(() => {
        if (currentStep === 'services') {
          setCurrentStep('basic-info');
        } else if (currentStep === 'locations-companies') {
          setCurrentStep('services');
        } else if (currentStep === 'slots') {
          setCurrentStep('locations-companies');
        }
      }, [currentStep]);

      const handleClose = useCallback(() => {
        setCurrentStep('basic-info');
        setWizardData({
          titulo: '',
          data_inicio: '',
          data_fim: '',
          servicos_ids: [],
          locais_ids: [],
          empresas_ids: [],
          slots_data_hora: [],
        });
        setSelectedDate('');
        setSelectedTimes([]);
        setTimeInput('');
        onClose();
      }, [onClose]);

      // Handler de adição de horário
      const handleAddTime = useCallback(() => {
        if (!selectedDate) {
          toast({
            title: 'Selecione uma data',
            variant: 'destructive',
          });
          return;
        }

        if (!timeInput) {
          toast({
            title: 'Informe um horário',
            variant: 'destructive',
          });
          return;
        }

        // Validar formato HH:mm
        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
        if (!timeRegex.test(timeInput)) {
          toast({
            title: 'Horário inválido',
            description: 'Use o formato HH:mm (ex: 08:00)',
            variant: 'destructive',
          });
          return;
        }

        // Criar timestamp (SEM conversão - igual ao agendamento padrão)
        const dateTime = `${selectedDate}T${timeInput}:00`;

        // Verificar se já existe
        if (wizardData.slots_data_hora.includes(dateTime)) {
          toast({
            title: 'Horário já adicionado',
            variant: 'destructive',
          });
          return;
        }

        setWizardData((prev) => ({
          ...prev,
          slots_data_hora: [...prev.slots_data_hora, dateTime].sort(),
        }));

        setTimeInput('');
        toast({
          title: 'Horário adicionado',
          variant: 'default',
        });
      }, [selectedDate, timeInput, wizardData.slots_data_hora, toast]);

      const handleRemoveSlot = useCallback((slot: string) => {
        setWizardData((prev) => ({
          ...prev,
          slots_data_hora: prev.slots_data_hora.filter((s) => s !== slot),
        }));
      }, []);

      // Submeter criação
      const handleSubmit = useCallback(async () => {
        try {
          setIsSubmitting(true);

          // Gerar token único
          let token = generateUniqueToken();
          let available = await isTokenAvailable(token);

          // Tentar até 3 vezes se token já existe
          let attempts = 0;
          while (available.data === false && attempts < 3) {
            token = generateUniqueToken();
            available = await isTokenAvailable(token);
            attempts++;
          }

          if (available.data === false) {
            throw new Error('Não foi possível gerar token único');
          }

          // Criar agenda
          const result = await createSharedSchedule({
            profissional_id: profissionalId,
            token,
            titulo: wizardData.titulo,
            data_inicio: wizardData.data_inicio,
            data_fim: wizardData.data_fim,
            criado_por: userId,
            servicos_ids: wizardData.servicos_ids,
            locais_ids: wizardData.locais_ids,
            empresas_ids: wizardData.empresas_ids,
            slots_data_hora: wizardData.slots_data_hora,
          });

          if (!result.success || !result.data) {
            throw new Error(result.error || 'Erro ao criar agenda');
          }

          setWizardData((prev) => ({ ...prev, link: result.data!.link }));
          setCurrentStep('success');

          toast({
            title: 'Agenda criada com sucesso!',
            description: 'Compartilhe o link com os responsáveis',
          });

          if (onSuccess) {
            onSuccess(result.data.agenda.id, result.data.link);
          }
        } catch (error) {
          console.error('Erro ao criar agenda:', error);
          toast({
            title: 'Erro ao criar agenda',
            description:
              error instanceof Error ? error.message : 'Erro desconhecido',
            variant: 'destructive',
          });
        } finally {
          setIsSubmitting(false);
        }
      }, [wizardData, profissionalId, userId, toast, onSuccess]);

      // Progress indicator
      const { stepNumber, totalSteps } = useMemo(() => {
        const steps: Record<Step, number> = {
          'basic-info': 1,
          services: 2,
          'locations-companies': 3,
          slots: 4,
          success: 5,
        };
        return { stepNumber: steps[currentStep], totalSteps: 5 };
      }, [currentStep]);

      // Renderizar step atual
      const renderStep = () => {
        if (isLoadingOptions) {
          return (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          );
        }

        switch (currentStep) {
          case 'basic-info':
            return (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="titulo">Título da Agenda *</Label>
                  <Input
                    id="titulo"
                    placeholder="Ex: Agenda Bruna - Semana 10-16 Nov"
                    value={wizardData.titulo}
                    onChange={(e) =>
                      setWizardData((prev) => ({
                        ...prev,
                        titulo: e.target.value,
                      }))
                    }
                    maxLength={100}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Data de Início *</Label>
                    <DatePicker
                      value={wizardData.data_inicio}
                      onChange={(value) =>
                        setWizardData((prev) => ({
                          ...prev,
                          data_inicio: value,
                        }))
                      }
                      placeholder="Selecione a data"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Data de Fim *</Label>
                    <DatePicker
                      value={wizardData.data_fim}
                      onChange={(value) =>
                        setWizardData((prev) => ({ ...prev, data_fim: value }))
                      }
                      placeholder="Selecione a data"
                    />
                  </div>
                </div>

                <p className="text-sm text-muted-foreground">
                  Esta agenda será temporária e você poderá desativá-la a
                  qualquer momento.
                </p>
              </div>
            );

          case 'services':
            return (
              <div className="space-y-4">
                <div>
                  <Label>Selecione os serviços disponíveis *</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Os responsáveis poderão escolher entre estes serviços
                  </p>
                </div>

                <ScrollArea className="h-[300px] pr-4">
                  <div className="space-y-2">
                    {servicos.map((servico) => (
                      <div
                        key={servico.id}
                        className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors"
                      >
                        <Checkbox
                          id={`servico-${servico.id}`}
                          checked={wizardData.servicos_ids.includes(servico.id)}
                          onCheckedChange={(checked) => {
                            setWizardData((prev) => ({
                              ...prev,
                              servicos_ids: checked
                                ? [...prev.servicos_ids, servico.id]
                                : prev.servicos_ids.filter(
                                    (id) => id !== servico.id
                                  ),
                            }));
                          }}
                        />
                        <div className="flex-1 space-y-1">
                          <Label
                            htmlFor={`servico-${servico.id}`}
                            className="font-medium cursor-pointer"
                          >
                            {servico.nome}
                          </Label>
                          {servico.descricao && (
                            <p className="text-sm text-muted-foreground">
                              {servico.descricao}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                {servicos.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhum serviço ativo cadastrado
                  </p>
                )}
              </div>
            );

          case 'locations-companies':
            return (
              <div className="space-y-6">
                {/* Locais */}
                <div className="space-y-4">
                  <div>
                    <Label>Selecione os locais de atendimento *</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Os responsáveis poderão escolher onde será o atendimento
                    </p>
                  </div>

                  <ScrollArea className="h-[150px] pr-4">
                    <div className="space-y-2">
                      {locais.map((local) => (
                        <div
                          key={local.id}
                          className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors"
                        >
                          <Checkbox
                            id={`local-${local.id}`}
                            checked={wizardData.locais_ids.includes(local.id)}
                            onCheckedChange={(checked) => {
                              setWizardData((prev) => ({
                                ...prev,
                                locais_ids: checked
                                  ? [...prev.locais_ids, local.id]
                                  : prev.locais_ids.filter(
                                      (id) => id !== local.id
                                    ),
                              }));
                            }}
                          />
                          <Label
                            htmlFor={`local-${local.id}`}
                            className="font-medium cursor-pointer flex-1"
                          >
                            {local.nome}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>

                {/* Empresas */}
                <div className="space-y-4">
                  <div>
                    <Label>Selecione as empresas de faturamento *</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Os responsáveis poderão escolher a empresa para emissão da
                      NFe
                    </p>
                  </div>

                  <ScrollArea className="h-[150px] pr-4">
                    <div className="space-y-2">
                      {empresas.map((empresa) => (
                        <div
                          key={empresa.id}
                          className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors"
                        >
                          <Checkbox
                            id={`empresa-${empresa.id}`}
                            checked={wizardData.empresas_ids.includes(
                              empresa.id
                            )}
                            onCheckedChange={(checked) => {
                              setWizardData((prev) => ({
                                ...prev,
                                empresas_ids: checked
                                  ? [...prev.empresas_ids, empresa.id]
                                  : prev.empresas_ids.filter(
                                      (id) => id !== empresa.id
                                    ),
                              }));
                            }}
                          />
                          <Label
                            htmlFor={`empresa-${empresa.id}`}
                            className="font-medium cursor-pointer flex-1"
                          >
                            {empresa.nome_fantasia || empresa.razao_social}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            );

          case 'slots':
            return (
              <div className="space-y-4">
                <div>
                  <Label>Adicionar Horários Disponíveis *</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Defina os horários que estarão disponíveis para agendamento
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Data</Label>
                    <DatePicker
                      value={selectedDate}
                      onChange={setSelectedDate}
                      placeholder="Selecione a data"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Horário (HH:mm)</Label>
                    <div className="flex gap-2">
                      <Input
                        type="time"
                        value={timeInput}
                        onChange={(e) => setTimeInput(e.target.value)}
                        placeholder="08:00"
                        className={cn(slotConflict && 'border-amber-500')}
                      />
                      <Button
                        type="button"
                        onClick={handleAddTime}
                        disabled={!selectedDate || !timeInput || !!slotConflict}
                      >
                        {isCheckingConflict ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          'Adicionar'
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* AI dev note: Aviso de conflito em tempo real */}
                {slotConflict && (
                  <Alert
                    variant="destructive"
                    className="bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-200"
                  >
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Horário já agendado!</strong>
                      <br />
                      Paciente: {slotConflict.paciente_nome} -{' '}
                      {slotConflict.tipo_servico_nome}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Lista de slots adicionados */}
                <div className="space-y-2">
                  <Label>
                    Horários Adicionados ({wizardData.slots_data_hora.length})
                  </Label>
                  <ScrollArea className="h-[200px] pr-4">
                    <div className="space-y-2">
                      {wizardData.slots_data_hora.map((slot) => {
                        const date = new Date(slot);
                        const dia = format(date, 'EEEE, dd/MM', {
                          locale: ptBR,
                        });
                        const hora = format(date, 'HH:mm');

                        return (
                          <div
                            key={slot}
                            className="flex items-center justify-between p-3 rounded-lg border bg-card"
                          >
                            <div>
                              <p className="text-sm font-medium capitalize">
                                {dia}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {hora}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveSlot(slot)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>

                  {wizardData.slots_data_hora.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhum horário adicionado ainda
                    </p>
                  )}
                </div>
              </div>
            );

          case 'success':
            return (
              <div className="space-y-4">
                <div className="text-center py-4">
                  <div className="mx-auto w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
                    <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
                  </div>
                  <h3 className="text-lg font-semibold">
                    Agenda Criada com Sucesso!
                  </h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    Compartilhe o link abaixo com os responsáveis
                  </p>
                </div>

                <ScheduleLinkDisplay
                  link={wizardData.link || ''}
                  slotsTotal={wizardData.slots_data_hora.length}
                  slotsDisponiveis={wizardData.slots_data_hora.length}
                />
              </div>
            );
        }
      };

      return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
          <DialogContent className={cn('max-w-2xl', className)}>
            <DialogHeader>
              <DialogTitle>Nova Agenda Compartilhada</DialogTitle>
              <DialogDescription>
                {currentStep === 'success'
                  ? 'Agenda criada e pronta para ser compartilhada'
                  : 'Crie uma agenda com horários disponíveis para compartilhar'}
              </DialogDescription>
            </DialogHeader>

            {currentStep !== 'success' && (
              <ProgressIndicator
                currentStep={stepNumber}
                totalSteps={totalSteps}
                className="mb-4"
              />
            )}

            <div className="py-4">{renderStep()}</div>

            {/* Footer com botões */}
            <div className="flex items-center justify-between pt-4 border-t">
              {currentStep === 'success' ? (
                <Button onClick={handleClose} className="w-full">
                  Concluir
                </Button>
              ) : (
                <>
                  {currentStep !== 'basic-info' && (
                    <Button variant="outline" onClick={handleBack}>
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Voltar
                    </Button>
                  )}

                  {currentStep === 'basic-info' && <div />}

                  <Button onClick={handleNext} disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Criando...
                      </>
                    ) : currentStep === 'slots' ? (
                      <>
                        Criar Agenda
                        <Check className="w-4 h-4 ml-2" />
                      </>
                    ) : (
                      <>
                        Próximo
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      );
    }
  );

SharedScheduleCreatorWizard.displayName = 'SharedScheduleCreatorWizard';
