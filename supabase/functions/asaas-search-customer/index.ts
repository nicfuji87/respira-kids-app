// AI dev note: Edge Function para buscar cliente no Asaas por CPF
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

interface SearchCustomerRequest {
  apiConfig: {
    apiKey: string;
    isGlobal: boolean;
    baseUrl: string;
  };
  cpfCnpj: string;
}

interface SearchCustomerResponse {
  success: boolean;
  customer?: unknown;
  found: boolean;
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

    const { apiConfig, cpfCnpj }: SearchCustomerRequest = await req.json();

    if (!apiConfig?.apiKey || !cpfCnpj) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'API key e CPF/CNPJ são obrigatórios' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Normalizar CPF/CNPJ (remover pontuação)
    const normalizedCpfCnpj = cpfCnpj.replace(/[^\d]/g, '');

    console.log('🔍 Buscando cliente por CPF/CNPJ:', normalizedCpfCnpj);

    // Buscar cliente na API do Asaas
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    console.log('📡 Fazendo requisição para API do Asaas...');
    
    const asaasResponse = await fetch(
      `${apiConfig.baseUrl}/customers?cpfCnpj=${normalizedCpfCnpj}&limit=1`, 
      {
        method: 'GET',
        headers: {
          'access_token': apiConfig.apiKey,
          'Content-Type': 'application/json',
          'User-Agent': 'RespiraKids/1.0',
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    console.log('📥 Resposta da API Asaas recebida:', {
      status: asaasResponse.status,
      statusText: asaasResponse.statusText,
      ok: asaasResponse.ok
    });

    const asaasData = await asaasResponse.json();
    console.log('📄 Dados da resposta:', JSON.stringify(asaasData, null, 2));

    if (asaasResponse.ok) {
      const customers = asaasData.data || [];
      const found = customers.length > 0;
      
      console.log(`${found ? '✅' : 'ℹ️'} Cliente ${found ? 'encontrado' : 'não encontrado'}`);
      
      const response: SearchCustomerResponse = {
        success: true,
        customer: found ? customers[0] : null,
        found: found
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      console.error('❌ Erro da API Asaas:', asaasData);
      
      const errorMessage = asaasData.errors?.length > 0 
        ? asaasData.errors[0].description 
        : `Erro ${asaasResponse.status} ao buscar cliente no Asaas`;

      const response: SearchCustomerResponse = {
        success: false,
        found: false,
        error: errorMessage
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error) {
    console.error('💥 Erro na Edge Function asaas-search-customer:', error);

    let errorMessage = 'Erro na comunicação com o Asaas';
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        errorMessage = 'Timeout na busca do cliente - tente novamente';
      } else {
        errorMessage = error.message;
      }
    }

    const response: SearchCustomerResponse = {
      success: false,
      found: false,
      error: errorMessage
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}); 