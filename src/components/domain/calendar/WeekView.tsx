import React from 'react';

import { CalendarGrid } from '@/components/composed';
import { cn } from '@/lib/utils';
import type { CalendarEvent } from '@/types/calendar';

// AI dev note: WeekView combina CalendarGrid Composed
// Vista semanal com timeline de horários

export interface WeekViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  onDateClick?: (date: Date) => void;
  className?: string;
}

export const WeekView = React.memo<WeekViewProps>(
  ({ currentDate, events, onEventClick, onDateClick, className }) => {
    const handleEventClick = (event: CalendarEvent) => {
      onEventClick?.(event);
    };

    const handleDateClick = (date: Date) => {
      onDateClick?.(date);
    };

    return (
      <div className={cn('w-full', className)}>
        <CalendarGrid
          currentDate={currentDate}
          events={events}
          view="week"
          onEventClick={handleEventClick}
          onDateClick={handleDateClick}
          className="w-full"
        />
      </div>
    );
  }
);

WeekView.displayName = 'WeekView';
