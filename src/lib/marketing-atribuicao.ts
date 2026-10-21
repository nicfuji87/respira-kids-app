// AI dev note: Painel de marketing (atribuição v2) — dados e cálculos.
// Fonte: visões vw_atrib_* (só admin; RLS + fn_atrib_pode_ver) e RPCs
// fn_atrib_painel_qualidade / fn_atrib_jornada. Ver docs/ATRIBUICAO.md.
// Regras que valem para TODAS as abas (por isso tudo é calculado aqui, a
// partir do mesmo conjunto filtrado):
// - Nunca estimar: sem dado suficiente, o indicador é null + motivo.
// - CAC/ROAS só com custo completo (custo_status = 'completo' em todas as
//   linhas pagas do recorte). Gasto inteiro no denominador.
// - Coorte = mês da origem (mes_origem; sem origem, mês da aquisição).
// - Filtro de serviço vale para pacientes e receita (serviço do 1º
//   atendimento); investimento não se divide por serviço → CAC/ROAS indisponível.

import { supabase } from '@/lib/supabase';

// ── Tipos (espelham as visões) ───────────────────────────────────────
export type CustoStatus =
  | 'completo'
  | 'desatualizado'
  | 'sem_dados'
  | 'nao_se_aplica';

export interface CampanhaMes {
  mes: string;
  plataforma: string | null;
  campanha_id: string | null;
  campanha_nome: string | null;
  custo_status: CustoStatus;
  investimento: number | null;
  impressoes: number | null;
  cliques_anuncio: number | null;
  cliques_whatsapp: number | null;
  conversas_com_codigo: number;
  agendaram: number;
}

export interface Aquisicao {
  paciente_id: string;
  aquisicao_em: string;
  mes: string;
  mes_origem: string | null;
  periodo_rastreado: boolean;
  oportunidade_id: number | null;
  tipo_vinculo: string;
  confianca: string | null;
  canal: string;
  plataforma: string | null;
  campanha_id: string | null;
  campanha_nome: string | null;
  tipo_origem: string;
  familia_nova: boolean;
  receita_primeira_sessao: number;
  receita_30d: number;
  receita_90d: number;
  receita_180d: number;
  ltv_realizado: number;
  ltv_familia_realizado: number | null;
  sessoes_30d: number;
  sessoes_90d: number;
  sessoes_180d: number;
  sessoes_total: number;
  dias_desde_aquisicao: number;
  servico: string | null;
}

export interface OportunidadePainel {
  id: number;
  aberta_em: string;
  motivo_abertura: string;
  contato_novo: boolean;
  etapa_atual: string;
  etapa_maxima: string;
  etapa_maxima_ord: number;
  estado: string;
  estado_em: string | null;
  motivo_perda: string | null;
  motivo_fonte: string | null;
  motivo_evidencia: string | null;
  canal: string;
  plataforma: string | null;
  campanha_id: string | null;
  campanha_nome: string | null;
  tipo_origem: string;
  n_toques: number;
  servico_pagina: string | null;
  criancas: string | null;
  agendamentos: number;
  receita_vinculada: number;
  /** Regra fixa sobre a análise da noite (ver migração atribuicao_v2_painel_auditoria). */
  intencao: Intencao;
  intencao_fonte: 'etapa' | 'analise' | null;
  intencao_analise: string | null;
  intencao_analisada_em: string | null;
}

export interface CliqueDia {
  dia: string;
  canal: string;
  campanha_id: string;
  campanha_nome: string | null;
  cliques: number;
}

export interface CustosStatus {
  plataforma: string;
  conta_id: string;
  ultima_importacao: string | null;
  cobertura_ate: string | null;
  ultimo_status: string | null;
  ultimo_detalhe: string | null;
  desatualizado: boolean;
  divergencias_7d: number;
  rejeicoes_7d: number;
}

export interface DadosPainel {
  campanhas: CampanhaMes[];
  aquisicoes: Aquisicao[];
  oportunidades: OportunidadePainel[];
  cliques: CliqueDia[];
  custos: CustosStatus | null;
  carregadoEm: Date;
}

export interface Filtros {
  mesInicio: string; // YYYY-MM
  mesFim: string; // YYYY-MM
  canal: string; // 'todos' | canal
  campanha: string; // 'todas' | campanha_id
  servico: string; // 'todos' | nome
}

/** Um número que pode não estar disponível — e diz por quê. */
export interface Indicador {
  valor: number | null;
  motivo?: string; // por que está indisponível
  aviso?: string; // disponível, mas com ressalva (ex.: coorte em maturação)
}

// ── Rótulos ──────────────────────────────────────────────────────────
export const CANAIS: Record<string, string> = {
  google_ads: 'Google Ads',
  meta_ads: 'Meta Ads',
  google_organico: 'Google orgânico',
  instagram: 'Instagram',
  facebook: 'Facebook',
  ia_assistente: 'Assistentes de IA',
  direto: 'Acesso direto',
  outro: 'Outros sites',
  desconhecido: 'Código sem clique',
  nao_atribuido: 'Não atribuído',
};
export const CANAIS_PAGOS = ['google_ads', 'meta_ads'];

export const ETAPAS: { ord: number; chave: string; rotulo: string }[] = [
  { ord: 1, chave: 'contato', rotulo: 'Conversa' },
  { ord: 2, chave: 'identificado', rotulo: 'Contato identificado' },
  // Etapa 3 = conversa com intenção de contratar (análise da noite ou fato:
  // pediu/agendou). Não é "lead qualificado": ninguém avalia a qualidade.
  { ord: 3, chave: 'qualificado', rotulo: 'Intenção de contratar' },
  { ord: 4, chave: 'agendamento_solicitado', rotulo: 'Agendamento solicitado' },
  { ord: 5, chave: 'agendado', rotulo: 'Agendamento confirmado' },
  { ord: 6, chave: 'atendido', rotulo: 'Atendimento realizado' },
  { ord: 7, chave: 'pago', rotulo: 'Pagamento recebido' },
];

export type Intencao =
  | 'contratar'
  | 'paciente'
  | 'sem_demanda'
  | 'nao_analisada';
export const INTENCOES: Record<Intencao, string> = {
  contratar: 'Intenção de contratar',
  paciente: 'Paciente em atendimento',
  sem_demanda: 'Sem demanda comercial',
  nao_analisada: 'Ainda não analisada',
};
export const INTENCOES_DETALHE: Record<Intencao, string> = {
  contratar: 'perguntou valor/horário, lead quente ou já pediu/agendou',
  paciente: 'família já atendida: remarcar, cancelar, pagar, nota',
  sem_demanda: 'fornecedor, saudação sem pedido, outros assuntos',
  nao_analisada: 'a análise roda de madrugada; conversa do dia entra amanhã',
};

export const ESTADOS: Record<string, string> = {
  aberta: 'Em aberto',
  agendada: 'Agendada',
  convertida: 'Convertida',
  perdida: 'Perdida',
  descartada: 'Descartada',
};

export const MOTIVOS_PERDA: Record<string, string> = {
  sem_agendamento: 'Não agendou (30 dias sem avanço)',
  cancelou: 'Cancelou',
  faltou: 'Faltou',
  ja_paciente: 'Já era paciente em tratamento',
  nao_comercial: 'Contato não comercial',
  preco: 'Preço',
  sem_horario: 'Sem horário',
  localizacao: 'Localização',
  convenio: 'Convênio',
  desistiu: 'Desistiu',
  outro: 'Outro',
};

export const ORIGENS: Record<string, string> = {
  site_completa: 'Código + clique do site',
  site_recuperada: 'Código sem registro do clique',
  pendente: 'Buscando o clique',
  declarada: 'Declarada pela equipe',
  nao_atribuida: 'Sem origem',
  sem_vinculo: 'Sem oportunidade ligada',
};

export const rotuloCanal = (c: string | null | undefined) =>
  c ? (CANAIS[c] ?? c) : '—';

// ── Formatação ───────────────────────────────────────────────────────
const brlFmt = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});
export const brl = (v: number | null | undefined) =>
  v == null ? '—' : brlFmt.format(v);
export const num = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('pt-BR');
export const pct = (v: number | null | undefined, casas = 1) =>
  v == null || !isFinite(v)
    ? '—'
    : `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: casas })}%`;
export const vezes = (v: number | null | undefined) =>
  v == null || !isFinite(v)
    ? '—'
    : `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;

const mesFmt = new Intl.DateTimeFormat('pt-BR', {
  month: 'short',
  year: '2-digit',
  timeZone: 'UTC',
});
export const rotuloMes = (ym: string) =>
  mesFmt.format(new Date(`${ym}-01T12:00:00Z`)).replace('.', '');

const dataHoraFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});
export const dataHora = (iso: string | null | undefined) =>
  iso ? dataHoraFmt.format(new Date(iso)) : '—';
const dataFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  timeZone: 'America/Sao_Paulo',
});
export const data = (iso: string | null | undefined) =>
  iso ? dataFmt.format(new Date(iso)) : '—';

/** YYYY-MM de um timestamp, no fuso de Brasília. */
const ymFmt = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  timeZone: 'America/Sao_Paulo',
});
export const anoMes = (iso: string) => ymFmt.format(new Date(iso)).slice(0, 7);

export function mesesEntre(inicio: string, fim: string): string[] {
  const out: string[] = [];
  let [a, m] = inicio.split('-').map(Number);
  const [af, mf] = fim.split('-').map(Number);
  while (a < af || (a === af && m <= mf)) {
    out.push(`${a}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      a += 1;
    }
  }
  return out;
}

const n = (v: unknown) => (v == null ? 0 : Number(v));
const nOuNull = (v: unknown) => (v == null ? null : Number(v));

// ── Carga ────────────────────────────────────────────────────────────
export async function carregarPainel(): Promise<DadosPainel> {
  // O rastreamento começou em out/2026: o volume é pequeno, carrega tudo uma
  // vez e filtra no navegador (todas as abas usam o mesmo recorte).
  const [camp, aq, op, cli, cus] = await Promise.all([
    supabase.from('vw_atrib_campanhas_mensal').select('*'),
    supabase
      .from('vw_atrib_aquisicoes')
      .select(
        'paciente_id,aquisicao_em,mes,mes_origem,periodo_rastreado,oportunidade_id,tipo_vinculo,confianca,canal,plataforma,campanha_id,campanha_nome,tipo_origem,familia_nova,receita_primeira_sessao,receita_30d,receita_90d,receita_180d,ltv_realizado,ltv_familia_realizado,sessoes_30d,sessoes_90d,sessoes_180d,sessoes_total,dias_desde_aquisicao,servico'
      )
      .eq('periodo_rastreado', true),
    supabase
      .from('vw_atrib_oportunidades_painel')
      .select('*')
      .order('aberta_em', { ascending: false }),
    supabase
      .from('atrib_cliques_whatsapp_diarios')
      .select('dia,canal,campanha_id,campanha_nome,cliques'),
    supabase
      .from('vw_atrib_custos_status')
      .select('*')
      .eq('plataforma', 'google_ads')
      .maybeSingle(),
  ]);
  for (const r of [camp, aq, op, cli, cus])
    if (r.error) throw new Error(r.error.message);

  return {
    campanhas: (camp.data ?? []).map((r) => ({
      ...r,
      investimento: nOuNull(r.investimento),
      impressoes: nOuNull(r.impressoes),
      cliques_anuncio: nOuNull(r.cliques_anuncio),
      cliques_whatsapp: nOuNull(r.cliques_whatsapp),
      conversas_com_codigo: n(r.conversas_com_codigo),
      agendaram: n(r.agendaram),
      mes: String(r.mes).slice(0, 7),
    })) as CampanhaMes[],
    aquisicoes: (aq.data ?? []).map((r) => ({
      ...r,
      mes: String(r.mes).slice(0, 7),
      mes_origem: r.mes_origem ? String(r.mes_origem).slice(0, 7) : null,
      receita_primeira_sessao: n(r.receita_primeira_sessao),
      receita_30d: n(r.receita_30d),
      receita_90d: n(r.receita_90d),
      receita_180d: n(r.receita_180d),
      ltv_realizado: n(r.ltv_realizado),
      ltv_familia_realizado: nOuNull(r.ltv_familia_realizado),
      sessoes_30d: n(r.sessoes_30d),
      sessoes_90d: n(r.sessoes_90d),
      sessoes_180d: n(r.sessoes_180d),
      sessoes_total: n(r.sessoes_total),
      dias_desde_aquisicao: n(r.dias_desde_aquisicao),
    })) as Aquisicao[],
    oportunidades: (op.data ?? []).map((r) => ({
      ...r,
      etapa_maxima_ord: n(r.etapa_maxima_ord),
      n_toques: n(r.n_toques),
      agendamentos: n(r.agendamentos),
      receita_vinculada: n(r.receita_vinculada),
    })) as OportunidadePainel[],
    cliques: (cli.data ?? []).map((r) => ({
      ...r,
      cliques: n(r.cliques),
    })) as CliqueDia[],
    custos: (cus.data as CustosStatus | null) ?? null,
    carregadoEm: new Date(),
  };
}

// ── Recorte único (todas as abas usam este) ──────────────────────────
export interface Recorte {
  filtros: Filtros;
  meses: string[];
  campanhas: CampanhaMes[];
  aquisicoes: Aquisicao[];
  oportunidades: OportunidadePainel[];
  cliques: CliqueDia[];
  custos: CustosStatus | null;
}

const noPeriodo = (ym: string | null | undefined, f: Filtros) =>
  !!ym && ym >= f.mesInicio && ym <= f.mesFim;
export const mesCoorte = (a: Aquisicao) => a.mes_origem ?? a.mes;

export function recortar(d: DadosPainel, f: Filtros): Recorte {
  const canalOk = (c: string | null | undefined) =>
    f.canal === 'todos' || c === f.canal;
  const campOk = (c: string | null | undefined) =>
    f.campanha === 'todas' || c === f.campanha;
  const servOk = (s: string | null | undefined) =>
    f.servico === 'todos' || s === f.servico;
  return {
    filtros: f,
    meses: mesesEntre(f.mesInicio, f.mesFim),
    campanhas: d.campanhas.filter(
      (c) =>
        noPeriodo(c.mes, f) &&
        (f.canal === 'todos' || c.plataforma === f.canal) &&
        campOk(c.campanha_id)
    ),
    aquisicoes: d.aquisicoes.filter(
      (a) =>
        noPeriodo(mesCoorte(a), f) &&
        canalOk(a.canal) &&
        campOk(a.campanha_id) &&
        servOk(a.servico)
    ),
    oportunidades: d.oportunidades.filter(
      (o) =>
        noPeriodo(anoMes(o.aberta_em), f) &&
        canalOk(o.canal) &&
        campOk(o.campanha_id)
    ),
    cliques: d.cliques.filter(
      (c) =>
        noPeriodo(c.dia.slice(0, 7), f) &&
        canalOk(c.canal) &&
        campOk(c.campanha_id || null)
    ),
    custos: d.custos,
  };
}

// ── Investimento e indicadores de mídia ──────────────────────────────
export interface Midia {
  investimento: Indicador;
  completo: boolean;
  novosPagos: number;
  cac: Indicador;
  custoPorAgendamento: Indicador;
  roas: Record<'r1' | 'r30' | 'r90' | 'r180', Indicador>;
}

function motivoSemCusto(r: Recorte): string {
  if (r.filtros.canal !== 'todos' && !CANAIS_PAGOS.includes(r.filtros.canal))
    return 'Canal sem investimento em mídia.';
  if (!r.custos?.ultima_importacao)
    return 'Custos do Google Ads ainda não importados (script não instalado ou sem execução).';
  return 'Sem campanha paga com custo no período.';
}

export function calcularMidia(r: Recorte): Midia {
  const pagas = r.campanhas.filter(
    (c) => c.plataforma && CANAIS_PAGOS.includes(c.plataforma)
  );
  const comCusto = pagas.filter((c) => c.investimento != null);
  const inv = comCusto.reduce((s, c) => s + (c.investimento ?? 0), 0);
  const incompletas = pagas.filter((c) => c.custo_status !== 'completo');
  const completo = pagas.length > 0 && incompletas.length === 0;
  const aqPagas = r.aquisicoes.filter(
    (a) => a.plataforma && CANAIS_PAGOS.includes(a.plataforma)
  );
  const novosPagos = aqPagas.length;
  const agendaram = pagas.reduce((s, c) => s + c.agendaram, 0);

  let motivo: string | undefined;
  if (pagas.length === 0) motivo = motivoSemCusto(r);
  else if (!completo) {
    const tipos = new Set(incompletas.map((c) => c.custo_status));
    motivo = tipos.has('sem_dados')
      ? 'Há campanha paga sem custo importado no período.'
      : r.custos?.desatualizado
        ? 'Importação de custos parada há mais de 36 h.'
        : 'Custo do período ainda não está completo (importação não cobre o fim do mês).';
  } else if (r.filtros.servico !== 'todos')
    motivo = 'O investimento não se divide por serviço.';

  const investimento: Indicador =
    pagas.length === 0
      ? { valor: null, motivo }
      : {
          valor: comCusto.length ? inv : null,
          aviso: completo ? undefined : motivo,
          motivo: comCusto.length ? undefined : motivo,
        };

  const indisponivel = (m?: string): Indicador => ({ valor: null, motivo: m });
  const podeCalcular = completo && r.filtros.servico === 'todos';
  const cac: Indicador = !podeCalcular
    ? indisponivel(motivo)
    : novosPagos === 0
      ? indisponivel(
          `Nenhum paciente novo atribuído à mídia paga: ${brl(inv)} investidos sem paciente atribuído.`
        )
      : { valor: inv / novosPagos };
  const custoPorAgendamento: Indicador = !podeCalcular
    ? indisponivel(motivo)
    : agendaram === 0
      ? indisponivel('Nenhuma conversa de campanha paga chegou a agendar.')
      : { valor: inv / agendaram };

  const roasDe = (
    campo:
      | 'receita_primeira_sessao'
      | 'receita_30d'
      | 'receita_90d'
      | 'receita_180d',
    dias: number
  ): Indicador => {
    if (!podeCalcular) return indisponivel(motivo);
    if (inv === 0) return indisponivel('Investimento zero no período.');
    const receita = aqPagas.reduce((s, a) => s + a[campo], 0);
    const imaturos =
      dias > 0
        ? aqPagas.filter((a) => a.dias_desde_aquisicao < dias).length
        : 0;
    return {
      valor: receita / inv,
      aviso:
        imaturos > 0
          ? `${imaturos} de ${novosPagos} pacientes ainda não completaram ${dias} dias (coorte em maturação).`
          : undefined,
    };
  };

  return {
    investimento,
    completo,
    novosPagos,
    cac,
    custoPorAgendamento,
    roas: {
      r1: roasDe('receita_primeira_sessao', 0),
      r30: roasDe('receita_30d', 30),
      r90: roasDe('receita_90d', 90),
      r180: roasDe('receita_180d', 180),
    },
  };
}

// ── Funil ────────────────────────────────────────────────────────────
export interface EtapaFunil {
  rotulo: string;
  quantidade: number;
  taxa: number | null; // sobre a etapa anterior
}

export function calcularFunil(r: Recorte): EtapaFunil[] {
  const ops = r.oportunidades;
  let anterior: number | null = null;
  return ETAPAS.filter((e) => e.ord !== 2).map((e) => {
    const q = ops.filter((o) =>
      e.ord === 3
        ? o.intencao === 'contratar' || o.etapa_maxima_ord >= 3
        : o.etapa_maxima_ord >= e.ord
    ).length;
    const taxa = anterior == null || anterior === 0 ? null : q / anterior;
    anterior = q;
    return { rotulo: e.rotulo, quantidade: q, taxa };
  });
}

// ── Tamanho e cobertura da amostra ───────────────────────────────────
// Abaixo disso o painel avisa que comparar canais/campanhas não é conclusivo.
// Limiares de bom senso (não estatísticos); ajuste aqui se o dono decidir.
export const AMOSTRA_MIN_PACIENTES = 30;
export const AMOSTRA_MIN_COBERTURA = 0.7;

export function lerAmostra(r: Recorte) {
  const comerciais = r.oportunidades.filter((o) => o.intencao === 'contratar');
  const comOrigem = comerciais.filter(
    (o) => o.tipo_origem !== 'nao_atribuida'
  ).length;
  const novos = r.aquisicoes.length;
  const ligados = r.aquisicoes.filter(
    (a) => a.tipo_vinculo !== 'sem_vinculo'
  ).length;
  const coberturaOrigem = comerciais.length
    ? comOrigem / comerciais.length
    : null;
  const coberturaPacientes = novos ? ligados / novos : null;
  return {
    conversas: r.oportunidades.length,
    comerciais: comerciais.length,
    comOrigem,
    coberturaOrigem,
    novos,
    ligados,
    coberturaPacientes,
    suficiente:
      novos >= AMOSTRA_MIN_PACIENTES &&
      (coberturaOrigem ?? 0) >= AMOSTRA_MIN_COBERTURA &&
      (coberturaPacientes ?? 0) >= AMOSTRA_MIN_COBERTURA,
  };
}

export function topoDoSite(r: Recorte) {
  const cliques = r.cliques.reduce((s, c) => s + c.cliques, 0);
  const comCodigo = r.oportunidades.filter((o) =>
    ['site_completa', 'site_recuperada', 'pendente'].includes(o.tipo_origem)
  ).length;
  return {
    cliques,
    comCodigo,
    taxaVinculacao: cliques > 0 ? comCodigo / cliques : null,
  };
}

export function contarPor<T>(
  itens: T[],
  chave: (i: T) => string | null | undefined
) {
  const m = new Map<string, number>();
  for (const i of itens) {
    const k = chave(i) ?? '—';
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

// ── Campanhas ────────────────────────────────────────────────────────
export interface LinhaCampanha {
  campanha_id: string;
  nome: string;
  plataforma: string | null;
  custoStatus: CustoStatus;
  investimento: number | null;
  impressoes: number | null;
  cliquesAnuncio: number | null;
  conversas: number;
  agendaram: number;
  novos: number;
  familiasNovas: number;
  cac: Indicador;
  roas: Record<'r1' | 'r30' | 'r90' | 'r180', Indicador>;
}

const ordemStatus: CustoStatus[] = [
  'sem_dados',
  'desatualizado',
  'completo',
  'nao_se_aplica',
];

export function linhasCampanha(r: Recorte): LinhaCampanha[] {
  const ids = new Set<string>();
  r.campanhas.forEach((c) => c.campanha_id && ids.add(c.campanha_id));
  r.aquisicoes.forEach((a) => a.campanha_id && ids.add(a.campanha_id));
  r.oportunidades.forEach((o) => o.campanha_id && ids.add(o.campanha_id));

  return [...ids]
    .map((id) => {
      const cs = r.campanhas.filter((c) => c.campanha_id === id);
      const aqs = r.aquisicoes.filter((a) => a.campanha_id === id);
      const ops = r.oportunidades.filter((o) => o.campanha_id === id);
      const plataforma =
        cs[0]?.plataforma ?? aqs[0]?.plataforma ?? ops[0]?.plataforma ?? null;
      const status: CustoStatus = !plataforma
        ? 'nao_se_aplica'
        : cs.length === 0
          ? 'sem_dados'
          : (ordemStatus.find((s) => cs.some((c) => c.custo_status === s)) ??
            'sem_dados');
      const temNulo = cs.length === 0 || cs.some((c) => c.investimento == null);
      const inv = temNulo
        ? null
        : cs.reduce((s, c) => s + (c.investimento ?? 0), 0);
      const pode =
        status === 'completo' && inv != null && r.filtros.servico === 'todos';
      const motivo = !plataforma
        ? 'Origem sem investimento.'
        : status === 'sem_dados'
          ? 'Custo não importado.'
          : status === 'desatualizado'
            ? 'Custo desatualizado.'
            : r.filtros.servico !== 'todos'
              ? 'O investimento não se divide por serviço.'
              : undefined;
      const roasDe = (
        campo:
          | 'receita_primeira_sessao'
          | 'receita_30d'
          | 'receita_90d'
          | 'receita_180d',
        dias: number
      ): Indicador => {
        if (!pode) return { valor: null, motivo };
        if (!inv) return { valor: null, motivo: 'Investimento zero.' };
        const imaturos = dias
          ? aqs.filter((a) => a.dias_desde_aquisicao < dias).length
          : 0;
        return {
          valor: aqs.reduce((s, a) => s + a[campo], 0) / inv,
          aviso: imaturos
            ? `Coorte em maturação (${imaturos} de ${aqs.length} com menos de ${dias} dias).`
            : undefined,
        };
      };
      return {
        campanha_id: id,
        nome:
          cs.find((c) => c.campanha_nome)?.campanha_nome ??
          aqs.find((a) => a.campanha_nome)?.campanha_nome ??
          ops.find((o) => o.campanha_nome)?.campanha_nome ??
          id,
        plataforma,
        custoStatus: status,
        investimento: inv,
        impressoes: cs.some((c) => c.impressoes != null)
          ? cs.reduce((s, c) => s + (c.impressoes ?? 0), 0)
          : null,
        cliquesAnuncio: cs.some((c) => c.cliques_anuncio != null)
          ? cs.reduce((s, c) => s + (c.cliques_anuncio ?? 0), 0)
          : null,
        conversas: ops.length,
        agendaram: ops.filter((o) => o.etapa_maxima_ord >= 5).length,
        novos: aqs.length,
        familiasNovas: aqs.filter((a) => a.familia_nova).length,
        cac: !pode
          ? { valor: null, motivo }
          : aqs.length
            ? { valor: (inv ?? 0) / aqs.length }
            : { valor: null, motivo: 'Nenhum paciente novo atribuído.' },
        roas: {
          r1: roasDe('receita_primeira_sessao', 0),
          r30: roasDe('receita_30d', 30),
          r90: roasDe('receita_90d', 90),
          r180: roasDe('receita_180d', 180),
        },
      };
    })
    .sort(
      (a, b) =>
        (b.investimento ?? -1) - (a.investimento ?? -1) ||
        b.conversas - a.conversas
    );
}

/** Origens sem investimento (orgânico, direto…), para comparar com as pagas. */
export function linhasCanal(r: Recorte) {
  const canais = new Set<string>([
    ...r.oportunidades.map((o) => o.canal),
    ...r.aquisicoes.map((a) => a.canal),
  ]);
  return [...canais]
    .map((c) => {
      const ops = r.oportunidades.filter((o) => o.canal === c);
      const aqs = r.aquisicoes.filter((a) => a.canal === c);
      return {
        canal: c,
        conversas: ops.length,
        agendaram: ops.filter((o) => o.etapa_maxima_ord >= 5).length,
        novos: aqs.length,
        receita90: aqs.reduce((s, a) => s + a.receita_90d, 0),
        receitaTotal: aqs.reduce((s, a) => s + a.ltv_realizado, 0),
      };
    })
    .sort((a, b) => b.novos - a.novos || b.conversas - a.conversas);
}

// ── Coortes ──────────────────────────────────────────────────────────
export interface LinhaCoorte {
  mes: string;
  novos: number;
  receita1: number;
  r30: Indicador;
  r90: Indicador;
  r180: Indicador;
  ltvMedio: number | null;
  ltvFamiliaMedio: number | null;
  familiasNovas: number;
  sessoesMedias: number | null;
  retorno30: Indicador;
  retorno90: Indicador;
  retorno180: Indicador;
}

export function linhasCoorte(r: Recorte): LinhaCoorte[] {
  return r.meses
    .map((mes) => {
      const aqs = r.aquisicoes.filter((a) => mesCoorte(a) === mes);
      const fam = aqs.filter(
        (a) => a.familia_nova && a.ltv_familia_realizado != null
      );
      const horizonte = (
        campo: 'receita_30d' | 'receita_90d' | 'receita_180d',
        dias: number
      ): Indicador => {
        if (!aqs.length) return { valor: null, motivo: 'Sem pacientes novos.' };
        const imaturos = aqs.filter(
          (a) => a.dias_desde_aquisicao < dias
        ).length;
        return {
          valor: aqs.reduce((s, a) => s + a[campo], 0),
          aviso: imaturos
            ? `Parcial: ${imaturos} de ${aqs.length} ainda não completaram ${dias} dias.`
            : undefined,
        };
      };
      const retorno = (
        campo: 'sessoes_30d' | 'sessoes_90d' | 'sessoes_180d',
        dias: number
      ): Indicador => {
        const maduros = aqs.filter((a) => a.dias_desde_aquisicao >= dias);
        if (!maduros.length)
          return {
            valor: null,
            motivo: aqs.length
              ? `Nenhum paciente completou ${dias} dias ainda.`
              : 'Sem pacientes novos.',
          };
        return {
          valor: maduros.filter((a) => a[campo] > 1).length / maduros.length,
          aviso:
            maduros.length < aqs.length
              ? `Só os ${maduros.length} que já completaram ${dias} dias.`
              : undefined,
        };
      };
      return {
        mes,
        novos: aqs.length,
        receita1: aqs.reduce((s, a) => s + a.receita_primeira_sessao, 0),
        r30: horizonte('receita_30d', 30),
        r90: horizonte('receita_90d', 90),
        r180: horizonte('receita_180d', 180),
        ltvMedio: aqs.length
          ? aqs.reduce((s, a) => s + a.ltv_realizado, 0) / aqs.length
          : null,
        ltvFamiliaMedio: fam.length
          ? fam.reduce((s, a) => s + (a.ltv_familia_realizado ?? 0), 0) /
            fam.length
          : null,
        familiasNovas: aqs.filter((a) => a.familia_nova).length,
        sessoesMedias: aqs.length
          ? aqs.reduce((s, a) => s + a.sessoes_total, 0) / aqs.length
          : null,
        retorno30: retorno('sessoes_30d', 30),
        retorno90: retorno('sessoes_90d', 90),
        retorno180: retorno('sessoes_180d', 180),
      };
    })
    .reverse();
}

// ── Jornada e qualidade (RPCs) ───────────────────────────────────────
export interface Jornada {
  oportunidade: {
    id: number;
    aberta_em: string;
    motivo_abertura: string;
    contato_novo: boolean;
    etapa_atual: string;
    etapa_maxima: string;
    estado: string;
    estado_em: string | null;
    motivo_perda: string | null;
    motivo_fonte: string | null;
    motivo_evidencia: string | null;
    contato: string | null;
  };
  toques: {
    ref: string | null;
    origem_tipo: string;
    canal: string;
    plataforma: string | null;
    campanha_id: string | null;
    campanha_nome: string | null;
    palavra_chave_segmentacao: string | null;
    pagina: string | null;
    clicado_em: string | null;
    mensagem_em: string | null;
    clique_status: string;
  }[];
  eventos: {
    tipo: string;
    de: string | null;
    para: string | null;
    fonte: string;
    evidencia: string | null;
    ocorrido_em: string;
  }[];
  agendamentos: {
    agendamento_id: string;
    paciente_id: string;
    crianca: string;
    tipo_paciente: string | null;
    servico: string | null;
    data_hora: string;
    criado_em: string;
    status_consulta: string | null;
    situacao_receita: string | null;
    receita: number | null;
    recebida_em: string | null;
    tipo_vinculo: string;
    confianca: string;
  }[];
}

export async function carregarJornada(id: number): Promise<Jornada | null> {
  const { data: d, error } = await supabase.rpc('fn_atrib_jornada', {
    p_oportunidade: id,
  });
  if (error) throw new Error(error.message);
  return d as Jornada | null;
}

export interface Qualidade {
  gerado_em: string;
  receita_atualizada_em: string | null;
  oportunidades_processadas_em: string | null;
  jobs:
    | {
        job: string;
        status: string | null;
        em: string | null;
        mensagem: string | null;
      }[]
    | null;
  custos: CustosStatus | null;
  origem_90d: Record<string, number>;
  agendamentos_90d: {
    novos_pacientes: number;
    com_oportunidade: number;
    vinculo_alto: number;
    vinculo_provavel: number;
    sem_vinculo: number;
  };
  /** Paciente novo com consulta passada ainda sem "finalizado". */
  aguardando_baixa: { pacientes: number; ligados_a_conversa: number };
  faturas:
    | {
        mes: string;
        faturas: number;
        valor_faturas: number;
        receita_rateada: number;
        diferenca: number;
      }[]
    | null;
  pendencias: {
    toques_sem_clique: number;
    erros_7d: number;
    sessoes_a_conciliar_90d: number;
  };
  coortes: {
    menos_30d: number;
    de_30_a_89d: number;
    de_90_a_179d: number;
    mais_180d: number;
  };
  inicio_rastreamento: string;
}

export async function carregarQualidade(): Promise<Qualidade> {
  const { data: d, error } = await supabase.rpc('fn_atrib_painel_qualidade');
  if (error) throw new Error(error.message);
  return d as Qualidade;
}
