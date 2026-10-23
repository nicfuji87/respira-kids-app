// AI dev note: Tipos dos COMPROMISSOS da agenda (antes "Bloquear agenda").
// Tabela public.agenda_bloqueios: profissional_id NULL = clínica inteira.
// inicio/fim em HORA DE PAREDE (14h = "…T14:00:00+00:00"), igual agendamentos.data_hora:
// ler com parseSupabaseDatetime e gravar com toWallClockString — nunca toISOString().
// Recorrência é materializada em linhas concretas agrupadas por recorrencia_id.
// A coluna `motivo` guarda a CATEGORIA.

import type { EventColor } from './calendar';

export type MotivoBloqueio =
  | 'almoco'
  | 'pessoal'
  | 'saude'
  | 'reuniao'
  | 'ferias'
  | 'feriado'
  | 'outro';

export const MOTIVO_BLOQUEIO_LABELS: Record<MotivoBloqueio, string> = {
  almoco: 'Intervalo / almoço',
  pessoal: 'Pessoal',
  saude: 'Saúde',
  reuniao: 'Reunião / estudo',
  ferias: 'Férias / ausência',
  feriado: 'Feriado / clínica fechada',
  outro: 'Outro',
};

// Cor do compromisso no calendário (paleta RK do eventColorMap)
export const MOTIVO_BLOQUEIO_CORES: Record<MotivoBloqueio, EventColor> = {
  almoco: 'gray',
  pessoal: 'orange',
  saude: 'purple',
  reuniao: 'blue',
  ferias: 'pink',
  feriado: 'red',
  outro: 'gray',
};

// Grupos dos filtros visuais do calendário (ocultar NÃO libera o horário)
export type GrupoFiltroAgenda =
  | 'consultas'
  | 'compromissos'
  | 'ausencias'
  | 'fechamentos';

export const GRUPO_FILTRO_LABELS: Record<GrupoFiltroAgenda, string> = {
  consultas: 'Consultas',
  compromissos: 'Compromissos',
  ausencias: 'Férias e ausências',
  fechamentos: 'Fechamentos da clínica',
};

export interface AgendaBloqueio {
  id: string;
  profissional_id: string | null; // null = clínica inteira
  inicio: string; // hora de parede "+00:00"
  fim: string;
  dia_inteiro: boolean;
  motivo: string | null; // categoria
  titulo: string | null;
  observacao: string | null;
  privado: boolean;
  impede_agendamento: boolean;
  recorrencia_id: string | null;
  criado_por: string | null;
  conflito_aceito_em: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Linha devolvida pela RPC fn_agenda_compromissos (já mascarada por papel)
export interface CompromissoAgenda {
  id: string;
  profissional_id: string | null;
  profissional_nome: string | null;
  inicio: string;
  fim: string;
  dia_inteiro: boolean;
  categoria: string | null; // null quando mascarado
  titulo: string | null; // null quando mascarado ou sem título
  observacao: string | null;
  privado: boolean;
  mascarado: boolean;
  impede_agendamento: boolean;
  recorrencia_id: string | null;
  criado_por: string | null;
  pode_editar: boolean;
  conflitos: number;
  conflito_aceito_em: string | null;
}

export type RecorrenciaTipo = 'nenhuma' | 'diaria' | 'dias_uteis' | 'semanal';

export interface RecorrenciaConfig {
  tipo: RecorrenciaTipo;
  // 0=Domingo ... 6=Sábado (usado quando tipo = 'semanal')
  diasSemana: number[];
  // Data-limite da recorrência (yyyy-mm-dd), inclusiva
  ate: string;
}

export interface CompromissoInput {
  profissionalId: string | null; // null = clínica inteira
  inicio: Date; // hora local da primeira ocorrência
  fim: Date;
  diaInteiro: boolean;
  categoria: MotivoBloqueio;
  titulo: string | null;
  observacao?: string | null;
  privado: boolean;
  impedeAgendamento: boolean;
  aceitarConflito: boolean;
}

export interface CreateCompromissoInput extends CompromissoInput {
  recorrencia: RecorrenciaConfig;
}

export interface ConflitoCompromisso {
  agendamento_id: string;
  data_hora: string;
  fim: string;
  paciente_nome: string | null;
  profissional_nome: string | null;
  servico_nome: string | null;
  sobreposicao_inicio: string;
  sobreposicao_fim: string;
}

export function labelCategoria(categoria: string | null | undefined): string {
  if (!categoria) return 'Compromisso';
  return MOTIVO_BLOQUEIO_LABELS[categoria as MotivoBloqueio] ?? categoria;
}

// Título exibido: "Indisponível" para quem não pode ver; senão título livre ou categoria
export function tituloCompromisso(c: {
  mascarado?: boolean;
  titulo: string | null;
  categoria?: string | null;
  motivo?: string | null;
}): string {
  if (c.mascarado) return 'Indisponível';
  const t = c.titulo?.trim();
  if (t) return t;
  return labelCategoria(c.categoria ?? c.motivo ?? null);
}

export function grupoFiltroCompromisso(c: {
  profissional_id: string | null;
  categoria: string | null;
}): GrupoFiltroAgenda {
  if (c.profissional_id === null) return 'fechamentos';
  if (c.categoria === 'ferias') return 'ausencias';
  return 'compromissos';
}
