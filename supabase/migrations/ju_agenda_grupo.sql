-- @ju no grupo "RK · Agenda e atendimentos": bloquear/desbloquear agenda, consultar
-- agenda e horários livres, marcar presença/falta e listar pendências. Pedido do dono
-- em 15/10/2026 (agendar NÃO entra).
--
-- FUSO (ver memória agenda-fuso-wall-clock): agendamentos.data_hora é hora de PAREDE
-- gravada como UTC (14h = 14:00+00) → hora local = data_hora AT TIME ZONE 'UTC'.
-- agenda_bloqueios.inicio/fim é instante REAL (o app grava com toISOString) → hora local =
-- inicio AT TIME ZONE 'America/Sao_Paulo'. Aqui tudo é comparado em hora local.

CREATE OR REPLACE FUNCTION public.fn_ju_resolver_profissional(p_texto text)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH alvo AS (
    SELECT CASE lower(unaccent(trim(coalesce(p_texto, ''))))
             WHEN 'bia' THEN 'beatriz' WHEN 'fla' THEN 'flavia' WHEN 'bru' THEN 'bruna'
             ELSE lower(unaccent(trim(coalesce(p_texto, '')))) END AS t
  ), cand AS (
    SELECT p.id, p.nome,
           CASE WHEN split_part(lower(unaccent(p.nome)), ' ', 1) = a.t OR lower(unaccent(p.nome)) = a.t THEN 1
                ELSE greatest(similarity(lower(unaccent(p.nome)), a.t), word_similarity(a.t, lower(unaccent(p.nome)))) END AS score
    FROM public.pessoas p, alvo a
    WHERE p.ativo AND length(a.t) >= 2
      AND (p.pode_atender OR EXISTS (SELECT 1 FROM public.agendamentos ag
                                     WHERE ag.profissional_id = p.id AND ag.data_hora > now() - interval '120 days'))
  ), ord AS (SELECT * FROM cand ORDER BY score DESC LIMIT 3)
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM ord WHERE score >= 0.5) THEN
      jsonb_build_object('ok', false, 'erro', 'Não achei a profissional "' || coalesce(p_texto, '') || '"',
        'candidatos', (SELECT jsonb_agg(jsonb_build_object('nome', nome)) FROM ord))
    WHEN (SELECT score FROM ord ORDER BY score DESC LIMIT 1) < 1
         AND (SELECT count(*) FROM ord o WHERE o.score >= (SELECT max(score) FROM ord) - 0.1) > 1 THEN
      jsonb_build_object('ok', false, 'erro', 'Qual profissional? "' || p_texto || '" parece com mais de uma',
        'candidatos', (SELECT jsonb_agg(jsonb_build_object('nome', nome)) FROM ord))
    ELSE (SELECT jsonb_build_object('ok', true, 'id', id, 'nome', nome) FROM ord ORDER BY score DESC LIMIT 1)
  END;
$$;

-- texto livre ("clínica", "todas", "geral") = clínica inteira
CREATE OR REPLACE FUNCTION public.fn_ju_eh_clinica(p_texto text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(trim(coalesce(p_texto, '')), '') IS NULL
      OR lower(p_texto) ~ '(cl[ií]nica|todas|todos|geral|ningu[eé]m|equipe)';
$$;

CREATE OR REPLACE FUNCTION public.fn_ju_motivo_bloqueio(p_texto text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_texto IS NULL THEN 'outro'
    WHEN lower(unaccent(p_texto)) ~ 'almoc' THEN 'almoco'
    WHEN lower(unaccent(p_texto)) ~ 'feria' AND lower(unaccent(p_texto)) !~ 'feriado' THEN 'ferias'
    WHEN lower(unaccent(p_texto)) ~ 'feriado' THEN 'feriado'
    WHEN lower(unaccent(p_texto)) ~ '(reuni|treinamento|curso|congresso|evento)' THEN 'reuniao'
    WHEN lower(unaccent(p_texto)) ~ '(pessoal|medic|consulta|exame|filho|viagem|doen|atestado)' THEN 'pessoal'
    ELSE 'outro' END;
$$;

-- Bloqueia a agenda. Sem horas = dia(s) inteiro(s); só hora de início = até o fim do dia;
-- só hora de fim = desde o começo do dia. Vários dias com horário = um bloqueio por dia.
CREATE OR REPLACE FUNCTION public.fn_ju_agenda_bloquear(
  p_profissional text,
  p_data date,
  p_data_fim date DEFAULT NULL,
  p_hora_inicio time DEFAULT NULL,
  p_hora_fim time DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_solicitante text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_prof     jsonb;
  v_prof_id  uuid;
  v_nome     text;
  v_fim_d    date := coalesce(p_data_fim, p_data);
  v_inteiro  boolean := p_hora_inicio IS NULL AND p_hora_fim IS NULL;
  v_hi       time := coalesce(p_hora_inicio, '00:00');
  v_hf       time := coalesce(p_hora_fim, '23:59:59');
  v_rec      uuid;
  v_dia      date;
  v_n        integer := 0;
  v_conf     jsonb;
  v_janelas  tsrange[] := '{}';
BEGIN
  IF p_data IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Qual dia? Exemplo: @ju bloqueia a agenda da Flávia sexta das 14h às 18h');
  END IF;
  IF v_fim_d < p_data OR v_fim_d - p_data > 60 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Período inválido (no máximo 60 dias)');
  END IF;
  IF NOT v_inteiro AND v_hf <= v_hi THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'O horário de fim precisa ser depois do início');
  END IF;

  IF NOT public.fn_ju_eh_clinica(p_profissional) THEN
    v_prof := public.fn_ju_resolver_profissional(p_profissional);
    IF NOT (v_prof ->> 'ok')::boolean THEN RETURN v_prof; END IF;
    v_prof_id := (v_prof ->> 'id')::uuid;
    v_nome := v_prof ->> 'nome';
  ELSE
    v_nome := 'Clínica inteira';
  END IF;

  IF v_inteiro THEN
    v_janelas := ARRAY[tsrange(p_data::timestamp, (v_fim_d + 1)::timestamp)];
  ELSE
    v_dia := p_data;
    WHILE v_dia <= v_fim_d LOOP
      v_janelas := v_janelas || tsrange(v_dia + v_hi, v_dia + v_hf);
      v_dia := v_dia + 1;
    END LOOP;
  END IF;

  v_rec := CASE WHEN array_length(v_janelas, 1) > 1 THEN gen_random_uuid() END;

  INSERT INTO public.agenda_bloqueios (profissional_id, inicio, fim, dia_inteiro, motivo, observacao, recorrencia_id)
  SELECT v_prof_id,
         lower(j) AT TIME ZONE 'America/Sao_Paulo',
         upper(j) AT TIME ZONE 'America/Sao_Paulo',
         v_inteiro,
         public.fn_ju_motivo_bloqueio(p_motivo),
         '[@ju] ' || coalesce(nullif(p_motivo, '') || ' · ', '') || 'pedido por ' || coalesce(nullif(p_solicitante, ''), '?'),
         v_rec
  FROM unnest(v_janelas) j;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  -- consultas já marcadas dentro do bloqueio (o bloqueio não desmarca ninguém)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'quando', to_char(a.data_hora AT TIME ZONE 'UTC', 'DD/MM HH24:MI'),
           'paciente', v.paciente_nome, 'profissional', v.profissional_nome, 'status', cs.codigo)
         ORDER BY a.data_hora), '[]'::jsonb)
  INTO v_conf
  FROM public.agendamentos a
  JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
  JOIN public.vw_agendamentos_completos v ON v.id = a.id
  WHERE a.ativo AND cs.codigo IN ('agendado', 'confirmado')
    AND (v_prof_id IS NULL OR a.profissional_id = v_prof_id)
    AND EXISTS (SELECT 1 FROM unnest(v_janelas) j WHERE (a.data_hora AT TIME ZONE 'UTC') <@ j);

  RETURN jsonb_build_object('ok', true, 'profissional', v_nome, 'blocos', v_n, 'dia_inteiro', v_inteiro,
    'de', to_char(p_data, 'DD/MM'), 'ate', to_char(v_fim_d, 'DD/MM'),
    'hora_inicio', CASE WHEN v_inteiro THEN NULL ELSE to_char(v_hi, 'HH24:MI') END,
    'hora_fim', CASE WHEN v_inteiro THEN NULL ELSE to_char(v_hf, 'HH24:MI') END,
    'motivo', public.fn_ju_motivo_bloqueio(p_motivo), 'conflitos', v_conf);
END;
$$;

-- Desbloqueia: tira os bloqueios ativos da profissional (ou da clínica) que encostam na
-- janela pedida. Sem horas = o(s) dia(s) inteiro(s).
CREATE OR REPLACE FUNCTION public.fn_ju_agenda_desbloquear(
  p_profissional text,
  p_data date,
  p_data_fim date DEFAULT NULL,
  p_hora_inicio time DEFAULT NULL,
  p_hora_fim time DEFAULT NULL,
  p_solicitante text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_prof    jsonb;
  v_prof_id uuid;
  v_nome    text;
  v_jan     tsrange;
  v_lista   jsonb;
BEGIN
  IF p_data IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Qual dia desbloquear?');
  END IF;
  IF NOT public.fn_ju_eh_clinica(p_profissional) THEN
    v_prof := public.fn_ju_resolver_profissional(p_profissional);
    IF NOT (v_prof ->> 'ok')::boolean THEN RETURN v_prof; END IF;
    v_prof_id := (v_prof ->> 'id')::uuid;
    v_nome := v_prof ->> 'nome';
  ELSE
    v_nome := 'Clínica inteira';
  END IF;

  v_jan := tsrange(p_data + coalesce(p_hora_inicio, '00:00'::time),
                   coalesce(p_data_fim, p_data) + coalesce(p_hora_fim, '23:59:59'::time));

  WITH alvo AS (
    UPDATE public.agenda_bloqueios b
    SET ativo = false, deleted_at = now(),
        observacao = concat_ws(' ', observacao, '[@ju] desbloqueado por ' || coalesce(nullif(p_solicitante, ''), '?'))
    WHERE b.ativo AND b.deleted_at IS NULL
      AND b.profissional_id IS NOT DISTINCT FROM v_prof_id
      AND tsrange(b.inicio AT TIME ZONE 'America/Sao_Paulo', b.fim AT TIME ZONE 'America/Sao_Paulo') && v_jan
    RETURNING b.inicio, b.fim, b.dia_inteiro
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'de', to_char(inicio AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI'),
           'ate', to_char(fim AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI'),
           'dia_inteiro', dia_inteiro) ORDER BY inicio), '[]'::jsonb)
  INTO v_lista FROM alvo;

  IF jsonb_array_length(v_lista) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Não achei bloqueio de ' || v_nome || ' nesse período');
  END IF;
  RETURN jsonb_build_object('ok', true, 'profissional', v_nome, 'removidos', v_lista);
END;
$$;

-- Agenda de um dia (ou até 7): consultas, bloqueios e, com profissional, horários livres
-- (janelas de 1h sem consulta nem bloqueio, entre 08:00 e 18:00, de 30 em 30 min).
CREATE OR REPLACE FUNCTION public.fn_ju_agenda_consultar(
  p_profissional text DEFAULT NULL,
  p_data date DEFAULT NULL,
  p_data_fim date DEFAULT NULL,
  p_livres boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_hoje    date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_ini     date := coalesce(p_data, v_hoje);
  v_fim     date := least(coalesce(p_data_fim, p_data, v_hoje), coalesce(p_data, v_hoje) + 6);
  v_prof    jsonb;
  v_prof_id uuid;
  v_nome    text;
BEGIN
  IF NOT public.fn_ju_eh_clinica(p_profissional) THEN
    v_prof := public.fn_ju_resolver_profissional(p_profissional);
    IF NOT (v_prof ->> 'ok')::boolean THEN RETURN v_prof; END IF;
    v_prof_id := (v_prof ->> 'id')::uuid;
    v_nome := v_prof ->> 'nome';
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'profissional', v_nome, 'de', v_ini, 'ate', v_fim,
    'consultas', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'dia', to_char(v.data_hora AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
               'hora', to_char(v.data_hora AT TIME ZONE 'UTC', 'HH24:MI'),
               'paciente', v.paciente_nome, 'profissional', split_part(v.profissional_nome, ' ', 1),
               'servico', v.tipo_servico_nome, 'status', v.status_consulta_codigo)
             ORDER BY v.data_hora)
      FROM public.vw_agendamentos_completos v
      WHERE v.ativo AND v.status_consulta_codigo NOT IN ('cancelado', 'reagendado', 'erro')
        AND (v_prof_id IS NULL OR v.profissional_id = v_prof_id)
        AND (v.data_hora AT TIME ZONE 'UTC')::date BETWEEN v_ini AND v_fim), '[]'::jsonb),
    'bloqueios', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'de', to_char(b.inicio AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI'),
               'ate', to_char(b.fim AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI'),
               'dia_inteiro', b.dia_inteiro, 'motivo', b.motivo,
               'quem', coalesce(split_part(p.nome, ' ', 1), 'Clínica inteira'))
             ORDER BY b.inicio)
      FROM public.agenda_bloqueios b
      LEFT JOIN public.pessoas p ON p.id = b.profissional_id
      WHERE b.ativo AND b.deleted_at IS NULL
        AND (v_prof_id IS NULL OR b.profissional_id IS NULL OR b.profissional_id = v_prof_id)
        AND tsrange(b.inicio AT TIME ZONE 'America/Sao_Paulo', b.fim AT TIME ZONE 'America/Sao_Paulo')
            && tsrange(v_ini::timestamp, (v_fim + 1)::timestamp)), '[]'::jsonb),
    'livres', CASE WHEN p_livres AND v_prof_id IS NOT NULL THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object('dia', to_char(s.ini, 'YYYY-MM-DD'), 'hora', to_char(s.ini, 'HH24:MI')) ORDER BY s.ini)
      FROM (
        SELECT d::date + t AS ini
        FROM generate_series(v_ini::timestamp, v_fim::timestamp, interval '1 day') d,
             generate_series('2000-01-01 08:00'::timestamp, '2000-01-01 17:00'::timestamp, interval '30 minutes') g,
             LATERAL (SELECT g::time AS t) tt
        WHERE extract(isodow FROM d) <> 7
      ) s
      WHERE s.ini > (now() AT TIME ZONE 'America/Sao_Paulo')
        AND NOT EXISTS (
          SELECT 1 FROM public.agendamentos a
          JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
          WHERE a.ativo AND a.profissional_id = v_prof_id AND cs.codigo IN ('agendado', 'confirmado', 'finalizado')
            AND tsrange(a.data_hora AT TIME ZONE 'UTC', (a.data_hora AT TIME ZONE 'UTC') + make_interval(mins => coalesce(a.duracao_minutos, 60)))
                && tsrange(s.ini, s.ini + interval '60 minutes'))
        AND NOT EXISTS (
          SELECT 1 FROM public.agenda_bloqueios b
          WHERE b.ativo AND b.deleted_at IS NULL AND (b.profissional_id IS NULL OR b.profissional_id = v_prof_id)
            AND tsrange(b.inicio AT TIME ZONE 'America/Sao_Paulo', b.fim AT TIME ZONE 'America/Sao_Paulo')
                && tsrange(s.ini, s.ini + interval '60 minutes'))
    ), '[]'::jsonb) END);
END;
$$;

-- Marca presença/falta/confirmação de um paciente num dia (hoje por padrão).
-- faltou e finalizado só para consulta de hoje ou passada; confirmado só para futura.
CREATE OR REPLACE FUNCTION public.fn_ju_agenda_presenca(
  p_paciente text,
  p_status text,
  p_data date DEFAULT NULL,
  p_hora time DEFAULT NULL,
  p_profissional text DEFAULT NULL,
  p_solicitante text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_agora   timestamp := now() AT TIME ZONE 'America/Sao_Paulo';
  v_data    date := coalesce(p_data, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  v_prof_id uuid;
  v_prof    jsonb;
  v_n       integer;
  v_cands   jsonb;
  a         record;
  v_novo    uuid;
BEGIN
  IF p_status NOT IN ('faltou', 'finalizado', 'confirmado') THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Só sei marcar falta, atendido ou confirmado');
  END IF;
  IF nullif(trim(coalesce(p_paciente, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Qual paciente?');
  END IF;
  IF nullif(trim(coalesce(p_profissional, '')), '') IS NOT NULL AND NOT public.fn_ju_eh_clinica(p_profissional) THEN
    v_prof := public.fn_ju_resolver_profissional(p_profissional);
    IF (v_prof ->> 'ok')::boolean THEN v_prof_id := (v_prof ->> 'id')::uuid; END IF;
  END IF;

  WITH cand AS (
    SELECT v.id, v.paciente_nome, v.profissional_nome, v.status_consulta_codigo, v.data_hora,
           (v.data_hora AT TIME ZONE 'UTC') AS local_hora,
           greatest(word_similarity(lower(unaccent(p_paciente)), lower(unaccent(v.paciente_nome))),
                    similarity(lower(unaccent(p_paciente)), lower(unaccent(v.paciente_nome)))) AS sim
    FROM public.vw_agendamentos_completos v
    WHERE v.ativo AND v.status_consulta_codigo NOT IN ('cancelado', 'reagendado', 'erro')
      AND (v.data_hora AT TIME ZONE 'UTC')::date = v_data
      AND (v_prof_id IS NULL OR v.profissional_id = v_prof_id)
      AND (p_hora IS NULL OR abs(extract(epoch FROM ((v.data_hora AT TIME ZONE 'UTC')::time - p_hora))) <= 1800)
  ), boas AS (SELECT * FROM cand WHERE sim >= 0.6 ORDER BY sim DESC, data_hora)
  SELECT count(*), jsonb_agg(jsonb_build_object('id', id, 'paciente', paciente_nome,
           'hora', to_char(local_hora, 'HH24:MI'), 'profissional', split_part(profissional_nome, ' ', 1),
           'status', status_consulta_codigo))
  INTO v_n, v_cands FROM boas;

  IF v_n = 0 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Não achei consulta de "' || p_paciente || '" em ' || to_char(v_data, 'DD/MM'));
  END IF;
  IF v_n > 1 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Tem mais de uma consulta parecida em ' || to_char(v_data, 'DD/MM') || '. Diga o horário ou a profissional.',
      'candidatos', v_cands);
  END IF;

  SELECT ag.*, (ag.data_hora AT TIME ZONE 'UTC') AS local_hora, cs.codigo AS st
  INTO a
  FROM public.agendamentos ag JOIN public.consulta_status cs ON cs.id = ag.status_consulta_id
  WHERE ag.id = (v_cands -> 0 ->> 'id')::uuid;

  IF p_status IN ('faltou', 'finalizado') AND a.local_hora::date > v_agora::date THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Essa consulta é em ' || to_char(a.local_hora, 'DD/MM') || '; falta e atendimento só de hoje para trás');
  END IF;
  IF p_status = 'confirmado' AND a.local_hora < v_agora THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Essa consulta já passou; marque atendido ou falta');
  END IF;
  IF a.st = p_status THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Já estava como ' || p_status);
  END IF;

  SELECT id INTO v_novo FROM public.consulta_status WHERE codigo = p_status;
  UPDATE public.agendamentos
  SET status_consulta_id = v_novo,
      observacao = concat_ws(E'\n', nullif(observacao, ''), '[@ju] ' || p_status || ' por ' || coalesce(nullif(p_solicitante, ''), '?')
                   || ' em ' || to_char(v_agora, 'DD/MM HH24:MI'))
  WHERE id = a.id;

  RETURN jsonb_build_object('ok', true, 'paciente', v_cands -> 0 ->> 'paciente', 'hora', to_char(a.local_hora, 'DD/MM HH24:MI'),
    'profissional', v_cands -> 0 ->> 'profissional', 'de', a.st, 'para', p_status);
END;
$$;

-- Pendências: consultas que já passaram sem marcar atendido/falta, atendimentos sem
-- evolução, amanhã sem confirmação e atendidos ainda não cobrados.
CREATE OR REPLACE FUNCTION public.fn_ju_agenda_pendencias(p_profissional text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_agora   timestamp := now() AT TIME ZONE 'America/Sao_Paulo';
  v_prof    jsonb;
  v_prof_id uuid;
  v_nome    text;
BEGIN
  IF NOT public.fn_ju_eh_clinica(p_profissional) THEN
    v_prof := public.fn_ju_resolver_profissional(p_profissional);
    IF NOT (v_prof ->> 'ok')::boolean THEN RETURN v_prof; END IF;
    v_prof_id := (v_prof ->> 'id')::uuid;
    v_nome := v_prof ->> 'nome';
  END IF;

  RETURN (
    WITH v AS (
      SELECT x.*, (x.data_hora AT TIME ZONE 'UTC') AS lh
      FROM public.vw_agendamentos_completos x
      WHERE x.ativo AND (v_prof_id IS NULL OR x.profissional_id = v_prof_id)
        AND (x.data_hora AT TIME ZONE 'UTC') >= v_agora - interval '60 days'
        AND (x.data_hora AT TIME ZONE 'UTC') < v_agora::date + 2
    )
    SELECT jsonb_build_object(
      'ok', true, 'profissional', v_nome,
      'sem_status', coalesce((SELECT jsonb_agg(jsonb_build_object('quando', to_char(lh, 'DD/MM HH24:MI'), 'paciente', paciente_nome,
                                'profissional', split_part(profissional_nome, ' ', 1)) ORDER BY lh)
                              FROM v WHERE status_consulta_codigo IN ('agendado', 'confirmado')
                                AND lh < v_agora - interval '1 hour' AND lh >= v_agora - interval '7 days'), '[]'::jsonb),
      'sem_evolucao', coalesce((SELECT jsonb_agg(jsonb_build_object('profissional', prof, 'qtd', qtd, 'mais_antiga', to_char(antiga, 'DD/MM')) ORDER BY qtd DESC)
                                FROM (SELECT split_part(profissional_nome, ' ', 1) AS prof, count(*) AS qtd, min(lh) AS antiga
                                      FROM v WHERE status_consulta_codigo = 'finalizado' AND coalesce(possui_evolucao, 'não') <> 'sim'
                                        AND lh >= v_agora - interval '14 days'
                                      GROUP BY 1) e), '[]'::jsonb),
      'amanha_sem_confirmacao', coalesce((SELECT jsonb_agg(jsonb_build_object('hora', to_char(lh, 'HH24:MI'), 'paciente', paciente_nome,
                                            'profissional', split_part(profissional_nome, ' ', 1)) ORDER BY lh)
                                          FROM v WHERE status_consulta_codigo = 'agendado' AND lh::date = v_agora::date + 1), '[]'::jsonb),
      'nao_cobradas', (SELECT jsonb_build_object('qtd', count(*), 'total', coalesce(sum(valor_servico), 0))
                       FROM v WHERE status_consulta_codigo IN ('finalizado', 'faltou')
                         AND status_pagamento_codigo = 'pendente' AND fatura_id IS NULL AND cobranca_gerada_em IS NULL
                         AND coalesce(valor_servico, 0) > 0 AND lh < v_agora::date))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_ju_resolver_profissional(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ju_agenda_bloquear(text, date, date, time, time, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ju_agenda_desbloquear(text, date, date, time, time, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ju_agenda_consultar(text, date, date, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ju_agenda_presenca(text, text, date, time, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ju_agenda_pendencias(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_resolver_profissional(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ju_agenda_bloquear(text, date, date, time, time, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ju_agenda_desbloquear(text, date, date, time, time, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ju_agenda_consultar(text, date, date, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ju_agenda_presenca(text, text, date, time, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ju_agenda_pendencias(text) TO service_role;
