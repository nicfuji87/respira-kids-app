// AI dev note: API client para integração com Asaas
// Funções principais: determineApiKey, createCustomer, disableNotifications, createPayment

import { supabase } from '@/lib/supabase';
import type { 
  AsaasApiConfig,
  CreateCustomerRequest,
  CreatePaymentRequest,
  AsaasIntegrationResult,
  ProcessPaymentData
} from '@/types/asaas';

// AI dev note: Determina qual API key usar - individual da empresa ou global
export async function determineApiKey(userRole: string | null): Promise<AsaasApiConfig | null> {
  try {
    // Primeiro tenta buscar API individual se usuário for admin/secretaria
    if (userRole === 'admin' || userRole === 'secretaria') {
      // Busca API key da empresa associada ao usuário
      const { data: userWithCompany, error: userError } = await supabase
        .from('pessoas')
        .select(`
          id_empresa,
          pessoa_empresas!inner(
            api_token_externo
          )
        `)
        .eq('auth_user_id', (await supabase.auth.getUser()).data.user?.id)
        .single();

      const empresaData = Array.isArray(userWithCompany?.pessoa_empresas) 
        ? userWithCompany.pessoa_empresas[0] 
        : userWithCompany?.pessoa_empresas;

      if (!userError && empresaData?.api_token_externo) {
        return {
          apiKey: empresaData.api_token_externo,
          isGlobal: false,
          baseUrl: 'https://api.asaas.com/v3'
        };
      }
    }

    // Se não encontrou API individual, busca API global
    const { data: globalApiKey, error: globalError } = await supabase
      .from('api_keys')
      .select('encrypted_key')
      .eq('service_name', 'asaas')
      .eq('is_active', true)
      .single();

    if (globalError || !globalApiKey?.encrypted_key) {
      console.error('Erro ao buscar API key global do Asaas:', globalError);
      return null;
    }

    return {
      apiKey: globalApiKey.encrypted_key,
      isGlobal: true,
      baseUrl: 'https://api.asaas.com/v3'
    };

  } catch (error) {
    console.error('Erro ao determinar API key do Asaas:', error);
    return null;
  }
}

// AI dev note: Cria cliente no Asaas se não existir
export async function createCustomer(
  customerData: CreateCustomerRequest,
  userRole: string | null
): Promise<AsaasIntegrationResult> {
  try {
    const apiConfig = await determineApiKey(userRole);
    if (!apiConfig) {
      return {
        success: false,
        error: 'API key do Asaas não configurada'
      };
    }

    // Chama Edge Function para criar cliente
    const { data, error } = await supabase.functions.invoke('asaas-create-customer', {
      body: {
        apiConfig,
        customerData
      }
    });

    if (error) {
      console.error('Erro ao chamar Edge Function asaas-create-customer:', error);
      return {
        success: false,
        error: 'Erro na comunicação com o serviço de criação de cliente'
      };
    }

    if (!data.success) {
      return {
        success: false,
        error: data.error || 'Erro desconhecido ao criar cliente'
      };
    }

    return {
      success: true,
      data: data.customer,
      asaasCustomerId: data.customer.id
    };

  } catch (error) {
    console.error('Erro ao criar cliente no Asaas:', error);
    return {
      success: false,
      error: 'Erro inesperado ao criar cliente'
    };
  }
}

// AI dev note: Desabilita todas as notificações nativas do Asaas
export async function disableNotifications(
  customerId: string,
  userRole: string | null
): Promise<AsaasIntegrationResult> {
  try {
    const apiConfig = await determineApiKey(userRole);
    if (!apiConfig) {
      return {
        success: false,
        error: 'API key do Asaas não configurada'
      };
    }

    // Chama Edge Function para desabilitar notificações
    const { data, error } = await supabase.functions.invoke('asaas-disable-notifications', {
      body: {
        apiConfig,
        customerId
      }
    });

    if (error) {
      console.error('Erro ao chamar Edge Function asaas-disable-notifications:', error);
      return {
        success: false,
        error: 'Erro na comunicação com o serviço de notificações'
      };
    }

    return {
      success: data.success,
      error: data.error
    };

  } catch (error) {
    console.error('Erro ao desabilitar notificações no Asaas:', error);
    return {
      success: false,
      error: 'Erro inesperado ao desabilitar notificações'
    };
  }
}

// AI dev note: Cria cobrança PIX no Asaas
export async function createPayment(
  paymentData: CreatePaymentRequest,
  userRole: string | null
): Promise<AsaasIntegrationResult> {
  try {
    const apiConfig = await determineApiKey(userRole);
    if (!apiConfig) {
      return {
        success: false,
        error: 'API key do Asaas não configurada'
      };
    }

    // Chama Edge Function para criar cobrança
    const { data, error } = await supabase.functions.invoke('asaas-create-payment', {
      body: {
        apiConfig,
        paymentData
      }
    });

    if (error) {
      console.error('Erro ao chamar Edge Function asaas-create-payment:', error);
      return {
        success: false,
        error: 'Erro na comunicação com o serviço de cobrança'
      };
    }

    if (!data.success) {
      return {
        success: false,
        error: data.error || 'Erro desconhecido ao criar cobrança'
      };
    }

    return {
      success: true,
      data: data.payment,
      asaasPaymentId: data.payment.id
    };

  } catch (error) {
    console.error('Erro ao criar cobrança no Asaas:', error);
    return {
      success: false,
      error: 'Erro inesperado ao criar cobrança'
    };
  }
}

// AI dev note: Atualiza id_asaas da pessoa no banco de dados
export async function updatePersonAsaasId(
  personId: string,
  asaasCustomerId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('pessoas')
      .update({ id_asaas: asaasCustomerId })
      .eq('id', personId);

    if (error) {
      console.error('Erro ao atualizar id_asaas da pessoa:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Erro inesperado ao atualizar id_asaas:', error);
    return false;
  }
}

// AI dev note: Atualiza id_pagamento_externo dos agendamentos
export async function updateAppointmentsPaymentId(
  appointmentIds: string[],
  asaasPaymentId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('agendamentos')
      .update({ id_pagamento_externo: asaasPaymentId })
      .in('id', appointmentIds);

    if (error) {
      console.error('Erro ao atualizar id_pagamento_externo dos agendamentos:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Erro inesperado ao atualizar id_pagamento_externo:', error);
    return false;
  }
}

// AI dev note: Função principal que processa cobrança completa
export async function processPayment(
  processData: ProcessPaymentData,
  userRole: string | null
): Promise<AsaasIntegrationResult> {
  console.log('🔧 Iniciando processamento de pagamento:', processData);
  console.log('👨‍💼 Role do usuário:', userRole);
  
  try {
    // 1. Busca dados do responsável pela cobrança
    console.log('🔍 Buscando dados do responsável:', processData.responsibleId);
    
    const { data: responsible, error: responsibleError } = await supabase
      .from('pessoas')
      .select(`
        id,
        nome,
        cpf_cnpj,
        email,
        telefone,
        id_asaas,
        numero_endereco,
        complemento_endereco,
        enderecos(cep)
      `)
      .eq('id', processData.responsibleId)
      .single();

    if (responsibleError || !responsible) {
      console.error('❌ Erro ao buscar responsável:', responsibleError);
      return {
        success: false,
        error: 'Responsável pela cobrança não encontrado'
      };
    }

    console.log('✅ Responsável encontrado:', {
      id: responsible.id,
      nome: responsible.nome,
      id_asaas: responsible.id_asaas
    });

    let asaasCustomerId = responsible.id_asaas;

    // 2. Se não tem id_asaas, cria cliente no Asaas
    if (!asaasCustomerId) {
      console.log('👤 Responsável não tem ID do Asaas, criando cliente...');
      
      const customerData: CreateCustomerRequest = {
        name: responsible.nome,
        cpfCnpj: responsible.cpf_cnpj,
        email: responsible.email || undefined,
        mobilePhone: responsible.telefone ? String(responsible.telefone) : undefined,
        postalCode: (responsible.enderecos as { cep?: string })?.cep || undefined,
        externalReference: responsible.id,
        addressNumber: `${responsible.numero_endereco || ''} ${responsible.complemento_endereco || ''}`.trim() || undefined
      };

      console.log('📝 Dados para criação do cliente:', customerData);

      const customerResult = await createCustomer(customerData, userRole);
      if (!customerResult.success) {
        console.error('❌ Falha ao criar cliente no Asaas:', customerResult.error);
        return customerResult;
      }

      asaasCustomerId = customerResult.asaasCustomerId!;
      console.log('✅ Cliente criado no Asaas:', asaasCustomerId);

      // Atualiza id_asaas no banco
      console.log('💾 Atualizando ID do Asaas no banco...');
      const updateResult = await updatePersonAsaasId(responsible.id, asaasCustomerId);
      if (!updateResult) {
        console.error('❌ Erro ao salvar ID do cliente Asaas no banco');
        return {
          success: false,
          error: 'Erro ao salvar ID do cliente Asaas'
        };
      }

      // 3. Desabilita notificações nativas do Asaas
      console.log('🔕 Desabilitando notificações nativas do Asaas...');
      const notificationResult = await disableNotifications(asaasCustomerId, userRole);
      if (!notificationResult.success) {
        console.warn('⚠️ Aviso: Não foi possível desabilitar notificações:', notificationResult.error);
      }
    } else {
      console.log('✅ Responsável já possui ID do Asaas:', asaasCustomerId);
    }

    // 4. Calcula data de vencimento (2 dias após data atual)
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 2);
    const dueDateString = dueDate.toISOString().split('T')[0]; // YYYY-MM-DD
    console.log('📅 Data de vencimento calculada:', dueDateString);

    // 5. Cria cobrança no Asaas
    const paymentData: CreatePaymentRequest = {
      customer: asaasCustomerId,
      billingType: 'PIX',
      value: processData.totalValue,
      dueDate: dueDateString,
      description: processData.description,
      externalReference: processData.consultationIds.join(',')
    };

    console.log('💳 Criando cobrança no Asaas:', paymentData);

    const paymentResult = await createPayment(paymentData, userRole);
    if (!paymentResult.success) {
      console.error('❌ Falha ao criar cobrança:', paymentResult.error);
      return paymentResult;
    }

    console.log('✅ Cobrança criada no Asaas:', paymentResult.asaasPaymentId);

    // 6. Atualiza id_pagamento_externo dos agendamentos
    console.log('🔗 Vinculando cobrança aos agendamentos...');
    const updateAppointmentsResult = await updateAppointmentsPaymentId(
      processData.consultationIds,
      paymentResult.asaasPaymentId!
    );

    if (!updateAppointmentsResult) {
      console.error('❌ Erro ao vincular cobrança aos agendamentos');
      return {
        success: false,
        error: 'Cobrança criada mas erro ao vincular aos agendamentos'
      };
    }

    console.log('✅ Agendamentos vinculados à cobrança com sucesso');

    const finalResult = {
      success: true,
      data: paymentResult.data,
      asaasCustomerId,
      asaasPaymentId: paymentResult.asaasPaymentId
    };

    console.log('🎯 Processamento concluído com sucesso:', finalResult);
    return finalResult;

  } catch (error) {
    console.error('Erro ao processar cobrança:', error);
    return {
      success: false,
      error: 'Erro inesperado ao processar cobrança'
    };
  }
} 