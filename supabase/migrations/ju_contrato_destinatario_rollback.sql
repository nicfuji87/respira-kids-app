-- Reverte ju_contrato_destinatario.sql: tira gerado_em e enviado_para do contrato.
DO $mig$
DECLARE
  d text := pg_get_functiondef('public.fn_ju_contexto_cliente'::regproc);
  i int := position($o$'gerado_em', to_char(uc.data_geracao$o$ IN d);
  j int := position($o$AS email) s) END)$o$ IN d);
BEGIN
  IF i = 0 OR j = 0 THEN RAISE EXCEPTION 'trecho não encontrado'; END IF;
  -- volta para "... ja.status = 'OK'))": remove da vírgula antes de 'gerado_em' até o fim do bloco
  d := left(d, i - 1) || substr(d, j + length('AS email) s) END'));
  d := regexp_replace(d, $r$ja\.status = 'OK'\),\s*\)$r$, $s$ja.status = 'OK'))$s$);
  EXECUTE d;
END
$mig$;
