import { supabase } from './supabase';

// AI dev note: Funções para completar perfil do usuário no Respira Kids
// Integra com Supabase para atualizar dados da pessoa e marcar profile_complete

export interface PessoaTipo {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
}

export interface EnderecoData {
  cep: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  estado: string;
}

export interface CompleteProfileData {
  nome: string;
  cpf_cnpj: string;
  telefone: string;
  data_nascimento?: string;
  cep: string;
  numero_endereco: string;
  complemento_endereco?: string;
  id_tipo_pessoa?: string;
}

export interface ViaCepResponse {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
}

/**
 * Buscar tipos de pessoa ativos
 */
export async function getPessoaTipos(): Promise<PessoaTipo[]> {
  const { data, error } = await supabase
    .from('pessoa_tipos')
    .select('id, codigo, nome, descricao, ativo')
    .eq('ativo', true)
    .order('nome');

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

/**
 * Buscar endereço por CEP usando ViaCEP
 */
export async function getAddressByCep(
  cep: string
): Promise<EnderecoData | null> {
  // Remover formatação do CEP
  const cleanCep = cep.replace(/\D/g, '');

  if (cleanCep.length !== 8) {
    throw new Error('CEP deve ter 8 dígitos');
  }

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);

    if (!response.ok) {
      throw new Error('Erro ao consultar CEP');
    }

    const data: ViaCepResponse = await response.json();

    if (data.erro) {
      throw new Error('CEP não encontrado');
    }

    return {
      cep: data.cep,
      logradouro: data.logradouro,
      bairro: data.bairro,
      cidade: data.localidade,
      estado: data.uf,
    };
  } catch (error) {
    console.error('Erro ao buscar CEP:', error);
    throw new Error('Não foi possível consultar o CEP');
  }
}

/**
 * Criar ou buscar endereço existente
 */
export async function getOrCreateEndereco(
  enderecoData: EnderecoData
): Promise<string> {
  // Primeiro, verificar se já existe um endereço com esse CEP
  const { data: existingEndereco, error: selectError } = await supabase
    .from('enderecos')
    .select('id')
    .eq('cep', enderecoData.cep)
    .single();

  if (selectError && selectError.code !== 'PGRST116') {
    throw new Error(selectError.message);
  }

  // Se já existe, retornar o ID
  if (existingEndereco) {
    return existingEndereco.id;
  }

  // Se não existe, criar novo
  const { data: newEndereco, error: insertError } = await supabase
    .from('enderecos')
    .insert(enderecoData)
    .select('id')
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  return newEndereco.id;
}

/**
 * Atualizar perfil da pessoa
 */
export async function updateProfile(
  userId: string,
  profileData: CompleteProfileData
): Promise<void> {
  try {
    console.log('updateProfile iniciado para userId:', userId); // Debug log
    console.log('profileData recebido:', profileData); // Debug log

    // 1. Buscar endereço por CEP
    console.log('Buscando endereço por CEP:', profileData.cep); // Debug log
    const enderecoData = await getAddressByCep(profileData.cep);

    if (!enderecoData) {
      throw new Error('Endereço não encontrado para o CEP informado');
    }

    console.log('Endereço encontrado:', enderecoData); // Debug log

    // 2. Criar ou buscar endereço
    console.log('Criando ou buscando endereço...'); // Debug log
    const enderecoId = await getOrCreateEndereco(enderecoData);
    console.log('Endereço ID:', enderecoId); // Debug log

    // 3. Atualizar dados da pessoa
    console.log('Atualizando dados da pessoa...'); // Debug log
    // Limpar telefone e converter para número
    const cleanTelefone = profileData.telefone.replace(/\D/g, '');
    const telefoneNumber = cleanTelefone ? parseInt(cleanTelefone, 10) : null;

    const updateData = {
      nome: profileData.nome,
      cpf_cnpj: profileData.cpf_cnpj,
      telefone: telefoneNumber, // Salvar como BIGINT
      data_nascimento: profileData.data_nascimento || null,
      numero_endereco: profileData.numero_endereco,
      complemento_endereco: profileData.complemento_endereco || null,
      id_endereco: enderecoId,
      id_tipo_pessoa:
        profileData.id_tipo_pessoa || '77e2969e-80a4-496a-a858-11f6ee565df8', // padrão: paciente
      profile_complete: true,
      updated_at: new Date().toISOString(),
    };

    console.log('Dados para update:', updateData); // Debug log

    const { error: updateError } = await supabase
      .from('pessoas')
      .update(updateData)
      .eq('auth_user_id', userId);

    if (updateError) {
      console.error('Erro no update:', updateError); // Debug log
      throw new Error(updateError.message);
    }

    console.log('Update da pessoa completado com sucesso!'); // Debug log
  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    throw error;
  }
}

/**
 * Buscar dados atuais do perfil
 */
export async function getCurrentProfile(userId: string) {
  const { data, error } = await supabase
    .from('pessoas')
    .select(
      `
      id,
      nome,
      cpf_cnpj,
      telefone,
      data_nascimento,
      registro_profissional,
      especialidade,
      bio_profissional,
      numero_endereco,
      complemento_endereco,
      id_tipo_pessoa,
      profile_complete,
      enderecos!id_endereco (
        cep,
        logradouro,
        bairro,
        cidade,
        estado
      )
    `
    )
    .eq('auth_user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(error.message);
  }

  return data;
}

/**
 * Validar CPF
 */
export function validateCPF(cpf: string): boolean {
  // Remove formatação
  const cleanCpf = cpf.replace(/\D/g, '');

  if (cleanCpf.length !== 11) return false;

  // Verifica se todos os dígitos são iguais
  if (/^(\d)\1{10}$/.test(cleanCpf)) return false;

  // Validação do algoritmo do CPF
  let sum = 0;
  let remainder;

  for (let i = 1; i <= 9; i++) {
    sum += parseInt(cleanCpf.substring(i - 1, i)) * (11 - i);
  }

  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCpf.substring(9, 10))) return false;

  sum = 0;
  for (let i = 1; i <= 10; i++) {
    sum += parseInt(cleanCpf.substring(i - 1, i)) * (12 - i);
  }

  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCpf.substring(10, 11))) return false;

  return true;
}

/**
 * Formatar CPF
 */
export function formatCPF(cpf: string): string {
  const cleanCpf = cpf.replace(/\D/g, '');
  return cleanCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

/**
 * Formatar CEP
 */
export function formatCEP(cep: string): string {
  const cleanCep = cep.replace(/\D/g, '');
  return cleanCep.replace(/(\d{5})(\d{3})/, '$1-$2');
}

/**
 * Formatar telefone
 */
export function formatPhone(phone: string): string {
  const cleanPhone = phone.replace(/\D/g, '');

  if (cleanPhone.length === 10) {
    return cleanPhone.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  } else if (cleanPhone.length === 11) {
    return cleanPhone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  }

  return phone;
}
