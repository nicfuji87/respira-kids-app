// AI dev note: Recebe a selfie do ponto pelo celular da estagiária (#/ponto) e
// grava no bucket privado estagio-pontos com a service role.
// Autenticação própria (verify_jwt desligado): o corpo traz o token de sessão da
// estagiária, e a RPC fn_estagio_celular_foto_autorizada confere se esse token é
// dono da batida recente (≤10 min) cujo foto_path foi reservado pela
// fn_estagio_celular_registrar. Não sobrescreve arquivo existente.
// Por que não upload direto: policies antigas do storage consultam `pessoas` e
// quebram qualquer insert anônimo (ver migration estagio_ponto_celular_foto_edge).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_BYTES = 300 * 1024; // a selfie comprimida tem ~10-20KB

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ ok: false, erro: 'METODO' }, 405);
  }

  try {
    const form = await req.formData();
    const token = form.get('token');
    const path = form.get('path');
    const foto = form.get('foto');

    if (
      typeof token !== 'string' ||
      typeof path !== 'string' ||
      !(foto instanceof File)
    ) {
      return json({ ok: false, erro: 'DADOS' }, 400);
    }
    if (!/^celular\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/.test(path)) {
      return json({ ok: false, erro: 'CAMINHO' }, 400);
    }
    if (foto.size === 0 || foto.size > MAX_BYTES) {
      return json({ ok: false, erro: 'TAMANHO' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: autorizado, error: rpcError } = await supabase.rpc(
      'fn_estagio_celular_foto_autorizada',
      { p_token: token, p_path: path }
    );
    if (rpcError) {
      console.error('foto_autorizada', rpcError);
      return json({ ok: false, erro: 'FALHA' }, 500);
    }
    if (autorizado !== true) {
      return json({ ok: false, erro: 'NAO_AUTORIZADO' }, 403);
    }

    const { error: upError } = await supabase.storage
      .from('estagio-pontos')
      .upload(path, foto, { contentType: 'image/jpeg', upsert: false });
    if (upError) {
      console.error('upload', upError);
      return json({ ok: false, erro: 'UPLOAD' }, 500);
    }

    return json({ ok: true });
  } catch (e) {
    console.error('estagio-ponto-foto', e);
    return json({ ok: false, erro: 'FALHA' }, 500);
  }
});
