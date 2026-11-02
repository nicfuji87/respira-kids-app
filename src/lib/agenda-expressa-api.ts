// AI dev note: Agenda Expressa — marcar a próxima sessão em poucos toques a
// partir da consulta de hoje (dentro da evolução e no card da consulta).
// Toda a regra fica no banco (supabase/migrations/agenda_expressa.sql):
// profissional só marca na própria agenda e só por aqui; secretaria nas
// autorizadas; admin em qualquer uma. data_hora é hora de parede — trafega
// como texto "AAAA-MM-DDTHH:MM", nunca passar por toISOString().

import { supabase } from './supabase';

export interface AgendaExpressaOrigem {
  id: string;
  data_hora: string; // "AAAA-MM-DDTHH:MM"
  hora: string; // "HH:MM"
  paciente_id: string;
  paciente_nome: string;
  servico_nome: string | null;
  duracao_minutos: number;
  local_nome: string | null;
  profissional_id: string;
}

export interface AgendaExpressaPessoa {
  id: string;
  nome: string;
}

export interface AgendaExpressaProxima {
  id: string;
  data_hora: string;
  profissional_nome: string | null;
  expressa: boolean;
}

export interface AgendaExpressaContexto {
  ok: boolean;
  motivo?: string;
  origem?: AgendaExpressaOrigem;
  profissional_padrao?: AgendaExpressaPessoa | null;
  pode_marcar?: boolean;
  pode_trocar?: boolean;
  profissionais?: AgendaExpressaPessoa[];
  proximas?: AgendaExpressaProxima[];
}

export interface AgendaExpressaHorario {
  hora: string;
  livre: boolean;
}

export interface AgendaExpressaDia {
  data: string; // "AAAA-MM-DD"
  livres: number;
  horarios: AgendaExpressaHorario[];
  feriado?: string | null; // nome do feriado (o dia aparece mesmo assim)
}

export interface AgendaExpressaHorarios {
  ok: boolean;
  motivo?: string;
  profissional_id?: string;
  hora_origem?: string;
  dias?: AgendaExpressaDia[];
}

export interface AgendaExpressaCriada {
  ok: boolean;
  id: string;
  data_hora: string;
  profissional_nome: string;
}

export const fetchAgendaExpressaContexto = async (
  agendamentoId: string
): Promise<AgendaExpressaContexto> => {
  const { data, error } = await supabase.rpc('fn_agenda_expressa_contexto', {
    p_agendamento_id: agendamentoId,
  });
  if (error) throw error;
  return data as AgendaExpressaContexto;
};

export const fetchAgendaExpressaHorarios = async (
  agendamentoId: string,
  profissionalId?: string | null,
  dias = 14,
  de: string | null = null // "AAAA-MM-DD": a partir de outro dia
): Promise<AgendaExpressaHorarios> => {
  const { data, error } = await supabase.rpc('fn_agenda_expressa_horarios', {
    p_agendamento_id: agendamentoId,
    p_profissional_id: profissionalId ?? null,
    p_de: de,
    p_dias: dias,
  });
  if (error) throw error;
  return data as AgendaExpressaHorarios;
};

// "Outro horário": se a profissional está livre nesse dia e hora
export const agendaExpressaHorarioLivre = async (
  agendamentoId: string,
  dataHora: string, // "AAAA-MM-DDTHH:MM" (hora de parede)
  profissionalId?: string | null
): Promise<boolean> => {
  const { data, error } = await supabase.rpc(
    'fn_agenda_expressa_horario_livre',
    {
      p_agendamento_id: agendamentoId,
      p_data_hora: dataHora.replace('T', ' '),
      p_profissional_id: profissionalId ?? null,
    }
  );
  if (error) throw error;
  return data === true;
};

export const criarAgendaExpressa = async (
  agendamentoId: string,
  dataHora: string, // "AAAA-MM-DDTHH:MM" (hora de parede)
  profissionalId?: string | null
): Promise<AgendaExpressaCriada> => {
  const { data, error } = await supabase.rpc('fn_agenda_expressa_criar', {
    p_agendamento_id: agendamentoId,
    p_data_hora: dataHora.replace('T', ' '),
    p_profissional_id: profissionalId ?? null,
  });
  if (error) throw error;
  return data as AgendaExpressaCriada;
};

// Mensagem amigável: as funções já levantam o texto pronto para a tela.
export const mensagemErroAgendaExpressa = (error: unknown): string => {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : '';
  if (message.includes('agendamentos_intervalo_minimo')) {
    return 'Esse horário acabou de ser ocupado. Escolha outro.';
  }
  if (message.toLowerCase().includes('bloqueio')) {
    return 'Esse horário está bloqueado na agenda.';
  }
  return message || 'Não deu para marcar. Tente de novo.';
};
