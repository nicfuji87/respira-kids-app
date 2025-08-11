// AI dev note: API para gerenciamento de integrações - chaves de API e prompts de IA
// Seguindo padrões de segurança e verificação de roles
// Asaas usa tabela pessoa_empresas (campo api_token_externo)
// Evolution API e OpenAI usam tabela api_keys

import { supabase } from './supabase';
import type {
  ApiKey,
  ApiKeyCreate,
  ApiKeyUpdate,
  AiPrompt,
  AiPromptCreate,
  AiPromptUpdate,
  ApiResponse,
  PaginatedApiKeys,
  PaginatedAiPrompts,
} from '../types/integrations';
import type { CompanyData } from '../types/company';

const ITEMS_PER_PAGE = 10;

// AI dev note: Verificar se o usuário atual é admin
export async function checkAdminRole(): Promise<ApiResponse<boolean>> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { data: false, error: 'Usuário não autenticado', success: false };
    }

    const { data, error } = await supabase
      .from('pessoas')
      .select('role, ativo')
      .eq('auth_user_id', user.id)
      .single();

    if (error) {
      console.error('❌ Erro ao verificar role:', error);
      return {
        data: false,
        error: 'Erro ao verificar permissões',
        success: false,
      };
    }

    const isAdmin = data?.role === 'admin' && data?.ativo === true;
    return { data: isAdmin, error: null, success: true };
  } catch (error) {
    console.error('❌ Erro inesperado ao verificar admin:', error);
    return { data: false, error: 'Erro inesperado', success: false };
  }
}

// ============================================================================
// FUNÇÕES AUXILIARES PARA ASAAS (pessoa_empresas)
// ============================================================================

// AI dev note: Buscar empresa do usuário para gerenciar token Asaas
async function getUserCompanyForAsaas(): Promise<CompanyData | null> {
  try {
    console.log('🔐 Verificando usuário autenticado...');
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.log('❌ Usuário não autenticado');
      return null;
    }

    console.log('✅ Usuário autenticado:', user.id);
    console.log('👤 Buscando dados da pessoa na tabela pessoas...');

    const { data: pessoa, error: pessoaError } = await supabase
      .from('pessoas')
      .select('id_empresa')
      .eq('auth_user_id', user.id)
      .single();

    console.log('📊 Resultado da busca de pessoa:', { pessoa, pessoaError });

    if (pessoaError) {
      console.log('❌ Erro ao buscar pessoa:', pessoaError.message);
      return null;
    }

    if (!pessoa?.id_empresa) {
      console.log('❌ Pessoa não tem empresa associada (id_empresa é null)');
      return null;
    }

    console.log('✅ Pessoa tem empresa associada:', pessoa.id_empresa);
    console.log('🏢 Buscando dados da empresa na tabela pessoa_empresas...');

    const { data: empresa, error: empresaError } = await supabase
      .from('pessoa_empresas')
      .select('*')
      .eq('id', pessoa.id_empresa)
      .eq('ativo', true)
      .single();

    console.log('📊 Resultado da busca de empresa:', { empresa, empresaError });

    if (empresaError) {
      console.log('❌ Erro ao buscar empresa:', empresaError.message);
      return null;
    }

    if (!empresa) {
      console.log('❌ Empresa não encontrada ou inativa');
      return null;
    }

    console.log('✅ Empresa encontrada:', {
      id: empresa.id,
      razao_social: empresa.razao_social,
      ativo: empresa.ativo,
      tem_token: !!empresa.api_token_externo,
      token_preview: empresa.api_token_externo
        ? `${empresa.api_token_externo.slice(0, 10)}...`
        : 'null',
    });

    return empresa;
  } catch (error) {
    console.error('❌ Erro ao buscar empresa do usuário:', error);
    return null;
  }
}

// AI dev note: Converter dados da empresa para formato ApiKey para Asaas
function mapCompanyToApiKey(company: CompanyData): ApiKey {
  return {
    id: company.id,
    service_name: 'asaas',
    encrypted_key: company.api_token_externo || '',
    label: `${company.razao_social} - Asaas`,
    is_active: company.ativo,
    created_at: company.created_at,
    updated_at: company.updated_at,
  };
}

// ============================================================================
// API KEYS
// ============================================================================

// Buscar chaves de API (apenas admins)
export async function fetchApiKeys(
  page: number = 1,
  limit: number = ITEMS_PER_PAGE
): Promise<ApiResponse<PaginatedApiKeys>> {
  try {
    // Verificar se é admin primeiro
    const adminCheck = await checkAdminRole();
    if (!adminCheck.success || !adminCheck.data) {
      return {
        data: null,
        error:
          'Acesso negado. Apenas administradores podem acessar as integrações.',
        success: false,
      };
    }

    // Buscar chaves API tradicionais (Evolution API e OpenAI)
    const { data: apiKeysData, error: apiKeysError } = await supabase
      .from('api_keys')
      .select('*')
      .in('service_name', ['openai', 'evolution'])
      .order('service_name', { ascending: true });

    if (apiKeysError) {
      console.error('❌ Erro ao buscar chaves de API:', apiKeysError);
      return { data: null, error: apiKeysError.message, success: false };
    }

    // Buscar token Asaas da empresa do usuário
    console.log('🔍 Buscando empresa do usuário para Asaas...');
    const company = await getUserCompanyForAsaas();
    console.log('🏢 Empresa encontrada:', company);

    const allData: ApiKey[] = [...(apiKeysData as ApiKey[])];

    // Adicionar Asaas se houver empresa
    if (company) {
      console.log('✅ Adicionando Asaas à lista de integrações');
      const asaasApiKey = mapCompanyToApiKey(company);
      console.log('🔑 Dados do Asaas mapeados:', asaasApiKey);
      allData.push(asaasApiKey);
    } else {
      console.log(
        '❌ Nenhuma empresa encontrada para o usuário - Asaas não será exibido'
      );
    }

    // Ordenar por service_name
    allData.sort((a, b) => a.service_name.localeCompare(b.service_name));

    // Aplicar paginação manual
    const offset = (page - 1) * limit;
    const paginatedData = allData.slice(offset, offset + limit);
    const totalPages = Math.ceil(allData.length / limit);

    console.log('📋 Dados finais de integrações:', {
      total_items: allData.length,
      items_pagina: paginatedData.length,
      servicos: allData.map((item) => item.service_name),
      dados_pagina: paginatedData.map((item) => ({
        service: item.service_name,
        id: item.id,
        label: item.label,
        active: item.is_active,
      })),
    });

    return {
      data: {
        data: paginatedData,
        total: allData.length,
        page,
        limit,
        totalPages,
      },
      error: null,
      success: true,
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao buscar chaves:', error);
    return { data: null, error: 'Erro inesperado', success: false };
  }
}

// Criar nova chave de API
export async function createApiKey(
  data: ApiKeyCreate
): Promise<ApiResponse<ApiKey>> {
  try {
    // Verificar se é admin primeiro
    const adminCheck = await checkAdminRole();
    if (!adminCheck.success || !adminCheck.data) {
      return {
        data: null,
        error:
          'Acesso negado. Apenas administradores podem gerenciar integrações.',
        success: false,
      };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Para Asaas, usar tabela pessoa_empresas
    if (data.service_name === 'asaas') {
      const company = await getUserCompanyForAsaas();
      if (!company) {
        return {
          data: null,
          error:
            'Empresa não encontrada. É necessário ter uma empresa cadastrada para configurar o Asaas.',
          success: false,
        };
      }

      const { data: updatedCompany, error } = await supabase
        .from('pessoa_empresas')
        .update({
          api_token_externo: data.encrypted_key,
        })
        .eq('id', company.id)
        .select()
        .single();

      if (error) {
        console.error('❌ Erro ao atualizar token Asaas:', error);
        return { data: null, error: error.message, success: false };
      }

      return {
        data: mapCompanyToApiKey(updatedCompany),
        error: null,
        success: true,
      };
    }

    // Para Evolution API e OpenAI, usar tabela api_keys
    const { data: newApiKey, error } = await supabase
      .from('api_keys')
      .insert({
        ...data,
        created_by: user?.id,
        updated_by: user?.id,
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao criar chave de API:', error);
      return { data: null, error: error.message, success: false };
    }

    return { data: newApiKey as ApiKey, error: null, success: true };
  } catch (error) {
    console.error('❌ Erro inesperado ao criar chave:', error);
    return { data: null, error: 'Erro inesperado', success: false };
  }
}

// Atualizar chave de API
export async function updateApiKey(
  id: string,
  data: ApiKeyUpdate
): Promise<ApiResponse<ApiKey>> {
  try {
    // Verificar se é admin primeiro
    const adminCheck = await checkAdminRole();
    if (!adminCheck.success || !adminCheck.data) {
      return {
        data: null,
        error:
          'Acesso negado. Apenas administradores podem gerenciar integrações.',
        success: false,
      };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Verificar se é Asaas baseado no ID (será o ID da empresa)
    const company = await getUserCompanyForAsaas();
    if (company && company.id === id) {
      // Atualizar token Asaas na tabela pessoa_empresas
      const updateData: Record<string, string | undefined> = {};

      if (data.encrypted_key && data.encrypted_key.trim() !== '') {
        updateData.api_token_externo = data.encrypted_key;
      }

      const { data: updatedCompany, error } = await supabase
        .from('pessoa_empresas')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('❌ Erro ao atualizar token Asaas:', error);
        return { data: null, error: error.message, success: false };
      }

      return {
        data: mapCompanyToApiKey(updatedCompany),
        error: null,
        success: true,
      };
    }

    // Para Evolution API e OpenAI, usar tabela api_keys
    const { data: updatedApiKey, error } = await supabase
      .from('api_keys')
      .update({
        ...data,
        updated_by: user?.id,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao atualizar chave de API:', error);
      return { data: null, error: error.message, success: false };
    }

    return { data: updatedApiKey as ApiKey, error: null, success: true };
  } catch (error) {
    console.error('❌ Erro inesperado ao atualizar chave:', error);
    return { data: null, error: 'Erro inesperado', success: false };
  }
}

// Toggle status da chave de API (soft delete/enable)
export async function toggleApiKeyStatus(
  id: string
): Promise<ApiResponse<ApiKey>> {
  try {
    // Verificar se é admin primeiro
    const adminCheck = await checkAdminRole();
    if (!adminCheck.success || !adminCheck.data) {
      return {
        data: null,
        error:
          'Acesso negado. Apenas administradores podem gerenciar integrações.',
        success: false,
      };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Verificar se é Asaas baseado no ID (será o ID da empresa)
    const company = await getUserCompanyForAsaas();
    if (company && company.id === id) {
      // Toggle status da empresa (campo ativo)
      const newStatus = !company.ativo;

      const { data: updatedCompany, error } = await supabase
        .from('pessoa_empresas')
        .update({
          ativo: newStatus,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('❌ Erro ao alterar status do Asaas:', error);
        return { data: null, error: error.message, success: false };
      }

      return {
        data: mapCompanyToApiKey(updatedCompany),
        error: null,
        success: true,
      };
    }

    // Para Evolution API e OpenAI, usar tabela api_keys
    // Primeiro buscar o status atual
    const { data: currentKey, error: fetchError } = await supabase
      .from('api_keys')
      .select('is_active')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('❌ Erro ao buscar chave de API:', fetchError);
      return { data: null, error: fetchError.message, success: false };
    }

    // Inverter o status
    const newStatus = !currentKey.is_active;

    const { data: updatedKey, error } = await supabase
      .from('api_keys')
      .update({
        is_active: newStatus,
        updated_by: user?.id,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao alterar status da chave de API:', error);
      return { data: null, error: error.message, success: false };
    }

    return { data: updatedKey as ApiKey, error: null, success: true };
  } catch (error) {
    console.error('❌ Erro inesperado ao alterar status:', error);
    return { data: null, error: 'Erro inesperado', success: false };
  }
}

// Deletar chave de API (soft delete - desativa a chave)
export async function deleteApiKey(id: string): Promise<ApiResponse<boolean>> {
  try {
    // Verificar se é admin primeiro
    const adminCheck = await checkAdminRole();
    if (!adminCheck.success || !adminCheck.data) {
      return {
        data: false,
        error:
          'Acesso negado. Apenas administradores podem gerenciar integrações.',
        success: false,
      };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Verificar se é Asaas baseado no ID (será o ID da empresa)
    const company = await getUserCompanyForAsaas();
    if (company && company.id === id) {
      // Para Asaas, apenas limpar o token, não desativar a empresa
      const { error } = await supabase
        .from('pessoa_empresas')
        .update({
          api_token_externo: null,
        })
        .eq('id', id);

      if (error) {
        console.error('❌ Erro ao remover token Asaas:', error);
        return { data: false, error: error.message, success: false };
      }

      return { data: true, error: null, success: true };
    }

    // Para Evolution API e OpenAI, usar tabela api_keys - soft delete
    const { error } = await supabase
      .from('api_keys')
      .update({
        is_active: false,
        updated_by: user?.id,
      })
      .eq('id', id);

    if (error) {
      console.error('❌ Erro ao deletar chave de API:', error);
      return { data: false, error: error.message, success: false };
    }

    return { data: true, error: null, success: true };
  } catch (error) {
    console.error('❌ Erro inesperado ao deletar chave:', error);
    return { data: false, error: 'Erro inesperado', success: false };
  }
}

// ============================================================================
// AI PROMPTS
// ============================================================================

// Buscar prompts de IA (apenas admins)
export async function fetchAiPrompts(
  page: number = 1,
  limit: number = ITEMS_PER_PAGE
): Promise<ApiResponse<PaginatedAiPrompts>> {
  try {
    // Verificar se é admin primeiro
    const adminCheck = await checkAdminRole();
    if (!adminCheck.success || !adminCheck.data) {
      return {
        data: null,
        error:
          'Acesso negado. Apenas administradores podem acessar os prompts.',
        success: false,
      };
    }

    // Buscar contagem total
    const { count } = await supabase
      .from('ai_prompts')
      .select('*', { count: 'exact', head: true });

    // Buscar dados com paginação
    const offset = (page - 1) * limit;
    const { data, error } = await supabase
      .from('ai_prompts')
      .select('*')
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Erro ao buscar prompts:', error);
      return { data: null, error: error.message, success: false };
    }

    const totalPages = Math.ceil((count || 0) / limit);

    return {
      data: {
        data: data as AiPrompt[],
        total: count || 0,
        page,
        limit,
        totalPages,
      },
      error: null,
      success: true,
    };
  } catch (error) {
    console.error('❌ Erro inesperado ao buscar prompts:', error);
    return { data: null, error: 'Erro inesperado', success: false };
  }
}

// Criar novo prompt de IA
export async function createAiPrompt(
  data: AiPromptCreate
): Promise<ApiResponse<AiPrompt>> {
  try {
    // Verificar se é admin primeiro
    const adminCheck = await checkAdminRole();
    if (!adminCheck.success || !adminCheck.data) {
      return {
        data: null,
        error: 'Acesso negado. Apenas administradores podem gerenciar prompts.',
        success: false,
      };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: newPrompt, error } = await supabase
      .from('ai_prompts')
      .insert({
        ...data,
        created_by: user?.id,
        updated_by: user?.id,
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao criar prompt:', error);
      return { data: null, error: error.message, success: false };
    }

    return { data: newPrompt as AiPrompt, error: null, success: true };
  } catch (error) {
    console.error('❌ Erro inesperado ao criar prompt:', error);
    return { data: null, error: 'Erro inesperado', success: false };
  }
}

// Atualizar prompt de IA
export async function updateAiPrompt(
  id: string,
  data: AiPromptUpdate
): Promise<ApiResponse<AiPrompt>> {
  try {
    // Verificar se é admin primeiro
    const adminCheck = await checkAdminRole();
    if (!adminCheck.success || !adminCheck.data) {
      return {
        data: null,
        error: 'Acesso negado. Apenas administradores podem gerenciar prompts.',
        success: false,
      };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: updatedPrompt, error } = await supabase
      .from('ai_prompts')
      .update({
        ...data,
        updated_by: user?.id,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao atualizar prompt:', error);
      return { data: null, error: error.message, success: false };
    }

    return { data: updatedPrompt as AiPrompt, error: null, success: true };
  } catch (error) {
    console.error('❌ Erro inesperado ao atualizar prompt:', error);
    return { data: null, error: 'Erro inesperado', success: false };
  }
}

// Deletar prompt de IA
export async function deleteAiPrompt(
  id: string
): Promise<ApiResponse<boolean>> {
  try {
    // Verificar se é admin primeiro
    const adminCheck = await checkAdminRole();
    if (!adminCheck.success || !adminCheck.data) {
      return {
        data: false,
        error: 'Acesso negado. Apenas administradores podem gerenciar prompts.',
        success: false,
      };
    }

    const { error } = await supabase.from('ai_prompts').delete().eq('id', id);

    if (error) {
      console.error('❌ Erro ao deletar prompt:', error);
      return { data: false, error: error.message, success: false };
    }

    return { data: true, error: null, success: true };
  } catch (error) {
    console.error('❌ Erro inesperado ao deletar prompt:', error);
    return { data: false, error: 'Erro inesperado', success: false };
  }
}
