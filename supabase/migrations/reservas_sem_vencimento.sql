-- 29/10/2026 (decisão do dono): reserva NÃO vence sozinha. Tem família que só faz o cadastro depois da sessão;
-- quem libera ou transforma em consulta é a equipe (botões do card ou o app).
--  * Reservas da agenda (motivo 'reserva'): sem expira_em; cron 'reservas-vencer' desligado.
--  * Reserva da própria Ju (contato novo) passa a ser uma reserva normal da agenda (visível, sem vencer), com o
--    serviço guardado em ju_reserva_agenda. O card ✅ Agendar / ❌ Liberar vai ao grupo e à profissional quando a
--    criança tem cadastro (na hora ou, depois, pelo cron de 5 min). Reserva do @ju sem cadastro: quando o cadastro
--    fica pronto, o cron avisa no grupo que já dá para tocar em Agendar.
--  * Reserva antiga da Ju (ju_reservas pendente) não expira mais quando o horário passa e pode ser confirmada depois.

-- 1) Agenda: sem vencimento
DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_reserva_regras()'::regprocedure); n text;
BEGIN
  IF d NOT LIKE '%NEW.expira_em := v_dia::timestamp AT TIME ZONE ''UTC'';%' THEN RETURN; END IF;
  n := replace(d, $a$NEW.expira_em := v_dia::timestamp AT TIME ZONE 'UTC';$a$, $a$NEW.expira_em := NULL; -- 29/10/2026: reserva não vence sozinha$a$);
  EXECUTE n;
END
$mig$;
UPDATE public.agenda_bloqueios SET expira_em = NULL, updated_at = now()
 WHERE motivo = 'reserva' AND ativo AND deleted_at IS NULL AND expira_em IS NOT NULL;
SELECT cron.unschedule('reservas-vencer') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reservas-vencer');

-- 2) Card: mostra quem reservou
DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_ju_reserva_agenda_avisar(uuid)'::regprocedure); n text;
BEGIN
  IF d LIKE '%Reservado por%' THEN RETURN; END IF;
  n := replace(d, $a$         || E'\n*Fisio:* ' || split_part(btrim(pr.nome), ' ', 1)$a$,
                  $a$         || E'\n*Fisio:* ' || split_part(btrim(pr.nome), ' ', 1)
         || coalesce(E'\n*Reservado por:* ' || nullif(m.solicitante, ''), '')$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_reserva_agenda_avisar: trecho não encontrado'; END IF;
  EXECUTE n;
END
$mig$;

-- 3) Reserva da Ju = reserva da agenda
CREATE OR REPLACE FUNCTION public.fn_ju_reservar_horario(p_conversa_id bigint, p_versao bigint, p_data date, p_hora text,
                                                         p_servico text, p_paciente_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE
  cfg public.ju_reserva_config; c public.ju_conversas; el jsonb; livres jsonb;
  v_serv text; v_ts uuid; v_hora time; v_dh timestamptz; v_pac uuid; v_nome text; v_n int;
  v_ensaio boolean; v_bid uuid; r jsonb; v_quando text; v_rotulo text; erro text; v_atual record;
BEGIN
  SELECT * INTO c FROM public.ju_conversas WHERE id = p_conversa_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'resposta', 'Conversa não encontrada. Chame a secretaria (AGENDAMENTO).'); END IF;
  IF c.sem_ia THEN RETURN jsonb_build_object('ok', false, 'motivo', 'SEM_IA', 'resposta', 'Esta conversa está marcada como SEM IA: nada foi feito. Responda exatamente [NADA].'); END IF;
  IF p_versao IS NOT NULL AND c.message_version > p_versao THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'MENSAGEM_NOVA', 'resposta', 'A família mandou mensagem nova; nada foi reservado. Responda exatamente [NADA].');
  END IF;
  SELECT * INTO cfg FROM public.ju_reserva_config WHERE id = 1;

  -- já existe reserva desta conversa?
  SELECT b.id, b.inicio, b.paciente_id, m.agendamento_id INTO v_atual
    FROM public.ju_reserva_agenda m JOIN public.agenda_bloqueios b ON b.id = m.bloqueio_id
   WHERE m.conversa_id = c.id AND ((b.ativo AND b.deleted_at IS NULL) OR m.agendamento_id IS NOT NULL)
   ORDER BY m.created_at DESC LIMIT 1;
  IF v_atual.id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'motivo', 'JA_TEM_RESERVA',
      'resposta', 'Esta família já tem um horário reservado (' || public.fn_ju_reserva_quando(v_atual.inicio) || ')'
                  || CASE WHEN v_atual.agendamento_id IS NOT NULL THEN ', que já virou consulta.' ELSE '.' END
                  || ' Não reserve outro. Se a família avisou que terminou o cadastro, diga que a equipe confirma em breve e que a confirmação chega por aqui. Se ela quiser trocar o horário, chame a secretaria (REMARCACAO).');
  END IF;
  IF EXISTS (SELECT 1 FROM public.ju_reservas WHERE conversa_id = c.id AND status IN ('pendente', 'confirmada')) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'JA_TEM_RESERVA',
      'resposta', 'Esta família já tem uma reserva. Não faça outra; se quiser trocar, chame a secretaria (REMARCACAO).');
  END IF;

  el := public.fn_ju_reserva_elegivel(p_conversa_id);
  IF NOT (el ->> 'ok')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'motivo', el ->> 'motivo',
      'resposta', 'Não reservei: reserva não disponível nesta conversa. Chame a secretaria (AGENDAMENTO) com o pedido da família.');
  END IF;
  v_serv := CASE WHEN lower(coalesce(p_servico, '')) ~ 'resp' THEN 'respiratoria'
                 WHEN lower(coalesce(p_servico, '')) ~ '(motor|avalia)' THEN 'motora' END;
  IF v_serv IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'resposta', 'Falta o serviço: chame de novo com servico "respiratoria" ou "motora".');
  END IF;
  v_ts := CASE v_serv WHEN 'respiratoria' THEN cfg.servico_respiratoria ELSE cfg.servico_motora END;
  BEGIN v_hora := p_hora::time; EXCEPTION WHEN others THEN v_hora := NULL; END;
  IF p_data IS NULL OR v_hora IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'resposta', 'Falta a data (AAAA-MM-DD) ou a hora (HH:MM) escolhida.');
  END IF;
  livres := public.fn_ju_horarios_livres(p_conversa_id, v_serv, p_data, NULL);
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(livres -> 'dias', '[]'::jsonb)) d, jsonb_array_elements_text(d -> 'horas') h
                  WHERE h = to_char(v_hora, 'HH24:MI')) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'HORARIO_INDISPONIVEL',
      'resposta', 'Esse horário não está mais livre para reserva. ' || coalesce(livres ->> 'resposta', '') || ' Diga à família que esse horário acabou de ser ocupado e ofereça outro.');
  END IF;
  v_dh := (p_data + v_hora) AT TIME ZONE 'UTC';
  v_quando := public.fn_ju_reserva_quando(v_dh);
  v_rotulo := CASE v_serv WHEN 'respiratoria' THEN 'fisioterapia respiratória' ELSE 'avaliação motora' END;

  SELECT count(*) INTO v_n FROM jsonb_array_elements(el -> 'pacientes');
  IF p_paciente_id IS NOT NULL THEN
    SELECT (x ->> 'paciente_id')::uuid, x ->> 'nome' INTO v_pac, v_nome FROM jsonb_array_elements(el -> 'pacientes') x
     WHERE x ->> 'paciente_id' = p_paciente_id::text;
  ELSIF v_n = 1 THEN
    SELECT (x ->> 'paciente_id')::uuid, x ->> 'nome' INTO v_pac, v_nome FROM jsonb_array_elements(el -> 'pacientes') x;
  END IF;
  IF v_pac IS NULL AND v_n > 1 THEN
    RETURN jsonb_build_object('ok', false, 'resposta', 'Há mais de uma criança no cadastro: pergunte para qual é a reserva e chame de novo com o paciente_id dela.');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('ju_reserva:' || cfg.profissional_id::text));
  v_ensaio := coalesce(public.fn_ju_sombra(c.telefone), false) OR coalesce(public.fn_ju_numero_teste(c.telefone), false);
  BEGIN
    INSERT INTO public.agenda_bloqueios (profissional_id, inicio, fim, dia_inteiro, motivo, observacao, paciente_id)
    VALUES (cfg.profissional_id, v_dh, v_dh + interval '1 hour', false, 'reserva',
            coalesce(nullif(btrim(c.nome_whatsapp), ''), 'WhatsApp final ' || right(regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g'), 4)),
            v_pac)
    RETURNING id INTO v_bid;
    INSERT INTO public.ju_reserva_agenda (bloqueio_id, conversa_id, tipo_servico_id, solicitante)
    VALUES (v_bid, c.id, v_ts, 'Ju (WhatsApp)');
    IF v_pac IS NOT NULL THEN
      PERFORM public.fn_ju_reserva_agenda_avisar(v_bid);
      r := jsonb_build_object('ok', true, 'status', 'reservada', 'bloqueio_id', v_bid,
        'resposta', 'Reservado: ' || v_quando || ', ' || v_rotulo || ', para ' || split_part(btrim(v_nome), ' ', 1)
                    || '. Diga à família que o horário está reservado e que a equipe confirma em breve; quando confirmar, a confirmação chega por aqui. '
                    || 'Não diga que está agendado ou confirmado e não chame a secretaria para isso.');
    ELSE
      r := jsonb_build_object('ok', true, 'status', 'reservada_sem_cadastro', 'bloqueio_id', v_bid,
        'resposta', 'Reservado: ' || v_quando || ', ' || v_rotulo || '. Falta o cadastro para a equipe confirmar: '
                    || 'mande agora o link de pré-cadastro (PRE_CADASTRO) e diga que o horário já está reservado e que, com o cadastro pronto, '
                    || 'a equipe confirma e a confirmação chega por aqui. Não diga que está agendado.');
    END IF;
    IF v_ensaio THEN RAISE EXCEPTION 'ENSAIO_RESERVA'; END IF;
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS erro = MESSAGE_TEXT;
    IF erro = 'ENSAIO_RESERVA' THEN
      r := r || jsonb_build_object('ensaio', true);
    ELSE
      r := jsonb_build_object('ok', false, 'motivo', 'ERRO', 'detalhe', left(erro, 200),
        'resposta', 'Não consegui reservar esse horário agora. Diga à família que esse horário acabou de ser ocupado e ofereça outro, ou chame a secretaria (AGENDAMENTO).');
    END IF;
  END;
  RETURN r;
END $f$;

-- 4) Contexto da Ju: reserva atual (reserva da agenda; a antiga ju_reservas como reserva)
CREATE OR REPLACE FUNCTION public.fn_ju_reserva_atual(p_conversa_id bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
  SELECT coalesce(
    (SELECT jsonb_build_object(
              'status', CASE WHEN m.agendamento_id IS NOT NULL THEN 'virou_consulta'
                             WHEN NOT b.ativo OR b.deleted_at IS NOT NULL THEN 'liberada'
                             WHEN b.paciente_id IS NULL THEN 'reservada_sem_cadastro' ELSE 'reservada' END,
              'quando', public.fn_ju_reserva_quando(b.inicio),
              'data', to_char(b.inicio AT TIME ZONE 'UTC', 'YYYY-MM-DD'), 'hora', to_char(b.inicio AT TIME ZONE 'UTC', 'HH24:MI'))
       FROM public.ju_reserva_agenda m JOIN public.agenda_bloqueios b ON b.id = m.bloqueio_id
      WHERE m.conversa_id = p_conversa_id ORDER BY m.created_at DESC LIMIT 1),
    (SELECT jsonb_build_object('status', r.status, 'quando', public.fn_ju_reserva_quando(r.data_hora),
                               'data', to_char(r.data_hora AT TIME ZONE 'UTC', 'YYYY-MM-DD'), 'hora', to_char(r.data_hora AT TIME ZONE 'UTC', 'HH24:MI'))
       FROM public.ju_reservas r WHERE r.conversa_id = p_conversa_id AND r.status <> 'cancelada'
      ORDER BY r.created_at DESC LIMIT 1));
$f$;

-- 5) Reserva antiga da Ju (ju_reservas): confirma mesmo depois do horário
DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_ju_reserva_decidir(bigint, boolean, text)'::regprocedure); n text;
BEGIN
  IF d NOT LIKE '%IF r.data_hora <= (now() AT TIME ZONE ''America/Sao_Paulo'') AT TIME ZONE ''UTC''%' THEN RETURN; END IF;
  n := replace(d, $a$  IF r.data_hora <= (now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC'
     OR NOT public.fn_ju_reserva_slot_livre(r.profissional_id, r.data_hora, 60, r.conversa_id) THEN$a$,
                  $a$  IF NOT public.fn_ju_reserva_slot_livre(r.profissional_id, r.data_hora, 60, r.conversa_id) THEN$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_reserva_decidir: trecho não encontrado'; END IF;
  EXECUTE n;
END
$mig$;

-- 6) Cron de 5 min: nada vence; cadastro pronto → card (reserva da Ju) ou aviso no grupo (reserva do @ju)
CREATE OR REPLACE FUNCTION public.fn_ju_reservas_tick()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE x record; ctx jsonb; v_n int; v_pac uuid; v_cards int := 0; v_avisos int := 0; v_tok text; v_msg text; v_nome text;
BEGIN
  FOR x IN SELECT m.*, b.inicio FROM public.ju_reserva_agenda m JOIN public.agenda_bloqueios b ON b.id = m.bloqueio_id
            WHERE b.ativo AND b.deleted_at IS NULL AND b.paciente_id IS NULL AND m.conversa_id IS NOT NULL AND m.agendamento_id IS NULL
            FOR UPDATE OF b SKIP LOCKED LOOP
    ctx := public.fn_ju_contexto_cliente(x.conversa_id);
    SELECT count(*), min(y ->> 'paciente_id')::uuid INTO v_n, v_pac
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(ctx -> 'pacientes') = 'array' THEN ctx -> 'pacientes' ELSE '[]'::jsonb END) y
     WHERE coalesce((y ->> 'acesso_agenda')::boolean, false);
    CONTINUE WHEN v_n <> 1;
    UPDATE public.agenda_bloqueios SET paciente_id = v_pac, updated_at = now() WHERE id = x.bloqueio_id;
    IF x.grupo_req_id IS NULL THEN
      PERFORM public.fn_ju_reserva_agenda_avisar(x.bloqueio_id);
      v_cards := v_cards + 1;
    ELSE
      v_tok := public.fn_whatsapp_conexoes_credenciais() ->> 'whatsapp_uazapi_token';
      v_msg := (SELECT nullif(coalesce(h.content::jsonb ->> 'messageid', h.content::jsonb ->> 'id'), '') FROM net._http_response h WHERE h.id = x.grupo_req_id);
      SELECT split_part(btrim(nome), ' ', 1) INTO v_nome FROM public.pessoas WHERE id = v_pac;
      IF v_tok IS NOT NULL THEN
        PERFORM net.http_post(url := 'https://infuse.uazapi.com/send/text',
          body := jsonb_build_object('number', '120363433073436578@g.us',
                                     'text', '📝 Cadastro pronto: ' || coalesce(v_nome, 'criança') || ' (reserva de ' || public.fn_ju_reserva_quando(x.inicio)
                                             || '). Já dá para tocar em ✅ Agendar.')
                  || CASE WHEN v_msg IS NOT NULL THEN jsonb_build_object('replyid', v_msg) ELSE '{}'::jsonb END,
          headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
          timeout_milliseconds := 20000);
      END IF;
      v_avisos := v_avisos + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('cards', v_cards, 'avisos_cadastro', v_avisos);
END $f$;

DO $grant$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['fn_ju_reservar_horario(bigint, bigint, date, text, text, uuid)', 'fn_ju_reserva_atual(bigint)', 'fn_ju_reservas_tick()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $grant$;
