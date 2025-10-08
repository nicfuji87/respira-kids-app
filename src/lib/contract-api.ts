// AI dev note: API para gerenciamento de contratos
// Funções para buscar templates, gerar contratos e registrar aceites

import { supabase } from './supabase';

// Interfaces conforme plano aprovado
export interface ContractVariables {
  contratante: string;
  cpf: string;
  telefone: string;
  email: string;
  endereco_completo: string; // AI dev note: Endereço formatado corretamente sem vírgulas duplas
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  paciente: string;
  dnPac: string; // dd/mm/aaaa
  cpfPac?: string;
  hoje: string; // dd/mm/aaaa
  autorizo: 'autorizo' | 'não autorizo';
  fimTerapeutico: string;
  vinculoNome: 'poderão' | 'não poderão';
}

export interface ContractTemplate {
  id: string;
  nome: string;
  descricao: string | null;
  conteudo_template: string;
  variaveis_disponiveis: Array<{ nome: string; descricao: string }>;
  versao: number;
  ativo: boolean;
}

export interface UserContract {
  id: string;
  contract_template_id: string;
  pessoa_id: string;
  agendamento_id: string | null;
  nome_contrato: string;
  conteudo_final: string;
  variaveis_utilizadas: Record<string, string>;
  arquivo_url: string | null;
  status_contrato: 'rascunho' | 'gerado' | 'assinado' | 'cancelado';
  data_geracao: string | null;
  data_assinatura: string | null;
  assinatura_digital_id: string | null;
  observacoes: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Buscar template ativo de contrato
 * @returns Template de contrato ativo
 */
export async function fetchContractTemplate(): Promise<ContractTemplate> {
  const { data, error } = await supabase
    .from('contract_templates')
    .select('*')
    .eq('ativo', true)
    .order('versao', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    console.error('❌ Erro ao buscar template de contrato:', error);
    throw new Error('Não foi possível carregar o template de contrato');
  }

  if (!data) {
    throw new Error('Nenhum template de contrato ativo encontrado');
  }

  return data as ContractTemplate;
}

/**
 * Substituir variáveis no template
 * @param template - Conteúdo do template com placeholders {{variavel}}
 * @param variables - Objeto com valores das variáveis
 * @returns Conteúdo com variáveis substituídas
 */
export function replaceVariables(
  template: string,
  variables: ContractVariables
): string {
  let result = template;

  // Substituir cada variável
  Object.entries(variables).forEach(([key, value]) => {
    // Substituir {{variavel}} por valor (ou string vazia se undefined/null)
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, value ?? '');
  });

  return result;
}

/**
 * Gerar contrato para um paciente/pessoa
 * @param pessoaId - ID da pessoa (paciente ou responsável)
 * @param variables - Variáveis do contrato
 * @param agendamentoId - ID do agendamento (opcional)
 * @returns Contrato gerado
 */
export async function generateContract(
  pessoaId: string,
  variables: ContractVariables,
  agendamentoId?: string
): Promise<UserContract> {
  try {
    // 1. Buscar template ativo
    const template = await fetchContractTemplate();

    // 2. Substituir variáveis
    const conteudoFinal = replaceVariables(
      template.conteudo_template,
      variables
    );

    // 3. Preparar dados do contrato
    const contractData = {
      contract_template_id: template.id,
      pessoa_id: pessoaId,
      agendamento_id: agendamentoId || null,
      nome_contrato: `Contrato Fisioterapia - ${variables.paciente} - ${variables.hoje}`,
      conteudo_final: conteudoFinal,
      variaveis_utilizadas: variables as unknown as Record<string, string>,
      status_contrato: 'gerado' as const,
      data_geracao: new Date().toISOString(),
      ativo: true,
    };

    // 4. Inserir no banco
    const { data, error } = await supabase
      .from('user_contracts')
      .insert(contractData)
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao gerar contrato:', error);
      throw new Error('Não foi possível gerar o contrato');
    }

    return data as UserContract;
  } catch (error) {
    console.error('❌ Erro em generateContract:', error);
    throw error;
  }
}

/**
 * Buscar contrato de um usuário/pessoa
 * @param pessoaId - ID da pessoa
 * @returns Último contrato ativo ou null
 */
export async function fetchUserContract(
  pessoaId: string
): Promise<UserContract | null> {
  const { data, error } = await supabase
    .from('user_contracts')
    .select('*')
    .eq('pessoa_id', pessoaId)
    .eq('ativo', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('❌ Erro ao buscar contrato do usuário:', error);
    throw new Error('Não foi possível buscar o contrato');
  }

  return data as UserContract | null;
}

/**
 * Buscar contrato por ID
 * @param contractId - ID do contrato
 * @returns Contrato ou null
 */
export async function fetchContractById(
  contractId: string
): Promise<UserContract | null> {
  const { data, error } = await supabase
    .from('user_contracts')
    .select('*')
    .eq('id', contractId)
    .single();

  if (error) {
    console.error('❌ Erro ao buscar contrato por ID:', error);
    return null;
  }

  return data as UserContract;
}

/**
 * Registrar aceite do contrato
 * @param contractId - ID do contrato
 * @param assinaturaDigitalId - ID da assinatura digital (ex: whatsapp_{phone}_{timestamp})
 * @returns Contrato atualizado
 */
export async function acceptContract(
  contractId: string,
  assinaturaDigitalId: string
): Promise<UserContract> {
  const { data, error } = await supabase
    .from('user_contracts')
    .update({
      status_contrato: 'assinado',
      data_assinatura: new Date().toISOString(),
      assinatura_digital_id: assinaturaDigitalId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contractId)
    .select()
    .single();

  if (error) {
    console.error('❌ Erro ao aceitar contrato:', error);
    throw new Error('Não foi possível registrar o aceite do contrato');
  }

  return data as UserContract;
}

/**
 * Verificar se pessoa tem contrato assinado
 * @param pessoaId - ID da pessoa
 * @returns true se tem contrato assinado ativo
 */
export async function hasActiveContract(pessoaId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_contracts')
    .select('id')
    .eq('pessoa_id', pessoaId)
    .eq('status_contrato', 'assinado')
    .eq('ativo', true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('❌ Erro ao verificar contrato ativo:', error);
    return false;
  }

  return !!data;
}

/**
 * Atualizar URL do arquivo PDF do contrato
 * @param contractId - ID do contrato
 * @param arquivoUrl - URL do arquivo PDF
 * @returns Contrato atualizado
 */
export async function updateContractPdfUrl(
  contractId: string,
  arquivoUrl: string
): Promise<UserContract> {
  const { data, error } = await supabase
    .from('user_contracts')
    .update({
      arquivo_url: arquivoUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contractId)
    .select()
    .single();

  if (error) {
    console.error('❌ Erro ao atualizar URL do PDF:', error);
    throw new Error('Não foi possível atualizar o contrato');
  }

  return data as UserContract;
}

/**
 * Atualizar link do contrato na tabela pessoas
 * @param pessoaId - ID da pessoa
 * @param linkContrato - URL do contrato
 */
export async function updatePersonContractLink(
  pessoaId: string,
  linkContrato: string
): Promise<void> {
  const { error } = await supabase
    .from('pessoas')
    .update({
      link_contrato: linkContrato,
      updated_at: new Date().toISOString(),
    })
    .eq('id', pessoaId);

  if (error) {
    console.error('❌ Erro ao atualizar link do contrato na pessoa:', error);
    throw new Error('Não foi possível atualizar o link do contrato');
  }
}
