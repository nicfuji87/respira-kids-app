// AI dev note: Edge Function para criar cobrança PIX no Asaas
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

interface CreatePaymentRequest {
  apiConfig: {
    apiKey: string;
    isGlobal: boolean;
    baseUrl: string;
  };
  paymentData: {
    customer: string;
    billingType: 'PIX';
    value: number;
    dueDate: string;
    description: string;
    externalReference?: string;
  };
}

interface CreatePaymentResponse {
  success: boolean;
  payment?: unknown;
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

    const { apiConfig, paymentData }: CreatePaymentRequest = await req.json();

    // Validar dados obrigatórios
    if (
      !apiConfig?.apiKey ||
      !paymentData?.customer ||
      !paymentData?.value ||
      !paymentData?.dueDate
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

    // AI dev note: Esta validação é CORRETA - ASAAS não aceita cobranças com valor zero
    // Consultas gratuitas podem existir no sistema, mas não devem gerar cobranças
    // Validar valor mínimo
    if (paymentData.value <= 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Valor deve ser maior que zero para gerar cobrança no ASAAS',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Validar formato da data (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(paymentData.dueDate)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Data de vencimento deve estar no formato YYYY-MM-DD',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Preparar dados para API do Asaas
    const asaasPayload = {
      customer: paymentData.customer,
      billingType: 'PIX' as const,
      value: paymentData.value,
      dueDate: paymentData.dueDate,
      description: paymentData.description || 'Cobrança Respira Kids',
      externalReference: paymentData.externalReference,
    };

    // Remover campos vazios opcionais
    if (!asaasPayload.externalReference) {
      delete asaasPayload.externalReference;
    }

    console.log(
      'Criando cobrança PIX no Asaas:',
      JSON.stringify(asaasPayload, null, 2)
    );

    // Chamada para API do Asaas
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const asaasResponse = await fetch(`${apiConfig.baseUrl}/payments`, {
      method: 'POST',
      headers: {
        access_token: apiConfig.apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'RespiraKids/1.0',
      },
      body: JSON.stringify(asaasPayload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const asaasData = await asaasResponse.json();

    if (asaasResponse.ok) {
      console.log('Cobrança PIX criada com sucesso:', asaasData.id);

      const response: CreatePaymentResponse = {
        success: true,
        payment: asaasData,
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      console.error('Erro da API Asaas:', asaasData);

      const errorMessage =
        asaasData.errors?.length > 0
          ? asaasData.errors[0].description
          : `Erro ${asaasResponse.status} ao criar cobrança no Asaas`;

      const response: CreatePaymentResponse = {
        success: false,
        error: errorMessage,
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('Erro na Edge Function asaas-create-payment:', error);

    let errorMessage = 'Erro na comunicação com o Asaas';
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        errorMessage = 'Timeout na criação da cobrança - tente novamente';
      } else {
        errorMessage = error.message;
      }
    }

    const response: CreatePaymentResponse = {
      success: false,
      error: errorMessage,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
