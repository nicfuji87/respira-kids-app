-- 15/11/2026: "@ju agendar ... com a Vivia" respondeu que não achou a profissional. A lista que o @ju
-- recebe só tinha quem teve agenda nos últimos 90 dias. Decisão do dono: o @ju (equipe) pode agendar
-- com qualquer profissional cadastrada; a Ju continua oferecendo às famílias só Bruna, Flávia e Beatriz.
-- Agora entram também as pessoas ativas com pode_atender ou role 'profissional'.
DO $mig$
DECLARE
  v_def text := pg_get_functiondef('public.fn_ju_comando_contexto(bigint,bigint)'::regprocedure);
  v_old text := $o$FROM (SELECT DISTINCT p.id, p.nome FROM agendamentos a JOIN pessoas p ON p.id = a.profissional_id
               WHERE a.ativo AND a.data_hora > now() - interval '90 days' AND p.ativo) pr)$o$;
  v_new text := $n$FROM (SELECT DISTINCT p.id, p.nome FROM pessoas p
               WHERE p.ativo AND (coalesce(p.pode_atender, false) OR p.role = 'profissional'
                      OR EXISTS (SELECT 1 FROM agendamentos a
                                  WHERE a.profissional_id = p.id AND a.ativo AND a.data_hora > now() - interval '90 days'))) pr)$n$;
BEGIN
  IF position(v_old IN v_def) = 0 THEN RAISE EXCEPTION 'trecho de profissionais não encontrado'; END IF;
  EXECUTE replace(v_def, v_old, v_new);
END $mig$;
