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
  userRole?: 'admin' | 'profissional' | 'secretaria' | null;
}

export const WeekView = React.memo<WeekViewProps>(
  ({
    currentDate,
    events,
    onEventClick,
    onTimeSlotClick,
    className,
    userRole,
  }) => {
    const handleEventClick = (event: CalendarEvent) => {
      onEventClick?.(event);
    };

    const handleTimeSlotClick = (time: string, date: Date) => {
      onTimeSlotClick?.(time, date);
    };

    return (
      <div className={cn('w-full h-full', className)}>
        <WeekTimeGrid
          currentDate={currentDate}
          events={events}
          onEventClick={handleEventClick}
          onTimeSlotClick={handleTimeSlotClick}
          userRole={userRole}
          className="w-full h-full"
        />
      </div>
    );
  }
);

WeekView.displayName = 'WeekView';
