// AI dev note: API para gerenciamento de integrações - chaves de API e prompts de IA
// Seguindo padrões de segurança e verificação de roles

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

    // Buscar contagem total
    const { count } = await supabase
      .from('api_keys')
      .select('*', { count: 'exact', head: true });

    // Buscar dados com paginação
    const offset = (page - 1) * limit;
    const { data, error } = await supabase
      .from('api_keys')
      .select('*')
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Erro ao buscar chaves de API:', error);
      return { data: null, error: error.message, success: false };
    }

    const totalPages = Math.ceil((count || 0) / limit);

    return {
      data: {
        data: data as ApiKey[],
        total: count || 0,
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

// Deletar chave de API
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

    const { error } = await supabase.from('api_keys').delete().eq('id', id);

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
