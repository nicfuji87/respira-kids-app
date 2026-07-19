import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

// AI dev note: CurrentTimeIndicator é um Composed component
// Renderiza linha vermelha indicando horário atual na view semana

export interface CurrentTimeIndicatorProps {
  startHour?: number; // Hora de início do grid (padrão: 6)
  endHour?: number; // Hora de fim do grid (padrão: 20)
  className?: string;
}

export const CurrentTimeIndicator = React.memo<CurrentTimeIndicatorProps>(
  ({ startHour = 6, endHour = 20, className }) => {
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
        {/* Linha do horário atual.
            AI dev note: DS — token vermelho-kids (não red genérico) e flat,
            sem sombras em repouso */}
        <div className="flex items-center w-full">
          {/* Linha horizontal que ocupa toda a largura */}
          <div className="w-full h-0.5 bg-vermelho-kids relative">
            {/* Círculo na lateral esquerda */}
            <div className="absolute -left-1.5 top-1/2 transform -translate-y-1/2 w-3 h-3 bg-vermelho-kids rounded-full" />

            {/* AI dev note: label DENTRO do grid (right-0) — com -right-16 o
                rótulo vazava do container e era cortado pelo overflow */}
            <div className="absolute right-0 top-1/2 transform -translate-y-1/2 px-1.5 py-0.5 bg-vermelho-kids text-white text-xs font-medium rounded tabular-nums">
              {currentTimeLabel}
            </div>
          </div>
        </div>
      </div>
    );
  }
);

CurrentTimeIndicator.displayName = 'CurrentTimeIndicator';
