-- 02/11/2026 (pedido do dono): lembrete automático da agenda para o paciente fixo que ainda não marcou.
-- Sexta 9h: link da semana seguinte. Segunda 9h: reforço da semana atual, só para quem ainda não marcou.
-- Entra na fila pacientes_fixos_envios (anti-ban: 5-9 min entre envios, 8h-20h, teto diário somado às cobranças).
-- A Ju também recebe no contexto (fixo_sem_marcar) o link para lembrar na conversa.

-- 1. O cálculo da tela Pacientes Fixos passa a ter uma versão interna (sem checar o usuário) para o robô.
--    A da tela continua igual por fora: confere admin/secretaria e chama a interna.
--    Atenção: mudanças no cálculo vão em fn_pacientes_fixos_semana_dados.
DO $m$
DECLARE d text := pg_get_functiondef('public.fn_pacientes_fixos_semana(date)'::regprocedure);
        chk text := $$  IF NOT (public.is_admin() OR public.is_secretaria()) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  END IF;
$$;
BEGIN
  IF position(chk IN d) = 0 OR position('FUNCTION public.fn_pacientes_fixos_semana(' IN d) = 0 THEN
    RAISE EXCEPTION 'fn_pacientes_fixos_semana: trecho não encontrado';
  END IF;
  d := replace(replace(d, chk, ''), 'FUNCTION public.fn_pacientes_fixos_semana(', 'FUNCTION public.fn_pacientes_fixos_semana_dados(');
  EXECUTE d;
END $m$;
REVOKE ALL ON FUNCTION public.fn_pacientes_fixos_semana_dados(date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_pacientes_fixos_semana(p_semana date DEFAULT NULL::date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
BEGIN
  IF NOT (public.is_admin() OR public.is_secretaria()) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  END IF;
  RETURN public.fn_pacientes_fixos_semana_dados(p_semana);
END $f$;

-- 2. Links da semana para um fixo: agenda ativa de cada fisio dele (a da vez primeiro) com horário livre na semana.
CREATE OR REPLACE FUNCTION public.fn_fixos_links_semana(p_profs uuid[], p_semana date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
  SELECT coalesce(jsonb_agg(jsonb_build_object('profissional', z.prof, 'link', z.link) ORDER BY z.ord), '[]'::jsonb)
    FROM (SELECT * FROM (
      SELECT DISTINCT ON (x.id) x.ord, split_part(btrim(p.nome), ' ', 1) AS prof,
             'https://app.respirakidsbrasilia.com.br/#/agenda-publica/' || ag.token AS link
        FROM unnest(p_profs) WITH ORDINALITY AS x(id, ord)
        JOIN public.pessoas p ON p.id = x.id
        JOIN public.agendas_compartilhadas ag ON ag.profissional_id = x.id AND ag.ativo AND ag.data_fim >= current_date
       WHERE EXISTS (SELECT 1 FROM public.agenda_slots s
                      WHERE s.agenda_id = ag.id AND s.disponivel AND s.deleted_at IS NULL
                        AND (s.data_hora AT TIME ZONE 'UTC') >= p_semana
                        AND (s.data_hora AT TIME ZONE 'UTC') < p_semana + 7
                        AND (s.data_hora AT TIME ZONE 'UTC') > (now() AT TIME ZONE 'America/Sao_Paulo') + interval '2 hours')
       ORDER BY x.id, (ag.data_inicio <= p_semana AND ag.data_fim >= p_semana) DESC, ag.created_at DESC
    ) y ORDER BY y.ord LIMIT 2) z;
$f$;
REVOKE ALL ON FUNCTION public.fn_fixos_links_semana(uuid[], date) FROM PUBLIC, anon, authenticated;

-- 3. Texto do lembrete: curto, de lembrete (nunca cobrança), três versões para não sair tudo igual.
CREATE OR REPLACE FUNCTION public.fn_fixos_texto_lembrete(p_momento text, p_resp text, p_crianca text,
                                                          p_links jsonb, p_seed integer)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path TO '' AS $f$
DECLARE
  oi text := CASE WHEN nullif(btrim(coalesce(p_resp, '')), '') IS NULL THEN 'Oi!'
                  ELSE 'Oi, ' || split_part(btrim(p_resp), ' ', 1) || '!' END;
  oi_tb text := CASE WHEN nullif(btrim(coalesce(p_resp, '')), '') IS NULL THEN 'Oi, tudo bem?'
                     ELSE 'Oi, ' || split_part(btrim(p_resp), ' ', 1) || ', tudo bem?' END;
  c text := split_part(btrim(coalesce(p_crianca, '')), ' ', 1);
  n int := jsonb_array_length(p_links);
  p1 text := p_links -> 0 ->> 'profissional';
  p2 text := p_links -> 1 ->> 'profissional';
  quem text; links text; v int := abs(coalesce(p_seed, 0)) % 3;
BEGIN
  IF n = 0 THEN RETURN NULL; END IF;
  quem := CASE WHEN n = 1 THEN 'com a ' || p1 ELSE 'com a ' || p1 || ' ou com a ' || p2 END;
  links := CASE WHEN n = 1 THEN p_links -> 0 ->> 'link'
                ELSE 'Com a ' || p1 || ':' || E'\n' || (p_links -> 0 ->> 'link') || E'\n\n'
                  || 'Com a ' || p2 || ':' || E'\n' || (p_links -> 1 ->> 'link') END;

  IF p_momento = 'sexta' THEN
    RETURN CASE v
      WHEN 0 THEN oi || ' A agenda da semana que vem já está aberta. Se quiser deixar o horário de ' || c || ' escolhido, é por aqui, ' || quem || ':' || E'\n\n' || links
      WHEN 1 THEN oi_tb || ' Os horários da semana que vem ' || quem || ' já estão abertos. Quando for melhor para vocês, é só escolher o de ' || c || ':' || E'\n\n' || links
      ELSE oi || ' Já dá para escolher o horário de ' || c || ' na semana que vem, ' || quem || ':' || E'\n\n' || links || E'\n\n' || 'Qualquer coisa, é só falar por aqui.'
    END;
  END IF;

  RETURN CASE v
    WHEN 0 THEN oi || ' Passando para lembrar que esta semana ainda tem horário para ' || c || ' ' || quem || ', caso queira marcar:' || E'\n\n' || links || E'\n\n' || 'Se esta semana não der, é só avisar por aqui.'
    WHEN 1 THEN oi_tb || ' Ainda tem horário ' || quem || ' esta semana. Se fizer sentido para vocês, o link é este:' || E'\n\n' || links
    ELSE oi || ' Se quiser encaixar a sessão de ' || c || ' esta semana, ainda tem horário ' || quem || ':' || E'\n\n' || links || E'\n\n' || 'Se não der, sem problema, é só avisar por aqui.'
  END;
END $f$;

-- 4. Enfileira os lembretes. p_momento: 'sexta' (semana seguinte) ou 'segunda' (semana atual).
CREATE OR REPLACE FUNCTION public.fn_fixos_lembrete_automatico(p_momento text, p_simular boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_sem date;
  d jsonb; p jsonb; v_profs uuid[]; v_links jsonb; v_txt text; v_tel text;
  v_ok int := 0; v_pulos jsonb := '[]'::jsonb; v_prev jsonb := '[]'::jsonb;
BEGIN
  IF p_momento NOT IN ('sexta', 'segunda') THEN RAISE EXCEPTION 'momento inválido'; END IF;
  v_sem := date_trunc('week', v_hoje)::date + CASE WHEN p_momento = 'sexta' THEN 7 ELSE 0 END;
  d := public.fn_pacientes_fixos_semana_dados(v_sem);

  FOR p IN SELECT * FROM jsonb_array_elements(coalesce(d -> 'pacientes', '[]'::jsonb)) LOOP
    CONTINUE WHEN p ->> 'situacao' <> 'falta';
    v_tel := regexp_replace(coalesce(p ->> 'responsavel_telefone', ''), '\D', '', 'g');
    IF v_tel = '' THEN
      v_pulos := v_pulos || jsonb_build_object('paciente', p ->> 'paciente_nome', 'motivo', 'sem telefone'); CONTINUE;
    END IF;
    -- já na fila, já recebeu nesta semana há pouco (manual ou automático) ou conversa marcada SEM IA
    IF EXISTS (SELECT 1 FROM pacientes_fixos_envios e
                WHERE e.paciente_id = (p ->> 'paciente_id')::uuid AND e.semana = v_sem
                  AND (e.status IN ('fila', 'enviando')
                       OR (e.status = 'enviado' AND (p_momento = 'sexta' OR e.enviado_em > now() - interval '36 hours')))) THEN
      v_pulos := v_pulos || jsonb_build_object('paciente', p ->> 'paciente_nome', 'motivo', 'já recebeu o link'); CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM ju_conversas jc
                WHERE jc.sem_ia AND regexp_replace(coalesce(jc.telefone, ''), '\D', '', 'g') IN (v_tel, '55' || v_tel)) THEN
      v_pulos := v_pulos || jsonb_build_object('paciente', p ->> 'paciente_nome', 'motivo', 'conversa SEM IA'); CONTINUE;
    END IF;

    SELECT array_agg(x.id ORDER BY (x.id::text = p ->> 'profissional_id') DESC, x.ord)
      INTO v_profs
      FROM (SELECT (e ->> 'id')::uuid AS id, ord FROM jsonb_array_elements(p -> 'profissionais') WITH ORDINALITY t(e, ord)) x;
    IF v_profs IS NULL AND p ->> 'profissional_id' IS NOT NULL THEN v_profs := ARRAY[(p ->> 'profissional_id')::uuid]; END IF;
    v_links := public.fn_fixos_links_semana(coalesce(v_profs, '{}'), v_sem);
    IF jsonb_array_length(v_links) = 0 THEN
      v_pulos := v_pulos || jsonb_build_object('paciente', p ->> 'paciente_nome', 'motivo', 'sem agenda pública com horário livre'); CONTINUE;
    END IF;

    v_txt := public.fn_fixos_texto_lembrete(p_momento, p ->> 'responsavel_nome', p ->> 'paciente_nome', v_links,
                                            hashtext((p ->> 'paciente_id') || v_sem::text || p_momento));
    IF p_simular THEN
      v_prev := v_prev || jsonb_build_object('paciente', p ->> 'paciente_nome', 'texto', v_txt);
    ELSE
      INSERT INTO pacientes_fixos_envios (paciente_id, semana, agenda_id, agendas, telefone, texto, canal, status, fila_em)
      VALUES ((p ->> 'paciente_id')::uuid, v_sem,
              (SELECT ag.id FROM agendas_compartilhadas ag WHERE ag.token = split_part(v_links -> 0 ->> 'link', '/agenda-publica/', 2)),
              ARRAY(SELECT ag.id FROM jsonb_array_elements(v_links) l
                      JOIN agendas_compartilhadas ag ON ag.token = split_part(l ->> 'link', '/agenda-publica/', 2)),
              v_tel, v_txt, 'whatsapp_auto', 'fila', now());
    END IF;
    v_ok := v_ok + 1;
  END LOOP;

  RETURN jsonb_build_object('semana', v_sem, 'momento', p_momento, 'enfileirados', v_ok, 'pulados', v_pulos)
         || CASE WHEN p_simular THEN jsonb_build_object('previa', v_prev) ELSE '{}'::jsonb END;
END $f$;
REVOKE ALL ON FUNCTION public.fn_fixos_lembrete_automatico(text, boolean) FROM PUBLIC, anon, authenticated;

-- 5. Para a Ju: o fixo ainda sem sessão marcada na semana (a atual; de sexta a domingo, também a seguinte).
CREATE OR REPLACE FUNCTION public.fn_ju_fixo_sem_marcar(p_paciente_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_sem date; d jsonb; p jsonb; v_profs uuid[]; v_links jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pacientes_fixos f WHERE f.paciente_id = p_paciente_id AND f.ativo) THEN RETURN NULL; END IF;
  FOREACH v_sem IN ARRAY ARRAY[date_trunc('week', v_hoje)::date, date_trunc('week', v_hoje)::date + 7] LOOP
    CONTINUE WHEN v_sem > v_hoje AND extract(isodow FROM v_hoje) < 5;
    d := public.fn_pacientes_fixos_semana_dados(v_sem);
    SELECT e INTO p FROM jsonb_array_elements(coalesce(d -> 'pacientes', '[]'::jsonb)) e
     WHERE e ->> 'paciente_id' = p_paciente_id::text;
    CONTINUE WHEN p IS NULL OR p ->> 'situacao' <> 'falta';
    SELECT array_agg(x.id ORDER BY (x.id::text = p ->> 'profissional_id') DESC, x.ord) INTO v_profs
      FROM (SELECT (e ->> 'id')::uuid AS id, ord FROM jsonb_array_elements(p -> 'profissionais') WITH ORDINALITY t(e, ord)) x;
    v_links := public.fn_fixos_links_semana(coalesce(v_profs, '{}'), v_sem);
    CONTINUE WHEN jsonb_array_length(v_links) = 0;
    RETURN jsonb_build_object(
      'semana', to_char(v_sem, 'DD/MM') || ' a ' || to_char(v_sem + 5, 'DD/MM'),
      'esta_semana', v_sem = date_trunc('week', v_hoje)::date,
      'links', v_links,
      'lembrete_enviado_em', (SELECT to_char(max(e.enviado_em) AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')
                                FROM pacientes_fixos_envios e
                               WHERE e.paciente_id = p_paciente_id AND e.semana = v_sem AND e.status = 'enviado'));
  END LOOP;
  RETURN NULL;
END $f$;
REVOKE ALL ON FUNCTION public.fn_ju_fixo_sem_marcar(uuid) FROM PUBLIC, anon, authenticated;

DO $m$
DECLARE d text := pg_get_functiondef('public.fn_ju_contexto_cliente(bigint)'::regprocedure);
        f text := $$'atendimentos_realizados', CASE WHEN e.agenda THEN$$;
BEGIN
  IF (length(d) - length(replace(d, f, ''))) / length(f) <> 1 THEN
    RAISE EXCEPTION 'fn_ju_contexto_cliente: trecho não encontrado';
  END IF;
  EXECUTE replace(d, f, $$'fixo_sem_marcar', CASE WHEN e.agenda THEN public.fn_ju_fixo_sem_marcar(pac.id) END,
        $$ || f);
END $m$;

-- 6. Horários (BRT): sexta 9h para a semana seguinte; segunda 9h reforço da semana atual.
--    O envio em si sai pelo cron liberar-envio-fixos (ritmo anti-ban).
SELECT cron.schedule('fixos-lembrete-sexta', '0 12 * * 5', $$SELECT public.fn_fixos_lembrete_automatico('sexta');$$);
SELECT cron.schedule('fixos-lembrete-segunda', '0 12 * * 1', $$SELECT public.fn_fixos_lembrete_automatico('segunda');$$);
