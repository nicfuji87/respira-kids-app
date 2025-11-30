import React, { useState, useCallback, useEffect } from 'react';
import { Save, Loader2, Plus, AlertTriangle } from 'lucide-react';

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
import { Switch } from '@/components/primitives/switch';
import { SlotsList } from '@/components/composed/SlotsList';
import { Separator } from '@/components/primitives/separator';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { Badge } from '@/components/primitives/badge';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/primitives/use-toast';
import {
  updateSharedSchedule,
  fetchSlotsWithSelections,
  addSlotsToSchedule,
  removeSlots,
  checkSlotConflict,
  type AppointmentConflictDetail,
} from '@/lib/shared-schedule-api';
import { supabase } from '@/lib/supabase';
import type {
  AgendaCompartilhadaCompleta,
  AgendaSlotComSelecao,
  ServicoDetalhado,
  LocalDetalhado,
  EmpresaDetalhada,
} from '@/types/shared-schedule';

// AI dev note: SharedScheduleEditorDialog - Domain
// Dialog para editar agenda compartilhada existente
// Permite editar informações básicas, opções e gerenciar slots

export interface SharedScheduleEditorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  agenda: AgendaCompartilhadaCompleta | null;
  onSuccess?: () => void;
  className?: string;
}

export const SharedScheduleEditorDialog =
  React.memo<SharedScheduleEditorDialogProps>(
    ({ isOpen, onClose, agenda, onSuccess, className }) => {
      const { toast } = useToast();
      const [isSubmitting, setIsSubmitting] = useState(false);
      const [isLoadingSlots, setIsLoadingSlots] = useState(false);
      const [isLoadingOptions, setIsLoadingOptions] = useState(false);

      // Dados editáveis
      const [titulo, setTitulo] = useState('');
      const [dataInicio, setDataInicio] = useState('');
      const [dataFim, setDataFim] = useState('');
      const [ativo, setAtivo] = useState(true);
      const [servicosSelecionados, setServicosSelecionados] = useState<
        string[]
      >([]);
      const [locaisSelecionados, setLocaisSelecionados] = useState<string[]>(
        []
      );
      const [empresasSelecionadas, setEmpresasSelecionadas] = useState<
        string[]
      >([]);

      // Slots
      const [slots, setSlots] = useState<AgendaSlotComSelecao[]>([]);

      // Adicionar novos slots
      const [selectedDate, setSelectedDate] = useState<string>('');
      const [timeInput, setTimeInput] = useState<string>('');

      // AI dev note: Estado para validação em tempo real de conflitos
      const [slotConflict, setSlotConflict] =
        useState<AppointmentConflictDetail | null>(null);
      const [isCheckingConflict, setIsCheckingConflict] = useState(false);

      // Opções disponíveis
      const [servicos, setServicos] = useState<ServicoDetalhado[]>([]);
      const [locais, setLocais] = useState<LocalDetalhado[]>([]);
      const [empresas, setEmpresas] = useState<EmpresaDetalhada[]>([]);

      // Carregar dados quando agenda mudar
      useEffect(() => {
        if (isOpen && agenda) {
          setTitulo(agenda.titulo);
          setDataInicio(agenda.data_inicio);
          setDataFim(agenda.data_fim);
          setAtivo(agenda.ativo);
          setServicosSelecionados(agenda.servicos.map((s) => s.id));
          setLocaisSelecionados(agenda.locais.map((l) => l.id));
          setEmpresasSelecionadas(agenda.empresas.map((e) => e.id));
          loadSlots(agenda.id);
          loadOptions();
        }
      }, [isOpen, agenda]);

      const loadSlots = async (agendaId: string) => {
        try {
          setIsLoadingSlots(true);
          const result = await fetchSlotsWithSelections(agendaId);
          if (result.success && result.data) {
            setSlots(result.data);
          }
        } catch (error) {
          console.error('Erro ao carregar slots:', error);
        } finally {
          setIsLoadingSlots(false);
        }
      };

      const loadOptions = async () => {
        try {
          setIsLoadingOptions(true);

          const [servicosData, locaisData, empresasData] = await Promise.all([
            supabase
              .from('tipo_servicos')
              .select('id, nome, descricao, duracao_minutos, valor, cor, ativo')
              .eq('ativo', true)
              .order('nome'),
            supabase
              .from('locais_atendimento')
              .select('id, nome, tipo_local, ativo')
              .eq('ativo', true)
              .order('nome'),
            supabase
              .from('pessoa_empresas')
              .select('id, razao_social, nome_fantasia, cnpj, ativo')
              .eq('ativo', true)
              .order('razao_social'),
          ]);

          setServicos((servicosData.data || []) as ServicoDetalhado[]);
          setLocais((locaisData.data || []) as LocalDetalhado[]);
          setEmpresas((empresasData.data || []) as EmpresaDetalhada[]);
        } catch (error) {
          console.error('Erro ao carregar opções:', error);
        } finally {
          setIsLoadingOptions(false);
        }
      };

      // AI dev note: Verificar conflito em tempo real quando data+hora mudam
      useEffect(() => {
        const checkConflict = async () => {
          // Limpar conflito anterior
          setSlotConflict(null);

          // Só verificar se temos data, hora e agenda
          if (!selectedDate || !timeInput || !agenda) return;

          // Validar formato HH:mm
          const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
          if (!timeRegex.test(timeInput)) return;

          setIsCheckingConflict(true);
          try {
            const dateTime = `${selectedDate}T${timeInput}:00`;
            const result = await checkSlotConflict(
              agenda.profissional_id,
              dateTime
            );
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
      }, [selectedDate, timeInput, agenda]);

      const handleSave = useCallback(async () => {
        if (!agenda) return;

        try {
          setIsSubmitting(true);

          // Validações
          if (!titulo.trim()) {
            toast({
              title: 'Título obrigatório',
              variant: 'destructive',
            });
            return;
          }

          if (servicosSelecionados.length === 0) {
            toast({
              title: 'Selecione ao menos um serviço',
              variant: 'destructive',
            });
            return;
          }

          if (locaisSelecionados.length === 0) {
            toast({
              title: 'Selecione ao menos um local',
              variant: 'destructive',
            });
            return;
          }

          if (empresasSelecionadas.length === 0) {
            toast({
              title: 'Selecione ao menos uma empresa',
              variant: 'destructive',
            });
            return;
          }

          // Atualizar agenda (incluindo status ativo)
          const result = await updateSharedSchedule(agenda.id, {
            titulo,
            data_inicio: dataInicio,
            data_fim: dataFim,
            ativo,
            servicos_ids: servicosSelecionados,
            locais_ids: locaisSelecionados,
            empresas_ids: empresasSelecionadas,
          });

          if (!result.success) {
            throw new Error(result.error || 'Erro ao atualizar agenda');
          }

          toast({
            title: 'Agenda atualizada com sucesso!',
          });

          if (onSuccess) {
            onSuccess();
          }

          onClose();
        } catch (error) {
          console.error('Erro ao atualizar agenda:', error);
          toast({
            title: 'Erro ao atualizar agenda',
            description:
              error instanceof Error ? error.message : 'Erro desconhecido',
            variant: 'destructive',
          });
        } finally {
          setIsSubmitting(false);
        }
      }, [
        agenda,
        titulo,
        dataInicio,
        dataFim,
        servicosSelecionados,
        locaisSelecionados,
        empresasSelecionadas,
        toast,
        onSuccess,
        onClose,
      ]);

      const handleAddSlot = useCallback(async () => {
        if (!agenda) return;

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

        try {
          const dateTime = `${selectedDate}T${timeInput}:00`;

          const result = await addSlotsToSchedule({
            agenda_id: agenda.id,
            slots_data_hora: [dateTime],
          });

          if (!result.success) {
            throw new Error(result.error || 'Erro ao adicionar slot');
          }

          toast({
            title: 'Horário adicionado com sucesso!',
          });

          // Recarregar slots
          loadSlots(agenda.id);
          setTimeInput('');
        } catch (error) {
          console.error('Erro ao adicionar slot:', error);
          toast({
            title: 'Erro ao adicionar horário',
            description:
              error instanceof Error ? error.message : 'Erro desconhecido',
            variant: 'destructive',
          });
        }
      }, [agenda, selectedDate, timeInput, toast]);

      const handleRemoveSlot = useCallback(
        async (slotId: string) => {
          if (!agenda) return;

          try {
            const result = await removeSlots([slotId]);

            if (!result.success) {
              throw new Error(result.error || 'Erro ao remover slot');
            }

            toast({
              title: 'Horário removido com sucesso!',
            });

            // Recarregar slots
            loadSlots(agenda.id);
          } catch (error) {
            console.error('Erro ao remover slot:', error);
            toast({
              title: 'Erro ao remover horário',
              description:
                error instanceof Error ? error.message : 'Erro desconhecido',
              variant: 'destructive',
            });
          }
        },
        [agenda, toast]
      );

      const handleRemoveOccupiedSlot = useCallback(
        async (slotId: string, slotInfo: { paciente_nome?: string }) => {
          if (!agenda) return;

          // Confirmar remoção de slot ocupado
          if (
            !window.confirm(
              `Este horário está ocupado${slotInfo.paciente_nome ? ` por ${slotInfo.paciente_nome}` : ''}.\n\n` +
                'Remover este slot irá marcá-lo como deletado mas manterá o agendamento.\n\n' +
                'Deseja continuar?'
            )
          ) {
            return;
          }

          try {
            const result = await removeSlots([slotId], true); // forceRemoveOccupied = true

            if (!result.success) {
              throw new Error(result.error || 'Erro ao remover slot');
            }

            toast({
              title: 'Slot removido com sucesso!',
              description: 'O agendamento foi mantido.',
            });

            // Recarregar slots
            loadSlots(agenda.id);
          } catch (error) {
            console.error('Erro ao remover slot ocupado:', error);
            toast({
              title: 'Erro ao remover horário',
              description:
                error instanceof Error ? error.message : 'Erro desconhecido',
              variant: 'destructive',
            });
          }
        },
        [agenda, toast]
      );

      if (!agenda) return null;

      return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
          <DialogContent
            className={cn('w-[95vw] sm:max-w-4xl', 'p-4 sm:p-6', className)}
          >
            <DialogHeader className="pb-4">
              <DialogTitle>Editar Agenda Compartilhada</DialogTitle>
              <DialogDescription>
                Altere as informações da agenda e gerencie os horários
                disponíveis
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-[60vh] overflow-y-auto -mx-4 sm:-mx-6 px-4 sm:px-6">
              <div className="space-y-3 sm:space-y-6">
                {/* Informações Básicas */}
                <div className="space-y-3 sm:space-y-4">
                  <h3 className="text-sm font-semibold">Informações Básicas</h3>

                  <div className="space-y-2">
                    <Label htmlFor="edit-titulo" className="text-xs sm:text-sm">
                      Título *
                    </Label>
                    <Input
                      id="edit-titulo"
                      value={titulo}
                      onChange={(e) => setTitulo(e.target.value)}
                      maxLength={100}
                      className="h-9 sm:h-10"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs sm:text-sm">
                        Data de Início
                      </Label>
                      <DatePicker value={dataInicio} onChange={setDataInicio} />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs sm:text-sm">Data de Fim</Label>
                      <DatePicker value={dataFim} onChange={setDataFim} />
                    </div>
                  </div>

                  {/* AI dev note: Switch para ativar/inativar agenda */}
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                    <div className="space-y-0.5">
                      <Label
                        htmlFor="edit-ativo"
                        className="text-sm font-medium cursor-pointer"
                      >
                        Status da Agenda
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {ativo
                          ? 'Agenda ativa e acessível pelo link público'
                          : 'Agenda inativa - link não está acessível'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={ativo ? 'default' : 'secondary'}>
                        {ativo ? 'Ativa' : 'Inativa'}
                      </Badge>
                      <Switch
                        id="edit-ativo"
                        checked={ativo}
                        onCheckedChange={setAtivo}
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Serviços */}
                <div className="space-y-3 sm:space-y-4">
                  <h3 className="text-sm font-semibold">
                    Serviços Disponíveis *
                  </h3>
                  {isLoadingOptions ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {servicos.map((servico) => (
                        <div
                          key={servico.id}
                          className="flex items-center space-x-2 p-2 rounded border"
                        >
                          <Checkbox
                            id={`edit-servico-${servico.id}`}
                            checked={servicosSelecionados.includes(servico.id)}
                            onCheckedChange={(checked) => {
                              setServicosSelecionados((prev) =>
                                checked
                                  ? [...prev, servico.id]
                                  : prev.filter((id) => id !== servico.id)
                              );
                            }}
                          />
                          <Label
                            htmlFor={`edit-servico-${servico.id}`}
                            className="text-sm cursor-pointer flex-1"
                          >
                            {servico.nome}
                          </Label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Separator />

                {/* Locais */}
                <div className="space-y-3 sm:space-y-4">
                  <h3 className="text-sm font-semibold">
                    Locais de Atendimento *
                  </h3>
                  {isLoadingOptions ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {locais.map((local) => (
                        <div
                          key={local.id}
                          className="flex items-center space-x-2 p-2 rounded border"
                        >
                          <Checkbox
                            id={`edit-local-${local.id}`}
                            checked={locaisSelecionados.includes(local.id)}
                            onCheckedChange={(checked) => {
                              setLocaisSelecionados((prev) =>
                                checked
                                  ? [...prev, local.id]
                                  : prev.filter((id) => id !== local.id)
                              );
                            }}
                          />
                          <Label
                            htmlFor={`edit-local-${local.id}`}
                            className="text-sm cursor-pointer flex-1"
                          >
                            {local.nome}
                          </Label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Separator />

                {/* Empresas */}
                <div className="space-y-3 sm:space-y-4">
                  <h3 className="text-sm font-semibold">
                    Empresas de Faturamento *
                  </h3>
                  {isLoadingOptions ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {empresas.map((empresa) => (
                        <div
                          key={empresa.id}
                          className="flex items-center space-x-2 p-2 rounded border"
                        >
                          <Checkbox
                            id={`edit-empresa-${empresa.id}`}
                            checked={empresasSelecionadas.includes(empresa.id)}
                            onCheckedChange={(checked) => {
                              setEmpresasSelecionadas((prev) =>
                                checked
                                  ? [...prev, empresa.id]
                                  : prev.filter((id) => id !== empresa.id)
                              );
                            }}
                          />
                          <Label
                            htmlFor={`edit-empresa-${empresa.id}`}
                            className="text-sm cursor-pointer flex-1"
                          >
                            {empresa.nome_fantasia || empresa.razao_social}
                          </Label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Separator />

                {/* Gerenciar Slots */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Gerenciar Horários</h3>

                  {/* Adicionar novo slot - Layout otimizado mobile */}
                  <div className="space-y-2">
                    <div className="flex flex-col gap-2">
                      <div className="w-full">
                        <Label className="text-xs text-muted-foreground mb-1">
                          Data
                        </Label>
                        <DatePicker
                          value={selectedDate}
                          onChange={setSelectedDate}
                          placeholder="Selecione a data"
                        />
                      </div>
                      <div className="w-full">
                        <Label className="text-xs text-muted-foreground mb-1">
                          Horário
                        </Label>
                        <Input
                          type="time"
                          value={timeInput}
                          onChange={(e) => setTimeInput(e.target.value)}
                          className={cn(
                            'w-full h-10',
                            slotConflict && 'border-amber-500'
                          )}
                        />
                      </div>
                    </div>

                    {/* AI dev note: Aviso de conflito em tempo real */}
                    {slotConflict && (
                      <Alert
                        variant="destructive"
                        className="bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-200"
                      >
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                          <strong>Horário já agendado!</strong> Paciente:{' '}
                          {slotConflict.paciente_nome}
                        </AlertDescription>
                      </Alert>
                    )}

                    <Button
                      type="button"
                      onClick={handleAddSlot}
                      disabled={!selectedDate || !timeInput || !!slotConflict}
                      className="w-full"
                      size="sm"
                    >
                      {isCheckingConflict ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Plus className="w-4 h-4 mr-2" />
                      )}
                      Adicionar Horário
                    </Button>
                  </div>

                  {/* Lista de slots - mais compacta */}
                  {isLoadingSlots ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                  ) : slots.length > 0 ? (
                    <div className="pt-2">
                      <SlotsList
                        slots={slots}
                        onRemoveSlot={handleRemoveSlot}
                        onRemoveOccupiedSlot={handleRemoveOccupiedSlot}
                        showRemoveOccupied={true}
                        disableScroll={true}
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhum horário cadastrado
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
                className="w-full sm:w-auto"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSubmitting}
                className="w-full sm:w-auto"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Salvar Alterações
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      );
    }
  );

SharedScheduleEditorDialog.displayName = 'SharedScheduleEditorDialog';
