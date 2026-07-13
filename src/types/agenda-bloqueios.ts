// AI dev note: Tipos da feature "Bloquear agenda" (indisponibilidade de agenda).
// Tabela public.agenda_bloqueios: profissional_id NULL = clínica inteira.
// Recorrência é materializada em linhas concretas agrupadas por recorrencia_id.

export type MotivoBloqueio =
  | 'almoco'
  | 'ferias'
  | 'feriado'
  | 'reuniao'
  | 'pessoal'
  | 'outro';

export const MOTIVO_BLOQUEIO_LABELS: Record<MotivoBloqueio, string> = {
  almoco: 'Almoço',
  ferias: 'Férias',
  feriado: 'Feriado',
  reuniao: 'Reunião',
  pessoal: 'Pessoal',
  outro: 'Outro',
};

export interface AgendaBloqueio {
  id: string;
  profissional_id: string | null; // null = clínica inteira
  inicio: string; // ISO
  fim: string; // ISO
  dia_inteiro: boolean;
  motivo: string | null;
  observacao: string | null;
  recorrencia_id: string | null;
  criado_por: string | null;
  ativo: boolean;
  google_event_id: string | null;
  google_synced_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AgendaBloqueioComProfissional extends AgendaBloqueio {
  profissional_nome: string | null;
}

export type RecorrenciaTipo = 'nenhuma' | 'semanal';

export interface RecorrenciaConfig {
  tipo: RecorrenciaTipo;
  // 0=Domingo ... 6=Sábado (usado quando tipo = 'semanal')
  diasSemana: number[];
  // Data-limite da recorrência (yyyy-mm-dd), inclusiva
  ate: string;
}

export interface CreateBloqueioInput {
  profissionalId: string | null; // null = clínica inteira
  inicio: string; // ISO (primeira ocorrência)
  fim: string; // ISO (primeira ocorrência)
  diaInteiro: boolean;
  motivo: MotivoBloqueio | null;
  observacao?: string | null;
  recorrencia: RecorrenciaConfig;
  criadoPor: string;
}

export interface ConflitoBloqueio {
  data_hora: string;
  paciente_nome: string | null;
  profissional_nome: string | null;
}
