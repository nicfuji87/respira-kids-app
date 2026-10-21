// AI dev note: Boletos que chegam por e-mail → conta a pagar + pedido de pagamento.
//
// Quem chama: pg_cron (header x-cron-token, conferido contra o Vault) a cada 15 min em
// horário comercial, ou um admin logado ("Ler agora" na tela de Integrações).
//
// O que faz, por caixa conectada (email_caixas, OAuth do Google com gmail.readonly):
//   1. busca no Gmail SÓ mensagens com PDF vindas dos remetentes cadastrados
//      (email_boleto_remetentes) — o resto da caixa nunca é lido;
//   2. acha a linha digitável no PDF (valor, vencimento e banco saem do código,
//      conferido pelos DVs — ver _shared/boleto.ts). PDF escaneado sem texto vai para
//      a IA, mas a linha que ela devolve passa pela MESMA conferência;
//   3. guarda o PDF no Storage e chama fn_boleto_registrar_email, que preenche a conta
//      fixa do mês (ou cria a conta), confere contra golpe e abre o pedido de pagamento.
// O aviso com o link sai no grupo pelo fluxo de avisos do Pix (n8n). Esta função NÃO
// paga nada: quem agenda é o admin logado no app, pela inter-pagar.
//
// Também confere no Inter (só leitura) os boletos agendados cujo dia chegou.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  createClient,
  type SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { extractText, getDocumentProxy } from 'https://esm.sh/unpdf@0.12.1';
import {
  acharBeneficiario,
  acharBoletos,
  validarLinha,
  type Boleto,
} from '../_shared/boleto.ts';
import { chamarInter } from '../_shared/inter.ts';

const BUCKET = 'respira-financeiro';
const MAX_MENSAGENS_POR_CAIXA = 10;
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-token',
};

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// sem os tipos gerados do banco, o cliente precisa do esquema genérico
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, 'public', any>;

interface GmailParte {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: GmailParte[];
}

function base64urlParaBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function bytesParaBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) {
    s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function partes(p: GmailParte): GmailParte[] {
  return [p, ...(p.parts ?? []).flatMap(partes)];
}

function cabecalho(p: GmailParte, nome: string): string {
  return (
    p.headers?.find((h) => h.name.toLowerCase() === nome.toLowerCase())
      ?.value ?? ''
  );
}

function emailDoFrom(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim().toLowerCase();
}

async function tokenGoogle(refresh: string): Promise<string> {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      refresh_token: refresh,
      grant_type: 'refresh_token',
    }),
  });
  const corpo = await r.json();
  if (!r.ok) {
    throw new Error(
      corpo?.error === 'invalid_grant'
        ? 'O acesso ao Gmail expirou ou foi removido. Conecte a caixa de novo.'
        : `Google recusou o token (${r.status}): ${corpo?.error_description ?? corpo?.error ?? ''}`
    );
  }
  return corpo.access_token as string;
}

async function gmail<T>(token: string, caminho: string): Promise<T> {
  const r = await fetch(`${GMAIL}${caminho}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok)
    throw new Error(
      `Gmail ${caminho.split('?')[0]} (${r.status}): ${await r.text()}`
    );
  return (await r.json()) as T;
}

async function textoDoPdf(bytes: Uint8Array): Promise<string> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join('\n') : String(text ?? '');
  } catch {
    return '';
  }
}

// PDF escaneado: a IA só procura a linha; a conferência dos DVs continua valendo.
async function boletoPelaIa(
  admin: Admin,
  bytes: Uint8Array
): Promise<{ boleto: Boleto | null; doc: string | null; nome: string | null }> {
  const vazio = { boleto: null, doc: null, nome: null };
  const { data: chave } = await admin
    .from('api_keys')
    .select('encrypted_key')
    .eq('service_name', 'openai')
    .eq('is_active', true)
    .maybeSingle();
  if (!chave?.encrypted_key) return vazio;

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${chave.encrypted_key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              file: {
                filename: 'boleto.pdf',
                file_data: `data:application/pdf;base64,${bytesParaBase64(bytes)}`,
              },
            },
            {
              type: 'text',
              text:
                'Este PDF pode ser um boleto bancário. Copie exatamente a linha digitável (47 dígitos) ' +
                'e o CNPJ e o nome do beneficiário. Responda só JSON: ' +
                '{"linha_digitavel": "só dígitos ou vazio", "beneficiario_cnpj": "só dígitos ou vazio", "beneficiario_nome": ""}',
            },
          ],
        },
      ],
    }),
  });
  if (!r.ok) return vazio;
  try {
    const corpo = await r.json();
    const d = JSON.parse(corpo.choices?.[0]?.message?.content ?? '{}');
    const linha = String(d.linha_digitavel ?? '').replace(/\D/g, '');
    return {
      boleto: validarLinha(linha),
      doc: String(d.beneficiario_cnpj ?? '').replace(/\D/g, '') || null,
      nome: d.beneficiario_nome
        ? String(d.beneficiario_nome).slice(0, 120)
        : null,
    };
  } catch {
    return vazio;
  }
}

async function lerCaixa(
  admin: Admin,
  caixa: { id: string; email: string; refresh_token: string },
  consulta: string,
  cnpjsNossos: string[]
) {
  const resumo = { caixa: caixa.email, novas: 0, boletos: 0, outras: 0 };
  const token = await tokenGoogle(caixa.refresh_token);

  const lista = await gmail<{ messages?: { id: string }[] }>(
    token,
    `/messages?maxResults=25&q=${encodeURIComponent(consulta)}`
  );
  const ids = (lista.messages ?? []).map((m) => m.id);
  if (!ids.length) return resumo;

  const { data: vistas } = await admin
    .from('email_mensagens')
    .select('gmail_id')
    .eq('caixa_id', caixa.id)
    .in('gmail_id', ids);
  const jaVistas = new Set((vistas ?? []).map((v) => v.gmail_id as string));
  const novas = ids
    .filter((id) => !jaVistas.has(id))
    .slice(0, MAX_MENSAGENS_POR_CAIXA);

  for (const id of novas) {
    resumo.novas++;
    const msg = await gmail<{ payload: GmailParte; internalDate?: string }>(
      token,
      `/messages/${id}?format=full`
    );
    const remetente = emailDoFrom(cabecalho(msg.payload, 'From'));
    const assunto = cabecalho(msg.payload, 'Subject').slice(0, 300);
    const recebidoEm = msg.internalDate
      ? new Date(Number(msg.internalDate)).toISOString()
      : null;
    const base = {
      caixa_id: caixa.id,
      remetente,
      assunto,
      recebido_em: recebidoEm,
    };

    const todas = partes(msg.payload);
    const corpo = todas
      .filter((p) => p.mimeType === 'text/plain' && p.body?.data)
      .map((p) => new TextDecoder().decode(base64urlParaBytes(p.body!.data!)))
      .join('\n')
      .slice(0, 8000);
    const pdfs = todas
      .filter(
        (p) =>
          p.body?.attachmentId &&
          (p.mimeType === 'application/pdf' || /\.pdf$/i.test(p.filename ?? ''))
      )
      .slice(0, 3);

    if (!pdfs.length) {
      await admin.rpc('fn_email_mensagem_registrar', {
        p: {
          ...base,
          gmail_id: id,
          status: 'sem_boleto',
          detalhe: 'E-mail sem PDF',
        },
      });
      resumo.outras++;
      continue;
    }

    let n = 0;
    let algum = false;
    for (const [i, parte] of pdfs.entries()) {
      const anexo = await gmail<{ data: string }>(
        token,
        `/messages/${id}/attachments/${parte.body!.attachmentId}`
      );
      const bytes = base64urlParaBytes(anexo.data);
      const texto = await textoDoPdf(bytes);
      let boletos = acharBoletos(texto);
      let benef = acharBeneficiario(texto, cnpjsNossos);
      if (!boletos.length && texto.replace(/\s/g, '').length < 200) {
        const ia = await boletoPelaIa(admin, bytes);
        if (ia.boleto) {
          boletos = [ia.boleto];
          benef = { doc: ia.doc, nome: ia.nome };
        }
      }

      for (const b of boletos) {
        const sufixo = n === 0 ? '' : `:${n + 1}`;
        const caminho = `boletos/${caixa.id}/${id}-${i + 1}.pdf`;
        await admin.storage
          .from(BUCKET)
          .upload(caminho, bytes, {
            contentType: 'application/pdf',
            upsert: true,
          });
        const { data: r, error } = await admin.rpc(
          'fn_boleto_registrar_email',
          {
            p: {
              ...base,
              gmail_id: id + sufixo,
              texto:
                `${assunto}\n${corpo}\n${parte.filename ?? ''}\n${texto}`.slice(
                  0,
                  20000
                ),
              linha_digitavel: b.linha,
              banco_codigo: b.banco,
              valor: b.valor,
              vencimento: b.vencimento,
              beneficiario_doc: benef.doc,
              beneficiario_nome: benef.nome,
              anexo_path: `${BUCKET}/${caminho}`,
            },
          }
        );
        if (error) throw new Error(`registrar boleto: ${error.message}`);
        if ((r as { ok?: boolean })?.ok) resumo.boletos++;
        n++;
        algum = true;
      }
    }

    if (!algum) {
      // remetente sem cadastro também cai aqui (a busca filtra, mas o domínio pode casar)
      await admin.rpc('fn_boleto_registrar_email', {
        p: {
          ...base,
          gmail_id: id,
          texto: `${assunto}\n${corpo}`,
          motivo: 'Não achei boleto com linha digitável válida no PDF',
        },
      });
      resumo.outras++;
    }
  }
  return resumo;
}

// Boleto agendado cujo dia chegou: confere no Inter (só leitura) se saiu.
async function conferirAgendados(admin: Admin) {
  const { data } = await admin.rpc('fn_boletos_agendados_para_conferir');
  const lista = (data ?? []) as {
    id: string;
    linha_digitavel: string;
    data_pagamento: string;
  }[];
  const resultado: Record<string, string> = {};
  for (const b of lista) {
    try {
      const dia = b.data_pagamento;
      const inicio = new Date(Date.parse(dia) - 7 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const hoje = new Date().toISOString().slice(0, 10);
      const q = new URLSearchParams({
        codBarraLinhaDigitavel: b.linha_digitavel,
        dataInicio: inicio,
        dataFim: hoje,
      });
      const resp = await chamarInter<unknown>(
        'GET',
        `/banking/v2/pagamento?${q.toString()}`,
        undefined,
        'pagamento-boleto.read'
      );
      const status = JSON.stringify(resp ?? '').toUpperCase();
      if (
        /"STATUS[A-Z_]*":"(PAGO|REALIZADO|EFETIVADO|LIQUIDADO)"/.test(status)
      ) {
        await admin.rpc('fn_boleto_confirmar_pagamento', {
          p_id: b.id,
          p_pago: true,
        });
        resultado[b.id] = 'pago';
      } else if (
        /"STATUS[A-Z_]*":"(CANCELADO|REJEITADO|ERRO|DEVOLVIDO|NAO_REALIZADO)"/.test(
          status
        )
      ) {
        const m = status.match(/"STATUS[A-Z_]*":"([A-Z_]+)"/);
        await admin.rpc('fn_boleto_confirmar_pagamento', {
          p_id: b.id,
          p_pago: false,
          p_erro: `O Inter informou: ${m?.[1] ?? 'não pago'}`,
        });
        resultado[b.id] = 'erro';
      } else {
        resultado[b.id] = 'aguardando';
      }
    } catch (e) {
      resultado[b.id] =
        `falha na consulta: ${e instanceof Error ? e.message : e}`;
    }
  }
  return resultado;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // ---- quem chama: o cron (token do Vault) ou um admin logado ----
  const tokenCron = req.headers.get('x-cron-token');
  if (tokenCron) {
    const { data: esperado } = await admin.rpc('fn_email_boletos_token');
    if (!esperado || tokenCron !== esperado)
      return json({ error: 'Token inválido' }, 401);
  } else {
    const jwt = (req.headers.get('Authorization') ?? '')
      .replace('Bearer ', '')
      .trim();
    const { data: u } = jwt ? await admin.auth.getUser(jwt) : { data: null };
    if (!u?.user) return json({ error: 'Não autenticado' }, 401);
    const { data: p } = await admin
      .from('pessoas')
      .select('role, ativo, is_approved, bloqueado')
      .eq('auth_user_id', u.user.id)
      .single();
    if (!p || p.role !== 'admin' || !p.ativo || !p.is_approved || p.bloqueado) {
      return json({ error: 'Apenas admin' }, 403);
    }
  }

  try {
    const [{ data: caixas }, { data: remetentes }, { data: empresas }] =
      await Promise.all([
        admin
          .from('email_caixas')
          .select('id, email, refresh_token')
          .eq('ativo', true)
          .not('refresh_token', 'is', null),
        admin.from('email_boleto_remetentes').select('email').eq('ativo', true),
        admin.from('pessoa_empresas').select('cnpj'),
      ]);

    const emails = [
      ...new Set((remetentes ?? []).map((r) => r.email as string)),
    ];
    const cnpjsNossos = (empresas ?? [])
      .map((e) => String(e.cnpj ?? ''))
      .filter(Boolean);
    const caixasResumo: unknown[] = [];

    if (emails.length && caixas?.length) {
      const consulta = `from:(${emails.join(' OR ')}) has:attachment newer_than:15d`;
      for (const caixa of caixas) {
        try {
          caixasResumo.push(
            await lerCaixa(
              admin,
              caixa as { id: string; email: string; refresh_token: string },
              consulta,
              cnpjsNossos
            )
          );
          await admin
            .from('email_caixas')
            .update({
              ultima_leitura_em: new Date().toISOString(),
              ultimo_erro: null,
            })
            .eq('id', caixa.id);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error('[email-boletos]', caixa.email, msg);
          await admin
            .from('email_caixas')
            .update({
              ultima_leitura_em: new Date().toISOString(),
              ultimo_erro: msg.slice(0, 500),
            })
            .eq('id', caixa.id);
          caixasResumo.push({ caixa: caixa.email, erro: msg });
        }
      }
    }

    const agendados = await conferirAgendados(admin);
    return json({ ok: true, caixas: caixasResumo, agendados });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[email-boletos]', msg);
    return json({ error: msg }, 500);
  }
});
