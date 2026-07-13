// AI dev note: API da feature "Bloquear agenda". CRUD de agenda_bloqueios +
// expansão de recorrência (materializa linhas concretas) + pré-checagem de
// consultas em conflito. O enforcement real (agendamento não cai em bloqueio) é
// do banco (trigger trg_valida_bloqueio_agendamento); aqui é só gestão/UX.

import { supabase } from './supabase';
import { MOTIVO_BLOQUEIO_LABELS } from '@/types/agenda-bloqueios';
import type {
  AgendaBloqueioComProfissional,
  ConflitoBloqueio,
  CreateBloqueioInput,
  MotivoBloqueio,
} from '@/types/agenda-bloqueios';
import type { CalendarEvent } from '@/types/calendar';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return 'Erro desconhecido';
}

// AI dev note: Expande a recorrência em ocorrências concretas {inicio, fim}.
// 'nenhuma' -> uma ocorrência. 'semanal' -> uma por dia da semana marcado, do
// dia da primeira ocorrência até `ate` (inclusive), preservando hora e duração.
export function expandRecorrencia(
  input: CreateBloqueioInput
): Array<{ inicio: string; fim: string }> {
  const base = { inicio: input.inicio, fim: input.fim };
  if (input.recorrencia.tipo === 'nenhuma') return [base];

  const inicioDate = new Date(input.inicio);
  const fimDate = new Date(input.fim);
  const durationMs = fimDate.getTime() - inicioDate.getTime();
  const startH = inicioDate.getHours();
  const startM = inicioDate.getMinutes();

  const dias = new Set(input.recorrencia.diasSemana);
  const ate = new Date(`${input.recorrencia.ate}T23:59:59`);

  const results: Array<{ inicio: string; fim: string }> = [];
  const cursor = new Date(
    inicioDate.getFullYear(),
    inicioDate.getMonth(),
    inicioDate.getDate()
  );

  // Trava de segurança contra loops muito longos (2 anos)
  let guard = 0;
  while (cursor <= ate && guard < 800) {
    guard += 1;
    if (dias.has(cursor.getDay())) {
      const occInicio = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        cursor.getDate(),
        startH,
        startM,
        0,
        0
      );
      const occFim = new Date(occInicio.getTime() + durationMs);
      results.push({
        inicio: occInicio.toISOString(),
        fim: occFim.toISOString(),
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return results.length > 0 ? results : [base];
}

export async function createBloqueios(
  input: CreateBloqueioInput
): Promise<{ count: number; recorrenciaId: string | null }> {
  const occurrences = expandRecorrencia(input);
  const recorrenciaId =
    input.recorrencia.tipo !== 'nenhuma' && occurrences.length > 1
      ? crypto.randomUUID()
      : null;

  const rows = occurrences.map((o) => ({
    profissional_id: input.profissionalId,
    inicio: o.inicio,
    fim: o.fim,
    dia_inteiro: input.diaInteiro,
    motivo: input.motivo,
    observacao: input.observacao ?? null,
    recorrencia_id: recorrenciaId,
    criado_por: input.criadoPor,
  }));

  const { error, count } = await supabase
    .from('agenda_bloqueios')
    .insert(rows, { count: 'exact' });

  if (error) throw new Error(getErrorMessage(error));
  return { count: count ?? rows.length, recorrenciaId };
}

// AI dev note: Lista bloqueios ativos. Se incluirClinica, traz também os de
// clínica inteira (profissional_id IS NULL) além dos do profissional.
export async function listBloqueios(params: {
  profissionalId?: string | null;
  incluirClinica?: boolean;
  from?: string;
  to?: string;
}): Promise<AgendaBloqueioComProfissional[]> {
  let query = supabase
    .from('agenda_bloqueios')
    .select(
      '*, profissional:pessoas!agenda_bloqueios_profissional_id_fkey(nome)'
    )
    .eq('ativo', true)
    .is('deleted_at', null)
    .order('inicio', { ascending: true });

  if (params.from) query = query.gte('fim', params.from);
  if (params.to) query = query.lte('inicio', params.to);

  if (params.profissionalId) {
    if (params.incluirClinica) {
      query = query.or(
        `profissional_id.eq.${params.profissionalId},profissional_id.is.null`
      );
    } else {
      query = query.eq('profissional_id', params.profissionalId);
    }
  }

  const { data, error } = await query;
  if (error) throw new Error(getErrorMessage(error));

  return (data || []).map((b) => {
    const prof = (b as { profissional?: { nome?: string } | null })
      .profissional;
    return {
      ...(b as unknown as AgendaBloqueioComProfissional),
      profissional_nome: prof?.nome ?? null,
    };
  });
}

export async function updateBloqueio(
  id: string,
  patch: Partial<{
    inicio: string;
    fim: string;
    dia_inteiro: boolean;
    motivo: string | null;
    observacao: string | null;
  }>
): Promise<void> {
  const { error } = await supabase
    .from('agenda_bloqueios')
    .update(patch)
    .eq('id', id);
  if (error) throw new Error(getErrorMessage(error));
}

// AI dev note: Soft delete (mantém integridade). NÃO reabre slots públicos que
// o bloqueio fechou (limitação conhecida do v1).
export async function deleteBloqueio(id: string): Promise<void> {
  const { error } = await supabase
    .from('agenda_bloqueios')
    .update({ ativo: false, deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null);
  if (error) throw new Error(getErrorMessage(error));
}

export async function deleteBloqueioSerie(
  recorrenciaId: string
): Promise<void> {
  const { error } = await supabase
    .from('agenda_bloqueios')
    .update({ ativo: false, deleted_at: new Date().toISOString() })
    .eq('recorrencia_id', recorrenciaId)
    .is('deleted_at', null);
  if (error) throw new Error(getErrorMessage(error));
}

// AI dev note: Consultas ativas (agendado/confirmado) que caem dentro do período
// do bloqueio — para avisar o usuário antes de confirmar. Aproximação por início
// da consulta dentro da janela (suficiente para o aviso).
export async function fetchConflitosParaBloqueio(
  profissionalId: string | null,
  inicio: string,
  fim: string
): Promise<ConflitoBloqueio[]> {
  let query = supabase
    .from('vw_agendamentos_completos')
    .select(
      'data_hora, paciente_nome, profissional_nome, status_consulta_codigo'
    )
    .eq('ativo', true)
    .gte('data_hora', inicio)
    .lt('data_hora', fim)
    .order('data_hora', { ascending: true });

  if (profissionalId) query = query.eq('profissional_id', profissionalId);

  const { data, error } = await query;
  if (error) throw new Error(getErrorMessage(error));

  return (data || [])
    .filter((a) => {
      const codigo = (a as { status_consulta_codigo?: string })
        .status_consulta_codigo;
      return codigo === 'agendado' || codigo === 'confirmado';
    })
    .map((a) => {
      const row = a as {
        data_hora: string;
        paciente_nome: string | null;
        profissional_nome: string | null;
      };
      return {
        data_hora: row.data_hora,
        paciente_nome: row.paciente_nome,
        profissional_nome: row.profissional_nome,
      };
    });
}

// AI dev note: Converte um bloqueio em CalendarEvent cinza para render no
// calendário. metadata.type='bloqueio' permite o CalendarTemplate diferenciar
// do agendamento (abre o diálogo de bloqueio, não o de consulta).
export function mapBloqueioToCalendarEvent(
  b: AgendaBloqueioComProfissional
): CalendarEvent {
  const motivoLabel = b.motivo
    ? (MOTIVO_BLOQUEIO_LABELS[b.motivo as MotivoBloqueio] ?? b.motivo)
    : 'Bloqueado';
  const alvo =
    b.profissional_id === null
      ? 'Clínica inteira'
      : (b.profissional_nome ?? 'Profissional');
  return {
    id: `bloqueio-${b.id}`,
    title: `🔒 ${motivoLabel}`,
    description: b.observacao ?? undefined,
    start: new Date(b.inicio),
    end: new Date(b.fim),
    allDay: b.dia_inteiro,
    color: 'gray',
    location: alvo,
    metadata: { type: 'bloqueio', bloqueio: b },
  };
}

export async function fetchBloqueiosAsEvents(params: {
  from: string;
  to: string;
  profissionalId?: string | null;
  incluirClinica?: boolean;
}): Promise<CalendarEvent[]> {
  const bloqueios = await listBloqueios({
    from: params.from,
    to: params.to,
    profissionalId: params.profissionalId ?? undefined,
    incluirClinica: params.incluirClinica,
  });
  return bloqueios.map(mapBloqueioToCalendarEvent);
}
