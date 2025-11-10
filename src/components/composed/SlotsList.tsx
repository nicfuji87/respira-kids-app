import React from 'react';
import { Calendar, Clock, User, Trash2, CheckCircle2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import { ScrollArea } from '@/components/primitives/scroll-area';
import { cn } from '@/lib/utils';
import type { AgendaSlotComSelecao } from '@/types/shared-schedule';

// AI dev note: SlotsList - Composed
// Combina ScrollArea + Badge + Button para exibir lista de slots
// Separa slots disponíveis e ocupados com informações das seleções

export interface SlotsListProps {
  slots: AgendaSlotComSelecao[];
  onRemoveSlot?: (slotId: string) => void;
  maxHeight?: string;
  className?: string;
}

export const SlotsList = React.memo<SlotsListProps>(
  ({ slots, onRemoveSlot, maxHeight = '400px', className }) => {
    const slotsDisponiveis = slots.filter((s) => s.disponivel);
    const slotsOcupados = slots.filter((s) => !s.disponivel);

    const formatSlotDateTime = (dataHora: string) => {
      const date = parseISO(dataHora);
      const dia = format(date, "EEEE, dd/MM", { locale: ptBR });
      const hora = format(date, 'HH:mm', { locale: ptBR });
      return { dia, hora };
    };

    return (
      <div className={cn('space-y-4', className)}>
        {/* Slots Disponíveis */}
        {slotsDisponiveis.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4 text-green-600" />
                Slots Disponíveis ({slotsDisponiveis.length})
              </h4>
            </div>

            <ScrollArea style={{ maxHeight }} className="pr-4">
              <div className="space-y-2">
                {slotsDisponiveis.map((slot) => {
                  const { dia, hora } = formatSlotDateTime(slot.data_hora);
                  return (
                    <div
                      key={slot.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <div>
                          <p className="text-sm font-medium capitalize">
                            {dia}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {hora}
                          </p>
                        </div>
                      </div>

                      {onRemoveSlot && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onRemoveSlot(slot.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Slots Ocupados */}
        {slotsOcupados.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
                Slots Ocupados ({slotsOcupados.length})
              </h4>
            </div>

            <ScrollArea style={{ maxHeight }} className="pr-4">
              <div className="space-y-2">
                {slotsOcupados.map((slot) => {
                  const { dia, hora } = formatSlotDateTime(slot.data_hora);
                  return (
                    <div
                      key={slot.id}
                      className="p-3 rounded-lg border bg-muted/50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Calendar className="w-3 h-3 text-muted-foreground" />
                              <p className="text-sm font-medium capitalize">
                                {dia} - {hora}
                              </p>
                            </div>

                            {slot.selecao && (
                              <div className="space-y-1 text-xs text-muted-foreground">
                                <p className="flex items-center gap-1">
                                  <User className="w-3 h-3" />
                                  <span className="truncate">
                                    {slot.selecao.paciente_nome} (
                                    {slot.selecao.responsavel_nome})
                                  </span>
                                </p>
                                <p className="truncate">
                                  {slot.selecao.servico_nome}
                                  {slot.selecao.local_nome &&
                                    ` • ${slot.selecao.local_nome}`}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>

                        <Badge variant="secondary" className="shrink-0">
                          Ocupado
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Nenhum slot */}
        {slots.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Nenhum slot cadastrado ainda
          </div>
        )}
      </div>
    );
  }
);

SlotsList.displayName = 'SlotsList';


