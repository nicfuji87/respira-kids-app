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
              className={cn('h-8 px-2 text-xs', className)}
            >
              <CurrentIcon className="h-3 w-3 mr-1" />
              {currentOption?.label}
              <ChevronDown className="h-3 w-3 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-32">
            {viewOptions.map((option) => {
              const IconComponent = option.icon || Calendar;
              const isActive = option.value === currentView;

              return (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => handleViewChange(option.value)}
                  className={cn(
                    'cursor-pointer text-xs',
                    isActive && 'bg-accent text-accent-foreground'
                  )}
                >
                  <IconComponent className="h-3 w-3 mr-2" />
                  {option.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className={cn('justify-between min-w-[120px]', className)}
          >
            <div className="flex items-center">
              <CurrentIcon className="h-4 w-4 mr-2" />
              {currentOption?.label}
            </div>
            <ChevronDown className="h-4 w-4 ml-2" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[160px]">
          {viewOptions.map((option) => {
            const IconComponent = option.icon || Calendar;
            const isActive = option.value === currentView;

            return (
              <DropdownMenuItem
                key={option.value}
                onClick={() => handleViewChange(option.value)}
                className={cn(
                  'cursor-pointer',
                  isActive && 'bg-accent text-accent-foreground'
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
);

ViewToggle.displayName = 'ViewToggle';
