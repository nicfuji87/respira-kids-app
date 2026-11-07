// AI dev note: Edge Function para cancelar cobrança no Asaas
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

interface CancelPaymentRequest {
  apiConfig: {
    apiKey: string;
    isGlobal: boolean;
    baseUrl: string;
  };
  paymentId: string;
}

interface CancelPaymentResponse {
  success: boolean;
  message?: string;
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

    const { apiConfig, paymentId }: CancelPaymentRequest = await req.json();

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

    console.log('🗑️ Cancelando cobrança no Asaas:', paymentId);

    // Chamada para API do Asaas - DELETE para cancelar
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    // AI dev note (07/11/2026): cobrança parcelada no cartão = N payments de um
    // installment. Apagar só o payment da 1ª parcela deixava as outras abertas no
    // Asaas (caso Ivi, "refazer cobrança" de 6x). Parcelado: apaga o parcelamento.
    const atual = await fetch(`${apiConfig.baseUrl}/payments/${paymentId}`, {
      headers: {
        access_token: apiConfig.apiKey,
        'User-Agent': 'RespiraKids/1.0',
      },
      signal: controller.signal,
    })
      .then((r) => r.json())
      .catch(() => ({}));
    const alvo = atual?.installment
      ? `/installments/${atual.installment}`
      : `/payments/${paymentId}`;

    const asaasResponse = await fetch(
      `${apiConfig.baseUrl}${alvo}`,
      {
        method: 'DELETE',
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

    if (asaasResponse.ok) {
      console.log('✅ Cobrança cancelada com sucesso:', paymentId);

      const response: CancelPaymentResponse = {
        success: true,
        message: 'Cobrança cancelada com sucesso',
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
          : `Erro ${asaasResponse.status} ao cancelar cobrança no Asaas`;

      const response: CancelPaymentResponse = {
        success: false,
        error: errorMessage,
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('❌ Erro na Edge Function asaas-cancel-payment:', error);

    const response: CancelPaymentResponse = {
      success: false,
      error:
        error.name === 'AbortError'
          ? 'Timeout ao comunicar com API do Asaas'
          : 'Erro interno ao cancelar cobrança',
    };

    return new Response(JSON.stringify(response), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
