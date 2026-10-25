-- @ju pelo Chatwoot (pedido do dono, 25/10/2026): a Bruna escreve "@ju agendar..." na conversa dela com a
-- família (WhatsApp dela ligado ao Chatwoot, caixa 38). O n8n "RK Ju - Comando (Chatwoot)" registra o
-- pedido aqui e chama o mesmo fluxo do @ju da recepção, que agenda com fn_ju_agendar.
-- Para reaproveitar fn_ju_agendar/fn_ju_comando_contexto, o pedido fica numa conversa-espelho
-- (wa_chatid 'cw<caixa>:<telefone>'): só tem o telefone da família e a própria mensagem do @ju.
-- O histórico vem do Chatwoot na hora e não é gravado. A Ju nunca atende essa conversa.

CREATE OR REPLACE FUNCTION public.fn_ju_comando_externo(p_inbox integer, p_telefone text, p_msg_id text, p_texto text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_dig  text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_chat text;
  v_conv bigint;
  v_msg  bigint;
BEGIN
  IF length(v_dig) < 12 OR nullif(btrim(p_msg_id), '') IS NULL OR coalesce(p_texto, '') !~* '^\s*@ju([^[:alnum:]]|$)' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'DADOS_INVALIDOS');
  END IF;
  v_chat := 'cw' || p_inbox || ':' || v_dig;

  INSERT INTO ju_conversas (wa_chatid, telefone) VALUES (v_chat, fn_ju_telefone(v_dig))
  ON CONFLICT (wa_chatid) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_conv;

  INSERT INTO ju_mensagens (conversa_id, wa_message_id, origem, tipo, conteudo)
  VALUES (v_conv, 'cw' || p_inbox || ':' || btrim(p_msg_id), 'HUMANO', 'TEXT', btrim(p_texto))
  ON CONFLICT (wa_message_id) DO NOTHING
  RETURNING id INTO v_msg;
  IF v_msg IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'DUPLICADA');  -- o Chatwoot repetiu o evento
  END IF;

  INSERT INTO ju_comandos (conversa_id, mensagem_id, texto) VALUES (v_conv, v_msg, btrim(p_texto))
  ON CONFLICT (mensagem_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'conversa_id', v_conv, 'mensagem_id', v_msg,
                            'wa_chatid', v_dig || '@s.whatsapp.net');
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_ju_comando_externo(integer, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_comando_externo(integer, text, text, text) TO service_role;

-- conversas-espelho fora do detector de "consulta combinada e não lançada"
DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_agenda_confirmacoes_verificar()'::regprocedure); n text;
BEGIN
  IF d LIKE '%''cw%' THEN RETURN; END IF;
  n := replace(d, $a$AND (public.fn_ju_eh_equipe(t.telefone) OR t.telefone = '+5561981446666')))$a$,
                  $a$AND (public.fn_ju_eh_equipe(t.telefone) OR t.telefone = '+5561981446666' OR t.wa_chatid LIKE 'cw%:%')))$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_agenda_confirmacoes_verificar: filtro não encontrado'; END IF;
  EXECUTE n;
END
$mig$;

-- fn_ju_agendar: número fictício também é ensaio na conversa-espelho; a observação diz quem pediu
DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_ju_agendar(bigint,bigint,uuid,date,text,uuid,uuid)'::regprocedure); n text;
BEGIN
  IF d LIKE '%WhatsApp dela%' THEN RETURN; END IF;
  n := replace(d, $a$wa_chatid ~ '^55619990000'$a$, $a$wa_chatid ~ '^(cw[0-9]+:)?55619990000'$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_agendar: checagem de ensaio não encontrada'; END IF;
  d := n;
  n := replace(d, $a$'Agendado pela Ju a pedido da recepção (@ju).'$a$,
    $a$CASE WHEN EXISTS (SELECT 1 FROM ju_conversas WHERE id = p_conversa_id AND wa_chatid LIKE 'cw%:%')
         THEN 'Agendado pela Ju a pedido da fisio (@ju no WhatsApp dela).'
         ELSE 'Agendado pela Ju a pedido da recepção (@ju).' END$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_agendar: observação não encontrada'; END IF;
  EXECUTE n;
END
$mig$;
