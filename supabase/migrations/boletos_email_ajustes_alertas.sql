-- Ajustes de alerta (22/10/2026):
--  * valores em formato brasileiro (to_char com G/D saía "2,519.16" no locale do banco);
--  * código de arrecadação (48 dígitos: guia de imposto, conta de consumo) não traz o CNPJ do
--    recebedor no PDF; quem identifica o recebedor é o convênio no próprio código, já
--    comparado com o do boleto anterior ("O banco mudou"). Sem CNPJ aí não é alerta grave.

CREATE OR REPLACE FUNCTION public.fn_brl(p numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT translate(to_char(p, 'FM999,999,990.00'), ',.', '.,');
$$;

DO $do$
DECLARE d text; n text;
BEGIN
  SELECT pg_get_functiondef('public.fn_boleto_registrar_email(jsonb)'::regprocedure) INTO d;
  n := regexp_replace(d, $r$to_char\(([^,()]+), 'FM999G990D00'\)$r$, $r$public.fn_brl(\1)$r$, 'g');
  n := replace(n, $q$  IF v_doc IS NULL THEN
    v_alertas$q$, $q$  IF v_doc IS NULL AND length(v_linha) = 47 THEN
    v_alertas$q$);
  IF position('FM999G990D00' in n) > 0 OR position('length(v_linha) = 47' in n) = 0 THEN
    RAISE EXCEPTION 'fn_boleto_registrar_email: trecho esperado não encontrado';
  END IF;
  EXECUTE n;

  SELECT pg_get_functiondef('public.fn_boleto_confirmar_pagamento(uuid, boolean, text)'::regprocedure) INTO d;
  n := regexp_replace(d, $r$to_char\(([^,()]+ - [^,()]+), 'FM999G990D00'\)$r$, $r$public.fn_brl(\1)$r$, 'g');
  IF position('FM999G990D00' in n) > 0 THEN
    RAISE EXCEPTION 'fn_boleto_confirmar_pagamento: trecho esperado não encontrado';
  END IF;
  EXECUTE n;
END
$do$;
