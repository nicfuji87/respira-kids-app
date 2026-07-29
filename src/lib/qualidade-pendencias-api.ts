// AI dev note: API das pendências de adequação (licenciamento, tributário,
// estrutural, POPs a escrever, treinamento). Diferente do levantamento (Q&A):
// aqui cada linha é uma AÇÃO com status — o que falta fazer, não o que já se sabe.

import { supabase } from './supabase';
import type { PendenciaRow, PendenciaStatus } from '@/types/qualidade';

const TABLE = 'qualidade_pendencias';

export async function fetchPendencias(): Promise<PendenciaRow[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('categoria', { ascending: true })
    .order('ordem', { ascending: true });

  if (error) {
    console.error('[qualidade-pendencias] erro ao buscar:', error);
    throw error;
  }
  return (data || []) as PendenciaRow[];
}

export async function atualizarStatusPendencia(
  id: string,
  status: PendenciaStatus
): Promise<PendenciaRow> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ status })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[qualidade-pendencias] erro ao atualizar status:', error);
    throw error;
  }
  return data as PendenciaRow;
}
