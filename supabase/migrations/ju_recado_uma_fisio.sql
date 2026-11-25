-- 25/11/2026 (caso José, conversa 20209): a mesma mensagem da família ("recebeu alta… muito obrigada") virou
-- recado para a Beatriz E para a Bruna, e a família leu duas confirmações. Agora o mesmo texto (primeiros 80
-- caracteres) já passado para OUTRA fisio nos últimos 10 min não cria recado novo e a Ju não repete a confirmação.

DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_recado_criar(jsonb)'::regprocedure);
  n := replace(d, $a$  IF EXISTS (SELECT 1 FROM ju_recados WHERE conversa_id = c.id AND profissional_id = v_prof
               AND created_at > now() - interval '30 minutes' AND lower(recado) = lower(v_txt)) THEN$a$,
$a$  -- 25/11/2026: o mesmo recado não vai para duas fisios
  SELECT split_part(btrim(pp.nome), ' ', 1) INTO v_outra
    FROM ju_recados rr JOIN pessoas pp ON pp.id = rr.profissional_id
   WHERE rr.conversa_id = c.id AND rr.profissional_id <> v_prof
     AND rr.created_at > now() - interval '10 minutes'
     AND lower(left(btrim(rr.recado), 80)) = lower(left(v_txt, 80))
   ORDER BY rr.created_at DESC LIMIT 1;
  IF v_outra IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'duplicado', true, 'resposta',
      'Esse recado já foi passado para a ' || v_outra || ' e não foi mandado de novo. Não confirme outra vez à família: se já disse que passou o recado, responda [NADA].');
  END IF;
  IF EXISTS (SELECT 1 FROM ju_recados WHERE conversa_id = c.id AND profissional_id = v_prof
               AND created_at > now() - interval '30 minutes' AND lower(recado) = lower(v_txt)) THEN$a$);
  IF n = d THEN RAISE EXCEPTION 'recado_criar: trecho não encontrado'; END IF;
  EXECUTE n;
END $$;
