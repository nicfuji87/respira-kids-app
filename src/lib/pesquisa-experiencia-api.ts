// AI dev note: API da Pesquisa de Experiência Respira Kids.
// - submitPesquisa: usado pela página pública (anon).
// - fetchPesquisas / computeStats: usados pelo dashboard admin (RLS restringe).
// A tabela é anônima — não persistimos nome/contato/IP nessa tabela.

import { supabase } from './supabase';
import { SURVEY_QUESTIONS } from './pesquisa-experiencia-questions';
import type {
  DistribuicaoItem,
  PesquisaExperienciaResposta,
  PesquisaExperienciaRow,
  PesquisaExperienciaStats,
  SurveyQuestion,
} from '@/types/pesquisa-experiencia';

const TABLE = 'pesquisas_experiencia';

/**
 * Sanitiza o payload antes de enviar:
 * - converte string vazia em null
 * - garante arrays para multi-choice
 * - clampa notas 1-10
 */
function sanitizePayload(
  resposta: PesquisaExperienciaResposta
): PesquisaExperienciaResposta {
  const clean: PesquisaExperienciaResposta = {};

  const stringFields: (keyof PesquisaExperienciaResposta)[] = [
    'como_conheceu',
    'profissional_indicou',
    'motivo_principal',
    'tempo_acompanhamento',
    'idade_filho',
    'quantidade_filhos',
    'faixa_etaria',
    'profissao',
    'conteudo_redes',
    'hoje_ve_como',
    'o_que_mais_ama',
    'o_que_melhorar',
  ];

  for (const key of stringFields) {
    const v = resposta[key];
    if (typeof v === 'string') {
      const trimmed = v.trim();
      if (trimmed.length > 0) {
        // Limitar texto longo para evitar abusos
        (clean as Record<string, unknown>)[key] = trimmed.slice(0, 1000);
      }
    }
  }

  const arrayFields: (keyof PesquisaExperienciaResposta)[] = [
    'motivos_confianca',
    'como_se_sente',
    'ambiente_transmite',
    'como_definiria',
    'se_fosse_pessoa',
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

  const items: DistribuicaoItem[] = Array.from(counts.entries())
    .map(([value, count]) => ({
      value,
      label: labelMap.get(value) || value,
      count,
      percent: validos > 0 ? Math.round((count / validos) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return items;
}

function distribuicaoMulti(
  rows: PesquisaExperienciaRow[],
  field: keyof PesquisaExperienciaResposta
): DistribuicaoItem[] {
  const question = SURVEY_QUESTIONS.find((q) => q.id === field);
  const labelMap = buildLabelMap(question);
  const counts = new Map<string, number>();
  // Para multi-choice usamos como base o número de respondentes que selecionaram pelo menos uma opção.
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

  const items: DistribuicaoItem[] = Array.from(counts.entries())
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

  return items;
}

function media(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return Number((sum / values.length).toFixed(2));
}

function npsBreakdown(rows: PesquisaExperienciaRow[]) {
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
    distribuicaoConteudoRedes: distribuicaoSingle(rows, 'conteudo_redes'),
    distribuicaoHojeVeComo: distribuicaoSingle(rows, 'hoje_ve_como'),
    distribuicaoMotivosConfianca: distribuicaoMulti(rows, 'motivos_confianca'),
    distribuicaoComoSeSente: distribuicaoMulti(rows, 'como_se_sente'),
    distribuicaoAmbienteTransmite: distribuicaoMulti(
      rows,
      'ambiente_transmite'
    ),
    distribuicaoComoDefiniria: distribuicaoMulti(rows, 'como_definiria'),
    distribuicaoSeFossePessoa: distribuicaoMulti(rows, 'se_fosse_pessoa'),
  };
}
