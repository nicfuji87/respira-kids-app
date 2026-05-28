// AI dev note: API da Pesquisa de Experiência Respira Kids.
// - submitPesquisa: usado pela página pública (anon).
// - fetchPesquisas / computeStats / computeInsights: dashboard admin (RLS restringe).
// A tabela é anônima — não persistimos nome/contato/IP nessa tabela.

import { supabase } from './supabase';
import { SURVEY_QUESTIONS } from './pesquisa-experiencia-questions';
import type {
  CorrelacaoNotas,
  DashboardFilters,
  DistribuicaoItem,
  NpsBreakdown,
  NpsCategory,
  NpsSegmento,
  PerfilGrupo,
  PesquisaExperienciaInsights,
  PesquisaExperienciaResposta,
  PesquisaExperienciaRow,
  PesquisaExperienciaStats,
  RankingPediatra,
  SurveyQuestion,
} from '@/types/pesquisa-experiencia';

const TABLE = 'pesquisas_experiencia';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

/**
 * Sanitiza o payload antes de enviar:
 * - converte string vazia em null
 * - garante arrays para multi-choice
 * - clampa notas 1-10
 * - valida UUIDs em pediatra_id (descarta sentinela "__outro__")
 */
function sanitizePayload(
  resposta: PesquisaExperienciaResposta
): PesquisaExperienciaResposta {
  const clean: PesquisaExperienciaResposta = {};

  const stringFields: (keyof PesquisaExperienciaResposta)[] = [
    'como_conheceu',
    'pediatra_nome_outro',
    'profissional_indicou',
    'motivo_principal',
    'tempo_acompanhamento',
    'idade_filho',
    'quantidade_filhos',
    'faixa_etaria',
    'profissao',
    'conteudo_redes',
    'hoje_ve_como',
    'criterio_decisao',
    'entrega_atendimento',
    'comparacao_outras_experiencias',
    'traz_tranquilidade',
    'custo_beneficio',
    'o_que_mais_ama',
    'o_que_melhorar',
  ];

  for (const key of stringFields) {
    const v = resposta[key];
    if (typeof v === 'string') {
      const trimmed = v.trim();
      if (trimmed.length > 0) {
        (clean as Record<string, unknown>)[key] = trimmed.slice(0, 1000);
      }
    }
  }

  // pediatra_id: aceitar apenas UUIDs válidos
  if (isUuid(resposta.pediatra_id)) {
    clean.pediatra_id = resposta.pediatra_id;
  }

  const arrayFields: (keyof PesquisaExperienciaResposta)[] = [
    'motivos_confianca',
    'como_se_sente',
    'ambiente_transmite',
    'como_definiria',
    'surpresa_positiva',
    'o_que_vale_pena',
  ];
  for (const key of arrayFields) {
    const v = resposta[key];
    if (Array.isArray(v) && v.length > 0) {
      (clean as Record<string, unknown>)[key] = v
        .filter((item): item is string => typeof item === 'string')
        .slice(0, 20);
    }
  }

  if (typeof resposta.nota_confianca === 'number') {
    const n = Math.round(resposta.nota_confianca);
    if (n >= 1 && n <= 10) clean.nota_confianca = n;
  }
  if (typeof resposta.nota_indicacao === 'number') {
    const n = Math.round(resposta.nota_indicacao);
    if (n >= 1 && n <= 10) clean.nota_indicacao = n;
  }

  return clean;
}

/**
 * Envia a pesquisa concluída de forma anônima.
 *
 * AI dev note: Não usamos `.select()` aqui de propósito.
 * Anon NÃO tem policy SELECT na tabela (apenas admin lê), então
 * INSERT ... RETURNING seria bloqueado por RLS. Como esta pesquisa
 * é totalmente anônima, o cliente também não precisa do id.
 */
export async function submitPesquisaExperiencia(
  resposta: PesquisaExperienciaResposta
): Promise<{ ok: true }> {
  const payload = sanitizePayload(resposta);
  const { error } = await supabase.from(TABLE).insert(payload);
  if (error) {
    console.error('[pesquisa-experiencia] erro ao enviar:', error);
    throw error;
  }
  return { ok: true };
}

/**
 * Busca todas as respostas (admin, ordenado por mais recente).
 */
export async function fetchPesquisasExperiencia(): Promise<
  PesquisaExperienciaRow[]
> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[pesquisa-experiencia] erro ao buscar:', error);
    throw error;
  }

  return (data || []) as PesquisaExperienciaRow[];
}

/**
 * Busca nomes dos pediatras que possuem indicações na pesquisa (para filtros e ranking).
 */
export async function fetchPediatrasNomes(
  ids: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;

  // pessoa_pediatra -> pessoa.id -> nome
  const { data, error } = await supabase
    .from('pessoa_pediatra')
    .select('id, pessoa:pessoas!pessoa_pediatra_pessoa_id_fkey(nome)')
    .in('id', ids);

  if (error) {
    console.error('[pesquisa-experiencia] erro ao buscar pediatras:', error);
    return map;
  }

  for (const row of data || []) {
    const pessoa = (row as { pessoa?: { nome?: string } | { nome?: string }[] })
      .pessoa;
    let nome = '';
    if (Array.isArray(pessoa)) {
      nome = pessoa[0]?.nome || '';
    } else if (pessoa) {
      nome = pessoa.nome || '';
    }
    map.set((row as { id: string }).id, nome || 'Pediatra');
  }

  return map;
}

// =====================================================
// FILTROS
// =====================================================

/** Classifica nota NPS em categoria. */
export function classifyNps(
  nota: number | undefined | null
): NpsCategory | null {
  if (typeof nota !== 'number') return null;
  if (nota >= 9) return 'promotor';
  if (nota >= 7) return 'neutro';
  return 'detrator';
}

/** Verifica se um array de filtros contém o valor (ou está vazio = passa). */
function passesArrayFilter<T>(
  filter: T[] | undefined,
  value: T | undefined
): boolean {
  if (!filter || filter.length === 0) return true;
  if (value === undefined || value === null) return false;
  return filter.includes(value);
}

/**
 * Aplica filtros do dashboard nas rows.
 */
export function applyFilters(
  rows: PesquisaExperienciaRow[],
  filters: DashboardFilters
): PesquisaExperienciaRow[] {
  if (!filters) return rows;

  const startMs = filters.startDate
    ? new Date(`${filters.startDate}T00:00:00`).getTime()
    : null;
  const endMs = filters.endDate
    ? new Date(`${filters.endDate}T23:59:59.999`).getTime()
    : null;

  return rows.filter((row) => {
    // Data
    if (startMs !== null || endMs !== null) {
      const t = new Date(row.created_at).getTime();
      if (startMs !== null && t < startMs) return false;
      if (endMs !== null && t > endMs) return false;
    }
    // Single-choice fields
    if (!passesArrayFilter(filters.canais, row.como_conheceu)) return false;
    if (!passesArrayFilter(filters.pediatras, row.pediatra_id ?? undefined))
      return false;
    if (
      !passesArrayFilter(filters.temposAcompanhamento, row.tempo_acompanhamento)
    )
      return false;
    if (!passesArrayFilter(filters.idadesFilho, row.idade_filho)) return false;
    if (!passesArrayFilter(filters.motivos, row.motivo_principal)) return false;
    // Categoria NPS
    if (filters.npsCategorias && filters.npsCategorias.length > 0) {
      const cat = classifyNps(row.nota_indicacao);
      if (!cat) return false;
      if (!filters.npsCategorias.includes(cat)) return false;
    }
    return true;
  });
}

// =====================================================
// AGREGAÇÕES (client-side a partir das rows)
// =====================================================

function buildLabelMap(question: SurveyQuestion | undefined) {
  const map = new Map<string, string>();
  if (!question?.options) return map;
  for (const opt of question.options) {
    map.set(opt.value, opt.label);
  }
  return map;
}

function distribuicaoSingle(
  rows: PesquisaExperienciaRow[],
  field: keyof PesquisaExperienciaResposta
): DistribuicaoItem[] {
  const question = SURVEY_QUESTIONS.find((q) => q.id === field);
  const labelMap = buildLabelMap(question);
  const counts = new Map<string, number>();
  let validos = 0;

  for (const row of rows) {
    const v = row[field];
    if (typeof v === 'string' && v.length > 0) {
      counts.set(v, (counts.get(v) || 0) + 1);
      validos++;
    }
  }

  return Array.from(counts.entries())
    .map(([value, count]) => ({
      value,
      label: labelMap.get(value) || value,
      count,
      percent: validos > 0 ? Math.round((count / validos) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

function distribuicaoMulti(
  rows: PesquisaExperienciaRow[],
  field: keyof PesquisaExperienciaResposta
): DistribuicaoItem[] {
  const question = SURVEY_QUESTIONS.find((q) => q.id === field);
  const labelMap = buildLabelMap(question);
  const counts = new Map<string, number>();
  let respondentesValidos = 0;

  for (const row of rows) {
    const v = row[field];
    if (Array.isArray(v) && v.length > 0) {
      respondentesValidos++;
      for (const item of v) {
        if (typeof item === 'string' && item.length > 0) {
          counts.set(item, (counts.get(item) || 0) + 1);
        }
      }
    }
  }

  return Array.from(counts.entries())
    .map(([value, count]) => ({
      value,
      label: labelMap.get(value) || value,
      count,
      percent:
        respondentesValidos > 0
          ? Math.round((count / respondentesValidos) * 100)
          : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

function media(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return Number((sum / values.length).toFixed(2));
}

function npsBreakdown(rows: PesquisaExperienciaRow[]): NpsBreakdown {
  const notas = rows
    .map((r) => r.nota_indicacao)
    .filter((n): n is number => typeof n === 'number');

  const total = notas.length;
  const promotores = notas.filter((n) => n >= 9).length;
  const detratores = notas.filter((n) => n <= 6).length;
  const neutros = total - promotores - detratores;

  const nps =
    total > 0 ? Math.round(((promotores - detratores) / total) * 100) : 0;

  return { promotores, neutros, detratores, total, nps };
}

function distribuicaoNota(
  rows: PesquisaExperienciaRow[],
  field: 'nota_confianca' | 'nota_indicacao'
): number[] {
  const buckets = new Array(10).fill(0) as number[];
  for (const row of rows) {
    const n = row[field];
    if (typeof n === 'number' && n >= 1 && n <= 10) {
      buckets[n - 1] += 1;
    }
  }
  return buckets;
}

function respostasPorDia(rows: PesquisaExperienciaRow[]) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const dias: Array<{ data: string; total: number }> = [];
  const indexByKey = new Map<string, number>();

  for (let i = 29; i >= 0; i--) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    indexByKey.set(key, dias.length);
    dias.push({ data: key, total: 0 });
  }

  for (const row of rows) {
    if (!row.created_at) continue;
    const key = new Date(row.created_at).toISOString().slice(0, 10);
    const idx = indexByKey.get(key);
    if (typeof idx === 'number') {
      dias[idx].total += 1;
    }
  }

  return dias;
}

/**
 * Computa todas as métricas para o dashboard (client-side).
 */
export function computePesquisaStats(
  rows: PesquisaExperienciaRow[]
): PesquisaExperienciaStats {
  const agora = Date.now();
  const ms30 = 30 * 24 * 60 * 60 * 1000;
  const ms7 = 7 * 24 * 60 * 60 * 1000;

  const respostasUltimos30Dias = rows.filter(
    (r) => agora - new Date(r.created_at).getTime() <= ms30
  ).length;
  const respostasUltimos7Dias = rows.filter(
    (r) => agora - new Date(r.created_at).getTime() <= ms7
  ).length;

  const notasConfianca = rows
    .map((r) => r.nota_confianca)
    .filter((n): n is number => typeof n === 'number');
  const notasIndicacao = rows
    .map((r) => r.nota_indicacao)
    .filter((n): n is number => typeof n === 'number');

  return {
    totalRespostas: rows.length,
    respostasUltimos30Dias,
    respostasUltimos7Dias,
    notaConfiancaMedia: media(notasConfianca),
    notaIndicacaoMedia: media(notasIndicacao),
    nps: npsBreakdown(rows),
    distribuicaoConfianca: distribuicaoNota(rows, 'nota_confianca'),
    distribuicaoIndicacao: distribuicaoNota(rows, 'nota_indicacao'),
    respostasPorDia: respostasPorDia(rows),
    distribuicaoComoConheceu: distribuicaoSingle(rows, 'como_conheceu'),
    distribuicaoMotivoPrincipal: distribuicaoSingle(rows, 'motivo_principal'),
    distribuicaoTempoAcompanhamento: distribuicaoSingle(
      rows,
      'tempo_acompanhamento'
    ),
    distribuicaoIdadeFilho: distribuicaoSingle(rows, 'idade_filho'),
    distribuicaoFaixaEtaria: distribuicaoSingle(rows, 'faixa_etaria'),
    distribuicaoProfissao: distribuicaoSingle(rows, 'profissao'),
    distribuicaoQuantidadeFilhos: distribuicaoSingle(rows, 'quantidade_filhos'),
    distribuicaoConteudoRedes: distribuicaoSingle(rows, 'conteudo_redes'),
    distribuicaoHojeVeComo: distribuicaoSingle(rows, 'hoje_ve_como'),
    distribuicaoCriterioDecisao: distribuicaoSingle(rows, 'criterio_decisao'),
    distribuicaoEntregaAtendimento: distribuicaoSingle(
      rows,
      'entrega_atendimento'
    ),
    distribuicaoComparacaoOutras: distribuicaoSingle(
      rows,
      'comparacao_outras_experiencias'
    ),
    distribuicaoTrazTranquilidade: distribuicaoSingle(
      rows,
      'traz_tranquilidade'
    ),
    distribuicaoCustoBeneficio: distribuicaoSingle(rows, 'custo_beneficio'),
    distribuicaoMotivosConfianca: distribuicaoMulti(rows, 'motivos_confianca'),
    distribuicaoComoSeSente: distribuicaoMulti(rows, 'como_se_sente'),
    distribuicaoAmbienteTransmite: distribuicaoMulti(
      rows,
      'ambiente_transmite'
    ),
    distribuicaoComoDefiniria: distribuicaoMulti(rows, 'como_definiria'),
    distribuicaoSurpresaPositiva: distribuicaoMulti(rows, 'surpresa_positiva'),
    distribuicaoOQueValePena: distribuicaoMulti(rows, 'o_que_vale_pena'),
  };
}

// =====================================================
// INSIGHTS ESTRATÉGICOS
// =====================================================

function buildSegmentoNps(
  rows: PesquisaExperienciaRow[],
  field: keyof PesquisaExperienciaResposta,
  /** Quando informado, mapeia value → label (ex.: pediatra_id → nome). */
  labelOverride?: Map<string, string>
): NpsSegmento[] {
  const question = SURVEY_QUESTIONS.find((q) => q.id === field);
  const labelMap = labelOverride || buildLabelMap(question);

  // Agrupar rows pelo valor do campo
  const groups = new Map<string, PesquisaExperienciaRow[]>();
  for (const row of rows) {
    const v = row[field];
    if (typeof v !== 'string' || v.length === 0) continue;
    const arr = groups.get(v) || [];
    arr.push(row);
    groups.set(v, arr);
  }

  const segments: NpsSegmento[] = [];
  for (const [value, groupRows] of groups.entries()) {
    const breakdown = npsBreakdown(groupRows);
    const mediaNotaInd = media(
      groupRows
        .map((r) => r.nota_indicacao)
        .filter((n): n is number => typeof n === 'number')
    );
    const mediaNotaConf = media(
      groupRows
        .map((r) => r.nota_confianca)
        .filter((n): n is number => typeof n === 'number')
    );
    segments.push({
      key: value,
      label: labelMap.get(value) || value,
      nps: breakdown,
      mediaNotaIndicacao: mediaNotaInd,
      mediaNotaConfianca: mediaNotaConf,
    });
  }

  // Ordenar por total de respondentes (maior primeiro)
  return segments.sort((a, b) => b.nps.total - a.nps.total);
}

function buildRankingPediatras(
  rows: PesquisaExperienciaRow[],
  pediatraNomes: Map<string, string>
): RankingPediatra[] {
  const groups = new Map<string, PesquisaExperienciaRow[]>();
  for (const row of rows) {
    if (!row.pediatra_id) continue;
    const arr = groups.get(row.pediatra_id) || [];
    arr.push(row);
    groups.set(row.pediatra_id, arr);
  }

  const ranking: RankingPediatra[] = [];
  for (const [id, groupRows] of groups.entries()) {
    const breakdown = npsBreakdown(groupRows);
    const mediaNotaInd = media(
      groupRows
        .map((r) => r.nota_indicacao)
        .filter((n): n is number => typeof n === 'number')
    );
    const mediaNotaConf = media(
      groupRows
        .map((r) => r.nota_confianca)
        .filter((n): n is number => typeof n === 'number')
    );
    ranking.push({
      pediatra_id: id,
      nome: pediatraNomes.get(id) || 'Pediatra desconhecido',
      total_indicacoes: groupRows.length,
      nps: breakdown,
      mediaNotaConfianca: mediaNotaConf,
      mediaNotaIndicacao: mediaNotaInd,
    });
  }

  // Ordenar por total de indicações (maior primeiro)
  return ranking.sort((a, b) => b.total_indicacoes - a.total_indicacoes);
}

/**
 * Calcula correlação de Pearson entre dois campos numéricos (1-10).
 */
function correlacao(
  rows: PesquisaExperienciaRow[],
  fieldX: 'nota_confianca' | 'nota_indicacao' | 'custo_beneficio_score',
  fieldY: 'nota_confianca' | 'nota_indicacao'
): CorrelacaoNotas {
  // custo_beneficio precisa ser mapeado para escala numérica
  const CUSTO_BENEF_SCORE: Record<string, number> = {
    excelente: 10,
    muito_bom: 8,
    bom: 6,
    regular: 4,
    ruim: 2,
  };

  const pares: Array<{ x: number; y: number }> = [];
  for (const row of rows) {
    let x: number | undefined;
    if (fieldX === 'custo_beneficio_score') {
      const cb = row.custo_beneficio;
      x = cb ? CUSTO_BENEF_SCORE[cb] : undefined;
    } else {
      x = row[fieldX];
    }
    const y = row[fieldY];

    if (typeof x === 'number' && typeof y === 'number') {
      pares.push({ x, y });
    }
  }

  const n = pares.length;
  if (n < 2) {
    return { coeficiente: 0, total: n, pontos: [] };
  }

  const meanX = pares.reduce((a, p) => a + p.x, 0) / n;
  const meanY = pares.reduce((a, p) => a + p.y, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (const p of pares) {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const denom = Math.sqrt(denX * denY);
  const coeficiente = denom === 0 ? 0 : Number((num / denom).toFixed(3));

  // Agregar pontos para scatter (mesmo par (x,y) conta múltiplas vezes)
  const pointMap = new Map<string, { x: number; y: number; count: number }>();
  for (const p of pares) {
    const key = `${p.x}_${p.y}`;
    const existing = pointMap.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      pointMap.set(key, { x: p.x, y: p.y, count: 1 });
    }
  }

  return {
    coeficiente,
    total: n,
    pontos: Array.from(pointMap.values()),
  };
}

function buildPerfilGrupo(rows: PesquisaExperienciaRow[]): PerfilGrupo {
  const notasConf = rows
    .map((r) => r.nota_confianca)
    .filter((n): n is number => typeof n === 'number');
  const notasInd = rows
    .map((r) => r.nota_indicacao)
    .filter((n): n is number => typeof n === 'number');

  return {
    totalRespondentes: rows.length,
    mediaNotaConfianca: media(notasConf),
    mediaNotaIndicacao: media(notasInd),
    topMotivosConfianca: distribuicaoMulti(rows, 'motivos_confianca').slice(
      0,
      5
    ),
    topComoSeSente: distribuicaoMulti(rows, 'como_se_sente').slice(0, 5),
    topMotivoPrincipal: distribuicaoSingle(rows, 'motivo_principal').slice(
      0,
      5
    ),
    topIdadeFilho: distribuicaoSingle(rows, 'idade_filho').slice(0, 5),
    topTempoAcompanhamento: distribuicaoSingle(
      rows,
      'tempo_acompanhamento'
    ).slice(0, 5),
    topComoConheceu: distribuicaoSingle(rows, 'como_conheceu').slice(0, 5),
    topProfissao: distribuicaoSingle(rows, 'profissao').slice(0, 5),
    topFaixaEtaria: distribuicaoSingle(rows, 'faixa_etaria').slice(0, 5),
    topCustoBeneficio: distribuicaoSingle(rows, 'custo_beneficio').slice(0, 5),
    topOQueValePena: distribuicaoMulti(rows, 'o_que_vale_pena').slice(0, 5),
    topSurpresaPositiva: distribuicaoMulti(rows, 'surpresa_positiva').slice(
      0,
      5
    ),
    comentariosAma: rows
      .map((r) => (r.o_que_mais_ama || '').trim())
      .filter((c) => c.length > 0)
      .slice(0, 10),
    comentariosMelhorar: rows
      .map((r) => (r.o_que_melhorar || '').trim())
      .filter((c) => c.length > 0)
      .slice(0, 10),
  };
}

/**
 * Computa todos os insights estratégicos para a aba "Insights" do dashboard.
 */
export function computePesquisaInsights(
  rows: PesquisaExperienciaRow[],
  pediatraNomes: Map<string, string>
): PesquisaExperienciaInsights {
  const promotores = rows.filter(
    (r) => classifyNps(r.nota_indicacao) === 'promotor'
  );
  const detratores = rows.filter(
    (r) => classifyNps(r.nota_indicacao) === 'detrator'
  );
  const neutros = rows.filter(
    (r) => classifyNps(r.nota_indicacao) === 'neutro'
  );

  return {
    npsPorCanal: buildSegmentoNps(rows, 'como_conheceu'),
    npsPorTempoAcompanhamento: buildSegmentoNps(rows, 'tempo_acompanhamento'),
    npsPorIdadeFilho: buildSegmentoNps(rows, 'idade_filho'),
    npsPorMotivo: buildSegmentoNps(rows, 'motivo_principal'),
    rankingPediatras: buildRankingPediatras(rows, pediatraNomes),
    correlacaoConfiancaIndicacao: correlacao(
      rows,
      'nota_confianca',
      'nota_indicacao'
    ),
    correlacaoCustoBeneficioIndicacao: correlacao(
      rows,
      'custo_beneficio_score',
      'nota_indicacao'
    ),
    perfilPromotores: buildPerfilGrupo(promotores),
    perfilDetratores: buildPerfilGrupo(detratores),
    perfilNeutros: buildPerfilGrupo(neutros),
  };
}

/**
 * Extrai a lista única de IDs de pediatras presentes nas rows (para fetch de nomes).
 */
export function extractPediatraIds(rows: PesquisaExperienciaRow[]): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    if (row.pediatra_id) set.add(row.pediatra_id);
  }
  return Array.from(set);
}
