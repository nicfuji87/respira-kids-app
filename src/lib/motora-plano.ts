// Plano terapêutico e histórico motor (formato 1.3): idade, último registro
// de cada habilidade, sugestões, valor dos objetivos, séries dos gráficos.
//
// Regra de ouro: campo vazio nunca vira zero. Toda função aqui devolve
// undefined quando o dado não foi registrado.
//
// Datas sempre 'YYYY-MM-DD' de parede (nunca Date + toISOString).

import { supabase } from '@/lib/supabase';
import {
  HABILIDADE_POR_ID,
  HABILIDADES,
  MEDIDAS_INDICADOR,
  OBJETIVOS_CATALOGO,
  OBJETIVO_CATALOGO_POR_ID,
  type ObjetivoCatalogo,
  ROTULO_ESTADO,
  UNIDADE_METRICA,
  ASSISTENCIAS,
  CONSISTENCIAS,
  CONTROLES,
  SIMETRIAS,
  TRANSFERENCIAS,
  PARTICIPACOES_HABILIDADE,
  type EstadoHabilidade,
  type IndicadorObjetivo,
  type LadoHabilidade,
  type MetricaHabilidade,
  type NivelAssistencia,
} from '@/lib/motora-catalogo';
import type {
  AreaMotora,
  TipoMedidaMotora,
  EvolucaoMotoraAssimetria,
  IdadeSessao,
  MetricasHabilidade,
  ObjetivoSessao,
  RegistroHabilidade,
} from '@/types/evolucao-clinica';

// ------------------------------------------------------------------ tipos

export interface EvolucaoHistorico {
  // null nas entradas que vêm de uma avaliação
  agendamento_id: string | null;
  avaliacao_id?: string;
  fonte?: 'evolucao' | 'avaliacao';
  tipo_avaliacao?: 'inicial' | 'reavaliacao';
  data: string;
  profissional: string | null;
  versao: string | null;
  areas: AreaMotora[] | null;
  habilidades: RegistroHabilidade[] | null;
  objetivos_sessao: ObjetivoSessao[] | null;
}

export interface MedidaHistorico {
  tipo: string;
  data: string;
  valores: Record<string, unknown> | null;
  fonte: 'evolucao' | 'avaliacao';
}

export interface AvaliacaoHistorico {
  id: string;
  data: string;
  tipo: 'inicial' | 'reavaliacao';
  status: string;
}

export interface HistoricoMotor {
  data_nascimento: string | null;
  idade_gestacional_semanas: number | null;
  /** Evoluções e avaliações com habilidades, em ordem de data */
  evolucoes: EvolucaoHistorico[];
  medidas: MedidaHistorico[];
  avaliacoes?: AvaliacaoHistorico[];
}

export type StatusObjetivo = 'ativo' | 'atingido' | 'suspenso' | 'encerrado';

export interface ObjetivoMotor {
  id: string;
  paciente_id: string;
  descricao: string;
  areas: AreaMotora[];
  indicador: IndicadorObjetivo | null;
  valor_inicial: number | null;
  meta: number | null;
  meta_texto: string | null;
  status: StatusObjetivo;
  motivo_status: string | null;
  origem: 'evolucao' | 'avaliacao' | 'plano';
  criado_em: string;
  atualizado_em: string;
  encerrado_em: string | null;
}

export const ROTULO_STATUS_OBJETIVO: Record<StatusObjetivo, string> = {
  ativo: 'Ativo',
  atingido: 'Atingido',
  suspenso: 'Suspenso',
  encerrado: 'Encerrado',
};

const ehNumero = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

// ------------------------------------------------------------------ datas

const diasUTC = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Math.floor(Date.UTC(a, m - 1, d) / 86400000);
};

export const dataCurta = (iso: string | null | undefined) => {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};

/** Meses e dias de calendário entre duas datas (de parede) */
function mesesEDias(de: string, ate: string): { meses: number; dias: number } {
  const [a1, m1, d1] = de.slice(0, 10).split('-').map(Number);
  const [a2, m2, d2] = ate.slice(0, 10).split('-').map(Number);
  let meses = (a2 - a1) * 12 + (m2 - m1);
  if (d2 < d1) meses--;
  // dia em que completou os meses (sem passar do fim do mês)
  const alvoAno = a1 + Math.floor((m1 - 1 + meses) / 12);
  const alvoMes = (((m1 - 1 + meses) % 12) + 12) % 12;
  const ultimoDia = new Date(Date.UTC(alvoAno, alvoMes + 1, 0)).getUTCDate();
  const marco = Math.floor(
    Date.UTC(alvoAno, alvoMes, Math.min(d1, ultimoDia)) / 86400000
  );
  return { meses, dias: diasUTC(ate) - marco };
}

const somarDiasISO = (iso: string, dias: number) => {
  const t = new Date((diasUTC(iso) + dias) * 86400000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`;
};

function textoIdade(de: string, ate: string): string {
  const total = diasUTC(ate) - diasUTC(de);
  if (total < 31) return `${total} ${total === 1 ? 'dia' : 'dias'}`;
  const { meses, dias } = mesesEDias(de, ate);
  if (meses < 24)
    return dias > 0
      ? `${meses} ${meses === 1 ? 'mês' : 'meses'} e ${dias} ${dias === 1 ? 'dia' : 'dias'}`
      : `${meses} ${meses === 1 ? 'mês' : 'meses'}`;
  const anos = Math.floor(meses / 12);
  const m = meses % 12;
  return m > 0
    ? `${anos} ${anos === 1 ? 'ano' : 'anos'} e ${m} ${m === 1 ? 'mês' : 'meses'}`
    : `${anos} ${anos === 1 ? 'ano' : 'anos'}`;
}

/**
 * Idade no dia da sessão. A corrigida só é calculada com idade gestacional
 * registrada abaixo de 37 semanas (até 24 meses). Sem a idade gestacional,
 * não presume que nasceu a termo: avisa que não foi possível calcular.
 */
export function calcularIdade(
  dataNascimento: string | null | undefined,
  idadeGestacionalSemanas: number | null | undefined,
  dataSessao: string
): (IdadeSessao & { meses_para_sugestao: number }) | null {
  if (!dataNascimento || !dataSessao) return null;
  if (diasUTC(dataSessao) < diasUTC(dataNascimento)) return null;
  const meses = mesesEDias(dataNascimento, dataSessao).meses;
  const base = {
    cronologica_meses: meses,
    cronologica_texto: textoIdade(dataNascimento, dataSessao),
    meses_para_sugestao: meses,
  };
  const ig = idadeGestacionalSemanas;
  if (!ehNumero(ig))
    return {
      ...base,
      observacao:
        'Idade gestacional não registrada: idade corrigida não calculada.',
    };
  if (ig >= 37)
    return { ...base, observacao: `Nascido a termo (${ig} semanas).` };
  if (meses >= 24)
    return {
      ...base,
      observacao: `Prematuro (${ig} semanas); acima de 24 meses usa-se a idade cronológica.`,
    };
  // Data em que completaria 40 semanas de gestação
  const termo = somarDiasISO(dataNascimento, Math.round((40 - ig) * 7));
  if (diasUTC(dataSessao) < diasUTC(termo))
    return {
      ...base,
      corrigida_texto: 'antes do termo corrigido',
      observacao: `Prematuro (${ig} semanas).`,
      meses_para_sugestao: 0,
    };
  return {
    ...base,
    corrigida_texto: textoIdade(termo, dataSessao),
    observacao: `Prematuro (${ig} semanas).`,
    meses_para_sugestao: mesesEDias(termo, dataSessao).meses,
  };
}

// ------------------------------------------------------------- habilidades

export const chaveRegistro = (r: {
  habilidade: string;
  lado?: LadoHabilidade;
}) => (r.lado ? `${r.habilidade}@${r.lado}` : r.habilidade);

export const nomeHabilidade = (id: string) => HABILIDADE_POR_ID[id]?.nome ?? id;

const ROTULO_LADO: Record<LadoHabilidade, string> = {
  direito: 'à direita',
  esquerdo: 'à esquerda',
  ambos: 'bilateral',
};

export const nomeRegistro = (r: {
  habilidade: string;
  lado?: LadoHabilidade;
}) =>
  r.lado && r.lado !== 'ambos'
    ? `${nomeHabilidade(r.habilidade)} (${ROTULO_LADO[r.lado]})`
    : nomeHabilidade(r.habilidade);

export interface UltimoRegistro {
  data: string;
  registro: RegistroHabilidade;
}

/**
 * Último registro de cada habilidade (por chave habilidade@lado), ignorando
 * a sessão atual e o "não observado hoje".
 */
export function ultimosRegistros(
  evolucoes: EvolucaoHistorico[],
  excluirAgendamentoId?: string,
  ateData?: string,
  excluirAvaliacaoId?: string
): Map<string, UltimoRegistro> {
  const mapa = new Map<string, UltimoRegistro>();
  const ordenadas = [...evolucoes].sort((a, b) => a.data.localeCompare(b.data));
  for (const ev of ordenadas) {
    if (excluirAgendamentoId && ev.agendamento_id === excluirAgendamentoId)
      continue;
    if (excluirAvaliacaoId && ev.avaliacao_id === excluirAvaliacaoId) continue;
    if (ateData && ev.data > ateData) continue;
    for (const r of ev.habilidades || []) {
      if (!r?.habilidade || r.estado === 'nao_observado') continue;
      mapa.set(chaveRegistro(r), { data: ev.data, registro: r });
    }
  }
  return mapa;
}

/**
 * Registro da avaliação para a habilidade (registro zero): a avaliação
 * inicial mais antiga que registrou a habilidade; sem inicial, a primeira
 * reavaliação. Ignora "não observado".
 */
export function registroNaAvaliacao(
  evolucoes: EvolucaoHistorico[],
  chave: string
): UltimoRegistro | undefined {
  const avals = evolucoes
    .filter((e) => e.fonte === 'avaliacao')
    .sort(
      (a, b) =>
        (a.tipo_avaliacao === 'reavaliacao' ? 1 : 0) -
          (b.tipo_avaliacao === 'reavaliacao' ? 1 : 0) ||
        a.data.localeCompare(b.data)
    );
  for (const e of avals) {
    const r = (e.habilidades || []).find(
      (x) => chaveRegistro(x) === chave && x.estado !== 'nao_observado'
    );
    if (r) return { data: e.data, registro: r };
  }
  return undefined;
}

export interface ContextoRegistro {
  evolucoes: EvolucaoHistorico[];
  excluirAgendamentoId?: string;
  excluirAvaliacaoId?: string;
  ateData?: string;
}

/**
 * Compara um registro com o histórico: copia o último registro e, quando é
 * outro, o da avaliação (registro zero). Usado ao abrir a habilidade e ao
 * trocar o lado.
 */
export function comComparacoes(
  r: RegistroHabilidade,
  ctx: ContextoRegistro
): RegistroHabilidade {
  const chave = chaveRegistro(r);
  const ult = ultimosRegistros(
    ctx.evolucoes,
    ctx.excluirAgendamentoId,
    ctx.ateData,
    ctx.excluirAvaliacaoId
  ).get(chave);
  const aval = registroNaAvaliacao(
    ctx.evolucoes.filter(
      (e) =>
        (!ctx.excluirAvaliacaoId ||
          e.avaliacao_id !== ctx.excluirAvaliacaoId) &&
        (!ctx.ateData || e.data <= ctx.ateData)
    ),
    chave
  );
  const novo: RegistroHabilidade = { ...r };
  delete novo.anterior;
  delete novo.avaliacao;
  const anterior = anteriorDe(ult);
  if (anterior) novo.anterior = anterior;
  // a avaliação só entra quando não é o próprio último registro
  if (
    aval &&
    !(ult && ult.data === aval.data && ult.registro === aval.registro)
  ) {
    const a = anteriorDe(aval);
    if (a) novo.avaliacao = a;
  }
  return novo;
}

/** Registro novo de uma habilidade, já com as comparações */
export function criarRegistro(
  habilidade: string,
  lado: LadoHabilidade | undefined,
  ctx: ContextoRegistro
): RegistroHabilidade | null {
  const hab = HABILIDADE_POR_ID[habilidade];
  if (!hab) return null;
  const l = lado ?? (hab.porLado ? 'ambos' : undefined);
  return comComparacoes(
    { habilidade, ...(l ? { lado: l } : {}), estado: 'nao_observado' },
    ctx
  );
}

/** Cópia do último registro para gravar junto do registro de hoje */
export function anteriorDe(
  u: UltimoRegistro | undefined
): RegistroHabilidade['anterior'] {
  if (!u) return undefined;
  const r = u.registro;
  const metricas = Object.fromEntries(
    Object.entries(r.metricas || {}).filter(([, v]) => ehNumero(v))
  ) as MetricasHabilidade;
  return {
    data: u.data,
    estado: r.estado,
    ...(r.assistencia ? { assistencia: r.assistencia } : {}),
    ...(Object.keys(metricas).length ? { metricas } : {}),
  };
}

/**
 * Habilidades a mostrar primeiro: as dos objetivos ativos, as já
 * acompanhadas e, por fim, as típicas da idade nas áreas trabalhadas.
 * Não decide nada: a fisio acrescenta ou ignora.
 */
export function habilidadesSugeridas(opts: {
  idadeMeses?: number;
  areas: AreaMotora[];
  objetivos: Pick<ObjetivoMotor, 'status' | 'indicador'>[];
  ultimos: Map<string, UltimoRegistro>;
  limiteIdade?: number;
}): string[] {
  const ids: string[] = [];
  const add = (id: string) => {
    if (HABILIDADE_POR_ID[id] && !ids.includes(id)) ids.push(id);
  };
  for (const o of opts.objetivos)
    if (o.status === 'ativo' && o.indicador?.tipo === 'habilidade')
      add(o.indicador.habilidade);
  const acompanhadas = [...opts.ultimos.values()].sort((a, b) =>
    b.data.localeCompare(a.data)
  );
  for (const u of acompanhadas) add(u.registro.habilidade);

  const idade = opts.idadeMeses;
  let porIdade = 0;
  const limite = opts.limiteIdade ?? 4;
  for (const h of HABILIDADES) {
    if (porIdade >= limite) break;
    const daArea = opts.areas.includes('desenvolvimento_motor')
      ? true
      : (h.areas || []).some((a) => opts.areas.includes(a));
    if (!daArea) continue;
    const naIdade =
      idade === undefined || (idade >= h.idade[0] - 1 && idade <= h.idade[1]);
    if (!naIdade) continue;
    if (!ids.includes(h.id)) {
      ids.push(h.id);
      porIdade++;
    }
  }
  return ids;
}

// ------------------------------------------------------- texto e números

const fmt = (n: number) =>
  n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

export const fmtValor = (v: number, unidade: string) =>
  unidade === '°' || unidade === '%'
    ? `${fmt(v)}${unidade}`
    : unidade
      ? `${fmt(v)} ${unidade}`
      : fmt(v);

/** "+20 s", "−3°", "sem mudança"; undefined se faltar um dos valores */
export function diferenca(
  atual: number | undefined,
  anterior: number | undefined,
  unidade: string
): string | undefined {
  if (!ehNumero(atual) || !ehNumero(anterior)) return undefined;
  const d = Math.round((atual - anterior) * 10) / 10;
  if (d === 0) return 'sem mudança';
  return `${d > 0 ? '+' : '−'}${fmtValor(Math.abs(d), unidade)}`;
}

/** "22 s · 4 tentativas · 3 bem-sucedidas" (só o que foi registrado) */
export function textoMetricasCurto(m: MetricasHabilidade | undefined): string {
  const partes: string[] = [];
  for (const [k, v] of Object.entries(m || {}) as [
    MetricaHabilidade,
    number,
  ][]) {
    if (!ehNumero(v)) continue;
    if (k === 'tentativas')
      partes.push(`${fmt(v)} ${v === 1 ? 'tentativa' : 'tentativas'}`);
    else if (k === 'sucessos')
      partes.push(`${fmt(v)} ${v === 1 ? 'bem-sucedida' : 'bem-sucedidas'}`);
    else if (k === 'passos')
      partes.push(`${fmt(v)} ${v === 1 ? 'passo' : 'passos'}`);
    else partes.push(fmtValor(v, UNIDADE_METRICA[k]));
  }
  return partes.join(' · ');
}

export const ROTULO_METRICA_PADRAO: Record<MetricaHabilidade, string> = {
  tempo_s: 'tempo',
  graus: 'amplitude',
  tentativas: 'tentativas',
  sucessos: 'execuções bem-sucedidas',
  distancia_cm: 'distância',
  passos: 'passos',
};

export function rotuloMetrica(habilidade: string, m: MetricaHabilidade) {
  return (
    HABILIDADE_POR_ID[habilidade]?.metricas.find((x) => x.id === m)?.rotulo ??
    ROTULO_METRICA_PADRAO[m]
  );
}

const rot = <T extends string>(lista: { id: T; rotulo: string }[], id?: T) =>
  id ? (lista.find((x) => x.id === id)?.rotulo ?? id) : undefined;

/** Uma linha de texto clínico para o registro de uma habilidade */
export function textoRegistroHabilidade(r: RegistroHabilidade): string {
  const partes: string[] = [];
  let estado = ROTULO_ESTADO[r.estado].toLowerCase();
  if (r.estado === 'com_assistencia' && r.assistencia)
    estado = `com assistência ${rot(ASSISTENCIAS, r.assistencia)!.toLowerCase()}`;
  partes.push(estado);
  if (r.consistencia)
    partes.push(rot(CONSISTENCIAS, r.consistencia)!.toLowerCase());

  for (const [m, v] of Object.entries(r.metricas || {}) as [
    MetricaHabilidade,
    number,
  ][]) {
    if (!ehNumero(v)) continue;
    const un = UNIDADE_METRICA[m];
    const antes = r.anterior?.metricas?.[m];
    const dif = diferenca(v, antes, un);
    let t = `${rotuloMetrica(r.habilidade, m).toLowerCase()} ${fmtValor(v, un)}`;
    if (ehNumero(antes) && r.anterior)
      t += ` (antes ${fmtValor(antes, un)} em ${dataCurta(r.anterior.data)}; ${dif})`;
    partes.push(t);
  }
  const qual = [
    r.controle && `controle ${rot(CONTROLES, r.controle)!.toLowerCase()}`,
    r.simetria && rot(SIMETRIAS, r.simetria)!.toLowerCase(),
    r.transferencia_peso &&
      `transferência de peso ${rot(TRANSFERENCIAS, r.transferencia_peso)!.toLowerCase()}`,
    r.participacao &&
      `participação ${rot(PARTICIPACOES_HABILIDADE, r.participacao)!.toLowerCase()}`,
  ].filter(Boolean) as string[];
  partes.push(...qual);
  if (
    r.anterior &&
    r.anterior.estado !== r.estado &&
    r.estado !== 'nao_observado'
  )
    partes.push(
      `antes: ${ROTULO_ESTADO[r.anterior.estado].toLowerCase()} em ${dataCurta(r.anterior.data)}`
    );
  if (r.avaliacao && r.estado !== 'nao_observado') {
    const m = textoMetricasCurto(r.avaliacao.metricas);
    partes.push(
      `na avaliação (${dataCurta(r.avaliacao.data)}): ${ROTULO_ESTADO[r.avaliacao.estado].toLowerCase()}${m ? `, ${m}` : ''}`
    );
  }
  let t = `${nomeRegistro(r)}: ${partes.join('; ')}`;
  if (r.observacao?.trim()) t += `. ${r.observacao.trim()}`;
  return t;
}

// ------------------------------------------------------------- indicadores

export function infoIndicador(ind: IndicadorObjetivo | null | undefined): {
  rotulo: string;
  unidade: string;
  numerico: boolean;
  direcao: 'aumentar' | 'reduzir';
} | null {
  if (!ind) return null;
  if (ind.tipo === 'medida') {
    const m = MEDIDAS_INDICADOR.find((x) => x.id === ind.medida);
    return {
      rotulo: m?.nome ?? ind.medida,
      unidade: m?.unidade ?? '',
      numerico: true,
      direcao: 'reduzir',
    };
  }
  const nome = nomeRegistro({ habilidade: ind.habilidade, lado: ind.lado });
  if (!ind.metrica)
    return { rotulo: nome, unidade: '', numerico: false, direcao: 'aumentar' };
  return {
    rotulo: `${nome}: ${rotuloMetrica(ind.habilidade, ind.metrica).toLowerCase()}`,
    unidade: UNIDADE_METRICA[ind.metrica],
    numerico: true,
    direcao: 'aumentar',
  };
}

const absDif = (a: unknown, b: unknown) =>
  ehNumero(a) && ehNumero(b) ? Math.abs(a - b) : undefined;

/** Valor de uma medida-indicador a partir dos valores gravados */
function valorDaMedida(
  medida: string,
  tipo: string,
  v: Record<string, unknown> | null | undefined
): number | undefined {
  if (!v) return undefined;
  switch (medida) {
    case 'gonio_dif_rotacao_passiva':
      return tipo === 'goniometria'
        ? absDif(v.rotacao_passiva_direita, v.rotacao_passiva_esquerda)
        : undefined;
    case 'gonio_dif_rotacao_ativa':
      return tipo === 'goniometria'
        ? absDif(v.rotacao_ativa_direita, v.rotacao_ativa_esquerda)
        : undefined;
    case 'gonio_dif_inclinacao_passiva':
      return tipo === 'goniometria'
        ? absDif(v.inclinacao_passiva_direita, v.inclinacao_passiva_esquerda)
        : undefined;
    case 'mfs_dif':
      return tipo === 'mfs' ? absDif(v.mfs_direito, v.mfs_esquerdo) : undefined;
    case 'cvai':
      return tipo === 'craniometria' && ehNumero(v.cvai_percentual)
        ? v.cvai_percentual
        : undefined;
    case 'cva':
      return tipo === 'craniometria' && ehNumero(v.cva_mm)
        ? v.cva_mm
        : undefined;
    case 'ci':
      return tipo === 'craniometria' && ehNumero(v.ci_percentual)
        ? v.ci_percentual
        : undefined;
  }
  return undefined;
}

const TIPO_DA_MEDIDA: Record<string, string> = {
  gonio_dif_rotacao_passiva: 'goniometria',
  gonio_dif_rotacao_ativa: 'goniometria',
  gonio_dif_inclinacao_passiva: 'goniometria',
  mfs_dif: 'mfs',
  cvai: 'craniometria',
  cva: 'craniometria',
  ci: 'craniometria',
};

/** Registro de hoje que corresponde ao indicador (respeita o lado, se houver) */
export function registroDoIndicador(
  ind: IndicadorObjetivo,
  registros: RegistroHabilidade[]
): RegistroHabilidade | undefined {
  if (ind.tipo !== 'habilidade') return undefined;
  const daHab = registros.filter(
    (r) => r.habilidade === ind.habilidade && r.estado !== 'nao_observado'
  );
  if (ind.lado) return daHab.find((r) => (r.lado ?? 'ambos') === ind.lado);
  return daHab.find((r) => !r.lado || r.lado === 'ambos') ?? daHab[0];
}

/** Valor numérico do indicador nesta evolução (undefined = não registrado) */
export function valorIndicadorNaEvolucao(
  ind: IndicadorObjetivo | null | undefined,
  ev: EvolucaoMotoraAssimetria
): number | undefined {
  if (!ind) return undefined;
  if (ind.tipo === 'habilidade') {
    if (!ind.metrica) return undefined;
    const v = registroDoIndicador(ind, ev.habilidades || [])?.metricas?.[
      ind.metrica
    ];
    return ehNumero(v) ? v : undefined;
  }
  const tipo = TIPO_DA_MEDIDA[ind.medida];
  const valores =
    tipo === 'goniometria'
      ? (ev.goniometria as Record<string, unknown> | undefined)
      : tipo === 'craniometria'
        ? (ev.craniometria as Record<string, unknown> | undefined)
        : ev.medicoes?.mfs?.situacao === 'medido'
          ? ev.medicoes.mfs.valores
          : undefined;
  return valorDaMedida(ind.medida, tipo, valores);
}

export interface PontoSerie {
  data: string;
  valor: number;
  fonte: 'evolucao' | 'avaliacao';
}

/** Série histórica numérica de um indicador (ordem de data) */
export function serieIndicador(
  ind: IndicadorObjetivo | null | undefined,
  h: Pick<HistoricoMotor, 'evolucoes' | 'medidas'>
): PontoSerie[] {
  if (!ind) return [];
  const pontos: PontoSerie[] = [];
  if (ind.tipo === 'habilidade') {
    if (!ind.metrica) return [];
    for (const ev of h.evolucoes) {
      const r = registroDoIndicador(ind, ev.habilidades || []);
      const v = r?.metricas?.[ind.metrica];
      if (ehNumero(v))
        pontos.push({ data: ev.data, valor: v, fonte: ev.fonte ?? 'evolucao' });
    }
  } else {
    const tipo = TIPO_DA_MEDIDA[ind.medida];
    for (const m of h.medidas) {
      if (m.tipo !== tipo) continue;
      const v = valorDaMedida(ind.medida, m.tipo, m.valores);
      if (ehNumero(v)) pontos.push({ data: m.data, valor: v, fonte: m.fonte });
    }
  }
  return pontos.sort((a, b) => a.data.localeCompare(b.data));
}

export interface PontoEstado {
  data: string;
  estado: EstadoHabilidade;
  assistencia?: NivelAssistencia;
}

/** Linha do tempo dos estados de uma habilidade (sem "não observado") */
export function serieEstados(
  habilidade: string,
  lado: LadoHabilidade | undefined,
  evolucoes: EvolucaoHistorico[]
): PontoEstado[] {
  const ind: IndicadorObjetivo = { tipo: 'habilidade', habilidade, lado };
  return [...evolucoes]
    .sort((a, b) => a.data.localeCompare(b.data))
    .flatMap((ev) => {
      const r = registroDoIndicador(ind, ev.habilidades || []);
      return r
        ? [
            {
              data: ev.data,
              estado: r.estado,
              ...(r.assistencia ? { assistencia: r.assistencia } : {}),
            },
          ]
        : [];
    });
}

/** "Último: independente (mínima) em 10/10/2026" para objetivo sem número */
export function ultimoEstadoDoIndicador(
  ind: IndicadorObjetivo | null | undefined,
  evolucoes: EvolucaoHistorico[]
): string | undefined {
  if (ind?.tipo !== 'habilidade' || ind.metrica) return undefined;
  const serie = serieEstados(ind.habilidade, ind.lado, evolucoes);
  const u = serie[serie.length - 1];
  if (!u) return undefined;
  const assist = u.assistencia
    ? ` (${ASSISTENCIAS.find((a) => a.id === u.assistencia)?.rotulo.toLowerCase()})`
    : '';
  return `Último: ${ROTULO_ESTADO[u.estado].toLowerCase()}${assist} em ${dataCurta(u.data)}`;
}

/** Primeira medida registrada numa avaliação (registro zero) */
export function medidaNaAvaliacao(
  medidas: MedidaHistorico[],
  tipo: string
): MedidaHistorico | undefined {
  return medidas
    .filter((m) => m.tipo === tipo && m.fonte === 'avaliacao' && m.valores)
    .sort((a, b) => a.data.localeCompare(b.data))[0];
}

/** Valor curto de uma medida para comparação ("rotação passiva D 60° / E 80°") */
export function textoMedidaCurto(
  tipo: string,
  v: Record<string, unknown> | null | undefined
): string {
  if (!v) return '';
  const n = (x: unknown) => (ehNumero(x) ? fmt(x) : '—');
  switch (tipo) {
    case 'goniometria':
      if (
        ehNumero(v.rotacao_passiva_direita) ||
        ehNumero(v.rotacao_passiva_esquerda)
      )
        return `rotação passiva D ${n(v.rotacao_passiva_direita)}° / E ${n(v.rotacao_passiva_esquerda)}°`;
      if (
        ehNumero(v.rotacao_ativa_direita) ||
        ehNumero(v.rotacao_ativa_esquerda)
      )
        return `rotação ativa D ${n(v.rotacao_ativa_direita)}° / E ${n(v.rotacao_ativa_esquerda)}°`;
      return 'inclinação registrada';
    case 'craniometria':
      return [
        ehNumero(v.cvai_percentual) ? `CVAI ${fmt(v.cvai_percentual)}%` : '',
        ehNumero(v.ci_percentual) ? `CI ${fmt(v.ci_percentual)}%` : '',
      ]
        .filter(Boolean)
        .join(' · ');
    case 'mfs':
      return `D ${n(v.mfs_direito)} / E ${n(v.mfs_esquerdo)}`;
    case 'perimetro_cefalico':
      return ehNumero(v.perimetro_cefalico_cm)
        ? `${fmt(v.perimetro_cefalico_cm)} cm`
        : '';
    case 'desenvolvimento_motor':
      return ehNumero(v.percentil)
        ? `AIMS percentil ${fmt(v.percentil)}`
        : 'marcos registrados';
    case 'fsos2':
      return ehNumero(v.total)
        ? `total ${fmt(v.total)} em ${n(v.itens)} itens`
        : '';
    case 'tensao_neuromeningea':
      return ehNumero(v.testados)
        ? `${n(v.alterados)} de ${fmt(v.testados)} testes alterados`
        : '';
  }
  return '';
}

/**
 * Quanto da meta foi percorrido (0 a 1), só para a barra. Para "reduzir"
 * precisa do valor inicial. Não é escala de desenvolvimento.
 */
export function proporcaoMeta(
  inicial: number | undefined,
  atual: number | undefined,
  meta: number | null | undefined,
  direcao: 'aumentar' | 'reduzir'
): number | undefined {
  if (!ehNumero(atual) || !ehNumero(meta)) return undefined;
  if (direcao === 'aumentar') {
    if (meta <= 0) return undefined;
    return Math.max(0, Math.min(1, atual / meta));
  }
  if (!ehNumero(inicial) || inicial === meta) return undefined;
  return Math.max(0, Math.min(1, (inicial - atual) / (inicial - meta)));
}

/** Resumo do objetivo para o plano: inicial, último, meta */
export function situacaoObjetivo(
  o: ObjetivoMotor,
  h: Pick<HistoricoMotor, 'evolucoes' | 'medidas'>
) {
  const info = infoIndicador(o.indicador);
  const serie = serieIndicador(o.indicador, h);
  const inicial = ehNumero(o.valor_inicial) ? o.valor_inicial : serie[0]?.valor;
  const ultimo = serie[serie.length - 1];
  return {
    info,
    serie,
    inicial,
    ultimo,
    proporcao: info
      ? proporcaoMeta(inicial, ultimo?.valor, o.meta, info.direcao)
      : undefined,
  };
}

// ------------------------------------------------ objetivos x catálogo (1.4)

const igualJson = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Item do catálogo que corresponde a um objetivo do plano (ou undefined). */
export function catalogoDoObjetivo(
  o: Pick<ObjetivoMotor, 'descricao' | 'indicador'>
): ObjetivoCatalogo | undefined {
  return (
    OBJETIVOS_CATALOGO.find((c) => c.descricao === o.descricao) ??
    (o.indicador
      ? OBJETIVOS_CATALOGO.find((c) => igualJson(c.indicador, o.indicador))
      : undefined)
  );
}

/** Medidas que um objetivo puxa: as do catálogo, ou a do seu indicador. */
export function medidasDoObjetivo(
  o: Pick<ObjetivoMotor, 'descricao' | 'indicador'>
): TipoMedidaMotora[] {
  const c = catalogoDoObjetivo(o);
  if (c) return c.medidas;
  if (o.indicador?.tipo === 'medida') {
    const t = TIPO_DA_MEDIDA[o.indicador.medida];
    return t ? [t as TipoMedidaMotora] : [];
  }
  return [];
}

/** Área em que o objetivo aparece agrupado. */
export function areaDoObjetivo(
  o: Pick<ObjetivoMotor, 'descricao' | 'indicador' | 'areas'>
): AreaMotora | undefined {
  return catalogoDoObjetivo(o)?.area ?? o.areas?.[0];
}

/** Objetivo do catálogo ainda fora do plano, como se já estivesse nele. */
export function objetivoProvisorio(
  c: ObjetivoCatalogo,
  pacienteId: string,
  id: string = novoIdObjetivo()
): ObjetivoMotor {
  const agora = new Date().toISOString();
  return {
    id,
    paciente_id: pacienteId,
    descricao: c.descricao,
    areas: [c.area],
    indicador: c.indicador,
    valor_inicial: null,
    meta: null,
    meta_texto: null,
    status: 'ativo',
    motivo_status: null,
    origem: 'evolucao',
    criado_em: agora,
    atualizado_em: agora,
    encerrado_em: null,
  };
}

/**
 * Cópia do objetivo para a sessão: descrição, valor de hoje e o anterior.
 * O resultado (progresso/manteve…) é escolhido pela fisio, nunca deduzido.
 */
export function objetivoParaSessao(
  o: ObjetivoMotor,
  ev: EvolucaoMotoraAssimetria,
  h: Pick<HistoricoMotor, 'evolucoes' | 'medidas'>,
  dataSessao: string,
  agendamentoId?: string
): ObjetivoSessao {
  const info = infoIndicador(o.indicador);
  const hSemHoje = {
    evolucoes: h.evolucoes.filter(
      (e) => e.agendamento_id !== agendamentoId && e.data <= dataSessao
    ),
    medidas: h.medidas.filter((m) => m.data <= dataSessao),
  };
  const anteriores = serieIndicador(o.indicador, hSemHoje).filter(
    (p) => p.data < dataSessao || o.indicador?.tipo === 'habilidade'
  );
  const anterior = anteriores[anteriores.length - 1];
  const valor = valorIndicadorNaEvolucao(o.indicador, ev);
  const cat = catalogoDoObjetivo(o);
  const area = areaDoObjetivo(o);
  const medidas = medidasDoObjetivo(o);
  return {
    objetivo_id: o.id,
    descricao: o.descricao,
    ...(cat ? { catalogo_id: cat.id, regiao: cat.regiao } : {}),
    ...(area ? { area } : {}),
    ...(medidas.length ? { medidas } : {}),
    ...(info?.numerico
      ? { rotulo_indicador: info.rotulo, unidade: info.unidade }
      : {}),
    ...(ehNumero(valor) ? { valor } : {}),
    ...(anterior
      ? { valor_anterior: anterior.valor, data_anterior: anterior.data }
      : {}),
    ...(ehNumero(o.meta) ? { meta: o.meta } : {}),
  };
}

/**
 * Antes de gravar (formato 1.3): recalcula o que foi copiado dos objetivos
 * (valor de hoje, anterior, meta) mantendo o resultado e a observação da
 * fisio, e grava a idade do dia. Objetivo que saiu do plano mantém a cópia.
 */
export function prepararSessaoV13(
  ev: EvolucaoMotoraAssimetria,
  ctx: {
    objetivos: ObjetivoMotor[] | null;
    historico: HistoricoMotor | null;
    dataSessao: string;
    agendamentoId?: string;
  }
): EvolucaoMotoraAssimetria {
  const h = ctx.historico ?? { evolucoes: [], medidas: [] };
  const objetivos_sessao = (ev.objetivos_sessao || []).map((s) => {
    // Objetivo do catálogo recém-entrado no plano ainda pode não estar na
    // lista carregada: usa o do catálogo para recalcular os valores
    const cat = s.catalogo_id
      ? OBJETIVO_CATALOGO_POR_ID[s.catalogo_id]
      : undefined;
    const o =
      ctx.objetivos?.find((x) => x.id === s.objetivo_id) ??
      (cat ? objetivoProvisorio(cat, '', s.objetivo_id) : undefined);
    if (!o) {
      const sem = { ...s };
      delete sem.recursos_da_ultima;
      return sem;
    }
    const novo = objetivoParaSessao(
      o,
      ev,
      h,
      ctx.dataSessao,
      ctx.agendamentoId
    );
    return {
      ...novo,
      ...(s.resultado ? { resultado: s.resultado } : {}),
      ...(s.observacao?.trim() ? { observacao: s.observacao.trim() } : {}),
      // o que a fisio marcou na sessão nunca é recalculado
      ...(s.recursos?.length ? { recursos: s.recursos } : {}),
      ...(s.novo_no_plano ? { novo_no_plano: s.novo_no_plano } : {}),
    };
  });
  const idade = ctx.historico
    ? calcularIdade(
        ctx.historico.data_nascimento,
        ctx.historico.idade_gestacional_semanas,
        ctx.dataSessao
      )
    : null;
  // Métricas vazias não são gravadas (nunca viram zero)
  const habilidades = (ev.habilidades || []).map((r) => {
    const metricas = Object.fromEntries(
      Object.entries(r.metricas || {}).filter(([, v]) => ehNumero(v))
    ) as MetricasHabilidade;
    const { metricas: _m, ...resto } = r;
    void _m;
    return Object.keys(metricas).length ? { ...resto, metricas } : resto;
  });
  const out: EvolucaoMotoraAssimetria = {
    ...ev,
    objetivos_sessao,
    habilidades,
  };
  if (idade) {
    const { meses_para_sugestao: _s, ...idadeSessao } = idade;
    void _s;
    out.idade_sessao = idadeSessao;
  }
  return out;
}

// --------------------------------------------------------------------- API

export async function fetchHistoricoMotor(
  pacienteId: string
): Promise<HistoricoMotor> {
  const { data, error } = await supabase.rpc('fn_motora_historico', {
    p_paciente_id: pacienteId,
  });
  if (error) throw error;
  const h = (data ?? {}) as Partial<HistoricoMotor>;
  return {
    data_nascimento: h.data_nascimento ?? null,
    idade_gestacional_semanas: h.idade_gestacional_semanas ?? null,
    evolucoes: h.evolucoes ?? [],
    medidas: h.medidas ?? [],
    avaliacoes: h.avaliacoes ?? [],
  };
}

export async function fetchObjetivosMotor(
  pacienteId: string
): Promise<ObjetivoMotor[]> {
  const { data, error } = await supabase
    .from('motora_objetivos')
    .select(
      'id, paciente_id, descricao, areas, indicador, valor_inicial, meta, meta_texto, status, motivo_status, origem, criado_em, atualizado_em, encerrado_em'
    )
    .eq('paciente_id', pacienteId)
    .order('criado_em');
  if (error) throw error;
  return (data ?? []).map((o) => ({
    ...o,
    valor_inicial: o.valor_inicial === null ? null : Number(o.valor_inicial),
    meta: o.meta === null ? null : Number(o.meta),
  })) as ObjetivoMotor[];
}

export interface ObjetivoParaSalvar {
  id: string;
  paciente_id?: string;
  descricao?: string;
  areas?: AreaMotora[];
  indicador?: IndicadorObjetivo | null;
  valor_inicial?: number | null;
  meta?: number | null;
  meta_texto?: string | null;
  origem?: 'evolucao' | 'avaliacao' | 'plano';
  origem_id?: string | null;
}

export async function salvarObjetivoMotor(
  o: ObjetivoParaSalvar
): Promise<string> {
  const { data, error } = await supabase.rpc('fn_motora_objetivo_salvar', {
    p: o,
  });
  if (error) throw error;
  return data as string;
}

export async function mudarStatusObjetivoMotor(
  id: string,
  status: StatusObjetivo,
  motivo?: string
): Promise<void> {
  const { error } = await supabase.rpc('fn_motora_objetivo_status', {
    p_id: id,
    p_status: status,
    p_motivo: motivo ?? null,
  });
  if (error) throw error;
}

export interface AlteracaoObjetivo {
  acao: 'criado' | 'editado' | 'status';
  dados: Partial<ObjetivoMotor>;
  alterado_em: string;
  alterado_por: string | null;
}

export async function fetchHistoricoObjetivo(
  id: string
): Promise<AlteracaoObjetivo[]> {
  const { data, error } = await supabase
    .from('motora_objetivos_historico')
    .select('acao, dados, alterado_em, alterado_por')
    .eq('objetivo_id', id)
    .order('alterado_em');
  if (error) throw error;
  return (data ?? []) as AlteracaoObjetivo[];
}

export const novoIdObjetivo = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
