// Rascunho da evolução no servidor ("Salvar e continuar depois").
// Gravar em relatorio_evolucao finaliza a consulta e dispara automações, então
// a evolução incompleta fica aqui até ser finalizada. Abre em qualquer aparelho.

import { supabase } from '@/lib/supabase';
import type {
  EvolucaoMotoraAssimetria,
  EvolucaoRespiratoria,
  TipoEvolucao,
} from '@/types/evolucao-clinica';

export interface DadosRascunhoEvolucao {
  tipo_evolucao: TipoEvolucao;
  evolucao_respiratoria?: EvolucaoRespiratoria;
  evolucao_motora_assimetria?: EvolucaoMotoraAssimetria;
  savedAt: string;
  secoes_pendentes_revisao?: string[];
  reaproveitado_de?: string | null;
}

export interface RascunhoEvolucaoServidor {
  dados: DadosRascunhoEvolucao;
  atualizado_em: string;
  atualizado_por_nome: string | null;
}

export async function salvarRascunhoEvolucao(
  agendamentoId: string,
  dados: DadosRascunhoEvolucao
): Promise<string> {
  const { data, error } = await supabase.rpc('fn_evolucao_rascunho_salvar', {
    p_agendamento_id: agendamentoId,
    p_tipo_evolucao: dados.tipo_evolucao,
    p_dados: dados,
  });
  if (error) throw error;
  return data as string;
}

export async function buscarRascunhoEvolucao(
  agendamentoId: string
): Promise<RascunhoEvolucaoServidor | null> {
  const { data, error } = await supabase.rpc('fn_evolucao_rascunho_obter', {
    p_agendamento_id: agendamentoId,
  });
  if (error) throw error;
  if (!data) return null;
  const r = data as {
    dados: DadosRascunhoEvolucao;
    atualizado_em: string;
    atualizado_por_nome: string | null;
  };
  return {
    dados: r.dados,
    atualizado_em: r.atualizado_em,
    atualizado_por_nome: r.atualizado_por_nome,
  };
}

export async function apagarRascunhoEvolucao(
  agendamentoId: string
): Promise<void> {
  const { error } = await supabase.rpc('fn_evolucao_rascunho_apagar', {
    p_agendamento_id: agendamentoId,
  });
  if (error) throw error;
}

/** "26/10 às 14:32", no fuso do aparelho (atualizado_em é timestamptz). */
export function quandoRascunho(iso: string): string {
  const d = new Date(iso);
  const data = d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  });
  const hora = d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${data} às ${hora}`;
}
