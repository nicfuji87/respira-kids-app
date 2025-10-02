// AI dev note: Edge Function para agendar nota fiscal no Asaas
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

interface ScheduleInvoiceRequest {
  apiConfig: {
    apiKey: string;
    isGlobal: boolean;
    baseUrl: string;
  };
  invoiceData: {
    payment: string;
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
    };
  };
}

interface ScheduleInvoiceResponse {
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

    const { apiConfig, invoiceData }: ScheduleInvoiceRequest = await req.json();

    // Validar dados obrigatórios
    if (
      !apiConfig?.apiKey ||
      !invoiceData?.payment ||
      !invoiceData?.serviceDescription ||
      !invoiceData?.value
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

    // AI dev note: Esta validação é CORRETA - ASAAS não aceita notas fiscais com valor zero
    // Consultas gratuitas podem existir no sistema, mas não devem gerar NFe
    // Validar valor mínimo
    if (invoiceData.value <= 0) {
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

    // Validar formato da data (YYYY-MM-DD)
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

    // Preparar dados para API do Asaas
    const asaasPayload = {
      payment: invoiceData.payment,
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
      '📄 Agendando nota fiscal no Asaas:',
      JSON.stringify(asaasPayload, null, 2)
    );

    // Chamada para API do Asaas - POST para agendar
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const asaasResponse = await fetch(`${apiConfig.baseUrl}/invoices`, {
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
      console.log('✅ Nota fiscal agendada com sucesso:', asaasData.id);

      const response: ScheduleInvoiceResponse = {
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
          : `Erro ${asaasResponse.status} ao agendar nota fiscal no Asaas`;

      const response: ScheduleInvoiceResponse = {
        success: false,
        error: errorMessage,
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('❌ Erro na Edge Function asaas-schedule-invoice:', error);

    const response: ScheduleInvoiceResponse = {
      success: false,
      error:
        error.name === 'AbortError'
          ? 'Timeout ao comunicar com API do Asaas'
          : 'Erro interno ao agendar nota fiscal',
    };

    return new Response(JSON.stringify(response), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
