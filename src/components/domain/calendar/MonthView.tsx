import React from 'react';

import { CalendarGrid } from '@/components/composed';
import { cn } from '@/lib/utils';
import type { CalendarEvent } from '@/types/calendar';

// AI dev note: MonthView combina CalendarGrid Composed
// Vista mensal completa com navegação automática

export interface MonthViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  onDateClick?: (date: Date) => void;
  onDateChange?: (date: Date) => void;
  className?: string;
}

export const MonthView = React.memo<MonthViewProps>(
  ({
    currentDate,
    events,
    onEventClick,
    onDateClick,
    onDateChange,
    className,
  }) => {
    const handleDateClick = (date: Date) => {
      // Se clicar em data de outro mês, navegar para esse mês
      if (date.getMonth() !== currentDate.getMonth()) {
        onDateChange?.(date);
      }

      // Sempre chamar o callback de clique na data
      onDateClick?.(date);
    };

    const handleEventClick = (event: CalendarEvent) => {
      onEventClick?.(event);
    };

    return (
      <div className={cn('w-full', className)}>
        <CalendarGrid
          currentDate={currentDate}
          events={events}
          view="month"
          onEventClick={handleEventClick}
          onDateClick={handleDateClick}
          className="w-full"
        />
      </div>
    );
  }
);

MonthView.displayName = 'MonthView';
