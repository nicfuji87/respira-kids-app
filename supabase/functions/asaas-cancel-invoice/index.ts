// AI dev note: Edge Function para cancelar notas fiscais no Asaas.
// Só faz sentido para nota que virou documento fiscal (AUTHORIZED): o cancelamento
// é pedido à prefeitura. Nota em SCHEDULED/ERROR NÃO se cancela e NÃO se exclui
// — a API do Asaas não tem DELETE /invoices/{id} — ela se corrige via
// PUT /invoices/{id} (asaas-update-invoice) e se reautoriza.
// Estratégia:
//   1. Lista as invoices associadas ao paymentId (id_asaas do pagamento).
//   2. Ignora as que já estão canceladas ou em cancelamento.
//   3. Chama POST /invoices/{id}/cancel nas demais e devolve o motivo REAL
//      de cada falha — a mensagem da prefeitura é o que explica o problema.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

interface CancelInvoiceRequest {
  apiConfig: {
    apiKey: string;
    isGlobal: boolean;
    baseUrl: string;
  };
  paymentId: string;
}

interface InvoiceResult {
  invoiceId: string;
  status: 'cancelled' | 'skipped' | 'error';
  previousStatus?: string;
  error?: string;
}

interface CancelInvoiceResponse {
  success: boolean;
  results?: InvoiceResult[];
  totalProcessed?: number;
  error?: string;
}

// Notas nesses status não precisam (nem aceitam) nova tentativa de cancelamento.
const ALREADY_DONE_STATUSES = ['CANCELED', 'PROCESSING_CANCELLATION'];

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

    const { apiConfig, paymentId }: CancelInvoiceRequest = await req.json();

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

    const baseHeaders = {
      access_token: apiConfig.apiKey,
      'Content-Type': 'application/json',
      'User-Agent': 'RespiraKids/1.0',
    };

    console.log('🔍 Listando invoices do payment:', paymentId);

    // 1. Listar invoices do payment
    const listController = new AbortController();
    const listTimeout = setTimeout(() => listController.abort(), 30000);

    const listResponse = await fetch(
      `${apiConfig.baseUrl}/invoices?payment=${encodeURIComponent(paymentId)}`,
      {
        method: 'GET',
        headers: baseHeaders,
        signal: listController.signal,
      }
    );

    clearTimeout(listTimeout);

    const listData = await listResponse.json();

    if (!listResponse.ok) {
      const errorMessage =
        listData?.errors?.[0]?.description ||
        `Erro ${listResponse.status} ao listar invoices do payment`;
      console.error('❌ Erro ao listar invoices:', errorMessage);
      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage,
        } satisfies CancelInvoiceResponse),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const invoices: Array<{ id: string; status?: string }> = Array.isArray(
      listData?.data
    )
      ? listData.data
      : [];

    console.log(
      `📋 ${invoices.length} invoice(s) encontrada(s) para o payment`
    );

    if (invoices.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          results: [],
          totalProcessed: 0,
        } satisfies CancelInvoiceResponse),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 2. Cancelar cada invoice que ainda não está cancelada
    const results: InvoiceResult[] = [];

    for (const invoice of invoices) {
      const invoiceId = invoice.id;
      const previousStatus = invoice.status || 'UNKNOWN';

      if (ALREADY_DONE_STATUSES.includes(previousStatus)) {
        console.log(
          `⏭️ Invoice ${invoiceId} já está em ${previousStatus}, nada a cancelar`
        );
        results.push({ invoiceId, status: 'skipped', previousStatus });
        continue;
      }

      const cancelController = new AbortController();
      const cancelTimeout = setTimeout(() => cancelController.abort(), 30000);

      try {
        const cancelResponse = await fetch(
          `${apiConfig.baseUrl}/invoices/${invoiceId}/cancel`,
          {
            method: 'POST',
            headers: baseHeaders,
            signal: cancelController.signal,
          }
        );

        clearTimeout(cancelTimeout);

        const cancelData = await cancelResponse.json().catch(() => ({}));

        if (cancelResponse.ok) {
          console.log(`✅ Invoice cancelada: ${invoiceId}`);
          results.push({ invoiceId, status: 'cancelled', previousStatus });
        } else {
          const errorMessage =
            cancelData?.errors?.[0]?.description ||
            `HTTP ${cancelResponse.status}`;
          console.error(
            `❌ Falha ao cancelar invoice ${invoiceId} (${previousStatus}): ${errorMessage}`
          );
          results.push({
            invoiceId,
            status: 'error',
            previousStatus,
            error: errorMessage,
          });
        }
      } catch (err) {
        clearTimeout(cancelTimeout);
        const errorMessage =
          err instanceof Error ? err.message : 'Erro desconhecido no cancel';
        console.error(
          `❌ Exceção ao cancelar invoice ${invoiceId}: ${errorMessage}`
        );
        results.push({
          invoiceId,
          status: 'error',
          previousStatus,
          error: errorMessage,
        });
      }
    }

    const failures = results.filter((r) => r.status === 'error');

    // AI dev note: o motivo real (mensagem da prefeitura / do Asaas) vai no `error`.
    // A mensagem genérica anterior escondia a causa e travava o diagnóstico.
    const response: CancelInvoiceResponse = {
      success: failures.length === 0,
      results,
      totalProcessed: results.length,
      error: failures.length
        ? failures
            .map((f) => `${f.invoiceId} (${f.previousStatus}): ${f.error}`)
            .join(' | ')
        : undefined,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('❌ Erro na Edge Function asaas-cancel-invoice:', error);

    const isAbortError = error instanceof Error && error.name === 'AbortError';

    const response: CancelInvoiceResponse = {
      success: false,
      error: isAbortError
        ? 'Timeout ao comunicar com API do Asaas'
        : 'Erro interno ao cancelar nota fiscal',
    };

    return new Response(JSON.stringify(response), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
