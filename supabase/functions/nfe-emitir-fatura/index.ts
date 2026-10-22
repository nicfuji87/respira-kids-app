// AI dev note: Emite (ou corrige e reemite) a NFS-e de uma fatura paga, no
// servidor. É a mesma lógica de emitirNfeFatura (src/lib/faturas-api.ts), que
// roda no navegador atrás do botão "Emitir NFe" / "Corrigir e reemitir NFe".
// Existe para a Ju (n8n), que não tem sessão de usuário: só aceita a
// service_role e lê a chave do Asaas aqui dentro, sem expô-la ao n8n.
// Mudou a regra da emissão lá? Mude aqui também.
//
// Fluxo: lista as notas do payment no Asaas -> nota já emitida: não mexe;
// SCHEDULED/ERROR: corrige (PUT) e reautoriza; nenhuma: agenda e autoriza.
// A autorização é assíncrona (prefeitura); o webhook do Asaas grava o link.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ASAAS_URL = 'https://api.asaas.com/v3';

// Grupo IBSCBS (Reforma Tributária) — mesmos códigos de faturas-api.ts.
// Só para empresa do Regime Normal; Simples Nacional não envia.
const IBS_CBS_SERVICOS_SAUDE = {
  nbsCode: '1.2301.92.00',
  taxSituationCode: '200',
  taxClassificationCode: '200029',
  operationIndicatorCode: '030101',
};

// PIS/COFINS da NT-007 — mesma constante de faturas-api.ts. Obrigatório no
// Regime Normal desde 21/10/2026; CST 01 com as alíquotas do Lucro Presumido.
const PIS_COFINS_LUCRO_PRESUMIDO = {
  pisCofinsTaxStatus: 'STANDARD_TAXABLE_OPERATION',
  operationPis: 0.65,
  operationCofins: 3,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// Data de emissão no fuso de Brasília (toISOString vira o dia às 21h).
const hojeBRT = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    new Date()
  );

async function asaas(
  apiKey: string,
  method: string,
  path: string,
  body?: unknown
  // resposta livre da API do Asaas (mesmo contrato do emitirNfeFatura do app)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ ok: boolean; data: any; error?: string }> {
  const res = await fetch(`${ASAAS_URL}${path}`, {
    method,
    headers: {
      access_token: apiKey,
      'Content-Type': 'application/json',
      'User-Agent': 'RespiraKids/1.0',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, data };
  return {
    ok: false,
    data,
    error:
      data?.errors?.[0]?.description ||
      `Erro ${res.status} no Asaas (${method} ${path.split('?')[0]})`,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST')
    return json({ success: false, error: 'Use POST' }, 405);

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const auth = req.headers.get('Authorization') ?? '';
  if (!serviceKey || auth !== `Bearer ${serviceKey}`) {
    return json({ success: false, error: 'Não autorizado' }, 401);
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);
  const { faturaId } = await req.json().catch(() => ({}));
  if (!faturaId)
    return json({ success: false, error: 'faturaId é obrigatório' }, 400);

  const { data: fatura, error: faturaError } = await supabase
    .from('faturas')
    .select(
      'id, status, id_asaas, valor_total, descricao, empresa_id, link_nfe, dados_asaas'
    )
    .eq('id', faturaId)
    .single();
  if (faturaError || !fatura) {
    return json({ success: false, error: 'Fatura não encontrada' }, 404);
  }
  if (fatura.status !== 'pago') {
    return json(
      { success: false, error: 'Apenas faturas pagas podem ter NFe emitida' },
      409
    );
  }
  if (fatura.link_nfe && fatura.link_nfe !== 'erro') {
    return json(
      {
        success: false,
        error: 'Fatura já possui NFe ou está em processamento',
      },
      409
    );
  }
  if (!fatura.id_asaas) {
    return json({ success: false, error: 'Fatura sem cobrança no Asaas' }, 409);
  }

  const marcar = (link_nfe: string, status_nfe: string | null) =>
    supabase
      .from('faturas')
      .update({ link_nfe, status_nfe, atualizado_por: null })
      .eq('id', faturaId);

  const { data: empresa } = await supabase
    .from('pessoa_empresas')
    .select('api_token_externo, regime_tributario')
    .eq('id', fatura.empresa_id)
    .eq('ativo', true)
    .single();
  if (!empresa?.api_token_externo) {
    await marcar('erro', 'Empresa sem API key configurada');
    return json({
      success: false,
      error: 'Empresa não possui API key do Asaas configurada',
    });
  }
  const apiKey = empresa.api_token_externo as string;

  await marcar('sincronizando', null);

  try {
    // Cartão parcelado: uma nota só, com o valor TOTAL; parcelamento nas observações.
    const dadosAsaas = fatura.dados_asaas as {
      parcelas?: number;
      forma_pagamento?: string;
    } | null;
    const parcelas =
      dadosAsaas?.forma_pagamento === 'credit_card'
        ? Number(dadosAsaas.parcelas) || 1
        : 1;

    // `taxes` vai COMPLETO: o Asaas trata o objeto como substituição.
    const invoicePayload = {
      serviceDescription: fatura.descricao || 'Serviços de fisioterapia',
      observations:
        parcelas >= 2
          ? `Pagamento realizado no cartão de crédito, parcelado em ${parcelas}x.`
          : '',
      value: fatura.valor_total,
      deductions: 0,
      effectiveDate: hojeBRT(),
      municipalServiceId: '290448',
      municipalServiceName:
        'Terapia ocupacional, fisioterapia e fonoaudiologia.',
      updatePayment: false,
      taxes: {
        retainIss: false,
        iss: 2,
        cofins: 0,
        csll: 0,
        inss: 0,
        ir: 0,
        pis: 0,
        ...(empresa.regime_tributario === 'simples_nacional'
          ? {}
          : { ...IBS_CBS_SERVICOS_SAUDE, ...PIS_COFINS_LUCRO_PRESUMIDO }),
      },
    };

    const lista = await asaas(
      apiKey,
      'GET',
      `/invoices?payment=${encodeURIComponent(fatura.id_asaas)}`
    );
    if (!lista.ok) throw new Error(lista.error);
    const existentes: { id: string; status: string }[] = Array.isArray(
      lista.data?.data
    )
      ? lista.data.data
      : [];

    const jaEmitida = existentes.find((i) =>
      [
        'AUTHORIZED',
        'SYNCHRONIZED',
        'PROCESSING_CANCELLATION',
        'CANCELLATION_DENIED',
      ].includes(i.status)
    );
    if (jaEmitida) {
      await marcar(
        'sincronizando',
        `Nota ${jaEmitida.status} no ASAAS - aguardando link`
      );
      return json({
        success: false,
        jaEmitida: true,
        error:
          'Esta cobrança já possui nota fiscal no Asaas. Aguarde a sincronização do link.',
      });
    }

    // Asaas não tem DELETE de invoice e recusa um 2º agendamento: SCHEDULED/ERROR se corrige.
    const reaproveitavel = existentes.find((i) =>
      ['SCHEDULED', 'ERROR'].includes(i.status)
    );
    let invoiceId: string;
    if (reaproveitavel) {
      const upd = await asaas(
        apiKey,
        'PUT',
        `/invoices/${reaproveitavel.id}`,
        invoicePayload
      );
      if (!upd.ok) throw new Error(upd.error);
      invoiceId = reaproveitavel.id;
    } else {
      const sch = await asaas(apiKey, 'POST', '/invoices', {
        ...invoicePayload,
        payment: fatura.id_asaas,
      });
      if (!sch.ok) throw new Error(sch.error);
      invoiceId = String(sch.data.id);
    }

    const autz = await asaas(
      apiKey,
      'POST',
      `/invoices/${invoiceId}/authorize`
    );
    if (!autz.ok) throw new Error(autz.error);

    await marcar('sincronizando', 'Emitida com sucesso - aguardando link');
    return json({ success: true, invoiceId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido na emissão';
    await marcar('erro', msg);
    return json({ success: false, error: msg });
  }
});
