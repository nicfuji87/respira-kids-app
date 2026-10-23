import React from 'react';
import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  GRUPO_FILTRO_LABELS,
  type GrupoFiltroAgenda,
} from '@/types/agenda-bloqueios';
import { eventColorHexMap } from '@/types/calendar';

// AI dev note: Chips para mostrar/ocultar tipos de evento na agenda. É só visual:
// ocultar compromissos NÃO libera o horário para consultas.

const GRUPOS: Array<{ id: GrupoFiltroAgenda; cor: string }> = [
  { id: 'consultas', cor: eventColorHexMap.blue },
  { id: 'compromissos', cor: eventColorHexMap.orange },
  { id: 'ausencias', cor: eventColorHexMap.pink },
  { id: 'fechamentos', cor: eventColorHexMap.red },
];

interface FiltroTiposAgendaProps {
  ocultos: GrupoFiltroAgenda[];
  onToggle: (g: GrupoFiltroAgenda) => void;
  className?: string;
}

export const FiltroTiposAgenda = React.memo<FiltroTiposAgendaProps>(
  ({ ocultos, onToggle, className }) => (
    <div
      className={cn('flex flex-wrap items-center gap-1.5', className)}
      role="group"
      aria-label="Mostrar na agenda"
    >
      {GRUPOS.map(({ id, cor }) => {
        const ativo = !ocultos.includes(id);
        return (
          <button
            key={id}
            type="button"
            onClick={() => onToggle(id)}
            aria-pressed={ativo}
            title={
              ativo
                ? `Ocultar ${GRUPO_FILTRO_LABELS[id].toLowerCase()} (o horário continua ocupado)`
                : `Mostrar ${GRUPO_FILTRO_LABELS[id].toLowerCase()}`
            }
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              ativo
                ? 'bg-card text-roxo-titulo dark:text-foreground'
                : 'border-dashed bg-transparent text-muted-foreground line-through decoration-muted-foreground/60'
            )}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor: ativo ? cor : 'transparent',
                border: `1.5px solid ${cor}`,
              }}
            />
            {GRUPO_FILTRO_LABELS[id]}
            {ativo && <Check className="h-3 w-3 opacity-60" />}
          </button>
        );
      })}
    </div>
  )
);

FiltroTiposAgenda.displayName = 'FiltroTiposAgenda';
