import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';

import { Button } from '@/components/primitives/button';
import { DatePicker, ViewToggle } from '@/components/composed';

import type { CalendarHeaderProps } from '@/types/calendar';

// AI dev note: CalendarHeader combina componentes Composed (DatePicker, ViewToggle)
// Header principal do calendário com navegação, seletor de vista e ações

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
          return 'Agenda';
        default:
          return format(currentDate, 'MMMM yyyy', { locale: ptBR });
      }
    };

    const handleDateSelect = (dateString: string) => {
      const selectedDate = new Date(dateString);
      onDateChange(selectedDate);
    };

    const formatDateForPicker = (date: Date) => {
      return format(date, 'yyyy-MM-dd');
    };

    return (
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 border-b bg-background">
        {/* Seção de navegação e data */}
        <div className="flex items-center gap-3">
          {/* Botões de navegação */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={onPrevious}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={onNext}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={onToday}
              className="h-8 px-3 text-sm"
            >
              Hoje
            </Button>
          </div>

          {/* Título da data */}
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-semibold capitalize">
              {getDateLabel()}
            </h1>

            {/* DatePicker para seleção rápida */}
            <DatePicker
              value={formatDateForPicker(currentDate)}
              onChange={handleDateSelect}
              className="hidden sm:block w-auto"
              inputClassName="h-8 w-32 text-xs"
              placeholder="Ir para..."
            />
          </div>
        </div>

        {/* Seção de controles */}
        <div className="flex items-center gap-3">
          {/* Seletor de vista */}
          <ViewToggle
            currentView={currentView}
            onViewChange={onViewChange}
            variant="compact"
            className="hidden sm:flex"
          />

          {/* Seletor de vista mobile */}
          <ViewToggle
            currentView={currentView}
            onViewChange={onViewChange}
            variant="compact"
            className="sm:hidden"
          />

          {/* Botão de novo evento */}
          {onNewEvent && (
            <Button onClick={onNewEvent} className="h-8 px-3 text-sm">
              <Plus className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Novo Evento</span>
              <span className="sm:hidden">Novo</span>
            </Button>
          )}
        </div>

        {/* DatePicker mobile */}
        <div className="w-full sm:hidden">
          <DatePicker
            value={formatDateForPicker(currentDate)}
            onChange={handleDateSelect}
            placeholder="Selecionar data"
            className="w-full"
          />
        </div>
      </div>
    );
  }
);

CalendarHeader.displayName = 'CalendarHeader';
