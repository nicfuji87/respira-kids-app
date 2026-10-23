// AI dev note: API dos COMPROMISSOS da agenda (tabela agenda_bloqueios).
// - Horários em HORA DE PAREDE, igual agendamentos.data_hora: grava com
//   toWallClockString(date) e lê com parseSupabaseDatetime. Nunca toISOString()
//   aqui (foi o bug de 3h: o banco aplicava o bloqueio 3h depois).
// - Leitura do calendário via RPC fn_agenda_compromissos: já vem mascarada por papel
//   (privado → "Indisponível") e com nº de conflitos com consultas.
// - O banco é quem garante as regras: consulta não entra em compromisso
//   (trg_valida_bloqueio_agendamento), compromisso não entra em consulta sem aceite de
//   admin/secretária (trg_valida_conflito_compromisso), slots públicos fecham/reabrem
//   sozinhos (trg_bloqueio_sincroniza_slots). Aqui é gestão e UX.

import { supabase } from './supabase';
import { parseSupabaseDatetime } from './calendar-mappers';
import {
  MOTIVO_BLOQUEIO_CORES,
  grupoFiltroCompromisso,
  labelCategoria,
  tituloCompromisso,
  type CompromissoAgenda,
  type CompromissoInput,
  type ConflitoCompromisso,
  type CreateCompromissoInput,
  type MotivoBloqueio,
} from '@/types/agenda-bloqueios';
import type { CalendarEvent } from '@/types/calendar';

const pad = (n: number) => String(n).padStart(2, '0');

// Date (hora local) → string de hora de parede no formato do banco
export function toWallClockString(d: Date): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:00+00:00`
  );
}

export const fromWallClockString = parseSupabaseDatetime;

export const notifyCompromissosChanged = () =>
  window.dispatchEvent(new Event('bloqueios:changed'));

// ------------------------------------------------------------------
// Erros vindos do banco
// ------------------------------------------------------------------
export type ErroCompromisso =
  | { tipo: 'conflito'; mensagem: string }
  | { tipo: 'sem_permissao_conflito'; mensagem: string }
  | { tipo: 'outro'; mensagem: string };

export function interpretarErroCompromisso(error: unknown): ErroCompromisso {
  const e = (error ?? {}) as { message?: string; hint?: string };
  const mensagem =
    typeof e.message === 'string' && e.message
      ? e.message
      : error instanceof Error
        ? error.message
        : 'Erro desconhecido';
  if (e.hint === 'compromisso_conflito') return { tipo: 'conflito', mensagem };
  if (e.hint === 'compromisso_conflito_sem_permissao')
    return { tipo: 'sem_permissao_conflito', mensagem };
  return { tipo: 'outro', mensagem };
}

export class CompromissoError extends Error {
  erro: ErroCompromisso;
  constructor(erro: ErroCompromisso) {
    super(erro.mensagem);
    this.erro = erro;
  }
}

// ------------------------------------------------------------------
// Recorrência → ocorrências concretas (hora local preservada)
// ------------------------------------------------------------------
const MAX_OCORRENCIAS = 400;

export function expandRecorrencia(
  input: Pick<CreateCompromissoInput, 'inicio' | 'fim' | 'recorrencia'>
): Array<{ inicio: Date; fim: Date }> {
  const base = { inicio: input.inicio, fim: input.fim };
  const { recorrencia } = input;
  if (recorrencia.tipo === 'nenhuma' || !recorrencia.ate) return [base];

  const duracaoMs = input.fim.getTime() - input.inicio.getTime();
  const h = input.inicio.getHours();
  const m = input.inicio.getMinutes();
  const [ay, am, ad] = recorrencia.ate.split('-').map(Number);
  const ate = new Date(ay, am - 1, ad, 23, 59, 59);

  const vale = (diaSemana: number) => {
    if (recorrencia.tipo === 'diaria') return true;
    if (recorrencia.tipo === 'dias_uteis')
      return diaSemana >= 1 && diaSemana <= 5;
    return recorrencia.diasSemana.includes(diaSemana);
  };

  const out: Array<{ inicio: Date; fim: Date }> = [];
  const cursor = new Date(
    input.inicio.getFullYear(),
    input.inicio.getMonth(),
    input.inicio.getDate()
  );
  let guard = 0;
  while (cursor <= ate && guard < 800 && out.length < MAX_OCORRENCIAS) {
    guard += 1;
    if (vale(cursor.getDay())) {
      const ini = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        cursor.getDate(),
        h,
        m
      );
      // soma a duração pelo relógio local (evita surpresa em horário de verão)
      const fim = new Date(ini.getTime() + duracaoMs);
      out.push({ inicio: ini, fim });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out.length > 0 ? out : [base];
}

// ------------------------------------------------------------------
// Escrita
// ------------------------------------------------------------------
function camposComuns(input: CompromissoInput) {
  return {
    profissional_id: input.profissionalId,
    dia_inteiro: input.diaInteiro,
    motivo: input.categoria,
    titulo: input.titulo?.trim() ? input.titulo.trim().slice(0, 120) : null,
    observacao: input.observacao?.trim() ? input.observacao.trim() : null,
    privado: input.privado,
    impede_agendamento: input.impedeAgendamento,
    // carimbo de auditoria (instante real), não é horário de agenda
    conflito_aceito_em: input.aceitarConflito ? new Date().toISOString() : null,
  };
}

export async function createCompromissos(
  input: CreateCompromissoInput
): Promise<{ count: number; recorrenciaId: string | null }> {
  const ocorrencias = expandRecorrencia(input);
  const recorrenciaId =
    input.recorrencia.tipo !== 'nenhuma' && ocorrencias.length > 1
      ? crypto.randomUUID()
      : null;

  const comuns = camposComuns(input);
  const rows = ocorrencias.map((o) => ({
    ...comuns,
    inicio: toWallClockString(o.inicio),
    fim: toWallClockString(o.fim),
    recorrencia_id: recorrenciaId,
  }));

  const { error, count } = await supabase
    .from('agenda_bloqueios')
    .insert(rows, { count: 'exact' });
  if (error) throw new CompromissoError(interpretarErroCompromisso(error));
  return { count: count ?? rows.length, recorrenciaId };
}

export async function updateCompromisso(
  id: string,
  input: CompromissoInput
): Promise<void> {
  const comuns = camposComuns(input);
  const patch: Record<string, unknown> = {
    ...comuns,
    inicio: toWallClockString(input.inicio),
    fim: toWallClockString(input.fim),
  };
  // Sem aceite novo, não mexe no aceite antigo (o banco exige aceite novo só se mover
  // para cima de consulta).
  if (!input.aceitarConflito) delete patch.conflito_aceito_em;

  const { error } = await supabase
    .from('agenda_bloqueios')
    .update(patch)
    .eq('id', id);
  if (error) throw new CompromissoError(interpretarErroCompromisso(error));
}

// Soft delete. O banco reabre os slots públicos que este compromisso fechou.
export async function deleteCompromisso(id: string): Promise<void> {
  const { error } = await supabase
    .from('agenda_bloqueios')
    .update({ ativo: false, deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null);
  if (error) throw new CompromissoError(interpretarErroCompromisso(error));
}

export async function deleteCompromissoSerie(
  recorrenciaId: string
): Promise<void> {
  const { error } = await supabase
    .from('agenda_bloqueios')
    .update({ ativo: false, deleted_at: new Date().toISOString() })
    .eq('recorrencia_id', recorrenciaId)
    .is('deleted_at', null);
  if (error) throw new CompromissoError(interpretarErroCompromisso(error));
}

// ------------------------------------------------------------------
// Leitura
// ------------------------------------------------------------------
export async function listCompromissos(params: {
  from: Date;
  to: Date;
  profissionalId?: string | null;
}): Promise<CompromissoAgenda[]> {
  const { data, error } = await supabase.rpc('fn_agenda_compromissos', {
    p_inicio: toWallClockString(params.from),
    p_fim: toWallClockString(params.to),
    p_profissional_id: params.profissionalId ?? null,
  });
  if (error) throw new CompromissoError(interpretarErroCompromisso(error));
  return (data ?? []) as CompromissoAgenda[];
}

// Consultas agendadas/confirmadas que se sobrepõem a alguma ocorrência
export async function fetchConflitosCompromisso(
  profissionalId: string | null,
  ocorrencias: Array<{ inicio: Date; fim: Date }>
): Promise<ConflitoCompromisso[]> {
  if (ocorrencias.length === 0) return [];
  const { data, error } = await supabase.rpc('fn_compromisso_conflitos', {
    p_profissional_id: profissionalId,
    p_intervalos: ocorrencias.map((o) => ({
      inicio: toWallClockString(o.inicio),
      fim: toWallClockString(o.fim),
    })),
  });
  if (error) throw new CompromissoError(interpretarErroCompromisso(error));
  return ((data ?? []) as ConflitoCompromisso[]).sort((a, b) =>
    a.data_hora.localeCompare(b.data_hora)
  );
}

// ------------------------------------------------------------------
// Calendário
// ------------------------------------------------------------------
export interface CompromissoEventMetadata {
  type: 'bloqueio';
  compromisso: CompromissoAgenda;
  categoria: string | null;
  categoriaLabel: string;
  grupoFiltro: ReturnType<typeof grupoFiltroCompromisso>;
  profissionalId: string | null;
  profissionalNome: string | null;
  clinicaInteira: boolean;
  mascarado: boolean;
  recorrente: boolean;
  conflitos: number;
  impedeAgendamento: boolean;
  [key: string]: unknown;
}

export function isCompromissoEvent(
  event: CalendarEvent
): event is CalendarEvent & { metadata: CompromissoEventMetadata } {
  return event.metadata?.type === 'bloqueio';
}

// AI dev note: Os filtros das telas (paciente, serviço, status, pagamento...) são de
// consulta e derrubavam os compromissos. Os templates separam os dois: filtros de
// consulta só nas consultas; compromisso só respeita o filtro de profissional
// (clínica inteira sempre aparece).
export function separarCompromissos(events: CalendarEvent[]): {
  consultas: CalendarEvent[];
  compromissos: CalendarEvent[];
} {
  const consultas: CalendarEvent[] = [];
  const compromissos: CalendarEvent[] = [];
  for (const e of events)
    (isCompromissoEvent(e) ? compromissos : consultas).push(e);
  return { consultas, compromissos };
}

export function filtrarCompromissosPorProfissional(
  compromissos: CalendarEvent[],
  profissionalId?: string | null
): CalendarEvent[] {
  if (!profissionalId || profissionalId === 'all') return compromissos;
  return compromissos.filter((e) => {
    const m = e.metadata as CompromissoEventMetadata | undefined;
    return !!m && (m.clinicaInteira || m.profissionalId === profissionalId);
  });
}

// AI dev note: Vai para a faixa "dia inteiro" no topo das visões semana/dia (e não
// para a grade de horas): dia inteiro ou que atravessa a meia-noite (férias).
export function ehEventoDeFaixa(event: CalendarEvent): boolean {
  if (event.allDay) return true;
  const fimInclusivo = new Date(event.end.getTime() - 1);
  return (
    event.start.getFullYear() !== fimInclusivo.getFullYear() ||
    event.start.getMonth() !== fimInclusivo.getMonth() ||
    event.start.getDate() !== fimInclusivo.getDate()
  );
}

export function eventoCobreDia(event: CalendarEvent, dia: Date): boolean {
  const ini = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate());
  const fim = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() + 1);
  return event.start < fim && event.end > ini;
}

export function mapCompromissoToCalendarEvent(
  c: CompromissoAgenda
): CalendarEvent {
  const metadata: CompromissoEventMetadata = {
    type: 'bloqueio',
    compromisso: c,
    categoria: c.categoria,
    categoriaLabel: c.mascarado ? 'Indisponível' : labelCategoria(c.categoria),
    grupoFiltro: grupoFiltroCompromisso(c),
    profissionalId: c.profissional_id,
    profissionalNome: c.profissional_nome,
    clinicaInteira: c.profissional_id === null,
    mascarado: c.mascarado,
    recorrente: !!c.recorrencia_id,
    conflitos: c.conflitos,
    impedeAgendamento: c.impede_agendamento,
  };
  return {
    id: `bloqueio-${c.id}`,
    title: tituloCompromisso(c),
    description: c.observacao ?? undefined,
    start: fromWallClockString(c.inicio),
    end: fromWallClockString(c.fim),
    allDay: c.dia_inteiro,
    color: c.mascarado
      ? 'gray'
      : (MOTIVO_BLOQUEIO_CORES[c.categoria as MotivoBloqueio] ?? 'gray'),
    location:
      c.profissional_id === null
        ? 'Clínica inteira'
        : (c.profissional_nome ?? undefined),
    metadata,
  };
}

export async function fetchCompromissosAsEvents(params: {
  from: Date;
  to: Date;
}): Promise<CalendarEvent[]> {
  const lista = await listCompromissos(params);
  return lista.map(mapCompromissoToCalendarEvent);
}
