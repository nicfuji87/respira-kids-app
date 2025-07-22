import { supabase } from './supabase';
import type {
  ContractTemplate,
  ContractTemplateCreateInput,
  ContractTemplateUpdateInput,
  ApiResponse,
  PaginatedResponse,
  SystemEntityFilters,
} from '@/types/system-config';

// AI dev note: API para gerenciamento de templates de contrato
// Implementa versionamento e gestão de templates principais

const TABLE_NAME = 'contract_templates';

// === FETCH ALL ===
export async function fetchContractTemplates(
  filters: SystemEntityFilters = {}
): Promise<ApiResponse<PaginatedResponse<ContractTemplate>>> {
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
      console.error('❌ Erro ao buscar templates de contrato:', error);
      return {
        success: false,
        error: `Erro ao carregar templates de contrato: ${error.message}`
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
    console.error('❌ Erro inesperado ao buscar templates de contrato:', error);
    return {
      success: false,
      error: 'Erro inesperado ao carregar templates de contrato'
    };
  }
}

// === CREATE ===
export async function createContractTemplate(
  input: ContractTemplateCreateInput,
  userId?: string
): Promise<ApiResponse<ContractTemplate>> {
  try {
    // Validações
    if (!input.nome?.trim()) {
      return {
        success: false,
        error: 'Nome é obrigatório'
      };
    }

    if (!input.conteudo_template?.trim()) {
      return {
        success: false,
        error: 'Conteúdo do template é obrigatório'
      };
    }

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .insert({
        nome: input.nome.trim(),
        descricao: input.descricao?.trim() || null,
        conteudo_template: input.conteudo_template.trim(),
        variaveis_disponiveis: input.variaveis_disponiveis || {},
        versao: input.versao || 1,
        ativo: input.ativo ?? true,
        template_principal_id: input.template_principal_id || null,
        criado_por: userId || null
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao criar template de contrato:', error);
      return {
        success: false,
        error: `Erro ao criar template de contrato: ${error.message}`
      };
    }

    return {
      success: true,
      data
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao criar template de contrato:', error);
    return {
      success: false,
      error: 'Erro inesperado ao criar template de contrato'
    };
  }
}

// === UPDATE ===
export async function updateContractTemplate(
  input: ContractTemplateUpdateInput,
  userId?: string
): Promise<ApiResponse<ContractTemplate>> {
  try {
    if (!input.id) {
      return {
        success: false,
        error: 'ID é obrigatório para atualização'
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
      atualizado_por: userId || null
    };

    if (input.nome !== undefined) updateData.nome = input.nome.trim();
    if (input.descricao !== undefined) updateData.descricao = input.descricao?.trim() || null;
    if (input.conteudo_template !== undefined) updateData.conteudo_template = input.conteudo_template.trim();
    if (input.variaveis_disponiveis !== undefined) updateData.variaveis_disponiveis = input.variaveis_disponiveis;
    if (input.versao !== undefined) updateData.versao = input.versao;
    if (input.ativo !== undefined) updateData.ativo = input.ativo;
    if (input.template_principal_id !== undefined) updateData.template_principal_id = input.template_principal_id;

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update(updateData)
      .eq('id', input.id)
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao atualizar template de contrato:', error);
      return {
        success: false,
        error: `Erro ao atualizar template de contrato: ${error.message}`
      };
    }

    return {
      success: true,
      data
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao atualizar template de contrato:', error);
    return {
      success: false,
      error: 'Erro inesperado ao atualizar template de contrato'
    };
  }
}

// === SOFT DELETE ===
export async function deleteContractTemplate(
  id: string,
  userId?: string
): Promise<ApiResponse<boolean>> {
  try {
    // Verificar se template está sendo usado em user_contracts
    const { data: contratos, error: contratosError } = await supabase
      .from('user_contracts')
      .select('id')
      .eq('contract_template_id', id)
      .limit(1);

    if (contratosError) {
      console.error('❌ Erro ao verificar dependências:', contratosError);
      return {
        success: false,
        error: 'Erro ao verificar se template pode ser excluído'
      };
    }

    if (contratos && contratos.length > 0) {
      return {
        success: false,
        error: 'Não é possível excluir este template pois existem contratos gerados a partir dele'
      };
    }

    // Verificar se é template principal de outros templates
    const { data: versoes, error: versoesError } = await supabase
      .from(TABLE_NAME)
      .select('id')
      .eq('template_principal_id', id)
      .limit(1);

    if (versoesError) {
      console.error('❌ Erro ao verificar versões:', versoesError);
      return {
        success: false,
        error: 'Erro ao verificar versões do template'
      };
    }

    if (versoes && versoes.length > 0) {
      return {
        success: false,
        error: 'Não é possível excluir este template pois possui versões associadas'
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
      console.error('❌ Erro ao excluir template de contrato:', error);
      return {
        success: false,
        error: `Erro ao excluir template de contrato: ${error.message}`
      };
    }

    return {
      success: true,
      data: true
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao excluir template de contrato:', error);
    return {
      success: false,
      error: 'Erro inesperado ao excluir template de contrato'
    };
  }
}

// === TOGGLE STATUS ===
export async function toggleContractTemplateStatus(
  id: string, 
  ativo: boolean,
  userId?: string
): Promise<ApiResponse<ContractTemplate>> {
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

// === CREATE NEW VERSION ===
export async function createTemplateVersion(
  templateId: string,
  input: Omit<ContractTemplateCreateInput, 'template_principal_id'>,
  userId?: string
): Promise<ApiResponse<ContractTemplate>> {
  try {
    // Buscar próxima versão
    const { data: versoes, error: versoesError } = await supabase
      .from(TABLE_NAME)
      .select('versao')
      .or(`id.eq.${templateId},template_principal_id.eq.${templateId}`)
      .order('versao', { ascending: false })
      .limit(1);

    if (versoesError) {
      console.error('❌ Erro ao buscar versões:', versoesError);
      return {
        success: false,
        error: 'Erro ao determinar próxima versão'
      };
    }

    const proximaVersao = versoes && versoes.length > 0 ? versoes[0].versao + 1 : 2;

    return createContractTemplate({
      ...input,
      versao: proximaVersao,
      template_principal_id: templateId
    }, userId);
  } catch (error) {
    console.error('❌ Erro inesperado ao criar nova versão:', error);
    return {
      success: false,
      error: 'Erro inesperado ao criar nova versão'
    };
  }
} 