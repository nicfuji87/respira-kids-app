import React from 'react';
import {
  format,
  isSameDay,
  startOfDay,
  addDays,
  differenceInDays,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Card, CardContent } from '@/components/primitives/card';
import { ScrollArea } from '@/components/primitives/scroll-area';
import { Separator } from '@/components/primitives/separator';
import { EventCard } from '@/components/composed';
import { cn } from '@/lib/utils';
import type { CalendarEvent } from '@/types/calendar';

// AI dev note: AgendaView combina EventCard Composed na variante 'detailed'
// Lista cronológica de eventos agrupados por data

export interface AgendaViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  daysToShow?: number;
  className?: string;
}

export const AgendaView = React.memo<AgendaViewProps>(
  ({ currentDate, events, onEventClick, daysToShow = 7, className }) => {
    const handleEventClick = (event: CalendarEvent) => {
      onEventClick?.(event);
    };

    // Gerar dias a partir da data atual
    const days = Array.from({ length: daysToShow }, (_, i) => {
      return addDays(startOfDay(currentDate), i);
    });

    // Agrupar eventos por dia
    const eventsByDay = days.map((day) => {
      const dayEvents = events
        .filter((event) => isSameDay(event.start, day))
        .sort((a, b) => a.start.getTime() - b.start.getTime());

      return {
        date: day,
        events: dayEvents,
      };
    });

    // Filtrar apenas dias que têm eventos
    const daysWithEvents = eventsByDay.filter((day) => day.events.length > 0);

    // AI dev note: Debug - verificar se className h-full foi passada
    if (process.env.NODE_ENV === 'development') {
      console.log('🎨 AgendaView - Renderização:', {
        className,
        'tem h-full': className?.includes('h-full'),
        daysWithEvents: daysWithEvents.length,
      });
    }

    if (daysWithEvents.length === 0) {
      return (
        <Card className={cn('w-full', className)}>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">
              Nenhum evento encontrado nos próximos {daysToShow} dias.
            </p>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className={cn('w-full', className)}>
        <CardContent className="p-0">
          <ScrollArea className="h-[calc(100vh-10rem)] w-full">
            <div className="p-4 space-y-6">
              {daysWithEvents.map((day, dayIndex) => {
                const isToday = isSameDay(day.date, new Date());
                const dayLabel = format(day.date, "EEEE, dd 'de' MMMM", {
                  locale: ptBR,
                });
                const relativeDays = differenceInDays(day.date, new Date());

                let relativeLabel = '';
                if (relativeDays === 0) relativeLabel = 'Hoje';
                else if (relativeDays === 1) relativeLabel = 'Amanhã';
                else if (relativeDays === -1) relativeLabel = 'Ontem';

                return (
                  <div key={day.date.toISOString()} className="space-y-3">
                    {/* Cabeçalho do dia */}
                    <div className="flex items-center gap-2">
                      <h3
                        className={cn(
                          'text-lg font-semibold capitalize',
                          isToday && 'text-primary'
                        )}
                      >
                        {dayLabel}
                      </h3>
                      {relativeLabel && (
                        <span
                          className={cn(
                            'text-sm px-2 py-1 rounded-full',
                            isToday
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {relativeLabel}
                        </span>
                      )}
                    </div>

                    {/* Eventos do dia */}
                    <div className="space-y-2">
                      {day.events.map((event) => (
                        <EventCard
                          key={event.id}
                          event={event}
                          variant="detailed"
                          onClick={handleEventClick}
                          showTime={true}
                          showLocation={true}
                          showAttendees={true}
                        />
                      ))}
                    </div>

                    {/* Separador entre dias (não no último) */}
                    {dayIndex < daysWithEvents.length - 1 && (
                      <Separator className="my-4" />
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    );
  }
);

AgendaView.displayName = 'AgendaView';
