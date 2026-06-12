// AI dev note: Edge Function que simula as taxas reais de cartão no Asaas da empresa
// (POST /v3/payments/simulate). Usada na GERAÇÃO do link para que os valores exibidos
// ao cliente reflitam as taxas vigentes da conta Asaas (MDR + tarifa fixa), em vez de
// depender só da tabela estática. A API key é lida server-side (nunca vai ao client).
//
// Request:  { empresaId, value, installmentCounts: number[] }  // ex.: [1, 2] (faixas)
// Response: { success, results: [{ installmentCount, feePercentage, operationFee }], pix?, error? }
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ASAAS_BASE_URL = 'https://api.asaas.com/v3';

interface RequestBody {
  empresaId: string;
  value: number;
  installmentCounts: number[];
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, 405);
  }

  try {
    const { empresaId, value, installmentCounts }: RequestBody =
      await req.json();

    if (!empresaId || !(value > 0)) {
      return json({ success: false, error: 'Parâmetros inválidos' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: empresa } = await supabase
      .from('pessoa_empresas')
      .select('api_token_externo')
      .eq('id', empresaId)
      .eq('ativo', true)
      .single();

    const apiKey = empresa?.api_token_externo;
    if (!apiKey) {
      return json(
        { success: false, error: 'Empresa sem API key do ASAAS' },
        400
      );
    }

    const counts =
      Array.isArray(installmentCounts) && installmentCounts.length > 0
        ? installmentCounts
        : [1];

    const results: Array<{
      installmentCount: number;
      feePercentage: number | null;
      operationFee: number | null;
    }> = [];
    let pix: { feeValue?: number; feePercentage?: number | null } | undefined;

    for (const n of counts) {
      const payload: Record<string, unknown> = {
        value,
        billingTypes: ['CREDIT_CARD', 'PIX'],
      };
      if (n > 1) payload.installmentCount = n;

      const res = await fetch(`${ASAAS_BASE_URL}/payments/simulate`, {
        method: 'POST',
        headers: {
          access_token: apiKey,
          'Content-Type': 'application/json',
          'User-Agent': 'RespiraKids/1.0',
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.warn(
          `Simulate falhou (n=${n}):`,
          data?.errors?.[0]?.description || res.status
        );
        continue;
      }

      results.push({
        installmentCount: n,
        feePercentage: data?.creditCard?.feePercentage ?? null,
        operationFee: data?.creditCard?.operationFee ?? null,
      });

      if (!pix && data?.pix) {
        pix = {
          feeValue: data.pix.feeValue ?? undefined,
          feePercentage: data.pix.feePercentage ?? null,
        };
      }
    }

    return json({ success: true, results, pix });
  } catch (error) {
    console.error('Erro em asaas-simulate-payment:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erro inesperado',
      },
      500
    );
  }
});
