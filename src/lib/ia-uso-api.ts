// AI dev note: consumo de IA (tokens e custo em US$) para a aba "Custo de IA" da central de
// Conversas. A tela usa fn_ia_uso_painel_filtro (migration ia_uso_painel_filtros.sql, só admin):
// período livre, fluxo, resultado, busca por nome/final do telefone e ordem das conversas.
// fn_ia_uso_painel (sem filtros, ia_uso_tokens_painel.sql) ficou para compatibilidade.
//   - Atendimento: estimativa do n8n (o nó do modelo não expõe o uso real); "com cache" supõe
//     que a parte fixa do prompt (~20 mil tokens por chamada) veio do cache.
//   - @ju e Resumo: números reais devolvidos pela OpenAI.
//   - openai_oficial: totais por dia/modelo/chave puxados da API de uso da OpenAI (edge ia-uso-openai,
//     chave de administrador no segredo 'openai_admin_key'). Só as chaves de ia_chaves_rk; as dos
//     outros projetos do dono vêm somadas em openai_outros_usd.

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
    chave: string;
    requisicoes: number;
    tokens_entrada: number;
    tokens_cache: number;
    tokens_saida: number;
    custo_usd: number | null;
  }>;
  /** Gasto das chaves que não são da Respira Kids (a organização da OpenAI é compartilhada). */
  openai_outros_usd: number | null;
}

export interface IaPeriodo extends Omit<IaTotais, 'chamadas'> {
  conversas: number;
  custo_medio_conversa_com_cache: number | null;
  custo_medio_conversa_sem_cache: number | null;
}

export interface IaConversaUso {
  conversa_id: number;
  nome: string;
  telefone_final: string;
  execucoes: number;
  puladas: number;
  tokens_entrada: number;
  custo_usd_sem_cache: number;
  custo_usd_com_cache: number;
  /** "DD/MM HH:MI" (Brasília). */
  ultima: string;
}

export interface IaUsoPainelFiltrado
  extends Omit<IaUsoPainel, 'top_conversas'> {
  de: string;
  ate: string;
  periodo: IaPeriodo;
  conversas: IaConversaUso[];
}

export type IaOrdem = 'custo' | 'execucoes' | 'recentes';

export interface IaFiltros {
  /** YYYY-MM-DD (dia de Brasília). */
  de: string;
  ate: string;
  fluxo: string | null;
  resultado: string | null;
  busca: string;
  ordem: IaOrdem;
}

export async function fetchIaUsoPainelFiltro(
  f: IaFiltros
): Promise<IaUsoPainelFiltrado> {
  const { data, error } = await supabase.rpc('fn_ia_uso_painel_filtro', {
    p_de: f.de,
    p_ate: f.ate,
    p_fluxo: f.fluxo,
    p_resultado: f.resultado,
    p_busca: f.busca.trim() || null,
    p_ordem: f.ordem,
  });
  if (error) throw new Error(error.message);
  return data as IaUsoPainelFiltrado;
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
