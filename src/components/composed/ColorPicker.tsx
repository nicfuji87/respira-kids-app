import React from 'react';
import { Check } from 'lucide-react';

import { Button } from '@/components/primitives/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/primitives/popover';
import { cn } from '@/lib/utils';
import type { EventColor } from '@/types/calendar';

// AI dev note: ColorPicker combina Button e Popover primitives
// Permite seleção de cores para eventos do calendário

export interface ColorPickerProps {
  value?: EventColor;
  onChange?: (color: EventColor) => void;
  className?: string;
  disabled?: boolean;
}

const colorOptions: Array<{
  value: EventColor;
  label: string;
  bgClass: string;
  borderClass: string;
}> = [
  {
    value: 'blue',
    label: 'Azul',
    bgClass: 'bg-blue-500',
    borderClass: 'border-blue-500',
  },
  {
    value: 'green',
    label: 'Verde',
    bgClass: 'bg-green-500',
    borderClass: 'border-green-500',
  },
  {
    value: 'orange',
    label: 'Laranja',
    bgClass: 'bg-orange-500',
    borderClass: 'border-orange-500',
  },
  {
    value: 'red',
    label: 'Vermelho',
    bgClass: 'bg-red-500',
    borderClass: 'border-red-500',
  },
  {
    value: 'purple',
    label: 'Roxo',
    bgClass: 'bg-purple-500',
    borderClass: 'border-purple-500',
  },
  {
    value: 'pink',
    label: 'Rosa',
    bgClass: 'bg-pink-500',
    borderClass: 'border-pink-500',
  },
  {
    value: 'gray',
    label: 'Cinza',
    bgClass: 'bg-gray-500',
    borderClass: 'border-gray-500',
  },
];

export const ColorPicker = React.memo<ColorPickerProps>(
  ({ value = 'blue', onChange, className, disabled = false }) => {
    const selectedColor =
      colorOptions.find((color) => color.value === value) || colorOptions[0];

    const handleColorSelect = (color: EventColor) => {
      onChange?.(color);
    };

    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            disabled={disabled}
            className={cn('w-full justify-start h-10 px-3', className)}
          >
            <div
              className={cn(
                'w-4 h-4 rounded-full mr-2 border',
                selectedColor.bgClass,
                selectedColor.borderClass
              )}
            />
            <span className="flex-1 text-left">{selectedColor.label}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2">
          <div className="grid grid-cols-2 gap-1">
            {colorOptions.map((color) => {
              const isSelected = color.value === value;

              return (
                <Button
                  key={color.value}
                  variant="ghost"
                  onClick={() => handleColorSelect(color.value)}
                  className={cn(
                    'justify-start h-8 px-2 w-full',
                    isSelected && 'bg-accent'
                  )}
                >
                  <div
                    className={cn(
                      'w-3 h-3 rounded-full mr-2 border',
                      color.bgClass,
                      color.borderClass
                    )}
                  />
                  <span className="text-sm flex-1 text-left">
                    {color.label}
                  </span>
                  {isSelected && <Check className="h-3 w-3 text-primary" />}
                </Button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    );
  }
);

ColorPicker.displayName = 'ColorPicker';
