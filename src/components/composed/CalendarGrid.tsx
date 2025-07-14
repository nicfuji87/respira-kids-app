import React from 'react';
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
import type { CalendarEvent } from '@/types/calendar';

// AI dev note: CalendarGrid combina Card e EventCard
// Estrutura básica do grid do calendário para diferentes vistas

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
    const handleDateClick = (date: Date) => {
      onDateClick?.(date);
    };

    const handleEventClick = (event: CalendarEvent) => {
      onEventClick?.(event);
    };

    const getEventsForDate = (date: Date) => {
      return events.filter(
        (event) =>
          isSameDay(event.start, date) ||
          (event.start <= date && event.end >= date)
      );
    };

    if (view === 'week') {
      const weekStart = startOfWeek(currentDate, { locale: ptBR });
      const weekEnd = endOfWeek(currentDate, { locale: ptBR });
      const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

      return (
        <Card className={cn('overflow-hidden', className)}>
          <CardContent className="p-0">
            {/* Header com dias da semana */}
            <div className="grid grid-cols-8 border-b">
              <div className="p-2 text-xs font-medium text-muted-foreground border-r">
                Horário
              </div>
              {weekDays.map((day) => (
                <div
                  key={day.toISOString()}
                  className={cn(
                    'p-2 text-center border-r last:border-r-0',
                    'hover:bg-muted/50 cursor-pointer transition-colors'
                  )}
                  onClick={() => handleDateClick(day)}
                >
                  <div className="text-xs font-medium text-muted-foreground">
                    {format(day, 'EEE', { locale: ptBR })}
                  </div>
                  <div
                    className={cn(
                      'text-sm font-medium mt-1',
                      isSameDay(day, new Date()) && 'text-primary'
                    )}
                  >
                    {format(day, 'd')}
                  </div>
                </div>
              ))}
            </div>

            {/* Grid de horários */}
            <div className="grid grid-cols-8 min-h-[400px]">
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

    // Vista mensal
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
      <Card className={cn('overflow-hidden', className)}>
        <CardContent className="p-0">
          {/* Header com dias da semana */}
          <div className="grid grid-cols-7 border-b">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => (
              <div
                key={day}
                className="p-3 text-center font-medium text-sm text-muted-foreground border-r last:border-r-0"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Grid de dias */}
          <div className="grid grid-cols-7">
            {calendarDays.map((day) => {
              const dayEvents = getEventsForDate(day);
              const isCurrentMonth = day.getMonth() === currentDate.getMonth();
              const isToday = isSameDay(day, new Date());

              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    'min-h-[120px] border-r border-b last:border-r-0',
                    'hover:bg-muted/20 cursor-pointer transition-colors p-2',
                    !isCurrentMonth && 'bg-muted/5 text-muted-foreground'
                  )}
                  onClick={() => handleDateClick(day)}
                >
                  <div
                    className={cn(
                      'text-sm font-medium mb-2',
                      isToday && 'text-primary',
                      !isCurrentMonth && 'text-muted-foreground'
                    )}
                  >
                    {format(day, 'd')}
                  </div>

                  <div className="space-y-1">
                    {dayEvents.slice(0, 3).map((event) => (
                      <EventCard
                        key={event.id}
                        event={event}
                        variant="compact"
                        onClick={handleEventClick}
                        showTime={false}
                      />
                    ))}

                    {dayEvents.length > 3 && (
                      <div className="text-xs text-muted-foreground mt-1">
                        +{dayEvents.length - 3} mais
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  }
);

CalendarGrid.displayName = 'CalendarGrid';
