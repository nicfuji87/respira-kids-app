import React from 'react';
import { cn } from '@/lib/utils';
import { EventCard } from './EventCard';
import type { CalendarEvent } from '@/types/calendar';

// AI dev note: WeekEventBlock é um Composed component
// Renderiza eventos com altura proporcional à duração na view semana

export interface WeekEventBlockProps {
  event: CalendarEvent;
  startHour?: number; // Hora de início do grid (padrão: 6)
  endHour?: number; // Hora de fim do grid (padrão: 20)
  hourHeight?: number; // Altura de cada hora em pixels (padrão: 64)
  onClick?: (event: CalendarEvent) => void;
  className?: string;
  overlapIndex?: number; // Índice para eventos sobrepostos (0, 1, 2...)
  totalOverlapping?: number; // Total de eventos sobrepostos no mesmo horário
  zIndex?: number; // Z-index para controle de sobreposição visual
  userRole?: 'admin' | 'profissional' | 'secretaria' | null;
}

export const WeekEventBlock = React.memo<WeekEventBlockProps>(
  ({
    event,
    startHour = 6,
    endHour = 20,
    hourHeight = 64,
    onClick,
    className,
    overlapIndex = 0,
    totalOverlapping = 1,
    zIndex = 1,
    userRole,
  }) => {
    const calculatePosition = () => {
      const eventStart = event.start;
      const eventEnd = event.end;

      // Calcula horário de início em minutos desde startHour
      const startHours = eventStart.getHours();
      const startMinutes = eventStart.getMinutes();
      const totalStartMinutes = (startHours - startHour) * 60 + startMinutes;

      // Calcula duração em minutos
      const endHours = eventEnd.getHours();
      const endMinutes = eventEnd.getMinutes();
      const totalEndMinutes = (endHours - startHour) * 60 + endMinutes;

      const durationMinutes = totalEndMinutes - totalStartMinutes;

      // Se evento está fora do range visível, não renderiza
      if (startHours >= endHour || endHours <= startHour) {
        return null;
      }

      // Ajusta para limites do grid
      const clampedStartMinutes = Math.max(0, totalStartMinutes);
      const maxMinutes = (endHour - startHour) * 60;
      const clampedDurationMinutes = Math.min(
        durationMinutes,
        maxMinutes - clampedStartMinutes
      );

      // Calcula posição e altura em pixels
      const topPosition = (clampedStartMinutes / 60) * hourHeight;
      const height = Math.max(20, (clampedDurationMinutes / 60) * hourHeight);

      // AI dev note: Estilo Google Agenda - eventos se sobrepõem parcialmente
      // Cada evento ocupa ~85% da largura e é posicionado com offset
      // Isso mantém legibilidade e mostra sobreposição visual
      let width: string;
      let leftOffset: string;

      if (totalOverlapping === 1) {
        width = '100%';
        leftOffset = '0%';
      } else {
        // Largura base: eventos ocupam mais espaço, se sobrepondo
        // Quanto mais eventos, menor a largura mas nunca menos que 50%
        const baseWidth = Math.max(50, 100 - (totalOverlapping - 1) * 15);
        width = `${baseWidth}%`;

        // Offset: cada coluna é deslocada proporcionalmente
        const offsetPercent =
          (overlapIndex * (100 - baseWidth)) / (totalOverlapping - 1 || 1);
        leftOffset = `${Math.min(offsetPercent, 100 - baseWidth)}%`;
      }

      return {
        top: topPosition,
        height,
        width,
        left: leftOffset,
      };
    };

    const position = calculatePosition();

    // Se evento não deve ser renderizado, retorna null
    if (!position) {
      return null;
    }

    const handleClick = () => {
      onClick?.(event);
    };

    return (
      <div
        className={cn(
          'absolute cursor-pointer group',
          'transition-all duration-200',
          className
        )}
        style={{
          top: `${position.top}px`,
          height: `${position.height}px`,
          width: position.width,
          left: position.left,
          zIndex: zIndex,
        }}
        onClick={handleClick}
        onMouseEnter={(e) => {
          // Ao passar o mouse, elevar z-index para ficar por cima
          e.currentTarget.style.zIndex = '100';
        }}
        onMouseLeave={(e) => {
          // Restaurar z-index original
          e.currentTarget.style.zIndex = String(zIndex);
        }}
      >
        <div className="w-full h-full p-0.5">
          <EventCard
            event={event}
            variant="week"
            onClick={handleClick}
            userRole={userRole}
            className="h-full w-full shadow-sm hover:shadow-md transition-shadow"
          />
        </div>
      </div>
    );
  }
);

WeekEventBlock.displayName = 'WeekEventBlock';
