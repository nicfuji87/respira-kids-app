-- AI dev note: 05/11/2026: "@ju oferece horários" sem serviço escrito usa o da última consulta da criança, mas
-- avaliação motora vira sessão de motora (a avaliação é uma vez só) e serviço SOCIAL vira o normal (cortesia não se repete
-- sozinha). Domiciliar continua domiciliar. O DU/FDS o fn_ju_agendar ajusta pelo dia.
DO $do$
DECLARE d text := pg_get_functiondef('public.fn_ju_oferta_criar(bigint,bigint,text,jsonb)'::regprocedure);
  a text := $a$     WHERE a.paciente_id = v_pac AND a.ativo ORDER BY a.data_hora DESC LIMIT 1;
  END IF;$a$;
BEGIN
  IF position(a IN d) = 0 THEN RAISE EXCEPTION 'fn_ju_oferta_criar: trecho não encontrado'; END IF;
  EXECUTE replace(d, a, $a$     WHERE a.paciente_id = v_pac AND a.ativo ORDER BY a.data_hora DESC LIMIT 1;
    SELECT coalesce((SELECT t2.id FROM tipo_servicos t2
                      WHERE t2.ativo AND lower(regexp_replace(t2.nome, '\s+', ' ', 'g')) =
                            CASE WHEN t.nome ~* '^avalia.*motora.*domiciliar' THEN 'fisioterapia motora - domiciliar - du'
                                 WHEN t.nome ~* '^avalia.*motora' THEN 'fisioterapia motora - du'
                                 WHEN t.nome ~* '- social$' THEN lower(regexp_replace(regexp_replace(t.nome, '\s+', ' ', 'g'), ' - social$', ' - du', 'i'))
                            END LIMIT 1), t.id)
      INTO v_serv FROM tipo_servicos t WHERE t.id = v_serv;
  END IF;$a$);
END $do$;
