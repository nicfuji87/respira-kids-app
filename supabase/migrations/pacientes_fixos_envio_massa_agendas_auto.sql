-- Pacientes Fixos: envio em massa + agendas públicas automáticas (02/11/2026)
--
-- Decisões do dono:
-- - O envio manual (abre o WhatsApp) continua. O em massa sai sozinho pelo
--   número da recepção (uazapi respirakids), só para os pacientes escolhidos.
-- - Anti-ban: 5 a 9 min entre mensagens, 8h-20h, e o MESMO ritmo das
--   cobranças em lote (mesmo número): o intervalo e o teto de 80/dia valem
--   para as duas filas somadas.
-- - Agenda pública: sempre 4 semanas abertas por profissional escolhida
--   (Bruna, Flávia e Beatriz). A semana que passou expira; a nova (4ª semana)
--   é criada sozinha. Horários = os dias/horas que a profissional costuma
--   abrir nas últimas agendas dela (sem histórico: a grade da Agenda Expressa).

-- =============================================================================
-- 1. Fila de envio
-- =============================================================================
ALTER TABLE public.pacientes_fixos_envios
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'enviado'
    CHECK (status IN ('fila', 'enviando', 'enviado', 'falhou', 'cancelado')),
  ADD COLUMN IF NOT EXISTS texto text,
  ADD COLUMN IF NOT EXISTS agendas uuid[],
  ADD COLUMN IF NOT EXISTS fila_em timestamptz,
  ADD COLUMN IF NOT EXISTS tentado_em timestamptz,
  ADD COLUMN IF NOT EXISTS req_id bigint,
  ADD COLUMN IF NOT EXISTS erro text;

ALTER TABLE public.pacientes_fixos_envios ALTER COLUMN enviado_em DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pacientes_fixos_envios_fila
  ON public.pacientes_fixos_envios (fila_em) WHERE status IN ('fila', 'enviando');

COMMENT ON COLUMN public.pacientes_fixos_envios.status IS
  'Manual (abre o WhatsApp) = enviado na hora. Em massa: fila → enviando → enviado/falhou; cancelado = tirado da fila ou paciente já marcou.';

-- Enfileira: [{paciente_id, semana, agendas[], telefone, texto}]
CREATE OR REPLACE FUNCTION public.fn_fixos_enfileirar_envios(p_itens jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eu uuid := public.get_current_pessoa_id();
  it jsonb;
  v_ok int := 0;
  v_ign int := 0;
BEGIN
  IF NOT (public.is_admin() OR public.is_secretaria()) THEN
    RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501';
  END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) LOOP
    IF nullif(it->>'telefone', '') IS NULL OR nullif(it->>'texto', '') IS NULL
       OR EXISTS (SELECT 1 FROM public.pacientes_fixos_envios e
                   WHERE e.paciente_id = (it->>'paciente_id')::uuid
                     AND e.semana = date_trunc('week', (it->>'semana')::date)::date
                     AND e.status IN ('fila', 'enviando')) THEN
      v_ign := v_ign + 1;
      CONTINUE;
    END IF;
    INSERT INTO public.pacientes_fixos_envios
      (paciente_id, semana, agenda_id, agendas, telefone, texto, canal, status, fila_em, enviado_em, enviado_por)
    VALUES (
      (it->>'paciente_id')::uuid,
      date_trunc('week', (it->>'semana')::date)::date,
      (SELECT x::uuid FROM jsonb_array_elements_text(it->'agendas') x LIMIT 1),
      ARRAY(SELECT x::uuid FROM jsonb_array_elements_text(it->'agendas') x),
      regexp_replace(it->>'telefone', '\D', '', 'g'),
      it->>'texto', 'whatsapp_auto', 'fila', now(), NULL, v_eu);
    v_ok := v_ok + 1;
  END LOOP;

  RETURN jsonb_build_object('enfileirados', v_ok, 'ignorados', v_ign,
    'na_fila', (SELECT count(*) FROM public.pacientes_fixos_envios WHERE status = 'fila'));
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_fixos_cancelar_fila(p_semana date DEFAULT NULL, p_paciente_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n int;
BEGIN
  IF NOT (public.is_admin() OR public.is_secretaria()) THEN
    RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501';
  END IF;
  UPDATE public.pacientes_fixos_envios
     SET status = 'cancelado', erro = 'Tirado da fila'
   WHERE status = 'fila'
     AND (p_semana IS NULL OR semana = date_trunc('week', p_semana)::date)
     AND (p_paciente_id IS NULL OR paciente_id = p_paciente_id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- Último envio do número (cobrança em lote OU link dos fixos) e total do dia
CREATE OR REPLACE FUNCTION public.fn_envio_ritmo_recepcao(OUT ultimo timestamptz, OUT hoje integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH hoje AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d)
  SELECT greatest(
           (SELECT max(proximo_retry) FROM public.webhook_queue
             WHERE evento = 'pagamento_link_criado' AND payload->'data'->>'pacing' = 'lote'
               AND proximo_retry <= now()),
           (SELECT max(tentado_em) FROM public.pacientes_fixos_envios WHERE tentado_em IS NOT NULL)),
         (SELECT count(*) FROM public.webhook_queue, hoje
           WHERE evento = 'pagamento_link_criado' AND payload->'data'->>'pacing' = 'lote'
             AND proximo_retry <= now()
             AND (proximo_retry AT TIME ZONE 'America/Sao_Paulo')::date = hoje.d)::int
         + (SELECT count(*) FROM public.pacientes_fixos_envios, hoje
             WHERE tentado_em IS NOT NULL
               AND (tentado_em AT TIME ZONE 'America/Sao_Paulo')::date = hoje.d)::int;
$$;

-- Motor das cobranças em lote passa a respeitar também os links dos fixos
CREATE OR REPLACE FUNCTION public.fn_liberar_envio_lote()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hora_brt int := extract(hour from (now() at time zone 'America/Sao_Paulo'))::int;
  v_ritmo record;
  v_gap_seg int;
  v_id uuid;
  TETO_DIARIO constant int := 80;
BEGIN
  -- Janela: só das 8h às 20h (Brasília). Fora disso, segura tudo.
  IF v_hora_brt < 8 OR v_hora_brt >= 20 THEN
    RETURN 0;
  END IF;

  -- Mesmo número da recepção: teto e intervalo somam cobranças + links dos fixos
  SELECT * INTO v_ritmo FROM public.fn_envio_ritmo_recepcao();
  IF v_ritmo.hoje >= TETO_DIARIO THEN
    RETURN 0;
  END IF;

  v_gap_seg := 300 + floor(random() * 240); -- 300-540s = 5-9 min
  IF v_ritmo.ultimo IS NOT NULL AND (now() - v_ritmo.ultimo) < make_interval(secs => v_gap_seg) THEN
    RETURN 0;
  END IF;

  SELECT id INTO v_id
  FROM webhook_queue
  WHERE evento = 'pagamento_link_criado'
    AND payload->'data'->>'pacing' = 'lote'
    AND status = 'pendente'
    AND proximo_retry > now()
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE webhook_queue SET proximo_retry = now() WHERE id = v_id;
  RETURN 1;
END;
$function$;

-- Motor dos links: confere respostas e solta UM envio por vez
CREATE OR REPLACE FUNCTION public.fn_fixos_liberar_envio()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hora_brt int := extract(hour from (now() AT TIME ZONE 'America/Sao_Paulo'))::int;
  v_ritmo record;
  v_gap_seg int;
  e public.pacientes_fixos_envios;
  v_tok text;
  v_num text;
  v_req bigint;
  r record;
  TETO_DIARIO constant int := 80;
BEGIN
  -- 1. Respostas da uazapi para quem estava enviando
  FOR r IN
    SELECT e2.id, e2.tentado_em, h.status_code, h.error_msg, left(h.content, 300) AS content
      FROM public.pacientes_fixos_envios e2
      LEFT JOIN net._http_response h ON h.id = e2.req_id
     WHERE e2.status = 'enviando'
  LOOP
    IF r.status_code BETWEEN 200 AND 299 THEN
      UPDATE public.pacientes_fixos_envios SET status = 'enviado', enviado_em = r.tentado_em, erro = NULL WHERE id = r.id;
    ELSIF r.status_code IS NOT NULL OR r.error_msg IS NOT NULL THEN
      UPDATE public.pacientes_fixos_envios
         SET status = 'falhou', erro = coalesce(r.error_msg, 'HTTP ' || r.status_code || ': ' || coalesce(r.content, ''))
       WHERE id = r.id;
    ELSIF r.tentado_em < now() - interval '10 minutes' THEN
      UPDATE public.pacientes_fixos_envios SET status = 'falhou', erro = 'Sem resposta do WhatsApp' WHERE id = r.id;
    END IF;
  END LOOP;

  -- 2. Janela, teto e intervalo (somados com as cobranças em lote)
  IF v_hora_brt < 8 OR v_hora_brt >= 20 THEN
    RETURN jsonb_build_object('acao', 'fora_da_janela');
  END IF;
  SELECT * INTO v_ritmo FROM public.fn_envio_ritmo_recepcao();
  IF v_ritmo.hoje >= TETO_DIARIO THEN
    RETURN jsonb_build_object('acao', 'teto_diario');
  END IF;
  v_gap_seg := 300 + floor(random() * 240);
  IF v_ritmo.ultimo IS NOT NULL AND (now() - v_ritmo.ultimo) < make_interval(secs => v_gap_seg) THEN
    RETURN jsonb_build_object('acao', 'aguardando_intervalo');
  END IF;

  -- 3. Próximo da fila; quem já marcou na semana não recebe
  LOOP
    SELECT * INTO e FROM public.pacientes_fixos_envios
     WHERE status = 'fila' ORDER BY fila_em, id LIMIT 1 FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('acao', 'fila_vazia');
    END IF;
    IF e.semana + 7 <= (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
      UPDATE public.pacientes_fixos_envios SET status = 'cancelado', erro = 'Semana já passou' WHERE id = e.id;
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM public.fn_paciente_fixo_sessoes(ARRAY[e.paciente_id]) s
                WHERE s.dh >= e.semana AND s.dh < e.semana + 7
                  AND s.status IN ('agendado', 'confirmado')) THEN
      UPDATE public.pacientes_fixos_envios SET status = 'cancelado', erro = 'Já marcou na semana' WHERE id = e.id;
      CONTINUE;
    END IF;
    EXIT;
  END LOOP;

  v_tok := public.fn_whatsapp_conexoes_credenciais() ->> 'whatsapp_uazapi_token';
  IF v_tok IS NULL THEN
    RETURN jsonb_build_object('acao', 'sem_token');
  END IF;

  v_num := regexp_replace(coalesce(e.telefone, ''), '\D', '', 'g');
  IF length(v_num) BETWEEN 10 AND 11 THEN
    v_num := '55' || v_num;
  END IF;
  IF length(v_num) < 12 THEN
    UPDATE public.pacientes_fixos_envios SET status = 'falhou', erro = 'Telefone inválido' WHERE id = e.id;
    RETURN jsonb_build_object('acao', 'telefone_invalido');
  END IF;

  v_req := net.http_post(
    url := 'https://infuse.uazapi.com/send/text',
    body := jsonb_build_object('number', v_num, 'text', e.texto),
    headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
    timeout_milliseconds := 20000);

  UPDATE public.pacientes_fixos_envios
     SET status = 'enviando', tentado_em = now(), req_id = v_req
   WHERE id = e.id;

  RETURN jsonb_build_object('acao', 'enviado', 'id', e.id);
END;
$$;

-- =============================================================================
-- 2. Lista da semana: envio com situação da fila
-- =============================================================================
CREATE OR REPLACE FUNCTION public.fn_pacientes_fixos_envios_semana(p_semana date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN NOT (public.is_admin() OR public.is_secretaria()) THEN '{}'::jsonb ELSE
    coalesce(jsonb_object_agg(x.paciente_id, x.envio), '{}'::jsonb) END
    FROM (
      SELECT DISTINCT ON (e.paciente_id) e.paciente_id,
             jsonb_build_object(
               'status', e.status,
               'canal', e.canal,
               'enviado_em', coalesce(e.enviado_em, e.tentado_em),
               'fila_em', e.fila_em,
               'erro', e.erro,
               'enviado_por_nome', p.nome,
               'agenda_id', e.agenda_id,
               'vezes', (SELECT count(*) FROM public.pacientes_fixos_envios e3
                          WHERE e3.paciente_id = e.paciente_id AND e3.semana = e.semana
                            AND e3.status = 'enviado')) AS envio
        FROM public.pacientes_fixos_envios e
        LEFT JOIN public.pessoas p ON p.id = e.enviado_por
       WHERE e.semana = date_trunc('week', p_semana)::date
       ORDER BY e.paciente_id, coalesce(e.enviado_em, e.tentado_em, e.fila_em) DESC NULLS LAST
    ) x;
$$;

-- =============================================================================
-- 3. Agendas públicas automáticas
-- =============================================================================
ALTER TABLE public.agendas_compartilhadas
  ADD COLUMN IF NOT EXISTS automatica boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.agenda_publica_auto (
  profissional_id uuid PRIMARY KEY REFERENCES public.pessoas(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT true,
  semanas integer NOT NULL DEFAULT 4 CHECK (semanas BETWEEN 1 AND 8),
  atualizado_por uuid REFERENCES public.pessoas(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agenda_publica_auto ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agenda_publica_auto_select ON public.agenda_publica_auto;
CREATE POLICY agenda_publica_auto_select ON public.agenda_publica_auto
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()) OR (SELECT public.is_secretaria()) OR (SELECT public.is_profissional()));
REVOKE ALL ON public.agenda_publica_auto FROM anon;
GRANT SELECT ON public.agenda_publica_auto TO authenticated;

-- Hoje a agenda pública é só da Bruna, da Flávia e da Beatriz
INSERT INTO public.agenda_publica_auto (profissional_id, ativo, semanas)
SELECT id, true, 4 FROM public.pessoas
 WHERE id IN ('c4883f76-d010-4fb4-ac5b-248914e56e6e',  -- Bruna
              '2b1da16a-4294-47c0-b8c1-3f1595590332',  -- Flávia
              'b3e954bf-02dd-4821-aa58-aa4fb34c3e02')  -- Beatriz
ON CONFLICT (profissional_id) DO NOTHING;

-- Cria a agenda (sem checar permissão: uso interno do sistema)
CREATE OR REPLACE FUNCTION public.fn_agenda_publica_criar_interna(
  p_profissional_id uuid,
  p_slots timestamp[],
  p_titulo text DEFAULT NULL,
  p_criado_por uuid DEFAULT NULL,
  p_automatica boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_padrao jsonb;
  v_slots timestamp[];
  v_agenda uuid;
  v_token text;
  v_prof_nome text;
  v_titulo text;
  v_de date; v_ate date;
  v_meses text[] := ARRAY['janeiro','fevereiro','março','abril','maio','junho','julho',
                          'agosto','setembro','outubro','novembro','dezembro'];
BEGIN
  SELECT array_agg(DISTINCT s ORDER BY s) INTO v_slots FROM unnest(p_slots) s;
  IF coalesce(array_length(v_slots, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Escolha pelo menos um horário';
  END IF;

  v_padrao := public.fn_fixos_agenda_padrao(p_profissional_id);
  IF jsonb_array_length(v_padrao->'servicos') = 0 OR jsonb_array_length(v_padrao->'empresas') = 0 THEN
    RAISE EXCEPTION 'Sem agenda anterior desta profissional para copiar serviço e empresa. Crie a primeira pela Agenda.';
  END IF;

  SELECT nome INTO v_prof_nome FROM public.pessoas WHERE id = p_profissional_id;
  v_de := v_slots[1]::date;
  v_ate := v_slots[array_length(v_slots, 1)]::date;
  v_titulo := coalesce(nullif(trim(p_titulo), ''),
    'Agenda motora ' || split_part(v_prof_nome, ' ', 1) || ' '
      || to_char(v_de, 'DD') || ' a ' || to_char(v_ate, 'DD') || ' de '
      || v_meses[extract(month FROM v_ate)::int]);

  LOOP
    v_token := substr(translate(encode(extensions.gen_random_bytes(12), 'base64'), '+/=', '-_'), 1, 10);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.agendas_compartilhadas WHERE token = v_token);
  END LOOP;

  INSERT INTO public.agendas_compartilhadas (profissional_id, token, titulo, data_inicio, data_fim, criado_por, automatica)
  VALUES (p_profissional_id, v_token, v_titulo, v_de, v_ate, p_criado_por, p_automatica)
  RETURNING id INTO v_agenda;

  INSERT INTO public.agenda_servicos (agenda_id, tipo_servico_id)
  SELECT v_agenda, (x->>'id')::uuid FROM jsonb_array_elements(v_padrao->'servicos') x;
  INSERT INTO public.agenda_locais (agenda_id, local_id)
  SELECT v_agenda, (x->>'id')::uuid FROM jsonb_array_elements(v_padrao->'locais') x;
  INSERT INTO public.agenda_empresas (agenda_id, empresa_id)
  SELECT v_agenda, (x->>'id')::uuid FROM jsonb_array_elements(v_padrao->'empresas') x;
  INSERT INTO public.agenda_slots (agenda_id, data_hora)
  SELECT v_agenda, s AT TIME ZONE 'UTC' FROM unnest(v_slots) s;

  RETURN jsonb_build_object('ok', true, 'agenda_id', v_agenda, 'token', v_token,
                            'titulo', v_titulo, 'slots', array_length(v_slots, 1));
END;
$$;

-- Botão "Criar agenda" da tela de fixos (agora usa a criação interna)
CREATE OR REPLACE FUNCTION public.fn_fixos_criar_agenda(
  p_profissional_id uuid,
  p_semana date,
  p_horarios text[],
  p_titulo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ini date := date_trunc('week', p_semana)::date;
  v_slots timestamp[];
  v_ocupados text[];
  v_duracao int;
BEGIN
  IF NOT (public.is_admin() OR public.is_secretaria()) THEN
    RAISE EXCEPTION 'Sem permissão para criar agenda' USING ERRCODE = '42501';
  END IF;
  SELECT array_agg(DISTINCT h::timestamp ORDER BY h::timestamp) INTO v_slots FROM unnest(p_horarios) h;
  IF coalesce(array_length(v_slots, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Escolha pelo menos um horário';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_slots) s WHERE s::date < v_ini OR s::date > v_ini + 6) THEN
    RAISE EXCEPTION 'Há horário fora da semana escolhida';
  END IF;

  v_duracao := coalesce(nullif((public.fn_fixos_agenda_padrao(p_profissional_id)->'servicos'->0->>'duracao_minutos')::int, 0), 60);
  SELECT array_agg(to_char(s, 'DD/MM HH24:MI')) INTO v_ocupados
    FROM unnest(v_slots) s
   WHERE NOT public.fn_agenda_expressa_slot_livre(p_profissional_id, s AT TIME ZONE 'UTC', v_duracao, false);
  IF v_ocupados IS NOT NULL THEN
    RAISE EXCEPTION 'Horários que acabaram de ser ocupados: %', array_to_string(v_ocupados, ', ')
      USING HINT = 'horario_ocupado';
  END IF;

  RETURN public.fn_agenda_publica_criar_interna(p_profissional_id, v_slots, p_titulo,
                                                public.get_current_pessoa_id(), false);
END;
$$;

-- Horários da agenda automática de uma semana: o padrão (dia da semana + hora)
-- das últimas 3 agendas públicas de fisioterapia da profissional. Sem nenhuma
-- agenda anterior, a grade do histórico de consultas (seg-sex, dias em que ela
-- atende, horas com 2+ consultas em 120 dias, minuto mais comum).
CREATE OR REPLACE FUNCTION public.fn_agenda_publica_horarios_padrao(p_profissional_id uuid, p_semana date)
RETURNS timestamp[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ini date := date_trunc('week', p_semana)::date;
  v_agora timestamp := now() AT TIME ZONE 'America/Sao_Paulo';
  v_duracao int;
  v_minuto int;
  v_cand timestamp[];
  v_res timestamp[];
BEGIN
  v_duracao := coalesce(nullif((public.fn_fixos_agenda_padrao(p_profissional_id)->'servicos'->0->>'duracao_minutos')::int, 0), 60);

  -- 1. Padrão das últimas agendas públicas de fisioterapia dela
  WITH ult AS (
    SELECT ac.id FROM public.agendas_compartilhadas ac
     WHERE ac.profissional_id = p_profissional_id
       AND EXISTS (SELECT 1 FROM public.agenda_servicos s JOIN public.tipo_servicos ts ON ts.id = s.tipo_servico_id
                    WHERE s.agenda_id = ac.id AND ts.nome ~* 'motor' AND ts.nome !~* 'avalia')
     ORDER BY ac.created_at DESC LIMIT 3
  ), padrao AS (
    SELECT DISTINCT extract(isodow FROM s.data_hora AT TIME ZONE 'UTC')::int AS dow,
                    (s.data_hora AT TIME ZONE 'UTC')::time AS hora
      FROM public.agenda_slots s JOIN ult ON ult.id = s.agenda_id
     WHERE s.deleted_at IS NULL
  )
  SELECT array_agg((v_ini + (p.dow - 1)) + p.hora) INTO v_cand FROM padrao p;

  -- 2. Sem padrão: grade do histórico de consultas
  IF v_cand IS NULL THEN
    SELECT extract(minute FROM a.data_hora AT TIME ZONE 'UTC')::int INTO v_minuto
      FROM public.agendamentos a
     WHERE a.profissional_id = p_profissional_id AND a.ativo AND a.data_hora > now() - interval '120 days'
     GROUP BY 1 ORDER BY count(*) DESC LIMIT 1;

    WITH hist AS (
      SELECT extract(isodow FROM a.data_hora AT TIME ZONE 'UTC')::int AS dow,
             extract(hour FROM a.data_hora AT TIME ZONE 'UTC')::int AS h,
             (a.data_hora AT TIME ZONE 'UTC')::date AS dia
        FROM public.agendamentos a
       WHERE a.profissional_id = p_profissional_id AND a.ativo
         AND a.data_hora > now() - interval '120 days'
    ), dias AS (
      SELECT dow FROM hist WHERE dow BETWEEN 1 AND 5 GROUP BY dow HAVING count(DISTINCT dia) >= 6
    ), horas AS (
      SELECT hist.dow, hist.h FROM hist JOIN dias USING (dow) GROUP BY hist.dow, hist.h HAVING count(*) >= 2
    )
    SELECT array_agg((v_ini + (dow - 1)) + make_time(h, coalesce(v_minuto, 0), 0)) INTO v_cand FROM horas;
  END IF;

  SELECT array_agg(c ORDER BY c) INTO v_res
    FROM unnest(coalesce(v_cand, '{}'::timestamp[])) c
   WHERE c > v_agora + interval '2 hours'
     AND NOT EXISTS (SELECT 1 FROM public.followup_feriados f WHERE f.dia = c::date)
     AND public.fn_agenda_expressa_slot_livre(p_profissional_id, c AT TIME ZONE 'UTC', v_duracao, false);
  RETURN v_res;
END;
$$;

-- Garante N semanas de agenda aberta para cada profissional configurada.
-- Roda todo dia às 6h (Brasília). A semana que já passou expira.
-- Semana com qualquer agenda da profissional (ativa ou desativada à mão)
-- não ganha outra.
CREATE OR REPLACE FUNCTION public.fn_agendas_publicas_garantir(p_profissional_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_seg date := date_trunc('week', (now() AT TIME ZONE 'America/Sao_Paulo')::date)::date;
  c record;
  w int;
  v_sem date;
  v_slots timestamp[];
  v_res jsonb;
  v_criadas jsonb := '[]'::jsonb;
  v_puladas jsonb := '[]'::jsonb;
BEGIN
  -- Pelo app, só admin/secretaria; pelo cron (sem usuário), sempre
  IF auth.uid() IS NOT NULL AND NOT (public.is_admin() OR public.is_secretaria()) THEN
    RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501';
  END IF;

  UPDATE public.agendas_compartilhadas SET ativo = false, updated_at = now()
   WHERE ativo AND data_fim < v_hoje;

  FOR c IN
    SELECT a.profissional_id, a.semanas, p.nome
      FROM public.agenda_publica_auto a JOIN public.pessoas p ON p.id = a.profissional_id
     WHERE a.ativo AND p.ativo
       AND (p_profissional_id IS NULL OR a.profissional_id = p_profissional_id)
  LOOP
    FOR w IN 0 .. c.semanas - 1 LOOP
      v_sem := v_seg + 7 * w;
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.agendas_compartilhadas ac
         WHERE ac.profissional_id = c.profissional_id
           AND ac.data_inicio <= v_sem + 6 AND ac.data_fim >= v_sem
           AND (ac.ativo OR ac.data_fim >= v_hoje)
           -- só conta agenda de fisioterapia (avaliação/teste não ocupa a semana)
           AND EXISTS (SELECT 1 FROM public.agenda_servicos s JOIN public.tipo_servicos ts ON ts.id = s.tipo_servico_id
                        WHERE s.agenda_id = ac.id AND ts.nome ~* 'motor' AND ts.nome !~* 'avalia'));
      -- Semana corrente quase no fim (sábado/domingo) não ganha agenda nova
      CONTINUE WHEN w = 0 AND extract(isodow FROM v_hoje) >= 6;

      v_slots := public.fn_agenda_publica_horarios_padrao(c.profissional_id, v_sem);
      IF coalesce(array_length(v_slots, 1), 0) = 0 THEN
        v_puladas := v_puladas || jsonb_build_object('profissional', c.nome, 'semana', v_sem, 'motivo', 'sem horário livre');
        CONTINUE;
      END IF;
      BEGIN
        v_res := public.fn_agenda_publica_criar_interna(c.profissional_id, v_slots, NULL,
                   CASE WHEN auth.uid() IS NOT NULL THEN public.get_current_pessoa_id() END, true);
        v_criadas := v_criadas || jsonb_build_object('profissional', c.nome, 'semana', v_sem,
                                                     'titulo', v_res->>'titulo', 'slots', v_res->'slots');
      EXCEPTION WHEN OTHERS THEN
        v_puladas := v_puladas || jsonb_build_object('profissional', c.nome, 'semana', v_sem, 'motivo', SQLERRM);
      END;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('criadas', v_criadas, 'puladas', v_puladas);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_agenda_publica_auto_salvar(
  p_profissional_id uuid,
  p_ativo boolean,
  p_semanas integer DEFAULT 4
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.is_secretaria()) THEN
    RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.agenda_publica_auto (profissional_id, ativo, semanas, atualizado_por, updated_at)
  VALUES (p_profissional_id, p_ativo, greatest(1, least(coalesce(p_semanas, 4), 8)), public.get_current_pessoa_id(), now())
  ON CONFLICT (profissional_id) DO UPDATE
    SET ativo = EXCLUDED.ativo, semanas = EXCLUDED.semanas,
        atualizado_por = EXCLUDED.atualizado_por, updated_at = now();
END;
$$;

-- =============================================================================
-- 4. Cron
-- =============================================================================
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('liberar-envio-fixos', 'agendas-publicas-garantir');
END $$;
SELECT cron.schedule('liberar-envio-fixos', '* * * * *', $$SELECT public.fn_fixos_liberar_envio();$$);
SELECT cron.schedule('agendas-publicas-garantir', '0 9 * * *', $$SELECT public.fn_agendas_publicas_garantir();$$);

-- =============================================================================
-- 5. Permissões
-- =============================================================================
REVOKE ALL ON FUNCTION public.fn_fixos_enfileirar_envios(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_fixos_cancelar_fila(date, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_envio_ritmo_recepcao() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_liberar_envio_lote() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_fixos_liberar_envio() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_pacientes_fixos_envios_semana(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_agenda_publica_criar_interna(uuid, timestamp[], text, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_fixos_criar_agenda(uuid, date, text[], text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_agenda_publica_horarios_padrao(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_agendas_publicas_garantir(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_agenda_publica_auto_salvar(uuid, boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.fn_fixos_enfileirar_envios(jsonb),
  public.fn_fixos_cancelar_fila(date, uuid),
  public.fn_pacientes_fixos_envios_semana(date),
  public.fn_fixos_criar_agenda(uuid, date, text[], text),
  public.fn_agendas_publicas_garantir(uuid),
  public.fn_agenda_publica_auto_salvar(uuid, boolean, integer)
TO authenticated;
