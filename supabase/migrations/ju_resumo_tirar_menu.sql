-- 13/11/2026 (pedido da Lolô, ok do dono): ela não conseguia tirar do resumo PENDÊNCIAS quem não precisa de
-- resposta agora (caso Luiza: "não tem pendência quanto ao valor e não faz sentido falar com ela agora").
-- Junto com cada resumo vai um menu "🧹 Tirar do resumo" (lista da uazapi, até 10 famílias, o anterior é apagado).
-- Tocar numa família grava resumo_dispensado_em: ela some do resumo até mandar mensagem nova (regra que já existe
-- para quem tira a etiqueta). O toque chega pela Entrada (n8n HTMfhokzkqGu7D68, nó "Ler evento", regex do grupo 🔔
-- ganhou `|ju_rtirar:\d+`) → fn_ju_reserva_botao → fn_ju_resumo_tirar, que confirma no grupo (a Entrada só responde
-- no privado).
ALTER TABLE public.ju_config ADD COLUMN IF NOT EXISTS resumo_lista_req bigint;

CREATE OR REPLACE FUNCTION public.fn_ju_resumo_tirar(p_botao text, p_quem text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE m text[]; c ju_conversas; v_quem text; v_nome text; v_txt text; v_tok text;
BEGIN
  m := regexp_match(coalesce(p_botao, ''), '^ju_rtirar:(\d+)$');
  IF m IS NULL THEN RETURN jsonb_build_object('ok', false, 'texto', 'Botão não reconhecido.'); END IF;
  SELECT * INTO c FROM ju_conversas WHERE id = m[1]::bigint;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'texto', 'Conversa não encontrada.'); END IF;
  v_quem := nullif(btrim(coalesce(p_quem, '')), '');
  IF v_quem IS NULL OR v_quem ~* '^(alguém|alguem|recep|respira)' THEN v_quem := 'Recepção'; END IF;
  SELECT split_part(btrim(linha), ' ', 1) INTO v_nome FROM ju_resumo_itens WHERE conversa_id = c.id;
  IF c.resumo_dispensado_em > now() - interval '2 minutes' THEN
    RETURN jsonb_build_object('ok', true, 'silencioso', true, 'texto', 'Já tinha saído do resumo.');
  END IF;
  UPDATE ju_conversas SET resumo_dispensado_em = now(), updated_at = now() WHERE id = c.id;
  DELETE FROM ju_resumo_itens WHERE conversa_id = c.id;
  v_txt := '🧹 ' || coalesce(nullif(v_nome, ''), 'Família') || ' · ' || right(regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g'), 4)
           || ' saiu do resumo. Volta se mandar mensagem nova.';
  v_tok := fn_whatsapp_conexoes_credenciais() ->> 'whatsapp_uazapi_token';
  IF v_tok IS NOT NULL THEN
    PERFORM net.http_post(url := 'https://infuse.uazapi.com/send/text',
      body := jsonb_build_object('number', '120363433073436578@g.us', 'text', v_txt),
      headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
      timeout_milliseconds := 20000);
  END IF;
  RETURN jsonb_build_object('ok', true, 'silencioso', true, 'texto', v_txt);
END $$;
REVOKE ALL ON FUNCTION public.fn_ju_resumo_tirar(text, text) FROM PUBLIC, anon, authenticated;

DO $mig$
DECLARE v_def text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.fn_ju_reserva_botao(bigint,uuid,boolean,text,text,text)'::regprocedure);
  v_new := replace(v_def,
$s$BEGIN
  IF p_prof LIKE 'ju_atraso_ok:%' AND coalesce(p_chatid, '') = '120363402677285308@g.us' THEN$s$,
$s$BEGIN
  IF p_prof LIKE 'ju_rtirar:%' THEN
    IF coalesce(p_chatid, '') <> '120363433073436578@g.us' THEN
      RETURN jsonb_build_object('ok', false, 'texto', 'Esse botão só vale no grupo.');
    END IF;
    RETURN public.fn_ju_resumo_tirar(p_prof, p_quem);
  END IF;
  IF p_prof LIKE 'ju_atraso_ok:%' AND coalesce(p_chatid, '') = '120363402677285308@g.us' THEN$s$);
  IF v_new = v_def THEN RAISE EXCEPTION 'fn_ju_reserva_botao: trecho não encontrado'; END IF;
  EXECUTE v_new;

  v_def := pg_get_functiondef('public.fn_ju_resumo_postado(text,jsonb)'::regprocedure);
  v_new := replace(v_def,
$s$DECLARE v_ant text;
BEGIN$s$,
$s$DECLARE v_ant text; v_req_ant bigint; v_choices jsonb; v_tok text; v_req bigint;
BEGIN$s$);
  v_new := replace(v_new,
$s$  RETURN jsonb_build_object('anterior', v_ant);
END;$s$,
$s$  -- 13/11/2026: menu "Tirar do resumo" (apaga o anterior e manda o novo, até 10 famílias, urgentes primeiro)
  IF nullif(btrim(p_msg_id), '') IS NOT NULL THEN
    SELECT resumo_lista_req INTO v_req_ant FROM public.ju_config WHERE id = 1;
    IF v_req_ant IS NOT NULL THEN
      PERFORM public.fn_le_apagar(public.fn_le_msg_id(v_req_ant), v_req_ant);
    END IF;
    SELECT jsonb_agg(x.op ORDER BY x.urg DESC, x.ord) INTO v_choices FROM (
      SELECT left(coalesce(nullif(split_part(btrim(r.linha), ' ', 1), ''), 'Família')
                  || ' · ' || right(regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g'), 4), 24)
             || '|ju_rtirar:' || r.conversa_id || '|' || left(regexp_replace(r.linha, '\s+', ' ', 'g'), 70) AS op,
             r.urgente AS urg, row_number() OVER () AS ord
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_itens) = 'array' THEN p_itens ELSE '[]'::jsonb END) i
        JOIN public.ju_resumo_itens r ON r.conversa_id = (i ->> 'conversa_id')::bigint
        JOIN public.ju_conversas c ON c.id = r.conversa_id
       WHERE (i ->> 'conversa_id') ~ '^\d+$'
       LIMIT 10) x;
    v_tok := public.fn_whatsapp_conexoes_credenciais() ->> 'whatsapp_uazapi_token';
    IF v_choices IS NOT NULL AND v_tok IS NOT NULL THEN
      v_req := net.http_post(url := 'https://infuse.uazapi.com/send/menu',
        body := jsonb_build_object('number', '120363433073436578@g.us', 'type', 'list',
          'text', '🧹 *Tirar do resumo*' || E'\n' || 'Toque em quem já foi resolvido ou não precisa de resposta agora. A família volta ao resumo se mandar mensagem nova.',
          'listButton', 'Escolher família',
          'choices', jsonb_build_array('[Pendências do resumo]') || v_choices),
        headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
        timeout_milliseconds := 20000);
    END IF;
    UPDATE public.ju_config SET resumo_lista_req = v_req WHERE id = 1;
  END IF;
  RETURN jsonb_build_object('anterior', v_ant);
END;$s$);
  IF position('Tirar do resumo' in v_new) = 0 OR position('v_choices jsonb' in v_new) = 0 THEN
    RAISE EXCEPTION 'fn_ju_resumo_postado: trecho não encontrado';
  END IF;
  EXECUTE v_new;
END $mig$;
