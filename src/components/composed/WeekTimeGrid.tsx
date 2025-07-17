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

import { Card, CardContent } from '@/components/primitives/card';
import { ScrollArea } from '@/components/primitives/scroll-area';
import { cn } from '@/lib/utils';
import { CurrentTimeIndicator } from './CurrentTimeIndicator';
import { WeekEventBlock } from './WeekEventBlock';
import { EventListModal } from '../domain/calendar';
import type { CalendarEvent } from '@/types/calendar';

// AI dev note: WeekTimeGrid é um Composed component
// Grid principal da view semana com horários, dias, eventos proporcionais e indicadores

export interface WeekTimeGridProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  onTimeSlotClick?: (time: string, date: Date) => void;
  startHour?: number;
  endHour?: number;
  hourHeight?: number;
  className?: string;
  userRole?: 'admin' | 'profissional' | 'secretaria' | null;
}

export const WeekTimeGrid = React.memo<WeekTimeGridProps>(
  ({
    currentDate,
    events,
    onEventClick,
    onTimeSlotClick,
    startHour = 7,
    endHour = 22,
    hourHeight = 64,
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
      const weekStart = startOfWeek(currentDate, { locale: ptBR });
      const weekEnd = endOfWeek(currentDate, { locale: ptBR });
      return eachDayOfInterval({ start: weekStart, end: weekEnd });
    }, [currentDate]);

    // Gera array de horários
    const timeSlots = useMemo(() => {
      return Array.from({ length: endHour - startHour }, (_, i) => {
        const hour = i + startHour;
        return `${hour.toString().padStart(2, '0')}:00`;
      });
    }, [startHour, endHour]);

    // Agrupa eventos por dia e detecta sobreposições
    const eventsGroupedByDay = useMemo(() => {
      const grouped: Record<string, CalendarEvent[]> = {};

      weekDays.forEach((day) => {
        const dayKey = day.toISOString().split('T')[0];
        grouped[dayKey] = events.filter((event) => isSameDay(event.start, day));
      });

      return grouped;
    }, [weekDays, events]);

    // Detecta eventos sobrepostos e calcula posicionamento
    const getEventsWithOverlapData = (dayEvents: CalendarEvent[]) => {
      return dayEvents.map((event) => {
        // Encontra eventos que se sobrepõem com este
        const overlapping = dayEvents.filter((otherEvent) => {
          if (otherEvent.id === event.id) return false;

          const eventStart = event.start.getTime();
          const eventEnd = event.end.getTime();
          const otherStart = otherEvent.start.getTime();
          const otherEnd = otherEvent.end.getTime();

          // Verifica sobreposição
          return eventStart < otherEnd && eventEnd > otherStart;
        });

        // Todos os eventos sobrepostos incluindo o atual
        const allOverlapping = [event, ...overlapping].sort(
          (a, b) => a.start.getTime() - b.start.getTime()
        );

        return {
          event,
          overlapIndex: allOverlapping.findIndex((e) => e.id === event.id),
          totalOverlapping: allOverlapping.length,
        };
      });
    };

    // Agrupa eventos por time slot para detectar múltiplos
    const getEventsPerTimeSlot = (dayEvents: CalendarEvent[], time: string) => {
      const [hours] = time.split(':').map(Number);
      return dayEvents.filter((event) => {
        const eventHour = event.start.getHours();
        return eventHour === hours;
      });
    };

    const handleTimeSlotClick = (time: string, date: Date) => {
      const dayKey = date.toISOString().split('T')[0];
      const dayEvents = eventsGroupedByDay[dayKey] || [];
      const slotEvents = getEventsPerTimeSlot(dayEvents, time);

      // Se há mais de 2 eventos, abre modal
      if (slotEvents.length > 2) {
        setModalState({
          isOpen: true,
          date,
          events: slotEvents,
        });
        return;
      }

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
        <Card className={cn('overflow-hidden', className)}>
          <CardContent className="p-0">
            {/* Header com dias da semana */}
            <div className="grid grid-cols-8 border-b bg-muted/50 sticky top-0 z-20">
              <div className="p-4 border-r">
                <div className="text-sm font-medium text-muted-foreground">
                  Horário
                </div>
              </div>
              {weekDays.map((day) => {
                const isCurrentDay = isToday(day);
                return (
                  <div
                    key={day.toISOString()}
                    className="p-4 border-r last:border-r-0"
                  >
                    <div className="text-center">
                      <div
                        className={cn(
                          'text-sm font-medium capitalize',
                          isCurrentDay && 'text-primary'
                        )}
                      >
                        {format(day, 'EEE', { locale: ptBR })}
                      </div>
                      <div
                        className={cn(
                          'text-lg font-bold mt-1',
                          isCurrentDay && 'text-primary'
                        )}
                      >
                        {format(day, 'd')}
                      </div>
                      {isCurrentDay && (
                        <div className="w-2 h-2 bg-primary rounded-full mx-auto mt-1" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Grid de horários */}
            <ScrollArea className="h-[calc(100vh-8rem)]">
              <div className="relative">
                <div className="grid grid-cols-8 min-h-full">
                  {/* Coluna de horários */}
                  <div className="border-r bg-muted/20">
                    {timeSlots.map((time) => (
                      <div
                        key={time}
                        className="border-b text-xs text-muted-foreground font-medium p-3"
                        style={{ height: `${hourHeight}px` }}
                      >
                        {time}
                      </div>
                    ))}
                  </div>

                  {/* Colunas dos dias */}
                  {weekDays.map((day) => {
                    const dayKey = day.toISOString().split('T')[0];
                    const dayEvents = eventsGroupedByDay[dayKey] || [];
                    const eventsWithOverlap =
                      getEventsWithOverlapData(dayEvents);

                    return (
                      <div
                        key={day.toISOString()}
                        className="border-r last:border-r-0 relative"
                        style={{
                          minHeight: `${timeSlots.length * hourHeight}px`,
                        }}
                      >
                        {/* Slots de horário clicáveis */}
                        {timeSlots.map((time) => {
                          const slotEvents = getEventsPerTimeSlot(
                            dayEvents,
                            time
                          );
                          const hasMultipleEvents = slotEvents.length > 2;

                          return (
                            <div
                              key={time}
                              className={cn(
                                'border-b hover:bg-muted/10 cursor-pointer',
                                'transition-colors group relative'
                              )}
                              style={{ height: `${hourHeight}px` }}
                              onClick={() => handleTimeSlotClick(time, day)}
                            >
                              {hasMultipleEvents && (
                                <div className="absolute top-1 right-1 text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full font-medium z-10">
                                  +{slotEvents.length - 2}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* Eventos renderizados sobre os slots */}
                        {eventsWithOverlap.map(
                          ({ event, overlapIndex, totalOverlapping }) => (
                            <WeekEventBlock
                              key={event.id}
                              event={event}
                              startHour={startHour}
                              endHour={endHour}
                              hourHeight={hourHeight}
                              onClick={handleEventClick}
                              overlapIndex={overlapIndex}
                              totalOverlapping={Math.min(totalOverlapping, 2)} // Máximo 2 visíveis
                              userRole={userRole}
                            />
                          )
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Indicador de tempo atual */}
                <CurrentTimeIndicator
                  startHour={startHour}
                  endHour={endHour}
                  className="ml-[12.5%]" // Offset para pular coluna de horários
                />
              </div>
            </ScrollArea>
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
