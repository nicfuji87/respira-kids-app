// Avaliação motora integrada à evolução: seções da avaliação inicial e da
// reavaliação, severidade gravada, valor inicial dos objetivos, sugestões a
// partir dos achados, comparação entre avaliações, laudo e anamnese
// respondida pelos pais.
//
// Regra de ouro (igual à evolução): campo vazio nunca vira zero.

import { supabase } from '@/lib/supabase';
import {
  AVALIACOES_SECOES,
  APRESENTACAO_FETAL_OPCOES,
  ASSIMETRIAS_OPCOES,
  ATITUDE_CABECA_OPCOES,
  EAR_SHIFT_OPCOES,
  BOSSING_FRONTAL_OPCOES,
  HEAD_LAG_OPCOES,
  INSTRUMENTOS_PARTO_OPCOES,
  LIQUIDO_AMNIOTICO_OPCOES,
  LOCAL_INTERNACAO_OPCOES,
  LOCALIZACAO_NODULO_OPCOES,
  ONDE_DORME_OPCOES,
  PADRAO_LANDAU_OPCOES,
  POSICAO_PREFERENCIA_OPCOES,
  QUALIDADE_SONO_OPCOES,
  REAVALIACAO_OPCOES,
  SIM_NAO_NAO_SABE_OPCOES,
  SIM_NAO_SUSPEITA_OPCOES,
  ESTADO_EMOCIONAL_OPCOES,
  TIPO_CLINICO_TORCICOLO_OPCOES,
  TONUS_ECOM_OPCOES,
  calcularSeveridadeAutomatica,
  type AvaliacaoClinica,
  type AvaliacaoClinicaUpdate,
  type AvaliacaoSecao,
} from '@/types/avaliacoes-clinicas';
import {
  ROTULO_BRAQUICEFALIA,
  ROTULO_PLAGIOCEFALIA,
  type AreaMotora,
} from '@/types/evolucao-clinica';
import type {
  IndicadorObjetivo,
  MetricaHabilidade,
  SugestaoObjetivo,
} from '@/lib/motora-catalogo';
import {
  dataCurta,
  fmtValor,
  infoIndicador,
  nomeRegistro,
  textoRegistroHabilidade,
  type ObjetivoMotor,
} from '@/lib/motora-plano';
import { resumoFsos2, resumoTensao } from '@/lib/motora-medidas';

const ehNumero = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
const temTexto = (s?: string | null): s is string => !!s && s.trim().length > 0;
const fmt = (n: number) =>
  n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

type Opcao = { valor: string; label: string };
const rotulo = (opcoes: readonly Opcao[], v: unknown) =>
  typeof v === 'string' ? (opcoes.find((o) => o.valor === v)?.label ?? v) : '';

// ----------------------------------------------------------------- seções

export const SECAO_HABILIDADES: AvaliacaoSecao = {
  id: 'habilidades',
  numero: 0,
  titulo: 'Habilidades Motoras',
  descricao: 'Mesmo catálogo da evolução (registro inicial)',
  campos: ['habilidades'],
  categoria: 'comum',
  grupo: 'neuromotor',
};

export const SECAO_COMPARACAO: AvaliacaoSecao = {
  id: 'comparacao',
  numero: 0,
  titulo: 'Comparação',
  descricao: 'Avaliação anterior × agora',
  campos: [],
  categoria: 'comum',
  grupo: 'conclusao',
};

// Na reavaliação: só o que se repete, a classificação e a conclusão
const IDS_REAVALIACAO = [
  'torcicolo',
  'goniometria',
  'palpacao',
  'mfs',
  'tensao',
  'craniometria',
  'assimetria',
  'fsos2',
  'habilidades',
  'resposta',
  'aims',
  'severidade',
  'comparacao',
  'diagnostico',
  'objetivos',
  'plano',
  'reavaliacao',
  'observacoes',
];

const temAlgo = (v: unknown) =>
  !!v &&
  typeof v === 'object' &&
  Object.values(v as object).some(
    (x) => x !== null && x !== undefined && x !== '' && x !== false
  );

/**
 * Seções desta avaliação, numeradas na ordem. As habilidades (catálogo da
 * evolução) substituem os marcos sim/não e o controle cervical em supino e
 * prono; avaliações antigas que têm esses dados continuam mostrando-os.
 */
export function secoesDaAvaliacao(
  av: Pick<
    AvaliacaoClinica,
    'tipo_avaliacao' | 'marcos_motores_atingidos' | 'funcionalidade_cervical'
  >
): AvaliacaoSecao[] {
  const marcosAntigos = Object.values(av.marcos_motores_atingidos || {}).some(
    (v) => v === true
  );
  const funcAntiga = temAlgo(av.funcionalidade_cervical);
  const lista: AvaliacaoSecao[] = [];
  for (const s of AVALIACOES_SECOES) {
    if (s.id === 'marcos_motores' && !marcosAntigos) continue;
    if (s.id === 'funcionalidade') {
      lista.push(SECAO_HABILIDADES);
      if (!funcAntiga) continue;
    }
    if (s.id === 'diagnostico' && av.tipo_avaliacao === 'reavaliacao')
      lista.push(SECAO_COMPARACAO);
    lista.push(s);
  }
  const filtrada =
    av.tipo_avaliacao === 'reavaliacao'
      ? lista.filter((s) => IDS_REAVALIACAO.includes(s.id))
      : lista;
  return filtrada.map((s, i) => ({ ...s, numero: i + 1 }));
}

// ------------------------------------------------------------- severidade

const temNodulo = (av: Pick<AvaliacaoClinica, 'torcicolo_detalhado'>) => {
  const t = av.torcicolo_detalhado;
  return !!(
    (t?.ecom_direito_nodulo && t.ecom_direito_nodulo !== 'ausente') ||
    (t?.ecom_esquerdo_nodulo && t.ecom_esquerdo_nodulo !== 'ausente')
  );
};

/** Diferença de rotação passiva D × E; só com os dois lados medidos */
export const deficitRotacaoPassiva = (
  av: Pick<AvaliacaoClinica, 'goniometria'>
): number | undefined => {
  const r = av.goniometria?.rotacao;
  return ehNumero(r?.passiva_direita) && ehNumero(r?.passiva_esquerda)
    ? Math.abs(r.passiva_direita - r.passiva_esquerda)
    : undefined;
};

/**
 * Grau de severidade (1 a 8) quando há dados para calculá-lo: acima de 12
 * meses, nódulo presente ou rotação passiva medida dos dois lados. Lado
 * não medido NÃO vira 0°.
 */
export function severidadeDaAvaliacao(
  av: Pick<AvaliacaoClinica, 'goniometria' | 'torcicolo_detalhado'>,
  idadeMeses: number | undefined
): number | null {
  if (!ehNumero(idadeMeses)) return null;
  const deficit = deficitRotacaoPassiva(av);
  const nodulo = temNodulo(av);
  if (idadeMeses <= 12 && !nodulo && deficit === undefined) return null;
  return calcularSeveridadeAutomatica(idadeMeses, deficit ?? 0, nodulo).grau;
}

// ---------------------------------------------- valores para os objetivos

/** Valor do indicador medido nesta avaliação (valor inicial do objetivo) */
export function valorDaAvaliacao(
  av: AvaliacaoClinica,
  ind: IndicadorObjetivo | null | undefined
): number | undefined {
  if (!ind) return undefined;
  if (ind.tipo === 'habilidade') {
    if (!ind.metrica) return undefined;
    const regs = (av.habilidades || []).filter(
      (r) => r.habilidade === ind.habilidade && r.estado !== 'nao_observado'
    );
    const r = ind.lado
      ? regs.find((x) => (x.lado ?? 'ambos') === ind.lado)
      : (regs.find((x) => !x.lado || x.lado === 'ambos') ?? regs[0]);
    const v = r?.metricas?.[ind.metrica];
    return ehNumero(v) ? v : undefined;
  }
  const g = av.goniometria;
  const dif = (a?: number, b?: number) =>
    ehNumero(a) && ehNumero(b) ? Math.abs(a - b) : undefined;
  const c = av.medidas_craniometricas;
  switch (ind.medida) {
    case 'gonio_dif_rotacao_passiva':
      return dif(g?.rotacao?.passiva_direita, g?.rotacao?.passiva_esquerda);
    case 'gonio_dif_rotacao_ativa':
      return dif(g?.rotacao?.ativa_direita, g?.rotacao?.ativa_esquerda);
    case 'gonio_dif_inclinacao_passiva':
      return dif(
        g?.inclinacao?.passiva_direita,
        g?.inclinacao?.passiva_esquerda
      );
    case 'mfs_dif':
      return dif(av.mfs_direito ?? undefined, av.mfs_esquerdo ?? undefined);
    case 'cvai':
      return ehNumero(c?.cvai_percentual) ? c.cvai_percentual : undefined;
    case 'cva':
      return ehNumero(c?.cva_mm) ? c.cva_mm : undefined;
  }
  return undefined;
}

/**
 * Sugestões de objetivo a partir do que a avaliação encontrou. A fisio
 * escolhe, adapta ou ignora; o sistema não decide.
 */
export function sugestoesDaAvaliacao(av: AvaliacaoClinica): SugestaoObjetivo[] {
  const s: SugestaoObjetivo[] = [];
  const difRot = deficitRotacaoPassiva(av);
  if (ehNumero(difRot) && difRot >= 5)
    s.push({
      descricao: 'Reduzir a diferença de rotação cervical entre os lados',
      areas: ['torcicolo'],
      indicador: { tipo: 'medida', medida: 'gonio_dif_rotacao_passiva' },
    });
  const g = av.goniometria;
  if (
    ehNumero(g?.inclinacao?.passiva_direita) &&
    ehNumero(g?.inclinacao?.passiva_esquerda) &&
    Math.abs(g.inclinacao.passiva_direita - g.inclinacao.passiva_esquerda) >= 5
  )
    s.push({
      descricao: 'Reduzir a diferença de inclinação cervical entre os lados',
      areas: ['torcicolo'],
      indicador: { tipo: 'medida', medida: 'gonio_dif_inclinacao_passiva' },
    });
  if (
    ehNumero(av.mfs_direito) &&
    ehNumero(av.mfs_esquerdo) &&
    av.mfs_direito !== av.mfs_esquerdo
  )
    s.push({
      descricao: 'Equilibrar a força muscular cervical (MFS) entre os lados',
      areas: ['torcicolo'],
      indicador: { tipo: 'medida', medida: 'mfs_dif' },
    });
  const cvai = av.medidas_craniometricas?.cvai_percentual;
  if (ehNumero(cvai) && cvai >= 3.5)
    s.push({
      descricao: 'Reduzir a assimetria craniana (CVAI)',
      areas: ['assimetria_craniana'],
      indicador: { tipo: 'medida', medida: 'cvai' },
    });
  for (const r of av.habilidades || []) {
    if (r.estado !== 'com_assistencia' && r.estado !== 'nao_realiza') continue;
    const desc = `${nomeRegistro(r)} com independência`;
    if (s.some((x) => x.descricao === desc)) continue;
    const metrica = Object.keys(r.metricas || {})[0] as
      | MetricaHabilidade
      | undefined;
    s.push({
      descricao: desc,
      areas: ['desenvolvimento_motor'],
      indicador: {
        tipo: 'habilidade',
        habilidade: r.habilidade,
        ...(r.lado && r.lado !== 'ambos' ? { lado: r.lado } : {}),
        ...(metrica ? { metrica } : {}),
      } as IndicadorObjetivo,
    });
  }
  return s;
}

/** Áreas indicadas pelos achados (para pré-marcar nos objetivos) */
export function areasDaAvaliacao(av: AvaliacaoClinica): AreaMotora[] {
  const areas: AreaMotora[] = [];
  if (av.tem_torcicolo || temAlgo(av.goniometria) || ehNumero(av.mfs_direito))
    areas.push('torcicolo');
  if (temAlgo(av.medidas_craniometricas) || temAlgo(av.assimetria_craniana))
    areas.push('assimetria_craniana');
  if ((av.habilidades || []).length > 0 || temAlgo(av.aims_detalhada))
    areas.push('desenvolvimento_motor');
  return areas;
}

// ------------------------------------------------------------ comparação

export interface LinhaComparacao {
  grupo: string;
  parametro: string;
  antes: string;
  agora: string;
  diferenca?: string;
}

const graus = (v?: number | null) => (ehNumero(v) ? `${fmt(v)}°` : '—');
const dif = (agora?: number | null, antes?: number | null, un = '') => {
  if (!ehNumero(agora) || !ehNumero(antes)) return undefined;
  const d = Math.round((agora - antes) * 10) / 10;
  if (d === 0) return 'sem mudança';
  return `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}${un}`;
};

/**
 * Avaliação anterior × esta, parâmetro a parâmetro. Só entram parâmetros
 * registrados em pelo menos uma das duas.
 */
export function comparacaoAvaliacoes(
  antes: AvaliacaoClinica,
  agora: AvaliacaoClinica
): LinhaComparacao[] {
  const L: LinhaComparacao[] = [];
  const add = (
    grupo: string,
    parametro: string,
    a: string,
    b: string,
    d?: string
  ) => {
    if ((a === '—' || !a) && (b === '—' || !b)) return;
    L.push({
      grupo,
      parametro,
      antes: a || '—',
      agora: b || '—',
      diferenca: d,
    });
  };

  // Goniometria
  for (const mov of ['rotacao', 'inclinacao'] as const)
    for (const tipo of ['passiva', 'ativa'] as const)
      for (const lado of ['direita', 'esquerda'] as const) {
        const k = `${tipo}_${lado}` as const;
        const a = antes.goniometria?.[mov]?.[k];
        const b = agora.goniometria?.[mov]?.[k];
        add(
          'Goniometria cervical',
          `${mov === 'rotacao' ? 'Rotação' : 'Inclinação'} ${tipo} ${lado}`,
          graus(a),
          graus(b),
          dif(b, a, '°')
        );
      }
  const dA = deficitRotacaoPassiva(antes);
  const dB = deficitRotacaoPassiva(agora);
  add(
    'Goniometria cervical',
    'Diferença de rotação passiva (D × E)',
    graus(dA),
    graus(dB),
    dif(dB, dA, '°')
  );

  // MFS
  add(
    'MFS',
    'Direito',
    ehNumero(antes.mfs_direito) ? String(antes.mfs_direito) : '—',
    ehNumero(agora.mfs_direito) ? String(agora.mfs_direito) : '—',
    dif(agora.mfs_direito, antes.mfs_direito)
  );
  add(
    'MFS',
    'Esquerdo',
    ehNumero(antes.mfs_esquerdo) ? String(antes.mfs_esquerdo) : '—',
    ehNumero(agora.mfs_esquerdo) ? String(agora.mfs_esquerdo) : '—',
    dif(agora.mfs_esquerdo, antes.mfs_esquerdo)
  );

  // Crânio
  const ca = antes.medidas_craniometricas || {};
  const cb = agora.medidas_craniometricas || {};
  const num = (v?: number, un = '') => (ehNumero(v) ? `${fmt(v)}${un}` : '—');
  add(
    'Crânio',
    'CVA',
    num(ca.cva_mm, ' mm'),
    num(cb.cva_mm, ' mm'),
    dif(cb.cva_mm, ca.cva_mm, ' mm')
  );
  add(
    'Crânio',
    'CVAI',
    num(ca.cvai_percentual, '%'),
    num(cb.cvai_percentual, '%'),
    dif(cb.cvai_percentual, ca.cvai_percentual, ' p.p.')
  );
  add(
    'Crânio',
    'Índice cefálico',
    num(ca.ci_percentual, '%'),
    num(cb.ci_percentual, '%'),
    dif(cb.ci_percentual, ca.ci_percentual, ' p.p.')
  );
  add(
    'Crânio',
    'Perímetro cefálico',
    num(ca.perimetro_cefalico_cm, ' cm'),
    num(cb.perimetro_cefalico_cm, ' cm'),
    dif(cb.perimetro_cefalico_cm, ca.perimetro_cefalico_cm, ' cm')
  );
  const plA = ca.plagiocefalia_severidade;
  const plB = cb.plagiocefalia_severidade;
  add(
    'Crânio',
    'Plagiocefalia',
    plA ? (ROTULO_PLAGIOCEFALIA[plA] ?? plA) : '—',
    plB ? (ROTULO_PLAGIOCEFALIA[plB] ?? plB) : '—'
  );
  const brA = ca.braquicefalia_severidade;
  const brB = cb.braquicefalia_severidade;
  add(
    'Crânio',
    'Braquicefalia',
    brA ? (ROTULO_BRAQUICEFALIA[brA] ?? brA) : '—',
    brB ? (ROTULO_BRAQUICEFALIA[brB] ?? brB) : '—'
  );

  // FSOS-2 e tensão
  const fA = resumoFsos2(antes.fsos2 as Record<string, unknown> | undefined);
  const fB = resumoFsos2(agora.fsos2 as Record<string, unknown> | undefined);
  add(
    'FSOS-2',
    'Total',
    fA.itens ? `${fA.total} (${fA.itens} itens)` : '—',
    fB.itens ? `${fB.total} (${fB.itens} itens)` : '—',
    fA.itens && fA.itens === fB.itens
      ? dif(fB.total, fA.total)
      : fA.itens && fB.itens
        ? 'itens diferentes'
        : undefined
  );
  const tA = resumoTensao(
    antes.tensao_neuromeningea_detalhada as Record<string, unknown> | undefined
  );
  const tB = resumoTensao(
    agora.tensao_neuromeningea_detalhada as Record<string, unknown> | undefined
  );
  add(
    'Tensão neuromeníngea',
    'Testes alterados',
    tA.testados ? `${tA.alterados.length} de ${tA.testados}` : '—',
    tB.testados ? `${tB.alterados.length} de ${tB.testados}` : '—'
  );

  // AIMS
  const aimsA = antes.aims_detalhada ?? antes.aims;
  const aimsB = agora.aims_detalhada ?? agora.aims;
  add(
    'AIMS',
    'Escore total',
    ehNumero(aimsA?.score_total) ? String(aimsA.score_total) : '—',
    ehNumero(aimsB?.score_total) ? String(aimsB.score_total) : '—',
    dif(aimsB?.score_total, aimsA?.score_total)
  );
  add(
    'AIMS',
    'Percentil',
    ehNumero(aimsA?.percentil) ? String(aimsA.percentil) : '—',
    ehNumero(aimsB?.percentil) ? String(aimsB.percentil) : '—',
    dif(aimsB?.percentil, aimsA?.percentil)
  );

  // Resposta postural
  add(
    'Resposta postural',
    'Tração (head lag)',
    rotulo(HEAD_LAG_OPCOES, antes.resposta_postural?.tracao?.head_lag) || '—',
    rotulo(HEAD_LAG_OPCOES, agora.resposta_postural?.tracao?.head_lag) || '—'
  );
  add(
    'Resposta postural',
    'Landau',
    rotulo(PADRAO_LANDAU_OPCOES, antes.resposta_postural?.landau?.padrao) ||
      '—',
    rotulo(PADRAO_LANDAU_OPCOES, agora.resposta_postural?.landau?.padrao) || '—'
  );

  // Classificação
  add(
    'Classificação',
    'Tipo de torcicolo',
    rotulo(
      TIPO_CLINICO_TORCICOLO_OPCOES,
      antes.torcicolo_detalhado?.tipo_clinico
    ) || '—',
    rotulo(
      TIPO_CLINICO_TORCICOLO_OPCOES,
      agora.torcicolo_detalhado?.tipo_clinico
    ) || '—'
  );
  add(
    'Classificação',
    'Grau de severidade',
    ehNumero(antes.grau_severidade) ? String(antes.grau_severidade) : '—',
    ehNumero(agora.grau_severidade) ? String(agora.grau_severidade) : '—'
  );

  // Habilidades (mesmo catálogo)
  const chave = (r: { habilidade: string; lado?: string }) =>
    `${r.habilidade}@${r.lado ?? ''}`;
  const regsA = new Map((antes.habilidades || []).map((r) => [chave(r), r]));
  for (const r of agora.habilidades || []) {
    if (r.estado === 'nao_observado') continue;
    const a = regsA.get(chave(r));
    const desc = (x?: typeof r) =>
      x && x.estado !== 'nao_observado'
        ? textoRegistroHabilidade({
            ...x,
            anterior: undefined,
            avaliacao: undefined,
          })
            .split(': ')
            .slice(1)
            .join(': ')
        : '—';
    add('Habilidades', nomeRegistro(r), desc(a), desc(r));
  }
  return L;
}

// ------------------------------------------------------------------ laudo

export interface OpcoesLaudo {
  nomePaciente?: string;
  idadeTexto?: string;
  avaliador?: string | null;
  anterior?: AvaliacaoClinica | null;
  objetivos?: ObjetivoMotor[];
}

const secao = (
  titulo: string,
  linhas: (string | false | null | undefined)[]
) => {
  const ok = linhas.filter((l): l is string => !!l && l.trim().length > 0);
  return ok.length
    ? `${titulo}\n${ok.map((l) => `• ${l}`).join('\n')}\n\n`
    : '';
};

/** Laudo da avaliação gerado por regras (revisável antes de enviar) */
export function gerarLaudoAvaliacao(
  av: AvaliacaoClinica,
  o: OpcoesLaudo = {}
): string {
  let t = `${av.tipo_avaliacao === 'reavaliacao' ? 'REAVALIAÇÃO' : 'AVALIAÇÃO'} FISIOTERAPÊUTICA MOTORA\n`;
  t += `Data: ${dataCurta(av.data_avaliacao)}\n`;
  if (o.nomePaciente) t += `Paciente: ${o.nomePaciente}\n`;
  if (o.idadeTexto) t += `Idade: ${o.idadeTexto}\n`;
  t += '\n';

  if (temTexto(av.queixa_principal))
    t += `Queixa principal\n${av.queixa_principal.trim()}\n\n`;

  // Histórico
  t += secao('Histórico gestacional e neonatal', [
    ehNumero(av.idade_gestacional_semanas) &&
      `Idade gestacional: ${av.idade_gestacional_semanas} semanas`,
    av.gestacao_multipla === true && 'Gestação múltipla',
    av.apresentacao_fetal &&
      `Apresentação fetal: ${rotulo(APRESENTACAO_FETAL_OPCOES, av.apresentacao_fetal).toLowerCase()}`,
    av.liquido_amniotico &&
      av.liquido_amniotico !== 'normal' &&
      `Líquido amniótico: ${rotulo(LIQUIDO_AMNIOTICO_OPCOES, av.liquido_amniotico).toLowerCase()}`,
    av.circular_cordao === 'sim' && 'Circular de cordão',
    temTexto(av.intercorrencias_prenatais) &&
      `Intercorrências pré-natais: ${av.intercorrencias_prenatais!.trim()}`,
    av.tipo_parto &&
      `Parto ${av.tipo_parto === 'cesarea' ? 'cesáreo' : 'normal'}${(av.instrumentos_parto || []).length ? ` (${(av.instrumentos_parto || []).map((i) => rotulo(INSTRUMENTOS_PARTO_OPCOES, i).toLowerCase()).join(', ')})` : ''}`,
    temTexto(av.intercorrencias_perinatais) &&
      `Intercorrências no parto: ${av.intercorrencias_perinatais!.trim()}`,
    ehNumero(av.apgar_1min) &&
      `Apgar ${av.apgar_1min}${ehNumero(av.apgar_5min) ? `/${av.apgar_5min}` : ''}`,
    av.local_internacao &&
      av.local_internacao !== 'alojamento_conjunto' &&
      `Internação: ${rotulo(LOCAL_INTERNACAO_OPCOES, av.local_internacao)}${ehNumero(av.tempo_internacao_dias) ? `, ${av.tempo_internacao_dias} dias` : ''}`,
    av.assistencia_ventilatoria === true &&
      'Necessitou de assistência ventilatória',
  ]);

  t += secao('Características e rotina', [
    (av.assimetrias_percebidas || []).length > 0 &&
      `Assimetrias percebidas pela família: ${(av.assimetrias_percebidas || []).map((a) => rotulo(ASSIMETRIAS_OPCOES, a).toLowerCase()).join(', ')}`,
    ehNumero(av.idade_inclinacao_cabeca_dias) &&
      `Percebido com ${av.idade_inclinacao_cabeca_dias} dias de vida`,
    av.posicao_preferencia_opcao &&
      `Posição preferida: ${rotulo(POSICAO_PREFERENCIA_OPCOES, av.posicao_preferencia_opcao).toLowerCase()}`,
    av.onde_dorme_opcao &&
      `Dorme: ${rotulo(ONDE_DORME_OPCOES, av.onde_dorme_opcao).toLowerCase()}`,
    av.qualidade_sono_opcao &&
      `Sono: ${rotulo(QUALIDADE_SONO_OPCOES, av.qualidade_sono_opcao).toLowerCase()}`,
    (av.estado_emocional_opcoes || []).length > 0 &&
      `Comportamento: ${(av.estado_emocional_opcoes || []).map((e) => rotulo(ESTADO_EMOCIONAL_OPCOES, e).toLowerCase()).join(', ')}`,
    av.refluxo_status &&
      av.refluxo_status !== 'nao' &&
      `Refluxo: ${rotulo(SIM_NAO_SUSPEITA_OPCOES, av.refluxo_status).toLowerCase()}`,
    av.aplv &&
      av.aplv !== 'nao' &&
      `APLV: ${rotulo(SIM_NAO_SUSPEITA_OPCOES, av.aplv).toLowerCase()}`,
    av.disquesia &&
      av.disquesia !== 'nao' &&
      `Disquesia: ${rotulo(SIM_NAO_SUSPEITA_OPCOES, av.disquesia).toLowerCase()}`,
  ]);

  // Torcicolo
  const td = av.torcicolo_detalhado;
  const g = av.goniometria;
  const lado = (rot: string, d?: number, e?: number) =>
    ehNumero(d) || ehNumero(e)
      ? `${rot}: D ${graus(d)} / E ${graus(e)}${ehNumero(d) && ehNumero(e) ? ` (diferença ${fmt(Math.abs(d - e))}°)` : ''}`
      : null;
  const nod = (v?: string) =>
    v && v !== 'ausente'
      ? rotulo(LOCALIZACAO_NODULO_OPCOES, v).toLowerCase()
      : null;
  const tensao = resumoTensao(
    av.tensao_neuromeningea_detalhada as Record<string, unknown> | undefined
  );
  t += secao('Torcicolo', [
    td?.tipo_clinico &&
      `Tipo clínico: ${rotulo(TIPO_CLINICO_TORCICOLO_OPCOES, td.tipo_clinico)}${td.lado_afetado ? `, lado ${td.lado_afetado}` : ''}`,
    td?.atitude_cabeca &&
      `Atitude da cabeça: ${rotulo(ATITUDE_CABECA_OPCOES, td.atitude_cabeca).toLowerCase()}`,
    lado(
      'Rotação passiva',
      g?.rotacao?.passiva_direita,
      g?.rotacao?.passiva_esquerda
    ),
    lado(
      'Rotação ativa',
      g?.rotacao?.ativa_direita,
      g?.rotacao?.ativa_esquerda
    ),
    lado(
      'Inclinação passiva',
      g?.inclinacao?.passiva_direita,
      g?.inclinacao?.passiva_esquerda
    ),
    lado(
      'Inclinação ativa',
      g?.inclinacao?.ativa_direita,
      g?.inclinacao?.ativa_esquerda
    ),
    (td?.ecom_direito_tonus || td?.ecom_esquerdo_tonus) &&
      `ECOM: D ${rotulo(TONUS_ECOM_OPCOES, td?.ecom_direito_tonus).toLowerCase() || '—'}${nod(td?.ecom_direito_nodulo) ? `, nódulo ${nod(td?.ecom_direito_nodulo)}` : ''}; E ${rotulo(TONUS_ECOM_OPCOES, td?.ecom_esquerdo_tonus).toLowerCase() || '—'}${nod(td?.ecom_esquerdo_nodulo) ? `, nódulo ${nod(td?.ecom_esquerdo_nodulo)}` : ''}`,
    (ehNumero(av.mfs_direito) || ehNumero(av.mfs_esquerdo)) &&
      `MFS: D ${av.mfs_direito ?? '—'} / E ${av.mfs_esquerdo ?? '—'}`,
    tensao.testados > 0 &&
      (tensao.alterados.length
        ? `Tensão neuromeníngea alterada em ${tensao.alterados.join(', ')} (${tensao.alterados.length} de ${tensao.testados} testes)`
        : `Tensão neuromeníngea sem alteração (${tensao.testados} testes)`),
  ]);

  // Crânio
  const c = av.medidas_craniometricas;
  const ac = av.assimetria_craniana;
  const fs = resumoFsos2(av.fsos2 as Record<string, unknown> | undefined);
  t += secao('Crânio e simetria', [
    ehNumero(c?.diagonal_a_mm) &&
      ehNumero(c?.diagonal_b_mm) &&
      `Diagonais: ${fmt(c.diagonal_a_mm)} mm e ${fmt(c.diagonal_b_mm)} mm`,
    ehNumero(c?.cva_mm) && `CVA: ${fmt(c.cva_mm)} mm`,
    ehNumero(c?.cvai_percentual) &&
      `CVAI: ${fmt(c.cvai_percentual)}%${c.plagiocefalia_severidade ? ` (${ROTULO_PLAGIOCEFALIA[c.plagiocefalia_severidade] ?? c.plagiocefalia_severidade})` : ''}`,
    ehNumero(c?.ci_percentual) &&
      `Índice cefálico: ${fmt(c.ci_percentual)}%${c.braquicefalia_severidade ? ` (${ROTULO_BRAQUICEFALIA[c.braquicefalia_severidade] ?? c.braquicefalia_severidade})` : ''}`,
    ehNumero(c?.perimetro_cefalico_cm) &&
      `Perímetro cefálico: ${fmt(c.perimetro_cefalico_cm)} cm`,
    ac?.ear_shift &&
      ac.ear_shift !== 'alinhadas' &&
      `Orelhas: ${rotulo(EAR_SHIFT_OPCOES, ac.ear_shift).toLowerCase()}${ac.ear_shift_lado ? `, ${ac.ear_shift_lado} anteriorizada` : ''}`,
    ac?.bossing_frontal &&
      ac.bossing_frontal !== 'ausente' &&
      `Bossa frontal: ${rotulo(BOSSING_FRONTAL_OPCOES, ac.bossing_frontal).toLowerCase()}`,
    fs.itens > 0 && `FSOS-2: total ${fs.total} em ${fs.itens} itens`,
  ]);

  // Neuromotor
  const rp = av.resposta_postural;
  const aims = av.aims_detalhada ?? av.aims;
  t += secao('Desenvolvimento motor', [
    ...(av.habilidades || [])
      .filter((r) => r.estado !== 'nao_observado')
      .map((r) =>
        textoRegistroHabilidade({
          ...r,
          anterior: undefined,
          avaliacao: undefined,
        })
      ),
    rp?.tracao?.head_lag &&
      `Tração para sentar: ${rotulo(HEAD_LAG_OPCOES, rp.tracao.head_lag).toLowerCase()}`,
    rp?.landau?.padrao &&
      `Landau: ${rotulo(PADRAO_LANDAU_OPCOES, rp.landau.padrao).toLowerCase()}`,
    ehNumero(aims?.score_total) &&
      `AIMS: escore ${aims.score_total}${ehNumero(aims.percentil) ? `, percentil ${aims.percentil}` : ''}${aims.classificacao ? ` (${aims.classificacao})` : ''}`,
  ]);

  if (ehNumero(av.grau_severidade))
    t += `Grau de severidade (torcicolo): ${av.grau_severidade}\n\n`;

  if (o.anterior) {
    const linhas = comparacaoAvaliacoes(o.anterior, av).filter(
      (l) => l.antes !== l.agora
    );
    t += secao(
      `Comparação com a avaliação de ${dataCurta(o.anterior.data_avaliacao)}`,
      linhas.map(
        (l) =>
          `${l.grupo} — ${l.parametro}: ${l.antes} → ${l.agora}${l.diferenca ? ` (${l.diferenca})` : ''}`
      )
    );
  }

  if (temTexto(av.diagnostico_cinetico_funcional))
    t += `Diagnóstico cinético-funcional\n${av.diagnostico_cinetico_funcional.trim()}\n\n`;

  const objs = (o.objetivos || []).filter((x) => x.status === 'ativo');
  t += secao('Objetivos terapêuticos', [
    ...objs.map((x) => {
      const info = infoIndicador(x.indicador);
      const un = info?.unidade ?? '';
      const partes = [
        ehNumero(x.valor_inicial) && `inicial ${fmtValor(x.valor_inicial, un)}`,
        ehNumero(x.meta) && `meta ${fmtValor(x.meta, un)}`,
        temTexto(x.meta_texto) && `meta: ${x.meta_texto}`,
      ].filter(Boolean);
      return `${x.descricao}${partes.length ? ` (${partes.join('; ')})` : ''}`;
    }),
    temTexto(av.objetivos_tratamento?.curto_prazo) &&
      `Curto prazo: ${av.objetivos_tratamento!.curto_prazo!.trim()}`,
    temTexto(av.objetivos_tratamento?.medio_prazo) &&
      `Médio prazo: ${av.objetivos_tratamento!.medio_prazo!.trim()}`,
    temTexto(av.objetivos_tratamento?.longo_prazo) &&
      `Longo prazo: ${av.objetivos_tratamento!.longo_prazo!.trim()}`,
  ]);

  if (temTexto(av.plano_tratamento))
    t += `Plano de tratamento\n${av.plano_tratamento.trim()}\n\n`;
  if (av.reavaliacao_recomendada)
    t += `Reavaliação recomendada: ${av.reavaliacao_recomendada === 'outro' ? (av.reavaliacao_outro ?? 'outro') : rotulo(REAVALIACAO_OPCOES, av.reavaliacao_recomendada)}\n\n`;
  if (temTexto(av.observacoes_gerais))
    t += `Observações\n${av.observacoes_gerais.trim()}\n\n`;
  if (o.avaliador) t += `Fisioterapeuta responsável: ${o.avaliador}\n`;
  return t.trimEnd() + '\n';
}

// -------------------------------------------- anamnese respondida pelos pais

export type TipoPergunta = 'texto' | 'numero' | 'simnao' | 'opcao' | 'multipla';

export interface PerguntaAnamnese {
  campo: string;
  pergunta: string;
  ajuda?: string;
  tipo: TipoPergunta;
  opcoes?: readonly Opcao[];
  bloco: string;
}

/** Perguntas em linguagem simples para os pais (mesmos campos da avaliação) */
export const PERGUNTAS_ANAMNESE: PerguntaAnamnese[] = [
  {
    bloco: 'O motivo da consulta',
    campo: 'queixa_principal',
    tipo: 'texto',
    pergunta: 'O que levou vocês a procurar a fisioterapia?',
    ajuda: 'Conte com suas palavras o que vocês perceberam.',
  },
  {
    bloco: 'O motivo da consulta',
    campo: 'assimetrias_percebidas',
    tipo: 'multipla',
    opcoes: ASSIMETRIAS_OPCOES,
    pergunta: 'Vocês perceberam alguma diferença entre os lados?',
  },
  {
    bloco: 'O motivo da consulta',
    campo: 'idade_inclinacao_cabeca_dias',
    tipo: 'numero',
    pergunta: 'Com quantos dias de vida vocês perceberam?',
    ajuda: 'Se não lembrar, deixe em branco.',
  },
  {
    bloco: 'Gestação',
    campo: 'idade_gestacional_semanas',
    tipo: 'numero',
    pergunta: 'Com quantas semanas de gestação o bebê nasceu?',
  },
  {
    bloco: 'Gestação',
    campo: 'gestacao_multipla',
    tipo: 'simnao',
    pergunta: 'Foi gestação de gêmeos (ou mais)?',
  },
  {
    bloco: 'Gestação',
    campo: 'apresentacao_fetal',
    tipo: 'opcao',
    opcoes: APRESENTACAO_FETAL_OPCOES,
    pergunta: 'Como o bebê estava posicionado no fim da gestação?',
  },
  {
    bloco: 'Gestação',
    campo: 'circular_cordao',
    tipo: 'opcao',
    opcoes: SIM_NAO_NAO_SABE_OPCOES,
    pergunta: 'Teve circular de cordão?',
  },
  {
    bloco: 'Gestação',
    campo: 'intercorrencias_prenatais',
    tipo: 'texto',
    pergunta: 'Houve alguma intercorrência na gestação?',
  },
  {
    bloco: 'Parto',
    campo: 'tipo_parto',
    tipo: 'opcao',
    opcoes: [
      { valor: 'normal', label: 'Normal' },
      { valor: 'cesarea', label: 'Cesárea' },
    ],
    pergunta: 'Qual foi o tipo de parto?',
  },
  {
    bloco: 'Parto',
    campo: 'instrumentos_parto',
    tipo: 'multipla',
    opcoes: INSTRUMENTOS_PARTO_OPCOES,
    pergunta: 'Foi usado algum instrumento ou manobra no parto?',
  },
  {
    bloco: 'Parto',
    campo: 'intercorrencias_perinatais',
    tipo: 'texto',
    pergunta: 'Houve alguma intercorrência no parto?',
  },
  {
    bloco: 'Depois do nascimento',
    campo: 'local_internacao',
    tipo: 'opcao',
    opcoes: LOCAL_INTERNACAO_OPCOES,
    pergunta: 'Depois do nascimento, o bebê ficou onde?',
  },
  {
    bloco: 'Depois do nascimento',
    campo: 'tempo_internacao_dias',
    tipo: 'numero',
    pergunta: 'Quantos dias ficou internado?',
  },
  {
    bloco: 'Depois do nascimento',
    campo: 'assistencia_ventilatoria',
    tipo: 'simnao',
    pergunta: 'Precisou de ajuda para respirar (oxigênio, CPAP…)?',
  },
  {
    bloco: 'Rotina do bebê',
    campo: 'posicao_preferencia_opcao',
    tipo: 'opcao',
    opcoes: POSICAO_PREFERENCIA_OPCOES,
    pergunta: 'Para que lado o bebê prefere ficar ou olhar?',
  },
  {
    bloco: 'Rotina do bebê',
    campo: 'onde_dorme_opcao',
    tipo: 'opcao',
    opcoes: ONDE_DORME_OPCOES,
    pergunta: 'Onde o bebê dorme?',
  },
  {
    bloco: 'Rotina do bebê',
    campo: 'qualidade_sono_opcao',
    tipo: 'opcao',
    opcoes: QUALIDADE_SONO_OPCOES,
    pergunta: 'Como é o sono?',
  },
  {
    bloco: 'Rotina do bebê',
    campo: 'estado_emocional_opcoes',
    tipo: 'multipla',
    opcoes: ESTADO_EMOCIONAL_OPCOES,
    pergunta: 'Como o bebê costuma ficar?',
  },
  {
    bloco: 'Saúde',
    campo: 'refluxo_status',
    tipo: 'opcao',
    opcoes: SIM_NAO_SUSPEITA_OPCOES,
    pergunta: 'Tem refluxo?',
  },
  {
    bloco: 'Saúde',
    campo: 'aplv',
    tipo: 'opcao',
    opcoes: SIM_NAO_SUSPEITA_OPCOES,
    pergunta: 'Tem alergia à proteína do leite (APLV)?',
  },
  {
    bloco: 'Saúde',
    campo: 'disquesia',
    tipo: 'opcao',
    opcoes: SIM_NAO_SUSPEITA_OPCOES,
    pergunta: 'Faz muito esforço ou chora para evacuar?',
  },
  {
    bloco: 'Mais alguma coisa',
    campo: 'observacoes_familia',
    tipo: 'texto',
    pergunta: 'Quer contar mais alguma coisa para a fisioterapeuta?',
  },
];

const vazio = (v: unknown) =>
  v === null ||
  v === undefined ||
  v === '' ||
  (Array.isArray(v) && v.length === 0);

/**
 * Respostas dos pais → campos da avaliação, só onde a avaliação está vazia
 * (nunca sobrescreve o que a fisio já registrou). "observacoes_familia" vai
 * para as observações gerais, identificado como relato da família.
 */
export function aplicarRespostasAnamnese(
  av: AvaliacaoClinica,
  respostas: Record<string, unknown>
): AvaliacaoClinicaUpdate {
  const up: Record<string, unknown> = {};
  for (const p of PERGUNTAS_ANAMNESE) {
    const v = respostas[p.campo];
    if (vazio(v)) continue;
    if (p.campo === 'observacoes_familia') {
      const atual = av.observacoes_gerais?.trim();
      up.observacoes_gerais = `${atual ? `${atual}\n` : ''}Relato da família (anamnese): ${String(v).trim()}`;
      continue;
    }
    if (!vazio(av[p.campo as keyof AvaliacaoClinica])) continue;
    if (p.tipo === 'numero') {
      const n = Number(v);
      if (Number.isFinite(n)) up[p.campo] = n;
    } else if (p.tipo === 'simnao') {
      up[p.campo] = v === true || v === 'sim';
    } else up[p.campo] = v;
  }
  return up as AvaliacaoClinicaUpdate;
}

// --------------------------------------------------------------------- API

export async function fetchAvaliacaoPorAgendamento(
  agendamentoId: string
): Promise<{ id: string; status: string } | null> {
  const { data, error } = await supabase
    .from('avaliacoes_clinicas')
    .select('id, status')
    .eq('agendamento_id', agendamentoId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data?.[0] as { id: string; status: string }) ?? null;
}

export async function fetchUltimaAvaliacaoDoPaciente(
  pacienteId: string
): Promise<{ id: string; data_avaliacao: string } | null> {
  const { data, error } = await supabase
    .from('avaliacoes_clinicas')
    .select('id, data_avaliacao')
    .eq('pessoa_id', pacienteId)
    .order('data_avaliacao', { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data?.[0] as { id: string; data_avaliacao: string }) ?? null;
}

export async function criarConviteAnamnese(
  pacienteId: string,
  agendamentoId?: string | null
): Promise<string> {
  const { data, error } = await supabase.rpc('fn_anamnese_criar_convite', {
    p_paciente_id: pacienteId,
    p_agendamento_id: agendamentoId ?? null,
  });
  if (error) throw error;
  return data as string;
}

export const linkAnamnese = (token: string) =>
  `${window.location.origin}/#/anamnese/${token}`;

export const mensagemAnamnese = (nome: string, link: string) =>
  `Olá! Antes da avaliação de ${nome} na Respira Kids, pedimos que vocês respondam algumas perguntas sobre a gestação, o parto e a rotina do bebê. Leva poucos minutos e ajuda a fisioterapeuta a aproveitar melhor o tempo da consulta:\n${link}`;

export interface ConviteAnamnese {
  id: string;
  respondido_em: string | null;
  respostas: Record<string, unknown> | null;
  aplicado_em: string | null;
  criado_em: string;
}

/** Última anamnese respondida pelos pais e ainda não aplicada */
export async function fetchAnamnesePendente(
  pacienteId: string
): Promise<ConviteAnamnese | null> {
  const { data, error } = await supabase
    .from('anamnese_convites')
    .select('id, respondido_em, respostas, aplicado_em, criado_em')
    .eq('paciente_id', pacienteId)
    .not('respondido_em', 'is', null)
    .is('aplicado_em', null)
    .order('respondido_em', { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data?.[0] as ConviteAnamnese) ?? null;
}

export async function marcarAnamneseAplicada(
  conviteId: string,
  avaliacaoId: string
): Promise<void> {
  const { error } = await supabase.rpc('fn_anamnese_marcar_aplicada', {
    p_convite_id: conviteId,
    p_avaliacao_id: avaliacaoId,
  });
  if (error) throw error;
}

export interface AnamnesePublica {
  nome: string;
  expirado: boolean;
  respondido_em: string | null;
  respostas: Record<string, unknown> | null;
}

export async function buscarAnamnesePublica(
  token: string
): Promise<AnamnesePublica | null> {
  const { data, error } = await supabase.rpc('fn_public_anamnese_buscar', {
    p_token: token,
  });
  if (error) throw error;
  return (data as AnamnesePublica) ?? null;
}

export async function responderAnamnesePublica(
  token: string,
  respostas: Record<string, unknown>
): Promise<boolean> {
  const { data, error } = await supabase.rpc('fn_public_anamnese_responder', {
    p_token: token,
    p_respostas: respostas,
  });
  if (error) throw error;
  return data === true;
}

export async function fetchTelefonePaciente(
  pacienteId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('pessoas')
    .select('telefone')
    .eq('id', pacienteId)
    .maybeSingle();
  if (error) return null;
  const t = (data as { telefone?: string | number | null } | null)?.telefone;
  return t ? String(t) : null;
}
