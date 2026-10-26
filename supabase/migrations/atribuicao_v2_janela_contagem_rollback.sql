-- Desfaz atribuicao_v2_janela_contagem.sql (restaura as funções exatamente como estavam
-- em 26/10/2026, antes da mudança). Rode ANTES o rollback do site se for voltar o código
-- de 8 caracteres; toques com código de 6 caracteres são apagados aqui.

-- atrib_eventos é só de inserção: os eventos desses toques ficam no histórico.
DELETE FROM public.atrib_site_requisicoes q USING public.atrib_toques t
 WHERE q.toque_id = t.id AND (t.vinculo = 'janela' OR t.ref ~ '^RK-[A-HJ-NP-Z2-9]{6}$');
DELETE FROM public.atrib_toques WHERE vinculo = 'janela' OR ref ~ '^RK-[A-HJ-NP-Z2-9]{6}$';
DELETE FROM public.atrib_site_requisicoes WHERE tipo IN ('janela', 'contagem');

CREATE OR REPLACE FUNCTION public.fn_atrib_capturar_mensagem()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_ref text; v_op bigint; v_t bigint;
BEGIN
  IF NEW.origem IS DISTINCT FROM 'CLIENTE' OR NEW.conteudo IS NULL
     OR NEW.conteudo !~ 'RK-[A-HJ-NP-Z2-9]{8}' THEN
    RETURN NULL;
  END IF;
  BEGIN
    FOR v_ref IN SELECT DISTINCT (regexp_matches(NEW.conteudo, 'RK-[A-HJ-NP-Z2-9]{8}', 'g'))[1] LOOP
      CONTINUE WHEN EXISTS (SELECT 1 FROM public.atrib_toques t WHERE t.ref = v_ref);
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

CREATE OR REPLACE FUNCTION public.fn_atrib_buscar_cliques()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  r       record;
  v_resp  record;
  v_body  jsonb;
  v_req   bigint;
  v_max   int := (SELECT k.busca_max_tentativas FROM public.atrib_config k WHERE k.id = 1);
  v_ok    int := 0; v_nao int := 0; v_env int := 0; v_err int := 0;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('atrib_buscar_cliques')) THEN RETURN '{"ocupado":true}'; END IF;
  FOR r IN SELECT q.* FROM public.atrib_site_requisicoes q LOOP
    SELECT h.status_code, h.content, h.timed_out, h.error_msg INTO v_resp
      FROM net._http_response h WHERE h.id = r.req_id;
    IF NOT FOUND THEN
      IF r.criado_em < now() - interval '15 minutes' THEN
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
      VALUES ('site_' || r.tipo, coalesce(r.toque_id::text, r.req_id::text),
              left(coalesce(v_resp.status_code::text, 'sem status') || ' ' || coalesce(v_resp.error_msg, v_resp.content, ''), 500));
      IF r.tipo = 'clique' THEN
        UPDATE public.atrib_toques
           SET clique_tentativas = clique_tentativas + 1,
               clique_status = CASE WHEN clique_tentativas + 1 >= v_max THEN 'nao_encontrado' ELSE 'pendente' END,
               proxima_busca_em = CASE WHEN clique_tentativas + 1 >= v_max THEN NULL
                                       ELSE now() + make_interval(mins => 5 * power(3, clique_tentativas)::int) END
         WHERE id = r.toque_id;
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
    END IF;
  END LOOP;
  FOR r IN SELECT t.id, t.ref FROM public.atrib_toques t
            WHERE t.clique_status = 'pendente' AND t.ref IS NOT NULL AND t.proxima_busca_em <= now()
              AND NOT EXISTS (SELECT 1 FROM public.atrib_site_requisicoes q WHERE q.toque_id = t.id)
            ORDER BY t.proxima_busca_em LIMIT 20 LOOP
    v_req := public.fn_atrib_site_post('obter_contato_clique_app', jsonb_build_object('p_ref', r.ref));
    EXIT WHEN v_req IS NULL;
    INSERT INTO public.atrib_site_requisicoes (req_id, tipo, toque_id) VALUES (v_req, 'clique', r.id);
    v_env := v_env + 1;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM public.atrib_site_requisicoes q WHERE q.tipo = 'diario')
     AND coalesce((SELECT max(d.atualizado_em) FROM public.atrib_cliques_whatsapp_diarios d), '-infinity') < now() - interval '1 hour' THEN
    v_req := public.fn_atrib_site_post('contato_cliques_diarios_app',
               jsonb_build_object('p_desde', (now() AT TIME ZONE 'America/Sao_Paulo')::date - 7));
    IF v_req IS NOT NULL THEN
      INSERT INTO public.atrib_site_requisicoes (req_id, tipo) VALUES (v_req, 'diario');
    END IF;
  END IF;
  RETURN jsonb_build_object('encontrados', v_ok, 'nao_encontrados', v_nao, 'enviados', v_env, 'erros', v_err);
END $function$;

-- fn_atrib_otimizacao: reaplicar o bloco "3. Dados da aba Otimização" de
-- atribuicao_v2_otimizacao.sql (idêntico ao que estava no banco em 26/10/2026).

DROP FUNCTION IF EXISTS public.fn_atrib_janela_aplicar(bigint, jsonb);
DROP FUNCTION IF EXISTS public.fn_atrib_extrair_codigos(text);
DROP TABLE IF EXISTS public.atrib_janela_avaliacoes;
DROP TABLE IF EXISTS public.atrib_anuncio_contagem_diaria;
ALTER TABLE public.atrib_site_requisicoes DROP COLUMN IF EXISTS conversa_id;
ALTER TABLE public.atrib_config DROP COLUMN IF EXISTS contagem_pedida_em;
ALTER TABLE public.atrib_site_requisicoes DROP CONSTRAINT atrib_site_requisicoes_tipo_check;
ALTER TABLE public.atrib_site_requisicoes ADD CONSTRAINT atrib_site_requisicoes_tipo_check
  CHECK (tipo IN ('clique', 'diario'));
ALTER TABLE public.atrib_toques DROP COLUMN IF EXISTS vinculo;
ALTER TABLE public.atrib_toques DROP CONSTRAINT atrib_toques_ref_check;
ALTER TABLE public.atrib_toques ADD CONSTRAINT atrib_toques_ref_check
  CHECK (ref IS NULL OR ref ~ '^RK-[A-HJ-NP-Z2-9]{8}$');
