// AI dev note: Funções para matching fuzzy de produtos
// Usado para sugerir produtos existentes ao validar pré-lançamentos
// Implementa algoritmo de similaridade de strings (Levenshtein + tokenização)

import { supabase } from './supabase';

export interface Produto {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  unidade_medida: string;
  preco_referencia: number;
  categoria_contabil_id: string | null;
}

export interface ProdutoMatch {
  produto: Produto;
  score: number; // 0-100
  matchType: 'exact' | 'high' | 'medium' | 'low';
}

export interface SugestaoProduto {
  descricao_original: string;
  produto_match: ProdutoMatch | null;
  sugestao_criar: boolean;
  codigo_sugerido: string;
  categoria_sugerida_id: string | null;
}

// Normalizar texto para comparação
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^a-z0-9\s]/g, ' ') // Remove caracteres especiais
    .replace(/\s+/g, ' ') // Remove espaços múltiplos
    .trim();
}

// Tokenizar texto em palavras
function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(' ')
    .filter((t) => t.length > 2); // Ignora palavras muito curtas
}

// Calcular distância de Levenshtein
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;

  if (m === 0) return n;
  if (n === 0) return m;

  const matrix: number[][] = [];

  for (let i = 0; i <= m; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= n; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[m][n];
}

// Calcular similaridade baseada em Levenshtein (0-100)
function levenshteinSimilarity(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);
  if (maxLength === 0) return 100;
  return Math.round((1 - distance / maxLength) * 100);
}

// Calcular similaridade baseada em tokens (Jaccard)
function tokenSimilarity(text1: string, text2: string): number {
  const tokens1 = new Set(tokenize(text1));
  const tokens2 = new Set(tokenize(text2));

  if (tokens1.size === 0 || tokens2.size === 0) return 0;

  const intersection = new Set([...tokens1].filter((t) => tokens2.has(t)));
  const union = new Set([...tokens1, ...tokens2]);

  return Math.round((intersection.size / union.size) * 100);
}

// Calcular score de matching combinado
function calculateMatchScore(descricao: string, produto: Produto): number {
  const normalizedDesc = normalizeText(descricao);
  const normalizedNome = normalizeText(produto.nome);
  const normalizedCodigo = normalizeText(produto.codigo);

  // Match exato com nome ou código
  if (
    normalizedDesc === normalizedNome ||
    normalizedDesc === normalizedCodigo
  ) {
    return 100;
  }

  // Contém nome completo
  if (
    normalizedDesc.includes(normalizedNome) ||
    normalizedNome.includes(normalizedDesc)
  ) {
    return 90;
  }

  // Calcular similaridades
  const levenshteinScore = levenshteinSimilarity(
    normalizedDesc,
    normalizedNome
  );
  const tokenScore = tokenSimilarity(descricao, produto.nome);

  // Se produto tem descrição, considerar também
  let descriptionScore = 0;
  if (produto.descricao) {
    descriptionScore = Math.max(
      levenshteinSimilarity(normalizedDesc, normalizeText(produto.descricao)),
      tokenSimilarity(descricao, produto.descricao)
    );
  }

  // Combinar scores (peso maior para tokens)
  const combinedScore = Math.max(
    levenshteinScore * 0.3 + tokenScore * 0.7,
    descriptionScore * 0.5
  );

  return Math.round(combinedScore);
}

// Determinar tipo de match baseado no score
function getMatchType(score: number): 'exact' | 'high' | 'medium' | 'low' {
  if (score >= 95) return 'exact';
  if (score >= 75) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

// Gerar código sugerido para novo produto
export function gerarCodigoProduto(descricao: string): string {
  const tokens = tokenize(descricao);
  if (tokens.length === 0) return 'PROD';

  // Pegar as primeiras letras das palavras principais
  const codigo = tokens
    .slice(0, 3)
    .map((t) => t.substring(0, 4).toUpperCase())
    .join('-');

  return codigo || 'PROD';
}

// Buscar produtos similares no banco
export async function buscarProdutosSimilares(
  descricao: string,
  limite: number = 5
): Promise<ProdutoMatch[]> {
  if (!descricao || descricao.length < 3) return [];

  try {
    // Buscar todos os produtos ativos (para matching local)
    // Em produção com muitos produtos, fazer busca mais inteligente no servidor
    const { data: produtos, error } = await supabase
      .from('produtos_servicos')
      .select(
        'id, codigo, nome, descricao, unidade_medida, preco_referencia, categoria_contabil_id'
      )
      .eq('ativo', true)
      .order('nome');

    if (error || !produtos) return [];

    // Calcular scores para cada produto
    const matches: ProdutoMatch[] = produtos
      .map((produto) => ({
        produto,
        score: calculateMatchScore(descricao, produto),
        matchType: getMatchType(calculateMatchScore(descricao, produto)),
      }))
      .filter((m) => m.score >= 30) // Filtrar matches muito baixos
      .sort((a, b) => b.score - a.score)
      .slice(0, limite);

    return matches;
  } catch (error) {
    console.error('Erro ao buscar produtos similares:', error);
    return [];
  }
}

// Gerar sugestão para um item de pré-lançamento
export async function gerarSugestaoProduto(
  descricao: string,
  categoriaId: string | null
): Promise<SugestaoProduto> {
  const matches = await buscarProdutosSimilares(descricao);

  const melhorMatch =
    matches.length > 0 && matches[0].score >= 50 ? matches[0] : null;

  return {
    descricao_original: descricao,
    produto_match: melhorMatch,
    sugestao_criar: !melhorMatch || melhorMatch.score < 70,
    codigo_sugerido: gerarCodigoProduto(descricao),
    categoria_sugerida_id: categoriaId,
  };
}

// Criar produto rápido a partir de sugestão
// AI dev note: Fornecedor não é mais vinculado ao produto
// Agora é gerenciado via tabela produto_fornecedor (N:N)
export async function criarProdutoRapido(
  codigo: string,
  nome: string,
  categoriaId: string | null,
  precoReferencia: number = 0,
  criadoPor: string | null
): Promise<{ success: boolean; produto?: Produto; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('produtos_servicos')
      .insert({
        codigo: codigo.toUpperCase(),
        nome,
        descricao: null,
        unidade_medida: 'unidade',
        categoria_contabil_id: categoriaId,
        preco_referencia: precoReferencia,
        ativo: true,
        criado_por: criadoPor,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'Código já existe' };
      }
      throw error;
    }

    return { success: true, produto: data };
  } catch (error) {
    console.error('Erro ao criar produto:', error);
    return { success: false, error: 'Erro ao criar produto' };
  }
}
