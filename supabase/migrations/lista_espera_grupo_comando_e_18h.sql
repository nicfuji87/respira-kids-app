-- AI dev note: 04/11/2026 (pedidos do dono).
-- 1. "@ju" no grupo 🩺 Agenda e atendimentos para a lista de espera: "@ju tira Tayane da lista" e
--    "@ju lista" (reposta a lista fixada). A Entrada manda o texto como botão 'ju_lecmd:<texto>' pela
--    mesma porta dos botões do grupo (fn_ju_reserva_botao). Deu certo: nada é postado, o comando é
--    apagado e a lista fixada se atualiza; não achou ou achou mais de um: a Ju responde no grupo.
-- 2. 18h em diante nunca é oferecido automaticamente (as fisios usam para encaixe): lista diária de
--    horários livres, horários padrão do link da agenda e avisos de vaga da lista de espera.

CREATE OR REPLACE FUNCTION public.fn_lista_espera_comando_grupo(p_texto text, p_quem text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_t text := lower(public.unaccent(coalesce(p_texto, '')));
  v_quem text := coalesce(nullif(btrim(p_quem), ''), 'equipe');
  v_tokens text[]; v_ids bigint[]; v_nomes text; v_ativos text;
BEGIN
  IF v_quem ~* '^(respira|recep|alguém|alguem)' THEN v_quem := 'Recepção'; END IF;
  v_t := btrim(regexp_replace(v_t, '^\s*@?ju\M[\s,:]*', ''));

  IF v_t ~ '\m(tira|tirar|tire|remove|remover|retira|retirar|exclui|excluir|apaga|apagar|sai|saiu)\M' THEN
    -- o que sobra depois de tirar o verbo e as palavras de ligação é o nome procurado
    SELECT array_agg(w) INTO v_tokens
      FROM regexp_split_to_table(v_t, '[^a-z0-9]+') w
     WHERE length(w) >= 3
       AND w NOT IN ('tira', 'tirar', 'tire', 'remove', 'remover', 'retira', 'retirar', 'exclui', 'excluir', 'apaga', 'apagar',
                     'sai', 'saiu', 'lista', 'espera', 'por', 'favor', 'pfv', 'pls', 'bebe', 'crianca', 'paciente', 'dela', 'dele',
                     'que', 'pois', 'porque', 'ja', 'agendou', 'marcou', 'conseguiu', 'outro', 'outra', 'lugar', 'fisio');
    IF v_tokens IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'texto', '⚠️ Faltou o nome. Exemplo: @ju tira Tayane da lista');
    END IF;
    SELECT array_agg(l.id ORDER BY l.created_at), string_agg(l.nome, ', ' ORDER BY l.created_at) INTO v_ids, v_nomes
      FROM lista_espera l
     WHERE l.removido_em IS NULL
       AND NOT EXISTS (SELECT 1 FROM unnest(v_tokens) tk
                        WHERE lower(public.unaccent(l.nome || ' ' || coalesce(l.telefone, ''))) NOT LIKE '%' || tk || '%');
    IF coalesce(cardinality(v_ids), 0) = 0 THEN
      SELECT string_agg(nome, ', ' ORDER BY urgente DESC, created_at) INTO v_ativos FROM lista_espera WHERE removido_em IS NULL;
      RETURN jsonb_build_object('ok', false, 'texto',
        '⚠️ Não achei "' || array_to_string(v_tokens, ' ') || '" na lista de espera.'
        || coalesce(' Na lista: ' || v_ativos || '.', ' A lista está vazia.'));
    END IF;
    IF cardinality(v_ids) > 1 THEN
      RETURN jsonb_build_object('ok', false, 'texto', '⚠️ Achei mais de um: ' || v_nomes || '. Escreva o nome mais completo.');
    END IF;
    UPDATE lista_espera SET removido_em = now(), removido_por = v_quem, removido_motivo = 'tirado pela equipe (@ju no grupo)'
     WHERE id = v_ids[1];
    PERFORM fn_lista_espera_marcar();
    RETURN jsonb_build_object('ok', true, 'aceita', true, 'silencioso', true);
  END IF;

  IF v_t ~ '\m(lista|ver|mostra|mostrar)\M' THEN
    PERFORM fn_lista_espera_marcar();  -- o cron reposta a lista fixada em até 1 min
    RETURN jsonb_build_object('ok', true, 'aceita', true, 'silencioso', true);
  END IF;

  RETURN jsonb_build_object('ok', false, 'texto',
    'No grupo eu entendo: *@ju tira Tayane da lista* (tira da lista de espera) e *@ju lista* (posta a lista de novo). '
    || 'Para colocar alguém, use o @ju na conversa da família.');
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_lista_espera_comando_grupo(text, text) FROM anon, authenticated, public;

DO $do$
DECLARE d text;
BEGIN
  -- porta de entrada do comando
  d := pg_get_functiondef('public.fn_ju_reserva_botao'::regproc);
  IF position($a$  IF p_prof ~ '^ju_(le|vg)_' THEN$a$ IN d) = 0 THEN RAISE EXCEPTION 'fn_ju_reserva_botao: trecho não encontrado'; END IF;
  EXECUTE replace(d, $a$  IF p_prof ~ '^ju_(le|vg)_' THEN$a$,
    $a$  IF p_prof LIKE 'ju_lecmd:%' THEN
    IF coalesce(p_chatid, '') <> '120363402677285308@g.us' THEN
      RETURN jsonb_build_object('ok', false, 'texto', 'Esse comando só vale no grupo da agenda.');
    END IF;
    RETURN public.fn_lista_espera_comando_grupo(substr(p_prof, 10), p_quem);
  END IF;
  IF p_prof ~ '^ju_(le|vg)_' THEN$a$);

  -- 2. 18h em diante fica fora das ofertas automáticas
  d := pg_get_functiondef('public.fn_ju_livres_dia'::regproc);
  IF position($a$   WHERE p_dia + t > (now()$a$ IN d) = 0 THEN RAISE EXCEPTION 'fn_ju_livres_dia: trecho não encontrado'; END IF;
  EXECUTE replace(d, $a$   WHERE p_dia + t > (now()$a$, $a$   WHERE t < time '18:00' -- 18h em diante é encaixe (04/11/2026)
     AND p_dia + t > (now()$a$);

  d := pg_get_functiondef('public.fn_agenda_publica_horarios_padrao'::regproc);
  IF position($a$   WHERE c > v_agora + interval '2 hours'$a$ IN d) = 0 THEN RAISE EXCEPTION 'fn_agenda_publica_horarios_padrao: trecho não encontrado'; END IF;
  EXECUTE replace(d, $a$   WHERE c > v_agora + interval '2 hours'$a$, $a$   WHERE c > v_agora + interval '2 hours'
     AND c::time < time '18:00' -- 18h em diante é encaixe (04/11/2026)$a$);

  d := pg_get_functiondef('public.fn_le_vaga_abrir'::regproc);
  IF position($a$IF p_tipo IS NULL OR p_prof IS NULL OR$a$ IN d) = 0 THEN RAISE EXCEPTION 'fn_le_vaga_abrir: trecho não encontrado'; END IF;
  EXECUTE replace(d, $a$IF p_tipo IS NULL OR p_prof IS NULL OR$a$, $a$IF p_tipo IS NULL OR p_prof IS NULL OR p_dh::time >= time '18:00' OR$a$);

  d := pg_get_functiondef('public.fn_lista_espera_texto'::regproc);
  IF position($a$Quando vagar um horário que combina, aviso aqui._'$a$ IN d) = 0 THEN RAISE EXCEPTION 'fn_lista_espera_texto: trecho não encontrado'; END IF;
  EXECUTE replace(d, $a$Quando vagar um horário que combina, aviso aqui._'$a$,
    $a$Quando vagar um horário que combina, aviso aqui. Para tirar alguém: *@ju tira Nome da lista* aqui no grupo._'$a$);
END $do$;
