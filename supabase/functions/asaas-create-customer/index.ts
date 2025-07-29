// AI dev note: Edge Function para criar cliente no Asaas
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

interface CreateCustomerRequest {
  apiConfig: {
    apiKey: string;
    isGlobal: boolean;
    baseUrl: string;
  };
  customerData: {
    name: string;
    cpfCnpj: string;
    email?: string;
    mobilePhone?: string;
    postalCode?: string;
    externalReference: string;
    addressNumber?: string;
  };
}

interface CreateCustomerResponse {
  success: boolean;
  customer?: unknown;
  error?: string;
}

Deno.serve(async (req: Request) => {
  // Configurar CORS
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ success: false, error: 'Method not allowed' }),
        { 
          status: 405, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const { apiConfig, customerData }: CreateCustomerRequest = await req.json();

    if (!apiConfig?.apiKey || !customerData?.name || !customerData?.cpfCnpj) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Dados obrigatórios não informados' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Normalizar CPF/CNPJ (remover pontuação)
    const normalizedCpfCnpj = customerData.cpfCnpj.replace(/[^\d]/g, '');

    // Normalizar telefone (remover caracteres especiais)
    const normalizedPhone = customerData.mobilePhone?.replace(/[^\d]/g, '');

    // Preparar dados para API do Asaas
    const asaasPayload = {
      name: customerData.name,
      cpfCnpj: normalizedCpfCnpj,
      email: customerData.email || '',
      mobilePhone: normalizedPhone || '',
      postalCode: customerData.postalCode || '',
      externalReference: customerData.externalReference,
      addressNumber: customerData.addressNumber || ''
    };

    // Remover campos vazios
    Object.keys(asaasPayload).forEach(key => {
      if (!asaasPayload[key as keyof typeof asaasPayload]) {
        delete asaasPayload[key as keyof typeof asaasPayload];
      }
    });

    console.log('🔄 Criando cliente no Asaas:', JSON.stringify(asaasPayload, null, 2));

    // Chamada para API do Asaas
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    console.log('📡 Fazendo requisição para API do Asaas...');
    
    const asaasResponse = await fetch(`${apiConfig.baseUrl}/customers`, {
      method: 'POST',
      headers: {
        'access_token': apiConfig.apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'RespiraKids/1.0',
      },
      body: JSON.stringify(asaasPayload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    console.log('📥 Resposta da API Asaas recebida:', {
      status: asaasResponse.status,
      statusText: asaasResponse.statusText,
      ok: asaasResponse.ok
    });

    const asaasData = await asaasResponse.json();
    console.log('📄 Dados da resposta:', JSON.stringify(asaasData, null, 2));

    if (asaasResponse.ok) {
      console.log('Cliente criado com sucesso:', asaasData.id);
      
      const response: CreateCustomerResponse = {
        success: true,
        customer: asaasData
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      console.error('Erro da API Asaas:', asaasData);
      
      const errorMessage = asaasData.errors?.length > 0 
        ? asaasData.errors[0].description 
        : `Erro ${asaasResponse.status} ao criar cliente no Asaas`;

      const response: CreateCustomerResponse = {
        success: false,
        error: errorMessage
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error) {
    console.error('Erro na Edge Function asaas-create-customer:', error);

    let errorMessage = 'Erro na comunicação com o Asaas';
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        errorMessage = 'Timeout na criação do cliente - tente novamente';
      } else {
        errorMessage = error.message;
      }
    }

    const response: CreateCustomerResponse = {
      success: false,
      error: errorMessage
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}); 