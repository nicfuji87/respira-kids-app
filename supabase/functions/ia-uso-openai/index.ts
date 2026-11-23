// AI dev note: totais oficiais de uso da OpenAI (por dia, modelo e chave de API) para o painel
// "Custo de IA".
//
// Lê GET /v1/organization/usage/completions (bucket de 1 dia, agrupado por modelo e api_key_id) com a
// chave de ADMINISTRADOR da organização, guardada como segredo da Edge Function 'openai_admin_key' (o dono
// criou em 20/11/2026; o Vault com o mesmo nome é reserva). Esta função nunca grava nem devolve a chave.
// Grava em ia_uso_openai_dia (upsert por dia + modelo + nome da chave). A organização é compartilhada
// com outros projetos do dono; o painel soma só as chaves listadas em ia_chaves_rk.
// Sem a chave, responde {ok:false, motivo:'sem_chave'} e não faz nada.
//
// Quem chama: pg_cron 'ia-uso-openai' (x-cron-token = Vault email_boletos_token), de hora em hora.
// Body opcional: {dias: N} (padrão 3, máx. 31); {detalhe: true} devolve a soma por chave e modelo
// sem gravar (diagnóstico).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const API = 'https://api.openai.com/v1/organization';

// id da chave de API → nome da chave (só nomes; os valores das chaves nunca são lidos).
async function nomesDasChaves(H: Record<string, string>) {
  const nomes: Record<string, string> = {};
  const pj = await fetch(`${API}/projects?limit=100`, { headers: H })
    .then((r) => r.json())
    .catch(() => ({}));
  for (const p of pj.data ?? []) {
    nomes[`p:${p.id}`] = p.name;
    const ks = await fetch(`${API}/projects/${p.id}/api_keys?limit=100`, {
      headers: H,
    })
      .then((r) => r.json())
      .catch(() => ({}));
    for (const k of ks.data ?? []) nomes[`k:${k.id}`] = k.name;
  }
  return nomes;
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

  // A chave fica como segredo da Edge Function (openai_admin_key); o Vault é só reserva.
  let chave =
    Deno.env.get('openai_admin_key') ??
    Deno.env.get('OPENAI_ADMIN_KEY') ??
    null;
  if (!chave) {
    const { data } = await admin.rpc('fn_ia_openai_admin_key');
    chave = data ?? null;
  }
  if (!chave) return json({ ok: false, motivo: 'sem_chave' });

  const corpo = await req.json().catch(() => ({}));
  const dias = Math.min(Math.max(Number(corpo?.dias) || 3, 1), 31);
  // Começa na meia-noite UTC: com bucket de 1 dia, a OpenAI conta 24 h a partir de start_time, e um
  // início quebrado gravava meio dia por cima do dia inteiro (bug corrigido em 23/11/2026).
  const inicio =
    Math.floor((Math.floor(Date.now() / 1000) - dias * 86_400) / 86_400) *
    86_400;
  const H = { Authorization: `Bearer ${chave}` };
  const nomes = await nomesDasChaves(H);

  // {minuto: true, desde: <unix>, modelo: 'gpt-5.4'}: diagnóstico minuto a minuto (qual chave fez
  // cada chamada de um modelo). Usado em 20/11/2026 para descobrir qual chave cada credencial do n8n usa.
  if (corpo?.minuto === true) {
    const desde = Number(corpo.desde) || Math.floor(Date.now() / 1000) - 3600;
    const alvo = String(corpo.modelo ?? '');
    const achados: Array<{
      minuto: string;
      chave: string;
      modelo: string;
      req: number;
    }> = [];
    let pg: string | null = null;
    for (let i = 0; i < 10; i++) {
      const q = new URLSearchParams({
        start_time: String(desde),
        bucket_width: '1m',
        limit: '1440',
      });
      q.append('group_by', 'model');
      q.append('group_by', 'api_key_id');
      if (pg) q.set('page', pg);
      const d = await fetch(`${API}/usage/completions?${q}`, { headers: H })
        .then((r) => r.json())
        .catch(() => ({}));
      for (const b of d.data ?? [])
        for (const r of b.results ?? []) {
          const m = String(r.model ?? '');
          if (alvo && m.replace(/-\d{4}-\d{2}-\d{2}$/, '') !== alvo) continue;
          achados.push({
            minuto: new Date(Number(b.start_time) * 1000)
              .toISOString()
              .slice(0, 16),
            chave: nomes[`k:${r.api_key_id}`] ?? String(r.api_key_id ?? '?'),
            modelo: m,
            req: Number(r.num_model_requests ?? 0),
          });
        }
      pg = d.has_more ? (d.next_page ?? null) : null;
      if (!pg) break;
    }
    return json({ ok: true, achados });
  }

  const linhas: Record<
    string,
    {
      dia: string;
      modelo: string;
      chave: string;
      requisicoes: number;
      tokens_entrada: number;
      tokens_cache: number;
      tokens_saida: number;
    }
  > = {};
  let pagina: string | null = null;
  for (let i = 0; i < 20; i++) {
    const qs = new URLSearchParams({
      start_time: String(inicio),
      bucket_width: '1d',
      limit: '31',
    });
    qs.append('group_by', 'model');
    qs.append('group_by', 'api_key_id');
    qs.append('group_by', 'project_id');
    if (pagina) qs.set('page', pagina);
    const res = await fetch(`${API}/usage/completions?${qs}`, {
      headers: H,
      signal: AbortSignal.timeout(30000),
    });
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
        const nomeChave =
          nomes[`k:${r.api_key_id}`] ??
          nomes[`p:${r.project_id}`] ??
          'desconhecida';
        const k = `${dia}|${modelo}|${nomeChave}`;
        const l = (linhas[k] ??= {
          dia,
          modelo,
          chave: nomeChave,
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

  const lista = Object.values(linhas);
  if (corpo?.detalhe === true) {
    const soma: Record<
      string,
      { req: number; entrada: number; cache: number; saida: number }
    > = {};
    for (const l of lista) {
      const s = (soma[`${l.chave} | ${l.modelo}`] ??= {
        req: 0,
        entrada: 0,
        cache: 0,
        saida: 0,
      });
      s.req += l.requisicoes;
      s.entrada += l.tokens_entrada;
      s.cache += l.tokens_cache;
      s.saida += l.tokens_saida;
    }
    return json({ ok: true, detalhe: soma });
  }

  if (lista.length) {
    const agora = new Date().toISOString();
    const { error } = await admin.from('ia_uso_openai_dia').upsert(
      lista.map((l) => ({ ...l, atualizado_em: agora })),
      { onConflict: 'dia,modelo,chave' }
    );
    if (error)
      return json({ ok: false, motivo: 'banco', erro: error.message }, 500);
  }
  return json({ ok: true, dias, linhas: lista.length });
});
