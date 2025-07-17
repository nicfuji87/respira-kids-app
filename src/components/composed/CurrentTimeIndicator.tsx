import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

// AI dev note: CurrentTimeIndicator é um Composed component
// Renderiza linha vermelha indicando horário atual na view semana

export interface CurrentTimeIndicatorProps {
  startHour?: number; // Hora de início do grid (padrão: 7)
  endHour?: number; // Hora de fim do grid (padrão: 22)
  className?: string;
}

export const CurrentTimeIndicator = React.memo<CurrentTimeIndicatorProps>(
  ({ startHour = 7, endHour = 22, className }) => {
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
      const interval = setInterval(() => {
        setCurrentTime(new Date());
      }, 60000); // Atualiza a cada minuto

      return () => clearInterval(interval);
    }, []);

    const calculatePosition = () => {
      const now = currentTime;
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      // Se horário atual está fora do range do grid, não mostra
      if (currentHour < startHour || currentHour >= endHour) {
        return null;
      }

      // Calcula posição percentual baseada no horário
      const totalHours = endHour - startHour;
      const elapsedHours = currentHour - startHour + currentMinute / 60;
      const positionPercent = (elapsedHours / totalHours) * 100;

      return positionPercent;
    };

    const position = calculatePosition();

    // Se não deve ser mostrado, retorna null
    if (position === null) {
      return null;
    }

    const currentTimeLabel = `${currentTime
      .getHours()
      .toString()
      .padStart(2, '0')}:${currentTime
      .getMinutes()
      .toString()
      .padStart(2, '0')}`;

    return (
      <div
        className={cn(
          'absolute left-0 right-0 z-10 pointer-events-none',
          className
        )}
        style={{ top: `${position}%` }}
      >
        {/* Linha vermelha */}
        <div className="flex items-center">
          {/* Círculo na lateral esquerda */}
          <div className="w-3 h-3 bg-red-500 rounded-full flex-shrink-0 shadow-sm" />

          {/* Linha horizontal */}
          <div className="flex-1 h-0.5 bg-red-500 shadow-sm" />

          {/* Label com horário atual */}
          <div className="ml-2 px-2 py-1 bg-red-500 text-white text-xs font-medium rounded shadow-sm">
            {currentTimeLabel}
          </div>
        </div>
      </div>
    );
  }
);

CurrentTimeIndicator.displayName = 'CurrentTimeIndicator';
