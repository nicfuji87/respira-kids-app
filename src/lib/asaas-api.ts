// AI dev note: API client para integração com Asaas
// Funções principais: determineApiKey, createCustomer, disableNotifications, createPayment

import { supabase } from '@/lib/supabase';
import type {
  AsaasApiConfig,
  CreateCustomerRequest,
  CreatePaymentRequest,
  AsaasIntegrationResult,
  ProcessPaymentData,
} from '@/types/asaas';

// AI dev note: Determina API key baseada na empresa de faturamento dos agendamentos
export async function determineApiKeyFromEmpresa(
  empresaId: string
): Promise<AsaasApiConfig | null> {
  try {
    console.log('🔍 Buscando API key da empresa de faturamento:', empresaId);

    // Busca API key da empresa de faturamento
    const { data: empresaData, error: empresaError } = await supabase
      .from('pessoa_empresas')
      .select('api_token_externo, razao_social')
      .eq('id', empresaId)
      .eq('ativo', true)
      .single();

    if (empresaError || !empresaData) {
      console.error('❌ Erro ao buscar dados da empresa:', empresaError);
      return null;
    }

    if (!empresaData.api_token_externo) {
      console.error(
        '❌ Empresa não possui API key configurada:',
        empresaData.razao_social
      );
      return null;
    }

    console.log('✅ API key da empresa encontrada:', empresaData.razao_social);
    return {
      apiKey: empresaData.api_token_externo,
      isGlobal: false,
      baseUrl: 'https://api.asaas.com/v3',
    };
  } catch (error) {
    console.error('Erro ao determinar API key da empresa:', error);
    return null;
  }
}

// AI dev note: DEPRECATED - Mantido para compatibilidade, usar determineApiKeyFromEmpresa
export async function determineApiKey(): Promise<AsaasApiConfig | null> {
  console.warn(
    '⚠️ determineApiKey está deprecada, use determineApiKeyFromEmpresa'
  );
  return null;
}

// AI dev note: Busca cliente existente no Asaas por CPF
export async function searchExistingCustomer(
  cpfCnpj: string,
  apiConfig: AsaasApiConfig
): Promise<AsaasIntegrationResult> {
  try {
    console.log('🔍 Buscando cliente existente por CPF/CNPJ:', cpfCnpj);

    // Chama Edge Function para buscar cliente
    const { data, error } = await supabase.functions.invoke(
      'asaas-search-customer',
      {
        body: {
          apiConfig,
          cpfCnpj,
        },
      }
    );

    if (error) {
      console.error(
        'Erro ao chamar Edge Function asaas-search-customer:',
        error
      );
      return {
        success: false,
        error: 'Erro na comunicação com o serviço de busca de cliente',
      };
    }

    if (!data.success) {
      return {
        success: false,
        error: data.error || 'Erro desconhecido ao buscar cliente',
      };
    }

    return {
      success: true,
      data: data.customer,
      asaasCustomerId: data.found
        ? (data.customer as { id?: string })?.id
        : undefined,
    };
  } catch (error) {
    console.error('Erro ao buscar cliente no Asaas:', error);
    return {
      success: false,
      error: 'Erro inesperado ao buscar cliente',
    };
  }
}

// AI dev note: Cria cliente no Asaas se não existir
export async function createCustomer(
  customerData: CreateCustomerRequest,
  apiConfig: AsaasApiConfig
): Promise<AsaasIntegrationResult> {
  try {
    // Chama Edge Function para criar cliente
    const { data, error } = await supabase.functions.invoke(
      'asaas-create-customer',
      {
        body: {
          apiConfig,
          customerData,
        },
      }
    );

    if (error) {
      console.error(
        'Erro ao chamar Edge Function asaas-create-customer:',
        error
      );
      return {
        success: false,
        error: 'Erro na comunicação com o serviço de criação de cliente',
      };
    }

    if (!data.success) {
      return {
        success: false,
        error: data.error || 'Erro desconhecido ao criar cliente',
      };
    }

    return {
      success: true,
      data: data.customer,
      asaasCustomerId: data.customer.id,
    };
  } catch (error) {
    console.error('Erro ao criar cliente no Asaas:', error);
    return {
      success: false,
      error: 'Erro inesperado ao criar cliente',
    };
  }
}

// AI dev note: Desabilita todas as notificações nativas do Asaas
export async function disableNotifications(
  customerId: string,
  apiConfig: AsaasApiConfig
): Promise<AsaasIntegrationResult> {
  try {
    // Chama Edge Function para desabilitar notificações
    const { data, error } = await supabase.functions.invoke(
      'asaas-disable-notifications',
      {
        body: {
          apiConfig,
          customerId,
        },
      }
    );

    if (error) {
      console.error(
        'Erro ao chamar Edge Function asaas-disable-notifications:',
        error
      );
      return {
        success: false,
        error: 'Erro na comunicação com o serviço de notificações',
      };
    }

    return {
      success: data.success,
      error: data.error,
    };
  } catch (error) {
    console.error('Erro ao desabilitar notificações no Asaas:', error);
    return {
      success: false,
      error: 'Erro inesperado ao desabilitar notificações',
    };
  }
}

// AI dev note: Cria cobrança PIX no Asaas
export async function createPayment(
  paymentData: CreatePaymentRequest,
  apiConfig: AsaasApiConfig
): Promise<AsaasIntegrationResult> {
  try {
    // Chama Edge Function para criar cobrança
    const { data, error } = await supabase.functions.invoke(
      'asaas-create-payment',
      {
        body: {
          apiConfig,
          paymentData,
        },
      }
    );

    if (error) {
      console.error(
        'Erro ao chamar Edge Function asaas-create-payment:',
        error
      );
      return {
        success: false,
        error: 'Erro na comunicação com o serviço de cobrança',
      };
    }

    if (!data.success) {
      return {
        success: false,
        error: data.error || 'Erro desconhecido ao criar cobrança',
      };
    }

    return {
      success: true,
      data: data.payment,
      asaasPaymentId: data.payment.id,
    };
  } catch (error) {
    console.error('Erro ao criar cobrança no Asaas:', error);
    return {
      success: false,
      error: 'Erro inesperado ao criar cobrança',
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
      console.error(
        'Erro ao atualizar id_pagamento_externo dos agendamentos:',
        error
      );
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
    // 0. Buscar empresa_fatura dos agendamentos e obter API key
    console.log(
      '🏢 Buscando empresa de faturamento dos agendamentos:',
      processData.consultationIds
    );

    const { data: agendamentosData, error: agendamentosError } = await supabase
      .from('vw_cobranca_empresas')
      .select('empresa_id, razao_social, api_token_externo')
      .in('agendamento_id', processData.consultationIds)
      .limit(1)
      .single();

    if (agendamentosError || !agendamentosData) {
      console.error(
        '❌ Erro ao buscar dados da empresa de faturamento:',
        agendamentosError
      );
      return {
        success: false,
        error: 'Erro ao buscar dados da empresa de faturamento',
      };
    }

    const apiConfig = {
      apiKey: agendamentosData.api_token_externo,
      isGlobal: false,
      baseUrl: 'https://api.asaas.com/v3',
    };

    if (!apiConfig.apiKey) {
      console.error(
        '❌ Empresa não possui API key configurada:',
        agendamentosData.razao_social
      );
      return {
        success: false,
        error: `Empresa ${agendamentosData.razao_social} não possui API key do Asaas configurada`,
      };
    }

    console.log(
      '✅ API key da empresa encontrada:',
      agendamentosData.razao_social
    );

    // 1. Busca dados do responsável pela cobrança
    console.log('🔍 Buscando dados do responsável:', processData.responsibleId);

    const { data: responsible, error: responsibleError } = await supabase
      .from('pessoas')
      .select(
        `
        id,
        nome,
        cpf_cnpj,
        email,
        telefone,
        id_asaas,
        numero_endereco,
        complemento_endereco,
        enderecos(cep)
      `
      )
      .eq('id', processData.responsibleId)
      .single();

    if (responsibleError || !responsible) {
      console.error('❌ Erro ao buscar responsável:', responsibleError);
      return {
        success: false,
        error: 'Responsável pela cobrança não encontrado',
      };
    }

    console.log('✅ Responsável encontrado:', {
      id: responsible.id,
      nome: responsible.nome,
      id_asaas: responsible.id_asaas,
    });

    let asaasCustomerId = responsible.id_asaas;

    // 2. Se não tem id_asaas, verifica se cliente já existe no Asaas
    if (!asaasCustomerId) {
      console.log(
        '👤 Responsável não tem ID do Asaas, verificando se já existe...'
      );

      // Primeiro, busca cliente existente por CPF
      const searchResult = await searchExistingCustomer(
        responsible.cpf_cnpj,
        apiConfig
      );

      if (searchResult.success && searchResult.asaasCustomerId) {
        // Cliente já existe no Asaas, apenas atualiza o ID no Supabase
        asaasCustomerId = searchResult.asaasCustomerId;
        console.log('✅ Cliente já existe no Asaas:', asaasCustomerId);

        // Atualiza id_asaas no banco
        console.log('💾 Atualizando ID do Asaas existente no banco...');
        const updateResult = await updatePersonAsaasId(
          responsible.id,
          asaasCustomerId
        );
        if (!updateResult) {
          console.error('❌ Erro ao salvar ID do cliente Asaas no banco');
          return {
            success: false,
            error: 'Erro ao salvar ID do cliente Asaas',
          };
        }

        console.log('✅ ID do Asaas atualizado no Supabase');
      } else {
        // Cliente não existe, criar novo
        console.log('🆕 Cliente não existe no Asaas, criando novo...');

        const customerData: CreateCustomerRequest = {
          name: responsible.nome,
          cpfCnpj: responsible.cpf_cnpj,
          email: responsible.email || undefined,
          mobilePhone: responsible.telefone
            ? String(responsible.telefone)
            : undefined,
          postalCode:
            (responsible.enderecos as { cep?: string })?.cep || undefined,
          externalReference: responsible.id,
          addressNumber:
            `${responsible.numero_endereco || ''} ${responsible.complemento_endereco || ''}`.trim() ||
            undefined,
        };

        console.log('📝 Dados para criação do cliente:', customerData);

        const customerResult = await createCustomer(customerData, apiConfig);
        if (!customerResult.success) {
          console.error(
            '❌ Falha ao criar cliente no Asaas:',
            customerResult.error
          );
          return customerResult;
        }

        asaasCustomerId = customerResult.asaasCustomerId!;
        console.log('✅ Cliente criado no Asaas:', asaasCustomerId);

        // Atualiza id_asaas no banco
        console.log('💾 Atualizando ID do Asaas no banco...');
        const updateResult = await updatePersonAsaasId(
          responsible.id,
          asaasCustomerId
        );
        if (!updateResult) {
          console.error('❌ Erro ao salvar ID do cliente Asaas no banco');
          return {
            success: false,
            error: 'Erro ao salvar ID do cliente Asaas',
          };
        }
      }

      // 3. Desabilita notificações nativas do Asaas (para cliente novo ou existente)
      console.log('🔕 Desabilitando notificações nativas do Asaas...');
      const notificationResult = await disableNotifications(
        asaasCustomerId,
        apiConfig
      );
      if (!notificationResult.success) {
        console.warn(
          '⚠️ Aviso: Não foi possível desabilitar notificações:',
          notificationResult.error
        );
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
      externalReference: processData.consultationIds.join(','),
    };

    console.log('💳 Criando cobrança no Asaas:', paymentData);

    const paymentResult = await createPayment(paymentData, apiConfig);
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
        error: 'Cobrança criada mas erro ao vincular aos agendamentos',
      };
    }

    console.log('✅ Agendamentos vinculados à cobrança com sucesso');

    const finalResult = {
      success: true,
      data: paymentResult.data,
      asaasCustomerId,
      asaasPaymentId: paymentResult.asaasPaymentId,
    };

    console.log('🎯 Processamento concluído com sucesso:', finalResult);
    return finalResult;
  } catch (error) {
    console.error('Erro ao processar cobrança:', error);
    return {
      success: false,
      error: 'Erro inesperado ao processar cobrança',
    };
  }
}
