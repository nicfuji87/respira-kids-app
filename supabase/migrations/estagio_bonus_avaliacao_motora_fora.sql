-- 07/11/2026 (decisão do dono): avaliação motora também fica fora do bônus até 01/12/2026, como a sessão motora.
-- Aplicada em produção com este nome. fn_estagio_bonus_evolucoes_calc ganha a coluna eh_motora
-- (tipo_servicos.nome ILIKE '%motor%') e conta_bonus passa a ser (v_conta_motora OR NOT eh_motora).
-- fn_estagio_status_diario_texto usa o mesmo filtro e o rodapé diz "Motora (sessão e avaliação)".
DO $mig$
DECLARE v_def text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.fn_estagio_bonus_evolucoes_calc(date)'::regprocedure);
  IF position('eh_motora' in v_def) > 0 THEN RETURN; END IF;
  v_new := replace(v_def, $s$           ts.nome ILIKE '%domiciliar%' AS domiciliar,$s$,
                          $s$           ts.nome ILIKE '%domiciliar%' AS domiciliar,
           ts.nome ILIKE '%motor%' AS eh_motora,$s$);
  IF v_new = v_def THEN RAISE EXCEPTION 'calc: coluna domiciliar não encontrada'; END IF;
  v_def := v_new;
  v_new := replace(v_def, $s$(v_conta_motora OR c.grupo <> 'motora')$s$, $s$(v_conta_motora OR NOT c.eh_motora)$s$);
  IF v_new = v_def THEN RAISE EXCEPTION 'calc: regra da motora não encontrada'; END IF;
  EXECUTE v_new;

  v_def := pg_get_functiondef('public.fn_estagio_status_diario_texto()'::regprocedure);
  v_new := replace(v_def, $s$(v_motora OR ts.nome ILIKE '%avalia%' OR ts.nome NOT ILIKE '%motora%')$s$, $s$(v_motora OR ts.nome NOT ILIKE '%motor%')$s$);
  IF v_new = v_def THEN RAISE EXCEPTION 'texto: filtro da motora não encontrado'; END IF;
  v_def := v_new;
  v_new := replace(v_def, $s$Motora passa a contar em$s$, $s$Motora (sessão e avaliação) passa a contar em$s$);
  IF v_new = v_def THEN RAISE EXCEPTION 'texto: rodapé não encontrado'; END IF;
  EXECUTE v_new;
END $mig$;
