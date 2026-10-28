// AI dev note: API da central de Conversas (/conversas). Tudo é agregado no banco
// (migration conversas_central.sql); a tela só desenha.
//   fn_conversas_hoje         prioridades da equipe
//   fn_conversas_tarefa       assumir / resolver (resolver fecha também na origem:
//                             follow-up da análise e pedido da Ju)
//   fn_conversas_desempenho   atendimento medido por MENSAGEM (ju_mensagens,
//                             existe desde 16/10/2026) + funil com a agenda + Ju
//   fn_conversas_qualidade    atrito em categorias fixas, falhas da operação,
//                             automação por família, sentimento
// As RPCs criam tabela temporária: chamar sempre por POST (o padrão do
// supabase.rpc). Nunca usar { get: true }, que roda em transação só leitura.

import { supabase } from './supabase';

export type Prioridade = 'alta' | 'media' | 'baixa';
export type TipoItem =
  | 'familia_aguardando'
  | 'pedido_ju'
  | 'cobranca'
  | 'followup'
  | 'reclamacao'
  | 'lead';
export type Responsavel =
  | 'Recepção'
  | 'Financeiro'
  | 'Fisioterapeutas'
  | 'Gestão';
export type ResultadoTarefa =
  | 'respondeu'
  | 'agendou'
  | 'resolveu'
  | 'perdeu'
  | 'nao_se_aplica';

export interface ItemHoje {
  tipo: TipoItem;
  ref: string;
  prioridade: Prioridade;
  responsavel: Responsavel;
  titulo: string;
  descricao: string;
  evidencia: string;
  desde: string;
  atividade: string;
  nome: string;
  telefone: string | null;
  chatwoot_id?: string | null;
  paciente_id?: string | null;
  link_interno?: string | null;
  pontos?: number;
  minutos_expediente?: number;
  fora_expediente?: boolean;
  tarefa?: { status: 'assumida'; por: string | null; em: string } | null;
}

export interface KpisHoje {
  familias_aguardando: number;
  familias_aguardando_2h: number;
  pedidos_ju: number;
  financeiro: number;
  cobrancas_conferencia: number;
  reclamacoes: number;
  oportunidades: number;
  oportunidades_todas: number;
  em_revisao: number;
  recuperados_30d: number;
  alta: number;
  gerado_em: string;
}

export interface Hoje {
  kpis: KpisHoje;
  itens: ItemHoje[];
}

export interface KpisAtendimento {
  familias: number;
  pedidos: number;
  respondidos: number;
  mediana_min: number | null;
  p90_min: number | null;
  mediana_expediente_min: number | null;
  mediana_fora_min: number | null;
  pct_15min: number | null;
  pct_1h: number | null;
  sem_resposta: number;
  pct_ju: number | null;
  repetiram: number;
  fora_expediente: number | null;
}

export interface Desempenho {
  periodo_dias: number;
  mensagens_desde: string;
  historico_limitado: boolean;
  kpis: { atual: KpisAtendimento; anterior: KpisAtendimento };
  volume: Array<{
    dia: string;
    familia: number;
    equipe: number;
    ju: number;
    automacao: number;
  }>;
  calor: Array<{
    dow: number;
    hora: number;
    pedidos: number;
    mediana_min: number | null;
  }>;
  faixas: Array<{
    faixa: string;
    ordem: number;
    expediente: number;
    fora: number;
  }>;
  funil: {
    contatos_novos: number;
    interessados: number;
    cadastrados: number;
    agendaram: number;
    atendidos: number;
    voltaram: number;
  };
  motivos: Array<{ intencao: string; total: number }>;
  ju: {
    pedidos_respondidos: number;
    encaminhados: number;
    encaminhados_por_tipo: Array<{ tipo: string; total: number }> | null;
    acoes: Array<{ tipo: string; ok: number; falhou: number }> | null;
    resolvidos_automaticamente: number;
    tempo_ate_resolver_h: number | null;
  };
  semana: {
    familias: number;
    familias_ant: number;
    reclamacoes: number;
    reclamacoes_ant: number;
    cobrancas_pausadas: number;
    cobrancas_pausadas_ant: number;
    recuperados: number;
    tarefas_resolvidas: number;
    mediana_min: number | null;
    mediana_min_ant: number | null;
    p90_min: number | null;
    p90_min_ant: number | null;
    sem_resposta: number;
    sem_resposta_ant: number;
    principal_atrito: string | null;
    principal_atrito_familias: number | null;
  };
}

export interface CategoriaAtrito {
  categoria: string;
  label: string;
  interna: boolean;
  familias: number;
  reclamacoes: number;
  exemplo: string | null;
}

export interface Qualidade {
  periodo_dias: number;
  kpis: {
    conversas_analisadas: number;
    familias_com_atrito: number;
    familias_falha_interna: number;
    familias_repetidas: number;
    reclamacoes: number;
    reclamacoes_falha_interna: number;
  };
  categorias: CategoriaAtrito[];
  mensal: Array<{ mes: string; internas: number; outras: number }>;
  pausas: {
    criadas: number;
    abertas: number;
    vencidas: number;
    pagamento_confirmado: number;
    divida_confirmada: number;
    horas_ate_resolver: number | null;
  };
  automacao: {
    janela_dias: number;
    mensagens: number;
    familias: number;
    mediana_por_familia_semana: number | null;
    familias_5mais_semana: number;
    por_assunto: Array<{ assunto: string; total: number }> | null;
    mais_recebem: Array<{ nome: string; n: number; assuntos: string }> | null;
  };
  sentimento: Array<{
    semana: string;
    total: number;
    negativo: number;
    preocupado: number;
  }>;
  reclamacoes_recentes: Array<{
    id: string;
    nome: string;
    ult: string;
    motivo: string | null;
    nivel: string | null;
    chatwoot_id: string | null;
    telefone: string | null;
    followup_status: string;
    categorias: Array<{
      categoria: string;
      label: string;
      interna: boolean;
    }> | null;
  }>;
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args ?? {});
  if (error) {
    console.error(`❌ ${fn}:`, error);
    throw error;
  }
  return data as T;
}

export const fetchHoje = () => rpc<Hoje>('fn_conversas_hoje');
export const fetchDesempenho = (dias: number) =>
  rpc<Desempenho>('fn_conversas_desempenho', { p_dias: dias });
export const fetchQualidade = (dias: number) =>
  rpc<Qualidade>('fn_conversas_qualidade', { p_dias: dias });

export async function atualizarTarefa(
  item: Pick<ItemHoje, 'tipo' | 'ref' | 'atividade'>,
  acao: 'assumir' | 'soltar' | 'resolver',
  resultado?: ResultadoTarefa,
  observacao?: string
): Promise<void> {
  await rpc('fn_conversas_tarefa', {
    p_tipo: item.tipo,
    p_ref: item.ref,
    p_acao: acao,
    p_resultado: resultado ?? null,
    p_observacao: observacao?.trim() || null,
    p_atividade: item.atividade ?? null,
  });
}

// =====================================================================
// Links para abrir a conversa
// =====================================================================

const CHATWOOT_BASE =
  'https://app.infusecomunicacao.online/app/accounts/5/conversations/';

export const chatwootUrl = (id?: string | null) =>
  id ? `${CHATWOOT_BASE}${id}` : null;

// pessoas.telefone e contatos vêm como JID (55 + DDD + número). No desktop o
// web.whatsapp.com cai direto na conversa; no celular o wa.me abre o app.
export function whatsappUrl(telefone?: string | null): string | null {
  const d = String(telefone ?? '').replace(/\D/g, '');
  if (d.length < 10) return null;
  const numero = d.startsWith('55') ? d : `55${d}`;
  const mobile =
    typeof navigator !== 'undefined' &&
    /android|iphone|ipad|ipod/i.test(navigator.userAgent);
  return mobile
    ? `https://wa.me/${numero}`
    : `https://web.whatsapp.com/send?phone=${numero}`;
}

// =====================================================================
// Formatação
// =====================================================================

export function fmtMinutos(min: number | null | undefined): string {
  if (min === null || min === undefined || Number.isNaN(min)) return '—';
  if (min < 1) return 'menos de 1 min';
  if (min < 60) return `${Math.round(min)} min`;
  const h = min / 60;
  if (h < 24) {
    const hh = Math.floor(h);
    const mm = Math.round(min - hh * 60);
    return mm > 0 && hh < 10 ? `${hh}h ${mm}min` : `${hh}h`;
  }
  const dias = Math.floor(h / 24);
  const resto = Math.round(h - dias * 24);
  return resto > 0 ? `${dias}d ${resto}h` : `${dias}d`;
}

export function fmtDesde(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = ms / 60000;
  if (min < 60) return `há ${Math.max(1, Math.round(min))} min`;
  const h = min / 60;
  if (h < 24) return `há ${Math.round(h)} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'há 1 dia' : `há ${d} dias`;
}

export const pct = (n: number, d: number) =>
  d > 0 ? Math.round((n / d) * 100) : 0;
