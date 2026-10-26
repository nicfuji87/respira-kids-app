-- Atribuição v2 — código curto, vínculo por janela de tempo e contagem anônima (26/10/2026)
--
-- Par do site_04_contagem_janela.sql (Supabase do site). Três mudanças:
--
-- 1) Código curto: o site passou a mandar "Vim pelo site (cód. 7K4Q9P)" no começo
--    da mensagem (6 caracteres; internamente RK-7K4Q9P). O formato antigo
--    "Referência: RK-XXXXXXXX" segue reconhecido.
-- 2) Janela de tempo: conversa NOVA que começou sem código é ligada ao clique no
--    WhatsApp que aconteceu pouco antes — só quando há UM clique sem par e UMA
--    conversa candidata no intervalo (15 min se a mensagem fala em "site", 5 min se
--    não). Espera 15 min antes de decidir, para dar tempo de um código chegar. O
--    vínculo fica marcado em atrib_toques.vinculo = 'janela'; se depois aparecer uma
--    mensagem com o código daquele clique, o código vence e o vínculo por horário sai.
--    Quem recusou cookies não tem clique individual gravado no site, então nunca entra.
-- 3) Contagem anônima: visitas vindas de anúncio e cliques no WhatsApp por dia,
--    campanha, grupo e palavra — de TODOS os visitantes, sem identificar ninguém.
--    Importada de hora em hora para atrib_anuncio_contagem_diaria e mostrada na aba
--    Otimização (colunas "chegaram" e "WhatsApp" + funil por campanha).
--
-- Rollback: atribuicao_v2_janela_contagem_rollback.sql

-- ── 1. Estrutura ─────────────────────────────────────────────────────────────
ALTER TABLE public.atrib_toques DROP CONSTRAINT atrib_toques_ref_check;
ALTER TABLE public.atrib_toques ADD CONSTRAINT atrib_toques_ref_check
  CHECK (ref IS NULL OR ref ~ '^RK-([A-HJ-NP-Z2-9]{6}|[A-HJ-NP-Z2-9]{8})$');
ALTER TABLE public.atrib_toques ADD COLUMN vinculo text NOT NULL DEFAULT 'codigo'
  CHECK (vinculo IN ('codigo', 'janela'));
COMMENT ON COLUMN public.atrib_toques.vinculo IS
  'codigo = o código do site veio na mensagem; janela = ligado pelo horário (conversa nova sem código logo depois de um clique sem par).';

ALTER TABLE public.atrib_site_requisicoes DROP CONSTRAINT atrib_site_requisicoes_tipo_check;
ALTER TABLE public.atrib_site_requisicoes ADD CONSTRAINT atrib_site_requisicoes_tipo_check
  CHECK (tipo IN ('clique', 'diario', 'janela', 'contagem'));
ALTER TABLE public.atrib_site_requisicoes ADD COLUMN conversa_id bigint;
ALTER TABLE public.atrib_config ADD COLUMN IF NOT EXISTS contagem_pedida_em timestamptz;

CREATE TABLE public.atrib_janela_avaliacoes (
  conversa_id     bigint PRIMARY KEY REFERENCES public.ju_conversas(id) ON DELETE CASCADE,
  primeira_msg_id bigint,
  primeira_msg_em timestamptz NOT NULL,
  menciona_site   boolean NOT NULL DEFAULT false,
  resultado       text NOT NULL DEFAULT 'pendente'
                  CHECK (resultado IN ('pendente', 'vinculado', 'sem_clique', 'ambiguo', 'com_codigo', 'substituido', 'erro')),
  ref             text,
  candidatos      int,
  tentativas      int NOT NULL DEFAULT 0,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  avaliado_em     timestamptz
);
ALTER TABLE public.atrib_janela_avaliacoes ENABLE ROW LEVEL SECURITY;
CREATE INDEX atrib_janela_avaliacoes_pend_idx ON public.atrib_janela_avaliacoes (primeira_msg_em) WHERE resultado = 'pendente';
COMMENT ON TABLE public.atrib_janela_avaliacoes IS
  'Conversas novas que começaram sem código do site e o resultado da tentativa de ligar ao clique pelo horário.';

CREATE TABLE public.atrib_anuncio_contagem_diaria (
  dia             date NOT NULL,
  evento          text NOT NULL CHECK (evento IN ('visita', 'whatsapp')),
  plataforma      text NOT NULL CHECK (plataforma IN ('google_ads', 'meta_ads')),
  campanha_id     text NOT NULL DEFAULT '',
  grupo_id        text NOT NULL DEFAULT '',
  termo           text NOT NULL DEFAULT '',
  correspondencia text NOT NULL DEFAULT '',
  dispositivo     text NOT NULL DEFAULT '',
  pagina          text NOT NULL DEFAULT '',
  escolha         text NOT NULL CHECK (escolha IN ('aceitou', 'recusou', 'sem_escolha')),
  contagem        int NOT NULL,
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dia, evento, plataforma, campanha_id, grupo_id, termo, correspondencia, dispositivo, pagina, escolha)
);
ALTER TABLE public.atrib_anuncio_contagem_diaria ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.atrib_anuncio_contagem_diaria IS
  'Cópia da contagem anônima do site (anuncio_contagem_diaria): visitas de anúncio e cliques no WhatsApp por dia. Sem identificar pessoas.';

-- ── 2. Captura do código (curto e antigo) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_atrib_extrair_codigos(p text)
RETURNS SETOF text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT 'RK-' || m[1] FROM regexp_matches(p, 'RK-([A-HJ-NP-Z2-9]{8}|[A-HJ-NP-Z2-9]{6})(?![A-Za-z0-9])', 'g') m
  UNION
  SELECT 'RK-' || m[1] FROM regexp_matches(p, '[Cc][óoÓO][dD](?:igo)?\.?:?\s*([A-HJ-NP-Z2-9]{6})(?![A-Za-z0-9])', 'g') m
$$;

CREATE OR REPLACE FUNCTION public.fn_atrib_capturar_mensagem()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_ref text; v_op bigint; v_t bigint; v_ex record;
BEGIN
  IF NEW.origem IS DISTINCT FROM 'CLIENTE' OR NEW.conteudo IS NULL
     OR (NEW.conteudo !~ 'RK-[A-HJ-NP-Z2-9]{6}' AND NEW.conteudo !~* 'c[óo]d') THEN
    RETURN NULL;
  END IF;
  BEGIN
    FOR v_ref IN SELECT DISTINCT c FROM public.fn_atrib_extrair_codigos(NEW.conteudo) c LOOP
      SELECT t.id, t.conversa_id, t.oportunidade_id, t.vinculo INTO v_ex FROM public.atrib_toques t WHERE t.ref = v_ref;
      IF FOUND THEN
        -- O código na mensagem vence o vínculo feito pelo horário com outra conversa: o toque
        -- muda de dono (atrib_eventos é só de inserção — a troca fica registrada lá).
        CONTINUE WHEN v_ex.vinculo <> 'janela' OR v_ex.conversa_id = NEW.conversa_id;
        v_op := public.fn_atrib_oportunidade_para(NEW.conversa_id, coalesce(NEW.created_at, now()), 'toque');
        CONTINUE WHEN v_op IS NULL;
        UPDATE public.atrib_toques
           SET oportunidade_id = v_op, conversa_id = NEW.conversa_id, mensagem_id = NEW.id,
               mensagem_em = coalesce(NEW.created_at, now()), vinculo = 'codigo'
         WHERE id = v_ex.id;
        INSERT INTO public.atrib_eventos (oportunidade_id, tipo, valor_novo, fonte, ocorrido_em, chave)
        VALUES (v_ex.oportunidade_id, 'revisao', 'vínculo por horário desfeito: o código ' || v_ref || ' chegou em outra conversa',
                'sistema', now(), 'janela_desfeita:' || v_ref)
        ON CONFLICT (chave) DO NOTHING;
        INSERT INTO public.atrib_eventos (oportunidade_id, tipo, valor_novo, fonte, ocorrido_em, chave)
        VALUES (v_op, 'toque', v_ref, 'sistema', coalesce(NEW.created_at, now()), 'toque:' || v_ref || ':codigo')
        ON CONFLICT (chave) DO NOTHING;
        UPDATE public.atrib_janela_avaliacoes SET resultado = 'substituido', avaliado_em = now()
         WHERE conversa_id = v_ex.conversa_id;
        CONTINUE;
      END IF;
      v_op := public.fn_atrib_oportunidade_para(NEW.conversa_id, coalesce(NEW.created_at, now()), 'toque');
      CONTINUE WHEN v_op IS NULL;   -- equipe, teste ou conversa fictícia
      INSERT INTO public.atrib_toques (oportunidade_id, conversa_id, mensagem_id, ref, origem_tipo, mensagem_em)
      VALUES (v_op, NEW.conversa_id, NEW.id, v_ref, 'site', coalesce(NEW.created_at, now()))
      ON CONFLICT (ref) DO NOTHING
      RETURNING id INTO v_t;
      IF v_t IS NOT NULL THEN
        INSERT INTO public.atrib_eventos (oportunidade_id, tipo, valor_novo, fonte, ocorrido_em, chave)
        VALUES (v_op, 'toque', v_ref, 'sistema', coalesce(NEW.created_at, now()), 'toque:' || v_ref)
        ON CONFLICT (chave) DO NOTHING;
      END IF;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.atrib_erros (etapa, referencia, detalhe) VALUES ('captura', NEW.id::text, SQLERRM);
  END;
  RETURN NULL;
END $function$;

-- ── 3. Vínculo por janela de tempo ────────────────────────────────────────────
-- Recebe a resposta do site (cliques sem par no intervalo) e decide.
CREATE OR REPLACE FUNCTION public.fn_atrib_janela_aplicar(p_conversa bigint, p_body jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  a public.atrib_janela_avaliacoes;
  v_n int; v_ref text; v_clk timestamptz; v_outros int; v_op bigint; v_t bigint;
BEGIN
  SELECT * INTO a FROM public.atrib_janela_avaliacoes WHERE conversa_id = p_conversa FOR UPDATE;
  IF NOT FOUND OR a.resultado <> 'pendente' THEN RETURN 'ignorado'; END IF;

  -- o código chegou enquanto esperávamos: nada a fazer
  IF EXISTS (SELECT 1 FROM public.atrib_toques t WHERE t.conversa_id = p_conversa AND t.ref IS NOT NULL) THEN
    UPDATE public.atrib_janela_avaliacoes SET resultado = 'com_codigo', avaliado_em = now() WHERE conversa_id = p_conversa;
    RETURN 'com_codigo';
  END IF;

  IF p_body IS NULL OR jsonb_typeof(p_body) <> 'array' THEN
    UPDATE public.atrib_janela_avaliacoes
       SET tentativas = tentativas + 1, resultado = CASE WHEN tentativas + 1 >= 3 THEN 'erro' ELSE 'pendente' END,
           avaliado_em = now()
     WHERE conversa_id = p_conversa;
    RETURN 'erro';
  END IF;

  SELECT count(*), min(x.ref), min(x.em) INTO v_n, v_ref, v_clk
    FROM (SELECT e->>'ref' AS ref, (e->>'criado_em')::timestamptz AS em
            FROM jsonb_array_elements(p_body) e
           WHERE (e->>'ref') ~ '^RK-([A-HJ-NP-Z2-9]{6}|[A-HJ-NP-Z2-9]{8})$'
             AND NOT EXISTS (SELECT 1 FROM public.atrib_toques t WHERE t.ref = e->>'ref')) x;

  IF v_n = 0 THEN
    UPDATE public.atrib_janela_avaliacoes SET resultado = 'sem_clique', candidatos = 0, avaliado_em = now() WHERE conversa_id = p_conversa;
    RETURN 'sem_clique';
  ELSIF v_n > 1 THEN
    UPDATE public.atrib_janela_avaliacoes SET resultado = 'ambiguo', candidatos = v_n, avaliado_em = now() WHERE conversa_id = p_conversa;
    RETURN 'ambiguo';
  END IF;

  -- unicidade do outro lado: nenhuma OUTRA conversa nova sem código começou logo depois do mesmo clique
  SELECT count(*) INTO v_outros
    FROM public.atrib_janela_avaliacoes x
   WHERE x.conversa_id <> p_conversa
     AND x.resultado NOT IN ('com_codigo', 'substituido')
     AND x.primeira_msg_em BETWEEN v_clk
         AND v_clk + make_interval(mins => CASE WHEN x.menciona_site THEN 15 ELSE 5 END) + interval '1 minute';
  IF v_outros > 0 THEN
    UPDATE public.atrib_janela_avaliacoes SET resultado = 'ambiguo', candidatos = 1 + v_outros, avaliado_em = now() WHERE conversa_id = p_conversa;
    RETURN 'ambiguo';
  END IF;

  v_op := public.fn_atrib_oportunidade_para(p_conversa, a.primeira_msg_em, 'toque');
  IF v_op IS NULL THEN
    UPDATE public.atrib_janela_avaliacoes SET resultado = 'erro', avaliado_em = now() WHERE conversa_id = p_conversa;
    RETURN 'erro';
  END IF;

  INSERT INTO public.atrib_toques (oportunidade_id, conversa_id, mensagem_id, ref, origem_tipo, vinculo, mensagem_em)
  VALUES (v_op, p_conversa, a.primeira_msg_id, v_ref, 'site', 'janela', a.primeira_msg_em)
  ON CONFLICT (ref) DO NOTHING
  RETURNING id INTO v_t;
  IF v_t IS NULL THEN
    UPDATE public.atrib_janela_avaliacoes SET resultado = 'ambiguo', candidatos = 1, avaliado_em = now() WHERE conversa_id = p_conversa;
    RETURN 'ambiguo';
  END IF;
  INSERT INTO public.atrib_eventos (oportunidade_id, tipo, valor_novo, fonte, ocorrido_em, chave)
  VALUES (v_op, 'toque', v_ref, 'sistema', a.primeira_msg_em, 'toque:' || v_ref)
  ON CONFLICT (chave) DO NOTHING;
  UPDATE public.atrib_janela_avaliacoes SET resultado = 'vinculado', ref = v_ref, candidatos = 1, avaliado_em = now()
   WHERE conversa_id = p_conversa;
  RETURN 'vinculado';
END $function$;
REVOKE ALL ON FUNCTION public.fn_atrib_janela_aplicar(bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_atrib_extrair_codigos(text) FROM PUBLIC, anon;

-- ── 4. Job de busca no site (clique, diário, janela, contagem) ────────────────
CREATE OR REPLACE FUNCTION public.fn_atrib_buscar_cliques()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  r       record;
  v_resp  record;
  v_body  jsonb;
  v_req   bigint;
  v_max   int := (SELECT k.busca_max_tentativas FROM public.atrib_config k WHERE k.id = 1);
  v_ok    int := 0; v_nao int := 0; v_env int := 0; v_err int := 0; v_jan int := 0;
  v_hoje  date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('atrib_buscar_cliques')) THEN RETURN '{"ocupado":true}'; END IF;

  -- 1) respostas que já voltaram
  FOR r IN SELECT q.* FROM public.atrib_site_requisicoes q LOOP
    SELECT h.status_code, h.content, h.timed_out, h.error_msg INTO v_resp
      FROM net._http_response h WHERE h.id = r.req_id;
    IF NOT FOUND THEN
      IF r.criado_em < now() - interval '15 minutes' THEN       -- perdida: tenta de novo
        DELETE FROM public.atrib_site_requisicoes WHERE req_id = r.req_id;
        IF r.tipo = 'clique' THEN
          UPDATE public.atrib_toques SET proxima_busca_em = now() WHERE id = r.toque_id AND clique_status = 'pendente';
        END IF;
      END IF;
      CONTINUE;
    END IF;
    DELETE FROM public.atrib_site_requisicoes WHERE req_id = r.req_id;
    IF v_resp.status_code IS DISTINCT FROM 200 THEN
      v_err := v_err + 1;
      INSERT INTO public.atrib_erros (etapa, referencia, detalhe)
      VALUES ('site_' || r.tipo, coalesce(r.toque_id::text, r.conversa_id::text, r.req_id::text),
              left(coalesce(v_resp.status_code::text, 'sem status') || ' ' || coalesce(v_resp.error_msg, v_resp.content, ''), 500));
      IF r.tipo = 'clique' THEN
        UPDATE public.atrib_toques
           SET clique_tentativas = clique_tentativas + 1,
               clique_status = CASE WHEN clique_tentativas + 1 >= v_max THEN 'nao_encontrado' ELSE 'pendente' END,
               proxima_busca_em = CASE WHEN clique_tentativas + 1 >= v_max THEN NULL
                                       ELSE now() + make_interval(mins => 5 * power(3, clique_tentativas)::int) END
         WHERE id = r.toque_id;
      ELSIF r.tipo = 'janela' THEN
        PERFORM public.fn_atrib_janela_aplicar(r.conversa_id, NULL);
      END IF;
      CONTINUE;
    END IF;
    BEGIN
      v_body := v_resp.content::jsonb;
    EXCEPTION WHEN OTHERS THEN v_body := NULL;
    END;
    IF r.tipo = 'clique' THEN
      IF coalesce((v_body->>'encontrado')::boolean, false) THEN
        PERFORM public.fn_atrib_aplicar_clique(r.toque_id, v_body->'clique');
        v_ok := v_ok + 1;
      ELSE
        -- o registro do clique pode chegar depois da mensagem: tenta de novo (5, 15, 45 min…)
        UPDATE public.atrib_toques
           SET clique_tentativas = clique_tentativas + 1,
               clique_status = CASE WHEN clique_tentativas + 1 >= v_max THEN 'nao_encontrado' ELSE 'pendente' END,
               proxima_busca_em = CASE WHEN clique_tentativas + 1 >= v_max THEN NULL
                                       ELSE now() + make_interval(mins => 5 * power(3, clique_tentativas)::int) END
         WHERE id = r.toque_id;
        v_nao := v_nao + 1;
      END IF;
    ELSIF r.tipo = 'diario' AND jsonb_typeof(v_body) = 'array' THEN
      INSERT INTO public.atrib_cliques_whatsapp_diarios (dia, canal, campanha_id, campanha_nome, cliques, atualizado_em)
      SELECT (e->>'dia')::date, ch.canal, coalesce(e->>'utm_id', ''), max(e->>'utm_campaign'), sum((e->>'cliques')::int), now()
        FROM jsonb_array_elements(v_body) e
        CROSS JOIN LATERAL public.fn_atrib_canal(e->>'utm_source', e->>'utm_medium', e->>'referrer_host') ch
       GROUP BY 1, 2, 3
      ON CONFLICT (dia, canal, campanha_id) DO UPDATE
        SET cliques = excluded.cliques, campanha_nome = excluded.campanha_nome, atualizado_em = now();
    ELSIF r.tipo = 'janela' THEN
      IF public.fn_atrib_janela_aplicar(r.conversa_id, v_body) = 'vinculado' THEN v_jan := v_jan + 1; END IF;
    ELSIF r.tipo = 'contagem' AND jsonb_typeof(v_body) = 'array' THEN
      -- substitui a janela pedida (últimos 7 dias): o site devolve os totais completos
      DELETE FROM public.atrib_anuncio_contagem_diaria WHERE dia >= v_hoje - 7;
      INSERT INTO public.atrib_anuncio_contagem_diaria
        (dia, evento, plataforma, campanha_id, grupo_id, termo, correspondencia, dispositivo, pagina, escolha, contagem, atualizado_em)
      SELECT (e->>'dia')::date, e->>'evento', e->>'plataforma', coalesce(e->>'campanha', ''), coalesce(e->>'grupo', ''),
             coalesce(e->>'termo', ''), coalesce(e->>'correspondencia', ''), coalesce(e->>'dispositivo', ''),
             coalesce(e->>'pagina', ''), e->>'escolha', (e->>'contagem')::int, now()
        FROM jsonb_array_elements(v_body) e
       WHERE (e->>'dia')::date >= v_hoje - 7
      ON CONFLICT (dia, evento, plataforma, campanha_id, grupo_id, termo, correspondencia, dispositivo, pagina, escolha)
      DO UPDATE SET contagem = excluded.contagem, atualizado_em = now();
    END IF;
  END LOOP;

  -- 2) novos pedidos de clique (no máximo 20 por rodada)
  FOR r IN SELECT t.id, t.ref FROM public.atrib_toques t
            WHERE t.clique_status = 'pendente' AND t.ref IS NOT NULL AND t.proxima_busca_em <= now()
              AND NOT EXISTS (SELECT 1 FROM public.atrib_site_requisicoes q WHERE q.toque_id = t.id)
            ORDER BY t.proxima_busca_em LIMIT 20 LOOP
    v_req := public.fn_atrib_site_post('obter_contato_clique_app', jsonb_build_object('p_ref', r.ref));
    EXIT WHEN v_req IS NULL;   -- segredos ainda não configurados
    INSERT INTO public.atrib_site_requisicoes (req_id, tipo, toque_id) VALUES (v_req, 'clique', r.id);
    v_env := v_env + 1;
  END LOOP;

  -- 3) contagem diária de cliques no WhatsApp (uma vez por hora, últimos 7 dias)
  IF NOT EXISTS (SELECT 1 FROM public.atrib_site_requisicoes q WHERE q.tipo = 'diario')
     AND coalesce((SELECT max(d.atualizado_em) FROM public.atrib_cliques_whatsapp_diarios d), '-infinity') < now() - interval '1 hour' THEN
    v_req := public.fn_atrib_site_post('contato_cliques_diarios_app', jsonb_build_object('p_desde', v_hoje - 7));
    IF v_req IS NOT NULL THEN
      INSERT INTO public.atrib_site_requisicoes (req_id, tipo) VALUES (v_req, 'diario');
    END IF;
  END IF;

  -- 4) janela de tempo: registra conversas novas que começaram sem código…
  INSERT INTO public.atrib_janela_avaliacoes (conversa_id, primeira_msg_id, primeira_msg_em, menciona_site)
  SELECT c.id, pm.id, pm.created_at, coalesce(pm.conteudo ~* 'site', false)
    FROM public.ju_conversas c
    CROSS JOIN LATERAL (SELECT m.id, m.origem, m.created_at, m.conteudo FROM public.ju_mensagens m
                         WHERE m.conversa_id = c.id ORDER BY m.created_at, m.id LIMIT 1) pm
   WHERE c.created_at > now() - interval '3 hours'
     AND pm.origem = 'CLIENTE' AND pm.created_at > now() - interval '3 hours'
     AND NOT public.fn_atrib_excluida(c.wa_chatid, c.telefone)
     AND NOT EXISTS (SELECT 1 FROM public.atrib_toques t WHERE t.conversa_id = c.id AND t.ref IS NOT NULL)
     AND NOT EXISTS (SELECT 1 FROM public.atrib_janela_avaliacoes a WHERE a.conversa_id = c.id)
     AND public.fn_atrib_contato_novo(public.fn_atrib_tel_chave(c.telefone), c.id, pm.created_at)
  ON CONFLICT (conversa_id) DO NOTHING;

  -- …e, 15 min depois (tempo para um código chegar), pede ao site os cliques sem par do intervalo
  FOR r IN SELECT a.conversa_id, a.primeira_msg_em, a.menciona_site FROM public.atrib_janela_avaliacoes a
            WHERE a.resultado = 'pendente' AND a.primeira_msg_em <= now() - interval '15 minutes'
              AND NOT EXISTS (SELECT 1 FROM public.atrib_site_requisicoes q WHERE q.tipo = 'janela' AND q.conversa_id = a.conversa_id)
            ORDER BY a.primeira_msg_em LIMIT 10 LOOP
    IF EXISTS (SELECT 1 FROM public.atrib_toques t WHERE t.conversa_id = r.conversa_id AND t.ref IS NOT NULL) THEN
      UPDATE public.atrib_janela_avaliacoes SET resultado = 'com_codigo', avaliado_em = now() WHERE conversa_id = r.conversa_id;
      CONTINUE;
    END IF;
    v_req := public.fn_atrib_site_post('contato_cliques_janela_app', jsonb_build_object(
               'p_de', r.primeira_msg_em - make_interval(mins => CASE WHEN r.menciona_site THEN 15 ELSE 5 END),
               'p_ate', r.primeira_msg_em + interval '1 minute'));
    EXIT WHEN v_req IS NULL;
    INSERT INTO public.atrib_site_requisicoes (req_id, tipo, conversa_id) VALUES (v_req, 'janela', r.conversa_id);
  END LOOP;

  -- 5) contagem anônima de anúncio (uma vez a cada 30 min, últimos 7 dias). A hora do
  --    pedido fica em atrib_config: com a contagem vazia, max(atualizado_em) não serve.
  IF NOT EXISTS (SELECT 1 FROM public.atrib_site_requisicoes q WHERE q.tipo = 'contagem')
     AND coalesce((SELECT k.contagem_pedida_em FROM public.atrib_config k WHERE k.id = 1), '-infinity') < now() - interval '30 minutes' THEN
    v_req := public.fn_atrib_site_post('anuncio_contagem_diaria_app', jsonb_build_object('p_desde', v_hoje - 7));
    IF v_req IS NOT NULL THEN
      INSERT INTO public.atrib_site_requisicoes (req_id, tipo) VALUES (v_req, 'contagem');
      UPDATE public.atrib_config SET contagem_pedida_em = now() WHERE id = 1;
    END IF;
  END IF;

  RETURN jsonb_build_object('encontrados', v_ok, 'nao_encontrados', v_nao, 'enviados', v_env, 'erros', v_err,
                            'janela_vinculados', v_jan);
END $function$;

-- ── 5. Aba Otimização: chegaram / clicaram no WhatsApp + funil por campanha ────
CREATE OR REPLACE FUNCTION public.fn_atrib_otimizacao(p_desde date, p_ate date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
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
           t.grupo_id, lower(t.palavra_chave) AS palavra, public.fn_atrib_corresp(t.correspondencia) AS corresp,
           t.vinculo
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
    SELECT op.*, t.campanha_id, t.campanha_nome, t.grupo_id, t.palavra, t.corresp, t.vinculo,
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
  -- Contagem anônima do site (todos os visitantes, inclusive quem recusou cookies).
  anon AS (
    SELECT campanha_id, grupo_id, lower(termo) AS palavra, public.fn_atrib_corresp(correspondencia) AS corresp,
           sum(contagem) FILTER (WHERE evento = 'visita') AS visitas,
           sum(contagem) FILTER (WHERE evento = 'whatsapp') AS whatsapp
      FROM public.atrib_anuncio_contagem_diaria
     WHERE plataforma = 'google_ads' AND dia BETWEEN p_desde AND p_ate
     GROUP BY 1, 2, 3, 4
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
  palavras2 AS (
    SELECT p.*, coalesce(n.visitas, 0) AS visitas, coalesce(n.whatsapp, 0) AS whatsapp
      FROM palavras p
      LEFT JOIN anon n ON n.grupo_id = p.grupo_id AND n.palavra = p.palavra
                      AND coalesce(n.corresp, '') = coalesce(p.corresp, '')
  ),
  -- Funil por campanha: clique no anúncio → chegou ao site → clicou no WhatsApp → conversa.
  funil AS (
    SELECT c.campanha_id,
           coalesce((SELECT sum(cliques) FROM ads_p a WHERE a.campanha_id = c.campanha_id), 0) AS cliques_anuncio,
           coalesce((SELECT round(sum(custo)::numeric, 2) FROM ads_p a WHERE a.campanha_id = c.campanha_id), 0) AS custo,
           coalesce(sum(n.contagem) FILTER (WHERE n.evento = 'visita'), 0) AS visitas,
           coalesce(sum(n.contagem) FILTER (WHERE n.evento = 'whatsapp'), 0) AS whatsapp,
           coalesce(sum(n.contagem) FILTER (WHERE n.evento = 'visita' AND n.escolha = 'aceitou'), 0) AS visitas_aceitaram,
           coalesce(sum(n.contagem) FILTER (WHERE n.evento = 'visita' AND n.escolha = 'recusou'), 0) AS visitas_recusaram,
           coalesce(sum(n.contagem) FILTER (WHERE n.evento = 'whatsapp' AND n.escolha = 'recusou'), 0) AS whatsapp_recusaram,
           coalesce((SELECT count(*) FROM base b WHERE b.pago AND b.campanha_id = c.campanha_id), 0) AS conversas,
           coalesce((SELECT count(*) FROM base b WHERE b.pago AND b.campanha_id = c.campanha_id AND b.vinculo = 'janela'), 0) AS conversas_por_horario,
           coalesce((SELECT count(*) FROM base b WHERE b.pago AND b.campanha_id = c.campanha_id AND b.agendou), 0) AS agendaram
      FROM (SELECT campanha_id FROM ads_p
            UNION SELECT campanha_id FROM public.atrib_anuncio_contagem_diaria
                   WHERE plataforma = 'google_ads' AND dia BETWEEN p_desde AND p_ate
            UNION SELECT campanha_id FROM base WHERE pago) c
      LEFT JOIN public.atrib_anuncio_contagem_diaria n
             ON n.campanha_id = c.campanha_id AND n.plataforma = 'google_ads' AND n.dia BETWEEN p_desde AND p_ate
     WHERE coalesce(c.campanha_id, '') <> ''
     GROUP BY c.campanha_id
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
    'contagem_ultima', (SELECT max(atualizado_em) FROM public.atrib_anuncio_contagem_diaria),
    'palavras', coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.custo DESC, x.conversas DESC) FROM palavras2 x), '[]'),
    'funil', coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.cliques_anuncio DESC) FROM funil x), '[]'),
    'termos', coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.custo DESC) FROM (SELECT * FROM termos ORDER BY custo DESC LIMIT 100) x), '[]'),
    'termos_convenio', (SELECT jsonb_build_object('termos', count(*), 'cliques', coalesce(sum(cliques), 0),
                                                 'custo', coalesce(sum(custo), 0))
                          FROM termos WHERE cardinality(coalesce(convenio, '{}')) > 0),
    'convenio', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM conv_grupo x), '[]'),
    'convenio_detalhes', coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.conversas DESC) FROM conv_det x), '[]')
  ) INTO r;
  RETURN r;
END $function$;
REVOKE ALL ON FUNCTION public.fn_atrib_otimizacao(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_atrib_otimizacao(date, date) TO authenticated, service_role;
