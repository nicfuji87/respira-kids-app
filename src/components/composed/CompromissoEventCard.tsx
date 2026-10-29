import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertTriangle,
  BookmarkCheck,
  Building2,
  Coffee,
  HeartPulse,
  Lock,
  Plane,
  Repeat,
  Users,
  User,
  CalendarClock,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { CalendarEvent } from '@/types/calendar';
import { eventColorHexMap, EVENT_FALLBACK_HEX } from '@/types/calendar';
import type { CompromissoEventMetadata } from '@/lib/agenda-bloqueios-api';

// AI dev note: Visual dos COMPROMISSOS na agenda (almoço, terapia, férias...).
// Ocupa a faixa de horário como uma consulta, mas se diferencia por: ícone da
// categoria, cadeado quando privado/indisponível e listras finas quando o horário
// fica fechado para novas consultas. Conflito pendente aparece com alerta.
// RESERVA: ícone de marcador + borda tracejada (horário seguro, falta confirmar).

type Variant = 'week' | 'month' | 'list' | 'strip';

const ICONES: Record<string, React.ComponentType<{ className?: string }>> = {
  almoco: Coffee,
  pessoal: User,
  saude: HeartPulse,
  reuniao: Users,
  ferias: Plane,
  feriado: Building2,
  outro: CalendarClock,
  reserva: BookmarkCheck,
};

function iconeCompromisso(m: CompromissoEventMetadata) {
  if (m.mascarado) return Lock;
  if (m.clinicaInteira) return Building2;
  return ICONES[m.categoria ?? 'outro'] ?? CalendarClock;
}

const formatHora = (d: Date) => format(d, 'HH:mm', { locale: ptBR });

function horarioCompromisso(event: CalendarEvent): string {
  const inicio = event.start;
  const fim = event.end;
  if (event.allDay) {
    const fimDia = new Date(fim.getTime() - 1000);
    return format(inicio, 'yyyy-MM-dd') === format(fimDia, 'yyyy-MM-dd')
      ? 'Dia inteiro'
      : `${format(inicio, 'dd/MM')} a ${format(fimDia, 'dd/MM')}`;
  }
  return format(inicio, 'yyyy-MM-dd') === format(fim, 'yyyy-MM-dd')
    ? `${formatHora(inicio)}–${formatHora(fim)}`
    : `${format(inicio, 'dd/MM HH:mm')} – ${format(fim, 'dd/MM HH:mm')}`;
}

interface CompromissoEventCardProps {
  event: CalendarEvent;
  variant: Variant;
  onClick?: (event: CalendarEvent) => void;
  className?: string;
}

export const CompromissoEventCard = React.memo<CompromissoEventCardProps>(
  ({ event, variant, onClick, className }) => {
    const m = event.metadata as CompromissoEventMetadata;
    const cor = event.color
      ? eventColorHexMap[event.color] || EVENT_FALLBACK_HEX
      : EVENT_FALLBACK_HEX;
    const Icone = iconeCompromisso(m);
    const horario = horarioCompromisso(event);
    const quem = m.clinicaInteira
      ? 'Clínica inteira'
      : (m.profissionalNome ?? '').split(' ')[0];
    const temConflito = m.conflitos > 0;
    const cadeado = m.impedeAgendamento;

    const label = `${event.title}, ${horario}${quem ? `, ${quem}` : ''}${
      m.impedeAgendamento ? ', horário indisponível' : ''
    }${temConflito ? `, ${m.conflitos} consulta(s) em conflito` : ''}`;

    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      onClick?.(event);
    };
    const keyboard = {
      role: 'button' as const,
      tabIndex: 0,
      'aria-label': label,
      title: [
        event.title,
        horario,
        quem,
        m.recorrente ? 'Repete' : '',
        m.reserva
          ? 'Reservado: falta confirmar o agendamento'
          : m.impedeAgendamento
            ? 'Indisponível para novas consultas'
            : 'Só informativo',
        m.reserva ? (event.description ?? '') : '',
        temConflito ? `⚠ ${m.conflitos} consulta(s) em conflito` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onClick?.(event);
        }
      },
    };
    const focus =
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1';

    // Listras finas = horário fechado para consultas
    const fundo = m.impedeAgendamento
      ? `repeating-linear-gradient(135deg, ${cor}26 0 6px, ${cor}14 6px 12px)`
      : `${cor}14`;

    if (variant === 'week' || variant === 'strip') {
      return (
        <div
          className={cn(
            'h-full w-full cursor-pointer overflow-hidden rounded-md text-roxo-titulo transition-opacity hover:opacity-90 dark:text-foreground',
            (!m.impedeAgendamento || m.reserva) && 'border border-dashed',
            focus,
            className
          )}
          style={{
            background: fundo,
            borderLeft: `3px solid ${cor}`,
            borderColor: m.reserva
              ? cor
              : m.impedeAgendamento
                ? undefined
                : `${cor}99`,
          }}
          onClick={handleClick}
          {...keyboard}
        >
          <div
            className={cn(
              'flex h-full min-w-0 px-1.5 py-0.5',
              variant === 'strip' ? 'items-center gap-1' : 'flex-col'
            )}
          >
            <div className="flex min-w-0 items-center gap-1">
              <Icone className="h-3 w-3 shrink-0 opacity-80" />
              <span className="min-w-0 flex-1 truncate text-[11px] font-semibold leading-tight">
                {event.title}
              </span>
              {temConflito && (
                <AlertTriangle className="h-3 w-3 shrink-0 text-destructive" />
              )}
              {cadeado && variant === 'week' && (
                <Lock className="h-2.5 w-2.5 shrink-0 opacity-60" />
              )}
            </div>
            {variant === 'week' && (
              <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] leading-tight opacity-80">
                <span className="truncate">
                  {event.allDay ? horario : horario}
                  {quem ? ` · ${quem}` : ''}
                </span>
                {m.recorrente && <Repeat className="h-2.5 w-2.5 shrink-0" />}
              </div>
            )}
            {variant === 'strip' && quem && (
              <span className="hidden truncate text-[11px] opacity-70 sm:inline">
                {quem}
              </span>
            )}
          </div>
        </div>
      );
    }

    if (variant === 'month') {
      return (
        <div
          className={cn(
            'flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 transition-opacity hover:opacity-80',
            focus,
            className
          )}
          style={{ background: `${cor}1f` }}
          onClick={handleClick}
          {...keyboard}
        >
          <Icone className="h-3 w-3 shrink-0 text-roxo-titulo/80 dark:text-foreground/80" />
          {!event.allDay && (
            <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
              {formatHora(event.start)}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
            {event.title}
          </span>
          {temConflito && (
            <AlertTriangle className="h-3 w-3 shrink-0 text-destructive" />
          )}
        </div>
      );
    }

    // list: agenda / lista do dia
    return (
      <div
        className={cn(
          'flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/40',
          focus,
          className
        )}
        onClick={handleClick}
        {...keyboard}
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-roxo-titulo dark:text-foreground"
          style={{ background: fundo }}
        >
          <Icone className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium text-roxo-titulo dark:text-foreground">
              {event.title}
            </span>
            {cadeado && <Lock className="h-3.5 w-3.5 shrink-0 opacity-60" />}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
            <span className="tabular-nums">{horario}</span>
            {quem && <span>· {quem}</span>}
            {m.recorrente && (
              <span className="inline-flex items-center gap-0.5">
                · <Repeat className="h-3 w-3" /> repete
              </span>
            )}
            {!m.impedeAgendamento && <span>· só informativo</span>}
            {m.reserva && <span>· falta confirmar</span>}
          </div>
          {m.reserva && event.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {event.description}
            </p>
          )}
          {temConflito && (
            <p className="mt-1 flex items-center gap-1 text-xs font-medium text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              {m.conflitos === 1
                ? '1 consulta em conflito — reagendar'
                : `${m.conflitos} consultas em conflito — reagendar`}
            </p>
          )}
        </div>
      </div>
    );
  }
);

CompromissoEventCard.displayName = 'CompromissoEventCard';
