// AI dev note: API específica para gerenciamento de pediatras
// Funções para busca e cadastro de pediatras no cadastro público de pacientes

import { supabase } from './supabase';
import { normalizeText } from './utils';

export interface Pediatra {
  id: string;
  pessoa_id: string;
  nome: string;
  crm?: string | null;
  especialidade?: string | null;
}

export interface PediatricianSearchResult {
  id: string; // pessoa_pediatra.id
  pessoaId: string; // pessoas.id
  nome: string;
  crm?: string | null;
  especialidade?: string | null;
}

/**
 * Buscar todos os pediatras ativos (para select/dropdown)
 * Usado por componentes internos do sistema
 */
export async function fetchPediatras(): Promise<Pediatra[]> {
  try {
    const { data, error } = await supabase
      .from('pessoas')
      .select(
        `
        id,
        nome,
        pessoa_pediatra!inner(
          id,
          crm,
          especialidade,
          ativo
        )
      `
      )
      .eq('ativo', true)
      .eq('pessoa_pediatra.ativo', true)
      .order('nome');

    if (error) {
      console.error('❌ [fetchPediatras] Erro:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Mapear resultados
    const pediatras: Pediatra[] = data
      .filter((p) => {
        return Array.isArray(p.pessoa_pediatra)
          ? p.pessoa_pediatra.length > 0
          : p.pessoa_pediatra !== null && p.pessoa_pediatra !== undefined;
      })
      .map((p) => {
        const pediatraData = Array.isArray(p.pessoa_pediatra)
          ? p.pessoa_pediatra[0]
          : p.pessoa_pediatra;

        return {
          id: pediatraData.id,
          pessoa_id: p.id,
          nome: p.nome,
          crm: pediatraData.crm,
          especialidade: pediatraData.especialidade,
        };
      });

    return pediatras;
  } catch (error) {
    console.error('❌ [fetchPediatras] Erro ao buscar pediatras:', error);
    throw error;
  }
}

/**
 * Buscar pediatras para autocomplete (acesso público)
 * Busca por nome com normalização para evitar duplicatas
 */
export async function searchPediatricians(
  searchTerm: string
): Promise<PediatricianSearchResult[]> {
  try {
    if (!searchTerm || searchTerm.length < 2) {
      return [];
    }

    // Remover prefixos comuns (Dr., Dra., Dr, Dra)
    const cleanedSearch = searchTerm.trim().replace(/^(dr\.?|dra\.?)\s*/i, '');

    // Normalizar para busca (remover acentos)
    const normalizedSearch = normalizeText(cleanedSearch);

    // Buscar pediatras ativos
    // AI dev note: Usar pessoas e pessoa_pediatra (não vw_usuarios_admin por questões de RLS)

    // Buscar todos os pediatras ativos e filtrar no cliente
    // (Supabase não suporta busca sem acento diretamente)
    const { data, error } = await supabase
      .from('pessoas')
      .select(
        `
        id,
        nome,
        pessoa_pediatra!inner(
          id,
          crm,
          especialidade,
          ativo
        )
      `
      )
      .eq('ativo', true)
      .eq('pessoa_pediatra.ativo', true)
      .order('nome');

    if (error) {
      console.error('❌ [searchPediatricians] Erro:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Mapear e filtrar resultados (incluindo normalização de acentos)
    // AI dev note: Com !inner, pessoa_pediatra vem como array ou objeto
    const results: PediatricianSearchResult[] = data
      .filter((p) => {
        const hasPediatra = Array.isArray(p.pessoa_pediatra)
          ? p.pessoa_pediatra.length > 0
          : p.pessoa_pediatra !== null && p.pessoa_pediatra !== undefined;

        if (!hasPediatra) return false;

        // Filtrar por nome normalizado (sem acentos)
        const normalizedNome = normalizeText(p.nome);
        return normalizedNome.includes(normalizedSearch);
      })
      .map((p) => {
        const pediatraData = Array.isArray(p.pessoa_pediatra)
          ? p.pessoa_pediatra[0]
          : p.pessoa_pediatra;

        return {
          id: pediatraData.id, // ID da tabela pessoa_pediatra
          pessoaId: p.id, // ID da tabela pessoas
          nome: p.nome,
          crm: pediatraData.crm,
          especialidade: pediatraData.especialidade,
        };
      })
      .slice(0, 10); // Limitar a 10 resultados

    return results;
  } catch (error) {
    console.error('❌ [searchPediatricians] Erro ao buscar pediatras:', error);
    return [];
  }
}

/**
 * Verificar se pediatra já existe por nome (para evitar duplicatas)
 */
export async function checkPediatricianExists(nome: string): Promise<{
  exists: boolean;
  pediatrician?: PediatricianSearchResult;
}> {
  try {
    // Normalizar nome para comparação
    const normalizedNome = normalizeText(nome.trim());

    const { data, error } = await supabase
      .from('pessoas')
      .select(
        `
        id,
        nome,
        pessoa_pediatra!inner(
          id,
          crm,
          especialidade,
          ativo
        )
      `
      )
      .eq('ativo', true)
      .eq('pessoa_pediatra.ativo', true);

    if (error) {
      console.error('❌ [checkPediatricianExists] Erro:', error);
      return { exists: false };
    }

    if (!data || data.length === 0) {
      return { exists: false };
    }

    // Buscar match exato por nome normalizado
    const match = data.find((p) => normalizeText(p.nome) === normalizedNome);

    if (match) {
      return {
        exists: true,
        pediatrician: {
          id: match.pessoa_pediatra[0].id,
          pessoaId: match.id,
          nome: match.nome,
          crm: match.pessoa_pediatra[0].crm,
          especialidade: match.pessoa_pediatra[0].especialidade,
        },
      };
    }

    return { exists: false };
  } catch (error) {
    console.error('❌ [checkPediatricianExists] Erro:', error);
    return { exists: false };
  }
}
