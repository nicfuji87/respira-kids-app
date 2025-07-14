import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// AI dev note: Edge Function para criar empresa no Asaas server-side
// Evita exposição do token e mantém comunicação segura

/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

interface CreateCompanyRequest {
  token: string;
  companyData: {
    razao_social: string;
    cnpj: string;
    regime_tributario: string;
  };
}

interface CreateCompanyResponse {
  success: boolean;
  message: string;
  asaasId?: string;
}

// Função utilitária para normalizar CNPJ
function normalizeCnpj(cnpj: string): string {
  return cnpj.replace(/[^\d]/g, '');
}

Deno.serve(async (req: Request) => {
  // Configurar CORS
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verificar método
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse do body
    const { token, companyData }: CreateCompanyRequest = await req.json();

    // Validações básicas
    if (!token || token.trim().length < 10) {
      const response: CreateCompanyResponse = {
        success: false,
        message: 'Token inválido',
      };
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!companyData?.razao_social || !companyData?.cnpj) {
      const response: CreateCompanyResponse = {
        success: false,
        message: 'Dados da empresa são obrigatórios',
      };
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Chamada para API do Asaas para criar empresa
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    const asaasResponse = await fetch('https://api.asaas.com/v3/customers', {
      method: 'POST',
      headers: {
        access_token: token.trim(),
        'Content-Type': 'application/json',
        'User-Agent': 'RespiraKids/1.0',
      },
      body: JSON.stringify({
        name: companyData.razao_social,
        cpfCnpj: normalizeCnpj(companyData.cnpj),
        companyType: 'MEI', // ou outro tipo baseado no regime tributário
        email: '', // pode ser adicionado se necessário
        phone: '', // pode ser adicionado se necessário
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    let response: CreateCompanyResponse;

    if (asaasResponse.ok) {
      const data = await asaasResponse.json();
      response = {
        success: true,
        message: 'Empresa criada no Asaas com sucesso',
        asaasId: data.id,
      };
    } else {
      const error = await asaasResponse.json().catch(() => ({}));
      response = {
        success: false,
        message:
          error.message ||
          `Erro ${asaasResponse.status} ao criar empresa no Asaas`,
      };
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Erro na Edge Function create-asaas-company:', error);

    let errorMessage = 'Erro na comunicação com o Asaas';
    if (error instanceof Error && error.name === 'AbortError') {
      errorMessage = 'Timeout na criação - tente novamente';
    }

    const response: CreateCompanyResponse = {
      success: false,
      message: errorMessage,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
