// AI dev note: Edge Function para confirmar recebimento em dinheiro no Asaas
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

interface ReceiveInCashRequest {
  apiConfig: {
    apiKey: string;
    isGlobal: boolean;
    baseUrl: string;
  };
  paymentId: string;
  paymentData: {
    notifyCustomer?: boolean;
    value: number;
    paymentDate: string; // formato: YYYY-MM-DD
  };
}

interface ReceiveInCashResponse {
  success: boolean;
  payment?: Record<string, unknown>;
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

    const { apiConfig, paymentId, paymentData }: ReceiveInCashRequest =
      await req.json();

    // Validar dados obrigatórios
    if (
      !apiConfig?.apiKey ||
      !paymentId ||
      !paymentData?.value ||
      !paymentData?.paymentDate
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Dados obrigatórios não informados',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Validar valor mínimo
    if (paymentData.value <= 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Valor deve ser maior que zero',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Validar formato da data (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(paymentData.paymentDate)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Data de pagamento deve estar no formato YYYY-MM-DD',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Preparar dados para API do Asaas
    const asaasPayload = {
      notifyCustomer: paymentData.notifyCustomer ?? false,
      value: paymentData.value,
      paymentDate: paymentData.paymentDate,
    };

    console.log(
      'Confirmando recebimento em dinheiro no Asaas:',
      JSON.stringify(asaasPayload, null, 2)
    );

    // Chamada para API do Asaas - POST para confirmar recebimento em dinheiro
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const asaasResponse = await fetch(
      `${apiConfig.baseUrl}/payments/${paymentId}/receiveInCash`,
      {
        method: 'POST',
        headers: {
          access_token: apiConfig.apiKey,
          'Content-Type': 'application/json',
          'User-Agent': 'RespiraKids/1.0',
        },
        body: JSON.stringify(asaasPayload),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    const asaasData = await asaasResponse.json();

    if (asaasResponse.ok) {
      console.log(
        '✅ Recebimento em dinheiro confirmado com sucesso:',
        asaasData.id
      );

      const response: ReceiveInCashResponse = {
        success: true,
        payment: asaasData,
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
          : `Erro ${asaasResponse.status} ao confirmar recebimento no Asaas`;

      const response: ReceiveInCashResponse = {
        success: false,
        error: errorMessage,
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('❌ Erro na Edge Function asaas-receive-in-cash:', error);

    const response: ReceiveInCashResponse = {
      success: false,
      error:
        error.name === 'AbortError'
          ? 'Timeout ao comunicar com API do Asaas'
          : 'Erro interno ao confirmar recebimento',
    };

    return new Response(JSON.stringify(response), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
