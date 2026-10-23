// AI dev note: Atas das reuniões com as estagiárias (aba Reuniões). Texto em
// markdown em estagio_reuniao_atas; encaminhamentos ('acao') e pontos a
// confirmar ('confirmar') em estagio_reuniao_itens, marcáveis como feitos.
// RLS: admin + secretaria. Nada é apagado: ativo = false.
// Migration: supabase/migrations/estagio_reuniao_atas.sql.

import { supabase } from './supabase';

export type TipoItemAta = 'acao' | 'confirmar';

export interface ItemAta {
  id: string;
  ata_id: string;
  tipo: TipoItemAta;
  descricao: string;
  responsavel: string | null;
  prazo: string | null;
  observacao: string | null;
  feito: boolean;
  feito_em: string | null;
  ordem: number;
  ativo: boolean;
}

export interface AtaReuniao {
  id: string;
  reuniao_ref: string | null;
  data: string; // YYYY-MM-DD
  titulo: string;
  participantes: string[];
  conteudo: string;
  updated_at: string;
  itens: ItemAta[];
}

export interface DadosAta {
  data: string;
  titulo: string;
  participantes: string[];
  conteudo: string;
}

export interface NovoItemAta {
  tipo: TipoItemAta;
  descricao: string;
  responsavel?: string;
  prazo?: string;
}

const COLUNAS_ATA =
  'id, reuniao_ref, data, titulo, participantes, conteudo, updated_at, itens:estagio_reuniao_itens(id, ata_id, tipo, descricao, responsavel, prazo, observacao, feito, feito_em, ordem, ativo)';

function normalizar(ata: AtaReuniao): AtaReuniao {
  return {
    ...ata,
    participantes: ata.participantes ?? [],
    itens: (ata.itens ?? [])
      .filter((i) => i.ativo)
      .sort((a, b) => a.ordem - b.ordem),
  };
}

export async function fetchAtas(): Promise<AtaReuniao[]> {
  const { data, error } = await supabase
    .from('estagio_reuniao_atas')
    .select(COLUNAS_ATA)
    .eq('ativo', true)
    .order('data', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as AtaReuniao[]).map(normalizar);
}

export async function criarAta(
  dados: DadosAta & { reuniao_ref?: string | null },
  pessoaId: string | null
): Promise<AtaReuniao> {
  const { data, error } = await supabase
    .from('estagio_reuniao_atas')
    .insert({
      reuniao_ref: dados.reuniao_ref ?? null,
      data: dados.data,
      titulo: dados.titulo,
      participantes: dados.participantes,
      conteudo: dados.conteudo,
      criado_por: pessoaId,
      atualizado_por: pessoaId,
    })
    .select(COLUNAS_ATA)
    .single();
  if (error) throw error;
  return normalizar(data as unknown as AtaReuniao);
}

export async function atualizarAta(
  id: string,
  dados: DadosAta,
  pessoaId: string | null
): Promise<void> {
  const { error } = await supabase
    .from('estagio_reuniao_atas')
    .update({ ...dados, atualizado_por: pessoaId })
    .eq('id', id);
  if (error) throw error;
}

export async function marcarItemAta(
  id: string,
  feito: boolean,
  pessoaId: string | null
): Promise<void> {
  const { error } = await supabase
    .from('estagio_reuniao_itens')
    .update({
      feito,
      feito_em: feito ? new Date().toISOString() : null,
      feito_por: feito ? pessoaId : null,
    })
    .eq('id', id);
  if (error) throw error;
}

export async function criarItemAta(
  ataId: string,
  item: NovoItemAta,
  ordem: number
): Promise<ItemAta> {
  const { data, error } = await supabase
    .from('estagio_reuniao_itens')
    .insert({
      ata_id: ataId,
      tipo: item.tipo,
      descricao: item.descricao,
      responsavel: item.responsavel || null,
      prazo: item.prazo || null,
      ordem,
    })
    .select(
      'id, ata_id, tipo, descricao, responsavel, prazo, observacao, feito, feito_em, ordem, ativo'
    )
    .single();
  if (error) throw error;
  return data as ItemAta;
}

export async function removerItemAta(id: string): Promise<void> {
  const { error } = await supabase
    .from('estagio_reuniao_itens')
    .update({ ativo: false })
    .eq('id', id);
  if (error) throw error;
}

/** "Nícolas, Larissa" -> ["Nícolas", "Larissa"] */
export function separarParticipantes(texto: string): string[] {
  return texto
    .split(/[,;\n]/)
    .map((p) => p.trim())
    .filter(Boolean);
}
