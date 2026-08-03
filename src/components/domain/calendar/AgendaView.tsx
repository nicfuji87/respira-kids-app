import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  format,
  isSameDay,
  startOfDay,
  addDays,
  differenceInDays,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Card, CardContent } from '@/components/primitives/card';
import { ScrollArea } from '@/components/primitives/scroll-area';
import { EventCard } from '@/components/composed';
import { LembreteWhatsAppButton } from '@/components/composed/LembreteWhatsAppButton';
import { cn } from '@/lib/utils';
import {
  fetchLembretesManuais,
  type ResumoLembreteManual,
} from '@/lib/lembrete-agendamento-api';
import type { CalendarEvent } from '@/types/calendar';

// AI dev note: AgendaView combina EventCard Composed na variante 'detailed'
// Lista cronológica de eventos agrupados por data.
//
// É aqui que fica o botão de lembrete manual pelo WhatsApp (canal alternativo
// enquanto a API não oficial do n8n está fora). O histórico de envios é buscado
// UMA vez para todos os eventos visíveis, não por card.

export interface AgendaViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  daysToShow?: number;
  className?: string;
}

export const AgendaView = React.memo<AgendaViewProps>(
  ({ currentDate, events, onEventClick, daysToShow = 7, className }) => {
    const handleEventClick = (event: CalendarEvent) => {
      onEventClick?.(event);
    };

    // Gerar dias a partir da data atual
    const days = Array.from({ length: daysToShow }, (_, i) => {
      return addDays(startOfDay(currentDate), i);
    });

    // Agrupar eventos por dia
    const eventsByDay = days.map((day) => {
      const dayEvents = events
        .filter((event) => isSameDay(event.start, day))
        .sort((a, b) => a.start.getTime() - b.start.getTime());

      return {
        date: day,
        events: dayEvents,
      };
    });

    // Filtrar apenas dias que têm eventos
    const daysWithEvents = eventsByDay.filter((day) => day.events.length > 0);

    // AI dev note: Bloqueios de agenda entram na mesma lista (metadata.type ===
    // 'bloqueio') e não têm paciente para lembrar — ficam de fora.
    const agendamentoIds = useMemo(
      () =>
        daysWithEvents
          .flatMap((day) => day.events)
          .filter((event) => event.metadata?.type !== 'bloqueio')
          .map((event) => event.id),
      [daysWithEvents]
    );

    const [lembretes, setLembretes] = useState<
      Map<string, ResumoLembreteManual>
    >(new Map());

    // Chave estável: sem isso o array novo a cada render reexecuta o efeito.
    const idsKey = agendamentoIds.join(',');

    const carregarLembretes = useCallback(async () => {
      if (!idsKey) {
        setLembretes(new Map());
        return;
      }
      setLembretes(await fetchLembretesManuais(idsKey.split(',')));
    }, [idsKey]);

    useEffect(() => {
      carregarLembretes();
    }, [carregarLembretes]);

    if (daysWithEvents.length === 0) {
      return (
        <Card className={cn('w-full', className)}>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">
              Nenhum evento encontrado nos próximos {daysToShow} dias.
            </p>
          </CardContent>
        </Card>
      );
    }

    // AI dev note: Comparar sempre por início do dia. Usar new Date() (com hora
    // atual) em differenceInDays trunca a fração e faz o dia seguinte virar "Hoje".
    const today = startOfDay(new Date());

    return (
      <Card className={cn('w-full', className)}>
        <CardContent className="p-0">
          <ScrollArea className="h-[calc(100vh-10rem)] w-full">
            <div className="p-3 md:p-4 space-y-5">
              {daysWithEvents.map((day) => {
                const isToday = isSameDay(day.date, today);
                const dayLabel = format(day.date, "EEEE, dd 'de' MMMM", {
                  locale: ptBR,
                });
                const relativeDays = differenceInDays(day.date, today);

                // AI dev note: sem caso "Ontem" — a view agenda só lista
                // eventos a partir de hoje, dia anterior nunca aparece
                let relativeLabel = '';
                if (relativeDays === 0) relativeLabel = 'Hoje';
                else if (relativeDays === 1) relativeLabel = 'Amanhã';

                return (
                  <div key={day.date.toISOString()} className="space-y-2">
                    {/* Cabeçalho do dia.
                        AI dev note: DS — heading roxo-titulo; teal nunca como
                        cor de texto ("Hoje" é chip de superfície teal) */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold capitalize text-roxo-titulo">
                        {dayLabel}
                      </h3>
                      {relativeLabel && (
                        <span
                          className={cn(
                            'text-xs px-2 py-0.5 rounded-full font-medium',
                            isToday
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {relativeLabel}
                        </span>
                      )}
                    </div>

                    {/* Eventos do dia */}
                    <div className="space-y-2">
                      {day.events.map((event) => (
                        <EventCard
                          key={event.id}
                          event={event}
                          variant="detailed"
                          onClick={handleEventClick}
                          showTime={true}
                          showLocation={true}
                          showAttendees={true}
                          actions={
                            event.metadata?.type === 'bloqueio' ? undefined : (
                              <LembreteWhatsAppButton
                                event={event}
                                resumo={lembretes.get(event.id)}
                                onEnviado={carregarLembretes}
                              />
                            )
                          }
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    );
  }
);

AgendaView.displayName = 'AgendaView';
