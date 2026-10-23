// Plano terapêutico e histórico motor da criança, disponíveis para as seções
// da evolução motora 1.3 (objetivos, habilidades, comparações). null = sem
// permissão ou fora de uma criança (a evolução continua funcionando, só sem
// histórico nem objetivos).

import { createContext, useContext } from 'react';
import type {
  HistoricoMotor,
  ObjetivoMotor,
  ObjetivoParaSalvar,
  StatusObjetivo,
} from '@/lib/motora-plano';

export interface PlanoMotorValor {
  pacienteId: string;
  agendamentoId?: string;
  dataSessao: string;
  historico: HistoricoMotor | null;
  objetivos: ObjetivoMotor[] | null;
  carregando: boolean;
  erro?: string;
  salvarObjetivo: (o: ObjetivoParaSalvar) => Promise<void>;
  mudarStatus: (
    id: string,
    status: StatusObjetivo,
    motivo?: string
  ) => Promise<void>;
}

export const PlanoMotorContext = createContext<PlanoMotorValor | null>(null);

export const usePlanoMotor = () => useContext(PlanoMotorContext);
