-- 25/11/2026 (item 10 do pacote): respostas do @ju sem cara de robô na conversa da família.
-- Antes a família lia "Anotado." ou "Pronto, reservei a agenda de Bruna em 02/12, das 10:00 às 11:00 (Morgana ...)".
-- Agora, quando o @ju é escrito na conversa de uma FAMÍLIA (não no chat da fisio, da equipe ou de grupo):
--   - anotar, fechar/abrir agenda: a resposta vai só para o 🔔 (so_equipe) e o @ju é apagado (apagar_comando);
--   - reservar_agenda: a família recebe um texto natural ("Deixei reservado o dia 02/12, às 10h, com a Bruna...").
-- A função original virou fn_ju_comando_executar_base; esta casca só ajusta a resposta.

ALTER FUNCTION public.fn_ju_comando_executar(bigint, bigint, jsonb) RENAME TO fn_ju_comando_executar_base;

CREATE OR REPLACE FUNCTION public.fn_ju_comando_executar(p_conversa_id bigint, p_mensagem_id bigint, p_decisao jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r jsonb := public.fn_ju_comando_executar_base(p_conversa_id, p_mensagem_id, p_decisao);
  c ju_conversas; v_acao text := p_decisao ->> 'acao'; v_familia boolean; m text[]; v_nome text;
BEGIN
  SELECT * INTO c FROM ju_conversas WHERE id = p_conversa_id;
  v_familia := c.id IS NOT NULL
    AND coalesce(c.wa_chatid, '') NOT LIKE '%@g.us'
    AND NOT fn_ju_eh_equipe(c.telefone)
    AND NOT EXISTS (SELECT 1 FROM ju_recado_destinatarios d JOIN pessoas pp ON pp.id = d.profissional_id
                     WHERE d.ativo AND fn_ju_telefone(pp.telefone::text) = fn_ju_telefone(c.telefone));
  IF NOT v_familia OR r IS NULL THEN RETURN r; END IF;

  v_nome := coalesce(nullif(btrim(c.nome_whatsapp), ''), 'família');

  IF v_acao IN ('anotar', 'fechar_agenda', 'abrir_agenda') AND coalesce(r ->> 'texto', '') <> '' THEN
    RETURN r || jsonb_build_object('so_equipe', true, 'apagar_comando', true,
      'texto', '📝 *@ju na conversa de ' || v_nome || '*' || E'\n' || (r ->> 'texto'));
  END IF;

  IF v_acao = 'reservar_agenda' AND r ->> 'status' = 'agenda' THEN
    m := regexp_match(coalesce(r ->> 'texto', ''), 'agenda d[ae] (\S+) em (\d{2}/\d{2}), das (\d{2}):(\d{2})');
    IF m IS NOT NULL THEN
      RETURN r || jsonb_build_object('texto',
        'Deixei reservado o dia ' || m[2] || ', às ' || ltrim(m[3], '0') || 'h' || CASE WHEN m[4] <> '00' THEN m[4] ELSE '' END
        || ', com a ' || m[1] || ' para vocês. Assim que estiver tudo certo, a confirmação chega por aqui.');
    END IF;
  END IF;
  RETURN r;
END $function$;

REVOKE ALL ON FUNCTION public.fn_ju_comando_executar(bigint, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_comando_executar(bigint, bigint, jsonb) TO service_role;
