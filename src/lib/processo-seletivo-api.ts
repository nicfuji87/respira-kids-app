// AI dev note: API do Processo Seletivo de Estagiários.
// - submitCandidaturaEstagio: usado pela página pública (anon) via RPC
//   SECURITY DEFINER, que corrige o situacional no servidor.
// - fetchCandidaturas / updateAvaliacao: painel interno (RLS: admin + secretaria).

import { supabase } from './supabase';
import type {
  CandidaturaEstagioPayload,
  CandidaturaEstagioRow,
  ProcessoSeletivoStats,
  Recomendacao,
  StatusCandidatura,
} from '@/types/processo-seletivo';

const TABLE = 'candidaturas_estagio';

/**
 * Envia a candidatura. A pontuação do situacional é calculada no servidor
 * (o gabarito não trafega para o cliente).
 */
export async function submitCandidaturaEstagio(
  payload: CandidaturaEstagioPayload
): Promise<{ ok: true }> {
  const { error } = await supabase.rpc('submit_candidatura_estagio', {
    payload,
  });
  if (error) {
    console.error('[processo-seletivo] erro ao enviar:', error);
    throw error;
  }
  return { ok: true };
}

/** Busca todas as candidaturas ativas (mais recentes primeiro). */
export async function fetchCandidaturas(): Promise<CandidaturaEstagioRow[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('ativo', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[processo-seletivo] erro ao buscar:', error);
    throw error;
  }
  return (data || []) as CandidaturaEstagioRow[];
}

export interface AvaliacaoInput {
  status?: StatusCandidatura;
  avaliacao_nota?: number | null;
  avaliacao_observacoes?: string | null;
  /** pessoa.id de quem está avaliando. */
  avaliadoPor?: string | null;
}

/** Atualiza a avaliação humana de uma candidatura. */
export async function updateCandidaturaAvaliacao(
  id: string,
  input: AvaliacaoInput
): Promise<CandidaturaEstagioRow> {
  const patch: Record<string, unknown> = {
    avaliado_em: new Date().toISOString(),
  };
  if (input.status !== undefined) patch.status = input.status;
  if (input.avaliacao_nota !== undefined)
    patch.avaliacao_nota = input.avaliacao_nota;
  if (input.avaliacao_observacoes !== undefined)
    patch.avaliacao_observacoes = input.avaliacao_observacoes;
  if (input.avaliadoPor !== undefined) patch.avaliado_por = input.avaliadoPor;

  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('[processo-seletivo] erro ao atualizar avaliação:', error);
    throw error;
  }
  return data as CandidaturaEstagioRow;
}

/** Soft-delete de uma candidatura. */
export async function arquivarCandidatura(id: string): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({ ativo: false })
    .eq('id', id);
  if (error) {
    console.error('[processo-seletivo] erro ao arquivar:', error);
    throw error;
  }
}

// =====================================================
// Agregações (client-side)
// =====================================================

export function computeStats(
  rows: CandidaturaEstagioRow[]
): ProcessoSeletivoStats {
  const pontuacoes = rows
    .map((r) => r.pontuacao_situacional)
    .filter((n): n is number => typeof n === 'number');

  const soma = pontuacoes.reduce((acc, n) => acc + n, 0);
  const pontuacaoMaxima = rows.find(
    (r) => r.pontuacao_maxima > 0
  )?.pontuacao_maxima;

  return {
    total: rows.length,
    aAvaliar: rows.filter((r) => r.status === 'a_avaliar').length,
    entrevista: rows.filter((r) => r.status === 'entrevista').length,
    aprovados: rows.filter((r) => r.status === 'aprovado').length,
    descartados: rows.filter((r) => r.status === 'descartado').length,
    comRespostaPerigosa: rows.filter((r) => r.tem_resposta_perigosa).length,
    mediaPontuacao:
      pontuacoes.length > 0
        ? Number((soma / pontuacoes.length).toFixed(1))
        : null,
    pontuacaoMaxima: pontuacaoMaxima ?? 12,
  };
}

/**
 * Recomendação automática (apenas sugestão; a decisão é sempre humana).
 * Regras: resposta perigosa sempre vira alerta; senão, faixa pela % de acerto
 * no situacional.
 */
export function getRecomendacao(row: CandidaturaEstagioRow): Recomendacao {
  if (row.tem_resposta_perigosa) {
    return { tone: 'alerta', label: 'Atenção: resposta de risco' };
  }
  const max = row.pontuacao_maxima || 12;
  const pct = max > 0 ? row.pontuacao_situacional / max : 0;
  if (pct >= 0.83) return { tone: 'forte', label: 'Forte — vale entrevista' };
  if (pct >= 0.58)
    return { tone: 'mediano', label: 'Mediano — revisar respostas' };
  return { tone: 'fraco', label: 'Abaixo do esperado' };
}
