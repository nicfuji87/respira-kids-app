// AI dev note: Agendas públicas automáticas (supabase/migrations/
// pacientes_fixos_envio_massa_agendas_auto.sql). Para cada profissional
// marcada, o banco mantém N semanas abertas (padrão 4): todo dia às 6h
// (cron agendas-publicas-garantir) a semana que passou expira e falta-
// semana nova é criada com os dias/horas que ela costuma abrir.

import { supabase } from '@/lib/supabase';

export interface AgendaAutoConfig {
  profissional_id: string;
  ativo: boolean;
  semanas: number;
}

export interface ResultadoGarantir {
  criadas: {
    profissional: string;
    semana: string;
    titulo: string;
    slots: number;
  }[];
  puladas: { profissional: string; semana: string; motivo: string }[];
}

const erro = (e: unknown) =>
  new Error(
    typeof e === 'object' && e && 'message' in e
      ? String((e as { message: unknown }).message)
      : 'Erro inesperado'
  );

export async function listarAgendaAuto(): Promise<AgendaAutoConfig[]> {
  const { data, error } = await supabase
    .from('agenda_publica_auto')
    .select('profissional_id, ativo, semanas');
  if (error) throw erro(error);
  return (data ?? []) as AgendaAutoConfig[];
}

export async function salvarAgendaAuto(
  profissionalId: string,
  ativo: boolean,
  semanas = 4
): Promise<void> {
  const { error } = await supabase.rpc('fn_agenda_publica_auto_salvar', {
    p_profissional_id: profissionalId,
    p_ativo: ativo,
    p_semanas: semanas,
  });
  if (error) throw erro(error);
}

/** Cria agora as semanas que faltam (o mesmo que roda às 6h). */
export async function garantirAgendasPublicas(
  profissionalId?: string
): Promise<ResultadoGarantir> {
  const { data, error } = await supabase.rpc('fn_agendas_publicas_garantir', {
    p_profissional_id: profissionalId ?? null,
  });
  if (error) throw erro(error);
  return data as ResultadoGarantir;
}
