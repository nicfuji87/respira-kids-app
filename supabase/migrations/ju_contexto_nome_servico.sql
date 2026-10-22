-- =====================================================================
-- Ju: nome do serviço limpo nas próximas consultas (21/10/2026)
-- =====================================================================
-- AI dev note: proximas_consultas vinha com o nome cru do tipo_servicos
-- ("Fisioterapia Respiratória<TAB>- FDS"). Agora usa a mesma limpeza do
-- fn_ju_servicos ("... (fins de semana e feriados)" / "(dias úteis)").
-- =====================================================================
DO $do$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_contexto_cliente'::regproc);
  n := replace(d, $a$'servico', ts.nome,$a$,
                  $b$'servico', regexp_replace(regexp_replace(btrim(regexp_replace(ts.nome, '\s+', ' ', 'g')),
                               '\s*-\s*DU$', ' (dias úteis)'), '\s*-\s*FDS$', ' (fins de semana e feriados)'),$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_contexto_cliente: serviço não encontrado'; END IF;
  EXECUTE n;
END
$do$;
