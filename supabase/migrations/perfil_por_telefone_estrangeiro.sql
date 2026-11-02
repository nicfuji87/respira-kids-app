-- 02/11/2026: número estrangeiro (8 a 15 dígitos, ex.: EUA com 11) passa a ser encontrado como "já cadastrado".
-- As variações com e sem o 9 continuam só para número brasileiro (55...).
DO $m$
DECLARE d text := pg_get_functiondef('public.fn_public_perfil_responsavel_por_telefone(text,boolean)'::regprocedure);
        f1 text := $$IF length(v_digitos) NOT BETWEEN 12 AND 13 THEN$$;
        f2 text := $$  IF length(v_digitos) = 13 THEN$$;
        f3 text := $$  ELSIF length(v_digitos) = 12 THEN$$;
BEGIN
  IF position(f1 IN d) = 0 OR position(f2 IN d) = 0 OR position(f3 IN d) = 0 THEN
    RAISE EXCEPTION 'fn_public_perfil_responsavel_por_telefone: trecho não encontrado';
  END IF;
  d := replace(d, f1, $$IF length(v_digitos) NOT BETWEEN 8 AND 15 THEN$$);
  d := replace(d, f2, $$  IF v_digitos LIKE '55%' AND length(v_digitos) = 13 THEN$$);
  d := replace(d, f3, $$  ELSIF v_digitos LIKE '55%' AND length(v_digitos) = 12 THEN$$);
  EXECUTE d;
END $m$;
