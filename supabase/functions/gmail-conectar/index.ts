// AI dev note: Conecta uma caixa do Gmail para a leitura de boletos (email-boletos).
//
// O admin toca "Conectar caixa" em Configurações > Integrações, faz login no Google
// com a conta da caixa e autoriza SÓ leitura (gmail.readonly). O Google volta para
// /api/oauth-callback → /#/auth/google/callback, que chama esta função com o código.
// Aqui o código vira refresh_token, guardado em email_caixas (sem policy: só a
// service_role lê). A caixa é identificada pelo e-mail que o próprio Gmail informa.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

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

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const jwt = (req.headers.get('Authorization') ?? '')
      .replace('Bearer ', '')
      .trim();
    const { data: u } = jwt ? await admin.auth.getUser(jwt) : { data: null };
    if (!u?.user) return json({ error: 'Não autenticado' }, 401);
    const { data: pessoa } = await admin
      .from('pessoas')
      .select('id, role, ativo, is_approved, bloqueado')
      .eq('auth_user_id', u.user.id)
      .single();
    if (
      !pessoa ||
      pessoa.role !== 'admin' ||
      !pessoa.ativo ||
      !pessoa.is_approved ||
      pessoa.bloqueado
    ) {
      return json({ error: 'Apenas admin' }, 403);
    }

    const { code } = (await req.json()) as { code?: string };
    if (!code) return json({ error: 'Faltou o código do Google' }, 400);

    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
        client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
        redirect_uri: `${Deno.env.get('APP_URL')}/api/oauth-callback`,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenResp.json();
    if (!tokenResp.ok) {
      return json(
        {
          error: `O Google recusou o código: ${tokens?.error_description ?? tokens?.error ?? tokenResp.status}`,
        },
        400
      );
    }
    if (!String(tokens.scope ?? '').includes('gmail.readonly')) {
      return json(
        {
          error:
            'A permissão de leitura do Gmail não foi concedida. Conecte de novo e marque a caixa de permissão.',
        },
        400
      );
    }
    if (!tokens.refresh_token) {
      return json(
        {
          error:
            'O Google não devolveu o acesso permanente. Remova o app em myaccount.google.com/permissions e conecte de novo.',
        },
        400
      );
    }

    const perfil = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/profile',
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );
    const dadosPerfil = await perfil.json();
    if (!perfil.ok || !dadosPerfil?.emailAddress) {
      return json(
        {
          error: `Não consegui ler a caixa no Gmail (${perfil.status}). A API do Gmail está ativada no projeto do Google?`,
        },
        400
      );
    }
    const email = String(dadosPerfil.emailAddress).toLowerCase();

    const { error } = await admin.from('email_caixas').upsert(
      {
        email,
        refresh_token: tokens.refresh_token,
        ativo: true,
        conectado_por: pessoa.id,
        conectado_em: new Date().toISOString(),
        ultimo_erro: null,
      },
      { onConflict: 'email' }
    );
    if (error) throw new Error(error.message);

    return json({ ok: true, email });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[gmail-conectar]', msg);
    return json({ error: msg }, 500);
  }
});
