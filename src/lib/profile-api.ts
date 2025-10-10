import { supabase } from './supabase';
import type { User } from '@supabase/supabase-js';

// AI dev note: Profile API para CRUD de dados da pessoa
// Funções centralizadas para gerenciar perfil do usuário

export interface ProfileData {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  email: string | null;
  telefone: bigint | null;
  data_nascimento: string | null;
  registro_profissional: string | null;
  especialidade: string | null;
  bio_profissional: string | null;
  foto_perfil: string | null;
  numero_endereco: string | null;
  complemento_endereco: string | null;
  role: string | null;
  // Dados calculados/relacionados
  endereco?: {
    cep: string;
    logradouro: string;
    bairro: string;
    cidade: string;
    estado: string;
  } | null;
}

export interface UpdateProfileData {
  nome?: string;
  cpf_cnpj?: string | null;
  email?: string | null;
  telefone?: string | null; // Será convertido para bigint
  data_nascimento?: string | null;
  registro_profissional?: string | null;
  especialidade?: string | null;
  bio_profissional?: string | null;
  foto_perfil?: string | null;
  numero_endereco?: string | null;
  complemento_endereco?: string | null;
  role?: string | null;
  // Para endereço
  cep?: string;
}

export interface CreateEnderecoData {
  cep: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  estado: string;
}

/**
 * Buscar dados completos do perfil do usuário logado
 */
export async function getUserProfile(user: User): Promise<ProfileData | null> {
  if (!user?.id) {
    throw new Error('Usuário não autenticado');
  }

  console.log('🔍 Buscando perfil completo para userId:', user.id);

  try {
    const { data, error } = await supabase
      .from('pessoas')
      .select(
        `
        id,
        nome,
        cpf_cnpj,
        email,
        telefone,
        data_nascimento,
        registro_profissional,
        especialidade,
        bio_profissional,
        foto_perfil,
        numero_endereco,
        complemento_endereco,
        role,
        enderecos:id_endereco (
          cep,
          logradouro,
          bairro,
          cidade,
          estado
        )
      `
      )
      .eq('auth_user_id', user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        console.log('❌ Perfil não encontrado para o usuário');
        return null;
      }
      throw new Error(`Erro ao buscar perfil: ${error.message}`);
    }

    console.log('✅ Perfil encontrado:', data);

    // Converter telefone de bigint para string se existir
    const profileData: ProfileData = {
      ...data,
      telefone: data.telefone ? BigInt(data.telefone) : null,
      endereco: Array.isArray(data.enderecos)
        ? data.enderecos[0]
        : data.enderecos,
    };

    return profileData;
  } catch (error) {
    console.error('❌ Erro ao buscar perfil:', error);
    throw error;
  }
}

/**
 * Atualizar dados do perfil do usuário
 */
export async function updateUserProfile(
  user: User,
  profileData: UpdateProfileData
): Promise<ProfileData> {
  if (!user?.id) {
    throw new Error('Usuário não autenticado');
  }

  console.log(
    '🔄 Atualizando perfil para userId:',
    user.id,
    'dados:',
    profileData
  );

  try {
    // Separar dados de endereço dos dados de pessoa
    const { cep: _cep, ...pessoaData } = profileData; // eslint-disable-line @typescript-eslint/no-unused-vars

    // Converter telefone para string limpa se fornecido (Supabase converte para bigint automaticamente)
    const cleanedPessoaData = {
      ...pessoaData,
      updated_at: new Date().toISOString(),
    };

    // Só processar telefone se foi fornecido
    if (pessoaData.telefone !== undefined) {
      cleanedPessoaData.telefone = pessoaData.telefone
        ? pessoaData.telefone.replace(/\D/g, '')
        : null;
    }

    // Atualizar dados da pessoa
    const { error } = await supabase
      .from('pessoas')
      .update(cleanedPessoaData)
      .eq('auth_user_id', user.id)
      .select()
      .single();

    if (error) {
      throw new Error(`Erro ao atualizar perfil: ${error.message}`);
    }

    console.log('✅ Perfil atualizado com sucesso');

    // Buscar dados completos atualizados
    const updatedProfile = await getUserProfile(user);
    if (!updatedProfile) {
      throw new Error('Erro ao buscar perfil atualizado');
    }

    return updatedProfile;
  } catch (error) {
    console.error('❌ Erro ao atualizar perfil:', error);
    throw error;
  }
}

/**
 * Criar ou atualizar endereço via CEP
 */
export async function upsertEndereco(
  enderecoData: CreateEnderecoData
): Promise<string> {
  // AI dev note: Normalizar CEP removendo caracteres não numéricos
  const cepNormalizado = enderecoData.cep.replace(/\D/g, '');
  const enderecoNormalizado = { ...enderecoData, cep: cepNormalizado };

  console.log('🔄 Criando/atualizando endereço:', enderecoNormalizado);

  try {
    // Verificar se endereço já existe para este CEP
    const { data: existingEndereco } = await supabase
      .from('enderecos')
      .select('id')
      .eq('cep', cepNormalizado)
      .single();

    if (existingEndereco) {
      console.log('✅ Endereço já existe, retornando ID:', existingEndereco.id);
      return existingEndereco.id;
    }

    // Criar novo endereço
    const { data, error } = await supabase
      .from('enderecos')
      .insert(enderecoNormalizado)
      .select('id')
      .single();

    if (error) {
      throw new Error(`Erro ao criar endereço: ${error.message}`);
    }

    console.log('✅ Novo endereço criado:', data.id);
    return data.id;
  } catch (error) {
    console.error('❌ Erro ao processar endereço:', error);
    throw error;
  }
}

/**
 * Upload de avatar para Supabase Storage
 */
export async function uploadAvatar(user: User, file: File): Promise<string> {
  if (!user?.id) {
    throw new Error('Usuário não autenticado');
  }

  console.log(
    '🔄 Upload de avatar para userId:',
    user.id,
    'arquivo:',
    file.name
  );

  // Validar arquivo
  const maxSize = 2 * 1024 * 1024; // 2MB
  const allowedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
  ];

  if (file.size > maxSize) {
    throw new Error('Arquivo muito grande. Máximo 2MB permitido.');
  }

  if (!allowedTypes.includes(file.type)) {
    throw new Error('Formato não suportado. Use JPG, PNG, WEBP ou GIF.');
  }

  try {
    // Buscar avatar atual para cleanup posterior
    const currentProfile = await getUserProfile(user);
    const oldAvatarPath = currentProfile?.foto_perfil;

    // Gerar nome único do arquivo
    const fileExtension = file.name.split('.').pop() || 'jpg';
    const timestamp = Date.now();
    const fileName = `${user.id}/${timestamp}.${fileExtension}`;

    console.log('📁 Uploading para:', fileName);

    // Upload para Supabase Storage
    const { data, error } = await supabase.storage
      .from('respira-profiles')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('❌ Erro no upload:', error);
      throw new Error(`Erro ao fazer upload: ${error.message}`);
    }

    console.log('✅ Upload concluído:', data.path);

    // Gerar URL pública do arquivo
    const {
      data: { publicUrl },
    } = supabase.storage.from('respira-profiles').getPublicUrl(data.path);

    console.log('🔗 URL pública gerada:', publicUrl);

    // Cleanup: remover arquivo antigo se existir
    if (oldAvatarPath && oldAvatarPath !== publicUrl) {
      try {
        // Extrair path do arquivo antigo (formato: bucket/path)
        const oldPath = oldAvatarPath.split('/respira-profiles/')[1];
        if (oldPath) {
          const { error: deleteError } = await supabase.storage
            .from('respira-profiles')
            .remove([oldPath]);

          if (deleteError) {
            console.warn(
              '⚠️ Não foi possível remover arquivo antigo:',
              deleteError
            );
          } else {
            console.log('🗑️ Arquivo antigo removido:', oldPath);
          }
        }
      } catch (cleanupError) {
        console.warn('⚠️ Erro ao limpar arquivo antigo:', cleanupError);
      }
    }

    return publicUrl;
  } catch (error) {
    console.error('❌ Erro no upload do avatar:', error);
    throw error;
  }
}

/**
 * Remover avatar atual do storage e banco
 */
export async function removeAvatar(user: User): Promise<void> {
  if (!user?.id) {
    throw new Error('Usuário não autenticado');
  }

  console.log('🗑️ Removendo avatar para userId:', user.id);

  try {
    // Buscar avatar atual
    const currentProfile = await getUserProfile(user);
    const avatarUrl = currentProfile?.foto_perfil;

    // Remover do banco primeiro
    const { error: dbError } = await supabase
      .from('pessoas')
      .update({
        foto_perfil: null,
        updated_at: new Date().toISOString(),
      })
      .eq('auth_user_id', user.id);

    if (dbError) {
      throw new Error(`Erro ao remover avatar do banco: ${dbError.message}`);
    }

    // Remover arquivo do storage se existir
    if (avatarUrl && avatarUrl.includes('respira-profiles')) {
      try {
        const avatarPath = avatarUrl.split('/respira-profiles/')[1];
        if (avatarPath) {
          const { error: storageError } = await supabase.storage
            .from('respira-profiles')
            .remove([avatarPath]);

          if (storageError) {
            console.warn('⚠️ Erro ao remover do storage:', storageError);
          } else {
            console.log('✅ Arquivo removido do storage:', avatarPath);
          }
        }
      } catch (storageError) {
        console.warn('⚠️ Erro ao processar remoção do storage:', storageError);
      }
    }

    console.log('✅ Avatar removido com sucesso');
  } catch (error) {
    console.error('❌ Erro ao remover avatar:', error);
    throw error;
  }
}

/**
 * Converter telefone de string formatada para bigint
 */
export function formatPhoneForDatabase(phone: string): bigint {
  const cleanPhone = phone.replace(/\D/g, '');
  return BigInt(cleanPhone);
}

/**
 * Converter telefone de bigint para string formatada
 */
export function formatPhoneForDisplay(phone: bigint | number | null): string {
  if (!phone) return '';

  const phoneStr = phone.toString();

  if (phoneStr.length === 11) {
    // Formato: (11) 99999-9999
    return `(${phoneStr.slice(0, 2)}) ${phoneStr.slice(2, 7)}-${phoneStr.slice(7)}`;
  } else if (phoneStr.length === 10) {
    // Formato: (11) 9999-9999
    return `(${phoneStr.slice(0, 2)}) ${phoneStr.slice(2, 6)}-${phoneStr.slice(6)}`;
  }

  return phoneStr;
}
