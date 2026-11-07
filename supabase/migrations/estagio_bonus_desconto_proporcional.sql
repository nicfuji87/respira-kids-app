-- 07/11/2026 (decisão do dono): em mês proporcional o desconto por evolução perdida também é proporcional.
-- bônus = (100 − 5 × perdidas) × dias vigentes / dias do mês; desconto por perdida = 5 × dias vigentes / dias do mês.
-- Outubro/2026 (8 de 31 dias, 13 perdidas): R$ 9,03 para cada estagiária. Aplicada em produção com este nome.
DO $mig$
DECLARE v_def text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.fn_estagio_bonus_evolucoes_calc(date)'::regprocedure);
  IF position('c_desconto * v_dias_vig' in v_def) > 0 THEN RETURN; END IF;
  v_new := replace(v_def, $s$'desconto_por_perdida', c_desconto,$s$,
                          $s$'desconto_por_perdida', round(c_desconto * v_dias_vig::numeric / v_dias_mes, 2),$s$);
  IF v_new = v_def THEN RAISE EXCEPTION 'calc: desconto não encontrado'; END IF;
  v_def := v_new;
  v_new := replace(v_def, $s$'bonus', greatest(0, v_base - c_desconto * t.perdidas),$s$,
                          $s$'bonus', greatest(0, round((c_bonus_base - c_desconto * t.perdidas) * v_dias_vig::numeric / v_dias_mes, 2)),$s$);
  IF v_new = v_def THEN RAISE EXCEPTION 'calc: bônus não encontrado'; END IF;
  EXECUTE v_new;

  v_def := pg_get_functiondef('public.fn_estagio_status_diario_texto()'::regprocedure);
  v_new := replace(v_def, $s$(b ->> 'desconto_por_perdida')::numeric::int || ')'$s$,
                          $s$replace(to_char((b ->> 'desconto_por_perdida')::numeric, 'FM999990.00'), '.', ',') || ')'$s$);
  IF v_new = v_def THEN RAISE EXCEPTION 'texto: desconto não encontrado'; END IF;
  EXECUTE v_new;
END $mig$;
