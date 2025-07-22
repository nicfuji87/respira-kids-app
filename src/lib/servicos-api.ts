import { supabase } from './supabase';
import type {
  TipoServico,
  TipoServicoCreateInput,
  TipoServicoUpdateInput,
  ApiResponse,
  PaginatedResponse,
  SystemEntityFilters,
} from '@/types/system-config';

// AI dev note: API para gerenciamento de tipos de serviços
// Implementa CRUD completo com soft delete, auditoria e validação de dependências

const TABLE_NAME = 'tipo_servicos';

// === FETCH ALL ===
export async function fetchTipoServicos(
  filters: SystemEntityFilters = {}
): Promise<ApiResponse<PaginatedResponse<TipoServico>>> {
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
      query = query.or(`nome.ilike.%${search}%,descricao.ilike.%${search}%`);
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
      console.error('❌ Erro ao buscar tipos de serviços:', error);
      return {
        success: false,
        error: `Erro ao carregar tipos de serviços: ${error.message}`
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
    console.error('❌ Erro inesperado ao buscar tipos de serviços:', error);
    return {
      success: false,
      error: 'Erro inesperado ao carregar tipos de serviços'
    };
  }
}

// === FETCH BY ID ===
export async function fetchTipoServicoById(id: string): Promise<ApiResponse<TipoServico>> {
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('❌ Erro ao buscar tipo de serviço:', error);
      return {
        success: false,
        error: `Tipo de serviço não encontrado: ${error.message}`
      };
    }

    return {
      success: true,
      data
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao buscar tipo de serviço:', error);
    return {
      success: false,
      error: 'Erro inesperado ao carregar tipo de serviço'
    };
  }
}

// === CREATE ===
export async function createTipoServico(
  input: TipoServicoCreateInput,
  userId?: string
): Promise<ApiResponse<TipoServico>> {
  try {
    // Validações
    if (!input.nome?.trim()) {
      return {
        success: false,
        error: 'Nome é obrigatório'
      };
    }

    if (input.duracao_minutos !== undefined && input.duracao_minutos <= 0) {
      return {
        success: false,
        error: 'Duração deve ser maior que zero'
      };
    }

    if (input.valor !== undefined && input.valor < 0) {
      return {
        success: false,
        error: 'Valor não pode ser negativo'
      };
    }

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .insert({
        nome: input.nome.trim(),
        descricao: input.descricao?.trim() || null,
        duracao_minutos: input.duracao_minutos || 60,
        valor: input.valor || 0,
        cor: input.cor || '#3B82F6',
        ativo: input.ativo ?? true,
        criado_por: userId || null
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao criar tipo de serviço:', error);
      return {
        success: false,
        error: `Erro ao criar tipo de serviço: ${error.message}`
      };
    }

    return {
      success: true,
      data
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao criar tipo de serviço:', error);
    return {
      success: false,
      error: 'Erro inesperado ao criar tipo de serviço'
    };
  }
}

// === UPDATE ===
export async function updateTipoServico(
  input: TipoServicoUpdateInput,
  userId?: string
): Promise<ApiResponse<TipoServico>> {
  try {
    if (!input.id) {
      return {
        success: false,
        error: 'ID é obrigatório para atualização'
      };
    }

    // Validações
    if (input.duracao_minutos !== undefined && input.duracao_minutos <= 0) {
      return {
        success: false,
        error: 'Duração deve ser maior que zero'
      };
    }

    if (input.valor !== undefined && input.valor < 0) {
      return {
        success: false,
        error: 'Valor não pode ser negativo'
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
      atualizado_por: userId || null
    };

    if (input.nome !== undefined) updateData.nome = input.nome.trim();
    if (input.descricao !== undefined) updateData.descricao = input.descricao?.trim() || null;
    if (input.duracao_minutos !== undefined) updateData.duracao_minutos = input.duracao_minutos;
    if (input.valor !== undefined) updateData.valor = input.valor;
    if (input.cor !== undefined) updateData.cor = input.cor;
    if (input.ativo !== undefined) updateData.ativo = input.ativo;

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update(updateData)
      .eq('id', input.id)
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao atualizar tipo de serviço:', error);
      return {
        success: false,
        error: `Erro ao atualizar tipo de serviço: ${error.message}`
      };
    }

    return {
      success: true,
      data
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao atualizar tipo de serviço:', error);
    return {
      success: false,
      error: 'Erro inesperado ao atualizar tipo de serviço'
    };
  }
}

// === SOFT DELETE ===
export async function deleteTipoServico(
  id: string,
  userId?: string
): Promise<ApiResponse<boolean>> {
  try {
    // Verificar se tipo está sendo usado em agendamentos
    const { data: agendamentos, error: agendamentosError } = await supabase
      .from('agendamentos')
      .select('id')
      .eq('tipo_servico_id', id)
      .limit(1);

    if (agendamentosError) {
      console.error('❌ Erro ao verificar dependências:', agendamentosError);
      return {
        success: false,
        error: 'Erro ao verificar se tipo pode ser excluído'
      };
    }

    if (agendamentos && agendamentos.length > 0) {
      return {
        success: false,
        error: 'Não é possível excluir este tipo pois existem agendamentos associados a ele'
      };
    }

    // Verificar se tipo está sendo usado em comissão_profissional
    const { data: comissoes, error: comissoesError } = await supabase
      .from('comissao_profissional')
      .select('id')
      .eq('id_servico', id)
      .limit(1);

    if (comissoesError) {
      console.error('❌ Erro ao verificar comissões:', comissoesError);
      return {
        success: false,
        error: 'Erro ao verificar dependências de comissão'
      };
    }

    if (comissoes && comissoes.length > 0) {
      return {
        success: false,
        error: 'Não é possível excluir este tipo pois existem comissões associadas a ele'
      };
    }

    // Verificar se tipo está sendo usado em profissional_servicos
    const { data: profServicos, error: profServicosError } = await supabase
      .from('profissional_servicos')
      .select('id')
      .eq('id_tipo_servico', id)
      .limit(1);

    if (profServicosError) {
      console.error('❌ Erro ao verificar serviços de profissionais:', profServicosError);
      return {
        success: false,
        error: 'Erro ao verificar dependências de profissionais'
      };
    }

    if (profServicos && profServicos.length > 0) {
      return {
        success: false,
        error: 'Não é possível excluir este tipo pois existem profissionais associados a ele'
      };
    }

    // Soft delete - marcar como inativo
    const { error } = await supabase
      .from(TABLE_NAME)
      .update({ 
        ativo: false,
        updated_at: new Date().toISOString(),
        atualizado_por: userId || null
      })
      .eq('id', id);

    if (error) {
      console.error('❌ Erro ao excluir tipo de serviço:', error);
      return {
        success: false,
        error: `Erro ao excluir tipo de serviço: ${error.message}`
      };
    }

    return {
      success: true,
      data: true
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao excluir tipo de serviço:', error);
    return {
      success: false,
      error: 'Erro inesperado ao excluir tipo de serviço'
    };
  }
}

// === TOGGLE STATUS ===
export async function toggleTipoServicoStatus(
  id: string, 
  ativo: boolean,
  userId?: string
): Promise<ApiResponse<TipoServico>> {
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update({ 
        ativo,
        updated_at: new Date().toISOString(),
        atualizado_por: userId || null
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao alterar status:', error);
      return {
        success: false,
        error: `Erro ao alterar status: ${error.message}`
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
} 