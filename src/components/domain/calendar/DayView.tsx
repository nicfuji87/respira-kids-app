import React, { useState, useMemo } from 'react';
import { format, isSameDay, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/primitives/card';
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

    // Ref para container de eventos (scroll automático)
    const eventsContainerRef = React.useRef<HTMLDivElement>(null);

    // Constantes do grid
    const startHour = 7; // AI dev note: Alterado de 6 para 7 conforme solicitação
    const endHour = 20;
    // HourHeight responsivo: 48px mobile, 64px desktop (ajustado via CSS nos slots)
    const hourHeight = 64; // Mantido para cálculos, mas slots usam altura responsiva via CSS

    // Gerar array de horários
    const timeSlots = useMemo(() => {
      return Array.from({ length: endHour - startHour }, (_, i) => {
        const hour = i + startHour;
        return `${hour.toString().padStart(2, '0')}:00`;
      });
    }, [startHour, endHour]);

    // Filtrar eventos do dia atual
    const dayEvents = useMemo(() => {
      const filtered = events.filter((event) =>
        isSameDay(event.start, currentDate)
      );

      // AI dev note: Debug logs para identificar eventos faltando
      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 DayView - Filtro de eventos:', {
          currentDate: currentDate.toISOString(),
          'total eventos recebidos': events.length,
          'eventos filtrados para o dia': filtered.length,
          'primeiros 3 eventos recebidos': events.slice(0, 3).map((e) => ({
            id: e.id,
            title: e.title,
            start: e.start.toISOString(),
            'isSameDay result': isSameDay(e.start, currentDate),
          })),
          'eventos filtrados': filtered.map((e) => ({
            id: e.id,
            title: e.title,
            start: e.start.toISOString(),
          })),
        });
      }

      return filtered;
    }, [events, currentDate]);

    // AI dev note: Scroll automático para hora atual quando visualizando hoje
    React.useEffect(() => {
      if (!isToday(currentDate) || !eventsContainerRef.current) return;

      const now = new Date();
      const currentHour = now.getHours();

      // Scroll para 1 hora antes da atual (para contexto)
      const targetHour = Math.max(startHour, currentHour - 1);
      const scrollPosition = (targetHour - startHour) * hourHeight;

      // Delay para garantir que o DOM foi renderizado
      setTimeout(() => {
        eventsContainerRef.current?.scrollTo({
          top: scrollPosition,
          behavior: 'smooth',
        });
      }, 100);
    }, [currentDate, startHour, hourHeight]);

    // AI dev note: Detecta eventos no MESMO HORÁRIO EXATO (não sobreposição temporal)
    const getEventsWithOverlapData = (events: CalendarEvent[]) => {
      return events.map((event) => {
        // Encontra eventos que COMEÇAM no mesmo horário exato (mesmo minuto)
        const sameTimeEvents = events.filter((otherEvent) => {
          if (otherEvent.id === event.id) return false;

          // Comparar apenas o horário de início (timestamp exato)
          return event.start.getTime() === otherEvent.start.getTime();
        });

        // Todos os eventos do mesmo horário incluindo o atual
        const allSameTime = [event, ...sameTimeEvents].sort(
          (a, b) => a.id.localeCompare(b.id) // Ordenar por ID para consistência
        );

        return {
          event,
          overlapIndex: allSameTime.findIndex((e) => e.id === event.id),
          totalOverlapping: allSameTime.length,
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

    // AI dev note: Limita renderização quando há muitos eventos no mesmo slot
    // Mas sempre mostra pelo menos os 2 primeiros lado a lado
    const shouldShowEvent = (
      event: CalendarEvent,
      allEvents: CalendarEvent[]
    ): boolean => {
      // Eventos no mesmo horário exato (mesmo minuto)
      const sameTimeEvents = allEvents
        .filter((e) => e.start.getTime() === event.start.getTime())
        .sort((a, b) => a.id.localeCompare(b.id)); // Ordenar por ID para consistência

      // Se há <= 2 eventos no mesmo horário, mostrar todos
      if (sameTimeEvents.length <= 2) return true;

      // Se há > 2, mostrar apenas os 2 primeiros (por ordem de ID)
      const eventIndex = sameTimeEvents.findIndex((e) => e.id === event.id);
      return eventIndex < 2;
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

    // AI dev note: Debug - verificar se className h-full foi passada
    if (process.env.NODE_ENV === 'development') {
      console.log('🎨 DayView - Renderização:', {
        className,
        'tem h-full': className?.includes('h-full'),
        'timeSlots count': timeSlots.length,
        startHour: startHour,
      });
    }

    // AI dev note: Debug - verificar eventos com overlap calculado
    if (
      process.env.NODE_ENV === 'development' &&
      eventsWithOverlap.length > 0
    ) {
      console.log('🔍 DayView - Eventos com dados de sobreposição:', {
        'total eventos com overlap': eventsWithOverlap.length,
        detalhes: eventsWithOverlap.map((e) => ({
          id: e.event.id,
          title: e.event.title,
          start: e.event.start.toISOString(),
          overlapIndex: e.overlapIndex,
          totalOverlapping: e.totalOverlapping,
          'será renderizado': shouldShowEvent(e.event, dayEvents),
        })),
      });
    }

    // AI dev note: Agrupar eventos por horário para detectar quando há mais eventos ocultos
    const hiddenEventsByTime = useMemo(() => {
      const map = new Map<string, number>();

      // Agrupar eventos por timestamp exato
      const eventsByExactTime = new Map<number, CalendarEvent[]>();
      dayEvents.forEach((event) => {
        const timestamp = event.start.getTime();
        if (!eventsByExactTime.has(timestamp)) {
          eventsByExactTime.set(timestamp, []);
        }
        eventsByExactTime.get(timestamp)!.push(event);
      });

      // Para cada grupo com > 2 eventos, adicionar ao map de ocultos
      eventsByExactTime.forEach((events, timestamp) => {
        if (events.length > 2) {
          const timeKey = format(new Date(timestamp), 'HH:mm'); // Usar minuto exato
          map.set(timeKey, events.length);
        }
      });

      return map;
    }, [dayEvents]);

    return (
      <>
        {/* Grid diário - estrutura Card igual ao CalendarGrid */}
        <Card className={cn('w-full overflow-hidden', className)}>
          <CardContent className="p-0">
            {/* Header com dia - responsivo.
                AI dev note: DS — título roxo-titulo; "Hoje" vira chip teal
                (superfície), teal nunca como cor de texto */}
            <div className="border-b border-border/60 bg-muted/30 p-2 md:p-3">
              <h2 className="flex items-center gap-2 text-sm md:text-base font-semibold capitalize text-roxo-titulo">
                <span className="md:hidden">
                  {format(currentDate, 'EEE, dd/MM', { locale: ptBR })}
                </span>
                <span className="hidden md:inline">{dayLabel}</span>
                {isCurrentDay && (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium normal-case text-primary-foreground">
                    Hoje
                  </span>
                )}
              </h2>
            </div>

            {/* Grid de horários - altura e overflow EXATOS do CalendarGrid */}
            <div className="w-full grid grid-cols-[3rem_1fr] md:grid-cols-[3.5rem_1fr] h-[calc(100vh-12rem)] md:h-[calc(100vh-10rem)] overflow-y-auto">
              {/* Coluna de horários - estreita, rótulo à direita sobre a linha
                  da hora (-translate-y-1/2), estilo Google Agenda */}
              <div className="border-r border-border/50">
                {timeSlots.map((time, index) => (
                  <div
                    key={time}
                    className="relative border-b border-border/50"
                    style={{ height: `${hourHeight}px` }}
                  >
                    <span
                      className={cn(
                        'absolute right-1.5 text-xs text-muted-foreground tabular-nums',
                        index === 0 ? 'top-0.5' : 'top-0 -translate-y-1/2'
                      )}
                    >
                      {time}
                    </span>
                  </div>
                ))}
              </div>

              {/* Coluna de eventos */}
              <div
                ref={eventsContainerRef}
                className="relative"
                style={{
                  minHeight: `${timeSlots.length * hourHeight}px`,
                }}
              >
                {/* Slots de horário clicáveis */}
                {timeSlots.map((time) => {
                  const slotEvents = getEventsPerTimeSlot(dayEvents, time);
                  // Verificar se algum horário exato dentro deste slot tem eventos ocultos
                  const hasHiddenEventsInSlot = Array.from(
                    hiddenEventsByTime.keys()
                  ).some((exactTime) =>
                    exactTime.startsWith(time.split(':')[0] + ':')
                  );
                  const totalEventsInSlot = hasHiddenEventsInSlot
                    ? Math.max(
                        ...Array.from(hiddenEventsByTime.entries())
                          .filter(([k]) =>
                            k.startsWith(time.split(':')[0] + ':')
                          )
                          .map(([, v]) => v)
                      )
                    : 0;

                  return (
                    <div
                      key={time}
                      className={cn(
                        'border-b border-border/50 hover:bg-primary/5 cursor-pointer',
                        'transition-colors group relative'
                      )}
                      style={{ height: `${hourHeight}px` }}
                      onClick={() => handleTimeSlotClick(time)}
                    >
                      {hasHiddenEventsInSlot && totalEventsInSlot > 2 && (
                        <div
                          className="absolute top-0.5 right-0.5 md:top-1 md:right-1 text-xs bg-primary text-primary-foreground px-1.5 md:px-2 py-0.5 rounded-full font-medium z-10 hover:bg-primary/90 transition-colors cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            setModalState({
                              isOpen: true,
                              date: currentDate,
                              events: slotEvents,
                            });
                          }}
                          title={`Ver todos os ${totalEventsInSlot} eventos`}
                        >
                          +{totalEventsInSlot - 2}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Eventos renderizados sobre os slots */}
                {/* AI dev note: Filtra e renderiza eventos (max 2 por horário exato) */}
                {eventsWithOverlap
                  .filter(({ event }) => shouldShowEvent(event, dayEvents))
                  .map(({ event, overlapIndex, totalOverlapping }) => {
                    // Ajustar para máximo 2 colunas visíveis
                    const adjustedTotal = Math.min(totalOverlapping, 2);
                    const adjustedIndex = Math.min(overlapIndex, 1);

                    return (
                      <WeekEventBlock
                        key={event.id}
                        event={event}
                        startHour={startHour}
                        endHour={endHour}
                        hourHeight={hourHeight}
                        onClick={handleEventClick}
                        overlapIndex={adjustedIndex}
                        totalOverlapping={adjustedTotal}
                        userRole={userRole}
                      />
                    );
                  })}

                {/* Indicador de tempo atual */}
                <CurrentTimeIndicator
                  startHour={startHour}
                  endHour={endHour}
                  className="ml-0" // Sem offset pois já está na coluna correta
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

DayView.displayName = 'DayView';
