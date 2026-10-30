import React, { useState, useMemo } from 'react';
import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isToday,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/primitives/card';
import { CurrentTimeIndicator } from './CurrentTimeIndicator';
import {
  WeekEventBlock,
  WeekOverflowBlock,
  WeekClosureBand,
} from './WeekEventBlock';
import { EventCard } from './EventCard';
import { EventListModal } from '../domain/calendar';
import type { CalendarEvent } from '@/types/calendar';
import { ehEventoDeFaixa, eventoCobreDia } from '@/lib/agenda-bloqueios-api';
import {
  ehFechamentoComHorario,
  layoutColunas,
  type LayoutColunas,
} from '@/lib/calendar-layout';

// Altura de 1h na grade. 56px: sessão de 30 min (28px) vira bloco de uma linha;
// de 45 min para cima mostra paciente e profissional.
const HOUR_HEIGHT = 56;
// Máximo de blocos lado a lado por dia; acima disso vira "+N"
const MAX_COLUNAS_SEMANA = 3;

// AI dev note: WeekTimeGrid — grade semanal. Posicionamento em
// lib/calendar-layout (blocos lado a lado, nunca sobrepostos; "+N" quando passa
// de MAX_COLUNAS_SEMANA). Fechamento da clínica com horário vira faixa de fundo.

export interface WeekTimeGridProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  onTimeSlotClick?: (time: string, date: Date) => void;
  startHour?: number;
  endHour?: number;
  className?: string;
  userRole?: 'admin' | 'profissional' | 'secretaria' | null;
}

export const WeekTimeGrid = React.memo<WeekTimeGridProps>(
  ({
    currentDate,
    events,
    onEventClick,
    onTimeSlotClick,
    startHour = 7, // AI dev note: Alterado de 6 para 7 conforme solicitação
    endHour = 20,
    className,
    userRole,
  }) => {
    // Estado para modal de eventos múltiplos
    const [modalState, setModalState] = useState<{
      isOpen: boolean;
      date: Date | null;
      events: CalendarEvent[];
    }>({
      isOpen: false,
      date: null,
      events: [],
    });

    // Calcula dias da semana
    const weekDays = useMemo(() => {
      const weekStart = startOfWeek(currentDate, {
        weekStartsOn: 1,
        locale: ptBR,
      });
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1, locale: ptBR });
      return eachDayOfInterval({ start: weekStart, end: weekEnd });
    }, [currentDate]);

    // Gera array de horários
    const timeSlots = useMemo(() => {
      return Array.from({ length: endHour - startHour }, (_, i) => {
        const hour = i + startHour;
        return `${hour.toString().padStart(2, '0')}:00`;
      });
    }, [startHour, endHour]);

    // Dia inteiro / vários dias (feriado, férias) vão para a faixa do topo
    const { eventosFaixa, eventosGrade } = useMemo(() => {
      const faixa: CalendarEvent[] = [];
      const grade: CalendarEvent[] = [];
      events.forEach((e) => (ehEventoDeFaixa(e) ? faixa : grade).push(e));
      return { eventosFaixa: faixa, eventosGrade: grade };
    }, [events]);

    // Por dia: layout dos blocos + faixas de fechamento da clínica
    const porDia = useMemo(() => {
      const grouped: Record<
        string,
        { layout: LayoutColunas; fechamentos: CalendarEvent[] }
      > = {};

      weekDays.forEach((day) => {
        const dayKey = format(day, 'yyyy-MM-dd');
        const doDia = eventosGrade.filter((event) =>
          isSameDay(event.start, day)
        );
        grouped[dayKey] = {
          layout: layoutColunas(
            doDia.filter((e) => !ehFechamentoComHorario(e)),
            MAX_COLUNAS_SEMANA
          ),
          fechamentos: doDia.filter(ehFechamentoComHorario),
        };
      });

      return grouped;
    }, [weekDays, eventosGrade]);

    // Semana atual: rola até 1h antes de agora
    const scrollRef = React.useRef<HTMLDivElement>(null);
    const semanaTemHoje = weekDays.some((d) => isToday(d));
    React.useEffect(() => {
      if (!semanaTemHoje || !scrollRef.current) return;
      const alvo = Math.max(startHour, new Date().getHours() - 1);
      const t = setTimeout(() => {
        scrollRef.current?.scrollTo({
          top: (alvo - startHour) * HOUR_HEIGHT,
          behavior: 'smooth',
        });
      }, 100);
      return () => clearTimeout(t);
    }, [semanaTemHoje, startHour]);

    const handleTimeSlotClick = (time: string, date: Date) => {
      onTimeSlotClick?.(time, date);
    };

    const handleEventClick = (event: CalendarEvent) => {
      onEventClick?.(event);
    };

    const closeModal = () => {
      setModalState({ isOpen: false, date: null, events: [] });
    };

    return (
      <>
        {/* Grid semanal - estrutura igual ao CalendarGrid */}
        <Card className={cn('overflow-hidden', className)}>
          <CardContent className="p-0">
            {/* Header com dias da semana - responsivo.
                AI dev note: Coluna de horas estreita (w-12/w-14) — as colunas
                dos dias ganham o espaço que a coluna "Horário" desperdiçava. */}
            <div className="w-full grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] md:grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-border/60 bg-muted/30">
              <div className="border-r border-border/50" aria-hidden="true" />
              {weekDays.map((day) => {
                const isCurrentDay = isToday(day);
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      'p-1.5 md:p-2 border-r border-border/50 last:border-r-0 text-center',
                      isCurrentDay && 'bg-primary/15'
                    )}
                  >
                    <div className="text-center">
                      {/* AI dev note: DS — hoje é chip teal (superfície), nunca
                          teal como cor de texto */}
                      <div
                        className={cn(
                          'text-[10px] md:text-xs font-medium capitalize text-muted-foreground',
                          isCurrentDay && 'text-roxo-titulo font-semibold'
                        )}
                      >
                        <span className="md:hidden">
                          {format(day, 'EEE', { locale: ptBR }).charAt(0)}
                        </span>
                        <span className="hidden md:inline">
                          {format(day, 'EEE', { locale: ptBR })}
                        </span>
                      </div>
                      <div className="mt-0.5 flex justify-center">
                        <span
                          className={cn(
                            'h-6 w-6 md:h-7 md:w-7 flex items-center justify-center rounded-full text-sm md:text-base font-semibold',
                            isCurrentDay
                              ? 'bg-primary text-primary-foreground'
                              : 'text-foreground'
                          )}
                        >
                          {format(day, 'd')}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Faixa "dia inteiro": feriado/clínica fechada, férias */}
            {eventosFaixa.length > 0 && (
              <div className="w-full grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] md:grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-border/60">
                <div className="flex items-center justify-end border-r border-border/50 pr-1.5 text-right text-xs leading-tight text-muted-foreground">
                  Dia todo
                </div>
                {weekDays.map((day) => {
                  const doDia = eventosFaixa.filter((e) =>
                    eventoCobreDia(e, day)
                  );
                  return (
                    <div
                      key={day.toISOString()}
                      className="min-h-8 space-y-0.5 border-r border-border/50 p-0.5 last:border-r-0"
                    >
                      {doDia.slice(0, 2).map((e) => (
                        <div key={e.id} className="h-6">
                          <EventCard
                            event={e}
                            variant="week"
                            umaLinha
                            onClick={handleEventClick}
                            className="h-full"
                          />
                        </div>
                      ))}
                      {doDia.length > 2 && (
                        <button
                          type="button"
                          className="w-full rounded text-xs text-muted-foreground hover:bg-muted"
                          onClick={() =>
                            setModalState({
                              isOpen: true,
                              date: day,
                              events: doDia,
                            })
                          }
                        >
                          +{doDia.length - 2}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Grid de horários - altura e overflow EXATOS do CalendarGrid */}
            <div
              ref={scrollRef}
              className="w-full grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] md:grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] relative content-start h-[calc(100vh-12rem)] md:h-[calc(100vh-10rem)] overflow-y-auto"
            >
              {/* Coluna de horários - altura fixa para consistência com posicionamento de eventos.
                  AI dev note: Rótulo alinhado à direita e deslocado (-translate-y-1/2)
                  para "sentar" sobre a linha da hora, estilo Google Agenda. */}
              <div className="border-r border-border/50">
                {timeSlots.map((time, index) => (
                  <div
                    key={time}
                    className="relative border-b border-border/50"
                    style={{ height: HOUR_HEIGHT }}
                  >
                    <span
                      className={cn(
                        'absolute right-1.5 text-xs text-muted-foreground tabular-nums',
                        index === 0 ? 'top-0.5' : 'top-0 -translate-y-1/2'
                      )}
                    >
                      {time}
                    </span>
                  </div>
                ))}
              </div>

              {/* Container para colunas dos dias com indicador */}
              <div
                className="col-span-7 relative"
                style={{ height: timeSlots.length * HOUR_HEIGHT }}
              >
                {/* Grid interno para os dias */}
                <div className="grid grid-cols-7 h-full">
                  {weekDays.map((day) => {
                    const dayKey = format(day, 'yyyy-MM-dd');
                    const { layout, fechamentos } = porDia[dayKey] ?? {
                      layout: { blocos: [], excedentes: [] },
                      fechamentos: [],
                    };
                    const isCurrentDay = isToday(day);

                    return (
                      <div
                        key={day.toISOString()}
                        className={cn(
                          'border-r border-border/50 last:border-r-0 relative',
                          isCurrentDay && 'bg-primary/5'
                        )}
                        style={{
                          minHeight: `${timeSlots.length * HOUR_HEIGHT}px`,
                        }}
                      >
                        {/* Slots de horário clicáveis - altura fixa para consistência.
                            AI dev note: Acessibilidade — slots operáveis por teclado
                            (role, tabIndex, Enter/Espaço) com foco visível. */}
                        {timeSlots.map((time) => (
                          <div
                            key={time}
                            role="button"
                            tabIndex={0}
                            aria-label={`Agendar ${format(day, "EEEE, d 'de' MMMM", { locale: ptBR })} às ${time}`}
                            style={{ height: HOUR_HEIGHT }}
                            className="border-b border-border/50 hover:bg-primary/5 focus-visible:bg-primary/5 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                            onClick={() => handleTimeSlotClick(time, day)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleTimeSlotClick(time, day);
                              }
                            }}
                          />
                        ))}

                        {fechamentos.map((event) => (
                          <WeekClosureBand
                            key={event.id}
                            event={event}
                            startHour={startHour}
                            endHour={endHour}
                            hourHeight={HOUR_HEIGHT}
                            onClick={handleEventClick}
                          />
                        ))}

                        {/* Blocos lado a lado (pointer-events só nos blocos,
                            para o clique no vazio continuar criando evento) */}
                        <div className="pointer-events-none absolute inset-0">
                          {layout.blocos.map((b) => (
                            <WeekEventBlock
                              key={b.event.id}
                              event={b.event}
                              startHour={startHour}
                              endHour={endHour}
                              hourHeight={HOUR_HEIGHT}
                              onClick={handleEventClick}
                              coluna={b.coluna}
                              span={b.span}
                              colunas={b.colunas}
                              estreito={b.estreito}
                              userRole={userRole}
                            />
                          ))}
                          {layout.excedentes.map((x) => (
                            <WeekOverflowBlock
                              key={`mais-${x.inicio.getTime()}`}
                              inicio={x.inicio}
                              fim={x.fim}
                              quantidade={x.events.length}
                              coluna={x.coluna}
                              colunas={x.colunas}
                              startHour={startHour}
                              endHour={endHour}
                              hourHeight={HOUR_HEIGHT}
                              onClick={() =>
                                setModalState({
                                  isOpen: true,
                                  date: day,
                                  events: x.events,
                                })
                              }
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Indicador de tempo atual DENTRO do container dos dias */}
                <CurrentTimeIndicator
                  startHour={startHour}
                  endHour={endHour}
                  className="absolute left-0 right-0"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Modal para eventos múltiplos */}
        {modalState.date && (
          <EventListModal
            isOpen={modalState.isOpen}
            onClose={closeModal}
            events={modalState.events}
            date={modalState.date}
            onEventClick={handleEventClick}
          />
        )}
      </>
    );
  }
);

WeekTimeGrid.displayName = 'WeekTimeGrid';
