-- 02/11/2026 (pedido do dono)
-- 1. Etiqueta "Responder" (22): os pedidos da Ju que a usam (CLINICO, EXTERNO, OUTRO...) só saíam com o botão
--    Concluído. Agora, quando alguém da equipe escreve na conversa (HUMANO, fora "@ju"), esses pedidos são
--    concluídos sozinhos: o card some do 🔔 e a etiqueta sai (fila ju_grupo_apagar, a mesma da conclusão automática).
-- 2. Mensagem editada pela família (caso Camille: "13h" editado para "15h" e a Lolô não viu). A Entrada passa a
--    mandar a edição para fn_ju_mensagem_editada: guarda o antes/depois, atualiza o histórico da Ju e, se a mudança
--    for importante (hora, data, dia, valor, sim/não, ou o texto mudou bastante), avisa o 🔔. Ajuste de
--    ortografia não gera aviso.

-- ---------------------------------------------------------------- 1. Responder
CREATE OR REPLACE FUNCTION public.fn_ju_concluir_respondidos(p_conversa_id bigint, p_ate timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE s record; r jsonb; n int := 0;
BEGIN
  FOR s IN SELECT id FROM public.ju_solicitacoes
            WHERE conversa_id = p_conversa_id AND status = 'ABERTA' AND etiqueta = '22' AND created_at < p_ate
  LOOP
    r := public.fn_ju_concluir(s.id, NULL, NULL, 'automático: equipe respondeu');
    IF (r ->> 'ok')::boolean AND NOT coalesce((r ->> 'ja_concluido')::boolean, false) THEN
      n := n + 1;
      IF nullif(r ->> 'aviso_msg_id', '') IS NOT NULL THEN
        INSERT INTO public.ju_grupo_apagar (msg_id, wa_chatid, etiqueta, origem)
        VALUES (r ->> 'aviso_msg_id', r ->> 'wa_chatid',
                CASE WHEN (r ->> 'tirar_etiqueta')::boolean THEN r ->> 'etiqueta' END, 'pedido:' || s.id);
      END IF;
    END IF;
  END LOOP;
  RETURN n;
END $f$;
REVOKE ALL ON FUNCTION public.fn_ju_concluir_respondidos(bigint, timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_ju_humano_respondeu()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
BEGIN
  IF NEW.origem = 'HUMANO' AND btrim(coalesce(NEW.conteudo, '')) !~* '^@ju' THEN
    BEGIN
      PERFORM public.fn_ju_concluir_respondidos(NEW.conversa_id, NEW.created_at);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'trg_ju_humano_respondeu: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS trg_ju_humano_respondeu ON public.ju_mensagens;
CREATE TRIGGER trg_ju_humano_respondeu AFTER INSERT ON public.ju_mensagens
  FOR EACH ROW WHEN (NEW.origem = 'HUMANO') EXECUTE FUNCTION public.trg_ju_humano_respondeu();

-- ---------------------------------------------------------------- 2. Mensagem editada
CREATE TABLE IF NOT EXISTS public.ju_mensagens_editadas (
  id bigserial PRIMARY KEY,
  conversa_id bigint REFERENCES public.ju_conversas(id),
  mensagem_id bigint REFERENCES public.ju_mensagens(id),
  wa_message_id text,
  texto_antes text,
  texto_depois text,
  importante boolean NOT NULL DEFAULT false,
  motivo text,
  bruto jsonb,
  aviso_req bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ju_mensagens_editadas ENABLE ROW LEVEL SECURITY;

-- pedaços que mudam o combinado: horários, números, dias, períodos, sim/não
CREATE OR REPLACE FUNCTION public.fn_ju_chaves_texto(p text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path TO '' AS $f$
  SELECT coalesce(array_agg(DISTINCT m[1] ORDER BY m[1]), '{}')
    FROM regexp_matches(lower(public.unaccent(coalesce(p, ''))),
      '(\d+(?:[:h]\d*)?|segunda|terca|quarta|quinta|sexta|sabado|domingo|hoje|amanha|ontem|manha|tarde|noite|nao|sim|cancel\w*|desmarc\w*|remarc\w*)',
      'g') m;
$f$;

CREATE OR REPLACE FUNCTION public.fn_ju_mensagem_editada(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE
  c ju_conversas; m ju_mensagens; v_depois text; v_antes text; v_imp boolean := false; v_motivo text;
  ka text[]; kd text[]; v_sim numeric; v_id bigint; v_txt text; v_tok text; v_req bigint;
BEGIN
  SELECT * INTO c FROM ju_conversas WHERE wa_chatid = p ->> 'wa_chatid';
  v_depois := nullif(btrim(coalesce(p ->> 'novo', '')), '');
  IF c.id IS NOT NULL AND nullif(p ->> 'original_id', '') IS NOT NULL THEN
    SELECT * INTO m FROM ju_mensagens WHERE conversa_id = c.id AND wa_message_id = p ->> 'original_id' LIMIT 1;
  END IF;
  v_antes := m.conteudo;

  -- só interessa edição da família, com texto
  IF c.id IS NULL OR coalesce((p ->> 'from_me')::boolean, false) OR v_depois IS NULL THEN
    INSERT INTO ju_mensagens_editadas (conversa_id, mensagem_id, wa_message_id, texto_antes, texto_depois, motivo, bruto)
    VALUES (c.id, m.id, p ->> 'original_id', v_antes, v_depois, 'ignorada (sem conversa, da equipe ou sem texto)', p -> 'bruto');
    RETURN jsonb_build_object('ok', true, 'acao', 'ignorada');
  END IF;

  IF v_antes IS NOT NULL AND btrim(v_antes) = v_depois THEN
    RETURN jsonb_build_object('ok', true, 'acao', 'igual');
  END IF;

  ka := fn_ju_chaves_texto(v_antes);
  kd := fn_ju_chaves_texto(v_depois);
  IF v_antes IS NULL THEN
    v_imp := coalesce(array_length(kd, 1), 0) > 0;
    v_motivo := CASE WHEN v_imp THEN 'mensagem original não encontrada; a nova tem hora/data/número' ELSE 'original não encontrada' END;
  ELSIF ka IS DISTINCT FROM kd THEN
    v_imp := true;
    v_motivo := 'mudou: ' || coalesce(array_to_string(ka, ' '), '-') || ' → ' || coalesce(array_to_string(kd, ' '), '-');
  ELSE
    v_sim := similarity(lower(unaccent(v_antes)), lower(unaccent(v_depois)));
    v_imp := v_sim < 0.5;
    v_motivo := CASE WHEN v_imp THEN 'texto mudou bastante' ELSE 'ajuste de escrita' END || ' (semelhança ' || round(v_sim, 2) || ')';
  END IF;

  -- o histórico da Ju passa a ter o texto atual
  IF m.id IS NOT NULL THEN
    UPDATE ju_mensagens SET conteudo = v_depois WHERE id = m.id;
  END IF;

  INSERT INTO ju_mensagens_editadas (conversa_id, mensagem_id, wa_message_id, texto_antes, texto_depois, importante, motivo, bruto)
  VALUES (c.id, m.id, p ->> 'original_id', v_antes, v_depois, v_imp, v_motivo, p -> 'bruto')
  RETURNING id INTO v_id;

  IF v_imp THEN
    v_txt := '✏️ *Mensagem editada*' || E'\n'
          || coalesce(nullif(btrim(c.nome_whatsapp), ''), 'Família')
          || CASE WHEN c.telefone ~ '^\+55[0-9]{11}$'
                  THEN ' · (' || substr(c.telefone, 4, 2) || ') ' || substr(c.telefone, 6, 5) || '-' || substr(c.telefone, 11) ELSE '' END
          || CASE WHEN m.created_at IS NOT NULL
                  THEN ' · mensagem de ' || to_char(m.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI') ELSE '' END
          || E'\n\n'
          || coalesce('Antes: "' || left(v_antes, 300) || '"' || E'\n', '')
          || 'Agora: "' || left(v_depois, 300) || '"'
          || E'\n\nConfira se isso muda algo que já foi combinado.';
    v_tok := fn_whatsapp_conexoes_credenciais() ->> 'whatsapp_uazapi_token';
    IF v_tok IS NOT NULL THEN
      v_req := net.http_post(url := 'https://infuse.uazapi.com/send/text',
        body := jsonb_build_object('number', '120363433073436578@g.us', 'text', v_txt),
        headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
        timeout_milliseconds := 20000);
      UPDATE ju_mensagens_editadas SET aviso_req = v_req WHERE id = v_id;
    END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'acao', CASE WHEN v_imp THEN 'avisada' ELSE 'registrada' END, 'motivo', v_motivo);
END $f$;
REVOKE ALL ON FUNCTION public.fn_ju_mensagem_editada(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_mensagem_editada(jsonb) TO service_role;
