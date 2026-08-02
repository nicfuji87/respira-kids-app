// AI dev note: Gerencia o webhook de Pix recebido no Banco Inter. Uso pontual
// (admin), não entra em fluxo de negócio.
//
// acao='consultar' -> GET  /pix/v2/webhook/{chave}
// acao='registrar' -> PUT  /pix/v2/webhook/{chave}
//
// CUIDADO: registrar SOBRESCREVE o webhook atual da chave. Consulte antes.
// O webhook vale para a chave Pix inteira: qualquer Pix recebido nela avisa a
// nossa URL, não só as cobranças da loja (txid desconhecido é ignorado lá).
//
// Registrado em 02/08/2026 apontando para inter-webhook-pix.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { chamarInter } from '../_shared/inter.ts';

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
    if (userErr || !userData?.user)
      return json({ error: 'Sessão inválida' }, 401);

    const { data: pessoa } = await admin
      .from('pessoas')
      .select('role, ativo, bloqueado, is_approved')
      .eq('auth_user_id', userData.user.id)
      .single();

    if (
      !pessoa ||
      pessoa.role !== 'admin' ||
      !pessoa.ativo ||
      !pessoa.is_approved ||
      pessoa.bloqueado
    ) {
      return json({ error: 'Apenas admin pode configurar o webhook' }, 403);
    }

    const chave = Deno.env.get('INTER_CHAVE_PIX');
    if (!chave) return json({ error: 'INTER_CHAVE_PIX não configurada' }, 500);

    const { acao, webhook_url } = (await req.json()) as {
      acao?: string;
      webhook_url?: string;
    };

    const caminho = `/pix/v2/webhook/${encodeURIComponent(chave)}`;

    if (acao === 'consultar') {
      try {
        const atual = await chamarInter<unknown>('GET', caminho);
        return json({ existe: true, webhook: atual });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // 404 = nenhum webhook cadastrado; é resposta válida, não erro
        if (msg.includes('(404)')) return json({ existe: false });
        throw e;
      }
    }

    if (acao === 'registrar') {
      if (!webhook_url || !webhook_url.startsWith('https://')) {
        return json({ error: 'webhook_url deve começar com https://' }, 400);
      }
      const r = await chamarInter<unknown>('PUT', caminho, {
        webhookUrl: webhook_url,
      });
      return json({ registrado: true, resposta: r, webhook_url });
    }

    return json({ error: "acao deve ser 'consultar' ou 'registrar'" }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[inter-configurar-webhook]', msg);
    return json({ error: msg }, 500);
  }
});
