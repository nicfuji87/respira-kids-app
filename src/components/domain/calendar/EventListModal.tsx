import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/primitives/sheet';
import { ScrollArea } from '@/components/primitives/scroll-area';
import { EventCard } from '@/components/composed';
import { cn } from '@/lib/utils';
import type { CalendarEvent } from '@/types/calendar';

// AI dev note: EventListModal combina Sheet + ScrollArea + EventCard
// Componente domain para exibir lista completa de eventos do dia quando "+ x eventos" é clicado

export interface EventListModalProps {
  isOpen: boolean;
  onClose: () => void;
  date: Date;
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  className?: string;
}

export const EventListModal = React.memo<EventListModalProps>(
  ({ isOpen, onClose, date, events, onEventClick, className }) => {
    const handleEventClick = (event: CalendarEvent) => {
      onEventClick?.(event);
      onClose(); // Fechar modal automaticamente após clicar no evento
    };

    const formatDate = (date: Date) => {
      return format(date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
    };

    return (
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent className={cn('w-full sm:max-w-md', className)}>
          <SheetHeader>
            <SheetTitle>Eventos do dia</SheetTitle>
            <SheetDescription>
              {formatDate(date)} • {events.length} evento
              {events.length !== 1 ? 's' : ''}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6">
            {events.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <p>Nenhum evento encontrado para este dia.</p>
              </div>
            ) : (
              <ScrollArea className="h-[calc(100vh-200px)]">
                <div className="space-y-3 pr-4">
                  {events.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      variant="eventList"
                      onClick={handleEventClick}
                      showTime={true}
                      showLocation={true}
                      showAttendees={false}
                      className="w-full"
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </SheetContent>
      </Sheet>
    );
  }
);

EventListModal.displayName = 'EventListModal';
