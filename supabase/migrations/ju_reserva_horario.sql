-- 29/10/2026 (pedido do dono): a Ju passa a RESERVAR horário na agenda da Beatriz para contato novo
-- (família sem cadastro anterior). Regras no servidor, não só no prompt:
--   * só a profissional configurada (Beatriz Perissê); só dias úteis; serviço respiratória ou avaliação motora (na clínica);
--   * hoje: só à tarde (a partir de 13h), com 2 h de antecedência, último início às 17h;
--   * outros dias: das 8h às 17h (início), em hora cheia;
--   * livre = sem consulta, sem bloqueio e sem outra reserva ativa;
--   * reserva precisa de cadastro: sem cadastro o horário fica separado por algumas horas (aguardando_cadastro);
--   * com cadastro vira "pendente" e vai para o grupo 🔔 com ✅ Confirmar / ❌ Recusar;
--   * ao confirmar, a consulta é criada e a família recebe a mensagem normal de "Consulta Agendada".

CREATE TABLE IF NOT EXISTS public.ju_reserva_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ativo boolean NOT NULL DEFAULT true,
  profissional_id uuid NOT NULL,
  hora_primeira time NOT NULL DEFAULT '08:00',
  hora_ultima time NOT NULL DEFAULT '17:00',
  hora_primeira_hoje time NOT NULL DEFAULT '13:00',
  antecedencia_min int NOT NULL DEFAULT 120,
  horizonte_dias int NOT NULL DEFAULT 14,
  espera_cadastro_horas int NOT NULL DEFAULT 6,
  servico_respiratoria uuid NOT NULL,
  servico_motora uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ju_reserva_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ju_reserva_config FROM anon, authenticated;
INSERT INTO public.ju_reserva_config (id, profissional_id, servico_respiratoria, servico_motora)
VALUES (1, 'b3e954bf-02dd-4821-aa58-aa4fb34c3e02',   -- Beatriz Perissê
           '83e2204a-35f5-4181-ab08-db9da415d54d',   -- Fisioterapia Respiratória - DU
           '2865a746-ee32-46e1-8581-46232e2bb5c1')   -- Avaliação Fisioterapêutica Motora
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ju_reservas (
  id bigserial PRIMARY KEY,
  conversa_id bigint NOT NULL REFERENCES public.ju_conversas(id),
  paciente_id uuid REFERENCES public.pessoas(id),
  profissional_id uuid NOT NULL REFERENCES public.pessoas(id),
  tipo_servico_id uuid NOT NULL REFERENCES public.tipo_servicos(id),
  servico text NOT NULL CHECK (servico IN ('respiratoria', 'motora')),
  data_hora timestamptz NOT NULL,           -- hora de parede gravada como UTC (mesma convenção de agendamentos)
  status text NOT NULL CHECK (status IN ('aguardando_cadastro', 'pendente', 'confirmada', 'recusada', 'expirada', 'cancelada')),
  expira_em timestamptz,
  grupo_req_id bigint,
  grupo_msg_id text,
  agendamento_id uuid REFERENCES public.agendamentos(id),
  decidida_por text,
  decidida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ju_reservas_ativas_idx ON public.ju_reservas (profissional_id, data_hora)
  WHERE status IN ('aguardando_cadastro', 'pendente');
CREATE INDEX IF NOT EXISTS ju_reservas_conversa_idx ON public.ju_reservas (conversa_id, created_at DESC);
ALTER TABLE public.ju_reservas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ju_reservas FROM anon, authenticated;

-- Horário livre para a profissional (hora de parede como UTC).
CREATE OR REPLACE FUNCTION public.fn_ju_reserva_slot_livre(p_prof uuid, p_inicio timestamptz, p_min int, p_ignorar_conversa bigint DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
  SELECT NOT EXISTS (
           SELECT 1 FROM public.agendamentos a
             JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
             LEFT JOIN public.tipo_servicos ts ON ts.id = a.tipo_servico_id
            WHERE a.profissional_id = p_prof AND a.ativo AND cs.codigo NOT IN ('cancelado', 'erro')
              AND a.data_hora < p_inicio + make_interval(mins => p_min)
              AND a.data_hora + make_interval(mins => coalesce(nullif(ts.duracao_minutos, 0), 60)) > p_inicio)
     AND NOT EXISTS (
           SELECT 1 FROM public.agenda_bloqueios b
            WHERE b.ativo AND b.deleted_at IS NULL AND b.impede_agendamento
              AND (b.profissional_id IS NULL OR b.profissional_id = p_prof)
              AND b.periodo && tstzrange(p_inicio, p_inicio + make_interval(mins => p_min)))
     AND NOT EXISTS (
           SELECT 1 FROM public.ju_reservas r
            WHERE r.profissional_id = p_prof
              AND r.conversa_id IS DISTINCT FROM p_ignorar_conversa
              AND (r.status = 'pendente' OR (r.status = 'aguardando_cadastro' AND r.expira_em > now()))
              AND r.data_hora < p_inicio + make_interval(mins => p_min)
              AND r.data_hora + interval '60 minutes' > p_inicio);
$f$;

-- Quem pode reservar: família sem consulta anterior e sem cadastro antigo, sem a Lolô na conversa.
CREATE OR REPLACE FUNCTION public.fn_ju_reserva_elegivel(p_conversa_id bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE
  cfg public.ju_reserva_config; c public.ju_conversas; ctx jsonb; pac jsonb;
BEGIN
  SELECT * INTO cfg FROM public.ju_reserva_config WHERE id = 1;
  IF NOT FOUND OR NOT cfg.ativo THEN RETURN jsonb_build_object('ok', false, 'motivo', 'DESLIGADO'); END IF;
  SELECT * INTO c FROM public.ju_conversas WHERE id = p_conversa_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'CONVERSA_INEXISTENTE'); END IF;
  IF c.sem_ia THEN RETURN jsonb_build_object('ok', false, 'motivo', 'SEM_IA'); END IF;
  IF public.fn_ju_equipe_por_telefone(c.telefone) IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'EQUIPE'); END IF;
  IF EXISTS (SELECT 1 FROM public.ju_mensagens h WHERE h.conversa_id = c.id AND h.origem = 'HUMANO'
                AND h.created_at > now() - interval '12 hours') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'LOLO_NA_CONVERSA');
  END IF;
  ctx := public.fn_ju_contexto_cliente(c.id);
  pac := CASE WHEN jsonb_typeof(ctx -> 'pacientes') = 'array' THEN ctx -> 'pacientes' ELSE '[]'::jsonb END;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(pac) x
               JOIN public.agendamentos a ON a.paciente_id = (x ->> 'paciente_id')::uuid AND a.ativo
               JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
              WHERE cs.codigo NOT IN ('cancelado', 'erro')) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'JA_E_PACIENTE');
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(pac) x JOIN public.pessoas p ON p.id = (x ->> 'paciente_id')::uuid
              WHERE p.created_at < now() - interval '14 days') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'CADASTRO_ANTIGO');
  END IF;
  RETURN jsonb_build_object('ok', true,
    'pacientes', coalesce((SELECT jsonb_agg(jsonb_build_object('paciente_id', x ->> 'paciente_id', 'nome', x ->> 'nome'))
                             FROM jsonb_array_elements(pac) x WHERE coalesce((x ->> 'acesso_agenda')::boolean, false)), '[]'::jsonb));
END $f$;

CREATE OR REPLACE FUNCTION public.fn_ju_reserva_rotulo_dia(p_dia date)
RETURNS text LANGUAGE sql STABLE SET search_path TO '' AS $f$
  SELECT CASE WHEN p_dia = (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'hoje ('
              WHEN p_dia = (now() AT TIME ZONE 'America/Sao_Paulo')::date + 1 THEN 'amanhã ('
              ELSE '(' END
         || (ARRAY['domingo','segunda','terça','quarta','quinta','sexta','sábado'])[extract(dow FROM p_dia)::int + 1]
         || ', ' || to_char(p_dia, 'DD/MM') || ')';
$f$;

-- Horários livres, já com as regras. p_servico só valida; p_data restringe a um dia; p_periodo: manha | tarde.
CREATE OR REPLACE FUNCTION public.fn_ju_horarios_livres(p_conversa_id bigint, p_servico text DEFAULT NULL,
                                                        p_data date DEFAULT NULL, p_periodo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE
  cfg public.ju_reserva_config; el jsonb;
  v_agora timestamp := now() AT TIME ZONE 'America/Sao_Paulo';
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_dia date; v_h time; v_ini time; v_slot timestamp; v_horas text[]; v_dias jsonb := '[]'::jsonb;
  v_per text := lower(coalesce(p_periodo, '')); v_max int; v_txt text := ''; v_faixa text; i int; j int;
BEGIN
  el := public.fn_ju_reserva_elegivel(p_conversa_id);
  IF NOT (el ->> 'ok')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'motivo', el ->> 'motivo',
      'resposta', 'Reserva não disponível nesta conversa (' || (el ->> 'motivo') || '). Não ofereça horários: siga o fluxo normal e chame a secretaria (AGENDAMENTO).');
  END IF;
  SELECT * INTO cfg FROM public.ju_reserva_config WHERE id = 1;
  IF p_data IS NOT NULL AND (p_data < v_hoje OR p_data > v_hoje + cfg.horizonte_dias) THEN
    RETURN jsonb_build_object('ok', true, 'dias', '[]'::jsonb,
      'resposta', 'Esse dia está fora do período em que dá para reservar (até ' || to_char(v_hoje + cfg.horizonte_dias, 'DD/MM') || '). Chame a secretaria (AGENDAMENTO) com o dia que a família quer.');
  END IF;
  IF p_data IS NOT NULL AND (extract(isodow FROM p_data) IN (6, 7) OR EXISTS (SELECT 1 FROM public.followup_feriados WHERE dia = p_data)) THEN
    RETURN jsonb_build_object('ok', true, 'dias', '[]'::jsonb,
      'resposta', 'Não há reserva em sábado, domingo ou feriado. Se a família precisa desse dia, chame a secretaria (AGENDAMENTO); senão, ofereça um dia útil.');
  END IF;
  v_max := CASE WHEN p_data IS NOT NULL THEN 1 ELSE 3 END;
  FOR v_dia IN SELECT d::date FROM generate_series(coalesce(p_data, v_hoje), coalesce(p_data, v_hoje + cfg.horizonte_dias), interval '1 day') d LOOP
    EXIT WHEN jsonb_array_length(v_dias) >= v_max;
    CONTINUE WHEN extract(isodow FROM v_dia) IN (6, 7) OR EXISTS (SELECT 1 FROM public.followup_feriados WHERE dia = v_dia);
    v_horas := ARRAY[]::text[];
    v_ini := CASE WHEN v_dia = v_hoje THEN greatest(cfg.hora_primeira, cfg.hora_primeira_hoje) ELSE cfg.hora_primeira END;
    v_h := v_ini;
    WHILE v_h <= cfg.hora_ultima LOOP
      v_slot := v_dia + v_h;
      IF v_slot >= v_agora + make_interval(mins => cfg.antecedencia_min)
         AND (v_per NOT IN ('manha', 'manhã') OR v_h < time '12:00')
         AND (v_per <> 'tarde' OR v_h >= time '12:00')
         AND public.fn_ju_reserva_slot_livre(cfg.profissional_id, v_slot AT TIME ZONE 'UTC', 60, p_conversa_id) THEN
        v_horas := v_horas || to_char(v_h, 'HH24:MI');
      END IF;
      v_h := v_h + interval '1 hour';
      EXIT WHEN v_h < v_ini; -- volta da meia-noite
    END LOOP;
    IF array_length(v_horas, 1) > 0 THEN
      -- junta horas seguidas em faixas: 14h, 15h, 16h, 17h -> "das 14h às 17h"
      v_faixa := ''; i := 1;
      WHILE i <= array_length(v_horas, 1) LOOP
        j := i;
        WHILE j < array_length(v_horas, 1) AND (v_horas[j + 1]::time - v_horas[j]::time) = interval '1 hour' LOOP j := j + 1; END LOOP;
        v_faixa := v_faixa || CASE WHEN v_faixa = '' THEN '' ELSE ', ' END
                   || CASE WHEN j - i >= 2 THEN 'das ' || ltrim(split_part(v_horas[i], ':', 1), '0') || 'h às ' || ltrim(split_part(v_horas[j], ':', 1), '0') || 'h'
                           WHEN j - i = 1 THEN ltrim(split_part(v_horas[i], ':', 1), '0') || 'h e ' || ltrim(split_part(v_horas[j], ':', 1), '0') || 'h'
                           ELSE ltrim(split_part(v_horas[i], ':', 1), '0') || 'h' END;
        i := j + 1;
      END LOOP;
      v_dias := v_dias || jsonb_build_object('data', to_char(v_dia, 'YYYY-MM-DD'), 'rotulo', public.fn_ju_reserva_rotulo_dia(v_dia),
                                             'horas', to_jsonb(v_horas), 'faixas', v_faixa);
      v_txt := v_txt || CASE WHEN v_txt = '' THEN '' ELSE '; ' END || public.fn_ju_reserva_rotulo_dia(v_dia) || ' [' || to_char(v_dia, 'YYYY-MM-DD') || ']: ' || v_faixa;
    END IF;
  END LOOP;
  IF jsonb_array_length(v_dias) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'dias', v_dias,
      'resposta', 'Não há horário livre para reserva ' || CASE WHEN p_data IS NOT NULL THEN 'nesse dia' ELSE 'nos próximos dias' END
                  || CASE WHEN v_per <> '' THEN ' nesse período' ELSE '' END
                  || '. Se a família quiser, consulte outro dia ou período; se nada servir, chame a secretaria (AGENDAMENTO).');
  END IF;
  RETURN jsonb_build_object('ok', true, 'dias', v_dias,
    'resposta', 'Horários livres para reserva (hora cheia; cada faixa inclui todas as horas dentro dela): ' || v_txt
                || '. Ofereça poucas opções, de forma natural (ex.: "pra hoje ainda tem às 16h; amanhã pode ser das 14h às 17h"). '
                || 'Para reservar, use reservar_horario com a data entre colchetes (AAAA-MM-DD) e a hora escolhida (HH:MM).');
END $f$;

CREATE OR REPLACE FUNCTION public.fn_ju_reserva_quando(p_dh timestamptz)
RETURNS text LANGUAGE sql STABLE SET search_path TO '' AS $f$
  SELECT (ARRAY['domingo','segunda','terça','quarta','quinta','sexta','sábado'])[extract(dow FROM p_dh AT TIME ZONE 'UTC')::int + 1]
         || ', ' || to_char(p_dh AT TIME ZONE 'UTC', 'DD/MM') || ', às '
         || regexp_replace(to_char(p_dh AT TIME ZONE 'UTC', 'FMHH24"h"MI'), 'h00$', 'h');
$f$;

-- Manda o card da reserva para o grupo 🔔 (pg_net; a resposta com o id da mensagem fica em net._http_response).
CREATE OR REPLACE FUNCTION public.fn_ju_reserva_avisar_grupo(p_id bigint)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE r public.ju_reservas; v_txt text; v_req bigint; v_tok text;
BEGIN
  SELECT * INTO r FROM public.ju_reservas WHERE id = p_id;
  IF NOT FOUND OR r.status <> 'pendente' THEN RETURN NULL; END IF;
  SELECT '📅 *Reserva de horário (Ju)*'
         || E'\n*Criança:* ' || btrim(p.nome)
         || coalesce(' (' || CASE WHEN p.data_nascimento > current_date - interval '24 months'
                                  THEN (extract(year FROM age(current_date, p.data_nascimento)) * 12 + extract(month FROM age(current_date, p.data_nascimento)))::int || ' meses'
                                  ELSE extract(year FROM age(current_date, p.data_nascimento))::int || ' anos' END || ')', '')
         || E'\n*Serviço:* ' || regexp_replace(btrim(ts.nome), '\s+', ' ', 'g')
         || E'\n*Quando:* ' || public.fn_ju_reserva_quando(r.data_hora)
         || E'\n*Fisio:* ' || split_part(btrim(pr.nome), ' ', 1)
         || E'\n*Contato:* ' || coalesce(nullif(c.nome_whatsapp, '') || ' · ', '')
         || coalesce(regexp_replace(c.telefone, '^\+55(\d{2})(\d{4,5})(\d{4})$', '(\1) \2-\3'), c.wa_chatid)
         || E'\n\nConfira a agenda. Ao confirmar, a consulta é criada e a família recebe a confirmação.'
    INTO v_txt
    FROM public.pessoas p, public.tipo_servicos ts, public.pessoas pr, public.ju_conversas c
   WHERE p.id = r.paciente_id AND ts.id = r.tipo_servico_id AND pr.id = r.profissional_id AND c.id = r.conversa_id;
  v_tok := public.fn_whatsapp_conexoes_credenciais() ->> 'whatsapp_uazapi_token';
  IF v_txt IS NULL OR v_tok IS NULL THEN RETURN NULL; END IF;
  v_req := net.http_post(
    url := 'https://infuse.uazapi.com/send/menu',
    body := jsonb_build_object('number', '120363433073436578@g.us', 'type', 'button', 'text', v_txt,
                               'choices', jsonb_build_array('✅ Confirmar|ju_res_ok:' || r.id, '❌ Recusar|ju_res_nao:' || r.id)),
    headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
    timeout_milliseconds := 20000);
  UPDATE public.ju_reservas SET grupo_req_id = v_req, updated_at = now() WHERE id = r.id;
  RETURN v_req;
END $f$;

-- Ferramenta reservar_horario da Ju.
CREATE OR REPLACE FUNCTION public.fn_ju_reservar_horario(p_conversa_id bigint, p_versao bigint, p_data date, p_hora text,
                                                         p_servico text, p_paciente_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE
  cfg public.ju_reserva_config; c public.ju_conversas; el jsonb; livres jsonb; atual public.ju_reservas;
  v_serv text; v_ts uuid; v_hora time; v_dh timestamptz; v_pac uuid; v_nome text; v_n int;
  v_ensaio boolean; v_id bigint; r jsonb; v_quando text; v_rotulo text; erro text;
BEGIN
  SELECT * INTO c FROM public.ju_conversas WHERE id = p_conversa_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'resposta', 'Conversa não encontrada. Chame a secretaria (AGENDAMENTO).'); END IF;
  IF c.sem_ia THEN RETURN jsonb_build_object('ok', false, 'motivo', 'SEM_IA', 'resposta', 'Esta conversa está marcada como SEM IA: nada foi feito. Responda exatamente [NADA].'); END IF;
  IF p_versao IS NOT NULL AND c.message_version > p_versao THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'MENSAGEM_NOVA', 'resposta', 'A família mandou mensagem nova; nada foi reservado. Responda exatamente [NADA].');
  END IF;
  el := public.fn_ju_reserva_elegivel(p_conversa_id);
  IF NOT (el ->> 'ok')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'motivo', el ->> 'motivo',
      'resposta', 'Não reservei: reserva não disponível nesta conversa. Chame a secretaria (AGENDAMENTO) com o pedido da família.');
  END IF;
  SELECT * INTO cfg FROM public.ju_reserva_config WHERE id = 1;
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

  -- criança: a indicada; senão a única do cadastro; sem cadastro = segura o horário
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
  SELECT * INTO atual FROM public.ju_reservas WHERE conversa_id = c.id AND status IN ('pendente', 'confirmada')
   ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'JA_TEM_RESERVA',
      'resposta', 'Esta família já tem uma reserva (' || public.fn_ju_reserva_quando(atual.data_hora) || ', ' || atual.status
                  || '). Só uma reserva por conversa: não faça outra. Se a família quiser trocar, chame a secretaria (REMARCACAO).');
  END IF;

  v_ensaio := coalesce(public.fn_ju_sombra(c.telefone), false) OR coalesce(public.fn_ju_numero_teste(c.telefone), false);
  BEGIN
    UPDATE public.ju_reservas SET status = 'cancelada', updated_at = now()
     WHERE conversa_id = c.id AND status = 'aguardando_cadastro';
    INSERT INTO public.ju_reservas (conversa_id, paciente_id, profissional_id, tipo_servico_id, servico, data_hora, status, expira_em)
    VALUES (c.id, v_pac, cfg.profissional_id, v_ts, v_serv, v_dh,
            CASE WHEN v_pac IS NULL THEN 'aguardando_cadastro' ELSE 'pendente' END,
            CASE WHEN v_pac IS NULL THEN least(now() + make_interval(hours => cfg.espera_cadastro_horas),
                                               ((p_data + v_hora) AT TIME ZONE 'America/Sao_Paulo') - interval '1 hour') END)
    RETURNING id INTO v_id;
    IF v_pac IS NOT NULL THEN
      PERFORM public.fn_ju_reserva_avisar_grupo(v_id);
      r := jsonb_build_object('ok', true, 'status', 'pendente', 'reserva_id', v_id,
        'resposta', 'Reserva registrada: ' || v_quando || ', ' || v_rotulo || ', para ' || split_part(btrim(v_nome), ' ', 1)
                    || '. Diga à família que o horário está reservado e que a equipe confirma em breve; assim que confirmar, ela recebe a confirmação por aqui. '
                    || 'Não diga que está agendado ou confirmado e não chame a secretaria para isso.');
    ELSE
      r := jsonb_build_object('ok', true, 'status', 'aguardando_cadastro', 'reserva_id', v_id,
        'resposta', 'Horário separado por algumas horas: ' || v_quando || ', ' || v_rotulo || '. Para virar reserva, falta o cadastro: '
                    || 'mande agora o link de pré-cadastro (PRE_CADASTRO) e diga que, assim que o cadastro estiver feito, o horário fica reservado '
                    || 'e a equipe confirma em breve, com a confirmação chegando por aqui. Não diga que está agendado.');
    END IF;
    IF v_ensaio THEN RAISE EXCEPTION 'ENSAIO_RESERVA'; END IF;
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS erro = MESSAGE_TEXT;
    IF erro = 'ENSAIO_RESERVA' THEN
      r := r || jsonb_build_object('ensaio', true);
    ELSE
      r := jsonb_build_object('ok', false, 'motivo', 'ERRO', 'detalhe', left(erro, 200),
        'resposta', 'Não consegui reservar agora. Chame a secretaria (AGENDAMENTO) com o horário que a família escolheu.');
    END IF;
  END;
  RETURN r;
END $f$;

-- Resumo para o turno da Ju.
CREATE OR REPLACE FUNCTION public.fn_ju_reserva_atual(p_conversa_id bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
  SELECT jsonb_build_object('status', CASE WHEN r.status = 'aguardando_cadastro' AND r.expira_em <= now() THEN 'expirada' ELSE r.status END,
                            'quando', public.fn_ju_reserva_quando(r.data_hora),
                            'data', to_char(r.data_hora AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
                            'hora', to_char(r.data_hora AT TIME ZONE 'UTC', 'HH24:MI'),
                            'servico', r.servico)
    FROM public.ju_reservas r
   WHERE r.conversa_id = p_conversa_id AND r.status <> 'cancelada'
   ORDER BY r.created_at DESC LIMIT 1;
$f$;

-- Botões do grupo: ✅ Confirmar / ❌ Recusar.
CREATE OR REPLACE FUNCTION public.fn_ju_reserva_decidir(p_id bigint, p_aceitar boolean, p_quem text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE r public.ju_reservas; v_msg text; v_quem text := coalesce(nullif(btrim(p_quem), ''), 'alguém');
        ts public.tipo_servicos; v_valor numeric; v_id uuid; v_local uuid;
BEGIN
  SELECT * INTO r FROM public.ju_reservas WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'texto', 'Reserva não encontrada.'); END IF;
  v_msg := coalesce(r.grupo_msg_id,
                    (SELECT nullif(coalesce(h.content::jsonb ->> 'messageid', h.content::jsonb ->> 'id'), '')
                       FROM net._http_response h WHERE h.id = r.grupo_req_id));
  IF v_msg IS NOT NULL AND r.grupo_msg_id IS NULL THEN UPDATE public.ju_reservas SET grupo_msg_id = v_msg WHERE id = r.id; END IF;
  IF r.status <> 'pendente' THEN
    RETURN jsonb_build_object('ok', false, 'status', r.status, 'msg_id', v_msg,
      'texto', 'Essa reserva já estava ' || r.status || coalesce(' (' || r.decidida_por || ')', '') || '.');
  END IF;
  IF NOT p_aceitar THEN
    UPDATE public.ju_reservas SET status = 'recusada', decidida_por = v_quem, decidida_em = now(), updated_at = now() WHERE id = r.id;
    RETURN jsonb_build_object('ok', true, 'aceita', false, 'msg_id', v_msg,
      'texto', '❌ Reserva recusada por ' || v_quem || '. Falta combinar outro horário com a família.');
  END IF;
  IF r.data_hora <= (now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC'
     OR NOT public.fn_ju_reserva_slot_livre(r.profissional_id, r.data_hora, 60, r.conversa_id) THEN
    UPDATE public.ju_reservas SET status = 'recusada', decidida_por = 'sistema (horário ocupado)', decidida_em = now(), updated_at = now() WHERE id = r.id;
    RETURN jsonb_build_object('ok', false, 'aceita', false, 'status', 'recusada', 'msg_id', v_msg,
      'texto', '⚠️ Não deu para confirmar: o horário já passou ou foi ocupado na agenda. Falta combinar outro horário com a família.');
  END IF;
  SELECT * INTO ts FROM public.tipo_servicos WHERE id = r.tipo_servico_id;
  v_valor := coalesce(public.fn_valor_servico(r.tipo_servico_id, r.profissional_id, r.paciente_id), ts.valor);
  v_local := (SELECT id FROM public.locais_atendimento WHERE ativo AND nome = 'Sala 3' LIMIT 1);
  INSERT INTO public.agendamentos (data_hora, paciente_id, profissional_id, tipo_servico_id, local_id,
                                   status_consulta_id, status_pagamento_id, valor_servico, agendado_por,
                                   empresa_fatura, observacao, ativo)
  VALUES (r.data_hora, r.paciente_id, r.profissional_id, r.tipo_servico_id, v_local,
          (SELECT id FROM public.consulta_status WHERE codigo = 'agendado'),
          (SELECT id FROM public.pagamento_status WHERE codigo = 'pendente'),
          v_valor, 'df8ed2ab-867d-47b3-97a2-b05891fae798', 'e02b9107-894f-4578-989f-4e8663f2dcca',
          'Reserva feita pela Ju no WhatsApp e confirmada por ' || v_quem || '.', true)
  RETURNING id INTO v_id;
  UPDATE public.ju_reservas SET status = 'confirmada', agendamento_id = v_id, decidida_por = v_quem, decidida_em = now(), updated_at = now()
   WHERE id = r.id;
  RETURN jsonb_build_object('ok', true, 'aceita', true, 'msg_id', v_msg, 'agendamento_id', v_id,
    'texto', '✅ Confirmada por ' || v_quem || '. A consulta foi criada e a família recebe a confirmação.');
END $f$;

-- A cada 5 min: horário separado vira reserva quando o cadastro aparece; separado vencido expira;
-- reserva pendente cujo horário passou expira.
CREATE OR REPLACE FUNCTION public.fn_ju_reservas_tick()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE r public.ju_reservas; el jsonb; v_prom int := 0; v_exp int;
BEGIN
  UPDATE public.ju_reservas SET status = 'expirada', updated_at = now()
   WHERE (status = 'aguardando_cadastro' AND expira_em <= now())
      OR (status = 'pendente' AND data_hora <= (now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC');
  GET DIAGNOSTICS v_exp = ROW_COUNT;
  FOR r IN SELECT * FROM public.ju_reservas WHERE status = 'aguardando_cadastro' AND expira_em > now() FOR UPDATE SKIP LOCKED LOOP
    el := public.fn_ju_reserva_elegivel(r.conversa_id);
    IF (el ->> 'ok')::boolean AND jsonb_array_length(el -> 'pacientes') = 1 THEN
      UPDATE public.ju_reservas SET paciente_id = (el -> 'pacientes' -> 0 ->> 'paciente_id')::uuid, status = 'pendente',
             expira_em = NULL, updated_at = now() WHERE id = r.id;
      PERFORM public.fn_ju_reserva_avisar_grupo(r.id);
      v_prom := v_prom + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('promovidas', v_prom, 'expiradas', v_exp);
END $f$;

DO $grant$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'fn_ju_reserva_slot_livre(uuid, timestamptz, int, bigint)', 'fn_ju_reserva_elegivel(bigint)',
    'fn_ju_horarios_livres(bigint, text, date, text)', 'fn_ju_reserva_avisar_grupo(bigint)',
    'fn_ju_reservar_horario(bigint, bigint, date, text, text, uuid)', 'fn_ju_reserva_atual(bigint)',
    'fn_ju_reserva_decidir(bigint, boolean, text)', 'fn_ju_reservas_tick()',
    'fn_ju_reserva_quando(timestamptz)', 'fn_ju_reserva_rotulo_dia(date)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $grant$;

SELECT cron.schedule('ju-reservas-tick', '*/5 * * * *', 'SELECT public.fn_ju_reservas_tick()');

-- O turno da Ju passa a saber se pode reservar e se já há reserva.
DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_ju_turno'::regproc); n text;
BEGIN
  IF d LIKE '%pode_reservar%' THEN RETURN; END IF;
  n := replace(d, $a$'pre_atendimento', public.fn_ju_pre_atendimento(c.id),$a$,
                  $a$'pre_atendimento', public.fn_ju_pre_atendimento(c.id),
      'pode_reservar', coalesce((public.fn_ju_reserva_elegivel(c.id) ->> 'ok')::boolean, false),
      'reserva_horario', public.fn_ju_reserva_atual(c.id),$a$);
  IF n NOT LIKE '%pode_reservar%' THEN RAISE EXCEPTION 'fn_ju_turno: trecho não encontrado'; END IF;
  EXECUTE n;
END
$mig$;

-- Ajustes aplicados depois do teste (migrations ju_reserva_folga_domiciliar e ju_reserva_decidir_search_path):
-- 1) atendimento domiciliar ocupa também 30 min antes e depois (deslocamento);
-- 2) os gatilhos de agendamentos usam nomes sem schema: fn_ju_reserva_decidir precisa de search_path com public.
CREATE OR REPLACE FUNCTION public.fn_ju_reserva_slot_livre(p_prof uuid, p_inicio timestamptz, p_min int, p_ignorar_conversa bigint DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
  SELECT NOT EXISTS (
           SELECT 1 FROM public.agendamentos a
             JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
             LEFT JOIN public.tipo_servicos ts ON ts.id = a.tipo_servico_id
            WHERE a.profissional_id = p_prof AND a.ativo AND cs.codigo NOT IN ('cancelado', 'erro')
              AND a.data_hora - CASE WHEN ts.nome ~* 'domiciliar' THEN interval '30 minutes' ELSE interval '0' END
                  < p_inicio + make_interval(mins => p_min)
              AND a.data_hora + make_interval(mins => coalesce(nullif(ts.duracao_minutos, 0), 60))
                  + CASE WHEN ts.nome ~* 'domiciliar' THEN interval '30 minutes' ELSE interval '0' END > p_inicio)
     AND NOT EXISTS (
           SELECT 1 FROM public.agenda_bloqueios b
            WHERE b.ativo AND b.deleted_at IS NULL AND b.impede_agendamento
              AND (b.profissional_id IS NULL OR b.profissional_id = p_prof)
              AND b.periodo && tstzrange(p_inicio, p_inicio + make_interval(mins => p_min)))
     AND NOT EXISTS (
           SELECT 1 FROM public.ju_reservas r
            WHERE r.profissional_id = p_prof
              AND r.conversa_id IS DISTINCT FROM p_ignorar_conversa
              AND (r.status = 'pendente' OR (r.status = 'aguardando_cadastro' AND r.expira_em > now()))
              AND r.data_hora < p_inicio + make_interval(mins => p_min)
              AND r.data_hora + interval '60 minutes' > p_inicio);
$f$;
ALTER FUNCTION public.fn_ju_reserva_decidir(bigint, boolean, text) SET search_path TO 'public', 'pg_temp';
