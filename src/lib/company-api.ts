import { supabase } from './supabase';
import type { User } from '@supabase/supabase-js';
import type {
  CompanyData,
  CreateCompanyData,
  UpdateCompanyData,
} from '@/types/company';
import { normalizeCnpj } from './utils';

// AI dev note: Company API para CRUD de dados da empresa
// Funções centralizadas para gerenciar empresa do usuário seguindo padrão de profile-api.ts

/**
 * Busca a empresa associada ao usuário logado
 */
export async function getUserCompany(user: User): Promise<CompanyData | null> {
  try {
    const { data: pessoa, error: pessoaError } = await supabase
      .from('pessoas')
      .select('id_empresa')
      .eq('auth_user_id', user.id)
      .single();

    if (pessoaError) {
      console.error('Erro ao buscar pessoa:', pessoaError);
      return null;
    }

    if (!pessoa?.id_empresa) {
      return null;
    }

    const { data: empresa, error: empresaError } = await supabase
      .from('pessoa_empresas')
      .select('*')
      .eq('id', pessoa.id_empresa)
      .eq('ativo', true)
      .single();

    if (empresaError) {
      console.error('Erro ao buscar empresa:', empresaError);
      return null;
    }

    return empresa;
  } catch (error) {
    console.error('Erro inesperado ao buscar empresa:', error);
    return null;
  }
}

/**
 * Cria uma nova empresa e associa ao usuário
 */
export async function createCompany(
  user: User,
  companyData: CreateCompanyData
): Promise<CompanyData> {
  try {
    // Verificar se CNPJ já existe (normalizar para comparação)
    const normalizedCnpj = normalizeCnpj(companyData.cnpj);
    const { data: existingCompany } = await supabase
      .from('pessoa_empresas')
      .select('id, cnpj')
      .ilike('cnpj', `%${normalizedCnpj}%`)
      .eq('ativo', true)
      .single();

    if (existingCompany) {
      throw new Error(
        `CNPJ ${companyData.cnpj} já está cadastrado no sistema.`
      );
    }

    // Criar empresa
    const { data: empresa, error: empresaError } = await supabase
      .from('pessoa_empresas')
      .insert([companyData])
      .select()
      .single();

    if (empresaError) {
      console.error('Erro ao criar empresa:', empresaError);
      throw new Error('Erro ao cadastrar empresa. Tente novamente.');
    }

    // Associar empresa à pessoa
    const { error: pessoaError } = await supabase
      .from('pessoas')
      .update({ id_empresa: empresa.id })
      .eq('auth_user_id', user.id);

    if (pessoaError) {
      console.error('Erro ao associar empresa à pessoa:', pessoaError);
      // Reverter criação da empresa em caso de erro
      await supabase.from('pessoa_empresas').delete().eq('id', empresa.id);
      throw new Error('Erro ao associar empresa ao usuário. Tente novamente.');
    }

    return empresa;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Erro inesperado ao criar empresa. Tente novamente.');
  }
}

/**
 * Atualiza dados da empresa
 */
export async function updateCompany(
  user: User,
  companyData: UpdateCompanyData
): Promise<CompanyData> {
  try {
    // Buscar empresa atual do usuário
    const currentCompany = await getUserCompany(user);
    if (!currentCompany) {
      throw new Error('Nenhuma empresa encontrada para este usuário.');
    }

    // Verificar permissão de edição
    const canEdit = await canUserEditCompany(user, currentCompany.id);
    if (!canEdit) {
      throw new Error('Você não tem permissão para editar esta empresa.');
    }

    // Se alterando CNPJ, verificar se já existe
    if (companyData.cnpj && companyData.cnpj !== currentCompany.cnpj) {
      const normalizedCnpj = normalizeCnpj(companyData.cnpj);
      const { data: existingCompany } = await supabase
        .from('pessoa_empresas')
        .select('id, cnpj')
        .ilike('cnpj', `%${normalizedCnpj}%`)
        .eq('ativo', true)
        .neq('id', currentCompany.id)
        .single();

      if (existingCompany) {
        throw new Error(
          `CNPJ ${companyData.cnpj} já está cadastrado no sistema.`
        );
      }
    }

    const { data: empresa, error } = await supabase
      .from('pessoa_empresas')
      .update({ ...companyData, updated_at: new Date().toISOString() })
      .eq('id', currentCompany.id)
      .select()
      .single();

    if (error) {
      console.error('Erro ao atualizar empresa:', error);
      throw new Error('Erro ao atualizar empresa. Tente novamente.');
    }

    return empresa;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Erro inesperado ao atualizar empresa. Tente novamente.');
  }
}

/**
 * Desassocia empresa do usuário
 */
export async function removeCompanyAssociation(user: User): Promise<void> {
  try {
    const { error } = await supabase
      .from('pessoas')
      .update({ id_empresa: null })
      .eq('auth_user_id', user.id);

    if (error) {
      console.error('Erro ao desassociar empresa:', error);
      throw new Error('Erro ao desassociar empresa. Tente novamente.');
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Erro inesperado ao desassociar empresa. Tente novamente.');
  }
}

/**
 * Associa uma empresa existente ao usuário
 */
export async function associateExistingCompany(
  user: User,
  companyId: string
): Promise<void> {
  try {
    // Verificar se empresa existe e está ativa
    const { data: empresa, error: empresaError } = await supabase
      .from('pessoa_empresas')
      .select('id, razao_social')
      .eq('id', companyId)
      .eq('ativo', true)
      .single();

    if (empresaError || !empresa) {
      throw new Error('Empresa não encontrada ou inativa.');
    }

    // Associar empresa à pessoa
    const { error: pessoaError } = await supabase
      .from('pessoas')
      .update({ id_empresa: companyId })
      .eq('auth_user_id', user.id);

    if (pessoaError) {
      console.error('Erro ao associar empresa:', pessoaError);
      throw new Error('Erro ao associar empresa. Tente novamente.');
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Erro inesperado ao associar empresa. Tente novamente.');
  }
}

/**
 * Verifica se usuário pode editar a empresa
 */
export async function canUserEditCompany(
  user: User,
  companyId: string
): Promise<boolean> {
  try {
    const { data: pessoa, error } = await supabase
      .from('pessoas')
      .select('role, id_empresa')
      .eq('auth_user_id', user.id)
      .single();

    if (error || !pessoa) {
      return false;
    }

    // Admin e secretaria podem editar qualquer empresa
    if (pessoa.role === 'admin' || pessoa.role === 'secretaria') {
      return true;
    }

    // Profissional só pode editar empresa que criou (que está associada a ele)
    return pessoa.id_empresa === companyId;
  } catch (error) {
    console.error('Erro ao verificar permissão:', error);
    return false;
  }
}

/**
 * Lista todas as empresas (para admin/secretaria)
 */
export async function listAllCompanies(): Promise<CompanyData[]> {
  try {
    const { data: empresas, error } = await supabase
      .from('pessoa_empresas')
      .select('*')
      .eq('ativo', true)
      .order('razao_social');

    if (error) {
      console.error('Erro ao listar empresas:', error);
      throw new Error('Erro ao carregar lista de empresas.');
    }

    return empresas || [];
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Erro inesperado ao carregar empresas.');
  }
}

/**
 * Valida token do Asaas em tempo real
 */
export async function validateAsaasToken(token: string): Promise<{
  isValid: boolean;
  message?: string;
}> {
  try {
    // Validação básica de formato
    if (!token || token.trim().length < 10) {
      return {
        isValid: false,
        message: 'Token deve ter pelo menos 10 caracteres',
      };
    }

    // Chamada para Edge Function do Supabase para validar token
    const { data, error } = await supabase.functions.invoke(
      'validate-asaas-token',
      {
        body: { token: token.trim() },
      }
    );

    if (error) {
      console.error(
        'Erro ao chamar Edge Function validate-asaas-token:',
        error
      );
      return { isValid: false, message: 'Erro na validação do token' };
    }

    return data as { isValid: boolean; message?: string };
  } catch (error) {
    console.error('Erro ao validar token Asaas:', error);
    return {
      isValid: false,
      message: 'Erro na comunicação com o serviço de validação',
    };
  }
}

/**
 * Cria empresa no Asaas usando o token
 */
export async function createCompanyInAsaas(
  token: string,
  companyData: CreateCompanyData
): Promise<{ success: boolean; message: string; asaasId?: string }> {
  try {
    // Chamada para Edge Function do Supabase para criar empresa
    const { data, error } = await supabase.functions.invoke(
      'create-asaas-company',
      {
        body: {
          token: token.trim(),
          companyData: {
            razao_social: companyData.razao_social,
            cnpj: companyData.cnpj,
            regime_tributario: companyData.regime_tributario,
          },
        },
      }
    );

    if (error) {
      console.error(
        'Erro ao chamar Edge Function create-asaas-company:',
        error
      );
      return { success: false, message: 'Erro na criação da empresa' };
    }

    return data as { success: boolean; message: string; asaasId?: string };
  } catch (error) {
    console.error('Erro ao criar empresa no Asaas:', error);
    return {
      success: false,
      message: 'Erro na comunicação com o serviço de criação',
    };
  }
}
