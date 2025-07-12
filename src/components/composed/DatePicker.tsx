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
  }) => {
    const [isOpen, setIsOpen] = useState(false);

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
              disabled={(date) => date > new Date()}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>
    );
  }
);

DatePicker.displayName = 'DatePicker';
