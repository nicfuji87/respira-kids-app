-- 29/10/2026: o app no ar ainda não conhece a categoria 'reserva' (front no PR #32). Ao editar uma reserva pelo
-- formulário de compromisso, ele gravava outra categoria: com criança vinculada dava erro (chk_paciente_so_reserva),
-- sem criança a reserva virava bloqueio comum sem avisar. Uma reserva continua reserva ao ser editada.
DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_reserva_regras()'::regprocedure); n text;
BEGIN
  IF d LIKE '%continua reserva%' THEN RETURN; END IF;
  n := replace(d, $a$BEGIN
  IF NEW.motivo IS DISTINCT FROM 'reserva' THEN
    RETURN NEW;
  END IF;$a$, $a$BEGIN
  -- editada por um formulário que não conhece reserva: continua reserva
  IF TG_OP = 'UPDATE' AND OLD.motivo = 'reserva' AND NEW.motivo IS DISTINCT FROM 'reserva' THEN
    NEW.motivo := 'reserva';
    NEW.paciente_id := coalesce(NEW.paciente_id, OLD.paciente_id);
  END IF;
  IF NEW.motivo IS DISTINCT FROM 'reserva' THEN
    RETURN NEW;
  END IF;$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_reserva_regras: trecho não encontrado'; END IF;
  EXECUTE n;
END
$mig$;
