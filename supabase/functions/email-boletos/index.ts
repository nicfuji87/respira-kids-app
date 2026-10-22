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
// O aviso com o link sai no grupo pelo fluxo de avisos do Pix (n8n). No Inter esta função
// NÃO paga nada: quem agenda é o admin logado no app, pela inter-pagar.
//
// Exceção: remetente com pagar_por = 'asaas' (contas da BC FISIO). A solicitação nasce
// 'agendando' e aqui ela é simulada e criada como pagamento de conta no Asaas (POST /v3/bill).
// O Asaas segura o pagamento até a Bruna liberar no app dela; o aviso no grupo diz isso.
//
// Também confere os agendados (Inter no dia, só leitura; Asaas a cada rodada) e dá
// baixa nos de débito automático no vencimento (fn_boletos_debito_baixar).
// Body { so_asaas: true } (botão da página do boleto): pula o Gmail e só agenda/confere.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  createClient,
  type SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { extractText, getDocumentProxy } from 'https://esm.sh/unpdf@0.12.1';
import {
  acharBeneficiario,
  acharVencimentoNoTexto,
  acharBoletos,
  validarArrecadacao,
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

interface Remetente {
  id: string;
  email: string;
  senha_pdf: string | null;
  links_permitidos: string | null;
}

// Documento que chega por link ("Baixar", plataforma do contador) em vez de anexo. Só
// segue link com texto de download ou do domínio cadastrado, nunca de descadastro (abrir
// um "unsubscribe" descadastraria a caixa), e só aceita PDF vindo do domínio cadastrado.
// Se o link abre uma PÁGINA do domínio (ex.: tela da Hubstrom com outro botão), procura
// nela o link do arquivo e dá mais um passo. O diagnóstico guarda só host + caminho
// (sem a query, que costuma ter o código de acesso ao documento).
// texto do link que indica arquivo (o Gestta mostra só um ícone ao lado do nome do documento)
const TEXTO_DE_ARQUIVO =
  /baixar|download|darf|guia|boleto|documento|fatura|recibo/i;
const NAO_SEGUIR =
  /unsubscribe|descadastr|cancelar|opt-?out|remover|logout|sair/i;

async function pdfsPorLink(
  html: string,
  dominios: string[]
): Promise<{ pdfs: { bytes: Uint8Array; nome: string }[]; vistos: string[] }> {
  const pdfs: { bytes: Uint8Array; nome: string }[] = [];
  const vistos: string[] = [];
  const jaVisitados = new Set<string>();
  const doDominio = (u: string) => {
    try {
      const h = new URL(u).hostname.toLowerCase();
      return dominios.some((d) => h.includes(d));
    } catch {
      return false;
    }
  };
  const semQuery = (u: string) => {
    try {
      const x = new URL(u);
      // só o 1º segmento do caminho: o resto costuma ser o código de acesso ao arquivo
      const seg = x.pathname.split('/').filter(Boolean)[0];
      return `${x.hostname}${seg ? `/${seg.slice(0, 20)}/…` : ''}`;
    } catch {
      return u.slice(0, 40);
    }
  };

  // links de uma página: <a href>, src de iframe/embed e data de object
  const linksDaPagina = (pagina: string, base: string) => {
    const achados: { url: string; texto: string }[] = [];
    for (const m of pagina.matchAll(
      /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
    )) {
      achados.push({
        url: m[1],
        texto: m[2]
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
      });
    }
    for (const m of pagina.matchAll(
      /<(?:iframe|embed|object)\b[^>]*(?:src|data)\s*=\s*["']([^"']+)["']/gi
    )) {
      achados.push({ url: m[1], texto: 'documento' });
    }
    return achados
      .map((a) => {
        try {
          return {
            url: new URL(a.url.replace(/&amp;/g, '&'), base).href,
            texto: a.texto,
          };
        } catch {
          return null;
        }
      })
      .filter((a): a is { url: string; texto: string } => !!a)
      .filter((a) => /^https:\/\//i.test(a.url))
      .filter((a) => !NAO_SEGUIR.test(a.url + ' ' + a.texto));
  };

  const baixar = async (url: string, nome: string, passo: number) => {
    if (jaVisitados.has(url) || jaVisitados.size >= 8) return;
    jaVisitados.add(url);
    try {
      const r = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(20_000),
      });
      const tipo = r.headers.get('content-type') ?? '';
      const final = r.url || url;
      vistos.push(`${semQuery(final)} (${tipo.split(';')[0] || '?'})`);
      if (!r.ok || !doDominio(final)) return;
      const bytes = new Uint8Array(await r.arrayBuffer());
      const ehPdf =
        tipo.includes('pdf') ||
        new TextDecoder().decode(bytes.subarray(0, 5)) === '%PDF-';
      if (ehPdf) {
        if (bytes.length < 15_000_000)
          pdfs.push({ bytes, nome: nome || 'documento.pdf' });
        return;
      }
      // página do próprio domínio: procura o arquivo nela (um passo a mais, no máximo)
      if (passo >= 2 || !tipo.includes('html')) return;
      const pagina = new TextDecoder().decode(bytes);
      const titulo = pagina.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();
      const scripts = (pagina.match(/<script\b/gi) ?? []).length;
      const internos = linksDaPagina(pagina, final)
        .filter((a) => doDominio(a.url))
        .filter(
          (a) =>
            /baixar|download|documento/i.test(a.texto) ||
            /\.pdf|download|arquivo|file|documento/i.test(
              new URL(a.url).pathname
            )
        )
        .slice(0, 4);
      vistos.push(
        `página "${(titulo ?? '').slice(0, 40)}", ${scripts} scripts, ${internos.length} link(s) de arquivo`
      );
      for (const a of internos) await baixar(a.url, a.texto, passo + 1);
    } catch (e) {
      vistos.push(`falha: ${e instanceof Error ? e.message : e}`.slice(0, 80));
    }
  };

  const candidatos = linksDaPagina(html, 'https://email.invalid/')
    .filter((a) => TEXTO_DE_ARQUIVO.test(a.texto) || doDominio(a.url))
    .slice(0, 4);
  for (const c of candidatos) await baixar(c.url, c.texto, 1);
  return { pdfs, vistos };
}

function remetenteDe(email: string, lista: Remetente[]): Remetente | null {
  return (
    lista.find((r) => r.email === email) ??
    lista.find((r) => r.email.startsWith('@') && email.endsWith(r.email)) ??
    null
  );
}

// Senhas para PDF protegido: a do cadastro primeiro; depois os padrões que operadoras e
// bancos usam com o CNPJ do titular (Claro = 5 primeiros dígitos).
function senhasCandidatas(rem: Remetente | null, cnpjs: string[]): string[] {
  const s = new Set<string>();
  if (rem?.senha_pdf) s.add(rem.senha_pdf);
  for (const c of cnpjs
    .map((x) => x.replace(/\D/g, ''))
    .filter((x) => x.length === 14)) {
    for (const n of [5, 4, 6, 8, 14]) s.add(c.slice(0, n));
  }
  return [...s];
}

// Lê o texto do PDF; se tiver senha, tenta as candidatas (pdf.js: PasswordException).
async function textoDoPdf(
  bytes: Uint8Array,
  senhas: string[]
): Promise<{ texto: string; protegido: boolean; senha: string | null }> {
  const ler = async (password?: string) => {
    const pdf = await getDocumentProxy(
      new Uint8Array(bytes),
      password ? { password } : {}
    );
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join('\n') : String(text ?? '');
  };
  try {
    return { texto: await ler(), protegido: false, senha: null };
  } catch (e) {
    if ((e as Error)?.name !== 'PasswordException') {
      return { texto: '', protegido: false, senha: null };
    }
  }
  for (const senha of senhas) {
    try {
      return { texto: await ler(senha), protegido: true, senha };
    } catch {
      // senha errada: tenta a próxima
    }
  }
  return { texto: '', protegido: true, senha: null };
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
                'Este PDF pode ser um boleto bancário. Copie exatamente a linha digitável (47 dígitos, ou 48 se começar com 8) ' +
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
      boleto: validarLinha(linha) ?? validarArrecadacao(linha),
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
  cnpjsNossos: string[],
  remetentes: Remetente[]
) {
  const resumo = { caixa: caixa.email, novas: 0, boletos: 0, outras: 0 };
  const token = await tokenGoogle(caixa.refresh_token);

  const lista = await gmail<{ messages?: { id: string }[] }>(
    token,
    `/messages?maxResults=25&q=${encodeURIComponent(consulta)}`
  );
  const ids = (lista.messages ?? []).map((m) => m.id);
  // quem manda o documento por link (sem anexo) precisa de uma busca sem has:attachment
  const porLink = [
    ...new Set(
      remetentes.filter((r) => r.links_permitidos).map((r) => r.email)
    ),
  ];
  if (porLink.length) {
    const q2 = `from:(${porLink.join(' OR ')}) -has:attachment newer_than:15d`;
    const l2 = await gmail<{ messages?: { id: string }[] }>(
      token,
      `/messages?maxResults=10&q=${encodeURIComponent(q2)}`
    );
    for (const m of l2.messages ?? []) if (!ids.includes(m.id)) ids.push(m.id);
  }
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
    const rem = remetenteDe(remetente, remetentes);
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

    // documento por link: vira "anexo" com os bytes já baixados
    const baixados: { bytes: Uint8Array; nome: string }[] = [];
    let vistos: string[] = [];
    if (!pdfs.length && rem?.links_permitidos) {
      const html = todas
        .filter((p) => p.mimeType === 'text/html' && p.body?.data)
        .map((p) => new TextDecoder().decode(base64urlParaBytes(p.body!.data!)))
        .join('\n');
      const dominios = rem.links_permitidos
        .split(/[\s,;]+/)
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean);
      const r = await pdfsPorLink(html, dominios);
      baixados.push(...r.pdfs);
      vistos = r.vistos;
    }

    if (!pdfs.length && !baixados.length) {
      await admin.rpc('fn_email_mensagem_registrar', {
        p: {
          ...base,
          gmail_id: id,
          status: 'sem_boleto',
          detalhe: vistos.length
            ? `Link sem PDF: ${vistos.join('; ')}`.slice(0, 480)
            : 'E-mail sem PDF',
        },
      });
      resumo.outras++;
      continue;
    }

    let n = 0;
    let algum = false;
    let semSenha = false;
    const arquivos: { nome: string; carregar: () => Promise<Uint8Array> }[] = [
      ...pdfs.map((parte) => ({
        nome: parte.filename ?? '',
        carregar: async () =>
          base64urlParaBytes(
            (
              await gmail<{ data: string }>(
                token,
                `/messages/${id}/attachments/${parte.body!.attachmentId}`
              )
            ).data
          ),
      })),
      ...baixados.map((b) => ({ nome: b.nome, carregar: async () => b.bytes })),
    ];
    // PDFs lidos sem boleto ficam guardados para quem quiser abrir (e para diagnóstico)
    const guardados: string[] = [];
    for (const [i, parte] of arquivos.entries()) {
      const bytes = await parte.carregar();
      const caminho = `boletos/${caixa.id}/${id}-${i + 1}.pdf`;
      await admin.storage.from(BUCKET).upload(caminho, bytes, {
        contentType: 'application/pdf',
        upsert: true,
      });
      guardados.push(`${BUCKET}/${caminho}`);
      const lido = await textoDoPdf(bytes, senhasCandidatas(rem, cnpjsNossos));
      const texto = lido.texto;
      if (lido.protegido && !lido.senha) {
        semSenha = true;
        continue;
      }
      // a senha que abriu fica no cadastro (a página do boleto mostra para quem abrir o PDF)
      if (lido.senha && rem && rem.senha_pdf !== lido.senha) {
        await admin
          .from('email_boleto_remetentes')
          .update({ senha_pdf: lido.senha })
          .eq('id', rem.id);
        rem.senha_pdf = lido.senha;
      }
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
        const { data: r, error } = await admin.rpc(
          'fn_boleto_registrar_email',
          {
            p: {
              ...base,
              gmail_id: id + sufixo,
              texto: `${assunto}\n${corpo}\n${parte.nome}\n${texto}`.slice(
                0,
                20000
              ),
              linha_digitavel: b.linha,
              banco_codigo: b.banco,
              valor: b.valor,
              // arrecadação (conta de consumo) não traz a data no código: vem da fatura
              vencimento:
                b.vencimento ??
                acharVencimentoNoTexto(texto) ??
                acharVencimentoNoTexto(`${assunto}\n${corpo}`),
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
          motivo:
            (semSenha
              ? 'PDF com senha que não consegui abrir: cadastre a senha no remetente'
              : 'Não achei boleto com linha digitável válida no PDF') +
            (guardados.length ? ` (PDF: ${guardados.join(', ')})` : ''),
        },
      });
      resumo.outras++;
    }
  }
  return resumo;
}

// ---------------------------------------------------------------- Asaas
const ASAAS = 'https://api.asaas.com/v3';

interface RespostaAsaas {
  ok: boolean;
  status: number;
  // deno-lint-ignore no-explicit-any
  data: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

async function asaas(
  token: string,
  metodo: 'GET' | 'POST',
  caminho: string,
  corpo?: unknown
): Promise<RespostaAsaas> {
  const res = await fetch(`${ASAAS}${caminho}`, {
    method: metodo,
    headers: {
      access_token: token,
      'Content-Type': 'application/json',
      'User-Agent': 'RespiraKids/1.0',
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function erroDoAsaas(r: RespostaAsaas): string {
  const msgs = (r.data?.errors ?? []) as { description?: string }[];
  return (
    msgs
      .map((e) => e.description)
      .filter(Boolean)
      .join(' ') || `HTTP ${r.status}`
  );
}

function hojeBrasilia(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
  }).format(new Date());
}

// Conta de consumo/tributo (48 dígitos, começa com 8): o Asaas só aceita o código de barras
// de 44 (sem os DVs de cada bloco). Boleto bancário vai pela linha digitável.
function codigoParaAsaas(linha: string) {
  if (linha.length === 48) {
    const barCode = [0, 12, 24, 36].map((i) => linha.slice(i, i + 11)).join('');
    return { barCode };
  }
  return { identificationField: linha };
}

async function chaveAsaas(
  admin: Admin,
  cache: Map<string, string | null>,
  empresaId: string | null
): Promise<string | null> {
  if (!empresaId) return null;
  if (!cache.has(empresaId)) {
    const { data } = await admin
      .from('pessoa_empresas')
      .select('api_token_externo')
      .eq('id', empresaId)
      .single();
    cache.set(empresaId, (data?.api_token_externo as string) || null);
  }
  return cache.get(empresaId) ?? null;
}

// Cria no Asaas os pagamentos das solicitações 'agendando'. Não dá dinheiro sem a Bruna:
// o Asaas segura até a liberação no app. Qualquer falha devolve para pagamento manual
// ('externo' se ainda não foi anunciado, senão 'erro'), com o motivo.
async function agendarNoAsaas(admin: Admin, cache: Map<string, string | null>) {
  const resultado: Record<string, string> = {};
  const limite = new Date(Date.now() - 10 * 60_000).toISOString();
  const preso =
    'A tentativa de agendar no Asaas não terminou. Confira no app do Asaas se o pagamento já existe antes de tentar de novo.';
  // travado há mais de 10 min (função caiu no meio): não dá para saber se o Asaas registrou
  await admin
    .from('boleto_solicitacoes')
    .update({ status: 'externo', erro: preso })
    .eq('status', 'agendando')
    .lt('asaas_tentativa_em', limite)
    .is('anunciado_em', null);
  await admin
    .from('boleto_solicitacoes')
    .update({
      status: 'erro',
      erro: preso,
      concluido_em: new Date().toISOString(),
    })
    .eq('status', 'agendando')
    .lt('asaas_tentativa_em', limite)
    .not('anunciado_em', 'is', null);

  // trava: só quem conseguir marcar a tentativa segue (duas rodadas não agendam o mesmo)
  const { data: pegos } = await admin
    .from('boleto_solicitacoes')
    .update({ asaas_tentativa_em: new Date().toISOString() })
    .eq('status', 'agendando')
    .is('asaas_tentativa_em', null)
    .select(
      'id, linha_digitavel, valor, vencimento, descricao, alertas, asaas_confirmado, remetente_id, anunciado_em'
    );

  for (const s of (pegos ?? []) as {
    id: string;
    linha_digitavel: string;
    valor: number;
    vencimento: string | null;
    descricao: string | null;
    alertas: { nivel: string; texto: string }[] | null;
    asaas_confirmado: boolean;
    remetente_id: string | null;
    anunciado_em: string | null;
  }[]) {
    const desistir = async (motivo: string) => {
      await admin
        .from('boleto_solicitacoes')
        .update({
          status: s.anunciado_em ? 'erro' : 'externo',
          erro: motivo.slice(0, 500),
          ...(s.anunciado_em ? { concluido_em: new Date().toISOString() } : {}),
        })
        .eq('id', s.id)
        .eq('status', 'agendando');
      resultado[s.id] = `não agendado: ${motivo}`;
    };
    try {
      const { data: rem } = await admin
        .from('email_boleto_remetentes')
        .select('conta_bancaria_id, contas_bancarias(asaas_empresa_id)')
        .eq('id', s.remetente_id)
        .single();
      const conta = rem?.contas_bancarias as
        | { asaas_empresa_id: string | null }
        | { asaas_empresa_id: string | null }[]
        | null;
      const empresaId = Array.isArray(conta)
        ? conta[0]?.asaas_empresa_id
        : conta?.asaas_empresa_id;
      const token = await chaveAsaas(admin, cache, empresaId ?? null);
      if (!token) {
        await desistir('A conta do Asaas do cadastro não tem chave de API.');
        continue;
      }
      const graves = (s.alertas ?? []).filter((a) => a.nivel === 'grave');
      if (graves.length && !s.asaas_confirmado) {
        await desistir(
          `Não agendei por causa de um alerta grave (${graves[0].texto}). Confira o boleto e agende pelo link.`
        );
        continue;
      }

      const codigo = codigoParaAsaas(s.linha_digitavel);
      const sim = await asaas(token, 'POST', '/bill/simulate', codigo);
      if (!sim.ok) {
        await desistir(`O Asaas recusou: ${erroDoAsaas(sim)}`);
        continue;
      }
      const info = sim.data?.bankSlipInfo ?? {};
      const valorAsaas = Number(info.value) || Number(s.valor);
      if (valorAsaas > Number(s.valor) * 1.1 + 0.01) {
        await desistir(
          `O Asaas cobraria R$ ${valorAsaas.toFixed(2)}, mais de 10% acima do boleto (R$ ${Number(s.valor).toFixed(2)}). Confira antes.`
        );
        continue;
      }
      const hoje = hojeBrasilia();
      const alvo = s.vencimento && s.vencimento >= hoje ? s.vencimento : hoje;
      const minimo = String(sim.data?.minimumScheduleDate ?? hoje);
      const dia = alvo > minimo ? alvo : minimo;

      let criado: RespostaAsaas;
      try {
        criado = await asaas(token, 'POST', '/bill', {
          ...codigo,
          scheduleDate: dia,
          description: (s.descricao ?? 'Conta recebida por e-mail').slice(
            0,
            200
          ),
          externalReference: s.id,
          ...(info.dueDate || !s.vencimento ? {} : { dueDate: s.vencimento }),
          ...(info.value ? {} : { value: Number(s.valor) }),
        });
      } catch (e) {
        // sem resposta: o Asaas pode ter registrado. Não repete sozinho.
        await desistir(
          `Sem resposta do Asaas (${e instanceof Error ? e.message : e}). Confira no app do Asaas se o pagamento já existe antes de tentar de novo.`
        );
        continue;
      }
      if (!criado.ok || !criado.data?.id) {
        await desistir(`O Asaas recusou: ${erroDoAsaas(criado)}`);
        continue;
      }
      await admin
        .from('boleto_solicitacoes')
        .update({
          status: 'agendado',
          erro: null,
          asaas_bill_id: criado.data.id,
          asaas_resposta: criado.data,
          data_pagamento: criado.data.scheduleDate ?? dia,
          valor_pagar: Number(criado.data.value) || valorAsaas,
        })
        .eq('id', s.id)
        .eq('status', 'agendando');
      resultado[s.id] = `agendado no Asaas para ${dia}`;
    } catch (e) {
      await desistir(
        `Falha ao agendar no Asaas (${e instanceof Error ? e.message : e}). Confira no app do Asaas antes de tentar de novo.`
      );
    }
  }
  return resultado;
}

// Agendado pelo Asaas: consulta o pagamento (só leitura). PAID dá baixa; cancelado/falhou avisa.
async function conferirNoAsaas(
  admin: Admin,
  cache: Map<string, string | null>,
  b: { id: string; asaas_bill_id: string; asaas_empresa_id: string | null }
): Promise<string> {
  const token = await chaveAsaas(admin, cache, b.asaas_empresa_id);
  if (!token) return 'sem chave do Asaas';
  const r = await asaas(token, 'GET', `/bill/${b.asaas_bill_id}`);
  if (!r.ok) return `falha na consulta: ${erroDoAsaas(r)}`;
  const st = String(r.data?.status ?? '');
  if (st === 'PAID') {
    await admin
      .from('boleto_solicitacoes')
      .update({
        data_pagamento: r.data.paymentDate ?? hojeBrasilia(),
        valor_pagar: Number(r.data.value) || undefined,
        asaas_resposta: r.data,
      })
      .eq('id', b.id);
    await admin.rpc('fn_boleto_confirmar_pagamento', {
      p_id: b.id,
      p_pago: true,
    });
    return 'pago';
  }
  if (['FAILED', 'CANCELLED', 'REFUNDED'].includes(st)) {
    const motivos = ((r.data?.failReasons ?? []) as string[]).join(' ');
    const nome = {
      FAILED: 'falhou',
      CANCELLED: 'cancelado',
      REFUNDED: 'estornado',
    }[st];
    await admin.rpc('fn_boleto_confirmar_pagamento', {
      p_id: b.id,
      p_pago: false,
      p_erro: `No Asaas o pagamento ${nome}${motivos ? `: ${motivos}` : ''}`,
    });
    return st.toLowerCase();
  }
  return `aguardando (${st || '?'})`;
}

// Boleto agendado cujo dia chegou: confere no Inter (só leitura) se saiu.
async function conferirAgendados(
  admin: Admin,
  cache: Map<string, string | null>
) {
  const { data } = await admin.rpc('fn_boletos_agendados_para_conferir');
  const lista = (data ?? []) as {
    id: string;
    linha_digitavel: string;
    data_pagamento: string;
    asaas_bill_id: string | null;
    asaas_empresa_id: string | null;
  }[];
  const resultado: Record<string, string> = {};
  for (const b of lista) {
    try {
      if (b.asaas_bill_id) {
        resultado[b.id] = await conferirNoAsaas(admin, cache, {
          id: b.id,
          asaas_bill_id: b.asaas_bill_id,
          asaas_empresa_id: b.asaas_empresa_id,
        });
        continue;
      }
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

  const pedido = (await req.json().catch(() => ({}))) as { so_asaas?: boolean };
  const chaves = new Map<string, string | null>();
  if (pedido?.so_asaas) {
    try {
      const asaasAgendados = await agendarNoAsaas(admin, chaves);
      const agendados = await conferirAgendados(admin, chaves);
      return json({ ok: true, asaas: asaasAgendados, agendados });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 500);
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
        admin
          .from('email_boleto_remetentes')
          .select('id, email, senha_pdf, links_permitidos')
          .eq('ativo', true),
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
              cnpjsNossos,
              (remetentes ?? []) as Remetente[]
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

    const asaasAgendados = await agendarNoAsaas(admin, chaves);
    const agendados = await conferirAgendados(admin, chaves);
    // débito automático cujo vencimento chegou: baixa na conta do cadastro
    const { data: debitos } = await admin.rpc('fn_boletos_debito_baixar');
    return json({
      ok: true,
      caixas: caixasResumo,
      asaas: asaasAgendados,
      agendados,
      debitos_baixados: debitos ?? 0,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[email-boletos]', msg);
    return json({ error: msg }, 500);
  }
});
