import React, { useState, useCallback, useEffect } from 'react';
import { Save, Loader2, Plus } from 'lucide-react';

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
import { SlotsList } from '@/components/composed/SlotsList';
import { Separator } from '@/components/primitives/separator';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/primitives/use-toast';
import {
  updateSharedSchedule,
  fetchSlotsWithSelections,
  addSlotsToSchedule,
  removeSlots,
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

          // Atualizar agenda
          const result = await updateSharedSchedule(agenda.id, {
            titulo,
            data_inicio: dataInicio,
            data_fim: dataFim,
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
            className={cn(
              'w-[95vw] max-w-4xl',
              'max-h-[90vh]',
              'flex flex-col',
              'overflow-hidden',
              className
            )}
          >
            <DialogHeader>
              <DialogTitle>Editar Agenda Compartilhada</DialogTitle>
              <DialogDescription>
                Altere as informações da agenda e gerencie os horários
                disponíveis
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="flex-1 min-h-0 pr-2 sm:pr-4">
              <div className="space-y-4 sm:space-y-6 py-2 sm:py-4">
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
                </div>

                <Separator />

                {/* Serviços */}
                <div className="space-y-4">
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
                <div className="space-y-4">
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
                <div className="space-y-4">
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
                          className="w-full h-10"
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      onClick={handleAddSlot}
                      disabled={!selectedDate || !timeInput}
                      className="w-full"
                      size="sm"
                    >
                      <Plus className="w-4 h-4 mr-2" />
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
            </ScrollArea>

            {/* Footer */}
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-4 border-t mt-auto bg-background">
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
