// Contexto do lembrete de medida na agenda (ver MedidasPrevistasAgenda.tsx)
import { createContext, useContext } from 'react';
import type { MedidaPrevista } from '@/lib/motora-medidas';

export const MedidasPrevistasAgendaContext = createContext<
  Map<string, MedidaPrevista[]>
>(new Map());

/** Medidas previstas/atrasadas desta consulta (vazio fora da agenda) */
export const useMedidasPrevistasDoEvento = (eventId: string) =>
  useContext(MedidasPrevistasAgendaContext).get(eventId) ?? [];
