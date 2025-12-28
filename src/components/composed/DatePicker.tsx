import React, { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';

import { Button } from '@/components/primitives/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/primitives/popover';
import { Calendar } from '@/components/primitives/calendar';
import { cn } from '@/lib/utils';

interface DatePickerProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  'aria-describedby'?: string;
  disableFuture?: boolean; // Bloqueia datas futuras (útil para data de nascimento)
  disablePast?: boolean; // Bloqueia datas passadas (útil para agendamentos)
  // AI dev note: Intervalo de anos para o dropdown do calendário
  // Por padrão permite navegação de 5 anos no passado até 2 anos no futuro
  startYear?: number;
  endYear?: number;
}

export const DatePicker = React.memo<DatePickerProps>(
  ({
    value,
    onChange,
    placeholder = 'Selecione uma data',
    disabled = false,
    className,
    inputClassName,
    'aria-describedby': ariaDescribedBy,
    disableFuture = false,
    disablePast = false,
    startYear,
    endYear,
  }) => {
    const [isOpen, setIsOpen] = useState(false);

    // AI dev note: Calcular intervalo de anos para o dropdown
    // Por padrão: 5 anos no passado até 2 anos no futuro
    const currentYear = new Date().getFullYear();
    const defaultStartYear = startYear ?? currentYear - 5;
    const defaultEndYear = endYear ?? currentYear + 2;

    // Converter string YYYY-MM-DD para Date
    const selectedDate = value ? new Date(value + 'T00:00:00') : undefined;

    // Converter Date para string YYYY-MM-DD
    const handleDateSelect = (date: Date | undefined) => {
      if (date && onChange) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        onChange(`${year}-${month}-${day}`);
      }
      setIsOpen(false);
    };

    // Formatar data para exibição
    const displayValue = selectedDate
      ? format(selectedDate, 'dd/MM/yyyy', { locale: ptBR })
      : '';

    return (
      <div className={cn('relative', className)}>
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              className={cn(
                'w-full h-12 justify-start text-left font-normal theme-transition',
                !selectedDate && 'text-muted-foreground',
                inputClassName
              )}
              aria-describedby={ariaDescribedBy}
              aria-label="Selecionar data"
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {displayValue || placeholder}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start" side="bottom">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleDateSelect}
              startMonth={new Date(defaultStartYear, 0)}
              endMonth={new Date(defaultEndYear, 11)}
              disabled={(date) => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                if (disableFuture && date > today) return true;
                if (disablePast && date < today) return true;

                return false;
              }}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>
    );
  }
);

DatePicker.displayName = 'DatePicker';
