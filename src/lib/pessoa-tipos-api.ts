import { supabase } from './supabase';
import type {
  PessoaTipo,
  PessoaTipoCreateInput,
  PessoaTipoUpdateInput,
  ApiResponse,
  PaginatedResponse,
  SystemEntityFilters,
} from '@/types/system-config';

// AI dev note: API para gerenciamento de tipos de pessoa
// Implementa CRUD completo com soft delete e validação de dependências

const TABLE_NAME = 'pessoa_tipos';

// === FETCH ALL ===
export async function fetchPessoaTipos(
  filters: SystemEntityFilters = {}
): Promise<ApiResponse<PaginatedResponse<PessoaTipo>>> {
  try {
    const {
      search,
      ativo,
      page = 1,
      limit = 10,
      sortBy = 'nome',
      sortOrder = 'asc'
    } = filters;

    let query = supabase
      .from(TABLE_NAME)
      .select('*', { count: 'exact' });

    // Filtros
    if (search) {
      query = query.or(`nome.ilike.%${search}%,codigo.ilike.%${search}%,descricao.ilike.%${search}%`);
    }

    if (typeof ativo === 'boolean') {
      query = query.eq('ativo', ativo);
    }

    // Ordenação
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    // Paginação
    const startIndex = (page - 1) * limit;
    query = query.range(startIndex, startIndex + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('❌ Erro ao buscar tipos de pessoa:', error);
      return {
        success: false,
        error: `Erro ao carregar tipos de pessoa: ${error.message}`
      };
    }

    const totalPages = Math.ceil((count || 0) / limit);

    return {
      success: true,
      data: {
        data: data || [],
        total: count || 0,
        page,
        limit,
        totalPages
      }
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao buscar tipos de pessoa:', error);
    return {
      success: false,
      error: 'Erro inesperado ao carregar tipos de pessoa'
    };
  }
}

// === FETCH BY ID ===
export async function fetchPessoaTipoById(id: string): Promise<ApiResponse<PessoaTipo>> {
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('❌ Erro ao buscar tipo de pessoa:', error);
      return {
        success: false,
        error: `Tipo de pessoa não encontrado: ${error.message}`
      };
    }

    return {
      success: true,
      data
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao buscar tipo de pessoa:', error);
    return {
      success: false,
      error: 'Erro inesperado ao carregar tipo de pessoa'
    };
  }
}

// === CREATE ===
export async function createPessoaTipo(
  input: PessoaTipoCreateInput
): Promise<ApiResponse<PessoaTipo>> {
  try {
    // Validações
    if (!input.nome?.trim()) {
      return {
        success: false,
        error: 'Nome é obrigatório'
      };
    }

    if (!input.codigo?.trim()) {
      return {
        success: false,
        error: 'Código é obrigatório'
      };
    }

    // Verificar se código já existe
    const { data: existing } = await supabase
      .from(TABLE_NAME)
      .select('id')
      .eq('codigo', input.codigo.trim())
      .single();

    if (existing) {
      return {
        success: false,
        error: 'Já existe um tipo de pessoa com este código'
      };
    }

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .insert({
        nome: input.nome.trim(),
        codigo: input.codigo.trim(),
        descricao: input.descricao?.trim() || null,
        ativo: input.ativo ?? true
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao criar tipo de pessoa:', error);
      
      // Tratar erros específicos do banco
      if (error.code === '23505') {
        return {
          success: false,
          error: 'Código já existe - escolha um código único'
        };
      }

      return {
        success: false,
        error: `Erro ao criar tipo de pessoa: ${error.message}`
      };
    }

    return {
      success: true,
      data
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao criar tipo de pessoa:', error);
    return {
      success: false,
      error: 'Erro inesperado ao criar tipo de pessoa'
    };
  }
}

// === UPDATE ===
export async function updatePessoaTipo(
  input: PessoaTipoUpdateInput
): Promise<ApiResponse<PessoaTipo>> {
  try {
    if (!input.id) {
      return {
        success: false,
        error: 'ID é obrigatório para atualização'
      };
    }

    // Verificar se código já existe em outro registro
    if (input.codigo) {
      const { data: existing } = await supabase
        .from(TABLE_NAME)
        .select('id')
        .eq('codigo', input.codigo.trim())
        .neq('id', input.id)
        .single();

      if (existing) {
        return {
          success: false,
          error: 'Já existe outro tipo de pessoa com este código'
        };
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString()
    };

    if (input.nome !== undefined) updateData.nome = input.nome.trim();
    if (input.codigo !== undefined) updateData.codigo = input.codigo.trim();
    if (input.descricao !== undefined) updateData.descricao = input.descricao?.trim() || null;
    if (input.ativo !== undefined) updateData.ativo = input.ativo;

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update(updateData)
      .eq('id', input.id)
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao atualizar tipo de pessoa:', error);
      
      if (error.code === '23505') {
        return {
          success: false,
          error: 'Código já existe - escolha um código único'
        };
      }

      return {
        success: false,
        error: `Erro ao atualizar tipo de pessoa: ${error.message}`
      };
    }

    return {
      success: true,
      data
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao atualizar tipo de pessoa:', error);
    return {
      success: false,
      error: 'Erro inesperado ao atualizar tipo de pessoa'
    };
  }
}

// === SOFT DELETE ===
export async function deletePessoaTipo(id: string): Promise<ApiResponse<boolean>> {
  try {
    // Verificar se tipo está sendo usado em pessoas
    const { data: pessoas, error: pessoasError } = await supabase
      .from('pessoas')
      .select('id')
      .eq('id_tipo_pessoa', id)
      .limit(1);

    if (pessoasError) {
      console.error('❌ Erro ao verificar dependências:', pessoasError);
      return {
        success: false,
        error: 'Erro ao verificar se tipo pode ser excluído'
      };
    }

    if (pessoas && pessoas.length > 0) {
      return {
        success: false,
        error: 'Não é possível excluir este tipo pois existem pessoas associadas a ele'
      };
    }

    // Soft delete - marcar como inativo
    const { error } = await supabase
      .from(TABLE_NAME)
      .update({ 
        ativo: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      console.error('❌ Erro ao excluir tipo de pessoa:', error);
      return {
        success: false,
        error: `Erro ao excluir tipo de pessoa: ${error.message}`
      };
    }

    return {
      success: true,
      data: true
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao excluir tipo de pessoa:', error);
    return {
      success: false,
      error: 'Erro inesperado ao excluir tipo de pessoa'
    };
  }
}

// === TOGGLE STATUS ===
export const togglePessoaTipoStatus = async (
  id: string, 
  ativo: boolean
): Promise<ApiResponse<PessoaTipo>> => {
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update({ 
        ativo,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao alterar status:', error);
      
      // Tratamento específico para erros de RLS/permissão
      if (error.code === 'PGRST116') {
        return {
          success: false,
          error: 'Você não tem permissão para alterar este item ou o item não foi encontrado.'
        };
      }
      
      return {
        success: false,
        error: `Erro ao alterar status: ${error.message}`
      };
    }

    if (!data) {
      return {
        success: false,
        error: 'Nenhum registro foi alterado. Verifique suas permissões.'
      };
    }

    return {
      success: true,
      data
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao alterar status:', error);
    return {
      success: false,
      error: 'Erro inesperado ao alterar status'
    };
  }
}; 