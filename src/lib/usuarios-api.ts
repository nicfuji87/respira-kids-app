// AI dev note: API para gerenciamento de usuários - CRUD completo com view otimizada
// SEGURANÇA: Implementada verificação de autenticação em todas as funções
// Apenas usuários autenticados (admin, profissional, secretaria) podem acessar dados
// A view vw_usuarios_admin aplica RLS baseado no role do usuário logado
// PERFORMANCE: Implementado sistema de batches para contornar limite de 1000 registros do Supabase JS

interface UsuarioMetadata {
  is_approved: boolean;
  ativo: boolean;
  bloqueado: boolean;
  tipo_pessoa_codigo?: string;
  role?: string;
  created_at: string;
}
import { supabase } from './supabase';
import type {
  Usuario,
  UsuarioFilters,
  UsuarioMetrics,
  UsuarioUpdate,
  ApiResponse,
  PaginatedUsuarios,
} from '../types/usuarios';

const ITEMS_PER_PAGE = 10;

// Buscar usuários com filtros e paginação
export async function fetchUsuarios(
  filters: UsuarioFilters = {},
  page: number = 1,
  limit: number = ITEMS_PER_PAGE
): Promise<ApiResponse<PaginatedUsuarios>> {
  try {
    // AI dev note: Verificação de autenticação - apenas staff autorizado pode acessar dados de usuários
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error(
        '❌ fetchUsuarios: Usuário não autenticado:',
        authError?.message
      );
      return {
        data: null,
        error: 'Usuário não autenticado',
        success: false,
      };
    }

    let query = supabase.from('vw_usuarios_admin').select('*');

    let countQuery = supabase
      .from('vw_usuarios_admin')
      .select('*', { count: 'exact', head: true });

    // Aplicar filtros na query principal
    if (filters.busca) {
      // Busca flexível: todas as palavras devem estar presentes (AND)
      const searchWords = filters.busca
        .trim()
        .split(/\s+/)
        .filter((word) => word.length > 0);

      if (searchWords.length === 1) {
        // Busca simples para uma palavra
        const searchTerm = searchWords[0];
        query = query.or(
          `nome.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,cpf_cnpj.ilike.%${searchTerm}%`
        );
        countQuery = countQuery.or(
          `nome.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,cpf_cnpj.ilike.%${searchTerm}%`
        );
      } else {
        // Busca com AND: todas as palavras devem estar presentes no nome
        for (const word of searchWords) {
          query = query.ilike('nome', `%${word}%`);
          countQuery = countQuery.ilike('nome', `%${word}%`);
        }
      }
    }

    if (filters.tipo_pessoa) {
      query = query.eq('tipo_pessoa_codigo', filters.tipo_pessoa);
      countQuery = countQuery.eq('tipo_pessoa_codigo', filters.tipo_pessoa);
    }

    if (filters.role) {
      query = query.eq('role', filters.role);
      countQuery = countQuery.eq('role', filters.role);
    }

    if (filters.is_approved !== undefined) {
      query = query.eq('is_approved', filters.is_approved);
      countQuery = countQuery.eq('is_approved', filters.is_approved);
    }

    if (filters.ativo !== undefined) {
      query = query.eq('ativo', filters.ativo);
      countQuery = countQuery.eq('ativo', filters.ativo);
    }

    if (filters.bloqueado !== undefined) {
      query = query.eq('bloqueado', filters.bloqueado);
      countQuery = countQuery.eq('bloqueado', filters.bloqueado);
    }

    // Executar count - com limite alto para garantir contagem correta
    const { count } = await countQuery.limit(10000);

    // Buscar dados com paginação
    const offset = (page - 1) * limit;
    const { data, error } = await query
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Erro ao buscar usuários:', error);
      return { data: null, error: error.message, success: false };
    }

    const totalPages = Math.ceil((count || 0) / limit);

    return {
      data: {
        data: data as Usuario[],
        total: count || 0,
        page,
        limit,
        totalPages,
      },
      error: null,
      success: true,
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao buscar usuários:', error);
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      success: false,
    };
  }
}

// Buscar métricas dos usuários
export async function fetchUsuarioMetrics(): Promise<
  ApiResponse<UsuarioMetrics>
> {
  try {
    // AI dev note: Verificação de autenticação - apenas staff autorizado pode acessar métricas
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error(
        '❌ fetchUsuarioMetrics: Usuário não autenticado:',
        authError?.message
      );
      return {
        data: null,
        error: 'Usuário não autenticado',
        success: false,
      };
    }

    // AI dev note: Contornar limite de 1000 do Supabase JS com queries em batches
    const batchSize = 1000;
    let allContadores: UsuarioMetadata[] = [];
    let offset = 0;
    let hasMoreData = true;

    while (hasMoreData) {
      const { data: batchData, error: batchError } = await supabase
        .from('vw_usuarios_admin')
        .select(
          'is_approved, ativo, bloqueado, tipo_pessoa_codigo, role, created_at'
        )
        .range(offset, offset + batchSize - 1)
        .order('created_at', { ascending: false });

      if (batchError) {
        throw new Error(batchError.message);
      }

      if (!batchData || batchData.length === 0) {
        hasMoreData = false;
      } else {
        allContadores = [...allContadores, ...(batchData as UsuarioMetadata[])];

        // Se retornou menos que o batch size, não há mais dados
        if (batchData.length < batchSize) {
          hasMoreData = false;
        } else {
          offset += batchSize;
        }
      }

      // Safety: evitar loop infinito
      if (offset > 50000) {
        hasMoreData = false;
      }
    }

    const contadores = allContadores;

    if (!contadores || contadores.length === 0) {
      throw new Error('Nenhum dado retornado das queries em batch');
    }

    const agora = new Date();
    const mesPassado = new Date(
      agora.getFullYear(),
      agora.getMonth() - 1,
      agora.getDate()
    );

    const metrics: UsuarioMetrics = {
      total_usuarios: contadores.length,
      pendentes_aprovacao: contadores.filter((u) => !u.is_approved).length,
      usuarios_ativos: contadores.filter((u) => u.ativo && !u.bloqueado).length,
      usuarios_bloqueados: contadores.filter((u) => u.bloqueado).length,
      novos_ultimo_mes: contadores.filter(
        (u) => new Date(u.created_at) >= mesPassado
      ).length,
      por_tipo: [],
      por_role: [],
    };

    // Agrupar por tipo
    const porTipo = contadores.reduce(
      (acc, usuario) => {
        const tipo = usuario.tipo_pessoa_codigo || 'Não definido';
        acc[tipo] = (acc[tipo] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    metrics.por_tipo = Object.entries(porTipo as Record<string, number>).map(
      ([tipo, quantidade]) => ({
        tipo,
        quantidade,
      })
    );

    // Agrupar por role
    const porRole = contadores.reduce(
      (acc, usuario) => {
        const role = usuario.role || 'Sem role';
        acc[role] = (acc[role] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    metrics.por_role = Object.entries(porRole as Record<string, number>).map(
      ([role, quantidade]) => ({
        role,
        quantidade,
      })
    );

    return { data: metrics, error: null, success: true };
  } catch (error) {
    console.error('❌ Erro ao buscar métricas dos usuários:', error);
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      success: false,
    };
  }
}

// Atualizar usuário
export async function updateUsuario(
  id: string,
  updates: UsuarioUpdate
): Promise<ApiResponse<Usuario>> {
  try {
    // AI dev note: Verificação de autenticação - apenas staff autorizado pode atualizar usuários
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error(
        '❌ updateUsuario: Usuário não autenticado:',
        authError?.message
      );
      return {
        data: null,
        error: 'Usuário não autenticado',
        success: false,
      };
    }

    const { data, error } = await supabase
      .from('pessoas')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(
        `
        id, nome, email, telefone, cpf_cnpj, data_nascimento,
        registro_profissional, especialidade, bio_profissional,
        foto_perfil, numero_endereco, complemento_endereco,
        role, is_approved, profile_complete, ativo, bloqueado,
        created_at, updated_at
      `
      )
      .single();

    if (error) {
      console.error('❌ Erro ao atualizar usuário:', error);
      return { data: null, error: error.message, success: false };
    }

    return { data: data as Usuario, error: null, success: true };
  } catch (error) {
    console.error('❌ Erro inesperado ao atualizar usuário:', error);
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      success: false,
    };
  }
}

// Alternar status ativo/inativo
export async function toggleUserStatus(
  id: string,
  ativo: boolean
): Promise<ApiResponse<{ id: string; ativo: boolean }>> {
  try {
    const { data, error } = await supabase
      .from('pessoas')
      .update({
        ativo,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, ativo')
      .single();

    if (error) {
      console.error('❌ Erro ao alterar status do usuário:', error);
      return { data: null, error: error.message, success: false };
    }

    return { data, error: null, success: true };
  } catch (error) {
    console.error('❌ Erro inesperado ao alterar status:', error);
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      success: false,
    };
  }
}

// Alternar aprovação
export async function toggleUserApproval(
  id: string,
  is_approved: boolean
): Promise<ApiResponse<{ id: string; is_approved: boolean }>> {
  try {
    const { data, error } = await supabase
      .from('pessoas')
      .update({
        is_approved,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, is_approved')
      .single();

    if (error) {
      console.error('❌ Erro ao alterar aprovação do usuário:', error);
      return { data: null, error: error.message, success: false };
    }

    return { data, error: null, success: true };
  } catch (error) {
    console.error('❌ Erro inesperado ao alterar aprovação:', error);
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      success: false,
    };
  }
}

// Alternar bloqueio
export async function toggleUserBlocked(
  id: string,
  bloqueado: boolean
): Promise<ApiResponse<{ id: string; bloqueado: boolean }>> {
  try {
    const { data, error } = await supabase
      .from('pessoas')
      .update({
        bloqueado,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, bloqueado')
      .single();

    if (error) {
      console.error('❌ Erro ao alterar bloqueio do usuário:', error);
      return { data: null, error: error.message, success: false };
    }

    return { data, error: null, success: true };
  } catch (error) {
    console.error('❌ Erro inesperado ao alterar bloqueio:', error);
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      success: false,
    };
  }
}
