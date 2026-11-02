-- 02/11/2026 (pedido do dono, depois do primeiro envio das 19h):
-- 1. A grade perdia horários: só contava as horas com 2+ consultas NAQUELE dia da semana, e a Beatriz quase
--    nunca começa às 8h na terça. O 8h de 03/11 (consulta cancelada) não apareceu.
--    Agora: horas em que a fisio atende em qualquer dia (3+ consultas em 120 dias), no minuto dela, mais os
--    horários de qualquer consulta que já existiu naquele dia (inclusive cancelada). O dia da semana continua
--    precisando de 6+ datas atendidas para contar como dia de trabalho.
-- 2. A mensagem das 19h sai em lista, um horário por linha, como a Bruna escreve no grupo.

CREATE OR REPLACE FUNCTION public.fn_ju_grade(p_prof uuid, p_dia date)
RETURNS time[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
  WITH h AS (
    SELECT a.data_hora AT TIME ZONE 'UTC' AS dh
      FROM public.agendamentos a JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
     WHERE a.profissional_id = p_prof AND a.ativo AND a.data_hora > now() - interval '120 days'
       AND cs.codigo NOT IN ('cancelado', 'erro')
  ), minuto AS (
    SELECT coalesce((SELECT extract(minute FROM dh)::int FROM h GROUP BY 1 ORDER BY count(*) DESC LIMIT 1), 0) AS m
  ), trabalha AS (
    SELECT count(DISTINCT dh::date) >= 6 AS sim FROM h WHERE extract(isodow FROM dh) = extract(isodow FROM p_dia)
  ), horas AS (
    SELECT make_time(extract(hour FROM dh)::int, (SELECT m FROM minuto), 0) AS t
      FROM h GROUP BY extract(hour FROM dh) HAVING count(*) >= 3
    UNION
    SELECT (a.data_hora AT TIME ZONE 'UTC')::time
      FROM public.agendamentos a
     WHERE a.profissional_id = p_prof AND a.ativo
       AND (a.data_hora AT TIME ZONE 'UTC')::date = p_dia
  )
  SELECT CASE WHEN NOT (SELECT sim FROM trabalha) THEN '{}'::time[]
              ELSE coalesce((SELECT array_agg(t ORDER BY t) FROM horas), '{}') END;
$f$;

DO $m$
DECLARE d text := pg_get_functiondef('public.fn_horarios_livres_texto(date)'::regprocedure);
        f1 text := $$      v := v || E'\n\n' || '*' || r.nome || ':* não costuma atender nesse dia';$$;
        f2 text := $$    v := v || E'\n\n' || '*' || r.nome || ':* ' || CASE WHEN cardinality(v_l) = 0 THEN 'agenda cheia' ELSE array_to_string(v_l, ', ') END;$$;
BEGIN
  IF position(f1 IN d) = 0 OR position(f2 IN d) = 0 THEN RAISE EXCEPTION 'fn_horarios_livres_texto: trecho não encontrado'; END IF;
  d := replace(d, f1, $$      v := v || E'\n\n' || '*' || r.nome || '*' || E'\n' || 'não costuma atender nesse dia';$$);
  d := replace(d, f2, $$    v := v || E'\n\n' || '*' || r.nome || '*' || E'\n' || CASE WHEN cardinality(v_l) = 0 THEN 'agenda cheia' ELSE array_to_string(v_l, E'\n') END;$$);
  EXECUTE d;
END $m$;
