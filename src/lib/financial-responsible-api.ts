import { supabase } from './supabase';

// AI dev note: API para gerenciamento de responsáveis financeiros
// Funções para buscar pacientes, validar dados e adicionar responsáveis financeiros

export interface PatientSearchResult {
  id: string;
  nome: string;
  data_nascimento: string | null;
  cidade: string | null;
  responsavel_legal_nome: string | null;
  responsavel_legal_id: string | null;
}

export interface PatientWithResponsible {
  id: string;
  nome: string;
  data_nascimento: string | null;
  responsavel_legal_nome: string | null;
  responsavel_financeiro_nome: string | null;
}

export interface PersonBasicData {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  email: string | null;
  telefone: bigint | null;
  id_endereco: string | null;
  numero_endereco: string | null;
  complemento_endereco: string | null;
}

/**
 * Buscar pacientes vinculados a um responsável
 * @param responsibleId ID do responsável
 * @returns Lista de pacientes vinculados
 */
export async function fetchPatientsByResponsible(
  responsibleId: string
): Promise<PatientWithResponsible[]> {
  try {
    console.log(
      '🔍 [fetchPatientsByResponsible] Buscando pacientes para responsável:',
      responsibleId
    );

    const { data, error } = await supabase
      .from('pessoa_responsaveis')
      .select(
        `
        id_pessoa,
        pessoas!pessoa_responsaveis_id_pessoa_fkey(
          id,
          nome,
          data_nascimento
        )
      `
      )
      .eq('id_responsavel', responsibleId)
      .eq('ativo', true)
      .is('data_fim', null);

    if (error) {
      console.error('❌ [fetchPatientsByResponsible] Erro:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      console.log('ℹ️ [fetchPatientsByResponsible] Nenhum paciente encontrado');
      return [];
    }

    // Buscar informações dos responsáveis para cada paciente
    const patientsWithResponsibles: PatientWithResponsible[] = [];

    for (const item of data) {
      if (!item.pessoas) continue;

      const paciente = Array.isArray(item.pessoas)
        ? item.pessoas[0]
        : item.pessoas;

      // Buscar responsável legal e financeiro via view
      const { data: patientData } = await supabase
        .from('pacientes_com_responsaveis_view')
        .select('responsavel_legal_nome, responsavel_financeiro_nome')
        .eq('id', paciente.id)
        .single();

      patientsWithResponsibles.push({
        id: paciente.id,
        nome: paciente.nome,
        data_nascimento: paciente.data_nascimento,
        responsavel_legal_nome: patientData?.responsavel_legal_nome || null,
        responsavel_financeiro_nome:
          patientData?.responsavel_financeiro_nome || null,
      });
    }

    console.log(
      '✅ [fetchPatientsByResponsible] Encontrados:',
      patientsWithResponsibles.length
    );
    return patientsWithResponsibles;
  } catch (error) {
    console.error('❌ [fetchPatientsByResponsible] Erro inesperado:', error);
    return [];
  }
}

/**
 * Buscar pacientes por nome (autocomplete)
 * @param searchName Nome para buscar (mínimo 3 caracteres)
 * @returns Lista de pacientes com dados do responsável legal
 */
export async function searchPatientsByName(
  searchName: string
): Promise<PatientSearchResult[]> {
  try {
    if (searchName.length < 3) {
      return [];
    }

    console.log('🔍 [searchPatientsByName] Buscando:', searchName);

    // Buscar na view que já tem os dados consolidados
    const { data, error } = await supabase
      .from('pacientes_com_responsaveis_view')
      .select(
        `
        id,
        nome,
        data_nascimento,
        cidade,
        responsavel_legal_nome,
        responsavel_legal_id
      `
      )
      .ilike('nome', `%${searchName}%`)
      .eq('ativo', true)
      .order('nome')
      .limit(20);

    if (error) {
      console.error('❌ [searchPatientsByName] Erro:', error);
      throw error;
    }

    console.log('✅ [searchPatientsByName] Encontrados:', data?.length || 0);
    return data || [];
  } catch (error) {
    console.error('❌ [searchPatientsByName] Erro inesperado:', error);
    return [];
  }
}

/**
 * Validar WhatsApp (reutilizar função existente do patient-registration-api)
 * Apenas verifica se o WhatsApp existe, sem enviar código
 */
export async function validateWhatsAppOnly(phoneNumber: string): Promise<{
  exists: boolean;
  jid?: string;
  error?: string;
}> {
  try {
    console.log('📱 [validateWhatsAppOnly] Validando:', phoneNumber);

    const cleanPhone = phoneNumber.replace(/\D/g, '');

    if (cleanPhone.length !== 11) {
      return {
        exists: false,
        error: 'Número deve ter 11 dígitos (DDD + telefone)',
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(
      'https://webhooks-i.infusecomunicacao.online/webhook/verificaWhatsApp',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          whatsapp: cleanPhone,
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (
      Array.isArray(data) &&
      data.length > 0 &&
      typeof data[0].exists === 'boolean'
    ) {
      const exists = data[0].exists;
      const jid = data[0].jid || `55${cleanPhone}@s.whatsapp.net`;

      console.log('✅ [validateWhatsAppOnly] Válido:', exists);
      return {
        exists,
        jid: exists ? jid : undefined,
      };
    }

    throw new Error('Formato de resposta inválido');
  } catch (error) {
    console.error('❌ [validateWhatsAppOnly] Erro:', error);
    return {
      exists: false,
      error: 'Não foi possível verificar o WhatsApp',
    };
  }
}

/**
 * Buscar pessoa por CPF
 * @param cpf CPF para buscar (apenas números)
 * @returns Dados da pessoa ou null
 */
export async function findPersonByCpf(
  cpf: string
): Promise<PersonBasicData | null> {
  try {
    const cleanCpf = cpf.replace(/\D/g, '');
    console.log('🔍 [findPersonByCpf] Buscando CPF:', cleanCpf);

    const { data, error } = await supabase
      .from('pessoas')
      .select(
        `
        id,
        nome,
        cpf_cnpj,
        email,
        telefone,
        id_endereco,
        numero_endereco,
        complemento_endereco
      `
      )
      .eq('cpf_cnpj', cleanCpf)
      .eq('ativo', true)
      .maybeSingle();

    if (error) {
      console.error('❌ [findPersonByCpf] Erro:', error);
      return null;
    }

    if (data) {
      console.log('✅ [findPersonByCpf] Pessoa encontrada:', data.nome);
    } else {
      console.log('ℹ️ [findPersonByCpf] Pessoa não encontrada');
    }

    return data;
  } catch (error) {
    console.error('❌ [findPersonByCpf] Erro inesperado:', error);
    return null;
  }
}

/**
 * Buscar pessoa por telefone
 * @param phone Telefone para buscar (apenas números, sem código país)
 * @returns Dados da pessoa ou null
 */
export async function findPersonByPhone(
  phone: string
): Promise<PersonBasicData | null> {
  try {
    const cleanPhone = phone.replace(/\D/g, '');
    // AI dev note: Usar JID completo (com código país 55), não remover
    const phoneForDB = cleanPhone.startsWith('55')
      ? cleanPhone
      : `55${cleanPhone}`;
    const phoneBigInt = BigInt(phoneForDB);

    console.log('🔍 [findPersonByPhone] Buscando telefone:', phoneForDB);

    const { data, error } = await supabase
      .from('pessoas')
      .select(
        `
        id,
        nome,
        cpf_cnpj,
        email,
        telefone,
        id_endereco,
        numero_endereco,
        complemento_endereco
      `
      )
      .eq('telefone', phoneBigInt)
      .eq('ativo', true)
      .maybeSingle();

    if (error) {
      console.error('❌ [findPersonByPhone] Erro:', error);
      return null;
    }

    if (data) {
      console.log('✅ [findPersonByPhone] Pessoa encontrada:', data.nome);
    } else {
      console.log('ℹ️ [findPersonByPhone] Pessoa não encontrada');
    }

    return data;
  } catch (error) {
    console.error('❌ [findPersonByPhone] Erro inesperado:', error);
    return null;
  }
}

/**
 * Validar se pessoa tem dados completos (telefone, email, endereço)
 * @param personId ID da pessoa
 * @returns true se tem todos os dados obrigatórios
 */
export async function validatePersonCompleteness(personId: string): Promise<{
  isComplete: boolean;
  missingFields: string[];
}> {
  try {
    console.log('✅ [validatePersonCompleteness] Validando pessoa:', personId);

    const { data, error } = await supabase
      .from('pessoas')
      .select('telefone, email, id_endereco, numero_endereco')
      .eq('id', personId)
      .single();

    if (error || !data) {
      console.error('❌ [validatePersonCompleteness] Erro:', error);
      return { isComplete: false, missingFields: ['Pessoa não encontrada'] };
    }

    const missingFields: string[] = [];

    if (!data.telefone) missingFields.push('Telefone');
    if (!data.email) missingFields.push('E-mail');
    if (!data.id_endereco) missingFields.push('Endereço (CEP)');
    if (!data.numero_endereco) missingFields.push('Número do endereço');

    const isComplete = missingFields.length === 0;

    if (isComplete) {
      console.log('✅ [validatePersonCompleteness] Pessoa completa');
    } else {
      console.log(
        '⚠️ [validatePersonCompleteness] Campos faltando:',
        missingFields
      );
    }

    return { isComplete, missingFields };
  } catch (error) {
    console.error('❌ [validatePersonCompleteness] Erro inesperado:', error);
    return { isComplete: false, missingFields: ['Erro ao validar'] };
  }
}
