-- 23/11/2026: filtros na aba "Custo de IA" (pedido do dono).
-- fn_ia_uso_painel_filtro: período livre (de/até, hora de Brasília), fluxo, resultado, busca por
-- nome do WhatsApp ou final do telefone, e ordenação da lista de conversas. fn_ia_uso_painel
-- (versão anterior) fica para o front antigo até o deploy.
--
-- Os filtros de fluxo/resultado/busca valem para tudo, menos para a quebra da própria dimensão
-- (por_fluxo ignora o filtro de fluxo; por_resultado ignora o de resultado), para dar para comparar.
-- Os totais oficiais da OpenAI não têm conversa nem fluxo: seguem só o período.

CREATE OR REPLACE FUNCTION public.fn_ia_uso_painel_filtro(
  p_de date DEFAULT NULL,
  p_ate date DEFAULT NULL,
  p_fluxo text DEFAULT NULL,
  p_resultado text DEFAULT NULL,
  p_busca text DEFAULT NULL,
  p_ordem text DEFAULT 'custo')
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_hoje  date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_ate   date := least(coalesce(p_ate, v_hoje), v_hoje);
  v_de    date := coalesce(p_de, v_ate - 29);
  v_busca text := nullif(btrim(coalesce(p_busca, '')), '');
  v_dig   text;
  v_min   date;
BEGIN
  IF NOT fn_rls_admin_aprovado_ativo() THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  IF v_de > v_ate THEN v_de := v_ate; END IF;
  IF v_ate - v_de > 365 THEN v_de := v_ate - 365; END IF;
  v_dig := nullif(regexp_replace(coalesce(v_busca, ''), '\D', '', 'g'), '');
  v_min := least(v_de, date_trunc('month', v_hoje)::date, v_hoje - 6);

  RETURN (
    WITH base AS (
      SELECT x.*, (x.criado_em AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
             coalesce(fn_ia_custo_usd(x.modelo, x.tokens_entrada, x.tokens_cache, x.tokens_saida), 0) AS c_sem,
             coalesce(fn_ia_custo_usd(x.modelo, x.tokens_entrada,
                        greatest(coalesce(x.tokens_cache, 0), CASE WHEN x.estimado THEN x.tokens_fixos ELSE 0 END),
                        x.tokens_saida), 0) AS c_com,
             (x.fluxo = coalesce(p_fluxo, x.fluxo)) AS ok_fluxo,
             (coalesce(x.resultado, 'outro') = coalesce(p_resultado, coalesce(x.resultado, 'outro'))) AS ok_res
        FROM ia_uso x
        LEFT JOIN ju_conversas c ON c.id = x.conversa_id
       WHERE x.criado_em >= v_min::timestamp AT TIME ZONE 'America/Sao_Paulo'
         AND x.criado_em <  (v_ate + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'
         AND (v_busca IS NULL
              OR c.nome_whatsapp ILIKE '%' || v_busca || '%'
              OR (v_dig IS NOT NULL AND length(v_dig) >= 3
                  AND regexp_replace(coalesce(c.telefone, c.wa_chatid, ''), '\D', '', 'g') LIKE '%' || v_dig || '%'))
    ),
    u AS (SELECT * FROM base WHERE ok_fluxo AND ok_res),
    pe AS (SELECT * FROM u WHERE dia BETWEEN v_de AND v_ate),
    rapido AS (
      SELECT 'hoje' AS chave, v_hoje AS de UNION ALL
      SELECT '7_dias', v_hoje - 6 UNION ALL
      SELECT 'mes', date_trunc('month', v_hoje)::date
    )
    SELECT jsonb_build_object(
      'hoje', v_hoje, 'de', v_de, 'ate', v_ate,
      'periodo', (SELECT jsonb_build_object(
                    'execucoes', count(*) FILTER (WHERE coalesce(resultado, '') <> 'pulada'),
                    'puladas', count(*) FILTER (WHERE resultado = 'pulada'),
                    'conversas', count(DISTINCT conversa_id) FILTER (WHERE coalesce(resultado, '') <> 'pulada'),
                    'tokens_entrada', coalesce(sum(tokens_entrada), 0),
                    'tokens_saida', coalesce(sum(tokens_saida), 0),
                    'custo_usd_sem_cache', round(coalesce(sum(c_sem), 0), 2),
                    'custo_usd_com_cache', round(coalesce(sum(c_com), 0), 2),
                    'custo_medio_conversa_com_cache', round(coalesce(sum(c_com) FILTER (WHERE conversa_id IS NOT NULL), 0)
                        / nullif(count(DISTINCT conversa_id) FILTER (WHERE coalesce(resultado, '') <> 'pulada'), 0), 3),
                    'custo_medio_conversa_sem_cache', round(coalesce(sum(c_sem) FILTER (WHERE conversa_id IS NOT NULL), 0)
                        / nullif(count(DISTINCT conversa_id) FILTER (WHERE coalesce(resultado, '') <> 'pulada'), 0), 3))
                  FROM pe),
      'totais', (SELECT jsonb_object_agg(r.chave, jsonb_build_object(
                    'execucoes', (SELECT count(*) FROM u WHERE u.dia >= r.de AND coalesce(u.resultado, '') <> 'pulada'),
                    'puladas', (SELECT count(*) FROM u WHERE u.dia >= r.de AND u.resultado = 'pulada'),
                    'chamadas', (SELECT coalesce(sum(u.chamadas), 0) FROM u WHERE u.dia >= r.de),
                    'tokens_entrada', (SELECT coalesce(sum(u.tokens_entrada), 0) FROM u WHERE u.dia >= r.de),
                    'tokens_saida', (SELECT coalesce(sum(u.tokens_saida), 0) FROM u WHERE u.dia >= r.de),
                    'custo_usd_sem_cache', (SELECT round(coalesce(sum(u.c_sem), 0), 2) FROM u WHERE u.dia >= r.de),
                    'custo_usd_com_cache', (SELECT round(coalesce(sum(u.c_com), 0), 2) FROM u WHERE u.dia >= r.de)))
                 FROM rapido r),
      'por_dia', coalesce((SELECT jsonb_agg(jsonb_build_object('dia', d.dia, 'execucoes', d.execucoes, 'puladas', d.puladas,
                                  'tokens_entrada', d.tok, 'custo_usd_sem_cache', d.c1, 'custo_usd_com_cache', d.c2) ORDER BY d.dia)
                 FROM (SELECT dia, count(*) FILTER (WHERE coalesce(resultado, '') <> 'pulada') AS execucoes,
                              count(*) FILTER (WHERE resultado = 'pulada') AS puladas,
                              coalesce(sum(tokens_entrada), 0) AS tok, round(sum(c_sem), 2) AS c1, round(sum(c_com), 2) AS c2
                         FROM pe GROUP BY dia) d), '[]'::jsonb),
      'por_fluxo', coalesce((SELECT jsonb_agg(jsonb_build_object('fluxo', f.fluxo, 'execucoes', f.n, 'tokens_entrada', f.tok,
                                  'custo_usd_sem_cache', f.c1, 'custo_usd_com_cache', f.c2, 'estimado', f.est) ORDER BY f.tok DESC)
                 FROM (SELECT fluxo, count(*) AS n, coalesce(sum(tokens_entrada), 0) AS tok, round(sum(c_sem), 2) AS c1,
                              round(sum(c_com), 2) AS c2, bool_or(estimado) AS est
                         FROM base WHERE ok_res AND dia BETWEEN v_de AND v_ate AND coalesce(resultado, '') <> 'pulada'
                        GROUP BY fluxo) f), '[]'::jsonb),
      'por_resultado', coalesce((SELECT jsonb_agg(jsonb_build_object('resultado', r.resultado, 'execucoes', r.n, 'tokens_entrada', r.tok) ORDER BY r.n DESC)
                 FROM (SELECT coalesce(resultado, 'outro') AS resultado, count(*) AS n, coalesce(sum(tokens_entrada), 0) AS tok
                         FROM base WHERE ok_fluxo AND dia BETWEEN v_de AND v_ate GROUP BY 1) r), '[]'::jsonb),
      'conversas', coalesce((SELECT jsonb_agg(jsonb_build_object('conversa_id', t.conversa_id, 'nome', t.nome, 'telefone_final', t.tel,
                                  'execucoes', t.n, 'puladas', t.pul, 'tokens_entrada', t.tok,
                                  'custo_usd_sem_cache', t.c1, 'custo_usd_com_cache', t.c2,
                                  'ultima', to_char(t.ultima AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI'))
                                  ORDER BY CASE p_ordem WHEN 'execucoes' THEN t.n::numeric
                                                        WHEN 'recentes' THEN extract(epoch FROM t.ultima)::numeric
                                                        ELSE t.c1 END DESC, t.c1 DESC)
                 FROM (SELECT pe.conversa_id, max(coalesce(nullif(btrim(c.nome_whatsapp), ''), 'Sem nome')) AS nome,
                              max(right(regexp_replace(coalesce(c.telefone, c.wa_chatid, ''), '\D', '', 'g'), 4)) AS tel,
                              count(*) FILTER (WHERE coalesce(pe.resultado, '') <> 'pulada') AS n,
                              count(*) FILTER (WHERE pe.resultado = 'pulada') AS pul,
                              coalesce(sum(pe.tokens_entrada), 0) AS tok, round(sum(pe.c_sem), 3) AS c1, round(sum(pe.c_com), 3) AS c2,
                              max(pe.criado_em) AS ultima
                         FROM pe LEFT JOIN ju_conversas c ON c.id = pe.conversa_id
                        WHERE pe.conversa_id IS NOT NULL
                        GROUP BY pe.conversa_id
                        ORDER BY CASE p_ordem WHEN 'execucoes' THEN count(*)::numeric
                                              WHEN 'recentes' THEN extract(epoch FROM max(pe.criado_em))::numeric
                                              ELSE sum(pe.c_sem) END DESC
                        LIMIT 100) t), '[]'::jsonb),
      'openai_oficial', coalesce((SELECT jsonb_agg(jsonb_build_object('dia', o.dia, 'modelo', o.modelo, 'chave', o.chave, 'requisicoes', o.requisicoes,
                                  'tokens_entrada', o.tokens_entrada, 'tokens_cache', o.tokens_cache, 'tokens_saida', o.tokens_saida,
                                  'custo_usd', fn_ia_custo_usd(o.modelo, o.tokens_entrada, o.tokens_cache, o.tokens_saida)) ORDER BY o.dia, o.modelo)
                 FROM ia_uso_openai_dia o WHERE o.dia BETWEEN v_de AND v_ate
                  AND o.chave IN (SELECT nome FROM ia_chaves_rk)), '[]'::jsonb),
      'openai_outros_usd', (SELECT round(coalesce(sum(fn_ia_custo_usd(o.modelo, o.tokens_entrada, o.tokens_cache, o.tokens_saida)), 0), 2)
                              FROM ia_uso_openai_dia o WHERE o.dia BETWEEN v_de AND v_ate
                               AND o.chave NOT IN (SELECT nome FROM ia_chaves_rk))
    ));
END $function$;

REVOKE ALL ON FUNCTION public.fn_ia_uso_painel_filtro(date, date, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_ia_uso_painel_filtro(date, date, text, text, text, text) TO authenticated;
