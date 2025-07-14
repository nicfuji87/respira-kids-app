import React from 'react';
import { Plus } from 'lucide-react';

import { Button } from '@/components/primitives/button';
import { cn } from '@/lib/utils';
import { EventCard } from './EventCard';
import type { CalendarEvent, TimeSlotProps } from '@/types/calendar';

// AI dev note: TimeSlot combina Button e EventCard
// Representa um slot de horário com eventos associados

export const TimeSlot = React.memo<TimeSlotProps>(
  ({ time, events = [], onSlotClick, onEventClick, className }) => {
    const handleSlotClick = () => {
      onSlotClick?.(time);
    };

    const handleEventClick = (event: CalendarEvent) => {
      onEventClick?.(event);
    };

    const hasEvents = events.length > 0;

    return (
      <div
        className={cn(
          'relative min-h-[60px] border-b border-border/50 group',
          'hover:bg-muted/20 transition-colors',
          className
        )}
      >
        {/* Time label */}
        <div className="absolute left-0 top-0 w-16 text-xs text-muted-foreground font-medium p-2">
          {time}
        </div>

        {/* Slot content area */}
        <div className="ml-16 p-1 min-h-[58px] relative">
          {/* Add event button - visible on hover */}
          {!hasEvents && onSlotClick && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSlotClick}
              className={cn(
                'absolute inset-0 w-full h-full opacity-0 group-hover:opacity-100',
                'transition-opacity border-dashed border-2 border-transparent',
                'hover:border-primary/20 hover:bg-primary/5',
                'flex items-center justify-center'
              )}
            >
              <Plus className="h-4 w-4 text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                Adicionar evento
              </span>
            </Button>
          )}

          {/* Events */}
          {hasEvents && (
            <div className="space-y-1">
              {events.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  onClick={handleEventClick}
                  variant="default"
                  showTime={false}
                  className="w-full"
                />
              ))}
            </div>
          )}

          {/* Clickable overlay when there are events */}
          {hasEvents && onSlotClick && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSlotClick}
              className={cn(
                'absolute inset-x-0 bottom-0 h-6 opacity-0 group-hover:opacity-100',
                'transition-opacity border-dashed border-t-2 border-transparent',
                'hover:border-primary/20 hover:bg-primary/5',
                'flex items-center justify-center rounded-none rounded-b-md'
              )}
            >
              <Plus className="h-3 w-3 text-muted-foreground" />
            </Button>
          )}
        </div>
      </div>
    );
  }
);

TimeSlot.displayName = 'TimeSlot';
