// AI dev note: totais oficiais de uso da OpenAI (por dia e modelo) para o painel "Custo de IA".
//
// Lê GET /v1/organization/usage/completions (bucket de 1 dia, agrupado por modelo) com a chave de
// ADMINISTRADOR da organização, guardada no Vault como 'openai_admin_key' (o dono cria e coloca lá; esta
// função nunca grava nem devolve a chave). Grava em ia_uso_openai_dia (upsert por dia + modelo).
// Sem a chave, responde {ok:false, motivo:'sem_chave'} e não faz nada.
//
// Quem chama: pg_cron 'ia-uso-openai' (x-cron-token = Vault email_boletos_token), de hora em hora.
// Body opcional: {dias: N} (padrão 3, máx. 31).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const tokenCron = req.headers.get('x-cron-token');
  const { data: esperado } = await admin.rpc('fn_email_boletos_token');
  if (!tokenCron || !esperado || tokenCron !== esperado)
    return json({ error: 'Token inválido' }, 401);

  const { data: chave } = await admin.rpc('fn_ia_openai_admin_key');
  if (!chave) return json({ ok: false, motivo: 'sem_chave' });

  const corpo = await req.json().catch(() => ({}));
  const dias = Math.min(Math.max(Number(corpo?.dias) || 3, 1), 31);
  const inicio = Math.floor(Date.now() / 1000) - dias * 86_400;

  const linhas: Record<
    string,
    {
      dia: string;
      modelo: string;
      requisicoes: number;
      tokens_entrada: number;
      tokens_cache: number;
      tokens_saida: number;
    }
  > = {};
  let pagina: string | null = null;
  for (let i = 0; i < 10; i++) {
    const qs = new URLSearchParams({
      start_time: String(inicio),
      bucket_width: '1d',
      limit: '31',
    });
    qs.append('group_by', 'model');
    if (pagina) qs.set('page', pagina);
    const res = await fetch(
      `https://api.openai.com/v1/organization/usage/completions?${qs}`,
      {
        headers: { Authorization: `Bearer ${chave}` },
        signal: AbortSignal.timeout(30000),
      }
    );
    const dados = await res.json().catch(() => ({}));
    if (!res.ok)
      return json(
        {
          ok: false,
          motivo: 'openai',
          status: res.status,
          erro: dados?.error?.message ?? null,
        },
        502
      );
    for (const b of dados.data ?? []) {
      // o balde começa à meia-noite UTC; o painel usa o dia UTC da OpenAI
      const dia = new Date(Number(b.start_time) * 1000)
        .toISOString()
        .slice(0, 10);
      for (const r of b.results ?? []) {
        const modelo = String(r.model ?? 'desconhecido').replace(
          /-\d{4}-\d{2}-\d{2}$/,
          ''
        );
        const k = `${dia}|${modelo}`;
        const l = (linhas[k] ??= {
          dia,
          modelo,
          requisicoes: 0,
          tokens_entrada: 0,
          tokens_cache: 0,
          tokens_saida: 0,
        });
        l.requisicoes += Number(r.num_model_requests ?? 0);
        l.tokens_entrada += Number(r.input_tokens ?? 0);
        l.tokens_cache += Number(r.input_cached_tokens ?? 0);
        l.tokens_saida += Number(r.output_tokens ?? 0);
      }
    }
    pagina = dados.has_more ? (dados.next_page ?? null) : null;
    if (!pagina) break;
  }

  const lista = Object.values(linhas).map((l) => ({
    ...l,
    atualizado_em: new Date().toISOString(),
  }));
  if (lista.length) {
    const { error } = await admin
      .from('ia_uso_openai_dia')
      .upsert(lista, { onConflict: 'dia,modelo' });
    if (error)
      return json({ ok: false, motivo: 'banco', erro: error.message }, 500);
  }
  return json({ ok: true, dias, linhas: lista.length });
});
