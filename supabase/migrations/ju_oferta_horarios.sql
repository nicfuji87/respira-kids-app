-- AI dev note: 05/11/2026 (pedido do dono, caso Patricia "sexta de manhã ou a próxima semana"): "@ju oferece horários".
-- A recepção escreve na conversa da família, por exemplo "@ju oferece horários da Bruna sexta de manhã ou semana que vem".
-- O Comando (G1ZIuU7x7j1lSBLZ) entende como acao 'oferecer_horarios' e chama fn_ju_comando_executar → fn_ju_oferta_criar:
--   livres da fisio nas janelas pedidas (fn_ju_agenda_consultar), sem 18h ou depois, sem fim de semana/feriado (a não ser
--   que a janela seja aquele dia), longe de outra consulta da criança; até 2 por dia e 6 no total, preferindo os que
--   encostam numa consulta da fisio (agenda corrida). O texto vai para a família ("*Ju:* ...") e a oferta fica em
--   ju_ofertas_horario. fn_ju_turno leva 'oferta_horarios' para a Ju; quando a família escolhe, a Ju usa a ferramenta
--   agendar_horario_oferecido (RK Ju - Ações → fn_ju_acao_fixo → fn_ju_oferta_agendar), que agenda por fn_ju_agendar
--   com o mesmo comando (mesma conferência do "@ju agendar"). Nenhum serviu: a Ju chama a secretaria (AGENDAMENTO).

CREATE TABLE IF NOT EXISTS public.ju_ofertas_horario (
  id              bigserial PRIMARY KEY,
  conversa_id     bigint NOT NULL REFERENCES public.ju_conversas(id) ON DELETE CASCADE,
  mensagem_id     bigint NOT NULL,
  paciente_id     uuid NOT NULL,
  profissional_id uuid NOT NULL,
  tipo_servico_id uuid NOT NULL,
  opcoes          jsonb NOT NULL,
  texto           text,
  criado_por      text,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  status          text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'agendada', 'substituida', 'cancelada')),
  agendamento_id  uuid,
  resolvido_em    timestamptz
);
CREATE INDEX IF NOT EXISTS ju_ofertas_horario_conversa ON public.ju_ofertas_horario (conversa_id, criado_em DESC);
ALTER TABLE public.ju_ofertas_horario ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ju_ofertas_horario FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_ju_hora_curta(p time)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $$
  SELECT extract(hour FROM p)::int || 'h' || CASE WHEN extract(minute FROM p) = 0 THEN '' ELSE to_char(p, 'MI') END;
$$;

CREATE OR REPLACE FUNCTION public.fn_ju_dia_curto(p date)
RETURNS text LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp' AS $$
  SELECT CASE WHEN p = (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'hoje'
              WHEN p = (now() AT TIME ZONE 'America/Sao_Paulo')::date + 1 THEN 'amanhã'
              ELSE (ARRAY['domingo','segunda','terça','quarta','quinta','sexta','sábado'])[extract(dow FROM p)::int + 1] END
         || ' (' || to_char(p, 'DD/MM') || ')';
$$;

CREATE OR REPLACE FUNCTION public.fn_ju_oferta_criar(p_conversa_id bigint, p_mensagem_id bigint, p_quem text, d jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_agora timestamp := now() AT TIME ZONE 'America/Sao_Paulo';
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_pac uuid; v_prof uuid; v_serv uuid; v_prof_nome text; v_fisio text; v_dur int;
  v_janelas jsonb; j jsonb; v_ini date; v_fim date; v_per text; r jsonb;
  v_opcoes jsonb; v_txt text; v_n_criancas int; v_crianca text; v_id bigint; v_livres jsonb := '[]'::jsonb;
BEGIN
  BEGIN v_pac := nullif(d ->> 'paciente_id', '')::uuid; EXCEPTION WHEN others THEN v_pac := NULL; END;
  BEGIN v_prof := nullif(d ->> 'profissional_id', '')::uuid; EXCEPTION WHEN others THEN v_prof := NULL; END;
  BEGIN v_serv := nullif(d ->> 'tipo_servico_id', '')::uuid; EXCEPTION WHEN others THEN v_serv := NULL; END;

  SELECT count(*) INTO v_n_criancas FROM jsonb_array_elements(coalesce(fn_ju_contexto_cliente(p_conversa_id) -> 'pacientes', '[]'::jsonb)) x
   WHERE (x ->> 'acesso_agenda')::boolean;
  IF v_pac IS NULL OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(fn_ju_contexto_cliente(p_conversa_id) -> 'pacientes', '[]'::jsonb)) x
                                   WHERE (x ->> 'acesso_agenda')::boolean AND (x ->> 'paciente_id')::uuid = v_pac) THEN
    RETURN jsonb_build_object('status', 'pergunta', 'texto', 'Para qual criança são os horários?');
  END IF;
  SELECT btrim(p.nome), split_part(btrim(p.nome), ' ', 1) INTO v_prof_nome, v_fisio FROM pessoas p
   WHERE p.id = v_prof AND p.ativo
     AND EXISTS (SELECT 1 FROM agendamentos a WHERE a.profissional_id = p.id AND a.data_hora > now() - interval '180 days');
  IF v_prof_nome IS NULL THEN
    RETURN jsonb_build_object('status', 'pergunta', 'texto', 'Com qual fisio seriam os horários?');
  END IF;
  IF v_serv IS NULL THEN   -- mesmo serviço da última consulta da criança
    SELECT a.tipo_servico_id INTO v_serv FROM agendamentos a
     WHERE a.paciente_id = v_pac AND a.ativo ORDER BY a.data_hora DESC LIMIT 1;
  END IF;
  SELECT coalesce(nullif(duracao_minutos, 0), 60) INTO v_dur FROM tipo_servicos WHERE id = v_serv AND ativo;
  IF v_dur IS NULL THEN
    RETURN jsonb_build_object('status', 'pergunta', 'texto', 'Seria fisioterapia respiratória ou motora?');
  END IF;
  SELECT split_part(btrim(nome), ' ', 1) INTO v_crianca FROM pessoas WHERE id = v_pac;

  v_janelas := CASE WHEN jsonb_typeof(d -> 'janelas') = 'array' AND jsonb_array_length(d -> 'janelas') > 0 THEN d -> 'janelas'
                    WHEN nullif(d ->> 'data', '') IS NOT NULL
                      THEN jsonb_build_array(jsonb_build_object('data', d ->> 'data', 'data_fim', d ->> 'data_fim', 'periodo', d ->> 'periodo'))
                    ELSE jsonb_build_array(jsonb_build_object('data', v_hoje, 'data_fim', v_hoje + 7)) END;

  FOR j IN SELECT * FROM jsonb_array_elements(v_janelas) LOOP
    BEGIN v_ini := nullif(j ->> 'data', '')::date; EXCEPTION WHEN others THEN v_ini := NULL; END;
    BEGIN v_fim := nullif(j ->> 'data_fim', '')::date; EXCEPTION WHEN others THEN v_fim := NULL; END;
    v_ini := greatest(coalesce(v_ini, v_hoje), v_hoje);
    v_fim := least(greatest(coalesce(v_fim, v_ini), v_ini), v_ini + 13);
    v_per := lower(unaccent(coalesce(j ->> 'periodo', '')));
    r := fn_ju_agenda_consultar(v_prof_nome, v_ini, v_fim, true);
    CONTINUE WHEN NOT coalesce((r ->> 'ok')::boolean, false);
    v_livres := v_livres || coalesce((
    SELECT jsonb_agg(jsonb_build_object('dia', l ->> 'dia', 'hora', l ->> 'hora', 'adj',
           EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(r -> 'consultas', '[]'::jsonb)) k
                    WHERE k ->> 'dia' = l ->> 'dia'
                      AND abs(extract(epoch FROM ((k ->> 'hora')::time - (l ->> 'hora')::time)) / 60) = v_dur)))
      FROM jsonb_array_elements(coalesce(r -> 'livres', '[]'::jsonb)) l
     WHERE ((l ->> 'dia')::date + (l ->> 'hora')::time) > v_agora + interval '2 hours'
       AND (l ->> 'hora')::time >= time '08:00' AND (l ->> 'hora')::time < time '18:00'
       AND (v_per NOT LIKE 'manh%' OR (l ->> 'hora')::time < time '12:00')
       AND (v_per NOT LIKE 'tard%' OR (l ->> 'hora')::time >= time '12:00')
       AND ((extract(isodow FROM (l ->> 'dia')::date) BETWEEN 1 AND 5
             AND NOT EXISTS (SELECT 1 FROM followup_feriados f WHERE f.dia = (l ->> 'dia')::date))
            OR v_ini = v_fim)
       AND NOT EXISTS (SELECT 1 FROM agendamentos a JOIN consulta_status cs ON cs.id = a.status_consulta_id
                        WHERE a.paciente_id = v_pac AND a.ativo AND cs.codigo NOT IN ('cancelado')
                          AND a.data_hora BETWEEN (((l ->> 'dia')::date + (l ->> 'hora')::time) AT TIME ZONE 'UTC') - interval '90 minutes'
                                              AND (((l ->> 'dia')::date + (l ->> 'hora')::time) AT TIME ZONE 'UTC') + interval '90 minutes')
       AND fn_horario_disponivel(v_prof, ((l ->> 'dia')::date + (l ->> 'hora')::time) AT TIME ZONE 'UTC',
                                 ((l ->> 'dia')::date + (l ->> 'hora')::time) AT TIME ZONE 'UTC' + make_interval(mins => v_dur))), '[]'::jsonb);
  END LOOP;

  WITH u AS (SELECT DISTINCT ON (dia, hora) dia, hora, adj
               FROM jsonb_to_recordset(v_livres) AS t(dia date, hora time, adj boolean) ORDER BY dia, hora, adj DESC),
       w AS (SELECT dia, hora, row_number() OVER (PARTITION BY dia ORDER BY adj DESC, hora) rn FROM u),
       s AS (SELECT dia, hora FROM w WHERE rn <= 2 ORDER BY dia, rn LIMIT 6)
  SELECT jsonb_agg(jsonb_build_object('data', dia, 'hora', to_char(hora, 'HH24:MI'),
                                      'quando', fn_ju_dia_curto(dia) || ' às ' || fn_ju_hora_curta(hora)) ORDER BY dia, hora)
    INTO v_opcoes FROM s;

  IF v_opcoes IS NULL THEN
    RETURN jsonb_build_object('status', 'agenda', 'sem_horario', true,
      'texto', 'A ' || v_fisio || ' está sem horário livre nesse período. A Lolô já vê outra opção com você por aqui.');
  END IF;

  SELECT string_agg(linha, '; ' ORDER BY dia) INTO v_txt FROM (
    SELECT (o ->> 'data')::date dia,
           fn_ju_dia_curto((o ->> 'data')::date) || ' às '
           || CASE WHEN count(*) = 1 THEN min(fn_ju_hora_curta((o ->> 'hora')::time))
                   ELSE string_agg(fn_ju_hora_curta((o ->> 'hora')::time), ' ou ' ORDER BY o ->> 'hora') END linha
      FROM jsonb_array_elements(v_opcoes) o GROUP BY o ->> 'data') s;
  v_txt := CASE WHEN v_n_criancas > 1 THEN 'Para ' || v_crianca || ', a ' ELSE 'A ' END
        || v_fisio || ' tem estes horários: ' || v_txt || '. Algum fica bom pra vocês?';

  UPDATE ju_ofertas_horario SET status = 'substituida', resolvido_em = now()
   WHERE conversa_id = p_conversa_id AND status = 'aberta';
  INSERT INTO ju_ofertas_horario (conversa_id, mensagem_id, paciente_id, profissional_id, tipo_servico_id, opcoes, texto, criado_por)
  VALUES (p_conversa_id, p_mensagem_id, v_pac, v_prof, v_serv, v_opcoes, v_txt, p_quem)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('status', 'agenda', 'texto', v_txt, 'oferta_id', v_id);
END $$;

CREATE OR REPLACE FUNCTION public.fn_ju_oferta_atual(p_conversa_id bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT jsonb_build_object(
           'crianca', (SELECT split_part(btrim(nome), ' ', 1) FROM pessoas WHERE id = o.paciente_id),
           'paciente_id', o.paciente_id,
           'fisio', (SELECT split_part(btrim(nome), ' ', 1) FROM pessoas WHERE id = o.profissional_id),
           'oferecida_em', to_char(o.criado_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI'),
           'opcoes', (SELECT jsonb_agg(jsonb_build_object('data', x ->> 'data', 'hora', x ->> 'hora', 'quando', x ->> 'quando',
                                         'ainda_livre', ((x ->> 'data')::date + (x ->> 'hora')::time) > (now() AT TIME ZONE 'America/Sao_Paulo') + interval '1 hour'
                                                        AND fn_horario_disponivel(o.profissional_id,
                                                              ((x ->> 'data')::date + (x ->> 'hora')::time) AT TIME ZONE 'UTC',
                                                              ((x ->> 'data')::date + (x ->> 'hora')::time) AT TIME ZONE 'UTC' + interval '1 hour'))
                                       ORDER BY x ->> 'data', x ->> 'hora')
                        FROM jsonb_array_elements(o.opcoes) x),
           'instrucao', 'A equipe ofereceu estes horários à família por esta conversa. Se a família escolher um deles (ainda_livre true), use agendar_horario_oferecido com a data e a hora exatas da opção. Se escolher um que não está mais livre, diga que acabou de ser ocupado e ofereça os outros livres da lista. Se pedir outro dia ou horário, ou disser que nenhum serve, não ofereça outros: chame a secretaria (AGENDAMENTO) com o que ela disse.')
    FROM ju_ofertas_horario o
   WHERE o.conversa_id = p_conversa_id AND o.status = 'aberta' AND o.criado_em > now() - interval '3 days'
     AND NOT EXISTS (SELECT 1 FROM agendamentos a WHERE a.paciente_id = o.paciente_id AND a.ativo AND a.created_at > o.criado_em)
   ORDER BY o.criado_em DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.fn_ju_oferta_agendar(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  c ju_conversas; o ju_ofertas_horario; v_versao bigint := nullif(p ->> 'versao', '')::bigint;
  v_data date; v_hora text; r jsonb; v_quando text; v_fisio text; v_outros text;
BEGIN
  SELECT * INTO c FROM ju_conversas WHERE id = (p ->> 'conversa_id')::bigint;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'resposta', 'Conversa não encontrada; nada foi feito. Responda exatamente [NADA].'); END IF;
  IF c.sem_ia OR (v_versao IS NOT NULL AND c.message_version > v_versao) THEN
    RETURN jsonb_build_object('ok', false, 'resposta', 'A conversa mudou (mensagem nova ou marcada SEM IA); nada foi feito. Responda exatamente [NADA].');
  END IF;
  SELECT * INTO o FROM ju_ofertas_horario
   WHERE conversa_id = c.id AND status = 'aberta' AND criado_em > now() - interval '3 days'
   ORDER BY criado_em DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'resposta', 'Não há horários oferecidos em aberto nesta conversa; nada foi agendado. Chame a secretaria (AGENDAMENTO) com o pedido da família e diga que a Lolô confirma por aqui.');
  END IF;
  BEGIN v_data := (p ->> 'data')::date; EXCEPTION WHEN others THEN v_data := NULL; END;
  v_hora := left(btrim(coalesce(p ->> 'hora', '')), 5);
  IF length(v_hora) = 4 THEN v_hora := '0' || v_hora; END IF;
  SELECT x ->> 'quando' INTO v_quando FROM jsonb_array_elements(o.opcoes) x
   WHERE (x ->> 'data')::date = v_data AND x ->> 'hora' = v_hora;
  SELECT split_part(btrim(nome), ' ', 1) INTO v_fisio FROM pessoas WHERE id = o.profissional_id;
  IF v_quando IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'resposta', 'Esse horário não estava entre os oferecidos ('
      || (SELECT string_agg(x ->> 'quando', ', ') FROM jsonb_array_elements(o.opcoes) x)
      || '); nada foi agendado. Se a família escolheu um deles, use a data e a hora exatas da opção. Se quer outro horário, chame a secretaria (AGENDAMENTO) com o pedido dela e diga que a Lolô confirma por aqui.');
  END IF;

  r := fn_ju_agendar(c.id, o.mensagem_id, o.paciente_id, v_data, v_hora, o.profissional_id, o.tipo_servico_id);
  IF coalesce((r ->> 'ok')::boolean, false) THEN
    UPDATE ju_ofertas_horario SET status = 'agendada', agendamento_id = (r ->> 'agendamento_id')::uuid, resolvido_em = now()
     WHERE id = o.id AND (r ->> 'codigo') = 'AGENDADO';
    UPDATE agendamentos SET observacao = 'Agendado pela Ju: a família escolheu um dos horários oferecidos pela recepção (@ju oferece horários).'
     WHERE id = (r ->> 'agendamento_id')::uuid AND (r ->> 'codigo') = 'AGENDADO';
    RETURN jsonb_build_object('ok', true, 'resposta', CASE WHEN r ->> 'codigo' = 'JA_AGENDADO'
      THEN 'Essa oferta já virou consulta antes; nada novo foi agendado. Diga só que já está marcado.'
      ELSE 'Agendado: ' || v_quando || ' com a ' || v_fisio || '. Diga à família, em uma frase, que está marcado e que a confirmação chega em seguida por aqui.' END);
  END IF;

  IF r ->> 'codigo' = 'HORARIO_OCUPADO' THEN
    SELECT string_agg(x ->> 'quando', ', ') INTO v_outros FROM jsonb_array_elements(fn_ju_oferta_atual(c.id) -> 'opcoes') x
     WHERE (x ->> 'ainda_livre')::boolean AND NOT ((x ->> 'data')::date = v_data AND x ->> 'hora' = v_hora);
    RETURN jsonb_build_object('ok', false, 'resposta', 'Esse horário acabou de ser ocupado; nada foi agendado. '
      || CASE WHEN v_outros IS NOT NULL THEN 'Diga isso à família e pergunte se algum destes serve: ' || v_outros || '.'
              ELSE 'Diga isso à família e chame a secretaria (AGENDAMENTO) para ver outro horário.' END);
  END IF;
  RETURN jsonb_build_object('ok', false, 'codigo', r ->> 'codigo',
    'resposta', 'Não consegui agendar por aqui (' || coalesce(r ->> 'codigo', 'erro') || '); nada foi marcado. Chame a secretaria (AGENDAMENTO) com o horário que a família escolheu (' || v_quando || ' com a ' || v_fisio || ') e diga que a Lolô confirma por aqui.');
END $$;

DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_acao_fixo'::regproc);
  IF position($a$  IF v_acao = 'TROCAR_HORARIO' THEN RETURN public.fn_ju_troca_pedir(p); END IF;$a$ IN d) = 0 THEN
    RAISE EXCEPTION 'fn_ju_acao_fixo: trecho não encontrado';
  END IF;
  EXECUTE replace(d, $a$  IF v_acao = 'TROCAR_HORARIO' THEN RETURN public.fn_ju_troca_pedir(p); END IF;$a$,
    $a$  IF v_acao = 'TROCAR_HORARIO' THEN RETURN public.fn_ju_troca_pedir(p); END IF;
  IF v_acao = 'AGENDAR_OFERTA' THEN RETURN public.fn_ju_oferta_agendar(p); END IF;$a$);

  d := pg_get_functiondef('public.fn_ju_comando_executar'::regproc);
  IF position($a$  IF v_acao = 'remarcar' THEN$a$ IN d) = 0 THEN RAISE EXCEPTION 'fn_ju_comando_executar: trecho não encontrado'; END IF;
  EXECUTE replace(d, $a$  IF v_acao = 'remarcar' THEN$a$,
    $a$  IF v_acao = 'oferecer_horarios' THEN
    RETURN public.fn_ju_oferta_criar(p_conversa_id, p_mensagem_id, v_quem, d);
  END IF;

  IF v_acao = 'remarcar' THEN$a$);

  d := pg_get_functiondef('public.fn_ju_turno'::regproc);
  IF position($a$    'oferta_vaga', public.fn_lista_espera_oferta(c.id),$a$ IN d) = 0 THEN RAISE EXCEPTION 'fn_ju_turno: trecho não encontrado'; END IF;
  EXECUTE replace(d, $a$    'oferta_vaga', public.fn_lista_espera_oferta(c.id),$a$,
    $a$    'oferta_vaga', public.fn_lista_espera_oferta(c.id),
    'oferta_horarios', public.fn_ju_oferta_atual(c.id),$a$);
END $do$;
