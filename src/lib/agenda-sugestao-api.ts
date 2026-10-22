// AI dev note: Aviso "consulta combinada e não lançada" (fn_agenda_confirmacoes_verificar).
// Cada aviso vira uma agenda_sugestoes com dia/hora/fisio lidos da conversa por regra;
// a página /agenda/lancar/:id abre o formulário de agendamento já preenchido.
// As RPCs só respondem para admin e secretaria.

import { supabase } from '@/lib/supabase';

export type AgendaSugestaoStatus =
  | 'pendente'
  | 'lancada'
  | 'ja_estava'
  | 'descartada';

export interface AgendaSugestao {
  id: string;
  status: AgendaSugestaoStatus;
  texto: string;
  mensagem_em: string;
  telefone: string | null;
  sugestao: { data?: string; hora?: string; profissional_id?: string };
  profissional_nome: string | null;
  agendamento_id: string | null;
  resolvido_em: string | null;
  resolvido_por: string | null;
  pacientes: { id: string; nome: string }[];
  mensagens: {
    em: string;
    origem: 'HUMANO' | 'CLIENTE' | 'JU';
    texto: string;
    eh_a_confirmacao: boolean;
  }[];
  consultas: {
    id: string;
    data_hora: string;
    paciente: string;
    profissional: string | null;
    servico: string | null;
    criada_em: string;
  }[];
}

export async function fetchAgendaSugestao(
  id: string
): Promise<AgendaSugestao | null> {
  const { data, error } = await supabase.rpc('fn_agenda_sugestao_obter', {
    p_id: id,
  });
  if (error) throw new Error(error.message);
  return (data as AgendaSugestao | null) ?? null;
}

export async function resolverAgendaSugestao(
  id: string,
  status: AgendaSugestaoStatus,
  agendamentoId?: string
): Promise<void> {
  const { data, error } = await supabase.rpc('fn_agenda_sugestao_resolver', {
    p_id: id,
    p_status: status,
    p_agendamento_id: agendamentoId ?? null,
  });
  if (error) throw new Error(error.message);
  const r = data as { ok: boolean; erro?: string } | null;
  if (!r?.ok) throw new Error(r?.erro ?? 'Não foi possível salvar.');
}
