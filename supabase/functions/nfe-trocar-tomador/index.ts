// AI dev note: troca o nome (tomador) de uma NFS-e já autorizada (07/11/2026,
// caso Matheus/Ivi: a mãe pediu a nota no nome do filho para o reembolso).
// O Asaas não deixa trocar o customer de uma cobrança, e a nota ligada à
// cobrança sai sempre no nome do customer. Então: cancela a nota da cobrança e
// emite uma nota AVULSA (sem `payment`) para o customer do novo tomador, com o
// mesmo valor, descrição e tributos. Só aceita a service_role (Ju/n8n, admin).
//
// Entrada: { faturaId, tomadorId, dryRun? }. O tomador precisa ter CPF/CNPJ no
// cadastro; e-mail e celular, se faltarem, vêm do responsável financeiro.
// Webhook do Asaas não acha nota avulsa pela cobrança: o link vem por
// `acao: 'sincronizar'` ({ faturaId, acao:'sincronizar' }), que consulta a nota
// avulsa e grava link_nfe quando autorizada.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ASAAS_URL = 'https://api.asaas.com/v3';

// Mesmas constantes de nfe-emitir-fatura / faturas-api.ts.
const IBS_CBS_SERVICOS_SAUDE = {
  nbsCode: '1.2301.92.00',
  taxSituationCode: '200',
  taxClassificationCode: '200029',
  operationIndicatorCode: '030101',
};
const PIS_COFINS_LUCRO_PRESUMIDO = {
  pisCofinsTaxStatus: 'STANDARD_TAXABLE_OPERATION',
  operationPis: 0.65,
  operationCofins: 3,
};
const SERVICO_PORTAL_NACIONAL = { federalServiceTaxCode: '040801' };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const hojeBRT = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    new Date()
  );

// pessoas.telefone é JID (55 + DDD + número); o Asaas quer DDD + número.
function celularAsaas(tel?: string | null): string | undefined {
  let d = String(tel ?? '').replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.length === 10) d = d.slice(0, 2) + '9' + d.slice(2);
  return d.length === 11 ? d : undefined;
}

async function asaas(
  apiKey: string,
  method: string,
  path: string,
  body?: unknown
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
  if (!serviceKey || req.headers.get('Authorization') !== `Bearer ${serviceKey}`)
    return json({ success: false, error: 'Não autorizado' }, 401);

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);
  const { faturaId, tomadorId, dryRun, acao, enviar } = await req
    .json()
    .catch(() => ({}));
  if (!faturaId)
    return json({ success: false, error: 'faturaId é obrigatório' }, 400);

  const { data: fatura } = await supabase
    .from('faturas')
    .select(
      'id, status, id_asaas, valor_total, descricao, empresa_id, dados_asaas, responsavel_cobranca_id, tomador_nfe_id, link_nfe'
    )
    .eq('id', faturaId)
    .single();
  if (!fatura)
    return json({ success: false, error: 'Fatura não encontrada' }, 404);

  const { data: empresa } = await supabase
    .from('pessoa_empresas')
    .select('api_token_externo, regime_tributario')
    .eq('id', fatura.empresa_id)
    .eq('ativo', true)
    .single();
  if (!empresa?.api_token_externo)
    return json({ success: false, error: 'Empresa sem API key do Asaas' });
  const apiKey = empresa.api_token_externo as string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dados = (fatura.dados_asaas ?? {}) as Record<string, any>;

  // Só busca o link da nota avulsa já emitida
  if (acao === 'sincronizar') {
    const id = dados.nfe_avulsa_id as string | undefined;
    if (!id) return json({ success: false, error: 'Fatura sem nota avulsa' });
    const inv = await asaas(apiKey, 'GET', `/invoices/${id}`);
    if (!inv.ok) return json({ success: false, error: inv.error });
    const st = inv.data?.status as string;
    if (st === 'AUTHORIZED' && inv.data?.pdfUrl) {
      const primeiraVez = !dados.nfe_avulsa_enviada_em;
      await supabase
        .from('faturas')
        .update({
          link_nfe: inv.data.pdfUrl,
          status_nfe: null,
          dados_asaas: enviar && primeiraVez
            ? { ...dados, nfe_avulsa_enviada_em: new Date().toISOString() }
            : dados,
        })
        .eq('id', faturaId);
      await supabase
        .from('agendamentos')
        .update({ link_nfe: inv.data.pdfUrl })
        .eq('fatura_id', faturaId);
      // Nota avulsa não passa pelo fluxo do webhook: manda o PDF à família aqui, uma vez.
      if (primeiraVez && enviar) {
        const { data: pag } = await supabase
          .from('pessoas')
          .select('nome, telefone')
          .eq('id', fatura.responsavel_cobranca_id)
          .single();
        const { data: tom } = await supabase
          .from('pessoas')
          .select('nome')
          .eq('id', fatura.tomador_nfe_id)
          .single();
        const tel = String(pag?.telefone ?? '').replace(/\D/g, '');
        const { data: cred } = await supabase.rpc('fn_whatsapp_conexoes_credenciais');
        const token = (cred as Record<string, string> | null)?.whatsapp_uazapi_token;
        if (tel.length >= 12 && token) {
          const chat = `${tel}@s.whatsapp.net`;
          const nomeTom = String(tom?.nome ?? '').split(' ')[0];
          const texto = `Segue a nota fiscal${nomeTom ? ' no nome de ' + nomeTom : ''}! A anterior foi cancelada.`;
          await fetch('https://infuse.uazapi.com/send/media', {
            method: 'POST',
            headers: { token, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
              number: chat,
              type: 'document',
              file: inv.data.pdfUrl,
              docName: `NFS-e ${inv.data?.number ?? ''}.pdf`.replace(' .pdf', '.pdf'),
              text: '*Ju:*\n' + texto,
            }),
            signal: AbortSignal.timeout(30000),
          }).catch(() => null);
          const { data: conv } = await supabase
            .from('ju_conversas')
            .select('id')
            .eq('wa_chatid', chat)
            .maybeSingle();
          if (conv?.id)
            await supabase.rpc('fn_ju_marcar_envio', { p_conversa_id: conv.id, p_texto: texto });
        }
      }
    } else if (st === 'ERROR') {
      const motivo = String(inv.data?.statusDescription ?? 'Erro na nota avulsa').slice(0, 300);
      await supabase
        .from('faturas')
        .update({ link_nfe: 'erro', status_nfe: motivo })
        .eq('id', faturaId);
      // A prefeitura recusou a nota nova (a antiga já foi cancelada): avisa a equipe uma vez.
      if (fatura.link_nfe !== 'erro')
        await supabase.rpc('fn_nfe_aviso_notificacoes', {
          p_texto: `⚠️ *Nota reemitida foi recusada pela prefeitura*\nFatura de R$ ${fatura.valor_total} (troca de nome na nota). Motivo: ${motivo}\nA nota antiga já foi cancelada: corrigir e reemitir pelo app.`,
        });
    }
    return json({
      success: true,
      status: st,
      numero: inv.data?.number ?? null,
      pdfUrl: inv.data?.pdfUrl ?? null,
      erro: inv.data?.statusDescription ?? null,
    });
  }

  if (!tomadorId)
    return json({ success: false, error: 'tomadorId é obrigatório' }, 400);
  if (fatura.status !== 'pago')
    return json({ success: false, error: 'Só fatura paga tem nota' }, 409);
  if (!fatura.id_asaas)
    return json({ success: false, error: 'Fatura sem cobrança no Asaas' }, 409);

  const { data: tomador } = await supabase
    .from('pessoas')
    .select('id, nome, cpf_cnpj, email, telefone, numero_endereco, complemento_endereco, enderecos:id_endereco(cep, logradouro, bairro)')
    .eq('id', tomadorId)
    .single();
  const doc = String(tomador?.cpf_cnpj ?? '').replace(/\D/g, '');
  if (!tomador || (doc.length !== 11 && doc.length !== 14))
    return json({ success: false, error: 'Tomador sem CPF/CNPJ no cadastro' });
  const { data: pagador } = await supabase
    .from('pessoas')
    .select('email, telefone, numero_endereco, complemento_endereco, enderecos:id_endereco(cep, logradouro, bairro)')
    .eq('id', fatura.responsavel_cobranca_id)
    .single();

  // Nota da cobrança
  const lista = await asaas(
    apiKey,
    'GET',
    `/invoices?payment=${encodeURIComponent(fatura.id_asaas)}`
  );
  if (!lista.ok) return json({ success: false, error: lista.error });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notas: any[] = Array.isArray(lista.data?.data) ? lista.data.data : [];
  let autorizada = notas.find((i) => i.status === 'AUTHORIZED');
  // Já trocada antes: a nota que vale é a avulsa
  if (!autorizada && dados.nfe_avulsa_id) {
    const av = await asaas(apiKey, 'GET', `/invoices/${dados.nfe_avulsa_id}`);
    if (av.ok && av.data?.status === 'AUTHORIZED') autorizada = av.data;
  }

  // Customer do novo tomador (acha pelo CPF/CNPJ; cria se não existir)
  const busca = await asaas(apiKey, 'GET', `/customers?cpfCnpj=${doc}`);
  if (!busca.ok) return json({ success: false, error: busca.error });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let customer = (busca.data?.data ?? []).find((c: any) => !c.deleted);
  if (autorizada && customer && autorizada.customer === customer.id)
    return json({ success: false, error: 'A nota já está no nome desse tomador' });

  const plano = {
    notaAtual: autorizada
      ? { id: autorizada.id, numero: autorizada.number, valor: autorizada.value }
      : null,
    tomador: tomador.nome,
    customerExiste: !!customer,
    valor: fatura.valor_total,
  };
  if (dryRun) return json({ success: true, dryRun: true, plano });

  // A prefeitura exige endereço com CEP no tomador: usa o do cadastro dele (ou do pagador).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const endDe = (p: any) => {
    const e = Array.isArray(p?.enderecos) ? p.enderecos[0] : p?.enderecos;
    return e?.cep
      ? {
          postalCode: String(e.cep).replace(/\D/g, ''),
          address: e.logradouro || undefined,
          addressNumber: p.numero_endereco || 'S/N',
          complement: p.complemento_endereco || undefined,
          province: e.bairro || undefined,
        }
      : null;
  };
  const endereco = endDe(tomador) ?? endDe(pagador);
  if (!customer) {
    const novo = await asaas(apiKey, 'POST', '/customers', {
      name: tomador.nome,
      cpfCnpj: doc,
      email: tomador.email || pagador?.email || undefined,
      mobilePhone: celularAsaas(tomador.telefone) ?? celularAsaas(pagador?.telefone),
      externalReference: tomador.id,
      notificationDisabled: true,
      ...(endereco ?? {}),
    });
    if (!novo.ok) return json({ success: false, error: novo.error, etapa: 'customer' });
    customer = novo.data;
  } else if (!customer.postalCode && endereco) {
    await asaas(apiKey, 'POST', `/customers/${customer.id}`, endereco);
  }

  const parcelas =
    dados.forma_pagamento === 'credit_card' ? Number(dados.parcelas) || 1 : 1;
  const payload = {
    customer: customer.id,
    serviceDescription: fatura.descricao || 'Serviços de fisioterapia',
    observations:
      parcelas >= 2
        ? `Pagamento realizado no cartão de crédito, parcelado em ${parcelas}x.`
        : '',
    value: fatura.valor_total,
    deductions: 0,
    effectiveDate: hojeBRT(),
    municipalServiceId: '290448',
    municipalServiceName: 'Terapia ocupacional, fisioterapia e fonoaudiologia.',
    externalReference: `FATURA-${fatura.id}`,
    taxes: {
      retainIss: false,
      iss: 2,
      cofins: 0,
      csll: 0,
      inss: 0,
      ir: 0,
      pis: 0,
      ...(empresa.regime_tributario === 'simples_nacional'
        ? SERVICO_PORTAL_NACIONAL
        : { ...IBS_CBS_SERVICOS_SAUDE, ...PIS_COFINS_LUCRO_PRESUMIDO }),
    },
  };

  // Agenda e autoriza a nova ANTES de cancelar a antiga: se a nova for recusada, a antiga fica.
  const nova = await asaas(apiKey, 'POST', '/invoices', payload);
  if (!nova.ok) return json({ success: false, error: nova.error, etapa: 'agendar' });
  const novaId = String(nova.data.id);
  const autz = await asaas(apiKey, 'POST', `/invoices/${novaId}/authorize`);
  if (!autz.ok)
    return json({ success: false, error: autz.error, etapa: 'autorizar', novaId, cancelada: null });

  let cancelada: string | null = null;
  if (autorizada) {
    const c = await asaas(apiKey, 'POST', `/invoices/${autorizada.id}/cancel`);
    if (!c.ok)
      return json({ success: false, error: c.error, etapa: 'cancelar', novaId });
    cancelada = autorizada.id;
  }

  await supabase
    .from('faturas')
    .update({
      tomador_nfe_id: tomador.id,
      link_nfe: 'sincronizando',
      status_nfe: `Reemitida no nome de ${tomador.nome} - aguardando link`,
      dados_asaas: {
        ...dados,
        nfe_avulsa_id: novaId,
        nfe_avulsa_enviada_em: null,
        nfe_cancelada_id: cancelada,
        nfe_tomador_trocado_em: new Date().toISOString(),
      },
    })
    .eq('id', faturaId);

  return json({ success: true, novaId, cancelada, plano });
});
