-- 02/11/2026 (pedido do dono): lista de espera (respiratória e motora) no grupo 🩺 RK · Agenda e atendimentos.
-- Entra pelo "@ju" da secretaria ("coloca na lista de espera"); a IA do comando extrai nome, telefone, idade,
-- pediatra, tipo e urgência (menor de 6 meses, bronquiolite, asma só em crise). Menor de 6 meses é urgente
-- mesmo que a IA não marque.
-- No grupo fica UMA mensagem com as duas listas, fixada por 30 dias. A cada mudança ela é apagada e postada
-- de novo (o WhatsApp só deixa editar até 15 min). De segunda a sábado às 8h ela é repostada para voltar ao fim
-- do grupo. Fora das 7h-21h as mudanças esperam.
-- Sai da lista sozinho quando a consulta é marcada (mesmo paciente ou mesmo telefone, mesmo tipo).
-- Quando uma consulta dos próximos 7 dias é cancelada e há gente esperando daquele tipo, o grupo recebe
-- "Vagou um horário" com os nomes da lista.

CREATE TABLE IF NOT EXISTS public.lista_espera (
  id bigserial PRIMARY KEY,
  tipo text NOT NULL CHECK (tipo IN ('respiratoria', 'motora')),
  nome text NOT NULL,
  paciente_id uuid REFERENCES public.pessoas(id),
  telefone text,
  idade text,
  idade_meses integer,
  pediatra text,
  queixa text,
  urgente boolean NOT NULL DEFAULT false,
  urgencia_motivo text,
  conversa_id bigint REFERENCES public.ju_conversas(id) ON DELETE SET NULL,
  incluido_por text,
  created_at timestamptz NOT NULL DEFAULT now(),
  removido_em timestamptz,
  removido_por text,
  removido_motivo text,
  agendamento_id uuid
);
CREATE INDEX IF NOT EXISTS lista_espera_ativos ON public.lista_espera (tipo, created_at) WHERE removido_em IS NULL;
ALTER TABLE public.lista_espera ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.lista_espera_estado (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  msg_id text,
  req_id bigint,
  req_em timestamptz,
  pin_req_id bigint,
  sujo boolean NOT NULL DEFAULT false,
  publicado_em timestamptz
);
INSERT INTO public.lista_espera_estado (id) VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE public.lista_espera_estado ENABLE ROW LEVEL SECURITY;

-- telefone em dígitos com DDI; celular brasileiro sempre com o 9 (para comparar)
CREATE OR REPLACE FUNCTION public.fn_lista_espera_tel(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO '' AS $f$
  SELECT CASE WHEN e = '' THEN NULL
              WHEN e ~ '^55[0-9]{2}[6-9][0-9]{7}$' THEN substr(e, 1, 4) || '9' || substr(e, 5)
              ELSE e END
  FROM (SELECT CASE WHEN length(d) IN (10, 11) AND coalesce(p, '') !~ '^\s*\+' THEN '55' || d ELSE d END AS e
          FROM (SELECT regexp_replace(coalesce(p, ''), '\D', '', 'g') AS d) x) y;
$f$;

CREATE OR REPLACE FUNCTION public.fn_lista_espera_tel_fmt(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO '' AS $f$
  SELECT CASE WHEN p ~ '^55[0-9]{11}$' THEN '(' || substr(p, 3, 2) || ') ' || substr(p, 5, 5) || '-' || substr(p, 10)
              WHEN p ~ '^55[0-9]{10}$' THEN '(' || substr(p, 3, 2) || ') ' || substr(p, 5, 4) || '-' || substr(p, 9)
              WHEN p IS NULL THEN NULL
              ELSE '+' || p END;
$f$;

CREATE OR REPLACE FUNCTION public.fn_lista_espera_tipo_servico(p_tipo_servico_id uuid)
RETURNS text LANGUAGE sql STABLE SET search_path TO '' AS $f$
  SELECT CASE WHEN nome ILIKE '%respir%' OR nome ILIKE '%aspira%' THEN 'respiratoria'
              WHEN nome ILIKE '%motor%' THEN 'motora' END
    FROM public.tipo_servicos WHERE id = p_tipo_servico_id;
$f$;

CREATE OR REPLACE FUNCTION public.fn_lista_espera_idade(p_meses integer)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO '' AS $f$
  SELECT CASE WHEN p_meses IS NULL THEN NULL
              WHEN p_meses < 1 THEN 'recém-nascido'
              WHEN p_meses = 1 THEN '1 mês'
              WHEN p_meses < 24 THEN p_meses || ' meses'
              ELSE (p_meses / 12) || ' anos' END;
$f$;

-- texto da mensagem fixada (NULL quando a lista está vazia)
CREATE OR REPLACE FUNCTION public.fn_lista_espera_texto()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE v text; t record; r record; n int; v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM lista_espera WHERE removido_em IS NULL) THEN RETURN NULL; END IF;
  v := '📋 *Lista de espera*' || E'\n' || '_atualizada ' || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24"h"MI') || '_';
  FOR t IN SELECT * FROM (VALUES ('respiratoria', '🫁 *Respiratória*'), ('motora', '🤸 *Motora*')) x(tipo, titulo) LOOP
    SELECT count(*) INTO n FROM lista_espera WHERE removido_em IS NULL AND tipo = t.tipo;
    v := v || E'\n\n' || t.titulo || ' (' || n || ')';
    IF n = 0 THEN v := v || E'\n' || '_ninguém esperando_'; CONTINUE; END IF;
    FOR r IN SELECT * FROM lista_espera WHERE removido_em IS NULL AND tipo = t.tipo ORDER BY urgente DESC, created_at LOOP
      v := v || E'\n' || CASE WHEN r.urgente THEN '🔴 ' ELSE '⚪ ' END || '*' || r.nome || '*'
             || coalesce(', ' || r.idade, '')
             || coalesce(' · ' || nullif(btrim(coalesce(r.queixa, '')), ''), '')
             || CASE WHEN r.urgente AND nullif(btrim(coalesce(r.urgencia_motivo, '')), '') IS NOT NULL
                          AND lower(r.urgencia_motivo) <> lower(coalesce(r.queixa, ''))
                     THEN CASE WHEN nullif(btrim(coalesce(r.queixa, '')), '') IS NULL THEN ' · ' || r.urgencia_motivo
                               ELSE ' (' || r.urgencia_motivo || ')' END
                     ELSE '' END
             || E'\n' || '      ' || concat_ws(' · ', fn_lista_espera_tel_fmt(r.telefone),
                                              CASE WHEN r.pediatra IS NOT NULL THEN 'ped. ' || r.pediatra END,
                                              'desde ' || to_char(r.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM')
                                              || CASE WHEN v_hoje - (r.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= 3
                                                      THEN ' (' || (v_hoje - (r.created_at AT TIME ZONE 'America/Sao_Paulo')::date) || ' dias)' ELSE '' END);
    END LOOP;
  END LOOP;
  RETURN v || E'\n\n' || '_Ao marcar a consulta, o paciente sai da lista sozinho. Para incluir ou tirar: @ju na conversa da família._';
END $f$;

CREATE OR REPLACE FUNCTION public.fn_lista_espera_marcar()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $f$
  UPDATE public.lista_espera_estado SET sujo = true WHERE id = 1;
$f$;

-- "@ju" da secretaria: adicionar, tirar, ver
CREATE OR REPLACE FUNCTION public.fn_lista_espera_comando(p_conversa_id bigint, p_quem text, d jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE
  c ju_conversas; ctx jsonb; v_equipe boolean; v_acao text := d ->> 'acao';
  v_pac uuid; v_pac_nome text; v_nasc date; v_nome text; v_tipo text; v_tel text; v_meses int; v_idade text;
  v_urg boolean; v_urg_motivo text; v_id bigint; v_label text; v_n int; v_lista text;
BEGIN
  SELECT * INTO c FROM ju_conversas WHERE id = p_conversa_id;
  v_equipe := public.fn_ju_equipe_por_telefone(c.telefone) IS NOT NULL;
  ctx := fn_ju_contexto_cliente(p_conversa_id);

  IF nullif(d ->> 'paciente_id', '') IS NOT NULL THEN
    SELECT (x ->> 'paciente_id')::uuid INTO v_pac
      FROM jsonb_array_elements(coalesce(ctx -> 'pacientes', '[]'::jsonb)) x WHERE x ->> 'paciente_id' = d ->> 'paciente_id' LIMIT 1;
    IF v_pac IS NOT NULL THEN
      SELECT nome, data_nascimento INTO v_pac_nome, v_nasc FROM pessoas WHERE id = v_pac;
    END IF;
  END IF;

  IF v_acao = 'lista_espera_ver' THEN
    IF NOT v_equipe THEN
      RETURN jsonb_build_object('status', 'informado', 'texto', 'A lista de espera fica fixada no grupo de agenda e atendimentos.');
    END IF;
    v_lista := fn_lista_espera_texto();
    RETURN jsonb_build_object('status', 'informado', 'texto', coalesce(v_lista, 'A lista de espera está vazia.'));
  END IF;

  IF v_acao = 'lista_espera_remover' THEN
    v_nome := nullif(btrim(coalesce(d ->> 'espera_nome', '')), '');
    v_tel := fn_lista_espera_tel(d ->> 'espera_telefone');
    SELECT count(*), min(id) INTO v_n, v_id FROM lista_espera l
     WHERE l.removido_em IS NULL
       AND (l.paciente_id = v_pac
            OR (v_tel IS NOT NULL AND l.telefone = v_tel)
            OR (v_nome IS NOT NULL AND lower(unaccent(l.nome)) LIKE '%' || lower(unaccent(v_nome)) || '%')
            OR (v_pac IS NULL AND v_nome IS NULL AND v_tel IS NULL AND NOT v_equipe AND l.telefone = fn_lista_espera_tel(c.telefone)))
       AND (nullif(d ->> 'espera_tipo', '') IS NULL OR l.tipo = d ->> 'espera_tipo');
    IF v_n = 0 THEN
      RETURN jsonb_build_object('status', 'informado', 'texto', 'Não achei ' || coalesce(v_nome, split_part(v_pac_nome, ' ', 1), 'essa criança') || ' na lista de espera.');
    END IF;
    IF v_n > 1 THEN
      RETURN jsonb_build_object('status', 'pergunta', 'texto', 'Achei mais de uma pessoa na lista com esse nome: '
        || (SELECT string_agg(l.nome || ' (' || CASE l.tipo WHEN 'respiratoria' THEN 'respiratória' ELSE 'motora' END || ')', ', ')
              FROM lista_espera l WHERE l.removido_em IS NULL AND (l.paciente_id = v_pac OR (v_tel IS NOT NULL AND l.telefone = v_tel)
                OR (v_nome IS NOT NULL AND lower(unaccent(l.nome)) LIKE '%' || lower(unaccent(v_nome)) || '%')))
        || '. Qual delas?');
    END IF;
    UPDATE lista_espera SET removido_em = now(), removido_por = p_quem, removido_motivo = 'pedido pelo @ju' WHERE id = v_id
    RETURNING nome INTO v_nome;
    PERFORM fn_lista_espera_marcar();
    RETURN jsonb_build_object('status', 'agenda', 'texto', 'Pronto, tirei ' || split_part(v_nome, ' ', 1) || ' da lista de espera.');
  END IF;

  -- adicionar
  v_nome := coalesce(nullif(btrim(coalesce(d ->> 'espera_nome', '')), ''),
                     CASE WHEN v_pac_nome IS NOT NULL THEN split_part(btrim(v_pac_nome), ' ', 1) || coalesce(' ' || nullif(split_part(btrim(v_pac_nome), ' ', 2), ''), '') END);
  IF v_nome IS NULL THEN
    RETURN jsonb_build_object('status', 'pergunta', 'texto', 'Qual o nome da criança para a lista de espera?');
  END IF;
  v_tipo := nullif(d ->> 'espera_tipo', '');
  IF v_tipo IS NULL OR v_tipo NOT IN ('respiratoria', 'motora') THEN
    RETURN jsonb_build_object('status', 'pergunta', 'texto', 'A lista de espera é da fisioterapia respiratória ou da motora?');
  END IF;
  v_tel := coalesce(fn_lista_espera_tel(d ->> 'espera_telefone'), CASE WHEN NOT v_equipe THEN fn_lista_espera_tel(c.telefone) END);
  IF v_tel IS NULL THEN
    RETURN jsonb_build_object('status', 'pergunta', 'texto', 'Qual o telefone de contato da família?');
  END IF;
  v_meses := CASE WHEN v_nasc IS NOT NULL THEN (extract(year FROM age(v_nasc)) * 12 + extract(month FROM age(v_nasc)))::int
                  ELSE nullif(d ->> 'espera_idade_meses', '')::int END;
  v_idade := coalesce(nullif(btrim(coalesce(d ->> 'espera_idade', '')), ''), fn_lista_espera_idade(v_meses));
  v_urg := coalesce((d ->> 'espera_urgente')::boolean, false) OR coalesce(v_meses < 6, false);
  v_urg_motivo := CASE WHEN v_urg THEN coalesce(nullif(btrim(coalesce(d ->> 'espera_urgencia_motivo', '')), ''),
                                                CASE WHEN v_meses < 6 THEN 'menor de 6 meses' END) END;

  SELECT id INTO v_id FROM lista_espera l
   WHERE l.removido_em IS NULL AND l.tipo = v_tipo
     AND ((v_pac IS NOT NULL AND l.paciente_id = v_pac)
          OR (l.telefone = v_tel AND lower(unaccent(split_part(l.nome, ' ', 1))) = lower(unaccent(split_part(v_nome, ' ', 1)))))
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE lista_espera SET nome = v_nome, paciente_id = coalesce(v_pac, paciente_id), telefone = v_tel,
           idade = coalesce(v_idade, idade), idade_meses = coalesce(v_meses, idade_meses),
           pediatra = coalesce(nullif(btrim(coalesce(d ->> 'espera_pediatra', '')), ''), pediatra),
           queixa = coalesce(nullif(btrim(coalesce(d ->> 'motivo', '')), ''), queixa),
           urgente = v_urg OR urgente, urgencia_motivo = coalesce(v_urg_motivo, urgencia_motivo)
     WHERE id = v_id;
  ELSE
    INSERT INTO lista_espera (tipo, nome, paciente_id, telefone, idade, idade_meses, pediatra, queixa, urgente, urgencia_motivo,
                              conversa_id, incluido_por)
    VALUES (v_tipo, v_nome, v_pac, v_tel, v_idade, v_meses, nullif(btrim(coalesce(d ->> 'espera_pediatra', '')), ''),
            nullif(btrim(coalesce(d ->> 'motivo', '')), ''), v_urg, v_urg_motivo,
            CASE WHEN NOT v_equipe THEN p_conversa_id END, p_quem);
  END IF;
  PERFORM fn_lista_espera_marcar();

  v_label := CASE v_tipo WHEN 'respiratoria' THEN 'respiratória' ELSE 'motora' END;
  IF v_equipe THEN
    RETURN jsonb_build_object('status', 'agenda', 'texto',
      CASE WHEN v_id IS NOT NULL THEN 'Atualizei ' ELSE 'Coloquei ' END || split_part(v_nome, ' ', 1) || ' na lista de espera da ' || v_label
      || CASE WHEN v_urg THEN ', como urgente (' || coalesce(v_urg_motivo, 'urgente') || ')' ELSE '' END || '.');
  END IF;
  RETURN jsonb_build_object('status', 'agenda', 'texto',
    'Pronto, ' || split_part(v_nome, ' ', 1) || ' está na nossa lista de espera da fisioterapia ' || v_label
    || '. Assim que abrir um horário, a gente avisa por aqui.');
END $f$;
REVOKE ALL ON FUNCTION public.fn_lista_espera_comando(bigint, text, jsonb) FROM PUBLIC, anon, authenticated;

-- o "@ju" chama a lista antes das outras ações
DO $m$
DECLARE d text := pg_get_functiondef('public.fn_ju_comando_executar(bigint,bigint,jsonb)'::regprocedure);
        f text := $$  IF v_acao = 'anotar' THEN$$;
BEGIN
  IF position(f IN d) = 0 THEN RAISE EXCEPTION 'fn_ju_comando_executar: trecho não encontrado'; END IF;
  EXECUTE regexp_replace(d, '  IF v_acao = ''anotar'' THEN',
    '  IF v_acao IN (''lista_espera_adicionar'', ''lista_espera_remover'', ''lista_espera_ver'') THEN
    RETURN public.fn_lista_espera_comando(p_conversa_id, v_quem, d);
  END IF;

  IF v_acao = ''anotar'' THEN');
END $m$;

-- consulta marcada tira da lista (mesmo paciente ou telefone da família, mesmo tipo)
CREATE OR REPLACE FUNCTION public.trg_lista_espera_agendou()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE v_tipo text; v_tels text[]; v_n int;
BEGIN
  IF NOT NEW.ativo OR NOT EXISTS (SELECT 1 FROM lista_espera WHERE removido_em IS NULL) THEN RETURN NEW; END IF;
  IF (SELECT codigo FROM consulta_status WHERE id = NEW.status_consulta_id) NOT IN ('agendado', 'confirmado') THEN RETURN NEW; END IF;
  BEGIN
    v_tipo := fn_lista_espera_tipo_servico(NEW.tipo_servico_id);
    SELECT array_agg(DISTINCT fn_lista_espera_tel(t)) INTO v_tels FROM (
      SELECT p.telefone::text AS t FROM pessoas p WHERE p.id = NEW.paciente_id
      UNION ALL
      SELECT r.telefone::text FROM pessoa_responsaveis pr JOIN pessoas r ON r.id = pr.id_responsavel
       WHERE pr.id_pessoa = NEW.paciente_id AND pr.ativo IS NOT FALSE) x WHERE t IS NOT NULL;
    UPDATE lista_espera l
       SET removido_em = now(), removido_por = 'sistema', removido_motivo = 'consulta marcada',
           agendamento_id = NEW.id, paciente_id = coalesce(l.paciente_id, NEW.paciente_id)
     WHERE l.removido_em IS NULL
       AND (v_tipo IS NULL OR l.tipo = v_tipo)
       AND (l.paciente_id = NEW.paciente_id OR (l.paciente_id IS NULL AND l.telefone = ANY (coalesce(v_tels, '{}'))));
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN PERFORM fn_lista_espera_marcar(); END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_lista_espera_agendou: %', SQLERRM;
  END;
  RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS trg_lista_espera_agendou ON public.agendamentos;
CREATE TRIGGER trg_lista_espera_agendou AFTER INSERT ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.trg_lista_espera_agendou();

-- consulta cancelada nos próximos 7 dias + gente esperando daquele tipo = aviso no grupo
CREATE OR REPLACE FUNCTION public.trg_lista_espera_vagou()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE v_tipo text; v_dh timestamp; v_agora timestamp; v_nomes text; v_prof text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM lista_espera WHERE removido_em IS NULL) THEN RETURN NEW; END IF;
  BEGIN
    IF (SELECT codigo FROM consulta_status WHERE id = OLD.status_consulta_id) NOT IN ('agendado', 'confirmado')
       OR (SELECT codigo FROM consulta_status WHERE id = NEW.status_consulta_id) <> 'cancelado' THEN
      RETURN NEW;
    END IF;
    v_dh := NEW.data_hora AT TIME ZONE 'UTC';
    v_agora := now() AT TIME ZONE 'America/Sao_Paulo';
    IF v_dh < v_agora + interval '2 hours' OR v_dh > v_agora + interval '7 days' THEN RETURN NEW; END IF;
    v_tipo := fn_lista_espera_tipo_servico(NEW.tipo_servico_id);
    IF v_tipo IS NULL THEN RETURN NEW; END IF;
    SELECT string_agg(CASE WHEN urgente THEN '🔴 ' ELSE '' END || nome, ', ' ORDER BY urgente DESC, created_at) INTO v_nomes
      FROM (SELECT * FROM lista_espera WHERE removido_em IS NULL AND tipo = v_tipo ORDER BY urgente DESC, created_at LIMIT 5) x;
    IF v_nomes IS NULL THEN RETURN NEW; END IF;
    SELECT split_part(btrim(nome), ' ', 1) INTO v_prof FROM pessoas WHERE id = NEW.profissional_id;
    INSERT INTO ju_avisos_grupo (texto, origem, destino)
    VALUES ('🟢 *Vagou um horário*' || E'\n' || fn_ju_quando(v_dh) || coalesce(' · ' || v_prof, '') || ' · '
            || CASE v_tipo WHEN 'respiratoria' THEN 'respiratória' ELSE 'motora' END
            || E'\n\n' || 'Na lista de espera: ' || v_nomes || E'\n' || '_A lista completa está fixada no grupo._',
            'VAGA_LISTA_ESPERA', '120363402677285308@g.us');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_lista_espera_vagou: %', SQLERRM;
  END;
  RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS trg_lista_espera_vagou ON public.agendamentos;
CREATE TRIGGER trg_lista_espera_vagou AFTER UPDATE OF status_consulta_id ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.trg_lista_espera_vagou();

-- publica a mensagem do grupo (cron a cada minuto)
CREATE OR REPLACE FUNCTION public.fn_lista_espera_cron()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE
  GRUPO constant text := '120363402677285308@g.us';
  e lista_espera_estado; v_tok text; v_resp record; v_msg text; v_txt text;
  v_brt timestamp := now() AT TIME ZONE 'America/Sao_Paulo'; v_out text := 'nada';
BEGIN
  SELECT * INTO e FROM lista_espera_estado WHERE id = 1 FOR UPDATE;
  v_tok := fn_whatsapp_conexoes_credenciais() ->> 'whatsapp_uazapi_token';
  IF v_tok IS NULL THEN RETURN jsonb_build_object('acao', 'sem_token'); END IF;

  -- 1. descobre o id da mensagem postada e fixa por 30 dias
  IF e.req_id IS NOT NULL AND e.msg_id IS NULL THEN
    SELECT status_code, content INTO v_resp FROM net._http_response WHERE id = e.req_id;
    IF v_resp.status_code BETWEEN 200 AND 299 THEN
      v_msg := coalesce(v_resp.content::jsonb ->> 'messageid', split_part(v_resp.content::jsonb ->> 'id', ':', 2));
      UPDATE lista_espera_estado SET msg_id = v_msg, req_id = NULL WHERE id = 1;
      e.msg_id := v_msg;
      IF v_msg IS NOT NULL THEN
        UPDATE lista_espera_estado SET pin_req_id = net.http_post(url := 'https://infuse.uazapi.com/message/pin',
          body := jsonb_build_object('id', v_msg, 'pin', true, 'duration', 30),
          headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
          timeout_milliseconds := 20000) WHERE id = 1;
      END IF;
      v_out := 'fixada';
    ELSIF v_resp.status_code IS NOT NULL OR e.req_em < now() - interval '10 minutes' THEN
      UPDATE lista_espera_estado SET req_id = NULL, sujo = true WHERE id = 1;  -- falhou: tenta de novo
      RETURN jsonb_build_object('acao', 'envio_falhou', 'status', v_resp.status_code);
    ELSE
      RETURN jsonb_build_object('acao', 'aguardando_envio');
    END IF;
  END IF;

  -- 2. de segunda a sábado às 8h, reposta para voltar ao fim do grupo
  IF extract(isodow FROM v_brt) BETWEEN 1 AND 6 AND v_brt::time BETWEEN '08:00' AND '08:10'
     AND (e.publicado_em IS NULL OR (e.publicado_em AT TIME ZONE 'America/Sao_Paulo') < v_brt::date + time '08:00')
     AND EXISTS (SELECT 1 FROM lista_espera WHERE removido_em IS NULL) THEN
    e.sujo := true;
  END IF;

  -- 3. publica (só das 7h às 21h, no máximo uma vez a cada 90 s)
  IF e.sujo AND v_brt::time BETWEEN '07:00' AND '21:00'
     AND (e.publicado_em IS NULL OR e.publicado_em < now() - interval '90 seconds') THEN
    IF e.msg_id IS NOT NULL THEN
      PERFORM net.http_post(url := 'https://infuse.uazapi.com/message/delete',
        body := jsonb_build_object('id', e.msg_id),
        headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
        timeout_milliseconds := 20000);
    END IF;
    v_txt := fn_lista_espera_texto();
    UPDATE lista_espera_estado
       SET msg_id = NULL, sujo = false, publicado_em = now(), req_em = now(),
           req_id = CASE WHEN v_txt IS NULL THEN NULL ELSE net.http_post(url := 'https://infuse.uazapi.com/send/text',
             body := jsonb_build_object('number', GRUPO, 'text', v_txt),
             headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
             timeout_milliseconds := 20000) END
     WHERE id = 1;
    v_out := CASE WHEN v_txt IS NULL THEN 'lista_vazia_apagada' ELSE 'publicada' END;
  END IF;
  RETURN jsonb_build_object('acao', v_out);
END $f$;
REVOKE ALL ON FUNCTION public.fn_lista_espera_cron() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('lista-espera', '* * * * *', $$SELECT public.fn_lista_espera_cron();$$);
