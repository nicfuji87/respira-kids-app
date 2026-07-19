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
import { eventColorHexMap, EVENT_FALLBACK_HEX } from '@/types/calendar';

// AI dev note: Acessibilidade — classes de foco visível para elementos clicáveis
const focusRingClasses =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset';

// Helper para ativar clique via teclado (Enter/Espaço)
const onEnterOrSpace =
  (action: () => void) => (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      action();
    }
  };

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
                        role="button"
                        tabIndex={0}
                        aria-label={`Agendar ${format(day, "EEEE, d 'de' MMMM", { locale: ptBR })} às ${hour.toString().padStart(2, '0')}:00`}
                        className={cn(
                          'h-16 border-b p-1 hover:bg-muted/20 cursor-pointer',
                          'transition-colors group relative',
                          focusRingClasses
                        )}
                        onClick={() => handleDateClick(day)}
                        onKeyDown={onEnterOrSpace(() => handleDateClick(day))}
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

            {/* Grid do calendário - altura adaptativa à tela.
                AI dev note: Linhas minmax(70px, 1fr) + wrapper com scroll — a 6ª
                semana não é mais cortada pelo overflow-hidden com altura fixa. */}
            <div className="h-[calc(100vh-12rem)] md:h-[calc(100vh-10rem)] lg:h-[calc(100vh-8rem)] overflow-y-auto">
              <div
                className="grid grid-cols-7 min-h-full"
                style={{ gridAutoRows: 'minmax(70px, 1fr)' }}
              >
                {calendarDays.map((day) => {
                  const dayEvents = getEventsForDate(day);
                  const isCurrentMonth =
                    day.getMonth() === currentDate.getMonth();
                  const isToday = isSameDay(day, new Date());

                  // Quantos eventos mostrar no mobile (estilo Google Calendar)
                  const mobileMaxEvents = 3;
                  const desktopMaxEvents = 2;

                  return (
                    <div
                      key={day.toISOString()}
                      role="button"
                      tabIndex={0}
                      aria-label={`${format(day, "EEEE, d 'de' MMMM", { locale: ptBR })}${
                        dayEvents.length > 0
                          ? `, ${dayEvents.length} agendamento${dayEvents.length > 1 ? 's' : ''}`
                          : ', sem agendamentos'
                      }`}
                      className={cn(
                        'border-r border-b last:border-r-0 p-0.5 md:p-1.5 lg:p-2 cursor-pointer',
                        'hover:bg-muted/50 transition-colors group',
                        'flex flex-col',
                        'min-h-[70px] md:min-h-[80px] lg:min-h-[100px]',
                        focusRingClasses,
                        {
                          'bg-muted/20': !isCurrentMonth,
                          'bg-primary/10': isToday,
                        }
                      )}
                      onClick={() => handleDateClick(day)}
                      onKeyDown={onEnterOrSpace(() => handleDateClick(day))}
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
                              ? eventColorHexMap[event.color] ||
                                EVENT_FALLBACK_HEX
                              : EVENT_FALLBACK_HEX;
                            const pacienteNome =
                              (event.metadata?.pacienteNome as string) ||
                              event.title.split(' - ').pop() ||
                              event.title;
                            // Cor do status de pagamento
                            const corPagamentoHex =
                              (event.metadata?.statusPagamentoCor as string) ||
                              '#737373';
                            const statusPagamento =
                              (event.metadata?.statusPagamento as string) ||
                              'Pagamento não definido';

                            return (
                              <div
                                key={event.id}
                                role="button"
                                tabIndex={0}
                                aria-label={`Consulta de ${pacienteNome} às ${format(event.start, 'HH:mm', { locale: ptBR })}, pagamento ${statusPagamento}`}
                                // AI dev note: DS — texto roxo-titulo sobre fundo
                                // suavizado (cor + alpha), não branco sobre hex cheio
                                className={cn(
                                  'flex items-center gap-1 px-1 py-px rounded-sm text-[10px] font-medium text-roxo-titulo leading-tight cursor-pointer hover:opacity-80',
                                  focusRingClasses
                                )}
                                style={{
                                  backgroundColor: `${corEventoHex}33`,
                                  borderLeft: `3px solid ${corEventoHex}`,
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEventClick(event);
                                }}
                                onKeyDown={onEnterOrSpace(() =>
                                  handleEventClick(event)
                                )}
                                title={`${event.title} - ${statusPagamento}`}
                              >
                                {/* Bolinha do status de pagamento */}
                                <div
                                  className="w-2 h-2 rounded-full flex-shrink-0 border border-roxo-titulo/20"
                                  style={{ backgroundColor: corPagamentoHex }}
                                />
                                <span className="sr-only">
                                  Pagamento: {statusPagamento}
                                </span>
                                <span className="truncate">{pacienteNome}</span>
                              </div>
                            );
                          })}
                          {dayEvents.length > mobileMaxEvents && (
                            <div
                              role="button"
                              tabIndex={0}
                              aria-label={`Ver todos os ${dayEvents.length} agendamentos do dia`}
                              className={cn(
                                'text-[10px] text-muted-foreground cursor-pointer hover:text-primary hover:underline text-center font-medium py-0.5',
                                focusRingClasses
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleShowMoreEvents(day, dayEvents);
                              }}
                              onKeyDown={onEnterOrSpace(() =>
                                handleShowMoreEvents(day, dayEvents)
                              )}
                              title={`Ver todos os ${dayEvents.length} agendamentos`}
                            >
                              +{dayEvents.length - mobileMaxEvents} mais
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
                              role="button"
                              tabIndex={0}
                              aria-label={`Ver todos os ${dayEvents.length} agendamentos do dia`}
                              className={cn(
                                'text-[11px] lg:text-xs text-muted-foreground cursor-pointer hover:text-primary hover:underline transition-colors truncate',
                                focusRingClasses
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleShowMoreEvents(day, dayEvents);
                              }}
                              onKeyDown={onEnterOrSpace(() =>
                                handleShowMoreEvents(day, dayEvents)
                              )}
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
