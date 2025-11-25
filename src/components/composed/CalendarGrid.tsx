import React, { useState } from 'react';
import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Card, CardContent } from '@/components/primitives/card';
import { cn } from '@/lib/utils';
import { EventCard } from './EventCard';
import { EventListModal } from '../domain/calendar';
import type { CalendarEvent } from '@/types/calendar';

// AI dev note: CalendarGrid combina Card e EventCard
// Estrutura básica do grid do calendário para diferentes vistas - CSS responsivo otimizado

export interface CalendarGridProps {
  currentDate: Date;
  events: CalendarEvent[];
  view: 'month' | 'week';
  onEventClick?: (event: CalendarEvent) => void;
  onDateClick?: (date: Date) => void;
  className?: string;
}

export const CalendarGrid = React.memo<CalendarGridProps>(
  ({ currentDate, events, view, onEventClick, onDateClick, className }) => {
    // AI dev note: Estado para controlar EventListModal
    const [modalState, setModalState] = useState<{
      isOpen: boolean;
      date: Date | null;
      events: CalendarEvent[];
    }>({
      isOpen: false,
      date: null,
      events: [],
    });

    // AI dev note: Debug logs para desenvolvimento
    if (process.env.NODE_ENV === 'development') {
      // trimmed debug
    }

    const handleDateClick = (date: Date) => {
      onDateClick?.(date);
    };

    const handleEventClick = (event: CalendarEvent) => {
      if (process.env.NODE_ENV === 'development') {
        // trimmed debug
      }
      onEventClick?.(event);
    };

    // AI dev note: Função para abrir modal de lista de eventos
    const handleShowMoreEvents = (date: Date, dayEvents: CalendarEvent[]) => {
      setModalState({
        isOpen: true,
        date,
        events: dayEvents,
      });
    };

    // AI dev note: Função para fechar modal
    const handleCloseModal = () => {
      setModalState({
        isOpen: false,
        date: null,
        events: [],
      });
    };

    const getEventsForDate = (date: Date) => {
      const dayEvents = events.filter(
        (event) =>
          isSameDay(event.start, date) ||
          (event.start <= date && event.end >= date)
      );

      if (process.env.NODE_ENV === 'development' && dayEvents.length > 0) {
        // trimmed debug
      }

      return dayEvents;
    };

    if (view === 'week') {
      const weekStart = startOfWeek(currentDate, {
        weekStartsOn: 1,
        locale: ptBR,
      });
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1, locale: ptBR });
      const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

      return (
        <Card className={cn('overflow-hidden', className)}>
          <CardContent className="p-0">
            {/* Header com dias da semana */}
            <div className="grid grid-cols-8 border-b bg-muted/50">
              <div className="p-4 border-r">
                <div className="text-sm font-medium">Horário</div>
              </div>
              {weekDays.map((day) => (
                <div
                  key={day.toISOString()}
                  className="p-4 border-r last:border-r-0"
                >
                  <div className="text-center">
                    <div className="text-sm font-medium">
                      {format(day, 'EEE', { locale: ptBR })}
                    </div>
                    <div className="text-lg font-bold mt-1">
                      {format(day, 'd')}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Grid de horários - altura responsiva */}
            <div className="grid grid-cols-8 h-[calc(100vh-16rem)] overflow-y-auto">
              {/* Coluna de horários */}
              <div className="border-r">
                {Array.from({ length: 12 }, (_, i) => {
                  const hour = i + 8; // 08:00 às 19:00
                  const timeLabel = `${hour.toString().padStart(2, '0')}:00`;

                  return (
                    <div
                      key={hour}
                      className="h-16 border-b p-2 text-xs text-muted-foreground"
                    >
                      {timeLabel}
                    </div>
                  );
                })}
              </div>

              {/* Colunas dos dias */}
              {weekDays.map((day) => (
                <div
                  key={day.toISOString()}
                  className="border-r last:border-r-0"
                >
                  {Array.from({ length: 12 }, (_, i) => {
                    const hour = i + 8;
                    const slotEvents = getEventsForDate(day).filter((event) => {
                      const eventHour = event.start.getHours();
                      return eventHour === hour;
                    });

                    return (
                      <div
                        key={hour}
                        className={cn(
                          'h-16 border-b p-1 hover:bg-muted/20 cursor-pointer',
                          'transition-colors group relative'
                        )}
                        onClick={() => handleDateClick(day)}
                      >
                        {slotEvents.map((event) => (
                          <EventCard
                            key={event.id}
                            event={event}
                            variant="compact"
                            onClick={handleEventClick}
                            className="mb-1"
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      );
    }

    // Vista mensal - altura responsiva otimizada
    const monthStart = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1
    );
    const monthEnd = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      0
    );
    const calendarStart = startOfWeek(monthStart, {
      weekStartsOn: 1,
      locale: ptBR,
    });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1, locale: ptBR });
    const calendarDays = eachDayOfInterval({
      start: calendarStart,
      end: calendarEnd,
    });

    return (
      <>
        <Card className={cn('w-full max-w-none overflow-hidden', className)}>
          <CardContent className="p-0 w-full">
            {/* Header com dias da semana - responsivo */}
            <div className="grid grid-cols-7 border-b">
              {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((day) => (
                <div
                  key={day}
                  className="p-1.5 md:p-3 lg:p-4 text-center font-medium bg-muted/50 border-r last:border-r-0 text-[10px] md:text-xs lg:text-sm"
                >
                  <span className="hidden md:inline">{day}</span>
                  <span className="md:hidden">{day.charAt(0)}</span>
                </div>
              ))}
            </div>

            {/* Grid do calendário - altura adaptativa à tela */}
            <div className="grid grid-cols-7 h-[calc(100vh-12rem)] md:h-[calc(100vh-10rem)] lg:h-[calc(100vh-8rem)] overflow-hidden">
              {calendarDays.map((day) => {
                const dayEvents = getEventsForDate(day);
                const isCurrentMonth =
                  day.getMonth() === currentDate.getMonth();
                const isToday = isSameDay(day, new Date());

                // Cores para os eventos
                const colorToHex: Record<string, string> = {
                  blue: '#3B82F6',
                  green: '#22C55E',
                  orange: '#F97316',
                  red: '#EF4444',
                  purple: '#8B5CF6',
                  pink: '#EC4899',
                  gray: '#6B7280',
                };

                // Quantos eventos mostrar no mobile (estilo Google Calendar)
                const mobileMaxEvents = 3;
                const desktopMaxEvents = 2;

                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      'border-r border-b last:border-r-0 p-0.5 md:p-1.5 lg:p-2 cursor-pointer',
                      'hover:bg-muted/50 transition-colors group',
                      'flex flex-col',
                      'min-h-[70px] md:min-h-[80px] lg:min-h-[100px]',
                      {
                        'bg-muted/20': !isCurrentMonth,
                        'bg-primary/10': isToday,
                      }
                    )}
                    onClick={() => handleDateClick(day)}
                  >
                    {/* Número do dia */}
                    <div
                      className={cn(
                        'text-[11px] md:text-xs lg:text-sm font-medium flex-shrink-0 text-center mb-0.5',
                        {
                          'text-muted-foreground': !isCurrentMonth,
                          'text-primary font-bold': isToday,
                        }
                      )}
                    >
                      {isToday ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 md:w-6 md:h-6 rounded-full bg-primary text-primary-foreground text-[10px] md:text-xs">
                          {format(day, 'd')}
                        </span>
                      ) : (
                        format(day, 'd')
                      )}
                    </div>

                    {/* Eventos do dia - estilo Google Calendar */}
                    <div className="flex-1 flex flex-col gap-px overflow-hidden">
                      {/* Mobile: barras coloridas com texto truncado */}
                      <div className="md:hidden flex flex-col gap-px">
                        {dayEvents.slice(0, mobileMaxEvents).map((event) => {
                          const corEventoHex = event.color
                            ? colorToHex[event.color] || '#3B82F6'
                            : '#3B82F6';
                          const pacienteNome =
                            (event.metadata?.pacienteNome as string) ||
                            event.title.split(' - ').pop() ||
                            event.title;

                          return (
                            <div
                              key={event.id}
                              className="px-1 py-px rounded-sm text-[9px] font-medium text-white truncate leading-tight cursor-pointer hover:opacity-80"
                              style={{ backgroundColor: corEventoHex }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEventClick(event);
                              }}
                              title={event.title}
                            >
                              {pacienteNome}
                            </div>
                          );
                        })}
                        {dayEvents.length > mobileMaxEvents && (
                          <div
                            className="text-[9px] text-muted-foreground cursor-pointer hover:text-primary text-center font-medium"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleShowMoreEvents(day, dayEvents);
                            }}
                          >
                            +{dayEvents.length - mobileMaxEvents}
                          </div>
                        )}
                      </div>

                      {/* Desktop: mostrar EventCards */}
                      <div className="hidden md:flex md:flex-col gap-0.5">
                        {dayEvents.slice(0, desktopMaxEvents).map((event) => (
                          <EventCard
                            key={event.id}
                            event={event}
                            variant="month"
                            onClick={handleEventClick}
                            className="text-xs"
                          />
                        ))}
                        {dayEvents.length > desktopMaxEvents && (
                          <div
                            className="text-[10px] lg:text-xs text-muted-foreground cursor-pointer hover:text-primary hover:underline transition-colors truncate"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleShowMoreEvents(day, dayEvents);
                            }}
                            title="Clique para ver todos os eventos do dia"
                          >
                            +{dayEvents.length - desktopMaxEvents} eventos
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* AI dev note: Modal para exibir lista completa de eventos do dia */}
        <EventListModal
          isOpen={modalState.isOpen}
          onClose={handleCloseModal}
          date={modalState.date || new Date()}
          events={modalState.events}
          onEventClick={onEventClick}
        />
      </>
    );
  }
);

CalendarGrid.displayName = 'CalendarGrid';
