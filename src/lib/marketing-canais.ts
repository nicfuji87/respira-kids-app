// AI dev note: aba Marketing → Retorno por canal (admin). Dados de
// fn_atrib_retorno_canais (supabase/migrations/atribuicao_v2_p0_calculo_unico.sql),
// que usa a base única do Marketing (interno.fn_atrib_conversas / fn_atrib_pacientes).
// Unidade = conversa de contato novo; canal = 1º toque (primeira origem conhecida);
// conversa sem código RK = 'nao_atribuido' ("Sem origem identificada"), nunca
// empurrada para um canal. Paciente contada uma vez (conversa mais antiga).
// Presença (fn_atrib_presenca): confirmada = Finalizado; provável = passou sem baixa,
// mas paga; pendente = passou sem baixa e sem pagamento. Só a confirmada conta como
// "atendida": pagamento não prova presença (a falta é cobrada). Receita realizada =
// confirmadas + faltas; a conferir = prováveis + pendentes.
// Filtros globais (canal, campanha, serviço) vão para o banco e valem para os totais.
// Com serviço, conversas e investimento não se dividem: vêm nulos ("indisponível
// neste recorte"), nunca o número geral.
// Só Google Ads tem custo: nos demais canais o custo é "não informado" (não é CAC zero).
// O detalhe do Google Ads (fn_atrib_retorno_anuncios) usa a mesma base.

import { supabase } from '@/lib/supabase';
import { rotuloCanal, type Indicador } from '@/lib/marketing-atribuicao';

export type BaseRetorno = 'aquisicao' | 'atendimento';

export interface CanalRetorno {
  canal: string;
  /** null = recorte por serviço (conversa não se divide por serviço). */
  conversas: number | null;
  convenio: number | null;
  multicanal: number;
  /** Conversas com origem declarada pela família (relato, não rastreio). */
  com_origem_declarada: number;
  pediram_horario: number | null;
  agendaram: number;
  /** Pacientes com presença CONFIRMADA (sessão finalizada). */
  atendidas: number;
  novas_atendidas: number;
  /** Sem sessão finalizada, mas com sessão passada paga (a conferir). */
  atendidas_provaveis: number;
  novas_provaveis: number;
  /** Só sessões passadas sem baixa e sem pagamento. */
  presenca_pendente: number;
  pagantes: number;
  sessoes_realizadas: number;
  sessoes_provaveis: number;
  sessoes_pendentes: number;
  faltas: number;
  sessoes_agendadas: number;
  /** Sessões confirmadas + faltas (cobradas integral). */
  receita_realizada: number;
  /** Sessões passadas sem baixa (prováveis + pendentes). */
  receita_a_conferir: number;
  receita_recebida: number;
  receita_agendada: number;
  /** null = canal sem custo de mídia importado (ou recorte por serviço). */
  investimento: number | null;
  cliques: number | null;
  descartadas: number;
}

/** Presença da paciente (a melhor que ela já teve no recorte). */
export type Presenca =
  | 'confirmada'
  | 'provavel'
  | 'pendente'
  | 'agendada'
  | 'falta'
  | 'sem_sessao';

export const PRESENCA: Record<
  Presenca,
  {
    rotulo: string;
    variante: 'success' | 'warning' | 'attention' | 'muted';
    dica: string;
  }
> = {
  confirmada: {
    rotulo: 'Atendida',
    variante: 'success',
    dica: 'Ao menos uma sessão finalizada na agenda.',
  },
  provavel: {
    rotulo: 'Provável, a conferir',
    variante: 'attention',
    dica: 'Sessão passada sem baixa, mas paga. Pagamento não prova presença (a falta é cobrada): confira e dê baixa na agenda.',
  },
  pendente: {
    rotulo: 'Presença pendente',
    variante: 'attention',
    dica: 'Sessão passada sem baixa e sem pagamento: confira na agenda.',
  },
  agendada: {
    rotulo: 'Agendada',
    variante: 'warning',
    dica: 'A primeira sessão ainda vai acontecer.',
  },
  falta: {
    rotulo: 'Só faltou',
    variante: 'muted',
    dica: 'Só tem falta: a cobrança entra na receita, mas não conta atendimento.',
  },
  sem_sessao: {
    rotulo: 'Sem sessão',
    variante: 'muted',
    dica: 'Ligada à conversa, sem sessão no recorte.',
  },
};

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
  presenca: Presenca;
  sessoes_realizadas: number;
  sessoes_provaveis: number;
  sessoes_pendentes: number;
  faltas: number;
  sessoes_agendadas: number;
  receita_realizada: number;
  receita_a_conferir: number;
  receita_recebida: number;
  receita_agendada: number;
}

export type ResultadoConversa =
  | 'paciente'
  | 'a_conferir'
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

/** Recorte que o banco aplicou (canal, campanha e serviço do filtro global). */
export interface RecorteCanais {
  canal: string | null;
  campanha: string | null;
  servico: string | null;
}

export interface DadosCanais {
  desde: string;
  ate: string;
  base: BaseRetorno;
  recorte: RecorteCanais;
  gerado_em: string;
  custo_ultimo_dia: string | null;
  canais: CanalRetorno[];
  pacientes: PacienteCanal[];
  conversas: ConversaCanal[];
  vinculos_manuais: VinculoManual[];
  /** O que as famílias SEM rastreio disseram (relato), por categoria. */
  origens_declaradas: OrigemDeclarada[];
}

/** Filtros globais do painel, como o banco os entende. */
export interface FiltroCanais {
  /** 'todos' | código do canal | 'tipo:pago' | 'tipo:organico' | 'tipo:sem_origem' */
  canal: string;
  /** 'todas' | campanha_id */
  campanha: string;
  /** 'todos' | serviço sem sufixo DU/FDS */
  servico: string;
}

const n = (v: unknown) => Number(v ?? 0) || 0;
const nn = (v: unknown) => (v == null ? null : Number(v));

export async function carregarCanais(
  desde: string,
  ate: string,
  base: BaseRetorno,
  f: FiltroCanais
): Promise<DadosCanais> {
  const { data, error } = await supabase.rpc('fn_atrib_retorno_canais', {
    p_desde: desde,
    p_ate: ate,
    p_base: base,
    p_canal: f.canal === 'todos' ? null : f.canal,
    p_campanha: f.campanha === 'todas' ? null : f.campanha,
    p_servico: f.servico === 'todos' ? null : f.servico,
  });
  if (error) throw new Error(error.message);
  const d = data as DadosCanais;
  return {
    ...d,
    recorte: {
      canal: d.recorte?.canal ?? null,
      campanha: d.recorte?.campanha ?? null,
      servico: d.recorte?.servico ?? null,
    },
    canais: (d.canais ?? []).map((c) => ({
      ...c,
      conversas: nn(c.conversas),
      convenio: nn(c.convenio),
      multicanal: n(c.multicanal),
      com_origem_declarada: n(c.com_origem_declarada),
      pediram_horario: nn(c.pediram_horario),
      agendaram: n(c.agendaram),
      atendidas: n(c.atendidas),
      novas_atendidas: n(c.novas_atendidas),
      atendidas_provaveis: n(c.atendidas_provaveis),
      novas_provaveis: n(c.novas_provaveis),
      presenca_pendente: n(c.presenca_pendente),
      pagantes: n(c.pagantes),
      sessoes_realizadas: n(c.sessoes_realizadas),
      sessoes_provaveis: n(c.sessoes_provaveis),
      sessoes_pendentes: n(c.sessoes_pendentes),
      faltas: n(c.faltas),
      sessoes_agendadas: n(c.sessoes_agendadas),
      receita_realizada: n(c.receita_realizada),
      receita_a_conferir: n(c.receita_a_conferir),
      receita_recebida: n(c.receita_recebida),
      receita_agendada: n(c.receita_agendada),
      investimento: nn(c.investimento),
      cliques: nn(c.cliques),
      descartadas: n(c.descartadas),
    })),
    pacientes: (d.pacientes ?? []).map((p) => ({
      ...p,
      presenca: (p.presenca ?? 'sem_sessao') as Presenca,
      sessoes_realizadas: n(p.sessoes_realizadas),
      sessoes_provaveis: n(p.sessoes_provaveis),
      sessoes_pendentes: n(p.sessoes_pendentes),
      faltas: n(p.faltas),
      sessoes_agendadas: n(p.sessoes_agendadas),
      receita_realizada: n(p.receita_realizada),
      receita_a_conferir: n(p.receita_a_conferir),
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

/** Rótulo do canal ('nao_atribuido' = conversa sem código RK). */
export const nomeCanal = (c: string | null | undefined) => rotuloCanal(c);

/** Motivo de quando o recorte por serviço deixa o número indisponível. */
export const SEM_DIVISAO_SERVICO =
  'Indisponível neste recorte: conversas e investimento não se dividem por serviço.';

const razao = (a: number, b: number | null, motivo: string): Indicador =>
  b == null
    ? { valor: null, motivo: SEM_DIVISAO_SERVICO }
    : b > 0
      ? { valor: a / b }
      : { valor: null, motivo };

/** Taxas e custo de um canal (ou da soma). Custo nulo ≠ zero.
 *  porServico: há filtro de serviço (por isso o investimento veio nulo). */
export function indicadores(c: CanalRetorno, porServico = false) {
  const semCusto: Indicador = {
    valor: null,
    motivo: porServico ? SEM_DIVISAO_SERVICO : 'Sem custo de mídia informado.',
  };
  return {
    taxa_agendamento: razao(c.agendaram, c.conversas, 'Sem conversas.'),
    taxa_atendimento: razao(c.atendidas, c.conversas, 'Sem conversas.'),
    cac:
      c.investimento == null
        ? semCusto
        : razao(
            c.investimento,
            c.novas_atendidas,
            'Nenhuma paciente nova com presença confirmada.'
          ),
    custo_agendamento:
      c.investimento == null
        ? semCusto
        : razao(c.investimento, c.agendaram, 'Nenhum agendamento.'),
  };
}

export function somarCanais(cs: CanalRetorno[]): CanalRetorno {
  const s = (k: keyof CanalRetorno) =>
    cs.reduce((a, c) => a + n(c[k] as number | null), 0);
  /** Soma que fica nula se alguma linha for nula (recorte por serviço). */
  const sn = (k: 'conversas' | 'convenio' | 'pediram_horario') =>
    cs.some((c) => c[k] == null) ? null : s(k);
  const comCusto = cs.filter((c) => c.investimento != null);
  return {
    canal: 'total',
    conversas: sn('conversas'),
    convenio: sn('convenio'),
    multicanal: s('multicanal'),
    com_origem_declarada: s('com_origem_declarada'),
    pediram_horario: sn('pediram_horario'),
    agendaram: s('agendaram'),
    atendidas: s('atendidas'),
    novas_atendidas: s('novas_atendidas'),
    atendidas_provaveis: s('atendidas_provaveis'),
    novas_provaveis: s('novas_provaveis'),
    presenca_pendente: s('presenca_pendente'),
    pagantes: s('pagantes'),
    sessoes_realizadas: s('sessoes_realizadas'),
    sessoes_provaveis: s('sessoes_provaveis'),
    sessoes_pendentes: s('sessoes_pendentes'),
    faltas: s('faltas'),
    sessoes_agendadas: s('sessoes_agendadas'),
    receita_realizada: s('receita_realizada'),
    receita_a_conferir: s('receita_a_conferir'),
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
  a_conferir: { rotulo: 'Presença a conferir', variante: 'attention' },
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
