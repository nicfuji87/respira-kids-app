import { supabase } from './supabase';
import type {
  Endereco,
  EnderecoCreateInput,
  EnderecoUpdateInput,
  ApiResponse,
  PaginatedResponse,
  SystemEntityFilters,
} from '@/types/system-config';

// AI dev note: API para gerenciamento de endereços com integração ViaCEP
// Segue padrão das outras system APIs mas inclui funcionalidade de busca por CEP

// === INTERFACES AUXILIARES ===
interface ViaCepResponse {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  ibge: string;
  gia: string;
  ddd: string;
  siafi: string;
  erro?: boolean;
}

export interface EnderecoViaCepData {
  cep: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  estado: string;
}

// === BUSCA POR CEP ===

/**
 * Buscar endereço por CEP usando ViaCEP
 */
export async function fetchAddressByCep(
  cep: string
): Promise<ApiResponse<EnderecoViaCepData>> {
  try {
    // Limpar formatação do CEP
    const cleanCep = cep.replace(/\D/g, '');

    if (cleanCep.length !== 8) {
      return {
        success: false,
        error: 'CEP deve ter 8 dígitos',
      };
    }

    console.log('🔍 Buscando CEP na ViaCEP:', cleanCep);

    const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);

    if (!response.ok) {
      return {
        success: false,
        error: 'Erro ao consultar CEP na ViaCEP',
      };
    }

    const data: ViaCepResponse = await response.json();

    if (data.erro) {
      return {
        success: false,
        error: 'CEP não encontrado',
      };
    }

    const enderecoData: EnderecoViaCepData = {
      cep: data.cep,
      logradouro: data.logradouro,
      bairro: data.bairro,
      cidade: data.localidade,
      estado: data.uf,
    };

    console.log('✅ Endereço encontrado na ViaCEP:', enderecoData);

    return {
      success: true,
      data: enderecoData,
    };
  } catch (error) {
    console.error('❌ Erro ao buscar CEP:', error);
    return {
      success: false,
      error: 'Não foi possível consultar o CEP',
    };
  }
}

// === CRUD OPERATIONS ===

/**
 * Buscar todos os endereços com filtros
 */
export async function fetchEnderecos(
  filters: SystemEntityFilters = {}
): Promise<ApiResponse<PaginatedResponse<Endereco>>> {
  try {
    console.log('🔍 Buscando endereços com filtros:', filters);

    let query = supabase.from('enderecos').select('*', { count: 'exact' });

    // Aplicar filtro de busca
    if (filters.search) {
      query = query.or(
        `cep.ilike.%${filters.search}%,logradouro.ilike.%${filters.search}%,bairro.ilike.%${filters.search}%,cidade.ilike.%${filters.search}%`
      );
    }

    // Ordenação
    const sortBy = filters.sortBy || 'cidade';
    const sortOrder = filters.sortOrder || 'asc';
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    // Paginação
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const offset = (page - 1) * limit;

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('❌ Erro ao buscar endereços:', error);
      return {
        success: false,
        error: `Erro ao buscar endereços: ${error.message}`,
      };
    }

    const totalPages = count ? Math.ceil(count / limit) : 0;

    console.log('✅ Endereços encontrados:', data?.length || 0);

    return {
      success: true,
      data: {
        data: data || [],
        total: count || 0,
        page,
        limit,
        totalPages,
      },
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao buscar endereços:', error);
    return {
      success: false,
      error: 'Erro inesperado ao buscar endereços',
    };
  }
}

/**
 * Criar novo endereço
 */
export async function createEndereco(
  enderecoData: EnderecoCreateInput
): Promise<ApiResponse<Endereco>> {
  try {
    // AI dev note: Normalizar CEP removendo caracteres não numéricos
    const cepNormalizado = enderecoData.cep.replace(/\D/g, '');
    const enderecoNormalizado = { ...enderecoData, cep: cepNormalizado };

    console.log('➕ Criando endereço:', enderecoNormalizado);

    // Verificar se já existe endereço com mesmo CEP
    const { data: existing } = await supabase
      .from('enderecos')
      .select('id')
      .eq('cep', cepNormalizado)
      .single();

    if (existing) {
      return {
        success: false,
        error: 'Já existe um endereço cadastrado com este CEP',
      };
    }

    const { data, error } = await supabase
      .from('enderecos')
      .insert(enderecoNormalizado)
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao criar endereço:', error);

      // Tratar erros específicos
      if (error.code === '23505') {
        return {
          success: false,
          error: 'CEP já existe no sistema',
        };
      }

      return {
        success: false,
        error: `Erro ao criar endereço: ${error.message}`,
      };
    }

    console.log('✅ Endereço criado:', data);

    return {
      success: true,
      data,
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao criar endereço:', error);
    return {
      success: false,
      error: 'Erro inesperado ao criar endereço',
    };
  }
}

/**
 * Atualizar endereço existente
 */
export async function updateEndereco(
  enderecoData: EnderecoUpdateInput
): Promise<ApiResponse<Endereco>> {
  try {
    console.log('✏️ Atualizando endereço:', enderecoData);

    const { id, ...updateData } = enderecoData;

    // AI dev note: Normalizar CEP se fornecido
    if (updateData.cep) {
      updateData.cep = updateData.cep.replace(/\D/g, '');
    }

    // Se está alterando o CEP, verificar se não existe outro endereço com o mesmo CEP
    if (updateData.cep) {
      const { data: existing } = await supabase
        .from('enderecos')
        .select('id')
        .eq('cep', updateData.cep)
        .neq('id', id)
        .single();

      if (existing) {
        return {
          success: false,
          error: 'Já existe outro endereço cadastrado com este CEP',
        };
      }
    }

    const { data, error } = await supabase
      .from('enderecos')
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao atualizar endereço:', error);
      return {
        success: false,
        error: `Erro ao atualizar endereço: ${error.message}`,
      };
    }

    console.log('✅ Endereço atualizado:', data);

    return {
      success: true,
      data,
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao atualizar endereço:', error);
    return {
      success: false,
      error: 'Erro inesperado ao atualizar endereço',
    };
  }
}

/**
 * Excluir endereço
 */
export async function deleteEndereco(
  id: string
): Promise<ApiResponse<boolean>> {
  try {
    console.log('🗑️ Verificando dependências para excluir endereço:', id);

    // Verificar se o endereço está sendo usado
    const dependencyChecks = [
      // Verificar pessoas usando este endereço
      { table: 'pessoas', column: 'id_endereco', name: 'pessoas' },
      // Verificar locais de atendimento usando este endereço
      {
        table: 'locais_atendimento',
        column: 'id_endereco',
        name: 'locais de atendimento',
      },
    ];

    for (const check of dependencyChecks) {
      const { data, error } = await supabase
        .from(check.table)
        .select('id')
        .eq(check.column, id)
        .limit(1);

      if (error) {
        console.error(
          `❌ Erro ao verificar dependência ${check.table}:`,
          error
        );
        return {
          success: false,
          error: `Erro ao verificar dependências: ${error.message}`,
        };
      }

      if (data && data.length > 0) {
        return {
          success: false,
          error: `Não é possível excluir este endereço porque ele está sendo usado por ${check.name}`,
        };
      }
    }

    // Se não há dependências, pode excluir
    const { error } = await supabase.from('enderecos').delete().eq('id', id);

    if (error) {
      console.error('❌ Erro ao excluir endereço:', error);
      return {
        success: false,
        error: `Erro ao excluir endereço: ${error.message}`,
      };
    }

    console.log('✅ Endereço excluído com sucesso');

    return {
      success: true,
      data: true,
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao excluir endereço:', error);
    return {
      success: false,
      error: 'Erro inesperado ao excluir endereço',
    };
  }
}
