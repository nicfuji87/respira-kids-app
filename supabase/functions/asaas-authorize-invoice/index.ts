// AI dev note: Edge Function para emitir/autorizar nota fiscal no Asaas
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

interface AuthorizeInvoiceRequest {
  apiConfig: {
    apiKey: string;
    isGlobal: boolean;
    baseUrl: string;
  };
  invoiceId: string;
}

interface AuthorizeInvoiceResponse {
  success: boolean;
  invoice?: Record<string, unknown>;
  error?: string;
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
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ success: false, error: 'Method not allowed' }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { apiConfig, invoiceId }: AuthorizeInvoiceRequest = await req.json();

    // Validar dados obrigatórios
    if (!apiConfig?.apiKey || !invoiceId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'API key e invoiceId são obrigatórios',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('📄 Emitindo nota fiscal no Asaas:', invoiceId);

    // Chamada para API do Asaas - POST para autorizar/emitir
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const asaasResponse = await fetch(
      `${apiConfig.baseUrl}/invoices/${invoiceId}/authorize`,
      {
        method: 'POST',
        headers: {
          access_token: apiConfig.apiKey,
          'Content-Type': 'application/json',
          'User-Agent': 'RespiraKids/1.0',
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    const asaasData = await asaasResponse.json();

    if (asaasResponse.ok) {
      console.log('✅ Nota fiscal emitida com sucesso:', asaasData.id);

      const response: AuthorizeInvoiceResponse = {
        success: true,
        invoice: asaasData,
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      console.error('❌ Erro da API Asaas:', asaasData);

      const errorMessage =
        asaasData.errors?.length > 0
          ? asaasData.errors[0].description
          : `Erro ${asaasResponse.status} ao emitir nota fiscal no Asaas`;

      const response: AuthorizeInvoiceResponse = {
        success: false,
        error: errorMessage,
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('❌ Erro na Edge Function asaas-authorize-invoice:', error);

    const response: AuthorizeInvoiceResponse = {
      success: false,
      error:
        error.name === 'AbortError'
          ? 'Timeout ao comunicar com API do Asaas'
          : 'Erro interno ao emitir nota fiscal',
    };

    return new Response(JSON.stringify(response), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
