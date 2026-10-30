-- 30/10/2026 (pedido do dono): famílias de certos pediatras costumam ser atendidas pela Bruna. Com esses
-- pediatras, a Ju não oferece nem reserva horário com a Beatriz: passa para a secretaria (sem dizer o motivo).
-- Lista em ju_reserva_config.pediatras_secretaria (palavra-chave do nome, sem acento, comparada como palavra
-- inteira). Para acrescentar: UPDATE ju_reserva_config SET pediatras_secretaria = pediatras_secretaria || 'sobrenome';

ALTER TABLE public.ju_reserva_config
  ADD COLUMN IF NOT EXISTS pediatras_secretaria text[] NOT NULL DEFAULT '{}';
UPDATE public.ju_reserva_config SET pediatras_secretaria = ARRAY['zaconeta', 'sarkis', 'liv'] WHERE id = 1 AND pediatras_secretaria = '{}';
COMMENT ON COLUMN public.ju_reserva_config.pediatras_secretaria IS
  'Pediatras cujas famílias vão para a secretaria em vez de reserva com a Beatriz (Carlos Zaconeta, Nathalia Sarkis, Liv). Palavra-chave sem acento.';

CREATE OR REPLACE FUNCTION public.fn_ju_pediatra_vai_secretaria(p_pediatra text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
  SELECT coalesce(nullif(btrim(p_pediatra), '') IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.ju_reserva_config c, unnest(c.pediatras_secretaria) k
     WHERE c.id = 1 AND lower(public.unaccent(p_pediatra)) ~ ('\m' || lower(public.unaccent(k)) || '\M')), false);
$f$;
REVOKE ALL ON FUNCTION public.fn_ju_pediatra_vai_secretaria(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_pediatra_vai_secretaria(text) TO service_role;

-- consultar_horarios e reservar_horario recebem o pediatra
DO $mig$
DECLARE d text; n text; aviso text := $a$'Esse pediatra é acompanhado por outra fisio da clínica: não ofereça horário nem reserve. Chame a secretaria (AGENDAMENTO) com o pedido e diga à família só que a Lolô traz os horários por aqui, sem explicar o motivo.'$a$;
BEGIN
  d := pg_get_functiondef('public.fn_ju_horarios_livres(bigint, text, date, text)'::regprocedure);
  n := replace(d, 'p_periodo text DEFAULT NULL::text)', 'p_periodo text DEFAULT NULL::text, p_pediatra text DEFAULT NULL::text)');
  n := replace(n, $a$  SELECT * INTO cfg FROM public.ju_reserva_config WHERE id = 1;
  IF p_data IS NOT NULL AND (p_data < v_hoje$a$, $a$  IF public.fn_ju_pediatra_vai_secretaria(p_pediatra) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'PEDIATRA_SECRETARIA', 'resposta', $a$ || aviso || $a$);
  END IF;
  SELECT * INTO cfg FROM public.ju_reserva_config WHERE id = 1;
  IF p_data IS NOT NULL AND (p_data < v_hoje$a$);
  IF n NOT LIKE '%p_pediatra text DEFAULT NULL::text)%' OR n NOT LIKE '%PEDIATRA_SECRETARIA%' THEN RAISE EXCEPTION 'fn_ju_horarios_livres: trecho não encontrado'; END IF;
  EXECUTE n;
  DROP FUNCTION public.fn_ju_horarios_livres(bigint, text, date, text);

  d := pg_get_functiondef('public.fn_ju_reservar_horario(bigint, bigint, date, text, text, uuid)'::regprocedure);
  n := replace(d, 'p_paciente_id uuid DEFAULT NULL::uuid)', 'p_paciente_id uuid DEFAULT NULL::uuid, p_pediatra text DEFAULT NULL::text)');
  n := replace(n, $a$  v_serv := CASE WHEN lower(coalesce(p_servico$a$, $a$  IF public.fn_ju_pediatra_vai_secretaria(p_pediatra) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'PEDIATRA_SECRETARIA', 'resposta', $a$ || aviso || $a$);
  END IF;
  v_serv := CASE WHEN lower(coalesce(p_servico$a$);
  IF n NOT LIKE '%p_pediatra text DEFAULT NULL::text)%' OR n NOT LIKE '%PEDIATRA_SECRETARIA%' THEN RAISE EXCEPTION 'fn_ju_reservar_horario: trecho não encontrado'; END IF;
  EXECUTE n;
  DROP FUNCTION public.fn_ju_reservar_horario(bigint, bigint, date, text, text, uuid);
END
$mig$;

REVOKE ALL ON FUNCTION public.fn_ju_horarios_livres(bigint, text, date, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_horarios_livres(bigint, text, date, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.fn_ju_reservar_horario(bigint, bigint, date, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_reservar_horario(bigint, bigint, date, text, text, uuid, text) TO service_role;
