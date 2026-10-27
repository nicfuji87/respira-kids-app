// AI dev note: Configurações > Integrações > WhatsApp.
//
// O número da recepção (61 9131-0529) fica ligado a dois "aparelhos conectados":
//   - uazapi (instância `respirakids`): Ju, automações, etiquetas, grupos, botões.
//   - sistema (servidor QuePasa): alimenta a caixa 39 do Chatwoot e é o 1º canal
//     do envio de fatura do `[Sistema RK] Webhook Asaas` (a uazapi é o reserva).
//
// Esta função só consulta status, gera QR e reinicia o QuePasa. Os tokens vêm do
// Vault (fn_whatsapp_conexoes_credenciais, só service_role) e nunca voltam ao front.
// Nada aqui apaga instância nem desconecta: tirar o aparelho antigo é feito no
// celular, que é o passo que a tela orienta.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const UAZAPI_URL = 'https://infuse.uazapi.com';
const QUEPASA_URL = 'https://infusecomunicacao.apibridge.top';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type Instancia = 'uazapi' | 'chatwoot';

interface Credenciais {
  whatsapp_uazapi_token?: string;
  whatsapp_quepasa_token?: string;
  whatsapp_quepasa_user?: string;
}

export interface StatusConexao {
  instancia: Instancia;
  conectado: boolean;
  // conectado | conectando | desconectado | indisponivel
  estado: string;
  numero: string | null;
  perfil: string | null;
  ultima_queda: string | null;
  motivo_queda: string | null;
  qrcode: string | null;
  erro: string | null;
}

const TIMEOUT_MS = 20000;

async function pedir(url: string, init: RequestInit = {}) {
  return await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

function numeroDoJid(jid?: string | null): string | null {
  if (!jid) return null;
  return jid.split('@')[0].split(':')[0] || null;
}

// "2026-10-05 19:08:36.402Z" (uazapi) -> ISO
function dataIso(s?: string | null): string | null {
  if (!s) return null;
  const d = new Date(s.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const MOTIVOS_UAZAPI: Record<string, string> = {
  'QR Code timeout': 'O QR expirou sem ser lido',
  '401: logged out from another device':
    'O aparelho foi removido pelo celular (ou o WhatsApp encerrou a sessão)',
};

// ---------------------------------------------------------------------------
// uazapi
// ---------------------------------------------------------------------------

async function statusUazapi(token: string): Promise<StatusConexao> {
  const base: StatusConexao = {
    instancia: 'uazapi',
    conectado: false,
    estado: 'indisponivel',
    numero: null,
    perfil: null,
    ultima_queda: null,
    motivo_queda: null,
    qrcode: null,
    erro: null,
  };
  try {
    const r = await pedir(`${UAZAPI_URL}/instance/status`, {
      headers: { token, Accept: 'application/json' },
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.instance) {
      return { ...base, erro: `uazapi respondeu ${r.status}` };
    }
    const inst = j.instance;
    const conectado = !!(j.status?.connected && j.status?.loggedIn);
    const estado = conectado
      ? 'conectado'
      : inst.status === 'connecting'
        ? 'conectando'
        : 'desconectado';
    return {
      ...base,
      conectado,
      estado,
      numero: inst.owner || numeroDoJid(j.status?.jid),
      perfil: inst.profileName || null,
      ultima_queda: dataIso(inst.lastDisconnect),
      motivo_queda:
        MOTIVOS_UAZAPI[inst.lastDisconnectReason] ||
        inst.lastDisconnectReason ||
        null,
      qrcode: !conectado && inst.qrcode ? inst.qrcode : null,
    };
  } catch (e) {
    return { ...base, erro: `uazapi não respondeu (${(e as Error).message})` };
  }
}

async function qrUazapi(token: string) {
  const atual = await statusUazapi(token);
  if (atual.conectado) {
    return { ok: false, erro: 'A uazapi já está conectada.' };
  }
  // Sem "phone" no corpo a uazapi devolve QR (com phone devolveria código de pareamento)
  const r = await pedir(`${UAZAPI_URL}/instance/connect`, {
    method: 'POST',
    headers: {
      token,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  const j = await r.json().catch(() => null);
  const qrcode = j?.instance?.qrcode || j?.qrcode || null;
  if (!r.ok || !qrcode) {
    return {
      ok: false,
      erro:
        j?.error ||
        j?.message ||
        `A uazapi não devolveu QR (status ${r.status}). Tente de novo em alguns segundos.`,
    };
  }
  return { ok: true, qrcode };
}

// ---------------------------------------------------------------------------
// QuePasa (Chatwoot)
// ---------------------------------------------------------------------------

async function statusQuepasa(token: string): Promise<StatusConexao> {
  const base: StatusConexao = {
    instancia: 'chatwoot',
    conectado: false,
    estado: 'indisponivel',
    numero: null,
    perfil: null,
    ultima_queda: null,
    motivo_queda: null,
    qrcode: null,
    erro: null,
  };
  try {
    const r = await pedir(`${QUEPASA_URL}/health`, {
      headers: { 'X-QUEPASA-TOKEN': token, Accept: 'application/json' },
    });
    const j = await r.json().catch(() => null);
    if (!j) return { ...base, erro: `QuePasa respondeu ${r.status}` };
    const conectado = j.success === true;
    const diag = j.diagnostic ?? null;
    let motivo: string | null = null;
    if (diag?.disconnect_cause === 'network') {
      motivo = 'Queda de conexão entre o servidor e o WhatsApp';
    } else if (diag?.message) {
      motivo = diag.message;
    }
    return {
      ...base,
      conectado,
      estado: conectado ? 'conectado' : 'desconectado',
      numero: numeroDoJid(j.wid),
      ultima_queda: diag?.occurred_at ?? null,
      motivo_queda: conectado ? motivo : motivo || j.status || null,
    };
  } catch (e) {
    return {
      ...base,
      erro: `QuePasa não respondeu (${(e as Error).message})`,
    };
  }
}

function bytesParaBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

async function qrQuepasa(token: string, user: string) {
  const atual = await statusQuepasa(token);
  if (atual.conectado) {
    return { ok: false, erro: 'O sistema (Chatwoot) já está conectado.' };
  }
  const r = await pedir(`${QUEPASA_URL}/scan`, {
    headers: {
      'X-QUEPASA-TOKEN': token,
      'X-QUEPASA-USER': user,
      Accept: 'image/png, application/json',
    },
  });
  const tipo = r.headers.get('content-type') ?? '';
  if (r.ok && tipo.startsWith('image/')) {
    const b64 = bytesParaBase64(await r.arrayBuffer());
    return { ok: true, qrcode: `data:${tipo.split(';')[0]};base64,${b64}` };
  }
  const j = await r.json().catch(() => null);
  if (r.ok && (j?.qrcode || j?.qr)) {
    return { ok: true, qrcode: j.qrcode || j.qr };
  }
  const status = String(j?.status ?? '');
  if (status.includes('no data to encode')) {
    return {
      ok: false,
      erro:
        'O servidor do sistema não conseguiu falar com o WhatsApp para gerar o QR. ' +
        'Clique em "Reiniciar conexão", espere 30 segundos e tente de novo. ' +
        'Se continuar, o problema é no servidor (avise o Nicolas).',
    };
  }
  return {
    ok: false,
    erro: status || `QuePasa não devolveu QR (status ${r.status}).`,
  };
}

async function reiniciarQuepasa(token: string) {
  const r = await pedir(`${QUEPASA_URL}/command?action=restart`, {
    headers: { 'X-QUEPASA-TOKEN': token, Accept: 'application/json' },
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || j?.success === false) {
    return {
      ok: false,
      erro: j?.status || `QuePasa respondeu ${r.status} ao reiniciar.`,
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const jwt = (req.headers.get('Authorization') ?? '')
      .replace('Bearer ', '')
      .trim();
    if (!jwt) return json({ error: 'Não autenticado' }, 401);

    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return json({ error: 'Sessão inválida' }, 401);
    }

    const { data: pessoa } = await admin
      .from('pessoas')
      .select('role, ativo, bloqueado, is_approved')
      .eq('auth_user_id', userData.user.id)
      .single();

    // A aba hoje é só do admin; a secretaria fica liberada aqui porque é quem
    // está com o celular da recepção na mão quando precisa reconectar.
    const pode =
      pessoa &&
      ['admin', 'secretaria'].includes(pessoa.role as string) &&
      pessoa.ativo &&
      pessoa.is_approved &&
      !pessoa.bloqueado;
    if (!pode) return json({ error: 'Sem permissão' }, 403);

    const { acao, instancia } = (await req.json().catch(() => ({}))) as {
      acao?: string;
      instancia?: Instancia;
    };

    const { data: cred, error: credErr } = await admin.rpc(
      'fn_whatsapp_conexoes_credenciais'
    );
    const c = (cred ?? {}) as Credenciais;
    if (credErr || !c.whatsapp_uazapi_token || !c.whatsapp_quepasa_token) {
      return json(
        { error: 'Tokens do WhatsApp não configurados no Vault' },
        500
      );
    }

    if (!acao || acao === 'status') {
      const [uazapi, chatwoot] = await Promise.all([
        statusUazapi(c.whatsapp_uazapi_token),
        statusQuepasa(c.whatsapp_quepasa_token),
      ]);
      return json({ ok: true, conexoes: [uazapi, chatwoot] });
    }

    if (acao === 'qr' && instancia === 'uazapi') {
      return json(await qrUazapi(c.whatsapp_uazapi_token));
    }
    if (acao === 'qr' && instancia === 'chatwoot') {
      return json(
        await qrQuepasa(c.whatsapp_quepasa_token, c.whatsapp_quepasa_user ?? '')
      );
    }
    if (acao === 'reiniciar' && instancia === 'chatwoot') {
      return json(await reiniciarQuepasa(c.whatsapp_quepasa_token));
    }

    return json({ error: 'Ação inválida' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
