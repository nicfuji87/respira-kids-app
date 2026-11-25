// AI dev note: aba Marketing → Retorno por canal (admin). Dados de
// fn_atrib_retorno_canais (supabase/migrations/atribuicao_v2_retorno_canais.sql).
// Unidade = conversa de contato novo; canal = 1º toque (primeira origem conhecida);
// conversa sem código RK = 'desconhecido' ("Sem origem identificada"), nunca
// empurrada para um canal. Paciente contada uma vez (conversa mais antiga).
// Agendou ≠ atendida ≠ pagante. Só Google Ads tem custo: nos demais canais o
// custo é "não informado" (não é CAC zero — conteúdo também custa).
// O detalhe do Google Ads continua em fn_atrib_retorno_anuncios (RetornoTab).

import { supabase } from '@/lib/supabase';
import { rotuloCanal, type Indicador } from '@/lib/marketing-atribuicao';

export type BaseRetorno = 'aquisicao' | 'atendimento';

export interface CanalRetorno {
  canal: string;
  conversas: number;
  convenio: number;
  multicanal: number;
  /** Conversas com origem declarada pela família (relato, não rastreio). */
  com_origem_declarada: number;
  pediram_horario: number;
  agendaram: number;
  atendidas: number;
  novas_atendidas: number;
  pagantes: number;
  sessoes_realizadas: number;
  sessoes_agendadas: number;
  receita_realizada: number;
  receita_recebida: number;
  receita_agendada: number;
  /** null = canal sem custo de mídia importado. */
  investimento: number | null;
  cliques: number | null;
  descartadas: number;
}

export interface PacienteCanal {
  paciente_id: string;
  nome: string | null;
  conversa_id: number;
  canal: string;
  canal_ultima: string;
  campanha_id: string | null;
  palavra_chave: string | null;
  pagina: string | null;
  vinculo: string | null;
  confianca: string | null;
  origem_declarada: string | null;
  primeiro_contato: string | null;
  primeira_sessao: string | null;
  proxima_sessao: string | null;
  servico: string | null;
  profissional: string | null;
  ja_era_paciente: boolean;
  sessoes_realizadas: number;
  faltas: number;
  sessoes_agendadas: number;
  receita_realizada: number;
  receita_recebida: number;
  receita_agendada: number;
}

export type ResultadoConversa =
  | 'paciente'
  | 'agendada'
  | 'sem_sessao'
  | 'pediu_horario'
  | 'conversa';

export interface ConversaCanal {
  conversa_id: number;
  canal: string;
  canal_ultima: string;
  campanha_id: string | null;
  palavra_chave: string | null;
  pagina: string | null;
  vinculo: string | null;
  entrada: string | null;
  convenio: boolean;
  resultado: ResultadoConversa;
  paciente_id: string | null;
  origem_declarada: string | null;
}

export interface OrigemDeclarada {
  categoria: string;
  conversas: number;
  agendaram: number;
  atendidas: number;
  receita_realizada: number;
}

export interface VinculoManual {
  conversa_id: number;
  canal: string;
  paciente: string | null;
  vinculado_em: string | null;
  vinculado_por: string | null;
  motivo: string | null;
}

export interface DadosCanais {
  desde: string;
  ate: string;
  base: BaseRetorno;
  gerado_em: string;
  custo_ultimo_dia: string | null;
  canais: CanalRetorno[];
  pacientes: PacienteCanal[];
  conversas: ConversaCanal[];
  vinculos_manuais: VinculoManual[];
  /** O que as famílias SEM rastreio disseram (relato), por categoria. */
  origens_declaradas: OrigemDeclarada[];
}

const n = (v: unknown) => Number(v ?? 0) || 0;
const nn = (v: unknown) => (v == null ? null : Number(v));

export async function carregarCanais(
  desde: string,
  ate: string,
  base: BaseRetorno
): Promise<DadosCanais> {
  const { data, error } = await supabase.rpc('fn_atrib_retorno_canais', {
    p_desde: desde,
    p_ate: ate,
    p_base: base,
  });
  if (error) throw new Error(error.message);
  const d = data as DadosCanais;
  return {
    ...d,
    canais: (d.canais ?? []).map((c) => ({
      ...c,
      conversas: n(c.conversas),
      convenio: n(c.convenio),
      multicanal: n(c.multicanal),
      com_origem_declarada: n(c.com_origem_declarada),
      pediram_horario: n(c.pediram_horario),
      agendaram: n(c.agendaram),
      atendidas: n(c.atendidas),
      novas_atendidas: n(c.novas_atendidas),
      pagantes: n(c.pagantes),
      sessoes_realizadas: n(c.sessoes_realizadas),
      sessoes_agendadas: n(c.sessoes_agendadas),
      receita_realizada: n(c.receita_realizada),
      receita_recebida: n(c.receita_recebida),
      receita_agendada: n(c.receita_agendada),
      investimento: nn(c.investimento),
      cliques: nn(c.cliques),
      descartadas: n(c.descartadas),
    })),
    pacientes: (d.pacientes ?? []).map((p) => ({
      ...p,
      sessoes_realizadas: n(p.sessoes_realizadas),
      faltas: n(p.faltas),
      sessoes_agendadas: n(p.sessoes_agendadas),
      receita_realizada: n(p.receita_realizada),
      receita_recebida: n(p.receita_recebida),
      receita_agendada: n(p.receita_agendada),
    })),
    conversas: d.conversas ?? [],
    vinculos_manuais: d.vinculos_manuais ?? [],
    origens_declaradas: (d.origens_declaradas ?? []).map((o) => ({
      ...o,
      conversas: n(o.conversas),
      agendaram: n(o.agendaram),
      atendidas: n(o.atendidas),
      receita_realizada: n(o.receita_realizada),
    })),
  };
}

/** Rótulo do canal; 'desconhecido' aqui é conversa SEM código RK. */
export const nomeCanal = (c: string | null | undefined) =>
  c === 'desconhecido' ? 'Sem origem identificada' : rotuloCanal(c);

const razao = (a: number, b: number, motivo: string): Indicador =>
  b > 0 ? { valor: a / b } : { valor: null, motivo };

/** Taxas e custo de um canal (ou da soma). Custo nulo ≠ zero. */
export function indicadores(c: CanalRetorno) {
  return {
    taxa_agendamento: razao(c.agendaram, c.conversas, 'Sem conversas.'),
    taxa_atendimento: razao(c.atendidas, c.conversas, 'Sem conversas.'),
    cac:
      c.investimento == null
        ? ({
            valor: null,
            motivo: 'Sem custo de mídia informado.',
          } satisfies Indicador)
        : razao(c.investimento, c.novas_atendidas, 'Nenhuma paciente nova.'),
    custo_agendamento:
      c.investimento == null
        ? ({
            valor: null,
            motivo: 'Sem custo de mídia informado.',
          } satisfies Indicador)
        : razao(c.investimento, c.agendaram, 'Nenhum agendamento.'),
  };
}

export function somarCanais(cs: CanalRetorno[]): CanalRetorno {
  const s = (k: keyof CanalRetorno) =>
    cs.reduce((a, c) => a + n(c[k] as number | null), 0);
  const comCusto = cs.filter((c) => c.investimento != null);
  return {
    canal: 'total',
    conversas: s('conversas'),
    convenio: s('convenio'),
    multicanal: s('multicanal'),
    com_origem_declarada: s('com_origem_declarada'),
    pediram_horario: s('pediram_horario'),
    agendaram: s('agendaram'),
    atendidas: s('atendidas'),
    novas_atendidas: s('novas_atendidas'),
    pagantes: s('pagantes'),
    sessoes_realizadas: s('sessoes_realizadas'),
    sessoes_agendadas: s('sessoes_agendadas'),
    receita_realizada: s('receita_realizada'),
    receita_recebida: s('receita_recebida'),
    receita_agendada: s('receita_agendada'),
    investimento: comCusto.length
      ? comCusto.reduce((a, c) => a + n(c.investimento), 0)
      : null,
    cliques: comCusto.length
      ? comCusto.reduce((a, c) => a + n(c.cliques), 0)
      : null,
    descartadas: s('descartadas'),
  };
}

export const RESULTADO_CONVERSA: Record<
  ResultadoConversa,
  { rotulo: string; variante: 'success' | 'warning' | 'attention' | 'muted' }
> = {
  paciente: { rotulo: 'Virou paciente', variante: 'success' },
  agendada: { rotulo: 'Agendada', variante: 'warning' },
  sem_sessao: { rotulo: 'Ligada, sem sessão', variante: 'muted' },
  pediu_horario: { rotulo: 'Pediu horário', variante: 'attention' },
  conversa: { rotulo: 'Só conversa', variante: 'muted' },
};

/** Categorias de origem declarada (fn_ju_origem_declarada). Relato, não rastreio. */
export const ORIGEM_DECLARADA: Record<string, string> = {
  indicacao_profissional: 'Indicação de profissional',
  indicacao_conhecido: 'Indicação de conhecido',
  google_busca: 'Busca no Google',
  google_maps: 'Google Maps / perfil',
  instagram: 'Instagram',
  facebook: 'Facebook',
  site: 'Site',
  ja_conhecia: 'Já conhecia',
  outro: 'Outro',
  nao_lembra: 'Não lembra',
};
export const nomeOrigemDeclarada = (c: string | null | undefined) =>
  c ? (ORIGEM_DECLARADA[c] ?? c) : '—';

export const VINCULO: Record<string, string> = {
  pedido_ju: 'Pedido pela Ju',
  provavel: 'Provável (horário)',
  humano: 'Manual',
};
