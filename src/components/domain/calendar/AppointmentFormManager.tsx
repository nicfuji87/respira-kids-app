import React, { useState, useCallback, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Save, X, AlertTriangle, Calendar } from 'lucide-react';

import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import { Textarea } from '@/components/primitives/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import {
  PatientSelect,
  ProfessionalSelect,
  ServiceTypeSelect,
  ConsultaStatusSelect,
  PagamentoStatusSelect,
  LocationSelect,
} from '@/components/composed';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { cn } from '@/lib/utils';
import {
  createAgendamento,
  fetchAgendamentosFromView,
} from '@/lib/calendar-services';
import { parseSupabaseDatetime } from '@/lib/calendar-mappers';
import { useToast } from '@/components/primitives/use-toast';
import { ToastAction } from '@/components/primitives/toast';
import type {
  CreateAgendamento,
  SupabaseTipoServico,
  CalendarFilters,
} from '@/types/supabase-calendar';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useCalendarFormData } from '@/hooks/useCalendarData';

// AI dev note: AppointmentFormManager combina todos os Composed para formulário completo de agendamento
// Integração com Supabase para criação de agendamentos
// Validação completa de formulário com tratamento de erros
// DEBUG: Logs adicionados para diagnosticar re-renders que afetam PatientSelect

export interface AppointmentFormManagerProps {
  isOpen: boolean;
  onClose: () => void;
  initialDate?: Date;
  initialTime?: string;
  initialPatientId?: string; // Novo: Para auto-preencher paciente
  onSave?: (appointmentId: string) => void;
  className?: string;
}

interface AppointmentFormData {
  data_hora: string;
  paciente_id: string;
  profissional_id: string;
  tipo_servico_id: string;
  local_id: string;
  status_consulta_id: string;
  status_pagamento_id: string;
  valor_servico: number;
  observacao: string;
  empresa_fatura: string;
}

interface FormErrors {
  data_hora?: string;
  paciente_id?: string;
  profissional_id?: string;
  tipo_servico_id?: string;
  local_id?: string;
  status_consulta_id?: string;
  status_pagamento_id?: string;
  valor_servico?: string;
  observacao?: string;
  empresa_fatura?: string;
  general?: string;
}

export const AppointmentFormManager = React.memo<AppointmentFormManagerProps>(
  ({
    isOpen,
    onClose,
    initialDate,
    initialTime,
    initialPatientId,
    onSave,
    className,
  }) => {
    const { user } = useAuth();
    const { toast } = useToast();
    const { formData: calendarFormData, loading: formDataLoading } =
      useCalendarFormData();

    const [formData, setFormData] = useState<AppointmentFormData>({
      data_hora: '',
      paciente_id: '',
      profissional_id: '',
      tipo_servico_id: '',
      local_id: '',
      status_consulta_id: '',
      status_pagamento_id: '',
      valor_servico: 0,
      observacao: '',
      empresa_fatura: '',
    });

    const [errors, setErrors] = useState<FormErrors>({});
    const [isLoading, setIsLoading] = useState(false);
    const [hasConflict, setHasConflict] = useState(false);
    const [conflictDetails, setConflictDetails] = useState<string>('');
    const [pastDateConfirmed, setPastDateConfirmed] = useState(false);
    const [futureWeekConfirmed, setFutureWeekConfirmed] = useState(false);

    // AI dev note: Armazenar nome do serviço para validação de valor zero apenas para serviços SOCIAL
    const [selectedServiceName, setSelectedServiceName] = useState<string>('');

    // Estados para empresas de faturamento
    const [empresasOptions, setEmpresasOptions] = useState<
      Array<{ id: string; razao_social: string; nome_fantasia?: string }>
    >([]);
    const [isLoadingEmpresas, setIsLoadingEmpresas] = useState(false);

    // Log para mudanças no formData
    useEffect(() => {
      // removed verbose debug log
    }, [formData]);

    // Carregar opções de empresas de faturamento
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

    // Reset form quando dialog abre/fecha
    useEffect(() => {
      if (isOpen) {
        const defaultDate = initialDate || new Date();
        const defaultTime = initialTime || '09:00';
        const dateTimeString = `${format(defaultDate, 'yyyy-MM-dd')}T${defaultTime}`;

        setFormData({
          data_hora: dateTimeString,
          paciente_id: initialPatientId || '',
          profissional_id: '',
          tipo_servico_id: '',
          local_id: '',
          status_consulta_id: '',
          status_pagamento_id: '',
          valor_servico: 0,
          observacao: '',
          empresa_fatura: '',
        });
        setErrors({});
        setHasConflict(false);
        setConflictDetails('');
        setPastDateConfirmed(false);
        setFutureWeekConfirmed(false);
        // AI dev note: Resetar nome do serviço ao abrir o formulário
        setSelectedServiceName('');
      }
    }, [isOpen, initialDate, initialTime, initialPatientId]);

    // Validar conflitos de horário
    const checkScheduleConflicts = useCallback(
      async (data_hora: string, profissional_id: string) => {
        if (!data_hora || !profissional_id) return;

        try {
          const appointmentDate = parseSupabaseDatetime(data_hora);
          const startDate = new Date(appointmentDate);
          startDate.setHours(0, 0, 0, 0);
          const endDate = new Date(appointmentDate);
          endDate.setHours(23, 59, 59, 999);

          const filters: CalendarFilters = {
            startDate,
            endDate,
            profissionalId: profissional_id,
          };

          const existingAppointments = await fetchAgendamentosFromView(filters);

          // AI dev note: Verificar conflitos no mesmo horário, EXCLUINDO agendamentos cancelados
          const conflictingAppointments = existingAppointments.filter(
            (appointment) => {
              // Ignorar agendamentos cancelados - eles podem ser sobrescritos
              if (appointment.status_consulta?.codigo === 'cancelado') {
                return false;
              }

              const existingDateTime = parseSupabaseDatetime(
                appointment.data_hora
              );
              const newDateTime = parseSupabaseDatetime(data_hora);

              // Mesmo horário exato ou sobreposição
              return (
                Math.abs(existingDateTime.getTime() - newDateTime.getTime()) <
                30 * 60 * 1000
              ); // 30 minutos de tolerância
            }
          );

          if (conflictingAppointments.length > 0) {
            const conflict = conflictingAppointments[0];
            setHasConflict(true);
            setConflictDetails(
              `Conflito com agendamento existente: ${conflict.paciente.nome} às ${format(parseSupabaseDatetime(conflict.data_hora), 'HH:mm', { locale: ptBR })}`
            );
          } else {
            setHasConflict(false);
            setConflictDetails('');
          }
        } catch (error) {
          console.error('Erro ao verificar conflitos:', error);
        }
      },
      []
    );

    // Atualizar campo específico
    const updateField = useCallback(
      (field: keyof AppointmentFormData, value: string | number) => {
        setFormData((prev) => {
          const newData = { ...prev, [field]: value };

          return newData;
        });

        // Limpar erro do campo ao modificar usando functional update
        setErrors((prev) => {
          if (prev[field as keyof FormErrors]) {
            return {
              ...prev,
              [field as keyof FormErrors]: undefined,
            };
          }
          return prev;
        });
      },
      [] // AI dev note: Dependências removidas para evitar re-renders infinitos
    );

    // Handler para mudança de tipo de serviço (atualiza valor automaticamente)
    const handleServiceTypeChange = useCallback(
      (serviceId: string, serviceData?: SupabaseTipoServico) => {
        updateField('tipo_servico_id', serviceId);

        if (serviceData) {
          updateField('valor_servico', serviceData.valor);
          // AI dev note: Armazenar nome do serviço para validação de valor zero
          setSelectedServiceName(serviceData.nome || '');
        }
      },
      [updateField]
    );

    // Handler para mudança de data/hora com validação de conflitos
    const handleDateTimeChange = useCallback(
      (value: string) => {
        updateField('data_hora', value);

        // AI dev note: Resetar confirmações ao mudar data para evitar avisos repetitivos
        setPastDateConfirmed(false);
        setFutureWeekConfirmed(false);

        if (formData.profissional_id) {
          checkScheduleConflicts(value, formData.profissional_id);
        }
      },
      [updateField, formData.profissional_id, checkScheduleConflicts]
    );

    // Handler para mudança de profissional com validação de conflitos
    const handleProfessionalChange = useCallback(
      (professionalId: string) => {
        updateField('profissional_id', professionalId);

        if (formData.data_hora) {
          checkScheduleConflicts(formData.data_hora, professionalId);
        }
      },
      [updateField, formData.data_hora, checkScheduleConflicts]
    );

    // AI dev note: Função separada para realmente criar o agendamento (sem validações de data)
    const performSave = useCallback(async () => {
      if (!user?.pessoa?.id) {
        setErrors({ general: 'Usuário não encontrado' });
        return;
      }

      setIsLoading(true);

      try {
        const appointmentData: CreateAgendamento = {
          data_hora: formData.data_hora,
          paciente_id: formData.paciente_id,
          profissional_id: formData.profissional_id,
          tipo_servico_id: formData.tipo_servico_id,
          local_id: formData.local_id || undefined,
          status_consulta_id: formData.status_consulta_id,
          status_pagamento_id: formData.status_pagamento_id,
          valor_servico: formData.valor_servico,
          observacao: formData.observacao || undefined,
          agendado_por: user.pessoa.id,
          empresa_fatura: formData.empresa_fatura,
        };

        const newAppointment = await createAgendamento(appointmentData);

        toast({
          title: 'Agendamento criado',
          description: 'O agendamento foi criado com sucesso.',
        });

        onSave?.(newAppointment.id);
        // Reset estados de confirmação ao fechar
        setPastDateConfirmed(false);
        setFutureWeekConfirmed(false);
        onClose();
      } catch (error: unknown) {
        console.error('Erro ao criar agendamento:', error);

        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Erro ao criar agendamento. Tente novamente.';

        setErrors({
          general: errorMessage,
        });

        toast({
          title: 'Erro',
          description: 'Não foi possível criar o agendamento.',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    }, [formData, user, onSave, toast, onClose]);

    // Validar e salvar agendamento
    const handleSave = useCallback(async () => {
      // Validar formulário inline para evitar dependência desnecessária
      const newErrors: FormErrors = {};

      if (!formData.data_hora)
        newErrors.data_hora = 'Data e hora são obrigatórios';
      if (!formData.paciente_id)
        newErrors.paciente_id = 'Paciente é obrigatório';
      if (!formData.profissional_id)
        newErrors.profissional_id = 'Profissional é obrigatório';
      if (!formData.tipo_servico_id)
        newErrors.tipo_servico_id = 'Tipo de serviço é obrigatório';
      if (!formData.status_consulta_id)
        newErrors.status_consulta_id = 'Status da consulta é obrigatório';
      if (!formData.status_pagamento_id)
        newErrors.status_pagamento_id = 'Status do pagamento é obrigatório';

      // AI dev note: Validação de valor - permitir zero APENAS para serviços que contenham "SOCIAL" no nome
      console.log('🔍 DEBUG Validação:', {
        valor: formData.valor_servico,
        serviceName: selectedServiceName,
        includes: selectedServiceName.toUpperCase().includes('SOCIAL'),
      });

      if (
        formData.valor_servico === undefined ||
        formData.valor_servico === null
      ) {
        newErrors.valor_servico = 'Valor é obrigatório';
      } else if (formData.valor_servico < 0) {
        newErrors.valor_servico = 'Valor não pode ser negativo';
      } else if (formData.valor_servico === 0) {
        // Permitir valor zero SOMENTE se o nome do serviço contém "SOCIAL"
        const isSocialService = selectedServiceName
          .toUpperCase()
          .includes('SOCIAL');
        if (!isSocialService) {
          newErrors.valor_servico =
            'Valor zero só é permitido para atendimentos SOCIAL';
        }
      }

      if (!formData.empresa_fatura)
        newErrors.empresa_fatura = 'Empresa para faturamento é obrigatória';

      // Validar data no passado ou futuro distante
      if (formData.data_hora) {
        const appointmentDate = parseSupabaseDatetime(formData.data_hora);
        const now = new Date();
        const oneWeekFromNow = new Date();
        oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);

        // Verificar se é data passada
        if (appointmentDate < now && !pastDateConfirmed) {
          const { dismiss } = toast({
            title: 'Data anterior à data atual',
            description:
              'Você está agendando para uma data anterior à data atual. Deseja confirmar este agendamento?',
            variant: 'default',
            duration: 10000, // Toast visível por 10 segundos
            action: (
              <ToastAction
                altText="Confirmar agendamento"
                onClick={async () => {
                  dismiss(); // Dismiss imediatamente
                  setPastDateConfirmed(true);
                  // Usar setTimeout para garantir que o state foi atualizado
                  setTimeout(() => performSave(), 0);
                }}
              >
                Confirmar
              </ToastAction>
            ),
          });
          return false;
        }

        // Verificar se é mais de 1 semana no futuro
        if (appointmentDate > oneWeekFromNow && !futureWeekConfirmed) {
          const { dismiss } = toast({
            title: 'Agendamento para mais de 1 semana',
            description:
              'Você está agendando para mais de 1 semana após a data atual. Deseja confirmar este agendamento?',
            variant: 'default',
            duration: 10000, // Toast visível por 10 segundos
            action: (
              <ToastAction
                altText="Confirmar agendamento"
                onClick={async () => {
                  dismiss(); // Dismiss imediatamente
                  setFutureWeekConfirmed(true);
                  // Usar setTimeout para garantir que o state foi atualizado
                  setTimeout(() => performSave(), 0);
                }}
              >
                Confirmar
              </ToastAction>
            ),
          });
          return false;
        }
      }

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return false;
      }

      setErrors({});

      // Se passou todas as validações, executar o salvamento
      await performSave();
    }, [
      formData,
      toast,
      pastDateConfirmed,
      futureWeekConfirmed,
      performSave,
      selectedServiceName,
    ]);

    // Helper para verificar se a data selecionada é passada
    const isDateInPast = useCallback(() => {
      if (!formData.data_hora) return false;
      const appointmentDate = new Date(formData.data_hora);
      const now = new Date();
      now.setHours(0, 0, 0, 0); // Comparar apenas a data, não a hora
      appointmentDate.setHours(0, 0, 0, 0);
      return appointmentDate < now;
    }, [formData.data_hora]);

    // Helper para verificar se a data é mais de 1 semana no futuro
    const isDateMoreThanOneWeekAhead = useCallback(() => {
      if (!formData.data_hora) return false;
      const appointmentDate = new Date(formData.data_hora);
      const oneWeekFromNow = new Date();
      oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
      oneWeekFromNow.setHours(0, 0, 0, 0);
      appointmentDate.setHours(0, 0, 0, 0);
      return appointmentDate > oneWeekFromNow;
    }, [formData.data_hora]);

    // AI dev note: Limpar estados ao fechar modal
    const handleClose = useCallback(() => {
      setPastDateConfirmed(false);
      setFutureWeekConfirmed(false);
      onClose();
    }, [onClose]);

    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent
          className={cn('max-w-2xl max-h-[90vh] overflow-y-auto', className)}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Novo Agendamento
            </DialogTitle>
            <DialogDescription>
              Preencha os dados para criar um novo agendamento médico.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Erro geral */}
            {errors.general && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{errors.general}</AlertDescription>
              </Alert>
            )}

            {/* Conflito de horário */}
            {hasConflict && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{conflictDetails}</AlertDescription>
              </Alert>
            )}

            {/* Data e Hora */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date">Data *</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.data_hora.split('T')[0] || ''}
                  onChange={(e) => {
                    const time = formData.data_hora.split('T')[1] || '09:00';
                    handleDateTimeChange(`${e.target.value}T${time}`);
                  }}
                  className={cn(errors.data_hora && 'border-destructive')}
                />
                {errors.data_hora && (
                  <p className="text-sm text-destructive">{errors.data_hora}</p>
                )}
                {isDateInPast() && !pastDateConfirmed && (
                  <p className="text-sm text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Data anterior à atual - clique em "Criar Agendamento" para
                    confirmar
                  </p>
                )}
                {isDateMoreThanOneWeekAhead() && !futureWeekConfirmed && (
                  <p className="text-sm text-blue-600 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Agendamento para mais de 1 semana - clique em "Criar
                    Agendamento" para confirmar
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="time">Hora *</Label>
                <Input
                  id="time"
                  type="time"
                  value={formData.data_hora.split('T')[1] || ''}
                  onChange={(e) => {
                    const date =
                      formData.data_hora.split('T')[0] ||
                      format(new Date(), 'yyyy-MM-dd');
                    handleDateTimeChange(`${date}T${e.target.value}`);
                  }}
                  className={cn(errors.data_hora && 'border-destructive')}
                />
              </div>
            </div>

            {/* Paciente */}
            <div className="space-y-2">
              <Label>Paciente *</Label>
              <PatientSelect
                value={formData.paciente_id}
                onValueChange={(value) => updateField('paciente_id', value)}
                error={errors.paciente_id}
                required
              />
            </div>

            {/* Profissional */}
            <div className="space-y-2">
              <Label>Profissional *</Label>
              <ProfessionalSelect
                value={formData.profissional_id}
                onValueChange={handleProfessionalChange}
                error={errors.profissional_id}
                required
              />
            </div>

            {/* Tipo de Serviço e Valor */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de Serviço *</Label>
                <ServiceTypeSelect
                  value={formData.tipo_servico_id}
                  onValueChange={handleServiceTypeChange}
                  error={errors.tipo_servico_id}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="valor">Valor do Serviço *</Label>
                <Input
                  id="valor"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.valor_servico}
                  onChange={(e) =>
                    updateField(
                      'valor_servico',
                      parseFloat(e.target.value) || 0
                    )
                  }
                  placeholder="0,00"
                  className={cn(errors.valor_servico && 'border-destructive')}
                />
                {errors.valor_servico && (
                  <p className="text-sm text-destructive">
                    {errors.valor_servico}
                  </p>
                )}
              </div>
            </div>

            {/* Status */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status da Consulta *</Label>
                <ConsultaStatusSelect
                  value={formData.status_consulta_id}
                  onValueChange={(value: string) =>
                    updateField('status_consulta_id', value)
                  }
                  error={errors.status_consulta_id}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Status do Pagamento *</Label>
                <PagamentoStatusSelect
                  value={formData.status_pagamento_id}
                  onValueChange={(value: string) =>
                    updateField('status_pagamento_id', value)
                  }
                  error={errors.status_pagamento_id}
                  required
                />
              </div>
            </div>

            {/* Empresa para Faturamento */}
            <div className="space-y-2">
              <Label>Empresa para Faturamento *</Label>
              <Select
                value={formData.empresa_fatura}
                onValueChange={(value) => updateField('empresa_fatura', value)}
                disabled={isLoadingEmpresas}
              >
                <SelectTrigger
                  className={cn(errors.empresa_fatura && 'border-destructive')}
                >
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
              {errors.empresa_fatura && (
                <p className="text-sm text-destructive">
                  {errors.empresa_fatura}
                </p>
              )}
            </div>

            {/* Local de Atendimento */}
            <div className="space-y-2">
              <LocationSelect
                value={formData.local_id}
                onChange={(value: string) => updateField('local_id', value)}
                locais={calendarFormData.locaisAtendimento}
                isLoading={formDataLoading}
              />
            </div>

            {/* Observações */}
            <div className="space-y-2">
              <Label htmlFor="observacao">Observações</Label>
              <Textarea
                id="observacao"
                value={formData.observacao}
                onChange={(e) => updateField('observacao', e.target.value)}
                placeholder="Informações adicionais sobre o agendamento..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={isLoading}>
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={isLoading || hasConflict}
              className="min-w-24"
            >
              <Save className="h-4 w-4 mr-2" />
              {isLoading ? 'Salvando...' : 'Criar Agendamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

AppointmentFormManager.displayName = 'AppointmentFormManager';
