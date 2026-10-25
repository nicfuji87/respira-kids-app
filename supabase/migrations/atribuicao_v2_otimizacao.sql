-- Atribuição v2 — otimização de mídia (25/10/2026)
--
-- 1) Sinal "citou convênio" nas conversas: gatilho em ju_mensagens (só CLIENTE) grava
--    em atrib_sinais QUAL operadora / "convenio" genérico / "reembolso" — nunca o texto.
--    Serve para decidir NEGAR_OPERADORAS no Google Ads com dado real (decisão de 25/10:
--    operadoras liberadas nos primeiros 30 dias, medindo a qualidade desses contatos).
-- 2) Detalhe do Google Ads: custo por palavra-chave e termos de pesquisa, recebidos do
--    script scripts/google-ads/atrib-detalhe.js (mesmo token do script de custos).
-- 3) fn_atrib_otimizacao(desde, ate): dados da aba "Otimização" do /marketing (admin).
-- 4) fn_atrib_alerta_convenio(): job semanal; avisa o dono no WhatsApp quando a regra
--    recomenda negar as operadoras (ou quando a amostra fica suficiente para decidir).
-- Rollback: atribuicao_v2_otimizacao_rollback.sql

-- ── 1. Sinais de convênio ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_atrib_convenio_detalhes(p_texto text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT coalesce(array_agg(DISTINCT d.nome ORDER BY d.nome), '{}'::text[])
  FROM (VALUES
    ('reembolso',      '\mreembols'),
    ('convenio',       '\mconv[eê]nios?\M|\mplanos? de sa[uú]de\M|\mpelo plano\M|\mmeu plano\M|\mo plano (cobre|paga|aceita)|\mcredenciad'),
    ('unimed',         '\munimed\M'),
    ('amil',           '\mamil\M'),
    ('bradesco',       '\mbradesco (sa[uú]de|seguros?)\M'), -- só "Bradesco" é o banco (pagamento)
    ('sulamerica',     '\msul ?am[eé]rica\M'),
    ('porto seguro',   '\mporto (seguro )?sa[uú]de\M'),
    ('care plus',      '\mcare ?plus\M'),
    ('omint',          '\momint\M'),
    ('allianz',        '\mallianz\M'),
    ('golden cross',   '\mgolden cross\M'),
    ('hapvida',        '\mhapvida\M|\mnotre ?dame\M|\minterm[eé]dica\M'),
    ('prevent senior', '\mprevent senior\M'),
    ('mediservice',    '\mmediservice\M'),
    ('qualicorp',      '\mqualicorp\M'),
    ('cassi',          '\mcassi\M'),
    ('geap',           '\mgeap\M'),
    ('capesesp',       '\mcapesesp\M'),
    ('e-vida',         '\me-vida\M|\mevida\M'),
    ('saude caixa',    '\msa[uú]de caixa\M'),
    ('postal saude',   '\mpostal sa[uú]de\M'),
    ('inas/gdf saude', '\minas\M|\mgdf sa[uú]de\M'),
    ('forcas armadas', '\mfusex\M|\mfusma\M|\mfunsa\M'),
    ('plan-assiste',   '\mplan[ -]?assiste\M'),
    ('pro-social',     '\mpr[oó][ -]social\M'),
    ('stf-med',        '\mstf[ -]?med\M'),
    ('tst/trt saude',  '\m(tst|trt) sa[uú]de\M'),
    ('serpro',         '\mserpro\M')
  ) AS d(nome, re)
  WHERE lower(coalesce(p_texto, '')) ~ d.re
$$;

CREATE TABLE IF NOT EXISTS public.atrib_sinais (
  conversa_id  bigint NOT NULL REFERENCES public.ju_conversas(id) ON DELETE CASCADE,
  tipo         text   NOT NULL CHECK (tipo IN ('convenio')),
  detalhe      text   NOT NULL CHECK (length(detalhe) <= 40),
  primeiro_em  timestamptz NOT NULL,
  ultimo_em    timestamptz NOT NULL,
  ocorrencias  int NOT NULL DEFAULT 1,
  PRIMARY KEY (conversa_id, tipo, detalhe)
);
COMMENT ON TABLE public.atrib_sinais IS
  'Sinais comerciais da conversa (hoje: citou convênio/operadora/reembolso). Só o rótulo, nunca o texto. Gatilho em ju_mensagens (CLIENTE).';
CREATE INDEX IF NOT EXISTS atrib_sinais_primeiro_idx ON public.atrib_sinais (primeiro_em);
ALTER TABLE public.atrib_sinais ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.atrib_sinais FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_atrib_sinais_mensagem()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE d text;
BEGIN
  IF NEW.origem IS DISTINCT FROM 'CLIENTE' OR NEW.conteudo IS NULL OR length(NEW.conteudo) < 4 THEN
    RETURN NULL;
  END IF;
  BEGIN
    FOREACH d IN ARRAY public.fn_atrib_convenio_detalhes(NEW.conteudo) LOOP
      INSERT INTO public.atrib_sinais (conversa_id, tipo, detalhe, primeiro_em, ultimo_em)
      VALUES (NEW.conversa_id, 'convenio', d, NEW.created_at, NEW.created_at)
      ON CONFLICT (conversa_id, tipo, detalhe) DO UPDATE
        SET primeiro_em = least(public.atrib_sinais.primeiro_em, EXCLUDED.primeiro_em),
            ultimo_em   = greatest(public.atrib_sinais.ultimo_em, EXCLUDED.ultimo_em),
            ocorrencias = public.atrib_sinais.ocorrencias + 1;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- um sinal nunca pode derrubar a gravação da mensagem
  END;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.fn_atrib_sinais_mensagem() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS atrib_sinais_ins ON public.ju_mensagens;
CREATE TRIGGER atrib_sinais_ins AFTER INSERT ON public.ju_mensagens
  FOR EACH ROW EXECUTE FUNCTION public.fn_atrib_sinais_mensagem();
-- Mídia (áudio transcrito, legenda) ganha conteúdo depois, por UPDATE.
DROP TRIGGER IF EXISTS atrib_sinais_upd ON public.ju_mensagens;
CREATE TRIGGER atrib_sinais_upd AFTER UPDATE OF conteudo ON public.ju_mensagens
  FOR EACH ROW WHEN (OLD.conteudo IS DISTINCT FROM NEW.conteudo)
  EXECUTE FUNCTION public.fn_atrib_sinais_mensagem();

-- Backfill do histórico que ainda existe (ju_mensagens guarda ~90 dias).
INSERT INTO public.atrib_sinais (conversa_id, tipo, detalhe, primeiro_em, ultimo_em, ocorrencias)
SELECT m.conversa_id, 'convenio', d, min(m.created_at), max(m.created_at), count(*)
FROM public.ju_mensagens m
CROSS JOIN LATERAL unnest(public.fn_atrib_convenio_detalhes(m.conteudo)) AS d
WHERE m.origem = 'CLIENTE' AND m.conteudo IS NOT NULL
GROUP BY m.conversa_id, d
ON CONFLICT (conversa_id, tipo, detalhe) DO NOTHING;

-- ── 2. Detalhe do Google Ads ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.atrib_ads_palavras_diarias (
  conta_id        text NOT NULL,
  data            date NOT NULL,
  campanha_id     text NOT NULL,
  grupo_id        text NOT NULL,
  grupo_nome      text,
  criterio_id     text NOT NULL,
  palavra         text NOT NULL,
  correspondencia text,             -- e | p | b (mesmo código do {matchtype})
  impressoes      bigint NOT NULL DEFAULT 0,
  cliques         bigint NOT NULL DEFAULT 0,
  custo_micros    bigint NOT NULL DEFAULT 0,
  conversoes      numeric NOT NULL DEFAULT 0,
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conta_id, data, grupo_id, criterio_id)
);
CREATE TABLE IF NOT EXISTS public.atrib_ads_termos_diarios (
  conta_id        text NOT NULL,
  data            date NOT NULL,
  campanha_id     text NOT NULL,
  grupo_id        text NOT NULL,
  termo           text NOT NULL,
  palavra         text,
  correspondencia text,
  impressoes      bigint NOT NULL DEFAULT 0,
  cliques         bigint NOT NULL DEFAULT 0,
  custo_micros    bigint NOT NULL DEFAULT 0,
  conversoes      numeric NOT NULL DEFAULT 0,
  convenio        text[] GENERATED ALWAYS AS (public.fn_atrib_convenio_detalhes(termo)) STORED,
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conta_id, data, grupo_id, termo)
);
ALTER TABLE public.atrib_ads_palavras_diarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atrib_ads_termos_diarios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.atrib_ads_palavras_diarias, public.atrib_ads_termos_diarios FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_atrib_corresp(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE upper(coalesce(p, ''))
           WHEN 'EXACT' THEN 'e' WHEN 'E' THEN 'e'
           WHEN 'PHRASE' THEN 'p' WHEN 'P' THEN 'p'
           WHEN 'BROAD' THEN 'b' WHEN 'B' THEN 'b'
           ELSE NULL END
$$;

-- Recebe o envio do script (chave pública + token do vault 'atrib_custos_token').
-- Substitui a janela [de, ate] da conta: repetir não duplica.
CREATE OR REPLACE FUNCTION public.fn_atrib_ads_detalhe_receber(p jsonb, p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_tok  text := (SELECT s.decrypted_secret FROM vault.decrypted_secrets s WHERE s.name = 'atrib_custos_token');
  v_conta text := (SELECT c.google_ads_conta_id FROM public.atrib_config c LIMIT 1);
  v_de date; v_ate date; n_p int; n_t int;
BEGIN
  IF v_tok IS NULL OR p_token IS NULL OR length(p_token) < 32 OR p_token <> v_tok THEN
    RAISE EXCEPTION 'não autorizado' USING ERRCODE = '42501';
  END IF;
  IF replace(coalesce(p->>'conta_id', ''), '-', '') <> v_conta THEN
    RAISE EXCEPTION 'conta inesperada: %', p->>'conta_id' USING ERRCODE = '22023';
  END IF;
  v_de := (p->>'de')::date; v_ate := (p->>'ate')::date;
  IF v_de IS NULL OR v_ate IS NULL OR v_ate < v_de OR v_ate - v_de > 31 THEN
    RAISE EXCEPTION 'janela inválida' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.atrib_ads_palavras_diarias WHERE conta_id = v_conta AND data BETWEEN v_de AND v_ate;
  INSERT INTO public.atrib_ads_palavras_diarias
    (conta_id, data, campanha_id, grupo_id, grupo_nome, criterio_id, palavra, correspondencia,
     impressoes, cliques, custo_micros, conversoes)
  SELECT v_conta, (x->>'data')::date, x->>'campanha_id', x->>'grupo_id', left(x->>'grupo_nome', 200),
         x->>'criterio_id', left(lower(x->>'palavra'), 200), public.fn_atrib_corresp(x->>'correspondencia'),
         coalesce((x->>'impressoes')::bigint, 0), coalesce((x->>'cliques')::bigint, 0),
         coalesce((x->>'custo_micros')::bigint, 0), coalesce((x->>'conversoes')::numeric, 0)
  FROM jsonb_array_elements(coalesce(p->'palavras', '[]'::jsonb)) x
  WHERE (x->>'data')::date BETWEEN v_de AND v_ate AND x->>'grupo_id' IS NOT NULL
    AND x->>'criterio_id' IS NOT NULL AND x->>'palavra' IS NOT NULL
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n_p = ROW_COUNT;

  DELETE FROM public.atrib_ads_termos_diarios WHERE conta_id = v_conta AND data BETWEEN v_de AND v_ate;
  INSERT INTO public.atrib_ads_termos_diarios
    (conta_id, data, campanha_id, grupo_id, termo, palavra, correspondencia,
     impressoes, cliques, custo_micros, conversoes)
  SELECT v_conta, (x->>'data')::date, x->>'campanha_id', x->>'grupo_id', left(lower(x->>'termo'), 300),
         left(lower(x->>'palavra'), 200), public.fn_atrib_corresp(x->>'correspondencia'),
         sum(coalesce((x->>'impressoes')::bigint, 0)), sum(coalesce((x->>'cliques')::bigint, 0)),
         sum(coalesce((x->>'custo_micros')::bigint, 0)), sum(coalesce((x->>'conversoes')::numeric, 0))
  FROM jsonb_array_elements(coalesce(p->'termos', '[]'::jsonb)) x
  WHERE (x->>'data')::date BETWEEN v_de AND v_ate AND x->>'grupo_id' IS NOT NULL AND x->>'termo' IS NOT NULL
  GROUP BY 1, 2, 3, 4, 5, 6, 7
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n_t = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'palavras', n_p, 'termos', n_t, 'de', v_de, 'ate', v_ate);
END $$;
REVOKE ALL ON FUNCTION public.fn_atrib_ads_detalhe_receber(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_atrib_ads_detalhe_receber(jsonb, text) TO anon, authenticated, service_role;

-- ── 3. Dados da aba Otimização ────────────────────────────────────────────────
-- Oportunidade × convênio: citou se houve sinal entre 1 dia antes da abertura e 60 dias depois.
CREATE OR REPLACE FUNCTION public.fn_atrib_otimizacao(p_desde date, p_ate date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE r jsonb; v_ord_agendado int := public.fn_atrib_etapa_ord('agendado');
BEGIN
  IF NOT public.fn_atrib_rpc_ok() THEN
    RAISE EXCEPTION 'acesso restrito' USING ERRCODE = '42501';
  END IF;

  WITH op AS (
    SELECT o.id, o.conversa_id, o.aberta_em, o.contato_novo, o.estado,
           public.fn_atrib_etapa_ord(o.etapa_maxima) >= v_ord_agendado AS agendou
      FROM public.atrib_oportunidades o
     WHERE o.aberta_em >= p_desde AND o.aberta_em < p_ate + 1
  ),
  -- Último toque de anúncio do Google de cada oportunidade (grupo/palavra creditados).
  toque AS (
    SELECT DISTINCT ON (t.oportunidade_id) t.oportunidade_id, t.campanha_id, t.campanha_nome,
           t.grupo_id, lower(t.palavra_chave) AS palavra, public.fn_atrib_corresp(t.correspondencia) AS corresp
      FROM public.atrib_toques t
     WHERE t.plataforma = 'google_ads' AND t.oportunidade_id IN (SELECT id FROM op)
     ORDER BY t.oportunidade_id, t.mensagem_em DESC NULLS LAST
  ),
  conv AS (
    SELECT op.id, array_agg(DISTINCT s.detalhe) AS detalhes
      FROM op JOIN public.atrib_sinais s
        ON s.conversa_id = op.conversa_id AND s.tipo = 'convenio'
       AND s.primeiro_em >= op.aberta_em - interval '1 day'
       AND s.primeiro_em <  op.aberta_em + interval '60 days'
     GROUP BY op.id
  ),
  aq AS (
    SELECT a.oportunidade_id, count(*) AS pacientes, sum(a.receita_primeira_sessao) AS r1,
           sum(a.receita_30d) AS r30, sum(a.receita_90d) AS r90
      FROM public.vw_atrib_aquisicoes a
     WHERE a.oportunidade_id IN (SELECT id FROM op)
     GROUP BY a.oportunidade_id
  ),
  base AS (
    SELECT op.*, t.campanha_id, t.campanha_nome, t.grupo_id, t.palavra, t.corresp,
           (t.oportunidade_id IS NOT NULL) AS pago,
           (c.id IS NOT NULL) AS citou, c.detalhes,
           coalesce(aq.pacientes, 0) AS pacientes, coalesce(aq.r1, 0) AS r1,
           coalesce(aq.r30, 0) AS r30, coalesce(aq.r90, 0) AS r90
      FROM op LEFT JOIN toque t ON t.oportunidade_id = op.id
              LEFT JOIN conv c ON c.id = op.id
              LEFT JOIN aq ON aq.oportunidade_id = op.id
  ),
  ads_p AS (
    SELECT campanha_id, grupo_id, max(grupo_nome) AS grupo_nome, palavra, correspondencia AS corresp,
           sum(impressoes) AS impressoes, sum(cliques) AS cliques, sum(custo_micros) / 1e6 AS custo,
           sum(conversoes) AS conversoes_ads
      FROM public.atrib_ads_palavras_diarias
     WHERE data BETWEEN p_desde AND p_ate
     GROUP BY campanha_id, grupo_id, palavra, correspondencia
  ),
  sis_p AS (
    SELECT campanha_id, grupo_id, palavra, corresp, count(*) AS conversas, count(*) FILTER (WHERE agendou) AS agendaram,
           sum(pacientes) AS pacientes, sum(r1) AS receita_1a, sum(r30) AS receita_30d,
           count(*) FILTER (WHERE citou) AS citaram_convenio
      FROM base WHERE pago
     GROUP BY campanha_id, grupo_id, palavra, corresp
  ),
  palavras AS (
    SELECT coalesce(a.campanha_id, s.campanha_id) AS campanha_id,
           coalesce(a.grupo_id, s.grupo_id) AS grupo_id, a.grupo_nome,
           coalesce(a.palavra, s.palavra) AS palavra, coalesce(a.corresp, s.corresp) AS corresp,
           coalesce(a.impressoes, 0) AS impressoes, coalesce(a.cliques, 0) AS cliques,
           round(coalesce(a.custo, 0)::numeric, 2) AS custo, coalesce(a.conversoes_ads, 0) AS conversoes_ads,
           coalesce(s.conversas, 0) AS conversas, coalesce(s.agendaram, 0) AS agendaram,
           coalesce(s.pacientes, 0) AS pacientes, coalesce(s.receita_1a, 0) AS receita_1a,
           coalesce(s.receita_30d, 0) AS receita_30d, coalesce(s.citaram_convenio, 0) AS citaram_convenio
      FROM ads_p a
      FULL JOIN sis_p s ON s.grupo_id = a.grupo_id AND s.palavra = a.palavra
                       AND coalesce(s.corresp, '') = coalesce(a.corresp, '')
  ),
  termos AS (
    SELECT termo, max(palavra) AS palavra, sum(impressoes) AS impressoes, sum(cliques) AS cliques,
           round(sum(custo_micros) / 1e6, 2) AS custo, sum(conversoes) AS conversoes_ads,
           (SELECT array_agg(DISTINCT x) FROM public.atrib_ads_termos_diarios t2, unnest(t2.convenio) x
             WHERE t2.termo = t.termo AND t2.data BETWEEN p_desde AND p_ate) AS convenio
      FROM public.atrib_ads_termos_diarios t
     WHERE data BETWEEN p_desde AND p_ate
     GROUP BY termo
  ),
  conv_grupo AS (
    SELECT g.recorte, g.citou,
           count(*) AS conversas, count(*) FILTER (WHERE agendou) AS agendaram,
           sum(pacientes) AS pacientes, sum(r30) AS receita_30d
      FROM (SELECT b.*, 'pago'::text AS recorte FROM base b WHERE b.pago
            UNION ALL
            SELECT b.*, 'todos_novos'::text FROM base b WHERE b.contato_novo) g
     GROUP BY g.recorte, g.citou
  ),
  conv_det AS (
    SELECT d AS detalhe, count(*) AS conversas, count(*) FILTER (WHERE b.agendou) AS agendaram,
           count(*) FILTER (WHERE b.pago) AS pagas
      FROM base b, unnest(b.detalhes) d
     WHERE b.citou
     GROUP BY d
  )
  SELECT jsonb_build_object(
    'desde', p_desde, 'ate', p_ate, 'gerado_em', now(),
    'detalhe_ads_ultimo', (SELECT max(atualizado_em) FROM public.atrib_ads_palavras_diarias),
    'palavras', coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.custo DESC, x.conversas DESC) FROM palavras x), '[]'),
    'termos', coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.custo DESC) FROM (SELECT * FROM termos ORDER BY custo DESC LIMIT 100) x), '[]'),
    'termos_convenio', (SELECT jsonb_build_object('termos', count(*), 'cliques', coalesce(sum(cliques), 0),
                                                 'custo', coalesce(sum(custo), 0))
                          FROM termos WHERE cardinality(coalesce(convenio, '{}')) > 0),
    'convenio', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM conv_grupo x), '[]'),
    'convenio_detalhes', coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.conversas DESC) FROM conv_det x), '[]')
  ) INTO r;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.fn_atrib_otimizacao(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_atrib_otimizacao(date, date) TO authenticated, service_role;

-- ── 4. Alerta semanal de convênio ─────────────────────────────────────────────
-- Regra (últimos 60 dias, só contatos vindos de anúncio do Google):
--   ≥ 10 contatos que citaram convênio E taxa de agendamento deles < metade da dos
--   demais → recomenda NEGAR_OPERADORAS = true. Também avisa uma vez quando a amostra
--   chega a 10 e a regra manda manter. Destino: WhatsApp do dono (fila ju_avisos_grupo).
CREATE OR REPLACE FUNCTION public.fn_atrib_alerta_convenio()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  d jsonb := public.fn_atrib_otimizacao((now() - interval '60 days')::date, current_date);
  c_n int; c_ag int; o_n int; o_ag int; t_c numeric; t_o numeric; rec text; texto text;
  custo_conv numeric := coalesce((d->'termos_convenio'->>'custo')::numeric, 0);
BEGIN
  SELECT coalesce(sum((x->>'conversas')::int) FILTER (WHERE (x->>'citou')::boolean), 0),
         coalesce(sum((x->>'agendaram')::int) FILTER (WHERE (x->>'citou')::boolean), 0),
         coalesce(sum((x->>'conversas')::int) FILTER (WHERE NOT (x->>'citou')::boolean), 0),
         coalesce(sum((x->>'agendaram')::int) FILTER (WHERE NOT (x->>'citou')::boolean), 0)
    INTO c_n, c_ag, o_n, o_ag
    FROM jsonb_array_elements(d->'convenio') x WHERE x->>'recorte' = 'pago';
  t_c := CASE WHEN c_n > 0 THEN c_ag::numeric / c_n END;
  t_o := CASE WHEN o_n > 0 THEN o_ag::numeric / o_n END;
  rec := CASE WHEN c_n < 10 THEN 'amostra_insuficiente'
              WHEN t_o IS NOT NULL AND t_c < 0.5 * t_o THEN 'negar'
              ELSE 'manter' END;

  IF rec = 'amostra_insuficiente' THEN
    RETURN jsonb_build_object('recomendacao', rec, 'citaram', c_n);
  END IF;
  -- Não repetir a mesma recomendação em menos de 7 dias.
  IF EXISTS (SELECT 1 FROM public.ju_avisos_grupo a WHERE a.origem = 'MARKETING_CONVENIO'
              AND a.created_at > now() - interval '7 days' AND a.texto LIKE '%' || rec || '%') THEN
    RETURN jsonb_build_object('recomendacao', rec, 'citaram', c_n, 'avisado', false);
  END IF;

  texto := '📊 *Google Ads · convênio* (últimos 60 dias, contatos vindos de anúncio)' || E'\n\n' ||
    c_n || ' citaram convênio/plano: ' || c_ag || ' agendaram (' || round(100 * coalesce(t_c, 0)) || '%).' || E'\n' ||
    o_n || ' não citaram: ' || o_ag || ' agendaram (' || round(100 * coalesce(t_o, 0)) || '%).' || E'\n' ||
    'Gasto em buscas com nome de operadora: R$ ' || to_char(custo_conv, 'FM999G990D00') || E'\n\n' ||
    CASE rec
      WHEN 'negar' THEN 'Recomendação: *negar* as operadoras (NEGAR_OPERADORAS = true). Quem cita convênio agenda menos da metade.'
      ELSE 'Recomendação: *manter* as operadoras liberadas — quem cita convênio agenda em ritmo parecido.'
    END || E'\n' || 'Detalhes em Marketing → Otimização. (' || rec || ')';

  INSERT INTO public.ju_avisos_grupo (texto, origem, destino)
  VALUES (texto, 'MARKETING_CONVENIO', '5561981446666@s.whatsapp.net');
  RETURN jsonb_build_object('recomendacao', rec, 'citaram', c_n, 'avisado', true);
END $$;
REVOKE ALL ON FUNCTION public.fn_atrib_alerta_convenio() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('atrib_alerta_convenio') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'atrib_alerta_convenio');
-- Segundas 9h de Brasília (12h UTC).
SELECT cron.schedule('atrib_alerta_convenio', '0 12 * * 1', $$SELECT public.fn_atrib_alerta_convenio()$$);
