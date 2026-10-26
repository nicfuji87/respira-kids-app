-- Ajuste de atribuicao_v2_janela_contagem.sql (26/10/2026): a contagem anônima era pedida a
-- cada rodada enquanto a tabela estava vazia. Agora a hora do pedido fica em atrib_config.
-- (O arquivo principal já foi corrigido; este aplica só a diferença no banco.)
ALTER TABLE public.atrib_config ADD COLUMN IF NOT EXISTS contagem_pedida_em timestamptz;

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
