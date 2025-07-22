import { supabase } from './supabase';
import type {
  LocalAtendimento,
  LocalAtendimentoCreateInput,
  LocalAtendimentoUpdateInput,
  ApiResponse,
  PaginatedResponse,
  SystemEntityFilters,
} from '@/types/system-config';

// AI dev note: API para gerenciamento de locais de atendimento
// Inclui gestão de endereços e relacionamentos complexos

const TABLE_NAME = 'locais_atendimento';

// === FETCH ALL WITH ADDRESSES ===
export async function fetchLocaisAtendimento(
  filters: SystemEntityFilters = {}
): Promise<ApiResponse<PaginatedResponse<LocalAtendimento>>> {
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
      .select(`
        *,
        endereco:enderecos(
          cep,
          logradouro,
          bairro,
          cidade,
          estado
        )
      `, { count: 'exact' });

    // Filtros
    if (search) {
      query = query.or(`nome.ilike.%${search}%,tipo_local.ilike.%${search}%`);
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
      console.error('❌ Erro ao buscar locais de atendimento:', error);
      return {
        success: false,
        error: `Erro ao carregar locais de atendimento: ${error.message}`
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
    console.error('❌ Erro inesperado ao buscar locais de atendimento:', error);
    return {
      success: false,
      error: 'Erro inesperado ao carregar locais de atendimento'
    };
  }
}

// === CREATE WITH ADDRESS ===
export async function createLocalAtendimento(
  input: LocalAtendimentoCreateInput,
  userId?: string
): Promise<ApiResponse<LocalAtendimento>> {
  try {
    // Validações
    if (!input.nome?.trim()) {
      return {
        success: false,
        error: 'Nome é obrigatório'
      };
    }

    if (!input.tipo_local) {
      return {
        success: false,
        error: 'Tipo de local é obrigatório'
      };
    }

    let enderecoId = null;

    // Se tem dados de endereço, criar/buscar endereço
    if (input.endereco) {
      const { cep, logradouro, bairro, cidade, estado } = input.endereco;
      
      if (!cep || !logradouro || !bairro || !cidade || !estado) {
        return {
          success: false,
          error: 'Todos os campos do endereço são obrigatórios'
        };
      }

      // Verificar se endereço já existe
      const { data: existingEndereco } = await supabase
        .from('enderecos')
        .select('id')
        .eq('cep', cep)
        .eq('logradouro', logradouro)
        .eq('bairro', bairro)
        .eq('cidade', cidade)
        .eq('estado', estado)
        .single();

      if (existingEndereco) {
        enderecoId = existingEndereco.id;
      } else {
        // Criar novo endereço
        const { data: novoEndereco, error: enderecoError } = await supabase
          .from('enderecos')
          .insert({
            cep,
            logradouro,
            bairro,
            cidade,
            estado
          })
          .select()
          .single();

        if (enderecoError) {
          console.error('❌ Erro ao criar endereço:', enderecoError);
          return {
            success: false,
            error: `Erro ao criar endereço: ${enderecoError.message}`
          };
        }

        enderecoId = novoEndereco.id;
      }
    }

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .insert({
        nome: input.nome.trim(),
        tipo_local: input.tipo_local,
        ativo: input.ativo ?? true,
        id_endereco: enderecoId,
        numero_endereco: input.numero_endereco?.trim() || null,
        complemento_endereco: input.complemento_endereco?.trim() || null,
        criado_por: userId || null
      })
      .select(`
        *,
        endereco:enderecos(
          cep,
          logradouro,
          bairro,
          cidade,
          estado
        )
      `)
      .single();

    if (error) {
      console.error('❌ Erro ao criar local de atendimento:', error);
      return {
        success: false,
        error: `Erro ao criar local de atendimento: ${error.message}`
      };
    }

    return {
      success: true,
      data
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao criar local de atendimento:', error);
    return {
      success: false,
      error: 'Erro inesperado ao criar local de atendimento'
    };
  }
}

// === UPDATE ===
export async function updateLocalAtendimento(
  input: LocalAtendimentoUpdateInput,
  userId?: string
): Promise<ApiResponse<LocalAtendimento>> {
  try {
    if (!input.id) {
      return {
        success: false,
        error: 'ID é obrigatório para atualização'
      };
    }

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
      atualizado_por: userId || null
    };

    if (input.nome !== undefined) updateData.nome = input.nome.trim();
    if (input.tipo_local !== undefined) updateData.tipo_local = input.tipo_local;
    if (input.ativo !== undefined) updateData.ativo = input.ativo;
    if (input.numero_endereco !== undefined) updateData.numero_endereco = input.numero_endereco?.trim() || null;
    if (input.complemento_endereco !== undefined) updateData.complemento_endereco = input.complemento_endereco?.trim() || null;

    // Gestão de endereço se fornecido
    if (input.endereco) {
      const { cep, logradouro, bairro, cidade, estado } = input.endereco;
      
      if (!cep || !logradouro || !bairro || !cidade || !estado) {
        return {
          success: false,
          error: 'Todos os campos do endereço são obrigatórios'
        };
      }

      // Similar à criação - buscar ou criar endereço
      const { data: existingEndereco } = await supabase
        .from('enderecos')
        .select('id')
        .eq('cep', cep)
        .eq('logradouro', logradouro)
        .eq('bairro', bairro)
        .eq('cidade', cidade)
        .eq('estado', estado)
        .single();

      if (existingEndereco) {
        updateData.id_endereco = existingEndereco.id;
      } else {
        const { data: novoEndereco, error: enderecoError } = await supabase
          .from('enderecos')
          .insert({
            cep,
            logradouro,
            bairro,
            cidade,
            estado
          })
          .select()
          .single();

        if (enderecoError) {
          console.error('❌ Erro ao criar endereço:', enderecoError);
          return {
            success: false,
            error: `Erro ao criar endereço: ${enderecoError.message}`
          };
        }

        updateData.id_endereco = novoEndereco.id;
      }
    }

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update(updateData)
      .eq('id', input.id)
      .select(`
        *,
        endereco:enderecos(
          cep,
          logradouro,
          bairro,
          cidade,
          estado
        )
      `)
      .single();

    if (error) {
      console.error('❌ Erro ao atualizar local de atendimento:', error);
      return {
        success: false,
        error: `Erro ao atualizar local de atendimento: ${error.message}`
      };
    }

    return {
      success: true,
      data
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao atualizar local de atendimento:', error);
    return {
      success: false,
      error: 'Erro inesperado ao atualizar local de atendimento'
    };
  }
}

// === SOFT DELETE ===
export async function deleteLocalAtendimento(
  id: string,
  userId?: string
): Promise<ApiResponse<boolean>> {
  try {
    // Verificar se local está sendo usado em agendamentos
    const { data: agendamentos, error: agendamentosError } = await supabase
      .from('agendamentos')
      .select('id')
      .eq('local_id', id)
      .limit(1);

    if (agendamentosError) {
      console.error('❌ Erro ao verificar dependências:', agendamentosError);
      return {
        success: false,
        error: 'Erro ao verificar se local pode ser excluído'
      };
    }

    if (agendamentos && agendamentos.length > 0) {
      return {
        success: false,
        error: 'Não é possível excluir este local pois existem agendamentos associados a ele'
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
      console.error('❌ Erro ao excluir local de atendimento:', error);
      return {
        success: false,
        error: `Erro ao excluir local de atendimento: ${error.message}`
      };
    }

    return {
      success: true,
      data: true
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao excluir local de atendimento:', error);
    return {
      success: false,
      error: 'Erro inesperado ao excluir local de atendimento'
    };
  }
}

// === TOGGLE STATUS ===
export async function toggleLocalAtendimentoStatus(
  id: string, 
  ativo: boolean,
  userId?: string
): Promise<ApiResponse<LocalAtendimento>> {
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update({ 
        ativo,
        updated_at: new Date().toISOString(),
        atualizado_por: userId || null
      })
      .eq('id', id)
      .select(`
        *,
        endereco:enderecos(
          cep,
          logradouro,
          bairro,
          cidade,
          estado
        )
      `)
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