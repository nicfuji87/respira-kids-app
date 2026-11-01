-- 01/11/2026: em "meus números", consulta que já passou e segue agendada/confirmada não é "ainda marcada":
-- vira "Passaram sem finalizar no sistema".
DO $mig$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_fisio_comando(bigint, text, jsonb)'::regprocedure);
  n := replace(d, $a$|| E'\n' || 'Ainda marcados no mês: ' || count(*) FILTER (WHERE cs.codigo IN ('agendado', 'confirmado'))$a$,
    $a$|| E'\n' || 'Ainda marcados no mês: ' || count(*) FILTER (WHERE cs.codigo IN ('agendado', 'confirmado') AND (ag.data_hora AT TIME ZONE 'UTC') >= v_agora)
      || coalesce(E'\n' || 'Passaram sem finalizar no sistema: ' || nullif(count(*) FILTER (WHERE cs.codigo IN ('agendado', 'confirmado') AND (ag.data_hora AT TIME ZONE 'UTC') < v_agora), 0), '')$a$);
  IF n = d THEN RAISE EXCEPTION 'trecho não encontrado'; END IF;
  EXECUTE n;
END $mig$;
