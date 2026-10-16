import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, Ban } from 'lucide-react';

import { Button } from '@/components/primitives/button';
import { DatePicker, ViewToggle } from '@/components/composed';

import type { CalendarHeaderProps } from '@/types/calendar';

// AI dev note: CalendarHeader combina componentes Composed (DatePicker, ViewToggle)
// Header principal do calendário com navegação, seletor de vista e ações
// Hierarquia: título do período > navegação temporal > vista > CTA primário

export const CalendarHeader = React.memo<CalendarHeaderProps>(
  ({
    currentDate,
    currentView,
    onDateChange,
    onViewChange,
    onPrevious,
    onNext,
    onToday,
    onNewEvent,
    onBlockAgenda,
  }) => {
    const getDateLabel = () => {
      switch (currentView) {
        case 'month':
          return format(currentDate, 'MMMM yyyy', { locale: ptBR });
        case 'week':
          return `Semana de ${format(currentDate, 'dd MMM', { locale: ptBR })}`;
        case 'day':
          return format(currentDate, "EEEE, dd 'de' MMMM 'de' yyyy", {
            locale: ptBR,
          });
        case 'agenda':
          // "Agenda" repetia o título da página (topo)
          return 'Próximos agendamentos';
        default:
          return format(currentDate, 'MMMM yyyy', { locale: ptBR });
      }
    };

    const handleDateSelect = (dateString: string) => {
      // AI dev note: Criar data no timezone local para evitar bug de mudança de dia
      // Bug: new Date('2025-01-15') cria UTC 00:00, que em UTC-3 vira 14/01 21:00
      // Fix: criar data parseando componentes para o timezone local
      const [year, month, day] = dateString.split('-').map(Number);
      const selectedDate = new Date(year, month - 1, day);
      onDateChange(selectedDate);
    };

    const formatDateForPicker = (date: Date) => {
      return format(date, 'yyyy-MM-dd');
    };

    return (
      <div className="flex flex-wrap items-center gap-2 md:gap-3">
        {/* Título do período — headline da toolbar (h2: o h1 é o título da
            página, no topo) */}
        <h2 className="w-full sm:w-auto min-w-0 text-xl md:text-2xl font-semibold tracking-tight text-roxo-titulo dark:text-foreground first-letter:uppercase truncate">
          {getDateLabel()}
        </h2>

        {/* Grupo de navegação temporal — segmentado, bordas colapsadas */}
        <div className="inline-flex items-center rounded-md -space-x-px">
          <Button
            variant="outline"
            size="sm"
            onClick={onPrevious}
            aria-label="Período anterior"
            className="h-9 w-9 p-0 rounded-r-none focus-visible:z-10"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onToday}
            className="h-9 px-3 text-sm rounded-none focus-visible:z-10"
          >
            Hoje
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onNext}
            aria-label="Próximo período"
            className="h-9 w-9 p-0 rounded-l-none focus-visible:z-10"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* DatePicker para seleção rápida (desktop) */}
        <DatePicker
          value={formatDateForPicker(currentDate)}
          onChange={handleDateSelect}
          className="hidden sm:block w-auto"
          inputClassName="h-9 w-36 text-xs"
          placeholder="Ir para..."
        />

        {/* Empurra os controles de vista/ações para a direita */}
        <div className="flex-1" />

        {/* Seletor de vista — segmented control no desktop */}
        <ViewToggle
          currentView={currentView}
          onViewChange={onViewChange}
          className="hidden lg:inline-flex"
        />

        {/* Seletor de vista — dropdown compacto em telas menores */}
        <ViewToggle
          currentView={currentView}
          onViewChange={onViewChange}
          variant="compact"
          className="lg:hidden"
        />

        {/* Ação secundária: bloquear agenda */}
        {onBlockAgenda && (
          <Button
            variant="outline"
            size="sm"
            onClick={onBlockAgenda}
            className="h-9 px-3 text-sm"
            title="Bloquear agenda"
          >
            <Ban className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Bloquear</span>
          </Button>
        )}

        {/* Mobile: "ir para data" e o CTA dividem a mesma linha (antes eram
            duas linhas de largura total, além do título e da navegação) */}
        <div className="flex w-full items-center gap-2 sm:hidden">
          <DatePicker
            value={formatDateForPicker(currentDate)}
            onChange={handleDateSelect}
            placeholder="Ir para data"
            className="min-w-0 flex-1"
            inputClassName="h-9"
          />
          {onNewEvent && (
            <Button
              onClick={onNewEvent}
              className="h-9 shrink-0 px-3 font-semibold"
            >
              <Plus className="h-4 w-4" />
              Novo
            </Button>
          )}
        </div>

        {/* CTA primário — único botão sólido da toolbar (sm+) */}
        {onNewEvent && (
          <Button
            onClick={onNewEvent}
            className="hidden sm:inline-flex h-9 px-4 font-semibold"
          >
            <Plus className="h-4 w-4" />
            Novo Agendamento
          </Button>
        )}
      </div>
    );
  }
);

CalendarHeader.displayName = 'CalendarHeader';
