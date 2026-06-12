// AI dev note: Edge Function para criar cobrança no Asaas.
// Suporta PIX e CARTÃO DE CRÉDITO (à vista e parcelado). O cartão usa o checkout
// HOSPEDADO do Asaas (retornamos `invoiceUrl` para redirecionar o cliente).
// - 1x: enviar `value`.
// - Parcelado (>=2x): enviar `installmentCount` + `totalValue` (Asaas divide as parcelas).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

interface CreatePaymentRequest {
  apiConfig: {
    apiKey: string;
    isGlobal: boolean;
    baseUrl: string;
  };
  paymentData: {
    customer: string;
    billingType: 'PIX' | 'CREDIT_CARD';
    value?: number;
    installmentCount?: number;
    installmentValue?: number;
    totalValue?: number;
    dueDate: string;
    description: string;
    externalReference?: string;
    callback?: { successUrl: string; autoRedirect?: boolean };
  };
}

interface CreatePaymentResponse {
  success: boolean;
  payment?: unknown;
  error?: string;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

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
    if (!apiConfig?.apiKey || !paymentData?.customer || !paymentData?.dueDate) {
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

    const billingType = paymentData.billingType || 'PIX';
    const isParcelado =
      typeof paymentData.installmentCount === 'number' &&
      paymentData.installmentCount >= 2;

    // AI dev note: ASAAS não aceita cobranças com valor <= 0. Validar conforme o modo.
    if (isParcelado) {
      const totalParcelado =
        paymentData.totalValue ??
        (paymentData.installmentValue
          ? paymentData.installmentValue * paymentData.installmentCount!
          : 0);
      if (!(totalParcelado > 0)) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Valor total do parcelamento deve ser maior que zero',
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    } else if (
      !(typeof paymentData.value === 'number' && paymentData.value > 0)
    ) {
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

    // Preparar payload para a API do Asaas
    const asaasPayload: Record<string, unknown> = {
      customer: paymentData.customer,
      billingType,
      dueDate: paymentData.dueDate,
      description: paymentData.description || 'Cobrança Respira Kids',
    };

    if (isParcelado) {
      asaasPayload.installmentCount = paymentData.installmentCount;
      if (typeof paymentData.totalValue === 'number') {
        asaasPayload.totalValue = paymentData.totalValue;
      } else if (typeof paymentData.installmentValue === 'number') {
        asaasPayload.installmentValue = paymentData.installmentValue;
      }
    } else {
      asaasPayload.value = paymentData.value;
    }

    if (paymentData.externalReference) {
      asaasPayload.externalReference = paymentData.externalReference;
    }
    if (paymentData.callback?.successUrl) {
      asaasPayload.callback = {
        successUrl: paymentData.callback.successUrl,
        autoRedirect: paymentData.callback.autoRedirect ?? true,
      };
    }

    console.log(
      `Criando cobrança ${billingType}${isParcelado ? ` ${paymentData.installmentCount}x` : ''} no Asaas:`,
      JSON.stringify(asaasPayload, null, 2)
    );

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
      console.log('Cobrança criada com sucesso:', asaasData.id);

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
