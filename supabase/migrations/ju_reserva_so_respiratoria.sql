-- 30/10/2026 (pedido do dono): a Ju só reserva fisioterapia respiratória. Motora (inclusive a avaliação) passa
-- primeiro pela Bruna, que decide quem atende (ela, a Beatriz ou a Flávia): vai para a secretaria, sem explicar
-- o motivo à família.
DO $mig$
DECLARE d text; n text; trava text := $a$
  IF lower(coalesce(p_servico, '')) ~ '(motor|avalia)' AND lower(coalesce(p_servico, '')) !~ 'resp' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'MOTORA_SECRETARIA', 'resposta', 'Fisioterapia motora e avaliação motora não são reservadas por aqui: não ofereça horário nem reserve. Chame a secretaria (AGENDAMENTO) com o caso e diga à família só que a Lolô traz os horários por aqui, sem explicar o motivo e sem citar qual fisio atende.');
  END IF;$a$;
  marca text := $a$sem explicar o motivo.');
  END IF;$a$;
BEGIN
  d := pg_get_functiondef('public.fn_ju_horarios_livres(bigint,text,date,text,text)'::regprocedure);
  IF d NOT LIKE '%' || marca || '%' THEN RAISE EXCEPTION 'fn_ju_horarios_livres: trecho não encontrado'; END IF;
  EXECUTE replace(d, marca, marca || trava);

  d := pg_get_functiondef('public.fn_ju_reservar_horario(bigint,bigint,date,text,text,uuid,text)'::regprocedure);
  IF d NOT LIKE '%' || marca || '%' THEN RAISE EXCEPTION 'fn_ju_reservar_horario: trecho não encontrado'; END IF;
  EXECUTE replace(d, marca, marca || trava);
END
$mig$;
