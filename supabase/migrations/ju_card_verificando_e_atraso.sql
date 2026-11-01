-- 01/11/2026 (pedido do dono):
-- 1. "👀 Estou verificando" no card do pedido (🔔 Notificações): quem toca avisa a família pela Ju
--    ("A equipe já está vendo um horário…") e o card volta só com "✅ Concluído", dizendo quem está vendo.
--    Fim de semana a notificação chegava, as fisios viam, mas a família ficava sem retorno.
-- 2. Aviso de atraso no grupo: a Ju responde "Obrigada por avisar!" e também posta no 🔔 um aviso com
--    "✅ Ok", que só apaga o aviso (nada vai para a família).

-- ---------------------------------------------------------------- 1. Estou verificando
ALTER TABLE public.ju_solicitacoes
  ADD COLUMN IF NOT EXISTS verificando_por text,
  ADD COLUMN IF NOT EXISTS verificando_em timestamptz;

DO $mig$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_card(bigint)'::regprocedure);
  n := replace(d, $a$|| E'\n\nQuando terminar, toque em Concluído ou tire a etiqueta da conversa.')$a$,
    $a$|| CASE WHEN s.verificando_por IS NOT NULL
              THEN E'\n\n👀 *' || s.verificando_por || '* está verificando desde '
                   || to_char(s.verificando_em AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') || '.'
              ELSE '' END
        || E'\n\nQuando terminar, toque em Concluído ou tire a etiqueta da conversa.')$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_card: trecho não encontrado'; END IF;
  EXECUTE n;
END
$mig$;

CREATE OR REPLACE FUNCTION public.fn_ju_verificar(p_solicitacao_id bigint, p_quem text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE s public.ju_solicitacoes; c public.ju_conversas; v_nome text; v_msg text;
BEGIN
  SELECT * INTO s FROM public.ju_solicitacoes WHERE id = p_solicitacao_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'NAO_ENCONTRADO'); END IF;
  IF s.status <> 'ABERTA' THEN RETURN jsonb_build_object('ok', false, 'motivo', 'CONCLUIDO'); END IF;
  IF s.verificando_por IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'JA_VERIFICANDO'); END IF;

  v_nome := nullif(btrim(coalesce(p_quem, '')), '');
  IF v_nome IS NULL OR v_nome ~* '^(alguém|alguem|recep)' THEN v_nome := 'Recepção'; END IF;
  UPDATE public.ju_solicitacoes SET verificando_por = v_nome, verificando_em = now() WHERE id = s.id;

  SELECT * INTO c FROM public.ju_conversas WHERE id = s.conversa_id;
  -- a família não fica sabendo qual fisio (regra dos casos motores): sempre "a equipe"
  IF NOT coalesce(c.sem_ia, false) AND c.wa_chatid ~ '@(s\.whatsapp\.net|lid)$' THEN
    v_msg := CASE
      WHEN s.tipo IN ('AGENDAMENTO', 'REMARCACAO', 'ENCAIXE')
        THEN 'A equipe já está organizando um horário para vocês e responde por aqui em breve.'
      WHEN s.tipo = 'CLINICO'
        THEN 'A equipe já viu sua mensagem e responde por aqui em breve.'
      ELSE 'A equipe já está vendo o seu pedido e responde por aqui em breve.' END;
    -- o eco da mensagem (enviada pela API) é reconhecido como da Ju
    UPDATE public.ju_conversas
       SET resposta_pendente = CASE WHEN resposta_pendente IS NOT NULL AND resposta_pendente_em > now() - interval '5 minutes'
                                    THEN resposta_pendente || E'\x1f' || v_msg ELSE v_msg END,
           resposta_pendente_em = now()
     WHERE id = c.id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'wa_chatid', c.wa_chatid,
                            'mensagem', CASE WHEN v_msg IS NOT NULL THEN E'*Ju:*\n' || v_msg END,
                            'card', public.fn_ju_card(s.id));
END $f$;
REVOKE ALL ON FUNCTION public.fn_ju_verificar(bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_verificar(bigint, text) TO service_role;

-- ---------------------------------------------------------------- 2. Atraso no grupo
CREATE TABLE IF NOT EXISTS public.ju_avisos_atraso (
  id bigserial PRIMARY KEY,
  conversa_id bigint NOT NULL REFERENCES public.ju_conversas(id),
  texto text NOT NULL,
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'ok')),
  msg_req bigint,
  msg_id text,
  resolvido_por text,
  resolvido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ju_avisos_atraso ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.fn_ju_aviso_atraso(p_conversa_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE c public.ju_conversas; v_msgs text; v_cons text; v_id bigint; v_txt text; v_tok text; v_req bigint; ctx jsonb;
BEGIN
  SELECT * INTO c FROM public.ju_conversas WHERE id = p_conversa_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'CONVERSA'); END IF;
  -- um aviso por conversa a cada 2 h (a família costuma mandar várias mensagens seguidas)
  IF EXISTS (SELECT 1 FROM public.ju_avisos_atraso WHERE conversa_id = c.id AND created_at > now() - interval '2 hours') THEN
    RETURN jsonb_build_object('ok', true, 'acao', 'ja_avisado');
  END IF;

  SELECT string_agg(t, ' / ' ORDER BY created_at) INTO v_msgs
    FROM (SELECT m.created_at, left(regexp_replace(coalesce(m.conteudo, ''), '\s+', ' ', 'g'), 200) t
            FROM public.ju_mensagens m
           WHERE m.conversa_id = c.id AND m.origem = 'CLIENTE' AND m.tipo <> 'BOTAO'
             AND m.created_at > now() - interval '15 minutes'
           ORDER BY m.created_at DESC LIMIT 3) x;

  ctx := public.fn_ju_contexto_cliente(c.id);
  SELECT string_agg(split_part(p ->> 'nome', ' ', 1) || ' às ' || split_part(q ->> 'data_hora', ' ', 2)
                    || coalesce(' com ' || (q ->> 'profissional'), ''), ', ')
    INTO v_cons
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(ctx -> 'pacientes') = 'array' THEN ctx -> 'pacientes' ELSE '[]'::jsonb END) p,
         jsonb_array_elements(CASE WHEN jsonb_typeof(p -> 'proximas_consultas') = 'array' THEN p -> 'proximas_consultas' ELSE '[]'::jsonb END) q
   WHERE split_part(q ->> 'data_hora', ' ', 1) = to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM');

  v_txt := '⏰ *Atraso avisado*' || E'\n'
        || coalesce(nullif(btrim(c.nome_whatsapp), ''), 'Família')
        || coalesce(' · consulta de hoje: ' || v_cons, '') || E'\n'
        || '"' || coalesce(v_msgs, 'avisou que vai atrasar') || '"' || E'\n\n'
        || 'A Ju já respondeu à família. Toque em Ok para tirar este aviso.';
  INSERT INTO public.ju_avisos_atraso (conversa_id, texto) VALUES (c.id, v_txt) RETURNING id INTO v_id;

  v_tok := public.fn_whatsapp_conexoes_credenciais() ->> 'whatsapp_uazapi_token';
  IF v_tok IS NOT NULL THEN
    v_req := net.http_post(url := 'https://infuse.uazapi.com/send/menu',
      body := jsonb_build_object('number', '120363433073436578@g.us', 'type', 'button', 'text', v_txt,
                                 'choices', jsonb_build_array('✅ Ok|ju_atraso_ok:' || v_id)),
      headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
      timeout_milliseconds := 20000);
    UPDATE public.ju_avisos_atraso SET msg_req = v_req WHERE id = v_id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'acao', 'avisado', 'id', v_id);
END $f$;
REVOKE ALL ON FUNCTION public.fn_ju_aviso_atraso(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_aviso_atraso(bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_ju_atraso_botao(p_botao text, p_quem text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE m text[]; r public.ju_avisos_atraso; v_msg text; v_tok text;
BEGIN
  m := regexp_match(coalesce(p_botao, ''), '^ju_atraso_ok:(\d+)$');
  IF m IS NULL THEN RETURN jsonb_build_object('ok', false, 'texto', 'Botão não reconhecido.'); END IF;
  SELECT * INTO r FROM public.ju_avisos_atraso WHERE id = m[1]::bigint FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'texto', 'Aviso não encontrado.'); END IF;
  v_msg := coalesce(r.msg_id, (SELECT nullif(coalesce(h.content::jsonb ->> 'messageid', h.content::jsonb ->> 'id'), '')
                                  FROM net._http_response h WHERE h.id = r.msg_req));
  UPDATE public.ju_avisos_atraso SET status = 'ok', resolvido_por = coalesce(resolvido_por, p_quem),
         resolvido_em = coalesce(resolvido_em, now()), msg_id = v_msg WHERE id = r.id;
  v_tok := public.fn_whatsapp_conexoes_credenciais() ->> 'whatsapp_uazapi_token';
  IF v_msg IS NOT NULL AND v_tok IS NOT NULL THEN
    PERFORM net.http_post(url := 'https://infuse.uazapi.com/message/delete',
      body := jsonb_build_object('id', v_msg),
      headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
      timeout_milliseconds := 20000);
  END IF;
  RETURN jsonb_build_object('ok', true, 'aceita', true, 'msg_id', v_msg, 'texto', 'Aviso de atraso visto.');
END $f$;
REVOKE ALL ON FUNCTION public.fn_ju_atraso_botao(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_atraso_botao(text, text) TO service_role;

-- guarda o id do aviso enquanto a resposta do pg_net existe (junto do resolvedor dos cards de profissional)
CREATE OR REPLACE FUNCTION public.fn_ju_profissional_resolver_msgs()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE a int; b int;
BEGIN
  UPDATE public.ju_profissional_pendencias pp
     SET msg_id = nullif(coalesce(h.content::jsonb ->> 'messageid', h.content::jsonb ->> 'id'), '')
    FROM net._http_response h
   WHERE pp.msg_id IS NULL AND pp.msg_req IS NOT NULL AND h.id = pp.msg_req AND h.content IS NOT NULL;
  GET DIAGNOSTICS a = ROW_COUNT;
  UPDATE public.ju_avisos_atraso aa
     SET msg_id = nullif(coalesce(h.content::jsonb ->> 'messageid', h.content::jsonb ->> 'id'), '')
    FROM net._http_response h
   WHERE aa.msg_id IS NULL AND aa.msg_req IS NOT NULL AND h.id = aa.msg_req AND h.content IS NOT NULL;
  GET DIAGNOSTICS b = ROW_COUNT;
  RETURN a + b;
END $f$;
REVOKE ALL ON FUNCTION public.fn_ju_profissional_resolver_msgs() FROM PUBLIC, anon, authenticated;

-- a porta dos botões passa a aceitar também o "✅ Ok" do atraso
DO $mig$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_reserva_botao(bigint, uuid, boolean, text, text, text)'::regprocedure);
  n := replace(d, 'RETURN public.fn_ju_profissional_botao(p_prof, p_quem);',
                  'RETURN CASE WHEN p_prof LIKE ''ju_atraso_ok:%'' THEN public.fn_ju_atraso_botao(p_prof, p_quem)
                ELSE public.fn_ju_profissional_botao(p_prof, p_quem) END;');
  IF n = d THEN RAISE EXCEPTION 'fn_ju_reserva_botao: trecho não encontrado'; END IF;
  EXECUTE n;
END
$mig$;
