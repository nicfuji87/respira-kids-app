import React, { useState, useMemo } from 'react';
import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isToday,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/primitives/card';
import { CurrentTimeIndicator } from './CurrentTimeIndicator';
import { WeekEventBlock } from './WeekEventBlock';
import { EventListModal } from '../domain/calendar';
import type { CalendarEvent } from '@/types/calendar';

// AI dev note: WeekTimeGrid simplificado e limpo
// Grid semanal com layout simples e funcional

export interface WeekTimeGridProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  onTimeSlotClick?: (time: string, date: Date) => void;
  startHour?: number;
  endHour?: number;
  className?: string;
  userRole?: 'admin' | 'profissional' | 'secretaria' | null;
}

export const WeekTimeGrid = React.memo<WeekTimeGridProps>(
  ({
    currentDate,
    events,
    onEventClick,
    onTimeSlotClick,
    startHour = 7, // AI dev note: Alterado de 6 para 7 conforme solicitação
    endHour = 20,
    className,
    userRole,
  }) => {
    // Estado para modal de eventos múltiplos
    const [modalState, setModalState] = useState<{
      isOpen: boolean;
      date: Date | null;
      events: CalendarEvent[];
    }>({
      isOpen: false,
      date: null,
      events: [],
    });

    // Calcula dias da semana
    const weekDays = useMemo(() => {
      const weekStart = startOfWeek(currentDate, {
        weekStartsOn: 1,
        locale: ptBR,
      });
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1, locale: ptBR });
      return eachDayOfInterval({ start: weekStart, end: weekEnd });
    }, [currentDate]);

    // Gera array de horários
    const timeSlots = useMemo(() => {
      return Array.from({ length: endHour - startHour }, (_, i) => {
        const hour = i + startHour;
        return `${hour.toString().padStart(2, '0')}:00`;
      });
    }, [startHour, endHour]);

    // Agrupa eventos por dia
    const eventsGroupedByDay = useMemo(() => {
      const grouped: Record<string, CalendarEvent[]> = {};

      weekDays.forEach((day) => {
        const dayKey = day.toISOString().split('T')[0];
        grouped[dayKey] = events.filter((event) => isSameDay(event.start, day));
      });

      return grouped;
    }, [weekDays, events]);

    // AI dev note: Detecção de sobreposições estilo Google Agenda
    // Eventos se sobrepõem parcialmente, mantendo largura mínima legível
    // Eventos que começam depois ficam "por cima" (maior z-index)
    const getEventsWithOverlapData = (dayEvents: CalendarEvent[]) => {
      if (dayEvents.length === 0) return [];

      // Função para verificar se dois eventos se sobrepõem no tempo
      const eventsOverlap = (a: CalendarEvent, b: CalendarEvent): boolean => {
        return a.start < b.end && a.end > b.start;
      };

      // Ordenar por horário de início
      const sortedEvents = [...dayEvents].sort(
        (a, b) => a.start.getTime() - b.start.getTime()
      );

      // Para cada evento, calcular quantos eventos estão ativos no mesmo momento
      // e qual a posição horizontal (coluna) do evento
      const layoutInfo: Map<
        string,
        { column: number; maxColumns: number; zIndex: number }
      > = new Map();

      // Algoritmo de colunas: cada evento ocupa a primeira coluna livre
      const columns: CalendarEvent[][] = [];

      sortedEvents.forEach((event, eventIndex) => {
        // Encontrar a primeira coluna onde o evento não sobrepõe nenhum outro
        let columnIndex = 0;
        let placed = false;

        while (!placed) {
          if (!columns[columnIndex]) {
            columns[columnIndex] = [];
          }

          // Verificar se há conflito nesta coluna
          const hasConflict = columns[columnIndex].some((e) =>
            eventsOverlap(e, event)
          );

          if (!hasConflict) {
            columns[columnIndex].push(event);
            placed = true;
          } else {
            columnIndex++;
          }
        }

        // Contar quantas colunas são necessárias no momento deste evento
        let maxCols = 1;
        for (let i = 0; i < columns.length; i++) {
          if (columns[i].some((e) => eventsOverlap(e, event))) {
            maxCols = Math.max(maxCols, i + 1);
          }
        }
        // Incluir a própria coluna do evento
        maxCols = Math.max(maxCols, columnIndex + 1);

        layoutInfo.set(event.id, {
          column: columnIndex,
          maxColumns: maxCols,
          zIndex: eventIndex + 1, // Eventos posteriores ficam por cima
        });
      });

      // Segunda passada: recalcular maxColumns considerando todos os vizinhos
      sortedEvents.forEach((event) => {
        const info = layoutInfo.get(event.id)!;
        let trueMaxCols = info.maxColumns;

        // Verificar todos os eventos que sobrepõem este
        sortedEvents.forEach((other) => {
          if (other.id !== event.id && eventsOverlap(event, other)) {
            const otherInfo = layoutInfo.get(other.id)!;
            trueMaxCols = Math.max(trueMaxCols, otherInfo.column + 1);
          }
        });

        layoutInfo.set(event.id, { ...info, maxColumns: trueMaxCols });
      });

      return dayEvents.map((event) => {
        const info = layoutInfo.get(event.id) || {
          column: 0,
          maxColumns: 1,
          zIndex: 1,
        };
        return {
          event,
          overlapIndex: info.column,
          totalOverlapping: info.maxColumns,
          zIndex: info.zIndex,
        };
      });
    };

    const handleTimeSlotClick = (time: string, date: Date) => {
      onTimeSlotClick?.(time, date);
    };

    const handleEventClick = (event: CalendarEvent) => {
      onEventClick?.(event);
    };

    const closeModal = () => {
      setModalState({ isOpen: false, date: null, events: [] });
    };

    return (
      <>
        {/* Grid semanal - estrutura igual ao CalendarGrid */}
        <Card className={cn('overflow-hidden', className)}>
          <CardContent className="p-0">
            {/* Header com dias da semana - responsivo */}
            <div className="w-full grid grid-cols-8 border-b bg-muted/30">
              <div className="p-1 md:p-2 lg:p-3 border-r bg-muted/50 text-center">
                <div className="text-[10px] md:text-xs lg:text-sm font-medium">
                  Horário
                </div>
              </div>
              {weekDays.map((day) => {
                const isCurrentDay = isToday(day);
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      'p-1 md:p-2 lg:p-3 border-r last:border-r-0 text-center',
                      isCurrentDay && 'bg-primary/15'
                    )}
                  >
                    <div className="text-center">
                      <div
                        className={cn(
                          'text-[10px] md:text-xs lg:text-sm font-medium capitalize',
                          isCurrentDay && 'text-primary font-semibold'
                        )}
                      >
                        <span className="md:hidden">
                          {format(day, 'EEE', { locale: ptBR }).charAt(0)}
                        </span>
                        <span className="hidden md:inline">
                          {format(day, 'EEE', { locale: ptBR })}
                        </span>
                      </div>
                      <div
                        className={cn(
                          'text-sm md:text-base lg:text-lg font-bold mt-0.5 md:mt-1',
                          isCurrentDay && 'text-primary'
                        )}
                      >
                        {format(day, 'd')}
                      </div>
                      {isCurrentDay && (
                        <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-primary rounded-full mx-auto mt-0.5 md:mt-1" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Grid de horários - altura e overflow EXATOS do CalendarGrid */}
            <div className="w-full grid grid-cols-8 relative h-[calc(100vh-12rem)] md:h-[calc(100vh-10rem)] overflow-y-auto">
              {/* Coluna de horários - altura fixa para consistência com posicionamento de eventos */}
              <div className="border-r bg-muted/10">
                {timeSlots.map((time) => (
                  <div
                    key={time}
                    className="h-12 border-b p-1 text-[9px] md:text-[10px] text-muted-foreground font-medium text-center flex items-center justify-center"
                  >
                    {time}
                  </div>
                ))}
              </div>

              {/* Container para colunas dos dias com indicador */}
              <div className="col-span-7 relative">
                {/* Grid interno para os dias */}
                <div className="grid grid-cols-7 h-full">
                  {weekDays.map((day) => {
                    const dayKey = day.toISOString().split('T')[0];
                    const dayEvents = eventsGroupedByDay[dayKey] || [];
                    const eventsWithOverlap =
                      getEventsWithOverlapData(dayEvents);
                    const isCurrentDay = isToday(day);

                    return (
                      <div
                        key={day.toISOString()}
                        className={cn(
                          'border-r last:border-r-0 relative',
                          isCurrentDay && 'bg-primary/5'
                        )}
                        style={{
                          minHeight: `${timeSlots.length * 48}px`, // 48px no mobile (h-12)
                        }}
                      >
                        {/* Slots de horário clicáveis - altura fixa para consistência */}
                        {timeSlots.map((time) => (
                          <div
                            key={time}
                            className="h-12 border-b hover:bg-muted/20 cursor-pointer transition-colors"
                            onClick={() => handleTimeSlotClick(time, day)}
                          />
                        ))}

                        {/* Eventos renderizados sobre os slots */}
                        {eventsWithOverlap.map(
                          ({
                            event,
                            overlapIndex,
                            totalOverlapping,
                            zIndex,
                          }) => {
                            // AI dev note: Altura fixa de 48px (h-12) consistente com slots
                            const hourHeight = 48;

                            return (
                              <WeekEventBlock
                                key={event.id}
                                event={event}
                                startHour={startHour}
                                endHour={endHour}
                                hourHeight={hourHeight}
                                onClick={handleEventClick}
                                overlapIndex={overlapIndex}
                                totalOverlapping={totalOverlapping}
                                zIndex={zIndex}
                                userRole={userRole}
                              />
                            );
                          }
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Indicador de tempo atual DENTRO do container dos dias */}
                <CurrentTimeIndicator
                  startHour={startHour}
                  endHour={endHour}
                  className="absolute left-0 right-0"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Modal para eventos múltiplos */}
        {modalState.date && (
          <EventListModal
            isOpen={modalState.isOpen}
            onClose={closeModal}
            events={modalState.events}
            date={modalState.date}
            onEventClick={handleEventClick}
          />
        )}
      </>
    );
  }
);

WeekTimeGrid.displayName = 'WeekTimeGrid';
