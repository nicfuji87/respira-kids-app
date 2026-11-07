// AI dev note: API da aba Conferência (Conversas). Tudo é montado no banco
// (migration conferencia_agenda.sql):
//   fn_conferencia_agenda_listar   itens do mês + quando rodou
//   fn_conferencia_agenda_rodar    refaz as checagens e a comparação (sem IA, rápido)
//   fn_conferencia_agenda_marcar   resolvido / ignorado / reabrir
//   fn_conferencia_item_lancar     cria o aviso de /agenda/lancar/:id com criança, dia,
//                                  hora e fisio do item e devolve o id
// A leitura das conversas pela IA roda todo dia às 5h30 (pg_cron → n8n
// "RK Conferência de agenda"); a tela não dispara IA.
// fn_conferencia_agenda_rodar cria tabela temporária: chamar por POST (padrão do rpc).

import { supabase } from './supabase';

export type GrupoConferencia =
  | 'corrigir'
  | 'lancar'
  | 'decidir'
  | 'conferir'
  | 'horario';

export type StatusConferencia =
  | 'aberto'
  | 'resolvido'
  | 'ignorado'
  | 'fechado_auto';

export interface ItemConferencia {
  id: number;
  chave: string;
  tipo: string;
  grupo: GrupoConferencia;
  origem: 'sistema' | 'conversa' | 'carga';
  data: string;
  hora: string | null;
  paciente_id: string | null;
  paciente_nome: string | null;
  profissional: string | null;
  agendamento_id: string | null;
  chatwoot_conversa_id: number | null;
  detalhe: string | null;
  evidencia: string | null;
  confianca: string | null;
  valor: number | null;
  status: StatusConferencia;
  nota: string | null;
  resolvido_por_nome: string | null;
  resolvido_em: string | null;
  criado_em: string;
  atualizado_em: string;
  agendamento_status: string | null;
  agendamento_pagamento: string | null;
}

export interface Conferencia {
  mes: string;
  ultima_execucao: string | null;
  ultima_leitura_conversas: string | null;
  conversas_lidas_mes: number;
  sessoes_lidas_mes: number;
  itens: ItemConferencia[];
}

export async function fetchConferencia(mes: string): Promise<Conferencia> {
  const { data, error } = await supabase.rpc('fn_conferencia_agenda_listar', {
    p_mes: mes,
  });
  if (error) throw error;
  return data as Conferencia;
}

export async function rodarConferencia(): Promise<void> {
  const { error } = await supabase.rpc('fn_conferencia_agenda_rodar', {
    p_dias: 45,
  });
  if (error) throw error;
}

export async function marcarItemConferencia(
  id: number,
  status: 'aberto' | 'resolvido' | 'ignorado',
  nota?: string
): Promise<void> {
  const { error } = await supabase.rpc('fn_conferencia_agenda_marcar', {
    p_id: id,
    p_status: status,
    p_nota: nota?.trim() || null,
  });
  if (error) throw error;
}

export async function lancarItemConferencia(id: number): Promise<string> {
  const { data, error } = await supabase.rpc('fn_conferencia_item_lancar', {
    p_id: id,
  });
  if (error) throw error;
  return data as string;
}

export const TIPO_LABEL: Record<string, string> = {
  STATUS_CONTRADITORIO: 'Status contraditório',
  HORARIO_ESTRANHO: 'Horário fora do expediente',
  DUPLICADA: 'Duplicada',
  CONSULTA_APAGADA: 'Consulta apagada',
  NAO_LANCADA: 'Não lançada',
  SEM_CADASTRO: 'Sem cadastro',
  CANCELADA_NO_SISTEMA: 'Cancelada no sistema',
  DESMARCADA_ATIVA: 'Desmarcada na conversa',
  FALTA_SEM_COBRANCA: 'Falta sem cobrança',
  CANCELAMENTO_MENOS_6H: 'Desmarcou com menos de 6h',
  HORARIO_DIVERGENTE: 'Horário diferente',
  SERVICO_DIVERGENTE: 'Serviço diferente',
  CONFERIR: 'Conferir',
};

/** Tipos em que "Lançar" faz sentido (sessão que não está na agenda). */
export const TIPOS_LANCAVEIS = new Set(['NAO_LANCADA', 'SEM_CADASTRO']);
