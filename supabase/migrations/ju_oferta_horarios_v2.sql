-- AI dev note: 05/11/2026 (decisões do dono sobre o "@ju oferece horários"):
-- - o que a Lolô disser vale exatamente: dia citado entra mesmo sendo sábado, domingo ou feriado; hora citada
--   ("amanhã 15 ou 16") é oferecida como foi dita (inclusive 18h ou depois), se estiver livre. Só a busca aberta
--   ("semana que vem") pula fim de semana, feriado e 18h+.
-- - a mensagem para a família é natural: "Oi, Patricia! A Bruna pediu que eu agendasse com vocês a próxima sessão.
--   Ela tem disponível ...". O "@ju" da Lolô é apagado da conversa quando dá certo (n8n, campo apagar_comando).
-- - sem horário livre: nada vai para a família; o aviso vai para o 🔔 (so_equipe) e o "@ju" também é apagado.

CREATE OR REPLACE FUNCTION public.fn_ju_oferta_criar(p_conversa_id bigint, p_mensagem_id bigint, p_quem text, d jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_agora timestamp := now() AT TIME ZONE 'America/Sao_Paulo';
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  c ju_conversas; v_ctx jsonb;
  v_pac uuid; v_prof uuid; v_serv uuid; v_prof_nome text; v_fisio text; v_dur int;
  v_janelas jsonb; j jsonb; v_ini date; v_fim date; v_per text; v_horas text[]; r jsonb; v_dia date; v_h text;
  v_opcoes jsonb; v_txt text; v_n_criancas int; v_crianca text; v_sexo text; v_id bigint; v_livres jsonb := '[]'::jsonb;
  v_ola text; v_resp text; v_desc text := ''; v_cmd text; v_s record;
BEGIN
  SELECT * INTO c FROM ju_conversas WHERE id = p_conversa_id;
  v_ctx := fn_ju_contexto_cliente(p_conversa_id);
  BEGIN v_pac := nullif(d ->> 'paciente_id', '')::uuid; EXCEPTION WHEN others THEN v_pac := NULL; END;
  BEGIN v_prof := nullif(d ->> 'profissional_id', '')::uuid; EXCEPTION WHEN others THEN v_prof := NULL; END;
  BEGIN v_serv := nullif(d ->> 'tipo_servico_id', '')::uuid; EXCEPTION WHEN others THEN v_serv := NULL; END;

  SELECT count(*) INTO v_n_criancas FROM jsonb_array_elements(coalesce(v_ctx -> 'pacientes', '[]'::jsonb)) x
   WHERE (x ->> 'acesso_agenda')::boolean;
  IF v_pac IS NULL OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(v_ctx -> 'pacientes', '[]'::jsonb)) x
                                   WHERE (x ->> 'acesso_agenda')::boolean AND (x ->> 'paciente_id')::uuid = v_pac) THEN
    RETURN jsonb_build_object('status', 'pergunta', 'texto', 'Para qual criança são os horários?');
  END IF;
  SELECT btrim(p.nome), split_part(btrim(p.nome), ' ', 1) INTO v_prof_nome, v_fisio FROM pessoas p
   WHERE p.id = v_prof AND p.ativo
     AND EXISTS (SELECT 1 FROM agendamentos a WHERE a.profissional_id = p.id AND a.data_hora > now() - interval '180 days');
  IF v_prof_nome IS NULL THEN
    RETURN jsonb_build_object('status', 'pergunta', 'texto', 'Com qual fisio seriam os horários?');
  END IF;
  IF v_serv IS NULL THEN
    SELECT a.tipo_servico_id INTO v_serv FROM agendamentos a
     WHERE a.paciente_id = v_pac AND a.ativo ORDER BY a.data_hora DESC LIMIT 1;
  END IF;
  SELECT coalesce(nullif(duracao_minutos, 0), 60) INTO v_dur FROM tipo_servicos WHERE id = v_serv AND ativo;
  IF v_dur IS NULL THEN
    RETURN jsonb_build_object('status', 'pergunta', 'texto', 'Seria fisioterapia respiratória ou motora?');
  END IF;
  SELECT split_part(btrim(nome), ' ', 1), sexo INTO v_crianca, v_sexo FROM pessoas WHERE id = v_pac;

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
    SELECT array_agg(DISTINCT lpad(h, 5, '0')) INTO v_horas
      FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(j -> 'horas') = 'array' THEN j -> 'horas' ELSE '[]'::jsonb END) h
     WHERE h ~ '^\d{1,2}:\d{2}$';
    v_desc := v_desc || CASE WHEN v_desc = '' THEN '' ELSE '; ' END || to_char(v_ini, 'DD/MM')
           || CASE WHEN v_fim > v_ini THEN ' a ' || to_char(v_fim, 'DD/MM') ELSE '' END
           || CASE WHEN v_horas IS NOT NULL THEN ' às ' || (SELECT string_agg(fn_ju_hora_curta(hh::time), ' ou ' ORDER BY hh) FROM unnest(v_horas) hh)
                   WHEN v_per LIKE 'manh%' THEN ' de manhã' WHEN v_per LIKE 'tard%' THEN ' à tarde' ELSE '' END;

    IF v_horas IS NOT NULL THEN
      -- horas ditas pela Lolô: valem como foram ditas (qualquer dia, qualquer hora), se estiverem livres
      FOR v_dia IN SELECT generate_series(v_ini, v_fim, interval '1 day')::date LOOP
        FOREACH v_h IN ARRAY v_horas LOOP
          CONTINUE WHEN (v_dia + v_h::time) <= v_agora + interval '1 hour';
          CONTINUE WHEN EXISTS (SELECT 1 FROM agendamentos a JOIN consulta_status cs ON cs.id = a.status_consulta_id
                                 WHERE a.paciente_id = v_pac AND a.ativo AND cs.codigo NOT IN ('cancelado')
                                   AND a.data_hora BETWEEN ((v_dia + v_h::time) AT TIME ZONE 'UTC') - interval '90 minutes'
                                                       AND ((v_dia + v_h::time) AT TIME ZONE 'UTC') + interval '90 minutes');
          CONTINUE WHEN NOT fn_horario_disponivel(v_prof, (v_dia + v_h::time) AT TIME ZONE 'UTC',
                                                  (v_dia + v_h::time) AT TIME ZONE 'UTC' + make_interval(mins => v_dur));
          v_livres := v_livres || jsonb_build_array(jsonb_build_object('dia', v_dia, 'hora', v_h, 'adj', true, 'dita', true));
        END LOOP;
      END LOOP;
      CONTINUE;
    END IF;

    r := fn_ju_agenda_consultar(v_prof_nome, v_ini, v_fim, true);
    CONTINUE WHEN NOT coalesce((r ->> 'ok')::boolean, false);
    v_livres := v_livres || coalesce((
    SELECT jsonb_agg(jsonb_build_object('dia', l ->> 'dia', 'hora', l ->> 'hora', 'dita', false, 'adj',
           EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(r -> 'consultas', '[]'::jsonb)) k
                    WHERE k ->> 'dia' = l ->> 'dia'
                      AND abs(extract(epoch FROM ((k ->> 'hora')::time - (l ->> 'hora')::time)) / 60) = v_dur)))
      FROM jsonb_array_elements(coalesce(r -> 'livres', '[]'::jsonb)) l
     WHERE ((l ->> 'dia')::date + (l ->> 'hora')::time) > v_agora + interval '2 hours'
       AND (l ->> 'hora')::time >= time '08:00' AND (l ->> 'hora')::time < time '18:00'
       AND (v_per NOT LIKE 'manh%' OR (l ->> 'hora')::time < time '12:00')
       AND (v_per NOT LIKE 'tard%' OR (l ->> 'hora')::time >= time '12:00')
       -- dia citado sozinho vale mesmo em fim de semana ou feriado; busca aberta pula os dois
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

  -- horas ditas entram todas (até 6); na busca aberta, até 2 por dia, sem sobrepor, preferindo as coladas numa consulta
  v_opcoes := '[]'::jsonb;
  FOR v_s IN SELECT * FROM (SELECT DISTINCT ON (dia, hora) dia, hora, adj, dita
                            FROM jsonb_to_recordset(v_livres) AS t(dia date, hora time, adj boolean, dita boolean)
                           ORDER BY dia, hora, dita DESC, adj DESC) u
            ORDER BY dia, dita DESC, adj DESC, hora LOOP
    EXIT WHEN jsonb_array_length(v_opcoes) >= 6;
    CONTINUE WHEN NOT v_s.dita AND (
      (SELECT count(*) FROM jsonb_array_elements(v_opcoes) o WHERE (o ->> 'data')::date = v_s.dia AND NOT (o ->> 'dita')::boolean) >= 2
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_opcoes) o
                  WHERE (o ->> 'data')::date = v_s.dia
                    AND abs(extract(epoch FROM ((o ->> 'hora')::time - v_s.hora)) / 60) < v_dur));
    v_opcoes := v_opcoes || jsonb_build_array(jsonb_build_object('data', v_s.dia, 'hora', to_char(v_s.hora, 'HH24:MI'), 'dita', v_s.dita,
                                                                 'quando', fn_ju_dia_curto(v_s.dia) || ' às ' || fn_ju_hora_curta(v_s.hora)));
  END LOOP;
  SELECT jsonb_agg(o - 'dita' ORDER BY o ->> 'data', o ->> 'hora') INTO v_opcoes FROM jsonb_array_elements(v_opcoes) o;

  IF v_opcoes IS NULL THEN
    SELECT left(btrim(conteudo), 300) INTO v_cmd FROM ju_mensagens WHERE id = p_mensagem_id;
    RETURN jsonb_build_object('status', 'pergunta', 'so_equipe', true, 'apagar_comando', true, 'sem_horario', true,
      'texto', '📅 *@ju oferece horários*' || E'\n'
            || coalesce(nullif(btrim(c.nome_whatsapp), ''), 'Família')
            || coalesce(' · ' || fn_lista_espera_tel_fmt(fn_lista_espera_tel(c.telefone)), '') || E'\n'
            || 'Não achei horário livre da ' || v_fisio || ' em ' || v_desc || '. Nada foi enviado à família.'
            || coalesce(E'\n' || 'Pedido: ' || v_cmd, ''));
  END IF;

  SELECT string_agg(linha, '; ' ORDER BY dia) INTO v_txt FROM (
    SELECT (o ->> 'data')::date dia,
           fn_ju_dia_curto((o ->> 'data')::date) || ' às '
           || CASE WHEN count(*) = 1 THEN min(fn_ju_hora_curta((o ->> 'hora')::time))
                   ELSE string_agg(fn_ju_hora_curta((o ->> 'hora')::time), ' ou ' ORDER BY o ->> 'hora') END linha
      FROM jsonb_array_elements(v_opcoes) o GROUP BY o ->> 'data') s;

  v_resp := split_part(btrim(coalesce(v_ctx ->> 'responsavel_identificado',
              CASE WHEN btrim(coalesce(c.nome_whatsapp, '')) ~ '^[A-Za-zÀ-ÿ]{2,}( |$)' THEN c.nome_whatsapp END, '')), ' ', 1);
  v_ola := CASE WHEN v_resp <> '' THEN 'Oi, ' || v_resp || '! ' ELSE 'Oi! ' END;
  v_txt := v_ola
        || CASE WHEN coalesce((d ->> 'oferta_pedida_pela_fisio')::boolean, false)
                THEN 'A ' || v_fisio || ' pediu que eu agendasse com vocês a próxima sessão'
                     || CASE WHEN v_n_criancas > 1 AND v_sexo IN ('F', 'M')
                             THEN CASE v_sexo WHEN 'F' THEN ' da ' ELSE ' do ' END || v_crianca ELSE '' END
                     || '. Ela tem disponível '
                ELSE 'A ' || v_fisio || ' tem disponível '
                     || CASE WHEN v_n_criancas > 1 AND v_sexo IN ('F', 'M')
                             THEN CASE v_sexo WHEN 'F' THEN 'para a ' ELSE 'para o ' END || v_crianca || ' ' ELSE '' END END
        || v_txt || '. Algum fica bom pra vocês?';

  UPDATE ju_ofertas_horario SET status = 'substituida', resolvido_em = now()
   WHERE conversa_id = p_conversa_id AND status = 'aberta';
  INSERT INTO ju_ofertas_horario (conversa_id, mensagem_id, paciente_id, profissional_id, tipo_servico_id, opcoes, texto, criado_por)
  VALUES (p_conversa_id, p_mensagem_id, v_pac, v_prof, v_serv, v_opcoes, v_txt, p_quem)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('status', 'agenda', 'texto', v_txt, 'oferta_id', v_id, 'apagar_comando', true);
END $$;

-- família quer outro horário: em qualquer modo a Ju chama a secretaria e aguarda a Lolô
DO $do$
DECLARE d text := pg_get_functiondef('public.fn_ju_oferta_atual'::regproc);
  a text := 'Se pedir outro dia ou horário, ou disser que nenhum serve, não ofereça outros: chame a secretaria (AGENDAMENTO) com o que ela disse.';
BEGIN
  IF position(a IN d) = 0 THEN RAISE EXCEPTION 'trecho não encontrado'; END IF;
  EXECUTE replace(d, a, 'Se pedir outro dia ou horário, ou disser que nenhum serve, não ofereça nem confirme outros: em qualquer modo, chame a secretaria (AGENDAMENTO) com o que ela pediu e diga que a Lolô responde por aqui.');
END $do$;
