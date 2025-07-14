import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MapPin, Clock, Users } from 'lucide-react';

import { Card, CardContent } from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';
import { cn } from '@/lib/utils';
import type { CalendarEvent, EventColor } from '@/types/calendar';
import { eventColorMap } from '@/types/calendar';

// AI dev note: EventCard combina Card e Badge primitives
// Componente reutilizável para exibir eventos em diferentes vistas do calendário

export interface EventCardProps {
  event: CalendarEvent;
  onClick?: (event: CalendarEvent) => void;
  variant?: 'default' | 'compact' | 'detailed';
  className?: string;
  showTime?: boolean;
  showLocation?: boolean;
  showAttendees?: boolean;
}

export const EventCard = React.memo<EventCardProps>(
  ({
    event,
    onClick,
    variant = 'default',
    className,
    showTime = true,
    showLocation = false,
    showAttendees = false,
  }) => {
    const handleClick = () => {
      onClick?.(event);
    };

    const getColorClasses = (color: EventColor = 'blue') => {
      return eventColorMap[color];
    };

    const formatTime = (date: Date) => {
      return format(date, 'HH:mm', { locale: ptBR });
    };

    const formatDuration = () => {
      const start = event.start;
      const end = event.end;

      if (event.allDay) {
        return 'Dia inteiro';
      }

      return `${formatTime(start)} - ${formatTime(end)}`;
    };

    // Variante compacta para vista mensal
    if (variant === 'compact') {
      return (
        <Badge
          className={cn(
            'cursor-pointer truncate text-xs font-medium border',
            getColorClasses(event.color),
            'hover:opacity-80 transition-opacity',
            className
          )}
          onClick={handleClick}
          title={event.title}
        >
          {showTime && !event.allDay && (
            <span className="mr-1">{formatTime(event.start)}</span>
          )}
          {event.title}
        </Badge>
      );
    }

    // Variante detalhada para vista de agenda
    if (variant === 'detailed') {
      return (
        <Card
          className={cn(
            'cursor-pointer border-l-4 hover:shadow-md transition-shadow',
            className
          )}
          onClick={handleClick}
          style={{
            borderLeftColor: event.color
              ? `var(--${event.color}-500)`
              : 'var(--blue-500)',
          }}
        >
          <CardContent className="p-4">
            <div className="space-y-2">
              <div className="flex items-start justify-between">
                <h3 className="font-semibold text-sm">{event.title}</h3>
                {showTime && (
                  <Badge variant="outline" className="text-xs">
                    {formatDuration()}
                  </Badge>
                )}
              </div>

              {event.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {event.description}
                </p>
              )}

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                {showLocation && event.location && (
                  <div className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    <span>{event.location}</span>
                  </div>
                )}

                {showAttendees &&
                  event.attendees &&
                  event.attendees.length > 0 && (
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      <span>{event.attendees.length} participantes</span>
                    </div>
                  )}
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    // Variante padrão para vistas semanal e diária
    return (
      <Card
        className={cn(
          'cursor-pointer border transition-all hover:shadow-sm',
          getColorClasses(event.color),
          className
        )}
        onClick={handleClick}
      >
        <CardContent className="p-2">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm truncate">{event.title}</h4>
              {showTime && !event.allDay && (
                <Clock className="h-3 w-3 flex-shrink-0 ml-1" />
              )}
            </div>

            {showTime && (
              <p className="text-xs opacity-75">{formatDuration()}</p>
            )}

            {showLocation && event.location && (
              <div className="flex items-center gap-1 text-xs opacity-75">
                <MapPin className="h-3 w-3" />
                <span className="truncate">{event.location}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }
);

EventCard.displayName = 'EventCard';
