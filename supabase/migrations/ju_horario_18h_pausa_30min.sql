-- =====================================================================
-- Ju: expediente seg-sex 8h-18h + pausa da Lolô de 30 min (21/10/2026)
-- =====================================================================
-- AI dev note: decisão do dono. Expediente da recepção é seg-sex 8h às 18h
-- (antes 19h): vale para dentro_do_horario do turno, para a pausa depois que a
-- Lolô escreve (30 min no expediente, 15 min fora) e para os lembretes da
-- equipe (fn_ju_tarefas). Sábado e domingo de manhã a clínica atende só
-- emergência; para a Ju, fim de semana continua fora do expediente.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_ju_pausa_humano()
RETURNS interval
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN extract(isodow FROM now() AT TIME ZONE 'America/Sao_Paulo') BETWEEN 1 AND 5
               AND (now() AT TIME ZONE 'America/Sao_Paulo')::time >= time '08:00'
               AND (now() AT TIME ZONE 'America/Sao_Paulo')::time <  time '18:00'
              THEN interval '30 minutes' ELSE interval '15 minutes' END;
$$;

DO $do$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_turno'::regproc);
  n := replace(d, $a$(now() AT TIME ZONE 'America/Sao_Paulo')::time < time '19:00'$a$,
                  $b$(now() AT TIME ZONE 'America/Sao_Paulo')::time < time '18:00'$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_turno: horário não encontrado'; END IF;
  EXECUTE n;

  d := pg_get_functiondef('public.fn_ju_tarefas'::regproc);
  n := replace(d, $a$v_agora::time < time '19:00'$a$, $b$v_agora::time < time '18:00'$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_tarefas: horário não encontrado'; END IF;
  EXECUTE n;
END
$do$;

UPDATE public.ju_conhecimento SET texto =
  'O horário de funcionamento da Respira Kids é de segunda a sexta, das 8h às 18h. Sábado e domingo há atendimento pela manhã, somente para emergência, sempre sujeito à disponibilidade da equipe. A Ju não promete disponibilidade nem horário.',
  updated_at = now()
WHERE id = 'HORARIO_FUNCIONAMENTO';

UPDATE public.ju_conhecimento SET texto =
  'A Respira Kids fica na SEPS 709/909, Centro Médico Júlio Adnet, Bloco A, Sala 311, Brasília-DF, CEP 70390-095.',
  updated_at = now()
WHERE id = 'ENDERECO';
