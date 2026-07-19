import React from 'react';
import {
  Calendar,
  CalendarDays,
  CalendarRange,
  List,
  ChevronDown,
} from 'lucide-react';

import { Button } from '@/components/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/primitives/dropdown-menu';
import { cn } from '@/lib/utils';
import type { CalendarView, CalendarViewOption } from '@/types/calendar';

// AI dev note: ViewToggle combina Button e DropdownMenu primitives
// Permite alternar entre diferentes vistas do calendário
// Variante 'default' = segmented control (desktop); 'compact' = dropdown (mobile)

export interface ViewToggleProps {
  currentView: CalendarView;
  onViewChange: (view: CalendarView) => void;
  className?: string;
  variant?: 'default' | 'compact';
}

const viewOptions: CalendarViewOption[] = [
  {
    value: 'month',
    label: 'Mês',
    icon: Calendar,
  },
  {
    value: 'week',
    label: 'Semana',
    icon: CalendarRange,
  },
  {
    value: 'day',
    label: 'Dia',
    icon: CalendarDays,
  },
  {
    value: 'agenda',
    label: 'Agenda',
    icon: List,
  },
];

export const ViewToggle = React.memo<ViewToggleProps>(
  ({ currentView, onViewChange, className, variant = 'default' }) => {
    const currentOption = viewOptions.find(
      (option) => option.value === currentView
    );
    const CurrentIcon = currentOption?.icon || Calendar;

    const handleViewChange = (view: CalendarView) => {
      onViewChange(view);
    };

    if (variant === 'compact') {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn('h-9 px-3 text-sm', className)}
            >
              <CurrentIcon className="h-4 w-4 mr-1.5" />
              {currentOption?.label}
              <ChevronDown className="h-4 w-4 ml-1.5 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            {viewOptions.map((option) => {
              const IconComponent = option.icon || Calendar;
              const isActive = option.value === currentView;

              return (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => handleViewChange(option.value)}
                  className={cn(
                    'cursor-pointer text-sm',
                    isActive && 'bg-accent text-accent-foreground font-medium'
                  )}
                >
                  <IconComponent className="h-4 w-4 mr-2" />
                  {option.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }

    // Segmented control: um grupo coeso de botões com bordas colapsadas
    return (
      <div
        role="group"
        aria-label="Alterar vista do calendário"
        className={cn(
          'inline-flex items-center rounded-md -space-x-px',
          className
        )}
      >
        {viewOptions.map((option) => {
          const IconComponent = option.icon || Calendar;
          const isActive = option.value === currentView;

          return (
            <Button
              key={option.value}
              variant="outline"
              size="sm"
              aria-pressed={isActive}
              onClick={() => handleViewChange(option.value)}
              className={cn(
                'h-9 px-3 text-sm rounded-none first:rounded-l-md last:rounded-r-md',
                'focus-visible:z-10',
                isActive &&
                  'bg-primary/15 border-primary/40 text-roxo-titulo font-semibold z-[1] hover:bg-primary/20'
              )}
            >
              <IconComponent className="h-4 w-4 mr-1.5" />
              {option.label}
            </Button>
          );
        })}
      </div>
    );
  }
);

ViewToggle.displayName = 'ViewToggle';
