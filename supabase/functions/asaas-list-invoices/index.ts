// AI dev note: Edge Function para listar as notas fiscais de um payment no Asaas.
// Usada antes de emitir: se já existe invoice em SCHEDULED ou ERROR para a cobrança,
// ela precisa ser REAPROVEITADA (PUT + authorize) em vez de agendar outra — o Asaas
// recusa um segundo agendamento para o mesmo payment.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

interface ListInvoicesRequest {
  apiConfig: {
    apiKey: string;
    isGlobal: boolean;
    baseUrl: string;
  };
  paymentId: string;
}

interface InvoiceSummary {
  id: string;
  status: string;
  statusDescription?: string | null;
}

interface ListInvoicesResponse {
  success: boolean;
  invoices?: InvoiceSummary[];
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

    const { apiConfig, paymentId }: ListInvoicesRequest = await req.json();

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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const asaasResponse = await fetch(
      `${apiConfig.baseUrl}/invoices?payment=${encodeURIComponent(paymentId)}`,
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

    const asaasData = await asaasResponse.json();

    if (!asaasResponse.ok) {
      const errorMessage =
        asaasData?.errors?.[0]?.description ||
        `Erro ${asaasResponse.status} ao listar notas fiscais no Asaas`;
      console.error('❌ Erro ao listar invoices:', errorMessage);

      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage,
        } satisfies ListInvoicesResponse),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const invoices: InvoiceSummary[] = Array.isArray(asaasData?.data)
      ? asaasData.data.map((invoice: Record<string, unknown>) => ({
          id: String(invoice.id),
          status: String(invoice.status),
          statusDescription: (invoice.statusDescription as string) ?? null,
        }))
      : [];

    console.log(
      `📋 ${invoices.length} nota(s) fiscal(is) encontrada(s) para ${paymentId}:`,
      invoices.map((i) => `${i.id}=${i.status}`).join(', ')
    );

    return new Response(
      JSON.stringify({
        success: true,
        invoices,
      } satisfies ListInvoicesResponse),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('❌ Erro na Edge Function asaas-list-invoices:', error);

    const isAbortError = error instanceof Error && error.name === 'AbortError';

    return new Response(
      JSON.stringify({
        success: false,
        error: isAbortError
          ? 'Timeout ao comunicar com API do Asaas'
          : 'Erro interno ao listar notas fiscais',
      } satisfies ListInvoicesResponse),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
