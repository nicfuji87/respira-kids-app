import { supabase } from './supabase';
import type {
  PagamentoStatus,
  PagamentoStatusCreateInput,
  PagamentoStatusUpdateInput,
  ApiResponse,
  PaginatedResponse,
  SystemEntityFilters,
} from '@/types/system-config';

// AI dev note: API para gerenciamento de status de pagamento
// Status não tem campo ativo - são sempre todos disponíveis

const TABLE_NAME = 'pagamento_status';

// === FETCH ALL ===
export async function fetchPagamentoStatus(
  filters: SystemEntityFilters = {}
): Promise<ApiResponse<PaginatedResponse<PagamentoStatus>>> {
  try {
    const {
      search,
      page = 1,
      limit = 10,
      sortBy = 'descricao',
      sortOrder = 'asc'
    } = filters;

    let query = supabase
      .from(TABLE_NAME)
      .select('*', { count: 'exact' });

    // Filtros
    if (search) {
      query = query.or(`codigo.ilike.%${search}%,descricao.ilike.%${search}%`);
    }

    // Ordenação
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    // Paginação
    const startIndex = (page - 1) * limit;
    query = query.range(startIndex, startIndex + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('❌ Erro ao buscar status de pagamento:', error);
      return {
        success: false,
        error: `Erro ao carregar status de pagamento: ${error.message}`
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
    console.error('❌ Erro inesperado ao buscar status de pagamento:', error);
    return {
      success: false,
      error: 'Erro inesperado ao carregar status de pagamento'
    };
  }
}

// === FETCH BY ID ===
export async function fetchPagamentoStatusById(id: string): Promise<ApiResponse<PagamentoStatus>> {
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('❌ Erro ao buscar status de pagamento:', error);
      return {
        success: false,
        error: `Status de pagamento não encontrado: ${error.message}`
      };
    }

    return {
      success: true,
      data
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao buscar status de pagamento:', error);
    return {
      success: false,
      error: 'Erro inesperado ao carregar status de pagamento'
    };
  }
}

// === CREATE ===
export async function createPagamentoStatus(
  input: PagamentoStatusCreateInput
): Promise<ApiResponse<PagamentoStatus>> {
  try {
    // Validações
    if (!input.codigo?.trim()) {
      return {
        success: false,
        error: 'Código é obrigatório'
      };
    }

    if (!input.descricao?.trim()) {
      return {
        success: false,
        error: 'Descrição é obrigatória'
      };
    }

    if (!input.cor?.trim()) {
      return {
        success: false,
        error: 'Cor é obrigatória'
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
        error: 'Já existe um status com este código'
      };
    }

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .insert({
        codigo: input.codigo.trim(),
        descricao: input.descricao.trim(),
        cor: input.cor.trim()
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao criar status de pagamento:', error);
      
      // Tratar erros específicos do banco
      if (error.code === '23505') {
        return {
          success: false,
          error: 'Código já existe - escolha um código único'
        };
      }

      return {
        success: false,
        error: `Erro ao criar status de pagamento: ${error.message}`
      };
    }

    return {
      success: true,
      data
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao criar status de pagamento:', error);
    return {
      success: false,
      error: 'Erro inesperado ao criar status de pagamento'
    };
  }
}

// === UPDATE ===
export async function updatePagamentoStatus(
  input: PagamentoStatusUpdateInput
): Promise<ApiResponse<PagamentoStatus>> {
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
          error: 'Já existe outro status com este código'
        };
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString()
    };

    if (input.codigo !== undefined) updateData.codigo = input.codigo.trim();
    if (input.descricao !== undefined) updateData.descricao = input.descricao.trim();
    if (input.cor !== undefined) updateData.cor = input.cor.trim();

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update(updateData)
      .eq('id', input.id)
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao atualizar status de pagamento:', error);
      
      if (error.code === '23505') {
        return {
          success: false,
          error: 'Código já existe - escolha um código único'
        };
      }

      return {
        success: false,
        error: `Erro ao atualizar status de pagamento: ${error.message}`
      };
    }

    return {
      success: true,
      data
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao atualizar status de pagamento:', error);
    return {
      success: false,
      error: 'Erro inesperado ao atualizar status de pagamento'
    };
  }
}

// === DELETE ===
export async function deletePagamentoStatus(id: string): Promise<ApiResponse<boolean>> {
  try {
    // Verificar se status está sendo usado em agendamentos
    const { data: agendamentos, error: agendamentosError } = await supabase
      .from('agendamentos')
      .select('id')
      .eq('status_pagamento_id', id)
      .limit(1);

    if (agendamentosError) {
      console.error('❌ Erro ao verificar dependências:', agendamentosError);
      return {
        success: false,
        error: 'Erro ao verificar se status pode ser excluído'
      };
    }

    if (agendamentos && agendamentos.length > 0) {
      return {
        success: false,
        error: 'Não é possível excluir este status pois existem pagamentos associados a ele'
      };
    }

    // Delete real pois status não tem soft delete
    const { error } = await supabase
      .from(TABLE_NAME)
      .delete()
      .eq('id', id);

    if (error) {
      console.error('❌ Erro ao excluir status de pagamento:', error);
      
      // Tratar constraint violations
      if (error.code === '23503') {
        return {
          success: false,
          error: 'Não é possível excluir este status pois está sendo usado no sistema'
        };
      }

      return {
        success: false,
        error: `Erro ao excluir status de pagamento: ${error.message}`
      };
    }

    return {
      success: true,
      data: true
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao excluir status de pagamento:', error);
    return {
      success: false,
      error: 'Erro inesperado ao excluir status de pagamento'
    };
  }
} 