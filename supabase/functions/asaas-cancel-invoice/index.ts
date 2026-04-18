// AI dev note: Edge Function para cancelar/excluir notas fiscais no Asaas
// Usado quando uma NFe fica em erro (ex: erro de RPS) e precisa ser reemitida.
// Estratégia:
//   1. Lista as invoices associadas ao paymentId (id_asaas do pagamento).
//   2. Para cada invoice tenta POST /invoices/{id}/cancel (nota autorizada).
//   3. Se o cancel falhar (ex: nota nunca foi autorizada fiscalmente), faz
//      DELETE /invoices/{id} como fallback (apenas remove a invoice no ASAAS).
// Retorna o total de invoices tratadas e eventuais erros individuais.
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
  status: 'cancelled' | 'deleted' | 'error';
  method?: 'cancel' | 'delete';
  error?: string;
}

interface CancelInvoiceResponse {
  success: boolean;
  results?: InvoiceResult[];
  totalProcessed?: number;
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

    // 2. Tentar cancelar (ou excluir) cada invoice
    const results: InvoiceResult[] = [];

    for (const invoice of invoices) {
      const invoiceId = invoice.id;

      // 2a. Tentar POST /cancel primeiro
      const cancelController = new AbortController();
      const cancelTimeout = setTimeout(() => cancelController.abort(), 30000);

      let cancelledOk = false;
      let cancelErrorMessage: string | undefined;

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
          cancelledOk = true;
          console.log(`✅ Invoice cancelada: ${invoiceId}`);
          results.push({
            invoiceId,
            status: 'cancelled',
            method: 'cancel',
          });
        } else {
          cancelErrorMessage =
            cancelData?.errors?.[0]?.description ||
            `HTTP ${cancelResponse.status}`;
          console.warn(
            `⚠️ Falha no cancel da invoice ${invoiceId}: ${cancelErrorMessage}. Tentando DELETE como fallback.`
          );
        }
      } catch (err) {
        clearTimeout(cancelTimeout);
        cancelErrorMessage =
          err instanceof Error ? err.message : 'Erro desconhecido no cancel';
        console.warn(
          `⚠️ Exceção no cancel da invoice ${invoiceId}: ${cancelErrorMessage}. Tentando DELETE como fallback.`
        );
      }

      if (cancelledOk) {
        continue;
      }

      // 2b. Fallback: DELETE /invoices/{id}
      const deleteController = new AbortController();
      const deleteTimeout = setTimeout(() => deleteController.abort(), 30000);

      try {
        const deleteResponse = await fetch(
          `${apiConfig.baseUrl}/invoices/${invoiceId}`,
          {
            method: 'DELETE',
            headers: baseHeaders,
            signal: deleteController.signal,
          }
        );

        clearTimeout(deleteTimeout);

        const deleteData = await deleteResponse.json().catch(() => ({}));

        if (deleteResponse.ok) {
          console.log(`🗑️ Invoice excluída: ${invoiceId}`);
          results.push({
            invoiceId,
            status: 'deleted',
            method: 'delete',
          });
        } else {
          const deleteErrorMessage =
            deleteData?.errors?.[0]?.description ||
            `HTTP ${deleteResponse.status}`;
          console.error(
            `❌ Falha no delete da invoice ${invoiceId}: ${deleteErrorMessage}`
          );
          results.push({
            invoiceId,
            status: 'error',
            error: cancelErrorMessage
              ? `cancel: ${cancelErrorMessage}; delete: ${deleteErrorMessage}`
              : `delete: ${deleteErrorMessage}`,
          });
        }
      } catch (err) {
        clearTimeout(deleteTimeout);
        const deleteErrorMessage =
          err instanceof Error ? err.message : 'Erro desconhecido no delete';
        console.error(
          `❌ Exceção no delete da invoice ${invoiceId}: ${deleteErrorMessage}`
        );
        results.push({
          invoiceId,
          status: 'error',
          error: cancelErrorMessage
            ? `cancel: ${cancelErrorMessage}; delete: ${deleteErrorMessage}`
            : `delete: ${deleteErrorMessage}`,
        });
      }
    }

    const hasError = results.some((r) => r.status === 'error');

    const response: CancelInvoiceResponse = {
      success: !hasError,
      results,
      totalProcessed: results.length,
      error: hasError
        ? 'Uma ou mais invoices não puderam ser canceladas/excluídas'
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
