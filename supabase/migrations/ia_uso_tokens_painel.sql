-- 20/11/2026 (pedido do dono): quanto a IA gasta por conversa e no total (dia, semana, mês).
--
-- ia_precos            preço por 1 milhão de tokens (US$), tabela que o dono colou em 20/11/2026
-- ia_uso               uma linha por execução de IA (fluxo, conversa, tokens). No Atendimento o n8n só dá
--                      estimativa (estimado = true): ~20,2 mil tokens fixos + 0,298 × caracteres dinâmicos por
--                      chamada (calibrado em 39 execuções, erro médio 0,6%). No @ju e no Resumo os números são
--                      os que a OpenAI devolve. resultado = 'pulada' marca turno que nem chamou a IA.
-- ia_uso_openai_dia    totais oficiais da OpenAI por dia e modelo (edge ia-uso-openai, precisa da chave de
--                      administrador da organização no Vault como 'openai_admin_key').
-- Leitura só pelo RPC fn_ia_uso_painel (admin); escrita só service_role (n8n e banco).

CREATE TABLE IF NOT EXISTS public.ia_precos (
  modelo        text PRIMARY KEY,
  entrada       numeric NOT NULL,
  cache_leitura numeric,
  cache_escrita numeric,
  saida         numeric NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.ia_precos (modelo, entrada, cache_leitura, cache_escrita, saida) VALUES
  ('gpt-6.2-astra', 8.00, 0.40, 10.00, 40.00),
  ('gpt-6.2-sol',   2.00, 0.10,  2.50, 10.00),
  ('gpt-6-astra',  10.00, 1.00, 12.50, 50.00),
  ('gpt-6.1-sol',   2.00, 0.10,  2.50, 10.00),
  ('gpt-6.1-terra', 1.00, 0.05,  1.25,  5.00),
  ('gpt-6-luna',    0.10, 0.01,  0.125, 0.50),
  ('gpt-6-sol',     2.00, 0.20,  2.50, 10.00),
  ('gpt-5.6-sol',   4.00, 0.40,  5.00, 20.00),
  ('gpt-5.6-terra', 2.00, 0.20,  2.50, 12.00),
  ('gpt-5.6-luna',  0.20, 0.02,  0.25,  1.20),
  ('gpt-5.5',       5.00, 0.50,  NULL, 30.00),
  ('gpt-5.4',       2.50, 0.25,  NULL, 15.00)
ON CONFLICT (modelo) DO UPDATE SET entrada = EXCLUDED.entrada, cache_leitura = EXCLUDED.cache_leitura,
  cache_escrita = EXCLUDED.cache_escrita, saida = EXCLUDED.saida, atualizado_em = now();

CREATE TABLE IF NOT EXISTS public.ia_uso (
  id             bigserial PRIMARY KEY,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  fluxo          text NOT NULL,
  conversa_id    bigint,
  modelo         text,
  chamadas       integer NOT NULL DEFAULT 0,
  tokens_entrada integer NOT NULL DEFAULT 0,
  tokens_fixos   integer NOT NULL DEFAULT 0,
  tokens_cache   integer,
  tokens_saida   integer NOT NULL DEFAULT 0,
  estimado       boolean NOT NULL DEFAULT false,
  resultado      text,
  execucao       text
);
CREATE INDEX IF NOT EXISTS ia_uso_criado_em_idx ON public.ia_uso (criado_em);
CREATE INDEX IF NOT EXISTS ia_uso_conversa_idx ON public.ia_uso (conversa_id, criado_em);

CREATE TABLE IF NOT EXISTS public.ia_uso_openai_dia (
  dia            date NOT NULL,
  modelo         text NOT NULL,
  requisicoes    integer NOT NULL DEFAULT 0,
  tokens_entrada bigint NOT NULL DEFAULT 0,
  tokens_cache   bigint NOT NULL DEFAULT 0,
  tokens_saida   bigint NOT NULL DEFAULT 0,
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dia, modelo)
);

ALTER TABLE public.ia_precos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ia_uso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ia_uso_openai_dia ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ia_precos, public.ia_uso, public.ia_uso_openai_dia FROM anon, authenticated;

-- Custo em US$ de uma linha: entrada não cacheada a preço cheio, cache a preço de leitura.
CREATE OR REPLACE FUNCTION public.fn_ia_custo_usd(p_modelo text, p_entrada bigint, p_cache bigint, p_saida bigint)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT round(((greatest(coalesce(p_entrada, 0) - coalesce(p_cache, 0), 0) * p.entrada
                 + coalesce(p_cache, 0) * coalesce(p.cache_leitura, p.entrada)
                 + coalesce(p_saida, 0) * p.saida) / 1e6)::numeric, 6)
    FROM ia_precos p WHERE p.modelo = p_modelo;
$function$;

CREATE OR REPLACE FUNCTION public.fn_ia_uso_registrar(p jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_id bigint;
BEGIN
  INSERT INTO ia_uso (fluxo, conversa_id, modelo, chamadas, tokens_entrada, tokens_fixos, tokens_cache, tokens_saida,
                      estimado, resultado, execucao)
  VALUES (coalesce(nullif(p ->> 'fluxo', ''), 'desconhecido'),
          nullif(p ->> 'conversa_id', '')::bigint,
          nullif(p ->> 'modelo', ''),
          coalesce((p ->> 'chamadas')::int, 1),
          coalesce((p ->> 'tokens_entrada')::numeric, 0)::int,
          coalesce((p ->> 'tokens_fixos')::numeric, 0)::int,
          nullif(p ->> 'tokens_cache', '')::numeric::int,
          coalesce((p ->> 'tokens_saida')::numeric, 0)::int,
          coalesce((p ->> 'estimado')::boolean, false),
          nullif(p ->> 'resultado', ''),
          nullif(p ->> 'execucao', ''))
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$;

REVOKE ALL ON FUNCTION public.fn_ia_uso_registrar(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ia_uso_registrar(jsonb) TO service_role;

-- Painel (admin): totais de hoje, 7 dias e mês; por dia; por fluxo; por resultado; conversas que mais gastaram;
-- e os totais oficiais da OpenAI quando a chave de administrador estiver configurada.
CREATE OR REPLACE FUNCTION public.fn_ia_uso_painel(p_dias integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_ini  date := v_hoje - greatest(coalesce(p_dias, 30), 1) + 1;
BEGIN
  IF NOT fn_rls_admin_aprovado_ativo() THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH u AS (
      SELECT x.*, (x.criado_em AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
             coalesce(fn_ia_custo_usd(x.modelo, x.tokens_entrada, x.tokens_cache, x.tokens_saida), 0) AS custo_sem_cache,
             coalesce(fn_ia_custo_usd(x.modelo, x.tokens_entrada, greatest(coalesce(x.tokens_cache, 0), CASE WHEN x.estimado THEN x.tokens_fixos ELSE 0 END), x.tokens_saida), 0) AS custo_com_cache
        FROM ia_uso x
       WHERE x.criado_em >= (least(v_ini, date_trunc('month', v_hoje)::date))::timestamp AT TIME ZONE 'America/Sao_Paulo'
    ), periodo AS (
      SELECT 'hoje' AS chave, v_hoje AS de UNION ALL
      SELECT '7_dias', v_hoje - 6 UNION ALL
      SELECT 'mes', date_trunc('month', v_hoje)::date
    )
    SELECT jsonb_build_object(
      'hoje', v_hoje,
      'totais', (SELECT jsonb_object_agg(pe.chave, jsonb_build_object(
                    'execucoes', (SELECT count(*) FROM u WHERE u.dia >= pe.de AND coalesce(u.resultado, '') <> 'pulada'),
                    'puladas', (SELECT count(*) FROM u WHERE u.dia >= pe.de AND u.resultado = 'pulada'),
                    'chamadas', (SELECT coalesce(sum(u.chamadas), 0) FROM u WHERE u.dia >= pe.de),
                    'tokens_entrada', (SELECT coalesce(sum(u.tokens_entrada), 0) FROM u WHERE u.dia >= pe.de),
                    'tokens_saida', (SELECT coalesce(sum(u.tokens_saida), 0) FROM u WHERE u.dia >= pe.de),
                    'custo_usd_sem_cache', (SELECT round(coalesce(sum(u.custo_sem_cache), 0), 2) FROM u WHERE u.dia >= pe.de),
                    'custo_usd_com_cache', (SELECT round(coalesce(sum(u.custo_com_cache), 0), 2) FROM u WHERE u.dia >= pe.de)))
                 FROM periodo pe),
      'por_dia', coalesce((SELECT jsonb_agg(jsonb_build_object('dia', d.dia, 'execucoes', d.execucoes, 'puladas', d.puladas,
                                  'tokens_entrada', d.tok, 'custo_usd_sem_cache', d.c1, 'custo_usd_com_cache', d.c2) ORDER BY d.dia)
                 FROM (SELECT dia, count(*) FILTER (WHERE coalesce(resultado, '') <> 'pulada') AS execucoes,
                              count(*) FILTER (WHERE resultado = 'pulada') AS puladas,
                              sum(tokens_entrada) AS tok, round(sum(custo_sem_cache), 2) AS c1, round(sum(custo_com_cache), 2) AS c2
                         FROM u WHERE dia >= v_ini GROUP BY dia) d), '[]'::jsonb),
      'por_fluxo', coalesce((SELECT jsonb_agg(jsonb_build_object('fluxo', f.fluxo, 'execucoes', f.n, 'tokens_entrada', f.tok,
                                  'custo_usd_sem_cache', f.c1, 'custo_usd_com_cache', f.c2, 'estimado', f.est) ORDER BY f.tok DESC)
                 FROM (SELECT fluxo, count(*) AS n, sum(tokens_entrada) AS tok, round(sum(custo_sem_cache), 2) AS c1,
                              round(sum(custo_com_cache), 2) AS c2, bool_or(estimado) AS est
                         FROM u WHERE dia >= v_ini AND coalesce(resultado, '') <> 'pulada' GROUP BY fluxo) f), '[]'::jsonb),
      'por_resultado', coalesce((SELECT jsonb_agg(jsonb_build_object('resultado', r.resultado, 'execucoes', r.n, 'tokens_entrada', r.tok) ORDER BY r.tok DESC)
                 FROM (SELECT coalesce(resultado, 'outro') AS resultado, count(*) AS n, sum(tokens_entrada) AS tok
                         FROM u WHERE dia >= v_ini AND fluxo = 'atendimento' GROUP BY 1) r), '[]'::jsonb),
      'top_conversas', coalesce((SELECT jsonb_agg(jsonb_build_object('conversa_id', t.conversa_id, 'nome', t.nome, 'telefone_final', t.tel,
                                  'execucoes', t.n, 'tokens_entrada', t.tok, 'custo_usd_sem_cache', t.c1, 'custo_usd_com_cache', t.c2) ORDER BY t.tok DESC)
                 FROM (SELECT u.conversa_id, max(coalesce(nullif(btrim(c.nome_whatsapp), ''), 'Sem nome')) AS nome,
                              max(right(regexp_replace(coalesce(c.telefone, c.wa_chatid, ''), '\D', '', 'g'), 4)) AS tel,
                              count(*) AS n, sum(u.tokens_entrada) AS tok, round(sum(u.custo_sem_cache), 2) AS c1, round(sum(u.custo_com_cache), 2) AS c2
                         FROM u LEFT JOIN ju_conversas c ON c.id = u.conversa_id
                        WHERE u.dia >= v_ini AND u.conversa_id IS NOT NULL AND coalesce(u.resultado, '') <> 'pulada'
                        GROUP BY u.conversa_id ORDER BY sum(u.tokens_entrada) DESC LIMIT 15) t), '[]'::jsonb),
      'openai_oficial', coalesce((SELECT jsonb_agg(jsonb_build_object('dia', o.dia, 'modelo', o.modelo, 'requisicoes', o.requisicoes,
                                  'tokens_entrada', o.tokens_entrada, 'tokens_cache', o.tokens_cache, 'tokens_saida', o.tokens_saida,
                                  'custo_usd', fn_ia_custo_usd(o.modelo, o.tokens_entrada, o.tokens_cache, o.tokens_saida)) ORDER BY o.dia, o.modelo)
                 FROM ia_uso_openai_dia o WHERE o.dia >= v_ini), '[]'::jsonb)
    ));
END $function$;

REVOKE ALL ON FUNCTION public.fn_ia_uso_painel(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_ia_uso_painel(integer) TO authenticated;

-- Consumo de uma conversa (card na tela de Conversas).
CREATE OR REPLACE FUNCTION public.fn_ia_uso_conversa(p_conversa_id bigint, p_dias integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT fn_rls_admin_aprovado_ativo() THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT jsonb_build_object(
            'execucoes', count(*) FILTER (WHERE coalesce(resultado, '') <> 'pulada'),
            'puladas', count(*) FILTER (WHERE resultado = 'pulada'),
            'tokens_entrada', coalesce(sum(tokens_entrada), 0),
            'custo_usd_sem_cache', round(coalesce(sum(fn_ia_custo_usd(modelo, tokens_entrada, tokens_cache, tokens_saida)), 0), 4),
            'custo_usd_com_cache', round(coalesce(sum(fn_ia_custo_usd(modelo, tokens_entrada,
                                       greatest(coalesce(tokens_cache, 0), CASE WHEN estimado THEN tokens_fixos ELSE 0 END), tokens_saida)), 0), 4))
            FROM ia_uso WHERE conversa_id = p_conversa_id AND criado_em > now() - make_interval(days => greatest(coalesce(p_dias, 30), 1)));
END $function$;

REVOKE ALL ON FUNCTION public.fn_ia_uso_conversa(bigint, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_ia_uso_conversa(bigint, integer) TO authenticated;

-- Turno pulado pelo filtro "equipe conduzindo" entra no registro (mostra a economia no painel).
DO $mig$
DECLARE
  v_def text := pg_get_functiondef('public.fn_ju_turno(bigint,bigint)'::regprocedure);
  v_old text := $o$     AND NOT public.fn_ju_precisa_ia_com_equipe(c.id) THEN
    RETURN jsonb_build_object('pode', false, 'motivo', 'EQUIPE_CONDUZINDO');$o$;
  v_new text := $n$     AND NOT public.fn_ju_precisa_ia_com_equipe(c.id) THEN
    INSERT INTO public.ia_uso (fluxo, conversa_id, modelo, chamadas, resultado, estimado, execucao)
    SELECT 'atendimento', c.id, 'gpt-6.2-sol', 0, 'pulada', true, 'v' || p_versao
     WHERE NOT EXISTS (SELECT 1 FROM public.ia_uso x WHERE x.conversa_id = c.id AND x.resultado = 'pulada'
                          AND x.execucao = 'v' || p_versao);
    RETURN jsonb_build_object('pode', false, 'motivo', 'EQUIPE_CONDUZINDO');$n$;
BEGIN
  IF position(v_old IN v_def) = 0 THEN RAISE EXCEPTION 'trecho do filtro não encontrado'; END IF;
  EXECUTE replace(v_def, v_old, v_new);
END $mig$;

-- Lista de conversas do painel: até 50.
DO $mig$
DECLARE v_def text := pg_get_functiondef('public.fn_ia_uso_painel(integer)'::regprocedure);
BEGIN
  IF position('GROUP BY u.conversa_id ORDER BY sum(u.tokens_entrada) DESC LIMIT 15' IN v_def) > 0 THEN
    EXECUTE replace(v_def, 'GROUP BY u.conversa_id ORDER BY sum(u.tokens_entrada) DESC LIMIT 15', 'GROUP BY u.conversa_id ORDER BY sum(u.tokens_entrada) DESC LIMIT 50');
  END IF;
END $mig$;
