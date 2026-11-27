import React, { useState, useMemo } from 'react';
import { format, isSameDay, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/primitives/card';
import {
  CurrentTimeIndicator,
  WeekEventBlock,
  WeekOverflowBlock,
  WeekClosureBand,
  EventCard,
} from '@/components/composed';
import { EventListModal } from '../calendar';
import type { CalendarEvent } from '@/types/calendar';
import {
  ehEventoDeFaixa,
  eventoCobreDia,
  isCompromissoEvent,
} from '@/lib/agenda-bloqueios-api';
import {
  ehFechamentoComHorario,
  layoutColunas,
  type LayoutColunas,
} from '@/lib/calendar-layout';

// AI dev note: DayView — vista diária com UMA COLUNA POR PROFISSIONAL quando o
// dia tem mais de um. Cada coluna leva as consultas, reservas e compromissos
// daquele profissional, então "Exames da Flávia" fica só na coluna dela (antes
// ocupava a largura toda e parecia fechar a clínica). Fechamento da clínica com
// horário é faixa de fundo atravessando todas as colunas. Dentro da coluna, os
// blocos ficam lado a lado (lib/calendar-layout), nunca um por cima do outro.

const START_HOUR = 7;
const END_HOUR = 20;
const HOUR_HEIGHT = 64;
const LARGURA_MIN_COLUNA = 140; // px; abaixo disso a grade rola na horizontal
const SEM_PROFISSIONAL = '__sem_profissional__';

interface Coluna {
  id: string;
  nome: string;
  consultas: number;
  layout: LayoutColunas;
}

const profissionalDoEvento = (e: CalendarEvent) => ({
  id: (e.metadata?.profissionalId as string | null | undefined) || null,
  nome: (e.metadata?.profissionalNome as string | null | undefined) || '',
});

export interface DayViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  onTimeSlotClick?: (time: string, date: Date) => void;
  className?: string;
  userRole?: 'admin' | 'profissional' | 'secretaria' | null;
}

export const DayView = React.memo<DayViewProps>(
  ({
    currentDate,
    events,
    onEventClick,
    onTimeSlotClick,
    className,
    userRole,
  }) => {
    const [modalState, setModalState] = useState<{
      isOpen: boolean;
      date: Date | null;
      events: CalendarEvent[];
    }>({ isOpen: false, date: null, events: [] });

    const scrollRef = React.useRef<HTMLDivElement>(null);

    const timeSlots = useMemo(
      () =>
        Array.from({ length: END_HOUR - START_HOUR }, (_, i) => {
          const hour = i + START_HOUR;
          return `${hour.toString().padStart(2, '0')}:00`;
        }),
      []
    );

    // Dia inteiro / vários dias (feriado, férias) vão para a faixa do topo
    const eventosFaixa = useMemo(
      () =>
        events.filter(
          (e) => ehEventoDeFaixa(e) && eventoCobreDia(e, currentDate)
        ),
      [events, currentDate]
    );

    const { colunas, fechamentos } = useMemo(() => {
      const doDia = events.filter(
        (e) => !ehEventoDeFaixa(e) && isSameDay(e.start, currentDate)
      );
      const fech = doDia.filter(ehFechamentoComHorario);
      const resto = doDia.filter((e) => !ehFechamentoComHorario(e));

      const grupos = new Map<string, { nome: string; evs: CalendarEvent[] }>();
      for (const e of resto) {
        const p = profissionalDoEvento(e);
        const id = p.id ?? SEM_PROFISSIONAL;
        const g = grupos.get(id) ?? { nome: p.nome, evs: [] };
        if (!g.nome && p.nome) g.nome = p.nome;
        g.evs.push(e);
        grupos.set(id, g);
      }

      const varias = grupos.size > 1;
      const cols: Coluna[] = Array.from(grupos.entries())
        .map(([id, g]) => ({
          id,
          nome:
            id === SEM_PROFISSIONAL ? 'Sem profissional' : g.nome || 'Equipe',
          consultas: g.evs.filter((e) => !isCompromissoEvent(e)).length,
          layout: layoutColunas(g.evs, varias ? 3 : 4),
        }))
        .sort((a, b) =>
          a.id === SEM_PROFISSIONAL
            ? 1
            : b.id === SEM_PROFISSIONAL
              ? -1
              : a.nome.localeCompare(b.nome, 'pt-BR')
        );

      return { colunas: cols, fechamentos: fech };
    }, [events, currentDate]);

    const porProfissional = colunas.length > 1;
    const totalColunas = Math.max(1, colunas.length);
    const gridColunas = `3.5rem repeat(${totalColunas}, minmax(${
      porProfissional ? LARGURA_MIN_COLUNA : 0
    }px, 1fr))`;

    // Hoje: rola até 1h antes de agora
    React.useEffect(() => {
      if (!isToday(currentDate) || !scrollRef.current) return;
      const alvo = Math.max(START_HOUR, new Date().getHours() - 1);
      const t = setTimeout(() => {
        scrollRef.current?.scrollTo({
          top: (alvo - START_HOUR) * HOUR_HEIGHT,
          behavior: 'smooth',
        });
      }, 100);
      return () => clearTimeout(t);
    }, [currentDate]);

    const handleEventClick = (event: CalendarEvent) => onEventClick?.(event);
    const closeModal = () =>
      setModalState({ isOpen: false, date: null, events: [] });

    const dayLabel = format(currentDate, "EEEE, dd 'de' MMMM", {
      locale: ptBR,
    });
    const isCurrentDay = isToday(currentDate);

    return (
      <>
        <Card className={cn('w-full overflow-hidden', className)}>
          <CardContent className="p-0">
            {/* Header com dia. DS — título roxo-titulo; "Hoje" vira chip teal */}
            <div className="border-b border-border/60 bg-muted/30 p-2 md:p-3">
              <h2 className="flex items-center gap-2 text-sm md:text-base font-semibold capitalize text-roxo-titulo">
                <span className="md:hidden">
                  {format(currentDate, 'EEE, dd/MM', { locale: ptBR })}
                </span>
                <span className="hidden md:inline">{dayLabel}</span>
                {isCurrentDay && (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium normal-case text-primary-foreground">
                    Hoje
                  </span>
                )}
              </h2>
            </div>

            {/* Faixa "dia inteiro": feriado/clínica fechada, férias */}
            {eventosFaixa.length > 0 && (
              <div className="grid w-full grid-cols-[3.5rem_1fr] border-b border-border/60">
                <div className="flex items-center justify-end border-r border-border/50 pr-1.5 text-right text-xs leading-tight text-muted-foreground">
                  Dia todo
                </div>
                <div className="space-y-1 p-1">
                  {eventosFaixa.map((e) => (
                    <div key={e.id} className="h-7">
                      <EventCard
                        event={e}
                        variant="week"
                        umaLinha
                        onClick={handleEventClick}
                        className="h-full"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div
              ref={scrollRef}
              className="h-[calc(100vh-12rem)] md:h-[calc(100vh-10rem)] overflow-auto"
            >
              <div
                style={{
                  minWidth: porProfissional
                    ? `calc(3.5rem + ${totalColunas * LARGURA_MIN_COLUNA}px)`
                    : undefined,
                }}
              >
                {/* Nome de cada profissional no topo da coluna */}
                {porProfissional && (
                  <div
                    className="sticky top-0 z-30 grid border-b border-border/60 bg-card"
                    style={{ gridTemplateColumns: gridColunas }}
                  >
                    <div className="border-r border-border/50" />
                    {colunas.map((c) => (
                      <div
                        key={c.id}
                        className="flex min-w-0 items-baseline gap-1.5 border-r border-border/50 px-2 py-1.5 last:border-r-0"
                        title={c.nome}
                      >
                        <span className="truncate text-sm font-semibold text-roxo-titulo dark:text-foreground">
                          {c.nome.split(' ')[0]}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {c.consultas === 1
                            ? '1 consulta'
                            : `${c.consultas} consultas`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div
                  className="grid"
                  style={{ gridTemplateColumns: gridColunas }}
                >
                  {/* Coluna de horários: rótulo sobre a linha da hora */}
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

                  <div
                    className="relative"
                    style={{
                      gridColumn: '2 / -1',
                      height: timeSlots.length * HOUR_HEIGHT,
                    }}
                  >
                    {/* Slots clicáveis (largura toda) */}
                    {timeSlots.map((time) => (
                      <div
                        key={time}
                        role="button"
                        tabIndex={0}
                        aria-label={`Agendar ${format(currentDate, "EEEE, d 'de' MMMM", { locale: ptBR })} às ${time}`}
                        className="border-b border-border/50 hover:bg-primary/5 focus-visible:bg-primary/5 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                        style={{ height: HOUR_HEIGHT }}
                        onClick={() => onTimeSlotClick?.(time, currentDate)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onTimeSlotClick?.(time, currentDate);
                          }
                        }}
                      />
                    ))}

                    {fechamentos.map((event) => (
                      <WeekClosureBand
                        key={event.id}
                        event={event}
                        startHour={START_HOUR}
                        endHour={END_HOUR}
                        hourHeight={HOUR_HEIGHT}
                        onClick={handleEventClick}
                      />
                    ))}

                    {/* Uma coluna por profissional; pointer-events só nos
                        blocos, para o clique no vazio continuar agendando */}
                    <div
                      className="pointer-events-none absolute inset-0 grid"
                      style={{
                        gridTemplateColumns: `repeat(${totalColunas}, minmax(0, 1fr))`,
                      }}
                    >
                      {colunas.map((c) => (
                        <div
                          key={c.id}
                          className="relative border-r border-border/50 last:border-r-0"
                        >
                          {c.layout.blocos.map((b) => (
                            <WeekEventBlock
                              key={b.event.id}
                              event={b.event}
                              startHour={START_HOUR}
                              endHour={END_HOUR}
                              hourHeight={HOUR_HEIGHT}
                              onClick={handleEventClick}
                              coluna={b.coluna}
                              span={b.span}
                              colunas={b.colunas}
                              estreito={b.estreito}
                              segundaLinha={
                                porProfissional ? 'servico' : 'profissional'
                              }
                              userRole={userRole}
                            />
                          ))}
                          {c.layout.excedentes.map((x) => (
                            <WeekOverflowBlock
                              key={`mais-${x.inicio.getTime()}`}
                              inicio={x.inicio}
                              fim={x.fim}
                              quantidade={x.events.length}
                              coluna={x.coluna}
                              colunas={x.colunas}
                              startHour={START_HOUR}
                              endHour={END_HOUR}
                              hourHeight={HOUR_HEIGHT}
                              onClick={() =>
                                setModalState({
                                  isOpen: true,
                                  date: currentDate,
                                  events: x.events,
                                })
                              }
                            />
                          ))}
                        </div>
                      ))}
                    </div>

                    <CurrentTimeIndicator
                      startHour={START_HOUR}
                      endHour={END_HOUR}
                    />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

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

DayView.displayName = 'DayView';
