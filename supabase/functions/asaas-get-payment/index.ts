// AI dev note: Edge Function para CONSULTAR uma cobrança no Asaas (GET /payments/{id}).
// Usada pelo "Ajuste manual" de faturas para re-sincronizar o estado do Supabase
// quando o webhook ASAAS -> n8n -> Supabase falhou. Espelha asaas-cancel-payment.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

interface GetPaymentRequest {
  apiConfig: {
    apiKey: string;
    isGlobal: boolean;
    baseUrl: string;
  };
  paymentId: string;
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

    const { apiConfig, paymentId }: GetPaymentRequest = await req.json();

    // Validar dados obrigatórios
    if (!apiConfig?.apiKey || !paymentId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'API key e paymentId são obrigatórios',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('🔍 Consultando cobrança no Asaas:', paymentId);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const asaasResponse = await fetch(
      `${apiConfig.baseUrl}/payments/${paymentId}`,
      {
        method: 'GET',
        headers: {
          access_token: apiConfig.apiKey,
          'Content-Type': 'application/json',
          'User-Agent': 'RespiraKids/1.0',
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    const asaasData = await asaasResponse.json().catch(() => ({}));

    // AI dev note: 404 significa que a cobrança foi EXCLUÍDA no Asaas. Não é erro:
    // sinalizamos notFound=true para o chamador marcar a fatura como cancelada.
    if (asaasResponse.status === 404) {
      console.log('ℹ️ Cobrança não encontrada no Asaas (excluída):', paymentId);
      return new Response(
        JSON.stringify({ success: true, payment: null, notFound: true }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (asaasResponse.ok) {
      console.log('✅ Cobrança consultada com sucesso:', paymentId);
      return new Response(
        JSON.stringify({ success: true, payment: asaasData }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.error('❌ Erro da API Asaas:', asaasData);
    const errorMessage =
      asaasData.errors?.length > 0
        ? asaasData.errors[0].description
        : `Erro ${asaasResponse.status} ao consultar cobrança no Asaas`;

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('❌ Erro na Edge Function asaas-get-payment:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error:
          error.name === 'AbortError'
            ? 'Timeout ao comunicar com API do Asaas'
            : 'Erro interno ao consultar cobrança',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
