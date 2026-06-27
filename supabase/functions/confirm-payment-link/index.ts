/* eslint-disable @typescript-eslint/no-explicit-any */
// AI dev note: Edge Function pública (service role) que confirma a forma de pagamento
// escolhida pelo cliente na página pública (#/pagamento/:token).
//
// Fluxo (espelha o que processPayment fazia no client, agora server-side):
//   1. Reivindica o link (pendente -> confirmado) de forma atômica (evita cobrança dupla).
//   2. Garante o cliente no Asaas (busca por CPF / cria) na conta da empresa.
//   3. Cria a cobrança: PIX (value) ou CARTÃO (à vista value, ou parcelado installmentCount+totalValue).
//   4. Cria a FATURA, vincula os agendamentos e enfileira o webhook `fatura_criada`
//      (mantém o aviso de inadimplência do n8n funcionando exatamente como hoje).
//   5. Retorna invoiceUrl (checkout hospedado, p/ cartão) e o QR PIX (p/ PIX).
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
  token: string;
  forma: 'pix' | 'credit_card';
  parcelas?: number; // nº de parcelas p/ cartão (1 = à vista)
  successUrl?: string; // URL p/ redirecionar após pagar (origin do client)
}

interface OpcaoCartao {
  parcelas: number;
  valor_parcela: number;
  total: number;
}
interface OpcoesPagamento {
  valor_base: number;
  pix: { total: number };
  cartao: OpcaoCartao[];
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Helper genérico p/ chamar a API do Asaas
async function asaasFetch(
  apiKey: string,
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(`${ASAAS_BASE_URL}${path}`, {
    method: init?.method || 'GET',
    headers: {
      access_token: apiKey,
      'Content-Type': 'application/json',
      'User-Agent': 'RespiraKids/1.0',
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, 405);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  let claimed = false;
  let token = '';

  try {
    const body: RequestBody = await req.json();
    token = body.token;
    const forma = body.forma;
    const parcelas = Math.max(1, body.parcelas || 1);

    if (!token || (forma !== 'pix' && forma !== 'credit_card')) {
      return json({ success: false, error: 'Parâmetros inválidos' }, 400);
    }

    // 1. Carregar link
    const { data: link, error: linkError } = await supabase
      .from('pagamento_links')
      .select('*')
      .eq('token', token)
      .eq('ativo', true)
      .single();

    if (linkError || !link) {
      return json({ success: false, error: 'Link não encontrado' }, 404);
    }

    // Idempotência: se já confirmado, devolve o invoiceUrl atual do Asaas
    if (link.status === 'confirmado' && link.id_asaas) {
      const apiKeyExisting = await getEmpresaApiKey(supabase, link.empresa_id);
      if (apiKeyExisting) {
        const pay = await asaasFetch(
          apiKeyExisting,
          `/payments/${link.id_asaas}`
        );
        if (pay.ok) {
          const result = await buildPaymentResult(
            apiKeyExisting,
            forma,
            pay.data
          );
          return json({ success: true, ...result, alreadyConfirmed: true });
        }
      }
      return json({ success: false, error: 'Pagamento já processado' }, 409);
    }

    if (link.status !== 'pendente') {
      return json({ success: false, error: 'Link não está disponível' }, 409);
    }
    if (link.expira_em && new Date(link.expira_em) < new Date()) {
      await supabase
        .from('pagamento_links')
        .update({ status: 'expirado', atualizado_em: new Date().toISOString() })
        .eq('id', link.id);
      return json({ success: false, error: 'Link expirado' }, 410);
    }

    // Validar forma/parcelas contra as opções calculadas (fonte da verdade)
    const opcoes = link.opcoes_snapshot as OpcoesPagamento | null;
    let chargeValue: number;
    let isParcelado = false;
    if (forma === 'pix') {
      chargeValue = opcoes?.pix?.total ?? link.valor_base;
    } else {
      const opcao = opcoes?.cartao?.find((c) => c.parcelas === parcelas);
      if (!opcao) {
        return json(
          { success: false, error: 'Opção de parcelamento indisponível' },
          400
        );
      }
      chargeValue = opcao.total;
      isParcelado = parcelas >= 2;
    }

    // 2. Reivindicar o link atomicamente (pendente -> confirmado)
    const { data: claimRow, error: claimError } = await supabase
      .from('pagamento_links')
      .update({
        status: 'confirmado',
        forma_escolhida: forma,
        installment_count: forma === 'credit_card' ? parcelas : null,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', link.id)
      .eq('status', 'pendente')
      .select('id')
      .maybeSingle();

    if (claimError || !claimRow) {
      return json(
        { success: false, error: 'Link já está sendo processado' },
        409
      );
    }
    claimed = true;

    // 3. API key da empresa
    const apiKey = await getEmpresaApiKey(supabase, link.empresa_id);
    if (!apiKey) {
      throw new Error('Empresa não possui API key do ASAAS configurada');
    }

    // 4. Garantir cliente no Asaas
    // AI dev note: O customer (= tomador da NFS-e) é o tomador_nfe_id do link quando
    // definido; senão, o responsável de cobrança (pagador). Isso permite a nota sair
    // no nome do paciente sem trocar quem paga/recebe a cobrança.
    const tomadorId = link.tomador_nfe_id || link.responsavel_cobranca_id;
    const customerId = await ensureAsaasCustomer(supabase, apiKey, tomadorId);

    // 5. Vencimento (PIX usa; cartão exige também)
    const dueDate =
      (link.vencimento as string | null) ||
      new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0];

    // 6. Criar cobrança no Asaas
    const paymentPayload: Record<string, unknown> = {
      customer: customerId,
      billingType: forma === 'pix' ? 'PIX' : 'CREDIT_CARD',
      dueDate,
      description: link.descricao || 'Cobrança Respira Kids',
      externalReference: `LINK-${String(link.id).slice(0, 8)}`,
    };
    if (forma === 'credit_card' && isParcelado) {
      paymentPayload.installmentCount = parcelas;
      paymentPayload.totalValue = chargeValue;
    } else {
      paymentPayload.value = chargeValue;
    }
    // AI dev note: O callback (auto-redirect de volta ao app após o pagamento do
    // cartão) só é aceito pelo Asaas quando a conta tem um SITE/DOMÍNIO cadastrado
    // (Minha Conta > Informações). Sem isso, o Asaas REJEITA a cobrança inteira
    // com "Não há nenhum domínio configurado em sua conta." — o que quebrava 100%
    // dos pagamentos no cartão (o PIX não envia callback, por isso funcionava).
    // Solução: enviar o callback como best-effort. Se a criação falhar e havia
    // callback, refazemos SEM o callback — a cobrança é criada normalmente,
    // perdendo-se apenas o redirecionamento automático (o cliente fica na tela de
    // confirmação do Asaas). Quando o domínio for cadastrado, o callback passa a
    // funcionar na primeira tentativa, sem alteração de código.
    const usouCallback = forma === 'credit_card' && !!body.successUrl;
    if (usouCallback) {
      paymentPayload.callback = {
        successUrl: body.successUrl,
        autoRedirect: true,
      };
    }

    let payRes = await asaasFetch(apiKey, '/payments', {
      method: 'POST',
      body: paymentPayload,
    });
    if (!payRes.ok && usouCallback) {
      console.warn(
        '⚠️ [confirm-payment-link] Falha ao criar cobrança com callback; refazendo sem callback:',
        payRes.data?.errors?.[0]?.description
      );
      delete paymentPayload.callback;
      payRes = await asaasFetch(apiKey, '/payments', {
        method: 'POST',
        body: paymentPayload,
      });
    }
    if (!payRes.ok) {
      const msg =
        payRes.data?.errors?.[0]?.description ||
        `Erro ${payRes.status} ao criar cobrança no Asaas`;
      throw new Error(msg);
    }
    const payment = payRes.data;

    // 7. Criar fatura + vincular agendamentos + enfileirar webhook
    await registrarFaturaEAgendamentos(
      supabase,
      link,
      payment,
      forma,
      parcelas
    );

    // 8. Resultado p/ a página (QR PIX ou invoiceUrl do cartão)
    const result = await buildPaymentResult(apiKey, forma, payment);
    return json({ success: true, ...result });
  } catch (error) {
    console.error('❌ [confirm-payment-link] Erro:', error);
    // Reverter a reivindicação p/ o cliente poder tentar de novo
    if (claimed && token) {
      await supabase
        .from('pagamento_links')
        .update({
          status: 'pendente',
          forma_escolhida: null,
          installment_count: null,
          atualizado_em: new Date().toISOString(),
        })
        .eq('token', token)
        .eq('status', 'confirmado');
    }
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erro inesperado',
      },
      500
    );
  }
});

// ============================================================
// Helpers
// ============================================================

async function getEmpresaApiKey(
  supabase: ReturnType<typeof createClient>,
  empresaId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('pessoa_empresas')
    .select('api_token_externo')
    .eq('id', empresaId)
    .eq('ativo', true)
    .single();
  return data?.api_token_externo || null;
}

// Busca o cliente por CPF na conta da empresa; cria se não existir.
async function ensureAsaasCustomer(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  responsavelId: string
): Promise<string> {
  const { data: resp, error } = await supabase
    .from('vw_usuarios_admin')
    .select(
      'id, nome, cpf_cnpj, email, telefone, numero_endereco, complemento_endereco, cep'
    )
    .eq('id', responsavelId)
    .single();

  if (error || !resp) {
    throw new Error('Responsável pela cobrança não encontrado');
  }
  if (!resp.cpf_cnpj) {
    throw new Error('CPF/CNPJ é obrigatório para criar cobrança no Asaas');
  }

  const cpf = String(resp.cpf_cnpj).replace(/\D/g, '');

  // Buscar existente
  const search = await asaasFetch(
    apiKey,
    `/customers?cpfCnpj=${encodeURIComponent(cpf)}&limit=1`
  );
  if (
    search.ok &&
    Array.isArray(search.data?.data) &&
    search.data.data[0]?.id
  ) {
    return search.data.data[0].id as string;
  }

  // Criar novo (com notificações nativas desabilitadas — quem avisa é o n8n)
  const created = await asaasFetch(apiKey, '/customers', {
    method: 'POST',
    body: {
      name: resp.nome,
      cpfCnpj: cpf,
      email: resp.email || undefined,
      mobilePhone: resp.telefone ? String(resp.telefone) : undefined,
      postalCode: resp.cep || undefined,
      externalReference: resp.id,
      addressNumber:
        `${resp.numero_endereco || ''} ${resp.complemento_endereco || ''}`.trim() ||
        undefined,
      notificationDisabled: true,
    },
  });
  if (!created.ok || !created.data?.id) {
    const msg =
      created.data?.errors?.[0]?.description ||
      'Falha ao criar cliente no Asaas';
    throw new Error(msg);
  }
  return created.data.id as string;
}

// Cria a fatura, vincula agendamentos, atualiza o link e enfileira o webhook n8n.
async function registrarFaturaEAgendamentos(
  supabase: ReturnType<typeof createClient>,
  link: Record<string, any>,
  payment: Record<string, any>,
  forma: 'pix' | 'credit_card',
  parcelas: number
): Promise<void> {
  // valor_total da fatura = valor efetivamente cobrado no Asaas (reconciliação)
  const valorCobrado =
    typeof payment.value === 'number'
      ? payment.value
      : typeof payment.netValue === 'number'
        ? payment.netValue
        : link.valor_base;

  const { data: fatura, error: faturaError } = await supabase
    .from('faturas')
    .insert({
      id_asaas: payment.id,
      valor_total: valorCobrado,
      // AI dev note: valor do SERVIÇO (líquido = receita). O acréscimo do cartão
      // (valor_total - valor_servico) é repasse ao cliente, não receita. PIX: igual.
      valor_servico: link.valor_base,
      descricao: link.descricao,
      empresa_id: link.empresa_id,
      responsavel_cobranca_id: link.responsavel_cobranca_id,
      // AI dev note: snapshot do tomador da NFS-e (customer usado nesta cobrança)
      tomador_nfe_id: link.tomador_nfe_id ?? link.responsavel_cobranca_id,
      paciente_id: link.paciente_id,
      vencimento: link.vencimento,
      dados_asaas: {
        ...payment,
        pagamento_link_id: link.id,
        forma_pagamento: forma,
        parcelas: forma === 'credit_card' ? parcelas : 1,
        valor_base: link.valor_base,
      },
      criado_por: link.criado_por,
    })
    .select()
    .single();

  if (faturaError || !fatura) {
    throw new Error(
      `Cobrança criada no Asaas, mas falha ao registrar fatura: ${faturaError?.message}`
    );
  }

  // Vincular agendamentos reservados pelo link
  const { data: statusCobranca } = await supabase
    .from('pagamento_status')
    .select('id')
    .eq('codigo', 'cobranca_gerada')
    .single();

  await supabase
    .from('agendamentos')
    .update({
      fatura_id: fatura.id,
      id_pagamento_externo: payment.id,
      pagamento_link_id: null,
      cobranca_gerada_em: new Date().toISOString(),
      status_pagamento_id: statusCobranca?.id ?? undefined,
    })
    .eq('pagamento_link_id', link.id);

  // Atualizar o link
  await supabase
    .from('pagamento_links')
    .update({
      fatura_id: fatura.id,
      id_asaas: payment.id,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', link.id);

  // Enfileirar webhook fatura_criada (mesmo formato de enfileirarWebhookFatura)
  await supabase.from('webhook_queue').insert({
    evento: 'fatura_criada',
    payload: {
      tipo: 'fatura_criada',
      timestamp: new Date().toISOString(),
      webhook_id: crypto.randomUUID(),
      data: {
        id: fatura.id,
        id_asaas: fatura.id_asaas,
        status: fatura.status,
        valor_total: fatura.valor_total,
        descricao: fatura.descricao,
        vencimento: fatura.vencimento,
        paciente_id: fatura.paciente_id,
        responsavel_cobranca_id: fatura.responsavel_cobranca_id,
        tomador_nfe_id: fatura.tomador_nfe_id,
        empresa_id: fatura.empresa_id,
        link_nfe: fatura.link_nfe,
        status_nfe: fatura.status_nfe,
        pago_em: fatura.pago_em,
        ativo: fatura.ativo,
        acao: 'fatura_criada',
        usuario_id: null,
        origem: 'pagamento_link',
        forma_pagamento: forma,
      },
    },
    status: 'pendente',
    tentativas: 0,
    max_tentativas: 3,
    proximo_retry: new Date().toISOString(),
  });
}

// Monta o retorno p/ a página: PIX -> QR; cartão -> invoiceUrl.
async function buildPaymentResult(
  apiKey: string,
  forma: 'pix' | 'credit_card',
  payment: Record<string, any>
): Promise<{ forma: string; invoiceUrl?: string; pix?: unknown }> {
  const invoiceUrl = payment.invoiceUrl as string | undefined;
  if (forma === 'pix') {
    const qr = await asaasFetch(apiKey, `/payments/${payment.id}/pixQrCode`);
    return {
      forma,
      invoiceUrl,
      pix: qr.ok
        ? {
            encodedImage: qr.data?.encodedImage,
            payload: qr.data?.payload,
            expirationDate: qr.data?.expirationDate,
          }
        : undefined,
    };
  }
  return { forma, invoiceUrl };
}
