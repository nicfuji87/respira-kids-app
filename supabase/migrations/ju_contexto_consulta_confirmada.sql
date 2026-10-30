-- 30/10/2026: a Ju pedia para tocar em "Confirmar" mesmo com a consulta já confirmada (Lígia).
-- proximas_consultas passa a dizer se a consulta já está confirmada.
DO $mig$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_contexto_cliente'::regproc);
  n := replace(d, $a$'agendamento_id', a.id, 'cortesia', coalesce(a.valor_servico, 0) = 0,
                   'faltam_horas'$a$, $a$'agendamento_id', a.id, 'cortesia', coalesce(a.valor_servico, 0) = 0,
                   'confirmada', cs.codigo = 'confirmado',
                   'faltam_horas'$a$);
  IF n = d OR n NOT LIKE '%''confirmada'', cs.codigo = ''confirmado''%' THEN
    RAISE EXCEPTION 'fn_ju_contexto_cliente: trecho não encontrado';
  END IF;
  EXECUTE n;
END
$mig$;
