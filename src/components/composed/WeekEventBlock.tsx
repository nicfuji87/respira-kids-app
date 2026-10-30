import React from 'react';
import { cn } from '@/lib/utils';
import { EventCard } from './EventCard';
import type { CalendarEvent } from '@/types/calendar';
import { posicaoVertical } from '@/lib/calendar-layout';

// AI dev note: WeekEventBlock posiciona um evento na grade de horas (Semana e
// Dia). A posição horizontal vem pronta do layoutColunas (coluna/span/colunas):
// os blocos ficam lado a lado, nunca um por cima do outro. Bloco baixo (< 38px)
// mostra uma linha só; bloco estreito usa nome curto.

export interface WeekEventBlockProps {
  event: CalendarEvent;
  startHour?: number;
  endHour?: number;
  hourHeight?: number;
  onClick?: (event: CalendarEvent) => void;
  className?: string;
  coluna?: number;
  span?: number;
  colunas?: number;
  estreito?: boolean;
  zIndex?: number;
  userRole?: 'admin' | 'profissional' | 'secretaria' | null;
  segundaLinha?: 'profissional' | 'servico';
}

export const WeekEventBlock = React.memo<WeekEventBlockProps>(
  ({
    event,
    startHour = 7,
    endHour = 20,
    hourHeight = 56,
    onClick,
    className,
    coluna = 0,
    span = 1,
    colunas = 1,
    estreito = false,
    zIndex = 10,
    userRole,
    segundaLinha,
  }) => {
    const pos = posicaoVertical(
      event.start,
      event.end,
      startHour,
      endHour,
      hourHeight
    );
    if (!pos) return null;

    const left = (coluna / colunas) * 100;
    const width = (span / colunas) * 100;
    const umaLinha = pos.height < 38;

    return (
      <div
        className={cn('absolute pointer-events-auto', className)}
        style={{
          top: `${pos.top}px`,
          height: `${pos.height}px`,
          left: `${left}%`,
          width: `${width}%`,
          zIndex,
        }}
      >
        {/* p-px + pr-0.5: respiro entre blocos vizinhos sem perder largura */}
        <div className="h-full w-full py-px pl-px pr-0.5">
          <EventCard
            event={event}
            variant="week"
            onClick={onClick}
            userRole={userRole}
            estreito={estreito}
            umaLinha={umaLinha}
            segundaLinha={segundaLinha}
            className="h-full w-full"
          />
        </div>
      </div>
    );
  }
);

WeekEventBlock.displayName = 'WeekEventBlock';

// Bloco "+N" quando o horário tem mais eventos do que cabe lado a lado
export interface WeekOverflowBlockProps {
  inicio: Date;
  fim: Date;
  quantidade: number;
  coluna: number;
  colunas: number;
  startHour?: number;
  endHour?: number;
  hourHeight?: number;
  onClick: () => void;
}

export const WeekOverflowBlock = React.memo<WeekOverflowBlockProps>(
  ({
    inicio,
    fim,
    quantidade,
    coluna,
    colunas,
    startHour = 7,
    endHour = 20,
    hourHeight = 56,
    onClick,
  }) => {
    const pos = posicaoVertical(inicio, fim, startHour, endHour, hourHeight);
    if (!pos) return null;
    return (
      <div
        className="absolute pointer-events-auto py-px pl-px pr-0.5"
        style={{
          top: `${pos.top}px`,
          height: `${pos.height}px`,
          left: `${(coluna / colunas) * 100}%`,
          width: `${(1 / colunas) * 100}%`,
          zIndex: 10,
        }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          title={`Mais ${quantidade} neste horário`}
          aria-label={`Ver mais ${quantidade} eventos neste horário`}
          className="flex h-full w-full items-start justify-center rounded-md border border-dashed border-roxo-titulo/30 bg-muted/60 pt-0.5 text-[11px] font-semibold text-roxo-titulo transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-foreground"
        >
          +{quantidade}
        </button>
      </div>
    );
  }
);

WeekOverflowBlock.displayName = 'WeekOverflowBlock';

// Fechamento da clínica com horário (evento, feriado parcial): faixa de fundo
// listrada atravessando a coluna inteira, com a etiqueta clicável no topo. Fica
// por baixo das consultas — consulta por cima dela é conflito e deve aparecer.
export interface WeekClosureBandProps {
  event: CalendarEvent;
  startHour?: number;
  endHour?: number;
  hourHeight?: number;
  onClick?: (event: CalendarEvent) => void;
}

export const WeekClosureBand = React.memo<WeekClosureBandProps>(
  ({ event, startHour = 7, endHour = 20, hourHeight = 56, onClick }) => {
    const pos = posicaoVertical(
      event.start,
      event.end,
      startHour,
      endHour,
      hourHeight
    );
    if (!pos) return null;
    return (
      <div
        className="pointer-events-none absolute inset-x-0 border-y border-vermelho-kids/50"
        style={{
          top: `${pos.top}px`,
          height: `${pos.height}px`,
          zIndex: 5,
          background:
            'repeating-linear-gradient(135deg, rgb(244 162 139 / 0.16) 0 6px, rgb(244 162 139 / 0.06) 6px 12px)',
        }}
      >
        <div className="pointer-events-auto relative z-20 m-0.5 h-5 max-w-full">
          <EventCard
            event={event}
            variant="week"
            umaLinha
            onClick={onClick}
            className="h-full bg-background/90"
          />
        </div>
      </div>
    );
  }
);

WeekClosureBand.displayName = 'WeekClosureBand';
