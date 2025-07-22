import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// AI dev note: Edge Function para validar token Asaas server-side
// Evita CORS e mantém token seguro no backend

/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
interface ValidateTokenRequest {
  token: string;
}

interface ValidateTokenResponse {
  isValid: boolean;
  message?: string;
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
    const { token }: ValidateTokenRequest = await req.json();

    // Validação básica de formato
    if (!token || token.trim().length < 10) {
      const response: ValidateTokenResponse = {
        isValid: false,
        message: 'Token deve ter pelo menos 10 caracteres',
      };
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Chamada para API do Asaas para validar token
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const asaasResponse = await fetch(
      'https://api.asaas.com/v3/customers?limit=1',
      {
        method: 'GET',
        headers: {
          access_token: token.trim(),
          'Content-Type': 'application/json',
          'User-Agent': 'RespiraKids/1.0',
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    let response: ValidateTokenResponse;

    if (asaasResponse.ok) {
      response = { isValid: true, message: 'Token válido e ativo' };
    } else if (asaasResponse.status === 401) {
      response = { isValid: false, message: 'Token inválido ou expirado' };
    } else if (asaasResponse.status === 403) {
      response = {
        isValid: false,
        message: 'Token sem permissões necessárias',
      };
    } else {
      response = { isValid: false, message: 'Erro na validação do token' };
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Erro na Edge Function validate-asaas-token:', error);

    let errorMessage = 'Erro na comunicação com o Asaas';
    if (error instanceof Error && error.name === 'AbortError') {
      errorMessage = 'Timeout na validação - verifique sua conexão';
    }

    const response: ValidateTokenResponse = {
      isValid: false,
      message: errorMessage,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
