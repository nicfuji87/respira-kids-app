-- @ju no grupo da agenda alinhado aos Compromissos (23/10/2026):
-- categoria "saude" (nova no app), "intervalo" = almoço, e o título volta na resposta.
CREATE OR REPLACE FUNCTION public.fn_ju_motivo_bloqueio(p_texto text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_texto IS NULL THEN 'outro'
    WHEN lower(unaccent(p_texto)) ~ '(almoc|intervalo)' THEN 'almoco'
    WHEN lower(unaccent(p_texto)) ~ 'feria' AND lower(unaccent(p_texto)) !~ 'feriado' THEN 'ferias'
    WHEN lower(unaccent(p_texto)) ~ '(feriado|clinica fechada)' THEN 'feriado'
    WHEN lower(unaccent(p_texto)) ~ '(reuni|treinamento|curso|congresso|evento|estudo|aula)' THEN 'reuniao'
    WHEN lower(unaccent(p_texto)) ~ '(saude|medic|dentista|exame|consulta|cirurgia|doen|atestado|terapia|vacina)' THEN 'saude'
    WHEN lower(unaccent(p_texto)) ~ '(pessoal|filho|filha|escola|viagem|banco|cartorio|casamento)' THEN 'pessoal'
    ELSE 'outro' END;
$function$;

DO $mig$
DECLARE
  d text := pg_get_functiondef('public.fn_ju_agenda_bloquear(text,date,date,time,time,text,text)'::regprocedure);
  n text;
BEGIN
  IF d LIKE '%''titulo'', left(%' THEN RETURN; END IF;
  n := replace(d, $a$'motivo', public.fn_ju_motivo_bloqueio(p_motivo), 'conflitos', v_conf);$a$,
                  $a$'motivo', public.fn_ju_motivo_bloqueio(p_motivo), 'titulo', left(nullif(trim(coalesce(p_motivo, '')), ''), 120),
    'conflitos', v_conf);$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_agenda_bloquear: retorno não encontrado'; END IF;
  EXECUTE n;
END
$mig$;
