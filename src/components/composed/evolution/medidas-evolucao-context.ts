// Contexto das medidas programadas dentro da evolução (ver MedicoesMotoras.tsx)
import { createContext, useContext } from 'react';
import type { MedidaPaciente } from '@/lib/motora-medidas';

export interface MedidasEvolucaoContextValue {
  medidas: MedidaPaciente[] | null; // null = não carregado (ou sem permissão)
  dataSessao: string; // 'YYYY-MM-DD'
}

export const MedidasEvolucaoContext =
  createContext<MedidasEvolucaoContextValue>({ medidas: null, dataSessao: '' });

export const useMedidasEvolucao = () => useContext(MedidasEvolucaoContext);
