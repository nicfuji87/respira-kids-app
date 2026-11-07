// AI dev note: Pagamento das metas do mês (admin). TODA a regra mora no
// servidor: fn_metas_pagamentos (migration metas_pagamentos_mes.sql). O front
// só exibe — inclusive a proporcionalidade de outubro e a motora que só entra
// no bônus a partir de 01/12/2026 (decisões do dono em 07/11/2026).

import { supabase } from './supabase';

export type GrupoEvolucao = 'respiratoria' | 'motora' | 'avaliacao' | 'outros';

export interface EvolucaoPorTipo {
  grupo: GrupoEvolucao;
  sessoes: number;
  com_evolucao: number;
  no_prazo: number;
  perdidas: number;
  pct_cobertura: number;
  pct_no_prazo: number;
  conta_no_bonus: boolean;
}

export interface EstagiariaPagamento {
  nome: string;
  turno: 'manha' | 'tarde';
  dias_trabalhados: number;
  sessoes_do_turno: number;
  perdidas_do_turno: number;
  bateu: boolean;
  a_pagar: number;
}

export interface SecretariaPagamento {
  nome: string | null;
  contatos: number | null;
  contatos_meta: number | null;
  reativacoes: number | null;
  reativacoes_meta: number | null;
  convites_pesquisa: number | null;
  respostas_pesquisa: number | null;
  requisito_ok: boolean | null;
  bonus_nivel: number | null;
  proximo_nivel: number | null;
}

export interface RegrasPagamento {
  bonus_base: number;
  desconto_por_perdida: number;
  vigencia_inicio: string;
  motora_desde: string;
  conta_motora: boolean;
  dias_mes: number;
  dias_vigentes: number;
  proporcional: boolean;
  base_do_mes: number;
  divisao: 'dupla';
}

export interface MetasPagamentos {
  mes: string;
  inicio: string;
  fim: string;
  atualizado_em: string;
  regras: RegrasPagamento;
  por_tipo: EvolucaoPorTipo[];
  contadas: number;
  perdidas: number;
  domiciliares_fora: number;
  bonus_cada: number;
  estagiarias: EstagiariaPagamento[];
  secretaria: SecretariaPagamento | null;
  secretaria_a_pagar: number;
  total_a_pagar: number;
}

export async function fetchMetasPagamentos(
  mes: number,
  ano: number
): Promise<MetasPagamentos> {
  const p_mes = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const { data, error } = await supabase.rpc('fn_metas_pagamentos', { p_mes });
  if (error) throw new Error(error.message);
  return data as MetasPagamentos;
}

export const NOME_GRUPO: Record<GrupoEvolucao, string> = {
  respiratoria: 'Respiratória',
  motora: 'Motora',
  avaliacao: 'Avaliação',
  outros: 'Outros',
};
