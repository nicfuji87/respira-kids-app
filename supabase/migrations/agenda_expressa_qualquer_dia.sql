-- Agenda Expressa: qualquer dia pode ser marcado (02/11/2026).
-- A Beatriz não conseguiu marcar para 02/11 (Finados): a grade pulava
-- feriados e dias da semana sem histórico. Agora:
-- - feriado aparece, com o nome (a fisio decide se atende);
-- - dia da semana sem histórico usa a faixa geral da profissional
--   (horas com 2+ consultas nos últimos 120 dias), ou 8h–17h;
-- - fim de semana também aparece.
-- O resto não muda: só horários futuros, livres conferidos no banco, e
-- fn_agenda_expressa_criar aceita qualquer horário livre (inclusive fora da
-- grade, pelo "Outro horário" da tela).

CREATE OR REPLACE FUNCTION public.fn_agenda_expressa_horarios(
  p_agendamento_id uuid,
  p_profissional_id uuid DEFAULT NULL::uuid,
  p_de date DEFAULT NULL::date,
  p_dias integer DEFAULT 14
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o record;
  v_eu uuid := public.get_current_pessoa_id();
  v_so_eu boolean := public.is_profissional() AND NOT public.is_admin() AND NOT public.is_secretaria();
  v_prof uuid;
  v_agora timestamp := now() AT TIME ZONE 'America/Sao_Paulo';
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_de date;
  v_minuto int;
  v_hora_origem time;
  v_dia date;
  v_ini int; v_fim int;
  v_geral_ini int; v_geral_fim int;
  v_t time;
  v_slot timestamp;
  v_horas time[];
  v_lista jsonb;
  v_dias jsonb := '[]'::jsonb;
  v_livres int;
  v_feriado text;
BEGIN
  SELECT a.id, a.profissional_id, ts.nome AS servico_nome,
         coalesce(nullif(ts.duracao_minutos, 0), 60) AS duracao,
         (a.data_hora AT TIME ZONE 'UTC')::time AS hora
    INTO o
    FROM public.agendamentos a
    LEFT JOIN public.tipo_servicos ts ON ts.id = a.tipo_servico_id
   WHERE a.id = p_agendamento_id AND a.ativo;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'consulta_nao_encontrada');
  END IF;

  v_prof := CASE WHEN v_so_eu THEN v_eu ELSE coalesce(p_profissional_id, o.profissional_id) END;
  IF NOT public.fn_agenda_expressa_pode_marcar(v_prof) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  END IF;

  v_de := greatest(coalesce(p_de, v_hoje), v_hoje);
  v_hora_origem := o.hora;

  SELECT extract(minute FROM a.data_hora AT TIME ZONE 'UTC')::int
    INTO v_minuto
    FROM public.agendamentos a
   WHERE a.profissional_id = v_prof AND a.ativo
     AND a.data_hora > now() - interval '120 days'
   GROUP BY 1 ORDER BY count(*) DESC LIMIT 1;
  v_minuto := coalesce(v_minuto, 0);

  -- Faixa geral da profissional (qualquer dia da semana)
  SELECT min(h), max(h) INTO v_geral_ini, v_geral_fim
    FROM (SELECT extract(hour FROM a.data_hora AT TIME ZONE 'UTC')::int AS h
            FROM public.agendamentos a
           WHERE a.profissional_id = v_prof AND a.ativo
             AND a.data_hora > now() - interval '120 days'
           GROUP BY 1 HAVING count(*) >= 2) x;
  v_geral_ini := coalesce(v_geral_ini, 8);
  v_geral_fim := coalesce(v_geral_fim, 17);

  FOR v_dia IN SELECT d::date FROM generate_series(v_de, v_de + (least(greatest(p_dias, 1), 31) - 1), interval '1 day') d LOOP
    v_feriado := NULL;
    SELECT f.nome INTO v_feriado FROM public.followup_feriados f WHERE f.dia = v_dia LIMIT 1;

    -- Faixa do dia da semana, quando ele tem histórico (6+ datas)
    SELECT min(h), max(h) INTO v_ini, v_fim
      FROM (SELECT extract(hour FROM a.data_hora AT TIME ZONE 'UTC')::int AS h
              FROM public.agendamentos a
             WHERE a.profissional_id = v_prof AND a.ativo
               AND a.data_hora > now() - interval '120 days'
               AND extract(isodow FROM a.data_hora AT TIME ZONE 'UTC') = extract(isodow FROM v_dia)
             GROUP BY 1 HAVING count(*) >= 2) x
     WHERE (SELECT count(DISTINCT (a.data_hora AT TIME ZONE 'UTC')::date)
              FROM public.agendamentos a
             WHERE a.profissional_id = v_prof AND a.ativo
               AND a.data_hora > now() - interval '120 days'
               AND extract(isodow FROM a.data_hora AT TIME ZONE 'UTC') = extract(isodow FROM v_dia)) >= 6;

    IF v_ini IS NULL THEN
      v_ini := v_geral_ini; v_fim := v_geral_fim;
    END IF;

    v_horas := ARRAY[]::time[];
    FOR h IN v_ini..v_fim LOOP
      v_horas := v_horas || make_time(h, v_minuto, 0);
    END LOOP;
    IF NOT (v_hora_origem = ANY (v_horas)) THEN
      v_horas := v_horas || v_hora_origem;
    END IF;

    v_lista := '[]'::jsonb; v_livres := 0;
    FOR v_t IN SELECT unnest(v_horas) ORDER BY 1 LOOP
      v_slot := v_dia + v_t;
      CONTINUE WHEN v_slot <= v_agora + interval '15 minutes';
      IF public.fn_agenda_expressa_slot_livre(v_prof, v_slot AT TIME ZONE 'UTC', o.duracao, o.servico_nome ~* 'domiciliar') THEN
        v_lista := v_lista || jsonb_build_object('hora', to_char(v_t, 'HH24:MI'), 'livre', true);
        v_livres := v_livres + 1;
      ELSE
        v_lista := v_lista || jsonb_build_object('hora', to_char(v_t, 'HH24:MI'), 'livre', false);
      END IF;
    END LOOP;

    -- Dia de hoje já sem horário futuro na grade: some (amanhã em diante sempre aparece)
    CONTINUE WHEN jsonb_array_length(v_lista) = 0 AND v_dia = v_hoje;
    v_dias := v_dias || jsonb_build_object(
      'data', to_char(v_dia, 'YYYY-MM-DD'),
      'livres', v_livres,
      'horarios', v_lista,
      'feriado', v_feriado);
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'profissional_id', v_prof,
    'hora_origem', to_char(v_hora_origem, 'HH24:MI'),
    'dias', v_dias);
END;
$function$;

-- Horário livre de um dia qualquer, para o "Outro horário" da tela
CREATE OR REPLACE FUNCTION public.fn_agenda_expressa_horario_livre(
  p_agendamento_id uuid,
  p_data_hora timestamp without time zone,
  p_profissional_id uuid DEFAULT NULL::uuid
)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o record;
  v_eu uuid := public.get_current_pessoa_id();
  v_so_eu boolean := public.is_profissional() AND NOT public.is_admin() AND NOT public.is_secretaria();
  v_prof uuid;
BEGIN
  SELECT a.profissional_id, ts.nome AS servico_nome,
         coalesce(nullif(ts.duracao_minutos, 0), 60) AS duracao
    INTO o
    FROM public.agendamentos a
    LEFT JOIN public.tipo_servicos ts ON ts.id = a.tipo_servico_id
   WHERE a.id = p_agendamento_id AND a.ativo;
  IF NOT FOUND OR p_data_hora IS NULL THEN RETURN false; END IF;
  v_prof := CASE WHEN v_so_eu THEN v_eu ELSE coalesce(p_profissional_id, o.profissional_id) END;
  IF NOT public.fn_agenda_expressa_pode_marcar(v_prof) THEN RETURN false; END IF;
  IF p_data_hora <= (now() AT TIME ZONE 'America/Sao_Paulo') THEN RETURN false; END IF;
  RETURN public.fn_agenda_expressa_slot_livre(
    v_prof, p_data_hora AT TIME ZONE 'UTC', o.duracao, o.servico_nome ~* 'domiciliar');
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_agenda_expressa_horario_livre(uuid, timestamp without time zone, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_agenda_expressa_horario_livre(uuid, timestamp without time zone, uuid) TO authenticated;
