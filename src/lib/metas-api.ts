// AI dev note: API do programa de metas
// Tabelas: metas, tipos_meta, meta_acompanhamento; view vw_metas_dashboard

import { supabase } from './supabase';
import type {
  CreateMetaInput,
  Meta,
  MetaAcompanhamento,
  MetaDashboard,
  MetasFilters,
  TipoMeta,
} from '@/types/metas';

export async function fetchTiposMeta(): Promise<TipoMeta[]> {
  const { data, error } = await supabase
    .from('tipos_meta')
    .select('*')
    .eq('ativo', true)
    .order('categoria')
    .order('nome');

  if (error) {
    console.error('Erro ao buscar tipos de meta:', error);
    return [];
  }
  return (data || []) as TipoMeta[];
}

export async function fetchMetasDashboard(
  filtros?: MetasFilters
): Promise<MetaDashboard[]> {
  let query = supabase.from('vw_metas_dashboard').select('*');

  if (filtros?.pessoa_id !== undefined) {
    if (filtros.pessoa_id === null) {
      query = query.is('pessoa_id', null);
    } else {
      query = query.eq('pessoa_id', filtros.pessoa_id);
    }
  }
  if (filtros?.role_alvo) {
    query = query.eq('role_alvo', filtros.role_alvo);
  }
  if (filtros?.mes != null) {
    query = query.eq('mes_referencia', filtros.mes);
  }
  if (filtros?.ano != null) {
    query = query.eq('ano_referencia', filtros.ano);
  }
  if (filtros?.status && filtros.status.length > 0) {
    query = query.in('status', filtros.status);
  }
  if (filtros?.categoria && filtros.categoria.length > 0) {
    query = query.in('categoria', filtros.categoria);
  }

  const { data, error } = await query
    .order('mes_referencia', { ascending: false })
    .order('ano_referencia', { ascending: false });

  if (error) {
    console.error('Erro ao buscar metas:', error);
    return [];
  }
  return (data || []) as MetaDashboard[];
}

export async function fetchMetaById(metaId: string): Promise<Meta | null> {
  const { data, error } = await supabase
    .from('metas')
    .select('*')
    .eq('id', metaId)
    .single();
  if (error) {
    console.error('Erro ao buscar meta:', error);
    return null;
  }
  return data as Meta;
}

export async function fetchMetaAcompanhamento(
  metaId: string
): Promise<MetaAcompanhamento[]> {
  const { data, error } = await supabase
    .from('meta_acompanhamento')
    .select('*')
    .eq('meta_id', metaId)
    .order('data_referencia', { ascending: true });

  if (error) {
    console.error('Erro ao buscar acompanhamento:', error);
    return [];
  }
  return (data || []) as MetaAcompanhamento[];
}

export async function createMeta(input: CreateMetaInput): Promise<Meta> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuário não autenticado');

  const { data: pessoa } = await supabase
    .from('pessoas')
    .select('id')
    .eq('auth_user_id', user.id)
    .single();
  if (!pessoa) throw new Error('Pessoa não encontrada');

  const inicio = new Date(input.periodo_inicio);
  const mes_referencia = inicio.getUTCMonth() + 1;
  const ano_referencia = inicio.getUTCFullYear();

  const { data, error } = await supabase
    .from('metas')
    .insert({
      titulo: input.titulo,
      descricao: input.descricao ?? null,
      tipo_meta_id: input.tipo_meta_id,
      escopo: input.escopo,
      pessoa_id: input.escopo === 'individual' ? input.pessoa_id : null,
      periodo_inicio: input.periodo_inicio,
      periodo_fim: input.periodo_fim,
      mes_referencia,
      ano_referencia,
      valor_meta: input.valor_meta,
      valor_minimo: input.valor_minimo ?? null,
      criado_por: pessoa.id,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);

  // Atualizar valor atual logo após criação
  try {
    await supabase.rpc('fn_atualizar_meta', { p_meta_id: (data as Meta).id });
  } catch (err) {
    console.warn('Falha ao calcular valor inicial da meta:', err);
  }

  return data as Meta;
}

export async function updateMetaStatus(
  metaId: string,
  status: Meta['status']
): Promise<void> {
  const { error } = await supabase
    .from('metas')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', metaId);
  if (error) throw new Error(error.message);
}

export async function refreshMetaValor(metaId: string): Promise<number> {
  const { data, error } = await supabase.rpc('fn_atualizar_meta', {
    p_meta_id: metaId,
  });
  if (error) throw new Error(error.message);
  return Number(data || 0);
}

export async function refreshTodasMetasAtivas(): Promise<number> {
  const { data, error } = await supabase.rpc('fn_atualizar_todas_metas_ativas');
  if (error) throw new Error(error.message);
  return Number(data || 0);
}

export async function deleteMeta(metaId: string): Promise<void> {
  const { error } = await supabase.from('metas').delete().eq('id', metaId);
  if (error) throw new Error(error.message);
}
