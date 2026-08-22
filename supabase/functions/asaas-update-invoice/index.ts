// AI dev note: Edge Function para atualizar uma nota fiscal no Asaas (PUT /invoices/{id}).
// O Asaas só permite atualizar notas em SCHEDULED ou ERROR. Como a API NÃO tem
// DELETE de invoice e nota em erro também não pode ser cancelada, este é o único
// caminho de reemissão: corrigir os dados da nota rejeitada e reautorizá-la.
// ATENÇÃO: desde 31/03/2026 o objeto `taxes` tem semântica de PUT no Asaas —
// campo ausente vira null/zero. Sempre enviar o objeto de impostos completo.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

interface UpdateInvoiceRequest {
  apiConfig: {
    apiKey: string;
    isGlobal: boolean;
    baseUrl: string;
  };
  invoiceId: string;
  invoiceData: {
    serviceDescription: string;
    observations: string;
    value: number;
    deductions: number;
    effectiveDate: string;
    municipalServiceId: string;
    municipalServiceName: string;
    updatePayment?: boolean;
    taxes: {
      retainIss: boolean;
      iss?: number;
      cofins?: number;
      csll?: number;
      inss?: number;
      ir?: number;
      pis?: number;
      nbsCode?: string;
      taxSituationCode?: string;
      taxClassificationCode?: string;
      operationIndicatorCode?: string;
    };
  };
}

interface UpdateInvoiceResponse {
  success: boolean;
  invoice?: Record<string, unknown>;
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

    const { apiConfig, invoiceId, invoiceData }: UpdateInvoiceRequest =
      await req.json();

    if (!apiConfig?.apiKey || !invoiceId || !invoiceData) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'API key, invoiceId e invoiceData são obrigatórios',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!invoiceData.value || invoiceData.value <= 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            'Valor deve ser maior que zero para emitir nota fiscal no ASAAS',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(invoiceData.effectiveDate)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Data de emissão deve estar no formato YYYY-MM-DD',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const asaasPayload = {
      serviceDescription: invoiceData.serviceDescription,
      observations: invoiceData.observations,
      value: invoiceData.value,
      deductions: invoiceData.deductions,
      effectiveDate: invoiceData.effectiveDate,
      municipalServiceId: invoiceData.municipalServiceId,
      municipalServiceName: invoiceData.municipalServiceName,
      updatePayment: invoiceData.updatePayment || false,
      taxes: invoiceData.taxes,
    };

    console.log(
      `📝 Atualizando nota fiscal ${invoiceId} no Asaas:`,
      JSON.stringify(asaasPayload, null, 2)
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const asaasResponse = await fetch(
      `${apiConfig.baseUrl}/invoices/${invoiceId}`,
      {
        method: 'PUT',
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
      console.log('✅ Nota fiscal atualizada:', asaasData.id);

      return new Response(
        JSON.stringify({
          success: true,
          invoice: asaasData,
        } satisfies UpdateInvoiceResponse),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const errorMessage =
      asaasData?.errors?.[0]?.description ||
      `Erro ${asaasResponse.status} ao atualizar nota fiscal no Asaas`;
    console.error('❌ Erro da API Asaas:', asaasData);

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      } satisfies UpdateInvoiceResponse),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('❌ Erro na Edge Function asaas-update-invoice:', error);

    const isAbortError = error instanceof Error && error.name === 'AbortError';

    return new Response(
      JSON.stringify({
        success: false,
        error: isAbortError
          ? 'Timeout ao comunicar com API do Asaas'
          : 'Erro interno ao atualizar nota fiscal',
      } satisfies UpdateInvoiceResponse),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
