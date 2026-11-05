-- AI dev note: 05/11/2026: os resumos das 14h e das 16h falharam por statement timeout (8 s do authenticator).
-- 1. O filtro final agora roda num CTE MATERIALIZED ("fin") antes de montar o contexto.
-- 2. O LATERAL de fn_ju_contexto_cliente (~60-100 ms) era achatado pelo planejador e a função rodava uma vez por
--    referência a ctx (3x por família). OFFSET 0 impede o achatamento. Resultado: 7,6 s → 2,7 s com 29 conversas.
DO $do$
DECLARE d text := pg_get_functiondef('public.fn_ju_esperando_resposta'::regproc);
  i_sel int; i_from int; v_where text; v_ini text; v_corpo text;
BEGIN
  i_sel := position(E'  )\n  SELECT coalesce(jsonb_agg(jsonb_build_object(' IN d);
  i_from := position(E'  FROM pend p\n  CROSS JOIN LATERAL (SELECT public.fn_ju_contexto_cliente(p.id) AS ctx) z\n' IN d);
  IF i_sel = 0 OR i_from = 0 OR i_from < i_sel THEN RAISE EXCEPTION 'fn_ju_esperando_resposta: trecho não encontrado'; END IF;
  v_where := substr(d, i_from + length(E'  FROM pend p\n  CROSS JOIN LATERAL (SELECT public.fn_ju_contexto_cliente(p.id) AS ctx) z\n'));
  v_where := left(v_where, position(E';\n$function$' IN v_where) - 1);
  IF v_where !~ '^\s*WHERE p\.esperando_desde IS NOT NULL' THEN RAISE EXCEPTION 'filtro final inesperado'; END IF;
  v_ini := left(d, i_sel - 1);
  v_corpo := substr(d, i_sel + length(E'  )\n'), i_from - (i_sel + length(E'  )\n')));
  d := v_ini || E'  ),\n  fin AS MATERIALIZED (\n    SELECT p.* FROM pend p\n  ' || v_where || E'\n  )\n'
       || v_corpo
       || E'  FROM fin p\n  CROSS JOIN LATERAL (SELECT public.fn_ju_contexto_cliente(p.id) AS ctx OFFSET 0) z;\n$function$\n';
  EXECUTE d;
END $do$;
