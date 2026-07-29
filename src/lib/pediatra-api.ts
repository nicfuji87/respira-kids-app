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

// AI dev note: SEGURANÇA (29/07/2026) — este arquivo roda no cadastro PÚBLICO, com a
// anon key. As três funções faziam a mesma query em `pessoas` ⋈ `pessoa_pediatra`, o
// que exigia deixar `pessoas` aberta ao anon. Agora todas passam pela RPC
// `fn_public_listar_pediatras` (SECURITY DEFINER), que expõe apenas nome/CRM/
// especialidade dos 312 pediatras ativos. Ver PLANO_FINANCEIRO_IMPLANTACAO.md (F0-bis).

interface PediatraRpcRow {
  pediatra_id: string;
  pessoa_id: string;
  nome: string;
  crm: string | null;
  especialidade: string | null;
}

async function listarPediatrasAtivos(): Promise<PediatraRpcRow[]> {
  const { data, error } = await supabase.rpc('fn_public_listar_pediatras');
  if (error) throw error;
  return (data as PediatraRpcRow[]) || [];
}

/**
 * Buscar todos os pediatras ativos (para select/dropdown)
 * Usado por componentes internos do sistema
 */
export async function fetchPediatras(): Promise<Pediatra[]> {
  try {
    const rows = await listarPediatrasAtivos();

    return rows.map((r) => ({
      id: r.pediatra_id,
      pessoa_id: r.pessoa_id,
      nome: r.nome,
      crm: r.crm,
      especialidade: r.especialidade,
    }));
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

    // Busca sem acento acontece no cliente: o Postgres não faz isso sem unaccent,
    // e a lista de pediatras ativos é pequena (312).
    const rows = await listarPediatrasAtivos();

    const results: PediatricianSearchResult[] = rows
      .filter((r) => normalizeText(r.nome).includes(normalizedSearch))
      .map((r) => ({
        id: r.pediatra_id, // ID da tabela pessoa_pediatra
        pessoaId: r.pessoa_id, // ID da tabela pessoas
        nome: r.nome,
        crm: r.crm,
        especialidade: r.especialidade,
      }))
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

    const rows = await listarPediatrasAtivos();

    // Buscar match exato por nome normalizado
    const match = rows.find((r) => normalizeText(r.nome) === normalizedNome);

    if (match) {
      return {
        exists: true,
        pediatrician: {
          id: match.pediatra_id,
          pessoaId: match.pessoa_id,
          nome: match.nome,
          crm: match.crm,
          especialidade: match.especialidade,
        },
      };
    }

    return { exists: false };
  } catch (error) {
    console.error('❌ [checkPediatricianExists] Erro:', error);
    return { exists: false };
  }
}
