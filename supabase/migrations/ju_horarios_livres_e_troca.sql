-- 02/11/2026 (pedido do dono)
-- 1. Todo dia às 19h, o grupo 🩺 Agenda e atendimentos recebe os horários livres do dia seguinte (domingo pula para
--    segunda) da Beatriz, da Bruna e da Flávia. A grade vem do histórico de 120 dias: só os dias da semana em que a
--    fisio atende (6+ datas) e só as horas em que ela costuma atender, no minuto dela (Flávia nas meias horas).
--    Livre = sem consulta, compromisso/bloqueio ou reserva da Ju (fn_agenda_expressa_slot_livre).
-- 2. Troca de horário pedida pela família à Ju ("queria trocar para as 10h"):
--    livre com a mesma fisio → card no grupo da agenda com ✅ Alterar / ❌ Não alterar; Alterar muda a consulta e a
--    família recebe o "Consulta Remarcada" automático. Ocupado → a família entra na lista de espera com a preferência.
-- 3. Lista de espera ganha o horário de preferência (opcional).

-- ------------------------------------------------------------ grade e horários livres
CREATE OR REPLACE FUNCTION public.fn_ju_grade(p_prof uuid, p_dia date)
RETURNS time[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
  WITH h AS (
    SELECT a.data_hora AT TIME ZONE 'UTC' AS dh
      FROM public.agendamentos a JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
     WHERE a.profissional_id = p_prof AND a.ativo AND a.data_hora > now() - interval '120 days'
       AND cs.codigo NOT IN ('cancelado', 'erro')
  ), minuto AS (
    SELECT coalesce((SELECT extract(minute FROM dh)::int FROM h GROUP BY 1 ORDER BY count(*) DESC LIMIT 1), 0) AS m
  ), dia AS (
    SELECT * FROM h WHERE extract(isodow FROM dh) = extract(isodow FROM p_dia)
  )
  SELECT CASE WHEN (SELECT count(DISTINCT dh::date) FROM dia) < 6 THEN '{}'::time[]
              ELSE coalesce((SELECT array_agg(make_time(x.hr, (SELECT m FROM minuto), 0) ORDER BY x.hr)
                               FROM (SELECT extract(hour FROM dh)::int AS hr FROM dia GROUP BY 1 HAVING count(*) >= 2) x), '{}') END;
$f$;

CREATE OR REPLACE FUNCTION public.fn_ju_hora_txt(p time)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO '' AS $f$
  SELECT regexp_replace(to_char(p, 'FMHH24"h"MI'), 'h00$', 'h');
$f$;

CREATE OR REPLACE FUNCTION public.fn_ju_livres_dia(p_prof uuid, p_dia date)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
  SELECT coalesce(array_agg(public.fn_ju_hora_txt(t) ORDER BY t), '{}')
    FROM unnest(public.fn_ju_grade(p_prof, p_dia)) t
   WHERE p_dia + t > (now() AT TIME ZONE 'America/Sao_Paulo') + interval '15 minutes'
     AND public.fn_agenda_expressa_slot_livre(p_prof, (p_dia + t) AT TIME ZONE 'UTC', 60, false);
$f$;

CREATE OR REPLACE FUNCTION public.fn_horarios_livres_texto(p_dia date)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE v text; r record; v_l text[]; v_fer text; v_esp text;
BEGIN
  SELECT nome INTO v_fer FROM followup_feriados WHERE dia = p_dia LIMIT 1;
  v := '🗓️ *Horários livres ' || CASE WHEN p_dia = (now() AT TIME ZONE 'America/Sao_Paulo')::date + 1 THEN 'amanhã, ' ELSE 'de ' END
       || (ARRAY['domingo','segunda','terça','quarta','quinta','sexta','sábado'])[extract(dow FROM p_dia)::int + 1] || ', ' || to_char(p_dia, 'DD/MM') || '*'
       || coalesce(E'\n' || '_Feriado: ' || v_fer || '_', '');
  FOR r IN SELECT * FROM (VALUES (1, 'b3e954bf-02dd-4821-aa58-aa4fb34c3e02'::uuid, 'Beatriz'),
                                 (2, 'c4883f76-d010-4fb4-ac5b-248914e56e6e'::uuid, 'Bruna'),
                                 (3, '2b1da16a-4294-47c0-b8c1-3f1595590332'::uuid, 'Flávia')) x(o, id, nome) ORDER BY o LOOP
    IF cardinality(fn_ju_grade(r.id, p_dia)) = 0 THEN
      v := v || E'\n\n' || '*' || r.nome || ':* não costuma atender nesse dia';
      CONTINUE;
    END IF;
    v_l := fn_ju_livres_dia(r.id, p_dia);
    v := v || E'\n\n' || '*' || r.nome || ':* ' || CASE WHEN cardinality(v_l) = 0 THEN 'agenda cheia' ELSE array_to_string(v_l, ', ') END;
  END LOOP;
  SELECT string_agg(n || ' na ' || t || CASE WHEN u > 0 THEN ' (' || u || ' urgente' || CASE WHEN u > 1 THEN 's' ELSE '' END || ')' ELSE '' END, ', ')
    INTO v_esp
    FROM (SELECT CASE tipo WHEN 'respiratoria' THEN 'respiratória' ELSE 'motora' END AS t, count(*) AS n,
                 count(*) FILTER (WHERE urgente) AS u
            FROM lista_espera WHERE removido_em IS NULL GROUP BY tipo ORDER BY tipo DESC) x;
  RETURN v || coalesce(E'\n\n' || '_Lista de espera: ' || v_esp || '._', '');
END $f$;

CREATE OR REPLACE FUNCTION public.fn_horarios_livres_postar()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE v_dia date := (now() AT TIME ZONE 'America/Sao_Paulo')::date + 1;
BEGIN
  IF extract(isodow FROM v_dia) = 7 THEN v_dia := v_dia + 1; END IF;
  INSERT INTO ju_avisos_grupo (texto, origem, destino)
  VALUES (fn_horarios_livres_texto(v_dia), 'HORARIOS_LIVRES', '120363402677285308@g.us');
  RETURN jsonb_build_object('ok', true, 'dia', v_dia);
END $f$;
REVOKE ALL ON FUNCTION public.fn_horarios_livres_postar() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------ lista de espera: preferência de horário
ALTER TABLE public.lista_espera ADD COLUMN IF NOT EXISTS preferencia text;

DO $m$
DECLARE d text := pg_get_functiondef('public.fn_lista_espera_texto()'::regprocedure);
        f text := $$CASE WHEN r.pediatra IS NOT NULL THEN 'ped. ' || r.pediatra END,$$;
BEGIN
  IF position(f IN d) = 0 THEN RAISE EXCEPTION 'fn_lista_espera_texto: trecho não encontrado'; END IF;
  EXECUTE replace(d, f, f || $$
                                              CASE WHEN r.preferencia IS NOT NULL THEN 'prefere ' || r.preferencia END,$$);
END $m$;

DO $m$
DECLARE d text := pg_get_functiondef('public.fn_lista_espera_comando(bigint,text,jsonb)'::regprocedure);
        f1 text := $$           urgente = v_urg OR urgente, urgencia_motivo = coalesce(v_urg_motivo, urgencia_motivo)$$;
        f2 text := $$    INSERT INTO lista_espera (tipo, nome, paciente_id, telefone, idade, idade_meses, pediatra, queixa, urgente, urgencia_motivo,
                              conversa_id, incluido_por)$$;
        f3 text := $$            CASE WHEN NOT v_equipe THEN p_conversa_id END, p_quem);$$;
BEGIN
  IF position(f1 IN d) = 0 OR position(f2 IN d) = 0 OR position(f3 IN d) = 0 THEN
    RAISE EXCEPTION 'fn_lista_espera_comando: trecho não encontrado';
  END IF;
  d := replace(d, f1, f1 || $$,
           preferencia = coalesce(nullif(btrim(coalesce(d ->> 'espera_preferencia', '')), ''), preferencia)$$);
  d := replace(d, f2, replace(f2, 'conversa_id, incluido_por)', 'conversa_id, incluido_por, preferencia)'));
  d := replace(d, f3, $$            CASE WHEN NOT v_equipe THEN p_conversa_id END, p_quem,
            nullif(btrim(coalesce(d ->> 'espera_preferencia', '')), ''));$$);
  EXECUTE d;
END $m$;

-- reagendada pela equipe (mudou o horário) também tira da lista: o pedido de troca foi atendido
DROP TRIGGER IF EXISTS trg_lista_espera_reagendou ON public.agendamentos;
CREATE TRIGGER trg_lista_espera_reagendou AFTER UPDATE OF data_hora ON public.agendamentos
  FOR EACH ROW WHEN (OLD.data_hora IS DISTINCT FROM NEW.data_hora)
  EXECUTE FUNCTION public.trg_lista_espera_agendou();

-- ------------------------------------------------------------ troca de horário
CREATE TABLE IF NOT EXISTS public.ju_trocas_horario (
  id bigserial PRIMARY KEY,
  conversa_id bigint REFERENCES public.ju_conversas(id) ON DELETE SET NULL,
  agendamento_id uuid NOT NULL REFERENCES public.agendamentos(id),
  data_hora_antes timestamp NOT NULL,
  data_hora_nova timestamp NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'feita', 'recusada', 'indisponivel')),
  card_req_id bigint,
  card_msg_id text,
  resolvido_por text,
  resolvido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ju_trocas_horario ENABLE ROW LEVEL SECURITY;

-- horário livre para a fisio, sem contar a própria consulta que vai mudar
CREATE OR REPLACE FUNCTION public.fn_ju_troca_livre(p_ag uuid, p_nova timestamp)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
  WITH a AS (
    SELECT ag.profissional_id AS prof, coalesce(nullif(ts.duracao_minutos, 0), 60) AS dur, coalesce(ts.nome ~* 'domiciliar', false) AS dom
      FROM public.agendamentos ag LEFT JOIN public.tipo_servicos ts ON ts.id = ag.tipo_servico_id WHERE ag.id = p_ag
  ), j AS (
    SELECT (p_nova AT TIME ZONE 'UTC') - CASE WHEN a.dom THEN interval '30 minutes' ELSE interval '0' END AS ini,
           (p_nova AT TIME ZONE 'UTC') + make_interval(mins => a.dur) + CASE WHEN a.dom THEN interval '30 minutes' ELSE interval '0' END AS fim,
           a.prof FROM a
  )
  SELECT NOT EXISTS (
           SELECT 1 FROM public.agendamentos x
             JOIN public.consulta_status cs ON cs.id = x.status_consulta_id
             LEFT JOIN public.tipo_servicos ts ON ts.id = x.tipo_servico_id, j
            WHERE x.profissional_id = j.prof AND x.ativo AND x.id <> p_ag
              AND cs.codigo NOT IN ('cancelado', 'erro', 'reagendado')
              AND x.data_hora - CASE WHEN ts.nome ~* 'domiciliar' THEN interval '30 minutes' ELSE interval '0' END < j.fim
              AND x.data_hora + make_interval(mins => coalesce(nullif(ts.duracao_minutos, 0), 60))
                  + CASE WHEN ts.nome ~* 'domiciliar' THEN interval '30 minutes' ELSE interval '0' END > j.ini)
     AND NOT EXISTS (
           SELECT 1 FROM public.agenda_bloqueios b, j
            WHERE b.ativo AND b.deleted_at IS NULL AND b.impede_agendamento
              AND (b.profissional_id IS NULL OR b.profissional_id = j.prof)
              AND b.periodo && tstzrange(j.ini, j.fim))
     AND NOT EXISTS (
           SELECT 1 FROM public.ju_reservas r, j
            WHERE r.profissional_id = j.prof
              AND (r.status = 'pendente' OR (r.status = 'aguardando_cadastro' AND r.expira_em > now()))
              AND r.data_hora < j.fim AND r.data_hora + interval '60 minutes' > j.ini)
     AND EXISTS (SELECT 1 FROM j);
$f$;

-- a Ju pede a troca (ferramenta trocar_horario, via fn_ju_acao_fixo)
CREATE OR REPLACE FUNCTION public.fn_ju_troca_pedir(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE
  c ju_conversas; a agendamentos; v_versao bigint := nullif(p ->> 'versao', '')::bigint; v_ok boolean;
  v_nova timestamp; v_antes timestamp; v_agora timestamp := now() AT TIME ZONE 'America/Sao_Paulo';
  v_pac text; v_prof text; v_cs text; v_tipo text; v_id bigint; v_txt text; v_tok text; v_req bigint;
  v_grade time[];
BEGIN
  SELECT * INTO c FROM ju_conversas WHERE id = (p ->> 'conversa_id')::bigint;
  IF NOT FOUND OR c.sem_ia OR (v_versao IS NOT NULL AND c.message_version > v_versao) THEN
    RETURN jsonb_build_object('ok', false, 'resposta', 'A conversa mudou; nada foi feito. Responda exatamente [NADA].');
  END IF;
  BEGIN SELECT * INTO a FROM agendamentos WHERE id = (p ->> 'agendamento_id')::uuid AND ativo; EXCEPTION WHEN OTHERS THEN a := NULL; END;
  IF a.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'resposta', 'Não achei essa consulta. Use o agendamento_id copiado de proximas_consultas; se não der, chame a secretaria (REMARCACAO).');
  END IF;
  SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(fn_ju_contexto_cliente(c.id) -> 'pacientes') x
                  WHERE (x ->> 'paciente_id')::uuid = a.paciente_id AND (x ->> 'acesso_agenda')::boolean) INTO v_ok;
  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok', false, 'resposta', 'Essa conversa não pode mexer nessa consulta. Chame a secretaria (REMARCACAO).');
  END IF;
  SELECT codigo INTO v_cs FROM consulta_status WHERE id = a.status_consulta_id;
  IF v_cs NOT IN ('agendado', 'confirmado') THEN
    RETURN jsonb_build_object('ok', false, 'resposta', 'Essa consulta não está marcada. Chame a secretaria (REMARCACAO).');
  END IF;
  BEGIN v_nova := (p ->> 'data')::date + (p ->> 'hora')::time; EXCEPTION WHEN OTHERS THEN v_nova := NULL; END;
  IF v_nova IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'resposta', 'Faltou o dia (AAAA-MM-DD) ou a hora (HH:MM) que a família quer. Pergunte.');
  END IF;
  v_antes := a.data_hora AT TIME ZONE 'UTC';
  IF v_nova = v_antes THEN
    RETURN jsonb_build_object('ok', false, 'resposta', 'Esse já é o horário marcado. Confirme com a família o que ela quer mudar.');
  END IF;
  IF v_nova < v_agora + interval '2 hours' OR v_nova > v_agora + interval '30 days' THEN
    RETURN jsonb_build_object('ok', false, 'resposta', 'Troca para tão em cima da hora ou para mais de 30 dias é com a Lolô: chame a secretaria (REMARCACAO) com o horário pedido.');
  END IF;

  SELECT split_part(btrim(nome), ' ', 1) INTO v_pac FROM pessoas WHERE id = a.paciente_id;
  SELECT split_part(btrim(nome), ' ', 1) INTO v_prof FROM pessoas WHERE id = a.profissional_id;
  v_grade := fn_ju_grade(a.profissional_id, v_nova::date);

  IF EXISTS (SELECT 1 FROM ju_trocas_horario WHERE agendamento_id = a.id AND status = 'pendente' AND data_hora_nova = v_nova) THEN
    RETURN jsonb_build_object('ok', true, 'resposta', 'Esse pedido de troca já está com a equipe. Diga só que a equipe confirma por aqui.');
  END IF;

  IF cardinality(v_grade) > 0
     AND v_nova::time BETWEEN v_grade[1] - interval '30 minutes' AND v_grade[cardinality(v_grade)]
     AND fn_ju_troca_livre(a.id, v_nova) THEN
    INSERT INTO ju_trocas_horario (conversa_id, agendamento_id, data_hora_antes, data_hora_nova)
    VALUES (c.id, a.id, v_antes, v_nova) RETURNING id INTO v_id;
    v_txt := '🔁 *Troca de horário pedida pela família*' || E'\n'
          || v_pac || ' · ' || v_prof || E'\n'
          || 'De: ' || fn_ju_quando(v_antes) || E'\n'
          || 'Para: ' || fn_ju_quando(v_nova) || ' (está livre)' || E'\n\n'
          || 'Tocando em Alterar, a consulta muda no sistema e a família recebe a confirmação.';
    v_tok := fn_whatsapp_conexoes_credenciais() ->> 'whatsapp_uazapi_token';
    IF v_tok IS NOT NULL THEN
      v_req := net.http_post(url := 'https://infuse.uazapi.com/send/menu',
        body := jsonb_build_object('number', '120363402677285308@g.us', 'type', 'button', 'text', v_txt,
                                   'choices', jsonb_build_array('✅ Alterar|ju_troca_ok:' || v_id, '❌ Não alterar|ju_troca_nao:' || v_id)),
        headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
        timeout_milliseconds := 20000);
      UPDATE ju_trocas_horario SET card_req_id = v_req WHERE id = v_id;
    END IF;
    RETURN jsonb_build_object('ok', true, 'resposta',
      'O horário pedido (' || fn_ju_quando(v_nova) || ') está livre e a troca foi para a equipe confirmar. Diga à família, em uma frase, que vai confirmar a troca com a equipe e avisa por aqui. Não diga que já trocou; a consulta de ' || fn_ju_quando(v_antes) || ' continua até a confirmação.');
  END IF;

  -- ocupado: lista de espera com a preferência; a consulta atual continua
  v_tipo := fn_lista_espera_tipo_servico(a.tipo_servico_id);
  IF v_tipo IS NOT NULL THEN
    UPDATE lista_espera SET preferencia = fn_ju_quando(v_nova), queixa = 'troca de horário (marcado ' || fn_ju_quando(v_antes) || ')'
     WHERE removido_em IS NULL AND paciente_id = a.paciente_id AND tipo = v_tipo;
    IF NOT FOUND THEN
      INSERT INTO lista_espera (tipo, nome, paciente_id, telefone, queixa, preferencia, conversa_id, incluido_por)
      VALUES (v_tipo, (SELECT split_part(btrim(nome), ' ', 1) || coalesce(' ' || nullif(split_part(btrim(nome), ' ', 2), ''), '') FROM pessoas WHERE id = a.paciente_id),
              a.paciente_id, fn_lista_espera_tel(c.telefone), 'troca de horário (marcado ' || fn_ju_quando(v_antes) || ')',
              fn_ju_quando(v_nova), c.id, 'Ju');
    END IF;
    PERFORM fn_lista_espera_marcar();
  END IF;
  INSERT INTO ju_trocas_horario (conversa_id, agendamento_id, data_hora_antes, data_hora_nova, status, resolvido_por, resolvido_em)
  VALUES (c.id, a.id, v_antes, v_nova, 'indisponivel', 'Ju', now());
  RETURN jsonb_build_object('ok', true, 'resposta',
    fn_ju_quando(v_nova) || ' com a ' || v_prof || ' não está livre. ' || v_pac || ' entrou na lista de espera com essa preferência e a consulta de '
    || fn_ju_quando(v_antes) || ' continua marcada. Diga isso à família em uma ou duas frases leves: se abrir o horário, a equipe avisa por aqui. Não ofereça outros horários.');
END $f$;
REVOKE ALL ON FUNCTION public.fn_ju_troca_pedir(jsonb) FROM PUBLIC, anon, authenticated;

-- clique no card (✅ Alterar / ❌ Não alterar), vindo do grupo da agenda
CREATE OR REPLACE FUNCTION public.fn_ju_troca_botao(p_botao text, p_quem text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE
  t ju_trocas_horario; a agendamentos; v_ok boolean := p_botao LIKE 'ju_troca_ok:%'; v_id bigint;
  v_pac text; v_msg text; v_tok text; v_quem text := coalesce(nullif(btrim(p_quem), ''), 'equipe');
BEGIN
  IF v_quem ~* '^(respira|recep|alguém|alguem)' THEN v_quem := 'Recepção'; END IF;
  v_id := nullif(split_part(p_botao, ':', 2), '')::bigint;
  SELECT * INTO t FROM ju_trocas_horario WHERE id = v_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'texto', '⚠️ Não achei esse pedido de troca.'); END IF;
  IF t.status <> 'pendente' THEN
    RETURN jsonb_build_object('ok', false, 'texto', 'Esse pedido de troca já foi resolvido (' || t.status || coalesce(' por ' || t.resolvido_por, '') || ').');
  END IF;
  SELECT * INTO a FROM agendamentos WHERE id = t.agendamento_id;
  SELECT split_part(btrim(nome), ' ', 1) INTO v_pac FROM pessoas WHERE id = a.paciente_id;

  -- id do card para apagar
  v_msg := t.card_msg_id;
  IF v_msg IS NULL AND t.card_req_id IS NOT NULL THEN
    SELECT coalesce(content::jsonb ->> 'messageid', split_part(content::jsonb ->> 'id', ':', 2)) INTO v_msg
      FROM net._http_response WHERE id = t.card_req_id AND status_code BETWEEN 200 AND 299;
  END IF;
  v_tok := fn_whatsapp_conexoes_credenciais() ->> 'whatsapp_uazapi_token';

  IF NOT v_ok THEN
    UPDATE ju_trocas_horario SET status = 'recusada', resolvido_por = v_quem, resolvido_em = now() WHERE id = t.id;
  ELSE
    IF NOT a.ativo OR (SELECT codigo FROM consulta_status WHERE id = a.status_consulta_id) NOT IN ('agendado', 'confirmado')
       OR (a.data_hora AT TIME ZONE 'UTC') <> t.data_hora_antes THEN
      UPDATE ju_trocas_horario SET status = 'indisponivel', resolvido_por = v_quem, resolvido_em = now() WHERE id = t.id;
      RETURN jsonb_build_object('ok', false, 'texto', '⚠️ A consulta de ' || v_pac || ' mudou desde o pedido. Nada foi alterado; confira na agenda.');
    END IF;
    IF NOT fn_ju_troca_livre(a.id, t.data_hora_nova) THEN
      UPDATE ju_trocas_horario SET status = 'indisponivel', resolvido_por = v_quem, resolvido_em = now() WHERE id = t.id;
      RETURN jsonb_build_object('ok', false, 'texto', '⚠️ ' || fn_ju_quando(t.data_hora_nova) || ' não está mais livre. Nada foi alterado.');
    END IF;
    UPDATE agendamentos
       SET data_hora = t.data_hora_nova AT TIME ZONE 'UTC',
           observacao = concat_ws(' ', nullif(btrim(observacao), ''),
             '[Ju] horário trocado de ' || fn_ju_quando(t.data_hora_antes) || ' a pedido da família, confirmado por ' || v_quem || '.'),
           updated_at = now()
     WHERE id = a.id;
    UPDATE ju_trocas_horario SET status = 'feita', resolvido_por = v_quem, resolvido_em = now() WHERE id = t.id;
  END IF;

  IF v_msg IS NOT NULL AND v_tok IS NOT NULL THEN
    PERFORM net.http_post(url := 'https://infuse.uazapi.com/message/delete', body := jsonb_build_object('id', v_msg),
      headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
      timeout_milliseconds := 20000);
  END IF;
  RETURN jsonb_build_object('ok', true, 'aceita', v_ok, 'texto',
    CASE WHEN v_ok THEN '✅ ' || v_pac || ' passou para ' || fn_ju_quando(t.data_hora_nova) || ' (por ' || v_quem || '). A família recebe a confirmação automática.'
         ELSE '❌ Troca de ' || v_pac || ' não feita (por ' || v_quem || '). A consulta continua ' || fn_ju_quando(t.data_hora_antes) || '; avise a família.' END);
END $f$;
REVOKE ALL ON FUNCTION public.fn_ju_troca_botao(text, text) FROM PUBLIC, anon, authenticated;

-- porta única dos botões: troca vem do grupo da agenda
DO $m$
DECLARE d text := pg_get_functiondef('public.fn_ju_reserva_botao(bigint,uuid,boolean,text,text,text)'::regprocedure);
        f text := $$  IF p_prof IS NOT NULL THEN
$$;
BEGIN
  IF position(f IN d) = 0 THEN RAISE EXCEPTION 'fn_ju_reserva_botao: trecho não encontrado'; END IF;
  EXECUTE replace(d, f, $$  IF p_prof LIKE 'ju_troca_%' THEN
    IF coalesce(p_chatid, '') <> '120363402677285308@g.us' THEN
      RETURN jsonb_build_object('ok', false, 'texto', 'Esse botão só vale no grupo da agenda.');
    END IF;
    RETURN public.fn_ju_troca_botao(p_prof, p_quem);
  END IF;
$$ || f);
END $m$;

-- a ferramenta trocar_horario entra pela mesma porta das ações de fixo
DO $m$
DECLARE d text := pg_get_functiondef('public.fn_ju_acao_fixo(jsonb)'::regprocedure);
        f text := $$BEGIN
  SELECT * INTO c FROM ju_conversas WHERE id = (p ->> 'conversa_id')::bigint;$$;
BEGIN
  IF position(f IN d) = 0 THEN RAISE EXCEPTION 'fn_ju_acao_fixo: trecho não encontrado'; END IF;
  EXECUTE replace(d, f, $$BEGIN
  IF v_acao = 'TROCAR_HORARIO' THEN RETURN public.fn_ju_troca_pedir(p); END IF;
  SELECT * INTO c FROM ju_conversas WHERE id = (p ->> 'conversa_id')::bigint;$$);
END $m$;

-- horários livres: todo dia às 19h (22:00 UTC)
SELECT cron.schedule('horarios-livres-19h', '0 22 * * *', $$SELECT public.fn_horarios_livres_postar();$$);
