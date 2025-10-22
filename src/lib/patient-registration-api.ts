import { supabase } from './supabase';

// AI dev note: API para cadastro público de pacientes
// Valida WhatsApp via webhook externo e verifica cadastro prévio no Supabase

export interface WhatsAppValidationResponse {
  isValid: boolean;
  personExists: boolean;
  personId?: string;
  personFirstName?: string;
  relatedPatients?: Array<{ id: string; nome: string }>;
  phoneNumber?: string; // Número limpo para uso posterior (sem código país)
  whatsappJid?: string; // JID completo do WhatsApp (556181446666)
  errorMessage?: string;
  userData?: ExistingUser; // Dados completos do usuário existente
}

/**
 * Webhook response format (documentado pelo usuário):
 * [{ jid: "556181446666@s.whatsapp.net", exists: true, number: "5561981446666", name: "" }]
 */
interface WebhookWhatsAppResponse {
  jid: string;
  exists: boolean;
  number: string; // Ex: "556181446666" (sem código do país duplicado)
  name: string;
}

/**
 * Valida WhatsApp e verifica se pessoa já está cadastrada
 */
export async function validateWhatsAppAndCheckRegistration(
  phoneFormatted: string
): Promise<WhatsAppValidationResponse> {
  try {
    // 1. Limpar número: apenas dígitos
    const cleanPhone = phoneFormatted.replace(/\D/g, '');

    // 2. Validar formato (deve ter 11 dígitos: DDD + número)
    if (cleanPhone.length !== 11) {
      return {
        isValid: false,
        personExists: false,
        errorMessage: 'Número deve ter 11 dígitos (DDD + número)',
      };
    }

    // 3. Chamar webhook para validar se WhatsApp existe
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

    const webhookResponse = await fetch(
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

    if (!webhookResponse.ok) {
      throw new Error(`Webhook retornou status ${webhookResponse.status}`);
    }

    const webhookData: WebhookWhatsAppResponse[] = await webhookResponse.json();

    // 4. Validar formato da resposta
    if (!Array.isArray(webhookData) || webhookData.length === 0) {
      throw new Error('Resposta do webhook em formato inválido');
    }

    const whatsappInfo = webhookData[0];

    // 5. Se WhatsApp não existe, retornar erro
    if (!whatsappInfo.exists) {
      return {
        isValid: false,
        personExists: false,
        errorMessage: 'Insira um número válido no WhatsApp',
      };
    }

    // 6. Extrair número do jid (formato WhatsApp)
    // Ex: "556181446666@s.whatsapp.net" → remover "@s.whatsapp.net" = "556181446666"
    const jidNumber = whatsappInfo.jid.replace('@s.whatsapp.net', '');

    // 7. AI dev note: IMPORTANTE - Manter código do país (55) para buscar no banco
    // O banco armazena com código do país, então buscar com o mesmo formato
    const phoneNumberForDB = jidNumber.startsWith('55')
      ? jidNumber // Mantém com "55"
      : `55${jidNumber}`; // Adiciona "55" se não tiver

    // 8. Converter para BigInt para comparação com banco
    const phoneNumberBigInt = BigInt(phoneNumberForDB);

    console.log(
      '🔍 [validateWhatsApp] Buscando telefone no banco:',
      phoneNumberForDB
    );

    // 9. Verificar se pessoa já está cadastrada
    const { data: pessoa, error: pessoaError } = await supabase
      .from('pessoas')
      .select('id, nome')
      .eq('telefone', phoneNumberBigInt.toString())
      .eq('ativo', true)
      .maybeSingle(); // Usar maybeSingle para evitar erro se não encontrar

    if (pessoaError) {
      console.error('Erro ao buscar pessoa por telefone:', pessoaError);
      throw new Error('Erro ao verificar cadastro no sistema');
    }

    // 10. Se pessoa NÃO existe, retornar sucesso sem cadastro prévio
    if (!pessoa) {
      return {
        isValid: true,
        personExists: false,
        phoneNumber: phoneNumberForDB, // Com código país (556181446666)
        whatsappJid: jidNumber, // Com código país (556181446666)
      };
    }

    // 11. Pessoa existe - buscar pacientes relacionados (responsáveis)
    const { data: relatedPatients, error: patientsError } = await supabase
      .from('pessoa_responsaveis')
      .select(
        `
        id_pessoa,
        pessoas:id_pessoa (
          id,
          nome
        )
      `
      )
      .eq('id_responsavel', pessoa.id)
      .eq('ativo', true);

    if (patientsError) {
      console.error('Erro ao buscar pacientes relacionados:', patientsError);
      // Não bloquear fluxo por erro aqui
    }

    // 12. Extrair primeiro nome
    const firstName = pessoa.nome.split(' ')[0];

    // 13. Formatar lista de pacientes
    const patients =
      relatedPatients?.map(
        (rel: {
          id_pessoa: string;
          pessoas:
            | { id: string; nome: string }[]
            | { id: string; nome: string };
        }) => ({
          id: Array.isArray(rel.pessoas) ? rel.pessoas[0]?.id : rel.pessoas?.id,
          nome: Array.isArray(rel.pessoas)
            ? rel.pessoas[0]?.nome
            : rel.pessoas?.nome,
        })
      ) || [];

    return {
      isValid: true,
      personExists: true,
      personId: pessoa.id,
      personFirstName: firstName,
      relatedPatients: patients,
      phoneNumber: phoneNumberForDB, // Com código país (556181446666)
      whatsappJid: jidNumber, // Com código país (556181446666)
    };
  } catch (error) {
    console.error('Erro na validação de WhatsApp:', error);

    // Mensagem amigável baseada no tipo de erro
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return {
          isValid: false,
          personExists: false,
          errorMessage: 'Tempo de verificação excedido. Tente novamente.',
        };
      }
      return {
        isValid: false,
        personExists: false,
        errorMessage: 'Não foi possível verificar o WhatsApp. Tente novamente.',
      };
    }

    return {
      isValid: false,
      personExists: false,
      errorMessage: 'Erro desconhecido. Tente novamente.',
    };
  }
}

// AI dev note: Agora usando Edge Function validate-whatsapp-code para segurança completa
// Backend com hash SHA-256, rate limiting por IP/telefone e auditoria

/**
 * Interface para resposta da Edge Function
 */
interface ValidationFunctionResponse {
  success: boolean;
  action?: 'code_sent' | 'code_validated' | 'blocked';
  expiresAt?: string;
  attemptsRemaining?: number;
  blockedUntil?: string;
  error?: string;
  debug_code?: string; // DEBUG: Remover em produção
}

/**
 * Interface para usuário existente retornado de vw_usuarios_admin
 */
interface ExistingUser {
  id: string;
  nome: string;
  cpf_cnpj?: string | null;
  email: string | null;
  telefone: bigint;
  data_nascimento?: string | null;
  sexo?: string | null;
  is_pediatra: boolean | null;
  tipo_pessoa_codigo: string | null;
  tipo_pessoa_id?: string | null;
  pediatras_nomes: string | null;
  total_pediatras: number | null;
  cep?: string | null;
  logradouro?: string | null;
  numero_endereco?: string | null; // AI dev note: Campo correto da view vw_usuarios_admin
  complemento_endereco?: string | null; // AI dev note: Campo correto da view vw_usuarios_admin
  bairro?: string | null;
  cidade?: string | null; // AI dev note: Campo correto da view vw_usuarios_admin
  estado?: string | null; // AI dev note: Campo correto da view vw_usuarios_admin
  tipo_responsabilidade?: string | null; // 'legal', 'financeiro' ou 'ambos'
}

/**
 * Buscar usuário existente na vw_usuarios_admin por telefone
 * @param phoneNumber - Número do telefone sem código do país (ex: 61981446666)
 */
export async function findExistingUserByPhone(phoneNumber: string): Promise<{
  exists: boolean;
  user?: ExistingUser;
  pacientes?: Array<{ id: string; nome: string; pediatras: string | null }>;
}> {
  try {
    const phoneNumberBigInt = BigInt(phoneNumber);

    // Buscar pessoa na view (acesso público permitido via RLS)
    const { data: pessoa, error: pessoaError } = await supabase
      .from('vw_usuarios_admin')
      .select('*')
      .eq('telefone', phoneNumberBigInt.toString())
      .eq('ativo', true)
      .maybeSingle();

    if (pessoaError) {
      console.error('Erro ao buscar usuário:', pessoaError);
      return { exists: false };
    }

    if (!pessoa) {
      return { exists: false };
    }

    // Buscar tipo de responsabilidade (legal, financeiro ou ambos)
    const { data: responsabilidades } = await supabase
      .from('pessoa_responsaveis')
      .select('tipo_responsabilidade')
      .eq('id_responsavel', pessoa.id)
      .eq('ativo', true);

    // Determinar o tipo de responsabilidade (se tiver múltiplos, considerar 'ambos')
    let tipoResponsabilidade: string | null = null;
    if (responsabilidades && responsabilidades.length > 0) {
      const tipos = [
        ...new Set(responsabilidades.map((r) => r.tipo_responsabilidade)),
      ];
      if (tipos.includes('ambos')) {
        tipoResponsabilidade = 'ambos';
      } else if (tipos.length > 1) {
        tipoResponsabilidade = 'ambos'; // Se tem legal E financeiro
      } else {
        tipoResponsabilidade = tipos[0];
      }
    }

    // Buscar pacientes relacionados (como responsável)
    const { data: relatedPatients, error: patientsError } = await supabase
      .from('pessoa_responsaveis')
      .select(
        `
        id_pessoa,
        pessoas:id_pessoa (
          id,
          nome
        )
      `
      )
      .eq('id_responsavel', pessoa.id)
      .eq('ativo', true);

    if (patientsError) {
      console.error('Erro ao buscar pacientes:', patientsError);
    }

    // Buscar informações de pediatras para cada paciente
    const pacientesComPediatras = await Promise.all(
      (relatedPatients || []).map(
        async (rel: {
          id_pessoa: string;
          pessoas:
            | { id: string; nome: string }[]
            | { id: string; nome: string };
        }) => {
          const pessoaId = Array.isArray(rel.pessoas)
            ? rel.pessoas[0]?.id
            : rel.pessoas?.id;
          const pessoaNome = Array.isArray(rel.pessoas)
            ? rel.pessoas[0]?.nome
            : rel.pessoas?.nome;

          const { data: pediatraInfo } = await supabase
            .from('vw_usuarios_admin')
            .select('pediatras_nomes')
            .eq('id', pessoaId)
            .maybeSingle();

          return {
            id: pessoaId,
            nome: pessoaNome,
            pediatras: pediatraInfo?.pediatras_nomes || null,
          };
        }
      )
    );

    return {
      exists: true,
      user: {
        ...pessoa,
        tipo_responsabilidade: tipoResponsabilidade,
      } as ExistingUser,
      pacientes: pacientesComPediatras,
    };
  } catch (error) {
    console.error('Erro ao buscar usuário existente:', error);
    return { exists: false };
  }
}

/**
 * Enviar código de validação via Edge Function
 * @param whatsappJid - Número com código país (ex: 556181446666)
 */
export async function sendValidationCode(whatsappJid: string): Promise<{
  success: boolean;
  expiresAt?: string;
  error?: string;
  debugCode?: string;
}> {
  try {
    const { data, error } =
      await supabase.functions.invoke<ValidationFunctionResponse>(
        'validate-whatsapp-code',
        {
          body: {
            action: 'send_code',
            whatsappJid, // Enviar JID completo (556181446666)
          },
        }
      );

    if (error) {
      console.error('Erro ao chamar Edge Function:', error);
      return {
        success: false,
        error: 'Não foi possível enviar o código. Tente novamente.',
      };
    }

    if (!data?.success) {
      return {
        success: false,
        error: data?.error || 'Erro ao enviar código',
      };
    }

    return {
      success: true,
      expiresAt: data.expiresAt,
      debugCode: data.debug_code, // DEBUG: Remover em produção
    };
  } catch (error) {
    console.error('Erro ao enviar código de validação:', error);
    return {
      success: false,
      error: 'Não foi possível enviar o código. Tente novamente.',
    };
  }
}

/**
 * Validar código inserido pelo usuário via Edge Function
 * @param whatsappJid - Número com código país (ex: 556181446666)
 */
export async function validateCode(
  whatsappJid: string,
  userCode: string
): Promise<{
  valid: boolean;
  error?: string;
  attemptsRemaining?: number;
  blocked?: boolean;
  blockedUntil?: string;
}> {
  try {
    const { data, error } =
      await supabase.functions.invoke<ValidationFunctionResponse>(
        'validate-whatsapp-code',
        {
          body: {
            action: 'validate_code',
            whatsappJid, // Enviar JID completo (556181446666)
            code: userCode,
          },
        }
      );

    if (error) {
      console.error('Erro ao chamar Edge Function:', error);
      return {
        valid: false,
        error: 'Não foi possível validar o código. Tente novamente.',
      };
    }

    if (data?.success && data?.action === 'code_validated') {
      return { valid: true };
    }

    return {
      valid: false,
      error: data?.error || 'Código inválido',
      attemptsRemaining: data?.attemptsRemaining,
      blocked: data?.action === 'blocked',
      blockedUntil: data?.blockedUntil,
    };
  } catch (error) {
    console.error('Erro ao validar código:', error);
    return {
      valid: false,
      error: 'Não foi possível validar o código. Tente novamente.',
    };
  }
}

/**
 * Registrar tentativa de cadastro para analytics
 */
export async function trackRegistrationAttempt(data: {
  phone_number: string;
  validation_success: boolean;
  person_exists: boolean;
  error_message?: string;
}): Promise<void> {
  try {
    console.log('📊 Analytics:', data);

    // TODO: Implementar insert na tabela de tracking quando criada
    // await supabase.from('patient_registration_tracking').insert({
    //   phone_number: data.phone_number,
    //   validation_success: data.validation_success,
    //   person_exists: data.person_exists,
    //   error_message: data.error_message,
    //   created_at: new Date().toISOString(),
    // });
  } catch (error) {
    console.error('Erro ao registrar analytics:', error);
  }
}

/**
 * Validar WhatsApp e obter JID (sem enviar código)
 * @param phoneNumber - Número do telefone com DDD (ex: 61981446666)
 * @returns exists: se o WhatsApp é válido, jid: identificador único do WhatsApp
 */
export async function validateWhatsAppAndGetJID(phoneNumber: string): Promise<{
  exists: boolean;
  jid?: string;
  error?: string;
}> {
  try {
    console.log(
      '📱 [validateWhatsAppAndGetJID] Validando WhatsApp:',
      phoneNumber
    );

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

    // Formato esperado: [{ exists: boolean, jid: string }]
    if (
      Array.isArray(data) &&
      data.length > 0 &&
      typeof data[0].exists === 'boolean'
    ) {
      const exists = data[0].exists;
      const jid = data[0].jid || `55${cleanPhone}@s.whatsapp.net`;

      console.log('✅ [validateWhatsAppAndGetJID] WhatsApp válido:', exists);
      console.log('📱 [validateWhatsAppAndGetJID] JID:', jid);

      return {
        exists,
        jid: exists ? jid : undefined,
      };
    }

    throw new Error('Formato de resposta inválido');
  } catch (error) {
    console.error('❌ [validateWhatsAppAndGetJID] Erro:', error);
    return {
      exists: false,
      error: 'Não foi possível verificar o WhatsApp',
    };
  }
}

/**
 * Buscar pessoa por CPF (para verificar responsável financeiro existente)
 * Público - não requer autenticação
 */
export interface PersonByCPFResult {
  exists: boolean;
  person?: {
    id: string;
    nome: string;
    cpf_cnpj: string;
    email?: string;
    telefone?: string;
    tipo_pessoa_codigo?: string;
    cep?: string;
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cidade?: string;
    estado?: string;
  };
  error?: string;
}

export async function searchPersonByCPF(
  cpf: string
): Promise<PersonByCPFResult> {
  try {
    console.log('🔍 [searchPersonByCPF] Buscando pessoa por CPF:', cpf);

    // Limpar CPF (remover pontos, traços)
    const cpfLimpo = cpf.replace(/\D/g, '');

    if (cpfLimpo.length !== 11) {
      return {
        exists: false,
        error: 'CPF inválido',
      };
    }

    // Buscar pessoa por CPF (primeiro tentar sem formatação)
    console.log('🔍 [searchPersonByCPF] Buscando por CPF limpo:', cpfLimpo);
    let { data: pessoa, error: pessoaError } = await supabase
      .from('vw_usuarios_admin')
      .select(
        `
        id,
        nome,
        cpf_cnpj,
        email,
        telefone,
        tipo_pessoa_codigo,
        cep,
        logradouro,
        numero_endereco,
        complemento_endereco,
        bairro,
        cidade,
        estado
      `
      )
      .eq('cpf_cnpj', cpfLimpo)
      .eq('ativo', true)
      .maybeSingle();

    // Se não encontrou, tentar com formatação (XXX.XXX.XXX-XX)
    if (!pessoa && !pessoaError) {
      const cpfFormatado = cpfLimpo.replace(
        /(\d{3})(\d{3})(\d{3})(\d{2})/,
        '$1.$2.$3-$4'
      );
      console.log(
        '🔍 [searchPersonByCPF] Não encontrou sem formatação, tentando com formatação:',
        cpfFormatado
      );

      const result = await supabase
        .from('vw_usuarios_admin')
        .select(
          `
          id,
          nome,
          cpf_cnpj,
          email,
          telefone,
          tipo_pessoa_codigo,
          cep,
          logradouro,
          numero_endereco,
          complemento_endereco,
          bairro,
          cidade,
          estado
        `
        )
        .eq('cpf_cnpj', cpfFormatado)
        .eq('ativo', true)
        .maybeSingle();

      pessoa = result.data;
      pessoaError = result.error;
    }

    if (pessoaError) {
      console.error('❌ [searchPersonByCPF] Erro ao buscar:', pessoaError);
      return {
        exists: false,
        error: 'Erro ao buscar CPF no sistema',
      };
    }

    if (!pessoa) {
      console.log(
        '❌ [searchPersonByCPF] Pessoa não encontrada - tentamos CPF limpo e formatado'
      );
      return { exists: false };
    }

    console.log('✅ [searchPersonByCPF] Pessoa encontrada:', pessoa.nome);

    return {
      exists: true,
      person: {
        id: pessoa.id,
        nome: pessoa.nome,
        cpf_cnpj: pessoa.cpf_cnpj,
        email: pessoa.email || undefined,
        telefone: pessoa.telefone ? String(pessoa.telefone) : undefined,
        tipo_pessoa_codigo: pessoa.tipo_pessoa_codigo || undefined,
        cep: pessoa.cep || undefined,
        logradouro: pessoa.logradouro || undefined,
        numero: pessoa.numero_endereco || undefined,
        complemento: pessoa.complemento_endereco || undefined,
        bairro: pessoa.bairro || undefined,
        cidade: pessoa.cidade || undefined,
        estado: pessoa.estado || undefined,
      },
    };
  } catch (error) {
    console.error('❌ [searchPersonByCPF] Erro:', error);
    return {
      exists: false,
      error: 'Erro ao buscar CPF',
    };
  }
}
