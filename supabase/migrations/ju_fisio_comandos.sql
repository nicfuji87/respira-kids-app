-- 01/11/2026 (pedido do dono): a fisio, na conversa dela com a clínica, usa o @ju para coisas do dia a dia,
-- sempre só sobre a agenda e os pacientes DELA (nunca de outra fisio, nunca em conversa de família):
--   horarios_livres, proximo_paciente, confirmacoes, evolucoes_pendentes, paciente (ficha pelo nome),
--   meus_numeros (contagens do mês, sem valores).
-- Também: conversa de alguém da equipe deixa de contar como "contato novo".

CREATE OR REPLACE FUNCTION public.fn_ju_contato_novo(p_conversa_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
  SELECT public.fn_ju_contato_profissional(p_conversa_id) IS NULL
     AND public.fn_ju_equipe_por_telefone((SELECT telefone FROM public.ju_conversas WHERE id = p_conversa_id)) IS NULL
     AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(coalesce(public.fn_ju_contexto_cliente(p_conversa_id) -> 'pacientes', '[]'::jsonb)) x
    JOIN public.agendamentos a ON a.paciente_id = (x ->> 'paciente_id')::uuid AND a.ativo
    JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
    WHERE cs.codigo NOT IN ('cancelado', 'erro'));
$f$;

-- ficha curta de um paciente para a fisio
CREATE OR REPLACE FUNCTION public.fn_ju_fisio_ficha(p_paciente_id uuid, p_prof uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE p record; v_idade text; v_resp text; v_ped text; v_ult text; v_cond text; v_prox text; v_contr text; v_meses int;
BEGIN
  SELECT * INTO p FROM pessoas WHERE id = p_paciente_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF p.data_nascimento IS NOT NULL THEN
    v_meses := (extract(year FROM age(p.data_nascimento)) * 12 + extract(month FROM age(p.data_nascimento)))::int;
    v_idade := CASE WHEN v_meses < 24 THEN v_meses || CASE WHEN v_meses = 1 THEN ' mês' ELSE ' meses' END
                    ELSE (v_meses / 12) || ' anos' END;
  END IF;
  SELECT string_agg(DISTINCT btrim(r.nome), ', ') INTO v_resp
    FROM pessoa_responsaveis pr JOIN pessoas r ON r.id = pr.id_responsavel AND r.ativo
   WHERE pr.id_pessoa = p.id AND pr.ativo AND pr.id_responsavel <> p.id
     AND pr.tipo_responsabilidade IN ('legal', 'ambos') AND (pr.data_fim IS NULL OR pr.data_fim >= current_date);
  SELECT btrim(pe.nome) INTO v_ped
    FROM paciente_pediatra pp JOIN pessoa_pediatra ped ON ped.id = pp.pediatra_id JOIN pessoas pe ON pe.id = ped.pessoa_id
   WHERE pp.paciente_id = p.id AND pp.ativo AND pe.nome !~* 'n[aã]o +informad'
   ORDER BY pp.data_inicio DESC NULLS LAST LIMIT 1;
  SELECT string_agg(x, '; ' ORDER BY dh DESC) INTO v_ult FROM (
    SELECT a.data_hora dh, to_char(a.data_hora AT TIME ZONE 'UTC', 'DD/MM') || ' ' ||
           regexp_replace(coalesce(ts.nome, ''), '\s*-\s*(DU|FDS)$', '') || ' com ' || split_part(btrim(pr.nome), ' ', 1) x
      FROM agendamentos a JOIN consulta_status cs ON cs.id = a.status_consulta_id
      LEFT JOIN tipo_servicos ts ON ts.id = a.tipo_servico_id LEFT JOIN pessoas pr ON pr.id = a.profissional_id
     WHERE a.paciente_id = p.id AND a.ativo AND cs.codigo = 'finalizado'
     ORDER BY a.data_hora DESC LIMIT 3) s;
  SELECT CASE WHEN r.alta_completa THEN 'alta completa' WHEN r.alta_parcial THEN 'alta parcial'
              ELSE 'manter fisioterapia' END || coalesce(' (' || nullif(r.frequencia_sugerida, '') || ')', '')
         || ' em ' || to_char(a.data_hora AT TIME ZONE 'UTC', 'DD/MM')
    INTO v_cond
    FROM relatorio_evolucao r JOIN agendamentos a ON a.id = r.id_agendamento
   WHERE a.paciente_id = p.id AND a.ativo AND (r.alta_completa OR r.alta_parcial OR r.manter_fisioterapia)
   ORDER BY a.data_hora DESC LIMIT 1;
  SELECT to_char(a.data_hora AT TIME ZONE 'UTC', 'DD/MM HH24:MI') || ' com ' || split_part(btrim(pr.nome), ' ', 1)
    INTO v_prox
    FROM agendamentos a JOIN consulta_status cs ON cs.id = a.status_consulta_id LEFT JOIN pessoas pr ON pr.id = a.profissional_id
   WHERE a.paciente_id = p.id AND a.ativo AND cs.codigo IN ('agendado', 'confirmado')
     AND (a.data_hora AT TIME ZONE 'UTC') >= (now() AT TIME ZONE 'America/Sao_Paulo')
   ORDER BY a.data_hora LIMIT 1;
  SELECT CASE WHEN u.status_contrato = 'assinado' THEN 'assinado' ELSE 'pendente' END INTO v_contr
    FROM user_contracts u WHERE u.pessoa_id = p.id AND u.ativo ORDER BY u.data_geracao DESC NULLS LAST LIMIT 1;

  RETURN '*' || btrim(p.nome) || '*' || coalesce(', ' || v_idade, '')
    || coalesce(E'\nResponsável: ' || v_resp, '')
    || coalesce(E'\nPediatra: ' || v_ped, '')
    || coalesce(E'\nÚltimas sessões: ' || v_ult, E'\nAinda sem sessão finalizada.')
    || coalesce(E'\nÚltima conduta: ' || v_cond, '')
    || coalesce(E'\nPróxima consulta: ' || v_prox, '')
    || coalesce(E'\nContrato: ' || v_contr, '')
    || coalesce(E'\nAnotações: ' || nullif(btrim(regexp_replace(coalesce(p.anotacoes_ju, ''), '<[^>]+>|&nbsp;', ' ', 'g')), ''), '');
END $f$;

CREATE OR REPLACE FUNCTION public.fn_ju_fisio_comando(p_conversa_id bigint, p_acao text, d jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE
  eq jsonb; v_prof uuid; v_nome text; r jsonb; v_txt text; v_n int; v_busca text[]; v_ids uuid[]; v_data date;
  v_agora timestamp := now() AT TIME ZONE 'America/Sao_Paulo';
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  a record;
  dias text[] := ARRAY['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  meses text[] := ARRAY['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
BEGIN
  eq := fn_ju_equipe_por_telefone((SELECT telefone FROM ju_conversas WHERE id = p_conversa_id));
  IF eq IS NULL OR eq ->> 'role' <> 'profissional' AND NOT EXISTS (
       SELECT 1 FROM agendamentos x WHERE x.profissional_id = (eq ->> 'pessoa_id')::uuid AND x.ativo
          AND x.data_hora > now() - interval '120 days') THEN
    RETURN jsonb_build_object('texto', 'Isso eu só mostro na conversa da própria fisio, com a agenda dela.', 'status', 'pergunta');
  END IF;
  v_prof := (eq ->> 'pessoa_id')::uuid;
  v_nome := eq ->> 'nome';
  v_data := nullif(d ->> 'data', '')::date;

  IF p_acao = 'horarios_livres' THEN
    r := fn_ju_agenda_consultar(v_nome, coalesce(v_data, v_hoje), nullif(d ->> 'data_fim', '')::date, true);
    IF NOT coalesce((r ->> 'ok')::boolean, false) THEN
      RETURN jsonb_build_object('texto', coalesce(r ->> 'erro', 'Não consegui ver os horários agora.'), 'status', 'pergunta');
    END IF;
    SELECT string_agg(linha, E'\n' ORDER BY dia) INTO v_txt FROM (
      SELECT l ->> 'dia' dia,
             '*' || dias[extract(dow FROM (l ->> 'dia')::date)::int + 1] || ' ' || to_char((l ->> 'dia')::date, 'DD/MM') || '*: '
             || string_agg(l ->> 'hora', ', ' ORDER BY l ->> 'hora') linha
        FROM jsonb_array_elements(coalesce(r -> 'livres', '[]'::jsonb)) l
       WHERE ((l ->> 'dia')::date + (l ->> 'hora')::time) > v_agora
       GROUP BY l ->> 'dia') s;
    RETURN jsonb_build_object('status', 'agenda',
      'texto', 'Seus horários livres:' || E'\n' || coalesce(v_txt, 'Nenhum horário livre nesse período.'));
  END IF;

  IF p_acao = 'proximo_paciente' THEN
    SELECT v.paciente_id, v.data_hora, v.tipo_servico_nome, v.status_consulta_codigo INTO a
      FROM vw_agendamentos_completos v
     WHERE v.ativo AND v.profissional_id = v_prof
       AND v.status_consulta_codigo NOT IN ('cancelado', 'reagendado', 'erro', 'finalizado')
       AND (v.data_hora AT TIME ZONE 'UTC') >= v_agora - interval '30 minutes'
       AND (v.data_hora AT TIME ZONE 'UTC') < (v_hoje + 8)::timestamp
     ORDER BY v.data_hora LIMIT 1;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('texto', 'Você não tem paciente marcado nos próximos 7 dias.', 'status', 'agenda');
    END IF;
    RETURN jsonb_build_object('status', 'agenda',
      'texto', 'Próximo: ' || CASE WHEN (a.data_hora AT TIME ZONE 'UTC')::date = v_hoje THEN 'hoje'
                                   WHEN (a.data_hora AT TIME ZONE 'UTC')::date = v_hoje + 1 THEN 'amanhã'
                                   ELSE dias[extract(dow FROM a.data_hora AT TIME ZONE 'UTC')::int + 1] || ' ' || to_char(a.data_hora AT TIME ZONE 'UTC', 'DD/MM') END
               || ' às ' || to_char(a.data_hora AT TIME ZONE 'UTC', 'HH24:MI') || ', '
               || regexp_replace(coalesce(a.tipo_servico_nome, ''), '\s*-\s*(DU|FDS)$', '')
               || CASE WHEN a.status_consulta_codigo = 'confirmado' THEN ' (confirmado)' ELSE ' (ainda não confirmou)' END
               || E'\n\n' || coalesce(fn_ju_fisio_ficha(a.paciente_id, v_prof), ''));
  END IF;

  IF p_acao = 'confirmacoes' THEN
    v_data := coalesce(v_data, v_hoje + 1);
    SELECT string_agg(CASE WHEN v.status_consulta_codigo = 'confirmado' THEN '✅ ' ELSE '⏳ ' END
                      || to_char(v.data_hora AT TIME ZONE 'UTC', 'HH24:MI') || ' · '
                      || split_part(v.paciente_nome, ' ', 1) || coalesce(' ' || nullif(split_part(v.paciente_nome, ' ', 2), ''), ''),
                      E'\n' ORDER BY v.data_hora),
           count(*) FILTER (WHERE v.status_consulta_codigo <> 'confirmado')
      INTO v_txt, v_n
      FROM vw_agendamentos_completos v
     WHERE v.ativo AND v.profissional_id = v_prof AND v.status_consulta_codigo IN ('agendado', 'confirmado')
       AND (v.data_hora AT TIME ZONE 'UTC')::date = v_data;
    RETURN jsonb_build_object('status', 'agenda',
      'texto', '*' || dias[extract(dow FROM v_data)::int + 1] || ' ' || to_char(v_data, 'DD/MM') || '*' || E'\n'
               || coalesce(v_txt || E'\n\n' || CASE WHEN v_n = 0 THEN 'Todos confirmaram.' ELSE v_n || ' ainda sem confirmar (⏳).' END,
                           'Nenhuma consulta marcada.'));
  END IF;

  IF p_acao = 'evolucoes_pendentes' THEN
    SELECT string_agg(to_char(e.data_hora AT TIME ZONE 'UTC', 'DD/MM HH24:MI') || ' · ' || split_part(e.paciente_nome, ' ', 1)
                      || coalesce(' ' || nullif(split_part(e.paciente_nome, ' ', 2), ''), ''), E'\n' ORDER BY e.data_hora),
           count(*)
      INTO v_txt, v_n
      FROM (SELECT * FROM vw_consultas_a_evoluir e
             WHERE e.profissional_id = v_prof AND e.ativo
               AND (e.data_hora AT TIME ZONE 'UTC') >= v_agora - interval '30 days'
               AND (e.data_hora AT TIME ZONE 'UTC') <= v_agora
             ORDER BY e.data_hora LIMIT 20) e;
    RETURN jsonb_build_object('status', 'agenda',
      'texto', CASE WHEN coalesce(v_n, 0) = 0 THEN 'Nenhuma evolução pendente nos últimos 30 dias. 👏'
                    ELSE 'Evoluções pendentes (últimos 30 dias):' || E'\n' || v_txt END);
  END IF;

  IF p_acao = 'paciente' THEN
    v_busca := fn_ju_nome_tokens(coalesce(nullif(d ->> 'motivo', ''), d ->> 'anotacao'));
    IF coalesce(array_length(v_busca, 1), 0) = 0 THEN
      RETURN jsonb_build_object('texto', 'De qual paciente? Me diz o nome.', 'status', 'pergunta');
    END IF;
    SELECT array_agg(id ORDER BY nome) INTO v_ids FROM (
      SELECT DISTINCT p.id, p.nome
        FROM agendamentos ag JOIN pessoas p ON p.id = ag.paciente_id AND p.ativo
       WHERE ag.profissional_id = v_prof AND ag.ativo AND ag.data_hora > now() - interval '365 days'
         AND fn_ju_nome_tokens(p.nome) @> v_busca) s;
    v_n := coalesce(array_length(v_ids, 1), 0);
    IF v_n = 0 THEN
      RETURN jsonb_build_object('texto', 'Não achei esse nome entre os seus pacientes do último ano.', 'status', 'pergunta');
    ELSIF v_n > 1 THEN
      RETURN jsonb_build_object('status', 'pergunta', 'texto', 'Achei mais de um: '
        || (SELECT string_agg(btrim(nome), ', ') FROM (SELECT nome FROM pessoas WHERE id = ANY (v_ids) ORDER BY nome LIMIT 6) s)
        || '. Qual deles?');
    END IF;
    RETURN jsonb_build_object('texto', fn_ju_fisio_ficha(v_ids[1], v_prof), 'status', 'agenda');
  END IF;

  IF p_acao = 'meus_numeros' THEN
    v_data := date_trunc('month', coalesce(v_data, v_hoje))::date;
    SELECT
      'Seus números de ' || meses[extract(month FROM v_data)::int] || ':' || E'\n'
      || 'Atendimentos feitos: ' || count(*) FILTER (WHERE cs.codigo = 'finalizado')
      || coalesce(' (' || nullif(concat_ws(', ',
            nullif(count(*) FILTER (WHERE cs.codigo = 'finalizado' AND ts.nome ~* 'respirat') || ' respiratória', '0 respiratória'),
            nullif(count(*) FILTER (WHERE cs.codigo = 'finalizado' AND ts.nome ~* 'motora' AND ts.nome !~* 'avalia') || ' motora', '0 motora'),
            nullif(count(*) FILTER (WHERE cs.codigo = 'finalizado' AND ts.nome ~* 'avalia') || ' avaliação', '0 avaliação')), '') || ')', '')
      || E'\n' || 'Ainda marcados no mês: ' || count(*) FILTER (WHERE cs.codigo IN ('agendado', 'confirmado'))
      || E'\n' || 'Faltas: ' || count(*) FILTER (WHERE cs.codigo ~* 'falt')
      || E'\n' || 'Cancelados: ' || count(*) FILTER (WHERE cs.codigo = 'cancelado')
      INTO v_txt
      FROM agendamentos ag JOIN consulta_status cs ON cs.id = ag.status_consulta_id
      LEFT JOIN tipo_servicos ts ON ts.id = ag.tipo_servico_id
     WHERE ag.profissional_id = v_prof AND ag.ativo
       AND (ag.data_hora AT TIME ZONE 'UTC') >= v_data::timestamp
       AND (ag.data_hora AT TIME ZONE 'UTC') < (v_data + interval '1 month');
    SELECT count(*) INTO v_n FROM vw_consultas_a_evoluir e
     WHERE e.profissional_id = v_prof AND e.ativo
       AND (e.data_hora AT TIME ZONE 'UTC') >= v_agora - interval '30 days' AND (e.data_hora AT TIME ZONE 'UTC') <= v_agora;
    RETURN jsonb_build_object('status', 'agenda', 'texto', v_txt || E'\n' || 'Evoluções pendentes (30 dias): ' || v_n);
  END IF;

  RETURN jsonb_build_object('texto', '', 'status', 'erro');
END $f$;
REVOKE ALL ON FUNCTION public.fn_ju_fisio_comando(bigint, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_fisio_comando(bigint, text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.fn_ju_fisio_ficha(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_fisio_ficha(uuid, uuid) TO service_role;

-- o @ju chama as funções da fisio pela mesma porta das ações no banco
DO $mig$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_comando_executar(bigint, bigint, jsonb)'::regprocedure);
  n := replace(d, $a$  IF v_acao = 'ver_agenda' THEN$a$,
    $a$  IF v_acao IN ('horarios_livres', 'proximo_paciente', 'confirmacoes', 'evolucoes_pendentes', 'paciente', 'meus_numeros') THEN
    RETURN public.fn_ju_fisio_comando(p_conversa_id, v_acao, d);
  END IF;

  IF v_acao = 'ver_agenda' THEN$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_comando_executar: trecho não encontrado'; END IF;
  EXECUTE n;
END
$mig$;
