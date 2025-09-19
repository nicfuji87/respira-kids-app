import { supabase } from '@/lib/supabase';
import type { ApiResponse, ApiPaginatedResponse } from '@/types/api';

// AI dev note: API para gerenciar comissões de profissionais por tipo de serviço
// Permite configurar valores fixos ou percentuais que profissionais recebem por atendimento

export interface ComissaoProfissional {
  id: string;
  id_profissional: string;
  id_servico: string;
  tipo_recebimento: 'fixo' | 'percentual';
  valor_fixo: number | null;
  valor_percentual: number | null;
  ativo: boolean;
  criado_por: string | null;
  atualizado_por: string | null;
  created_at: string;
  updated_at: string;
  // Dados relacionados
  profissional_nome?: string;
  servico_nome?: string;
}

export interface ComissaoCreateInput {
  id_profissional: string;
  id_servico: string;
  tipo_recebimento: 'fixo' | 'percentual';
  valor_fixo?: number;
  valor_percentual?: number;
}

export interface ComissaoUpdateInput extends Partial<ComissaoCreateInput> {
  id: string;
}

export interface ComissaoFilters {
  page?: number;
  limit?: number;
  search?: string;
  profissional_id?: string;
  servico_id?: string;
  ativo?: boolean;
}

/**
 * Buscar comissões com dados relacionados (profissional e serviço)
 */
export async function fetchComissoes(
  filters: ComissaoFilters = {}
): Promise<ApiPaginatedResponse<ComissaoProfissional>> {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      profissional_id,
      servico_id,
      ativo,
    } = filters;

    let query = supabase.from('comissao_profissional').select(
      `
        *,
        profissional:pessoas!comissao_profissional_id_profissional_fkey(nome),
        servico:tipo_servicos!comissao_profissional_id_servico_fkey(nome)
      `,
      { count: 'exact' }
    );

    // Aplicar filtros
    if (search) {
      query = query.or(`
        pessoas.nome.ilike.%${search}%,
        tipo_servicos.nome.ilike.%${search}%
      `);
    }

    if (profissional_id) {
      query = query.eq('id_profissional', profissional_id);
    }

    if (servico_id) {
      query = query.eq('id_servico', servico_id);
    }

    if (ativo !== undefined) {
      query = query.eq('ativo', ativo);
    }

    // Paginação
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    // Ordenação
    query = query.order('created_at', { ascending: false });

    const { data, error, count } = await query;

    if (error) {
      console.error('❌ Erro ao buscar comissões:', error);
      return {
        success: false,
        error: error.message,
        data: undefined,
      };
    }

    // Mapear dados relacionados
    const mappedData = (data || []).map((item) => ({
      ...item,
      profissional_nome: item.profissional?.nome || '',
      servico_nome: item.servico?.nome || '',
    }));

    return {
      success: true,
      data: mappedData,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao buscar comissões:', error);
    return {
      success: false,
      error: 'Erro inesperado ao buscar comissões',
      data: undefined,
    };
  }
}

/**
 * Buscar uma comissão específica pelo ID
 */
export async function fetchComissaoById(
  id: string
): Promise<ApiResponse<ComissaoProfissional>> {
  try {
    const { data, error } = await supabase
      .from('comissao_profissional')
      .select(
        `
        *,
        profissional:pessoas!comissao_profissional_id_profissional_fkey(nome),
        servico:tipo_servicos!comissao_profissional_id_servico_fkey(nome)
      `
      )
      .eq('id', id)
      .single();

    if (error) {
      console.error('❌ Erro ao buscar comissão:', error);
      return {
        success: false,
        error: error.message,
      };
    }

    const mappedData = {
      ...data,
      profissional_nome: data.profissional?.nome || '',
      servico_nome: data.servico?.nome || '',
    };

    return {
      success: true,
      data: mappedData,
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao buscar comissão:', error);
    return {
      success: false,
      error: 'Erro inesperado ao buscar comissão',
    };
  }
}

/**
 * Criar nova comissão
 */
export async function createComissao(
  input: ComissaoCreateInput,
  userId?: string
): Promise<ApiResponse<ComissaoProfissional>> {
  try {
    // Validar que apenas um tipo de valor está preenchido
    const hasFixo = input.valor_fixo !== undefined && input.valor_fixo !== null;
    const hasPercentual =
      input.valor_percentual !== undefined && input.valor_percentual !== null;

    if (input.tipo_recebimento === 'fixo' && !hasFixo) {
      return {
        success: false,
        error: 'Valor fixo é obrigatório para tipo "fixo"',
      };
    }

    if (input.tipo_recebimento === 'percentual' && !hasPercentual) {
      return {
        success: false,
        error: 'Valor percentual é obrigatório para tipo "percentual"',
      };
    }

    // Verificar se já existe comissão para este profissional/serviço
    const { data: existing, error: existingError } = await supabase
      .from('comissao_profissional')
      .select('id')
      .eq('id_profissional', input.id_profissional)
      .eq('id_servico', input.id_servico)
      .eq('ativo', true)
      .single();

    if (existingError && existingError.code !== 'PGRST116') {
      // PGRST116 = No rows found (não é erro neste caso)
      console.error('❌ Erro ao verificar comissão existente:', existingError);
      return {
        success: false,
        error: 'Erro ao verificar comissão existente',
      };
    }

    if (existing) {
      return {
        success: false,
        error: 'Já existe uma comissão ativa para este profissional e serviço',
      };
    }

    // Preparar dados para inserção
    const insertData = {
      id_profissional: input.id_profissional,
      id_servico: input.id_servico,
      tipo_recebimento: input.tipo_recebimento,
      valor_fixo: input.tipo_recebimento === 'fixo' ? input.valor_fixo : null,
      valor_percentual:
        input.tipo_recebimento === 'percentual' ? input.valor_percentual : null,
      ativo: true,
      criado_por: userId || null,
    };

    const { data, error } = await supabase
      .from('comissao_profissional')
      .insert(insertData)
      .select(
        `
        *,
        profissional:pessoas!comissao_profissional_id_profissional_fkey(nome),
        servico:tipo_servicos!comissao_profissional_id_servico_fkey(nome)
      `
      )
      .single();

    if (error) {
      console.error('❌ Erro ao criar comissão:', error);
      return {
        success: false,
        error: error.message,
      };
    }

    const mappedData = {
      ...data,
      profissional_nome: data.profissional?.nome || '',
      servico_nome: data.servico?.nome || '',
    };

    return {
      success: true,
      data: mappedData,
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao criar comissão:', error);
    return {
      success: false,
      error: 'Erro inesperado ao criar comissão',
    };
  }
}

/**
 * Atualizar comissão existente
 */
export async function updateComissao(
  input: ComissaoUpdateInput,
  userId?: string
): Promise<ApiResponse<ComissaoProfissional>> {
  try {
    const { id, ...updateData } = input;

    // Validar que apenas um tipo de valor está preenchido
    if (updateData.tipo_recebimento) {
      const hasFixo =
        updateData.valor_fixo !== undefined && updateData.valor_fixo !== null;
      const hasPercentual =
        updateData.valor_percentual !== undefined &&
        updateData.valor_percentual !== null;

      if (updateData.tipo_recebimento === 'fixo' && !hasFixo) {
        return {
          success: false,
          error: 'Valor fixo é obrigatório para tipo "fixo"',
        };
      }

      if (updateData.tipo_recebimento === 'percentual' && !hasPercentual) {
        return {
          success: false,
          error: 'Valor percentual é obrigatório para tipo "percentual"',
        };
      }

      // Limpar o campo não utilizado
      if (updateData.tipo_recebimento === 'fixo') {
        updateData.valor_percentual = undefined;
      } else if (updateData.tipo_recebimento === 'percentual') {
        updateData.valor_fixo = undefined;
      }
    }

    // Preparar dados para atualização
    const finalData = {
      ...updateData,
      atualizado_por: userId || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('comissao_profissional')
      .update(finalData)
      .eq('id', id)
      .select(
        `
        *,
        profissional:pessoas!comissao_profissional_id_profissional_fkey(nome),
        servico:tipo_servicos!comissao_profissional_id_servico_fkey(nome)
      `
      )
      .single();

    if (error) {
      console.error('❌ Erro ao atualizar comissão:', error);
      return {
        success: false,
        error: error.message,
      };
    }

    const mappedData = {
      ...data,
      profissional_nome: data.profissional?.nome || '',
      servico_nome: data.servico?.nome || '',
    };

    return {
      success: true,
      data: mappedData,
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao atualizar comissão:', error);
    return {
      success: false,
      error: 'Erro inesperado ao atualizar comissão',
    };
  }
}

/**
 * Deletar comissão (soft delete - marca como inativo)
 */
export async function deleteComissao(
  id: string,
  userId?: string
): Promise<ApiResponse<boolean>> {
  try {
    const { error } = await supabase
      .from('comissao_profissional')
      .update({
        ativo: false,
        atualizado_por: userId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('❌ Erro ao deletar comissão:', error);
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      data: true,
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao deletar comissão:', error);
    return {
      success: false,
      error: 'Erro inesperado ao deletar comissão',
    };
  }
}

/**
 * Toggle status ativo/inativo de uma comissão
 */
export async function toggleComissaoStatus(
  id: string,
  ativo: boolean,
  userId?: string
): Promise<ApiResponse<ComissaoProfissional>> {
  try {
    const { data, error } = await supabase
      .from('comissao_profissional')
      .update({
        ativo,
        atualizado_por: userId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(
        `
        *,
        profissional:pessoas!comissao_profissional_id_profissional_fkey(nome),
        servico:tipo_servicos!comissao_profissional_id_servico_fkey(nome)
      `
      )
      .single();

    if (error) {
      console.error('❌ Erro ao alterar status da comissão:', error);
      return {
        success: false,
        error: error.message,
      };
    }

    const mappedData = {
      ...data,
      profissional_nome: data.profissional?.nome || '',
      servico_nome: data.servico?.nome || '',
    };

    return {
      success: true,
      data: mappedData,
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao alterar status:', error);
    return {
      success: false,
      error: 'Erro inesperado ao alterar status',
    };
  }
}

/**
 * Buscar profissionais que podem ter comissão (role profissional ou pode_atender=true)
 */
export async function fetchProfissionaisParaComissao(): Promise<
  ApiResponse<Array<{ id: string; nome: string }>>
> {
  try {
    const { data, error } = await supabase
      .from('pessoas')
      .select('id, nome')
      .or('role.eq.profissional,pode_atender.eq.true')
      .eq('is_approved', true)
      .eq('ativo', true)
      .order('nome');

    if (error) {
      console.error('❌ Erro ao buscar profissionais:', error);
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      data: data || [],
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao buscar profissionais:', error);
    return {
      success: false,
      error: 'Erro inesperado ao buscar profissionais',
    };
  }
}

/**
 * Buscar tipos de serviço ativos
 */
export async function fetchTiposServicoParaComissao(): Promise<
  ApiResponse<Array<{ id: string; nome: string }>>
> {
  try {
    const { data, error } = await supabase
      .from('tipo_servicos')
      .select('id, nome')
      .eq('ativo', true)
      .order('nome');

    if (error) {
      console.error('❌ Erro ao buscar tipos de serviço:', error);
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      data: data || [],
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao buscar tipos de serviço:', error);
    return {
      success: false,
      error: 'Erro inesperado ao buscar tipos de serviço',
    };
  }
}
