import React from 'react';
import { format, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { ScrollArea } from '@/components/primitives/scroll-area';
import { TimeSlot } from '@/components/composed';
import { cn } from '@/lib/utils';
import type { CalendarEvent } from '@/types/calendar';

// AI dev note: DayView combina TimeSlot Composed
// Vista diária com timeline detalhada

export interface DayViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  onTimeSlotClick?: (time: string, date: Date) => void;
  className?: string;
}

export const DayView = React.memo<DayViewProps>(
  ({ currentDate, events, onEventClick, onTimeSlotClick, className }) => {
    // Gerar horários das 7h às 22h
    const timeSlots = Array.from({ length: 16 }, (_, i) => {
      const hour = i + 7;
      return `${hour.toString().padStart(2, '0')}:00`;
    });

    const getEventsForTime = (time: string) => {
      const [hours] = time.split(':').map(Number);
      return events.filter((event) => {
        if (!isSameDay(event.start, currentDate)) return false;

        const eventHour = event.start.getHours();
        return eventHour === hours;
      });
    };

    const handleTimeSlotClick = (time: string) => {
      onTimeSlotClick?.(time, currentDate);
    };

    const handleEventClick = (event: CalendarEvent) => {
      onEventClick?.(event);
    };

    const dayLabel = format(currentDate, "EEEE, dd 'de' MMMM", {
      locale: ptBR,
    });

    return (
      <Card className={cn('w-full', className)}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold capitalize">
            {dayLabel}
          </CardTitle>
        </CardHeader>

        <CardContent className="p-0">
          <ScrollArea className="h-[600px] w-full">
            <div className="px-4 pb-4">
              {timeSlots.map((time) => {
                const timeEvents = getEventsForTime(time);

                return (
                  <TimeSlot
                    key={time}
                    time={time}
                    events={timeEvents}
                    onSlotClick={handleTimeSlotClick}
                    onEventClick={handleEventClick}
                  />
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    );
  }
);

DayView.displayName = 'DayView';
