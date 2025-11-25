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

    // Detecção simples de sobreposições
    const getEventsWithOverlapData = (dayEvents: CalendarEvent[]) => {
      return dayEvents.map((event) => {
        // Busca eventos no mesmo horário exato
        const sameTimeEvents = dayEvents.filter((otherEvent) => {
          if (otherEvent.id === event.id) return false;
          return event.start.getTime() === otherEvent.start.getTime();
        });

        if (sameTimeEvents.length === 0) {
          // Evento único no horário
          return {
            event,
            overlapIndex: 0,
            totalOverlapping: 1,
          };
        }

        // Eventos no mesmo horário - ordenar por ID para consistência
        const allSameTime = [event, ...sameTimeEvents].sort((a, b) =>
          a.id.localeCompare(b.id)
        );

        return {
          event,
          overlapIndex: allSameTime.findIndex((e) => e.id === event.id),
          totalOverlapping: allSameTime.length,
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
              {/* Coluna de horários - responsiva */}
              <div className="border-r bg-muted/10">
                {timeSlots.map((time) => (
                  <div
                    key={time}
                    className="h-12 md:h-14 lg:h-16 border-b p-1 md:p-1.5 lg:p-2 text-[9px] md:text-[10px] lg:text-xs text-muted-foreground font-medium text-center flex items-center justify-center"
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
                        {/* Slots de horário clicáveis - altura responsiva */}
                        {timeSlots.map((time) => (
                          <div
                            key={time}
                            className="h-12 md:h-14 lg:h-16 border-b hover:bg-muted/20 cursor-pointer transition-colors"
                            onClick={() => handleTimeSlotClick(time, day)}
                          />
                        ))}

                        {/* Eventos renderizados sobre os slots */}
                        {eventsWithOverlap.map(
                          ({ event, overlapIndex, totalOverlapping }) => {
                            // HourHeight responsivo: 48px mobile (h-12), 56px tablet (h-14), 64px desktop (h-16)
                            // Usar 48px como base (mobile first) - os slots já estão ajustados via CSS
                            const responsiveHourHeight = 48;

                            return (
                              <WeekEventBlock
                                key={event.id}
                                event={event}
                                startHour={startHour}
                                endHour={endHour}
                                hourHeight={responsiveHourHeight}
                                onClick={handleEventClick}
                                overlapIndex={overlapIndex}
                                totalOverlapping={totalOverlapping}
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
