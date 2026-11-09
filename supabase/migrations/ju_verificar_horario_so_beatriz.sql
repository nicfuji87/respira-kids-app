-- 09/11/2026 (pedido urgente do dono, caso Babi Telles): a Ju só confere/sugere horário da fisio liberada
-- em ju_reserva_config (hoje só a Beatriz). Bruna e Flávia: nunca dizer se está livre ou ocupado nem oferecer
-- alternativa; vai para a secretaria. Link público e oferta da secretaria seguem por outros fluxos.
DO $mig$
DECLARE v_def text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.fn_ju_horario_verificar(jsonb)'::regprocedure);
  v_new := replace(v_def,
$s$  SELECT split_part(btrim(nome), ' ', 1) INTO v_prof_nome FROM pessoas WHERE id = v_prof;
$s$,
$s$  SELECT split_part(btrim(nome), ' ', 1) INTO v_prof_nome FROM pessoas WHERE id = v_prof;

  IF NOT EXISTS (SELECT 1 FROM ju_reserva_config rc WHERE rc.ativo AND rc.profissional_id = v_prof) THEN
    RETURN jsonb_build_object('ok', true, 'livre', null, 'resposta',
      'Horário da ' || v_prof_nome || ' quem vê é a secretaria. NÃO diga se está livre ou ocupado e NÃO sugira outros horários dela. '
      || 'Chame a secretaria (AGENDAMENTO ou REMARCACAO) com o dia e a hora que a família pediu e diga, numa frase, que a Lolô vê com a '
      || v_prof_nome || ' e responde por aqui.');
  END IF;
$s$);
  IF v_new = v_def THEN RAISE EXCEPTION 'fn_ju_horario_verificar: trecho não encontrado'; END IF;
  EXECUTE v_new;
END $mig$;
