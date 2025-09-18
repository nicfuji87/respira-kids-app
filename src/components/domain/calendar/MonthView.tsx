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
  onTimeSlotClick?: (time: string, date: Date) => void;
  onDateChange?: (date: Date) => void;
  className?: string;
}

export const MonthView = React.memo<MonthViewProps>(
  ({
    currentDate,
    events,
    onEventClick,
    onDateClick,
    onTimeSlotClick,
    onDateChange,
    className,
  }) => {
    const handleDateClick = (date: Date) => {
      // Se clicar em data de outro mês, navegar para esse mês
      if (date.getMonth() !== currentDate.getMonth()) {
        onDateChange?.(date);
        return;
      }

      // AI dev note: No modo mês, quando clicamos em uma data vazia,
      // chamamos onTimeSlotClick com horário padrão (9:00) para criar agendamento
      if (onTimeSlotClick) {
        // Definir horário padrão para agendamentos criados via clique no mês
        const defaultTime = '09:00';
        onTimeSlotClick(defaultTime, date);
      } else {
        // Fallback para onDateClick se onTimeSlotClick não estiver disponível
        onDateClick?.(date);
      }
    };

    const handleEventClick = (event: CalendarEvent) => {
      onEventClick?.(event);
    };

    return (
      <div className={cn('w-full max-w-none', className)}>
        <CalendarGrid
          currentDate={currentDate}
          events={events}
          view="month"
          onEventClick={handleEventClick}
          onDateClick={handleDateClick}
          className="w-full max-w-none"
        />
      </div>
    );
  }
);

MonthView.displayName = 'MonthView';
