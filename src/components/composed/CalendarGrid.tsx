import React, { useState } from 'react';
import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Card, CardContent } from '@/components/primitives/card';
import { cn } from '@/lib/utils';
import { EventCard } from './EventCard';
import { EventListModal } from '../domain/calendar';
import type { CalendarEvent } from '@/types/calendar';

// AI dev note: CalendarGrid combina Card e EventCard
// Estrutura básica do grid do calendário para diferentes vistas - CSS responsivo otimizado

export interface CalendarGridProps {
  currentDate: Date;
  events: CalendarEvent[];
  view: 'month' | 'week';
  onEventClick?: (event: CalendarEvent) => void;
  onDateClick?: (date: Date) => void;
  className?: string;
}

export const CalendarGrid = React.memo<CalendarGridProps>(
  ({ currentDate, events, view, onEventClick, onDateClick, className }) => {
    // AI dev note: Estado para controlar EventListModal
    const [modalState, setModalState] = useState<{
      isOpen: boolean;
      date: Date | null;
      events: CalendarEvent[];
    }>({
      isOpen: false,
      date: null,
      events: [],
    });

    // AI dev note: Debug logs para desenvolvimento
    if (process.env.NODE_ENV === 'development') {
      console.log('🗓️ CalendarGrid render:', {
        view,
        currentDate: currentDate.toISOString(),
        eventsCount: events.length,
        events: events.map((e) => ({
          id: e.id,
          title: e.title,
          start: e.start.toISOString(),
          end: e.end.toISOString(),
        })),
      });
    }

    const handleDateClick = (date: Date) => {
      onDateClick?.(date);
    };

    const handleEventClick = (event: CalendarEvent) => {
      if (process.env.NODE_ENV === 'development') {
        console.log('🎯 Event clicked:', event);
      }
      onEventClick?.(event);
    };

    // AI dev note: Função para abrir modal de lista de eventos
    const handleShowMoreEvents = (date: Date, dayEvents: CalendarEvent[]) => {
      setModalState({
        isOpen: true,
        date,
        events: dayEvents,
      });
    };

    // AI dev note: Função para fechar modal
    const handleCloseModal = () => {
      setModalState({
        isOpen: false,
        date: null,
        events: [],
      });
    };

    const getEventsForDate = (date: Date) => {
      const dayEvents = events.filter(
        (event) =>
          isSameDay(event.start, date) ||
          (event.start <= date && event.end >= date)
      );

      if (process.env.NODE_ENV === 'development' && dayEvents.length > 0) {
        console.log(`📅 Events for ${date.toDateString()}:`, dayEvents);
      }

      return dayEvents;
    };

    if (view === 'week') {
      const weekStart = startOfWeek(currentDate, { locale: ptBR });
      const weekEnd = endOfWeek(currentDate, { locale: ptBR });
      const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

      return (
        <Card className={cn('overflow-hidden', className)}>
          <CardContent className="p-0">
            {/* Header com dias da semana */}
            <div className="grid grid-cols-8 border-b bg-muted/50">
              <div className="p-4 border-r">
                <div className="text-sm font-medium">Horário</div>
              </div>
              {weekDays.map((day) => (
                <div
                  key={day.toISOString()}
                  className="p-4 border-r last:border-r-0"
                >
                  <div className="text-center">
                    <div className="text-sm font-medium">
                      {format(day, 'EEE', { locale: ptBR })}
                    </div>
                    <div className="text-lg font-bold mt-1">
                      {format(day, 'd')}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Grid de horários - altura responsiva */}
            <div className="grid grid-cols-8 h-[calc(100vh-16rem)] overflow-y-auto">
              {/* Coluna de horários */}
              <div className="border-r">
                {Array.from({ length: 12 }, (_, i) => {
                  const hour = i + 8; // 08:00 às 19:00
                  const timeLabel = `${hour.toString().padStart(2, '0')}:00`;

                  return (
                    <div
                      key={hour}
                      className="h-16 border-b p-2 text-xs text-muted-foreground"
                    >
                      {timeLabel}
                    </div>
                  );
                })}
              </div>

              {/* Colunas dos dias */}
              {weekDays.map((day) => (
                <div
                  key={day.toISOString()}
                  className="border-r last:border-r-0"
                >
                  {Array.from({ length: 12 }, (_, i) => {
                    const hour = i + 8;
                    const slotEvents = getEventsForDate(day).filter((event) => {
                      const eventHour = event.start.getHours();
                      return eventHour === hour;
                    });

                    return (
                      <div
                        key={hour}
                        className={cn(
                          'h-16 border-b p-1 hover:bg-muted/20 cursor-pointer',
                          'transition-colors group relative'
                        )}
                        onClick={() => handleDateClick(day)}
                      >
                        {slotEvents.map((event) => (
                          <EventCard
                            key={event.id}
                            event={event}
                            variant="compact"
                            onClick={handleEventClick}
                            className="mb-1"
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      );
    }

    // Vista mensal - altura responsiva otimizada
    const monthStart = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1
    );
    const monthEnd = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      0
    );
    const calendarStart = startOfWeek(monthStart, { locale: ptBR });
    const calendarEnd = endOfWeek(monthEnd, { locale: ptBR });
    const calendarDays = eachDayOfInterval({
      start: calendarStart,
      end: calendarEnd,
    });

    return (
      <>
        <Card className={cn('w-full overflow-hidden', className)}>
          <CardContent className="p-0 w-full">
            {/* Header com dias da semana */}
            <div className="grid grid-cols-7 border-b">
              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => (
                <div
                  key={day}
                  className="p-4 text-center font-medium bg-muted/50 border-r last:border-r-0"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Grid do calendário - altura adaptativa à tela */}
            <div className="grid grid-cols-7 h-[calc(100vh-8rem)] overflow-hidden">
              {calendarDays.map((day) => {
                const dayEvents = getEventsForDate(day);
                const isCurrentMonth =
                  day.getMonth() === currentDate.getMonth();
                const isToday = isSameDay(day, new Date());

                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      'border-r border-b last:border-r-0 p-2 cursor-pointer',
                      'hover:bg-muted/50 transition-colors group',
                      'flex flex-col gap-1',
                      'min-h-[120px] h-[calc((100vh-8rem)/6)]', // Altura mínima para 3 linhas + altura responsiva
                      {
                        'bg-muted/20': !isCurrentMonth,
                        'bg-primary/10': isToday,
                      }
                    )}
                    onClick={() => handleDateClick(day)}
                  >
                    {/* Número do dia */}
                    <div
                      className={cn('text-sm font-medium flex-shrink-0', {
                        'text-muted-foreground': !isCurrentMonth,
                        'text-primary font-bold': isToday,
                      })}
                    >
                      {format(day, 'd')}
                    </div>

                    {/* Eventos do dia */}
                    <div className="flex-1 space-y-1">
                      {dayEvents.slice(0, 2).map((event) => (
                        <EventCard
                          key={event.id}
                          event={event}
                          variant="month"
                          onClick={handleEventClick}
                          className="text-xs"
                        />
                      ))}
                      {dayEvents.length > 2 && (
                        <div
                          className="text-xs text-muted-foreground cursor-pointer hover:text-primary hover:underline transition-colors"
                          onClick={(e) => {
                            e.stopPropagation(); // Evitar triggering do onClick do dia
                            handleShowMoreEvents(day, dayEvents);
                          }}
                          title="Clique para ver todos os eventos do dia"
                        >
                          +{dayEvents.length - 2} eventos
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* AI dev note: Modal para exibir lista completa de eventos do dia */}
        <EventListModal
          isOpen={modalState.isOpen}
          onClose={handleCloseModal}
          date={modalState.date || new Date()}
          events={modalState.events}
          onEventClick={onEventClick}
        />
      </>
    );
  }
);

CalendarGrid.displayName = 'CalendarGrid';
