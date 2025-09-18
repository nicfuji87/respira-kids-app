import React from 'react';

import { WeekTimeGrid } from '@/components/composed';
import { cn } from '@/lib/utils';
import type { CalendarEvent } from '@/types/calendar';

// AI dev note: WeekView combina WeekTimeGrid Composed
// Vista semanal com timeline de horários, eventos proporcionais e indicadores de tempo atual

export interface WeekViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  onTimeSlotClick?: (time: string, date: Date) => void;
  className?: string;
}

export const WeekView = React.memo<WeekViewProps>(
  ({ currentDate, events, onEventClick, onTimeSlotClick, className }) => {
    const handleEventClick = (event: CalendarEvent) => {
      onEventClick?.(event);
    };

    const handleTimeSlotClick = (time: string, date: Date) => {
      onTimeSlotClick?.(time, date);
    };

    return (
      <div className={cn('w-full max-w-none', className)}>
        <WeekTimeGrid
          currentDate={currentDate}
          events={events}
          onEventClick={handleEventClick}
          onTimeSlotClick={handleTimeSlotClick}
          className="w-full max-w-none"
        />
      </div>
    );
  }
);

WeekView.displayName = 'WeekView';
