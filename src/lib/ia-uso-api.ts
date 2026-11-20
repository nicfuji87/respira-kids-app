// AI dev note: consumo de IA (tokens e custo em US$) para a aba "Custo de IA" da central de
// Conversas. Tudo vem do RPC fn_ia_uso_painel (migration ia_uso_tokens_painel.sql, só admin).
//   - Atendimento: estimativa do n8n (o nó do modelo não expõe o uso real); "com cache" supõe
//     que a parte fixa do prompt (~20 mil tokens por chamada) veio do cache.
//   - @ju e Resumo: números reais devolvidos pela OpenAI.
//   - openai_oficial: totais por dia/modelo puxados da API de uso da OpenAI (edge ia-uso-openai),
//     só aparece quando a chave de administrador estiver no Vault ('openai_admin_key').

import { supabase } from './supabase';

export interface IaTotais {
  execucoes: number;
  puladas: number;
  chamadas: number;
  tokens_entrada: number;
  tokens_saida: number;
  custo_usd_sem_cache: number;
  custo_usd_com_cache: number;
}

export interface IaUsoPainel {
  hoje: string;
  totais: { hoje: IaTotais; '7_dias': IaTotais; mes: IaTotais };
  por_dia: Array<{
    dia: string;
    execucoes: number;
    puladas: number;
    tokens_entrada: number;
    custo_usd_sem_cache: number;
    custo_usd_com_cache: number;
  }>;
  por_fluxo: Array<{
    fluxo: string;
    execucoes: number;
    tokens_entrada: number;
    custo_usd_sem_cache: number;
    custo_usd_com_cache: number;
    estimado: boolean;
  }>;
  por_resultado: Array<{
    resultado: string;
    execucoes: number;
    tokens_entrada: number;
  }>;
  top_conversas: Array<{
    conversa_id: number;
    nome: string;
    telefone_final: string;
    execucoes: number;
    tokens_entrada: number;
    custo_usd_sem_cache: number;
    custo_usd_com_cache: number;
  }>;
  openai_oficial: Array<{
    dia: string;
    modelo: string;
    requisicoes: number;
    tokens_entrada: number;
    tokens_cache: number;
    tokens_saida: number;
    custo_usd: number | null;
  }>;
}

export async function fetchIaUsoPainel(dias = 30): Promise<IaUsoPainel> {
  const { data, error } = await supabase.rpc('fn_ia_uso_painel', {
    p_dias: dias,
  });
  if (error) throw new Error(error.message);
  return data as IaUsoPainel;
}

export const FLUXO_LABEL: Record<string, string> = {
  atendimento: 'Atendimento às famílias',
  comando: '@ju (equipe)',
  resumo: 'Resumo do dia',
};

export const RESULTADO_LABEL: Record<string, string> = {
  resposta: 'Respondeu a família',
  familia: 'Respondeu dúvida simples',
  nota_equipe: 'Nota para a equipe',
  nada: 'Leu e não falou nada',
  pulada: 'Não chamou a IA (Lolô conduzindo)',
  outro: 'Outro',
};

export function fmtTokens(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  if (v >= 1e6)
    return `${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (v >= 1e3)
    return `${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  return v.toLocaleString('pt-BR');
}

export function fmtUsd(n: number | null | undefined): string {
  return `US$ ${Number(n ?? 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
