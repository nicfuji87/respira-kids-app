// AI dev note: Confere o status REAL de uma cobrança no Asaas antes da secretária
// cobrar o cliente pelo WhatsApp (tela /cobrancas).
//
// Por que não reusar `asaas-get-payment`: aquela função recebe `apiConfig` do
// frontend, ou seja, o browser precisa ter lido `pessoa_empresas.api_token_externo`.
// Isso é aceitável dentro do /financeiro (admin, atrás de PIN), mas a tela de
// cobranças é da secretaria — não vale expor um token que movimenta dinheiro
// para mais um perfil. Aqui o token é resolvido no servidor, com service_role,
// e nunca sai daqui.
//
// Escopo deliberadamente estreito: atualiza status/pago_em/vencimento e mais nada.
// Cancelamento no Asaas (404) tem cascata (desvincular consultas) que pertence ao
// "Ajuste manual" do Financeiro — aqui só sinalizamos com `requerAjusteManual`.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ASAAS_BASE_URL = 'https://api.asaas.com/v3';

type StatusFatura =
  | 'pago'
  | 'pendente'
  | 'atrasado'
  | 'cancelado'
  | 'estornado';

// Espelha mapAsaasStatusToFatura() de src/lib/faturas-api.ts
function mapAsaasStatus(asaasStatus?: string, deleted?: boolean): StatusFatura {
  if (deleted) return 'cancelado';
  switch ((asaasStatus || '').toUpperCase()) {
    case 'RECEIVED':
    case 'CONFIRMED':
    case 'RECEIVED_IN_CASH':
      return 'pago';
    case 'OVERDUE':
      return 'atrasado';
    case 'REFUNDED':
    case 'REFUND_REQUESTED':
    case 'REFUND_IN_PROGRESS':
    case 'CHARGEBACK_REQUESTED':
    case 'CHARGEBACK_DISPUTE':
    case 'AWAITING_CHARGEBACK_REVERSAL':
      return 'estornado';
    case 'PENDING':
    case 'AWAITING_RISK_ANALYSIS':
    default:
      return 'pendente';
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, 405);
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // --- Autorização: só admin ou secretaria ---
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    if (!jwt) {
      return json({ success: false, error: 'Não autenticado' }, 401);
    }

    const { data: userData } = await supabase.auth.getUser(jwt);
    if (!userData?.user) {
      return json({ success: false, error: 'Sessão inválida' }, 401);
    }

    const { data: pessoa } = await supabase
      .from('pessoas')
      .select('role')
      .eq('auth_user_id', userData.user.id)
      .maybeSingle();

    if (!pessoa || !['admin', 'secretaria'].includes(pessoa.role)) {
      return json({ success: false, error: 'Sem permissão' }, 403);
    }

    const { faturaId } = await req.json();
    if (!faturaId) {
      return json({ success: false, error: 'faturaId é obrigatório' }, 400);
    }

    // --- Fatura + token da empresa emissora ---
    const { data: fatura, error: faturaError } = await supabase
      .from('faturas')
      .select('id, id_asaas, empresa_id, status, pago_em')
      .eq('id', faturaId)
      .maybeSingle();

    if (faturaError || !fatura) {
      return json({ success: false, error: 'Fatura não encontrada' }, 404);
    }

    if (!fatura.id_asaas) {
      return json({
        success: false,
        error: 'Cobrança ainda não existe no Asaas',
      });
    }

    const { data: empresa } = await supabase
      .from('pessoa_empresas')
      .select('api_token_externo')
      .eq('id', fatura.empresa_id)
      .eq('ativo', true)
      .maybeSingle();

    if (!empresa?.api_token_externo) {
      return json({
        success: false,
        error: 'Empresa emissora sem token do Asaas configurado',
      });
    }

    // --- Consulta no Asaas ---
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    let asaasResponse: Response;
    try {
      asaasResponse = await fetch(
        `${ASAAS_BASE_URL}/payments/${fatura.id_asaas}`,
        {
          method: 'GET',
          headers: {
            access_token: empresa.api_token_externo,
            'Content-Type': 'application/json',
            'User-Agent': 'RespiraKids/1.0',
          },
          signal: controller.signal,
        }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    // 404 = cobrança excluída no Asaas. A baixa completa (desvincular consultas)
    // é do "Ajuste manual" no Financeiro — não fazemos cascata aqui.
    if (asaasResponse.status === 404) {
      return json({
        success: true,
        statusAnterior: fatura.status,
        status: 'cancelado',
        mudou: true,
        atualizado: false,
        requerAjusteManual: true,
      });
    }

    const payment = await asaasResponse.json().catch(() => ({}));

    if (!asaasResponse.ok) {
      const errorMessage =
        payment?.errors?.length > 0
          ? payment.errors[0].description
          : `Erro ${asaasResponse.status} ao consultar cobrança no Asaas`;
      return json({ success: false, error: errorMessage });
    }

    const novoStatus = mapAsaasStatus(payment.status, payment.deleted);
    const mudou = novoStatus !== fatura.status;

    // Cancelado tem cascata; deixamos para o Ajuste manual do Financeiro.
    const podeAtualizar = mudou && novoStatus !== 'cancelado';

    if (podeAtualizar) {
      const updateData: Record<string, unknown> = { status: novoStatus };
      if (payment.dueDate) updateData.vencimento = payment.dueDate;
      if (novoStatus === 'pago') {
        updateData.pago_em =
          payment.paymentDate ||
          payment.clientPaymentDate ||
          payment.confirmedDate ||
          new Date().toISOString();
      }

      const { error: updateError } = await supabase
        .from('faturas')
        .update(updateData)
        .eq('id', faturaId);

      if (updateError) {
        console.error('❌ Erro ao atualizar fatura:', updateError);
        return json({
          success: false,
          error: `Erro ao atualizar fatura: ${updateError.message}`,
        });
      }
    }

    return json({
      success: true,
      statusAnterior: fatura.status,
      status: novoStatus,
      mudou,
      atualizado: podeAtualizar,
      requerAjusteManual: mudou && novoStatus === 'cancelado',
      asaasStatus: payment.status ?? null,
    });
  } catch (error) {
    console.error('❌ Erro na Edge Function cobranca-status-check:', error);
    const isAbort = error instanceof Error && error.name === 'AbortError';
    return json(
      {
        success: false,
        error: isAbort
          ? 'Timeout ao comunicar com a API do Asaas'
          : 'Erro interno ao consultar cobrança',
      },
      500
    );
  }
});
