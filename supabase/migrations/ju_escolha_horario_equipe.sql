-- AI dev note: 07/11/2026 (pedido do dono, casos Daiane e Érica). A Ju marca a consulta quando a FAMÍLIA confirma,
-- com palavra de certeza, um horário que a EQUIPE ofereceu (texto ou áudio) nesta conversa nas últimas 24 h.
-- Fluxo: gatilho em ju_mensagens (mensagem da família depois de oferta da equipe com horário) → ju_escolhas_horario
-- espera 10 min (reinicia a cada mensagem da família) → cron ju-escolhas (1/min, fn_ju_escolhas_tick): se a equipe
-- respondeu ou já marcou, para; senão chama a edge ju-escolha-horario (IA só EXTRAI oferta e escolha) →
-- fn_ju_escolha_aplicar decide por regras fixas:
--   escolha certa e igual a uma opção da oferta; hora e dia conferidos no texto da equipe/família; data futura;
--   fisio: a da oferta → a citada na conversa → a da última consulta da criança;
--   criança com cadastro (sem cadastro: a Ju pede o cadastro UMA vez e marca quando ele chegar, por 48 h);
--   serviço: tipo da conversa ou da última consulta; sem consulta desse tipo = serviço novo (avaliação motora /
--   respiratória); domiciliar fica com a equipe; horário precisa estar livre (fn_ju_agendar).
-- Marcou: ✅ no 🩺 com a frase da família. Escolha clara que não deu para marcar: 📅 no 🔔 "falta marcar".
CREATE TABLE IF NOT EXISTS public.ju_escolhas_horario (
  id bigserial PRIMARY KEY,
  conversa_id bigint NOT NULL REFERENCES public.ju_conversas(id) ON DELETE CASCADE,
  mensagem_id bigint,
  status text NOT NULL DEFAULT 'pendente',
  criado_em timestamptz NOT NULL DEFAULT now(),
  processar_em timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  extracao jsonb,
  resultado jsonb,
  cadastro_pedido_em timestamptz,
  agendamento_id uuid,
  tentativas int NOT NULL DEFAULT 0,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ju_escolhas_horario_uma_ativa
  ON public.ju_escolhas_horario (conversa_id) WHERE status IN ('pendente', 'processando', 'aguardando_cadastro');
ALTER TABLE public.ju_escolhas_horario ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ju_escolhas_horario FROM anon, authenticated;

-- Texto da equipe com horário (inclui áudio transcrito: "dez, onze, doze", "duas da tarde")
CREATE OR REPLACE FUNCTION public.fn_ju_texto_tem_horario(p text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(p, '') ~* '(\m\d{1,2}\s*(h|hs|horas?)\M|\m\d{1,2}[:h]\d{2}\M|\m\d{1,2}/\d{1,2}|\m(às|as)\s+\d{1,2}\M|meio[- ]dia|\m(sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|uma|duas|tr[êe]s|quatro|cinco|seis)\s+(e\s+meia\s+)?(horas?|da\s+(manh[ãa]|tarde))|\m(dez|onze|doze|nove|oito)\M.{0,40}\m(horas?|hor[áa]rios?)\M)';
$$;

CREATE OR REPLACE FUNCTION public.trg_ju_escolha_detectar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE c ju_conversas;
BEGIN
  IF NEW.origem <> 'CLIENTE' OR coalesce(NEW.tipo, '') = 'BOTAO' THEN RETURN NEW; END IF;
  IF coalesce(NEW.conteudo, '') !~* '(quero|aceito|pode\s+(ser|marcar|agendar|confirmar|deixar|colocar)|fechado|combinado|confirm|perfeito|[óo]timo|beleza|\msim\M|vou\s+querer|fico\s+com|prefiro|serve|d[áa]\s+certo|consigo|\m\d{1,2}\s*h|\d{1,2}:\d{2}|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|amanh[ãa]|hoje|esse|essa|pode)' THEN
    RETURN NEW;
  END IF;
  SELECT * INTO c FROM ju_conversas WHERE id = NEW.conversa_id;
  IF c.id IS NULL OR c.sem_ia OR fn_ju_eh_equipe(c.telefone) THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM ju_mensagens h WHERE h.conversa_id = NEW.conversa_id AND h.origem = 'HUMANO'
                    AND h.created_at > NEW.created_at - interval '24 hours' AND h.created_at < NEW.created_at
                    AND coalesce(h.conteudo, '') !~* '^\s*@ju' AND fn_ju_texto_tem_horario(h.conteudo)) THEN
    RETURN NEW;
  END IF;
  UPDATE ju_escolhas_horario SET mensagem_id = NEW.id, processar_em = now() + interval '10 minutes', atualizado_em = now()
   WHERE conversa_id = NEW.conversa_id AND status = 'pendente';
  IF NOT FOUND THEN
    INSERT INTO ju_escolhas_horario (conversa_id, mensagem_id)
    VALUES (NEW.conversa_id, NEW.id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RETURN NEW;  -- nunca atrapalhar a gravação da mensagem
END $$;
DROP TRIGGER IF EXISTS trg_ju_escolha_detectar ON public.ju_mensagens;
CREATE TRIGGER trg_ju_escolha_detectar AFTER INSERT ON public.ju_mensagens
  FOR EACH ROW EXECUTE FUNCTION public.trg_ju_escolha_detectar();

-- Dados para a IA: conversa das últimas 48 h (mín. 40 mensagens) + crianças + fisios
CREATE OR REPLACE FUNCTION public.fn_ju_escolha_dados(p_id bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  WITH e AS (SELECT * FROM ju_escolhas_horario WHERE id = p_id),
  m AS (
    SELECT * FROM (
      SELECT m.*, row_number() OVER (ORDER BY m.created_at DESC) rn
        FROM ju_mensagens m, e
       WHERE m.conversa_id = e.conversa_id AND m.created_at <= now()
    ) z WHERE rn <= 60 AND (rn <= 40 OR created_at > now() - interval '48 hours')
  )
  SELECT jsonb_build_object(
    'id', p_id,
    'agora', to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'TMDy DD/MM/YYYY HH24:MI'),
    'hoje', (now() AT TIME ZONE 'America/Sao_Paulo')::date,
    'escolha_mensagem_id', (SELECT mensagem_id FROM e),
    'criancas', (SELECT coalesce(jsonb_agg(jsonb_build_object('nome', x ->> 'nome', 'paciente_id', x ->> 'paciente_id')), '[]'::jsonb)
                   FROM e, jsonb_array_elements(coalesce(fn_ju_contexto_cliente(e.conversa_id) -> 'pacientes', '[]'::jsonb)) x
                  WHERE (x ->> 'acesso_agenda')::boolean),
    'fisios', (SELECT coalesce(jsonb_agg(DISTINCT split_part(btrim(p.nome), ' ', 1)), '[]'::jsonb)
                 FROM pessoas p WHERE p.ativo AND EXISTS (SELECT 1 FROM agendamentos a WHERE a.profissional_id = p.id AND a.data_hora > now() - interval '60 days')),
    'mensagens', (SELECT coalesce(jsonb_agg(
                    to_char(m.created_at AT TIME ZONE 'America/Sao_Paulo', 'TMDy DD/MM HH24:MI') || ' '
                    || CASE m.origem WHEN 'CLIENTE' THEN 'FAMILIA' WHEN 'HUMANO' THEN 'EQUIPE' WHEN 'JU' THEN 'JU' ELSE 'SISTEMA' END
                    || CASE WHEN m.id = (SELECT mensagem_id FROM e) THEN ' [ULTIMA DA FAMILIA]' ELSE '' END
                    || ': ' || left(regexp_replace(coalesce(m.conteudo, ''), '\s+', ' ', 'g'), 600)
                    ORDER BY m.created_at), '[]'::jsonb) FROM m)
  );
$$;
REVOKE ALL ON FUNCTION public.fn_ju_escolha_dados(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_escolha_dados(bigint) TO service_role;

-- Hora e dia aparecem no texto? (trava contra a IA inventar)
CREATE OR REPLACE FUNCTION public.fn_ju_hora_no_texto(p_texto text, p_hora time)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  WITH h AS (SELECT extract(hour FROM p_hora)::int hh, extract(minute FROM p_hora)::int mm)
  SELECT coalesce(p_texto, '') ~* (
           '(\m0?' || hh || '\s*(h|hs|horas?|:|\M)' || CASE WHEN hh > 12 THEN '|\m0?' || (hh - 12) || '\s*(h|horas?)?\s*da\s+tarde' ELSE '' END
           || CASE WHEN hh = 12 THEN '|meio[- ]dia' ELSE '' END
           || '|\m' || (ARRAY['zero','uma','duas','três','quatro','cinco','seis','sete','oito','nove','dez','onze','doze','treze','quatorze','quinze','dezesseis','dezessete','dezoito','dezenove','vinte'])[CASE WHEN hh > 12 AND hh < 21 THEN hh - 12 ELSE hh END + 1] || '\M)')
    FROM h;
$$;

CREATE OR REPLACE FUNCTION public.fn_ju_dia_no_texto(p_texto text, p_data date, p_ref date)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(p_texto, '') ~* (
           '(\m' || (ARRAY['segunda','ter[çc]a','quarta','quinta','sexta','s[áa]bado','domingo'])[extract(isodow FROM p_data)::int]
           || '|\m0?' || extract(day FROM p_data)::int || '/0?' || extract(month FROM p_data)::int
           || '|\mdia\s+0?' || extract(day FROM p_data)::int || '\M'
           || CASE WHEN p_data = p_ref THEN '|\mhoje\M|\mhj\M' ELSE '' END
           || CASE WHEN p_data = p_ref + 1 THEN '|amanh[ãa]' ELSE '' END || ')');
$$;

CREATE OR REPLACE FUNCTION public.fn_ju_escolha_aviso(p_conversa_id bigint, p_texto text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  PERFORM fn_nfe_aviso_notificacoes('📅 *Falta marcar*' || E'\n'
    || coalesce((SELECT nullif(btrim(nome_whatsapp), '') FROM ju_conversas WHERE id = p_conversa_id), 'Contato') || E'\n' || p_texto);
END $$;
REVOKE ALL ON FUNCTION public.fn_ju_escolha_aviso(bigint, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_ju_escolha_aplicar(p_id bigint, r jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  e ju_escolhas_horario; c ju_conversas; v_msg ju_mensagens;
  v_data date; v_hora time; v_quando timestamp; v_agora timestamp := now() AT TIME ZONE 'America/Sao_Paulo';
  v_equipe text; v_ok boolean; v_n int; v_pac uuid; v_pac_nome text; v_prof uuid; v_prof_nome text; v_fisio text;
  v_tipo text; v_serv uuid; t tipo_servicos; res jsonb; v_txt text; v_tok text; v_ref date; v_quando_txt text; v_tipo_txt text;
BEGIN
  SELECT * INTO e FROM ju_escolhas_horario WHERE id = p_id FOR UPDATE;
  IF e.id IS NULL OR e.status NOT IN ('processando', 'aguardando_cadastro') THEN RETURN jsonb_build_object('ok', false, 'motivo', 'item_fora_de_estado'); END IF;
  SELECT * INTO c FROM ju_conversas WHERE id = e.conversa_id;
  SELECT * INTO v_msg FROM ju_mensagens WHERE id = e.mensagem_id;
  UPDATE ju_escolhas_horario SET extracao = coalesce(r, extracao), atualizado_em = now() WHERE id = p_id;
  r := coalesce(r, e.extracao);

  -- Paradas que não precisam de aviso
  IF c.sem_ia THEN
    UPDATE ju_escolhas_horario SET status = 'sem_ia' WHERE id = p_id; RETURN jsonb_build_object('ok', false, 'motivo', 'sem_ia');
  END IF;
  IF EXISTS (SELECT 1 FROM ju_mensagens h WHERE h.conversa_id = e.conversa_id AND h.origem = 'HUMANO' AND h.created_at > v_msg.created_at) THEN
    UPDATE ju_escolhas_horario SET status = 'equipe_respondeu' WHERE id = p_id; RETURN jsonb_build_object('ok', false, 'motivo', 'equipe_respondeu');
  END IF;
  IF NOT (coalesce((r ->> 'oferta_da_equipe')::boolean, false) AND coalesce((r ->> 'familia_certa')::boolean, false)
          AND coalesce((r ->> 'escolha_e_de_uma_opcao')::boolean, false)) THEN
    UPDATE ju_escolhas_horario SET status = 'sem_escolha', resultado = jsonb_build_object('motivo', 'ia_sem_certeza') WHERE id = p_id;
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_escolha_certa');
  END IF;
  BEGIN
    v_data := (r -> 'escolha' ->> 'data')::date;
    v_hora := (r -> 'escolha' ->> 'hora')::time;
  EXCEPTION WHEN others THEN v_data := NULL; v_hora := NULL;
  END;
  IF v_data IS NULL OR v_hora IS NULL OR NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(coalesce(r -> 'opcoes', '[]'::jsonb)) o
        WHERE (o ->> 'data') = v_data::text AND left(o ->> 'hora', 5) = to_char(v_hora, 'HH24:MI')) THEN
    UPDATE ju_escolhas_horario SET status = 'sem_escolha', resultado = jsonb_build_object('motivo', 'escolha_fora_das_opcoes') WHERE id = p_id;
    RETURN jsonb_build_object('ok', false, 'motivo', 'escolha_fora_das_opcoes');
  END IF;
  v_quando := v_data + v_hora;
  IF v_quando < v_agora + interval '20 minutes' OR v_quando > v_agora + interval '90 days' OR v_hora < '06:00' OR v_hora > '21:00' THEN
    UPDATE ju_escolhas_horario SET status = 'sem_escolha', resultado = jsonb_build_object('motivo', 'data_invalida') WHERE id = p_id;
    RETURN jsonb_build_object('ok', false, 'motivo', 'data_invalida');
  END IF;

  -- Trava contra a IA inventar: hora e dia têm que aparecer no que a equipe/família escreveu (24 h)
  SELECT string_agg(coalesce(m.conteudo, ''), ' | ') INTO v_equipe FROM ju_mensagens m
   WHERE m.conversa_id = e.conversa_id AND m.origem IN ('HUMANO', 'CLIENTE')
     AND m.created_at BETWEEN v_msg.created_at - interval '24 hours' AND v_msg.created_at;
  v_ref := (v_msg.created_at AT TIME ZONE 'America/Sao_Paulo')::date;
  IF NOT fn_ju_hora_no_texto(v_equipe, v_hora)
     OR NOT (fn_ju_dia_no_texto(v_equipe, v_data, v_ref)
             OR EXISTS (SELECT 1 FROM ju_mensagens m WHERE m.conversa_id = e.conversa_id AND m.origem IN ('HUMANO', 'CLIENTE')
                          AND m.created_at BETWEEN v_msg.created_at - interval '24 hours' AND v_msg.created_at
                          AND fn_ju_dia_no_texto(m.conteudo, v_data, (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date))) THEN
    UPDATE ju_escolhas_horario SET status = 'sem_escolha', resultado = jsonb_build_object('motivo', 'nao_confere_no_texto') WHERE id = p_id;
    RETURN jsonb_build_object('ok', false, 'motivo', 'nao_confere_no_texto');
  END IF;
  v_quando_txt := fn_ju_quando(v_quando);

  -- Criança
  SELECT count(*) INTO v_n FROM jsonb_array_elements(coalesce(fn_ju_contexto_cliente(c.id) -> 'pacientes', '[]'::jsonb)) x
   WHERE (x ->> 'acesso_agenda')::boolean;
  IF v_n = 0 THEN
    IF e.cadastro_pedido_em IS NULL THEN
      v_tok := fn_whatsapp_conexoes_credenciais() ->> 'whatsapp_uazapi_token';
      v_txt := 'Preciso só que você faça o cadastro para eu agendar aqui no sistema: https://app.respirakidsbrasilia.com.br/#/cadastro-paciente';
      IF v_tok IS NOT NULL AND c.wa_chatid IS NOT NULL THEN
        UPDATE ju_conversas SET resposta_pendente = concat_ws(E'\x1f', CASE WHEN resposta_pendente_em > now() - interval '5 minutes' THEN resposta_pendente END, v_txt),
               resposta_pendente_em = now() WHERE id = c.id;
        PERFORM net.http_post(url := 'https://infuse.uazapi.com/send/text',
          body := jsonb_build_object('number', c.wa_chatid, 'text', '*Ju:*' || E'\n' || v_txt),
          headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
          timeout_milliseconds := 20000);
      END IF;
      UPDATE ju_escolhas_horario SET status = 'aguardando_cadastro', cadastro_pedido_em = now() WHERE id = p_id;
    END IF;
    RETURN jsonb_build_object('ok', false, 'motivo', 'aguardando_cadastro');
  END IF;
  IF v_n = 1 THEN
    SELECT (x ->> 'paciente_id')::uuid, x ->> 'nome' INTO v_pac, v_pac_nome
      FROM jsonb_array_elements(fn_ju_contexto_cliente(c.id) -> 'pacientes') x WHERE (x ->> 'acesso_agenda')::boolean;
  ELSE
    SELECT (x ->> 'paciente_id')::uuid, x ->> 'nome' INTO v_pac, v_pac_nome
      FROM jsonb_array_elements(fn_ju_contexto_cliente(c.id) -> 'pacientes') x
     WHERE (x ->> 'acesso_agenda')::boolean AND nullif(btrim(r ->> 'crianca'), '') IS NOT NULL
       AND lower(unaccent(x ->> 'nome')) LIKE lower(unaccent(split_part(btrim(r ->> 'crianca'), ' ', 1))) || '%'
     LIMIT 1;
  END IF;
  IF v_pac IS NULL THEN
    UPDATE ju_escolhas_horario SET status = 'avisado', resultado = jsonb_build_object('motivo', 'qual_crianca') WHERE id = p_id;
    PERFORM fn_ju_escolha_aviso(c.id, 'A família escolheu ' || v_quando_txt || ', mas não consegui saber para qual criança. Confira e marque.');
    RETURN jsonb_build_object('ok', false, 'motivo', 'qual_crianca');
  END IF;

  IF coalesce((r ->> 'domiciliar')::boolean, false) THEN
    UPDATE ju_escolhas_horario SET status = 'avisado', resultado = jsonb_build_object('motivo', 'domiciliar') WHERE id = p_id;
    PERFORM fn_ju_escolha_aviso(c.id, '*' || v_pac_nome || '*: a família escolheu ' || v_quando_txt || ' em domicílio. Atendimento em casa fica com a equipe: confira e marque.');
    RETURN jsonb_build_object('ok', false, 'motivo', 'domiciliar');
  END IF;

  -- Fisio: oferta → conversa → última consulta
  v_fisio := lower(unaccent(coalesce(nullif(btrim(r -> 'escolha' ->> 'fisio'), ''), nullif(btrim(r ->> 'fisio_historico'), ''), '')));
  IF v_fisio = 'bia' THEN v_fisio := 'beatriz'; END IF;
  IF v_fisio = 'flavinha' THEN v_fisio := 'flavia'; END IF;
  IF v_fisio <> '' THEN
    SELECT p.id INTO v_prof FROM pessoas p
     WHERE p.ativo AND lower(unaccent(split_part(btrim(p.nome), ' ', 1))) = split_part(v_fisio, ' ', 1)
       AND EXISTS (SELECT 1 FROM agendamentos a WHERE a.profissional_id = p.id AND a.data_hora > now() - interval '60 days')
     ORDER BY (SELECT count(*) FROM agendamentos a WHERE a.profissional_id = p.id AND a.data_hora > now() - interval '60 days') DESC
     LIMIT 1;
  END IF;
  IF v_prof IS NULL THEN
    SELECT a.profissional_id INTO v_prof FROM agendamentos a JOIN consulta_status cs ON cs.id = a.status_consulta_id
     WHERE a.paciente_id = v_pac AND a.ativo AND cs.codigo NOT IN ('cancelado', 'erro')
     ORDER BY a.data_hora DESC LIMIT 1;
  END IF;
  IF v_prof IS NULL THEN
    UPDATE ju_escolhas_horario SET status = 'avisado', resultado = jsonb_build_object('motivo', 'sem_fisio') WHERE id = p_id;
    PERFORM fn_ju_escolha_aviso(c.id, '*' || v_pac_nome || '*: a família escolheu ' || v_quando_txt || ', mas não deu para saber com qual fisio. Confira e marque.');
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_fisio');
  END IF;
  SELECT split_part(btrim(nome), ' ', 1) INTO v_prof_nome FROM pessoas WHERE id = v_prof;

  -- Serviço: tipo da conversa ou da última consulta; sem consulta desse tipo = serviço novo
  v_tipo := CASE WHEN r ->> 'tipo' IN ('respiratoria', 'motora') THEN r ->> 'tipo' END;
  IF v_tipo IS NULL THEN
    SELECT fn_lista_espera_tipo_servico(a.tipo_servico_id) INTO v_tipo FROM agendamentos a
     WHERE a.paciente_id = v_pac AND a.ativo AND fn_lista_espera_tipo_servico(a.tipo_servico_id) IS NOT NULL
     ORDER BY a.data_hora DESC LIMIT 1;
  END IF;
  IF v_tipo IS NULL THEN
    UPDATE ju_escolhas_horario SET status = 'avisado', resultado = jsonb_build_object('motivo', 'sem_servico') WHERE id = p_id;
    PERFORM fn_ju_escolha_aviso(c.id, '*' || v_pac_nome || '*: a família escolheu ' || v_quando_txt || ' com a ' || v_prof_nome || ', mas não deu para saber se é respiratória ou motora. Confira e marque.');
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_servico');
  END IF;
  SELECT ts.* INTO t FROM agendamentos a JOIN tipo_servicos ts ON ts.id = a.tipo_servico_id
   WHERE a.paciente_id = v_pac AND a.ativo AND fn_lista_espera_tipo_servico(a.tipo_servico_id) = v_tipo
     AND ts.nome !~* 'domic'
   ORDER BY a.data_hora DESC LIMIT 1;
  IF t.id IS NOT NULL THEN
    SELECT coalesce((SELECT t2.id FROM tipo_servicos t2
                      WHERE t2.ativo AND lower(regexp_replace(t2.nome, '\s+', ' ', 'g')) =
                            CASE WHEN t.nome ~* '^avalia.*motora' THEN 'fisioterapia motora - du'
                                 WHEN t.nome ~* '- social$' THEN lower(regexp_replace(regexp_replace(t.nome, '\s+', ' ', 'g'), ' - social$', ' - du', 'i'))
                            END LIMIT 1), t.id) INTO v_serv;
  ELSE
    v_serv := CASE v_tipo WHEN 'motora' THEN '2865a746-ee32-46e1-8581-46232e2bb5c1'::uuid   -- Avaliação Fisioterapêutica Motora
                          ELSE '83e2204a-35f5-4181-ab08-db9da415d54d'::uuid END;            -- Fisioterapia Respiratória - DU
  END IF;
  v_tipo_txt := CASE v_tipo WHEN 'motora' THEN 'motora' ELSE 'respiratória' END;

  -- Marca (mesmo caminho do @ju)
  INSERT INTO ju_comandos (conversa_id, mensagem_id, texto, status)
  VALUES (c.id, e.mensagem_id, 'Escolha de horário da família (oferta da equipe) #' || e.id, 'executando')
  ON CONFLICT (mensagem_id) DO NOTHING;
  res := fn_ju_agendar(c.id, e.mensagem_id, v_pac, v_data, to_char(v_hora, 'HH24:MI'), v_prof, v_serv);
  IF coalesce((res ->> 'ok')::boolean, false) THEN
    UPDATE agendamentos SET observacao = 'Agendado pela Ju: a família confirmou o horário que a equipe ofereceu na conversa.'
     WHERE id = (res ->> 'agendamento_id')::uuid AND res ->> 'codigo' = 'AGENDADO';
    UPDATE ju_escolhas_horario SET status = 'agendado', agendamento_id = (res ->> 'agendamento_id')::uuid, resultado = res WHERE id = p_id;
    IF res ->> 'codigo' = 'AGENDADO' THEN
      PERFORM fn_le_card('✅ *Agendado pela Ju*' || E'\n' || v_quando_txt || ' · ' || v_prof_nome || ' · ' || v_tipo_txt || E'\n\n'
        || '*' || v_pac_nome || '*: a família confirmou o horário que a equipe ofereceu'
        || coalesce(' ("' || left(regexp_replace(nullif(btrim(r ->> 'trecho_escolha'), ''), '\s+', ' ', 'g'), 100) || '")', '')
        || coalesce('. Serviço: ' || (res ->> 'servico'), '') || '.', '{}');
    END IF;
    RETURN jsonb_build_object('ok', true, 'codigo', res ->> 'codigo', 'agendamento_id', res ->> 'agendamento_id');
  END IF;
  UPDATE ju_escolhas_horario SET status = 'avisado', resultado = res WHERE id = p_id;
  PERFORM fn_ju_escolha_aviso(c.id, '*' || v_pac_nome || '*: a família escolheu ' || v_quando_txt || ' com a ' || v_prof_nome
    || CASE res ->> 'codigo' WHEN 'HORARIO_OCUPADO' THEN ', mas o horário já está ocupado.'
                             WHEN 'JA_TEM_CONSULTA_PERTO' THEN ', mas a criança já tem consulta perto desse horário.'
                             ELSE ', mas não consegui marcar (' || coalesce(res ->> 'codigo', 'erro') || ').' END
    || ' Confira com a família.');
  RETURN jsonb_build_object('ok', false, 'motivo', res ->> 'codigo');
END $$;
REVOKE ALL ON FUNCTION public.fn_ju_escolha_aplicar(bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_escolha_aplicar(bigint, jsonb) TO service_role;

-- Tique (1/min): checagens baratas no banco; só chama a IA quando precisa
CREATE OR REPLACE FUNCTION public.fn_ju_escolhas_tick()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE e record; n int := 0; v_tok text;
BEGIN
  -- Esperando cadastro: chegou a criança? marca com a extração guardada. Desiste depois de 48 h.
  FOR e IN SELECT * FROM ju_escolhas_horario WHERE status = 'aguardando_cadastro' LOOP
    IF e.cadastro_pedido_em < now() - interval '48 hours' THEN
      UPDATE ju_escolhas_horario SET status = 'cadastro_nao_feito', atualizado_em = now() WHERE id = e.id;
    ELSIF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(fn_ju_contexto_cliente(e.conversa_id) -> 'pacientes', '[]'::jsonb)) x
                   WHERE (x ->> 'acesso_agenda')::boolean) THEN
      PERFORM fn_ju_escolha_aplicar(e.id, e.extracao);
    END IF;
  END LOOP;

  -- Itens que travaram na edge voltam (até 3 tentativas)
  UPDATE ju_escolhas_horario SET status = CASE WHEN tentativas >= 3 THEN 'erro' ELSE 'pendente' END, atualizado_em = now()
   WHERE status = 'processando' AND atualizado_em < now() - interval '5 minutes';

  SELECT decrypted_secret INTO v_tok FROM vault.decrypted_secrets WHERE name = 'email_boletos_token';
  FOR e IN SELECT * FROM ju_escolhas_horario WHERE status = 'pendente' AND processar_em <= now() ORDER BY processar_em LIMIT 5 LOOP
    -- a equipe respondeu depois da escolha, ou já marcou: nada a fazer
    IF EXISTS (SELECT 1 FROM ju_mensagens h, ju_mensagens m
                WHERE m.id = e.mensagem_id AND h.conversa_id = e.conversa_id AND h.origem = 'HUMANO' AND h.created_at > m.created_at) THEN
      UPDATE ju_escolhas_horario SET status = 'equipe_respondeu', atualizado_em = now() WHERE id = e.id; CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM agendamentos a, ju_mensagens m
                WHERE m.id = e.mensagem_id AND a.ativo AND a.created_at > m.created_at - interval '2 minutes'
                  AND a.paciente_id = ANY (fn_le_pacientes_da_conversa(e.conversa_id))) THEN
      UPDATE ju_escolhas_horario SET status = 'ja_marcado', atualizado_em = now() WHERE id = e.id; CONTINUE;
    END IF;
    IF (SELECT sem_ia FROM ju_conversas WHERE id = e.conversa_id) THEN
      UPDATE ju_escolhas_horario SET status = 'sem_ia', atualizado_em = now() WHERE id = e.id; CONTINUE;
    END IF;
    UPDATE ju_escolhas_horario SET status = 'processando', tentativas = tentativas + 1, atualizado_em = now() WHERE id = e.id;
    PERFORM net.http_post(
      url := 'https://jqegoentcusnbcykgtxg.supabase.co/functions/v1/ju-escolha-horario',
      body := jsonb_build_object('id', e.id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-token', v_tok),
      timeout_milliseconds := 90000);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.fn_ju_escolhas_tick() FROM PUBLIC, anon, authenticated;

-- Cron (1/min)
SELECT cron.schedule('ju-escolhas', '* * * * *', 'SELECT public.fn_ju_escolhas_tick()');
