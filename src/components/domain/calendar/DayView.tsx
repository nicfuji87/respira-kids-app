import React, { useState, useMemo } from 'react';
import { format, isSameDay, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { cn } from '@/lib/utils';
import { CurrentTimeIndicator, WeekEventBlock } from '@/components/composed';
import { EventListModal } from '../calendar';
import type { CalendarEvent } from '@/types/calendar';

// AI dev note: DayView combina TimeSlot Composed
// Vista diária com timeline detalhada

export interface DayViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  onTimeSlotClick?: (time: string, date: Date) => void;
  className?: string;
  userRole?: 'admin' | 'profissional' | 'secretaria' | null;
}

export const DayView = React.memo<DayViewProps>(
  ({
    currentDate,
    events,
    onEventClick,
    onTimeSlotClick,
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

    // Constantes do grid
    const startHour = 6;
    const endHour = 20;
    const hourHeight = 64;

    // Gerar array de horários
    const timeSlots = useMemo(() => {
      return Array.from({ length: endHour - startHour }, (_, i) => {
        const hour = i + startHour;
        return `${hour.toString().padStart(2, '0')}:00`;
      });
    }, [startHour, endHour]);

    // Filtrar eventos do dia atual
    const dayEvents = useMemo(() => {
      return events.filter((event) => isSameDay(event.start, currentDate));
    }, [events, currentDate]);

    // Detecta eventos sobrepostos e calcula posicionamento
    const getEventsWithOverlapData = (events: CalendarEvent[]) => {
      return events.map((event) => {
        // Encontra eventos que se sobrepõem com este
        const overlapping = events.filter((otherEvent) => {
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
    const getEventsPerTimeSlot = (events: CalendarEvent[], time: string) => {
      const [hours] = time.split(':').map(Number);
      return events.filter((event) => {
        const eventHour = event.start.getHours();
        return eventHour === hours;
      });
    };

    const handleTimeSlotClick = (time: string) => {
      const slotEvents = getEventsPerTimeSlot(dayEvents, time);

      // Se há mais de 2 eventos, abre modal
      if (slotEvents.length > 2) {
        setModalState({
          isOpen: true,
          date: currentDate,
          events: slotEvents,
        });
        return;
      }

      onTimeSlotClick?.(time, currentDate);
    };

    const handleEventClick = (event: CalendarEvent) => {
      onEventClick?.(event);
    };

    const closeModal = () => {
      setModalState({ isOpen: false, date: null, events: [] });
    };

    const dayLabel = format(currentDate, "EEEE, dd 'de' MMMM", {
      locale: ptBR,
    });

    const isCurrentDay = isToday(currentDate);
    const eventsWithOverlap = getEventsWithOverlapData(dayEvents);

    return (
      <>
        {/* Grid diário simples que expande naturalmente */}
        <div className={cn('w-full', className)}>
          {/* Header com dia */}
          <div className="border-b bg-muted/30 p-4">
            <h2
              className={cn(
                'text-lg font-semibold capitalize',
                isCurrentDay && 'text-primary'
              )}
            >
              {dayLabel}
              {isCurrentDay && (
                <span className="ml-2 text-sm font-normal text-primary">
                  (Hoje)
                </span>
              )}
            </h2>
          </div>

          {/* Grid de horários que se adapta ao container */}
          <div className="w-full grid grid-cols-[80px_1fr]">
            {/* Coluna de horários */}
            <div className="border-r bg-muted/10">
              {timeSlots.map((time) => (
                <div
                  key={time}
                  className="border-b text-xs text-muted-foreground font-medium p-3 text-center"
                  style={{ height: `${hourHeight}px` }}
                >
                  {time}
                </div>
              ))}
            </div>

            {/* Coluna de eventos */}
            <div
              className="relative"
              style={{ minHeight: `${timeSlots.length * hourHeight}px` }}
            >
              {/* Slots de horário clicáveis */}
              {timeSlots.map((time) => {
                const slotEvents = getEventsPerTimeSlot(dayEvents, time);
                const hasMultipleEvents = slotEvents.length > 2;

                return (
                  <div
                    key={time}
                    className={cn(
                      'border-b hover:bg-muted/10 cursor-pointer',
                      'transition-colors group relative'
                    )}
                    style={{ height: `${hourHeight}px` }}
                    onClick={() => handleTimeSlotClick(time)}
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
                    totalOverlapping={Math.min(totalOverlapping, 3)} // Máximo 3 visíveis na view dia
                    userRole={userRole}
                  />
                )
              )}

              {/* Indicador de tempo atual */}
              <CurrentTimeIndicator
                startHour={startHour}
                endHour={endHour}
                className="ml-0" // Sem offset pois já está na coluna correta
              />
            </div>
          </div>
        </div>

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

DayView.displayName = 'DayView';
