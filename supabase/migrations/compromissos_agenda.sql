-- Compromissos na agenda (evolução do "Bloquear agenda"). Pedido do dono em 23/10/2026.
--
-- FUSO: a partir daqui agenda_bloqueios.inicio/fim seguem a MESMA convenção de
-- agendamentos.data_hora: HORA DE PAREDE gravada como UTC (14h = 14:00+00).
-- Antes o app gravava o instante real (toISOString), e o banco aplicava o bloqueio 3h
-- depois. Nunca usar toISOString()/AT TIME ZONE 'America/Sao_Paulo' em compromisso.
--
-- Regras novas:
--  * titulo livre; motivo continua sendo a CATEGORIA (+ 'saude').
--  * privado: título/observação só para admin, dono (profissional_id) e quem criou.
--  * impede_agendamento=false: compromisso só informativo, não ocupa a agenda.
--  * conflito com consulta agendada/confirmada (sobreposição real) é recusado; admin,
--    secretária e serviço (Ju) podem forçar mandando conflito_aceito_em.
--  * slots públicos fechados por um bloqueio reabrem quando ele sai/encolhe.

-- ------------------------------------------------------------------
-- 0. Converte as linhas existentes para hora de parede (só uma vez:
--    roda antes de a coluna titulo existir).
-- ------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agenda_bloqueios' AND column_name = 'titulo'
  ) THEN
    UPDATE public.agenda_bloqueios
    SET inicio = (inicio AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC',
        fim    = (fim    AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC';
  END IF;
END $$;

-- ------------------------------------------------------------------
-- 1. Colunas novas
-- ------------------------------------------------------------------
ALTER TABLE public.agenda_bloqueios
  ADD COLUMN IF NOT EXISTS titulo              text,
  ADD COLUMN IF NOT EXISTS privado             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS impede_agendamento  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS conflito_aceito_por uuid REFERENCES public.pessoas(id),
  ADD COLUMN IF NOT EXISTS conflito_aceito_em  timestamptz;

ALTER TABLE public.agenda_bloqueios DROP CONSTRAINT IF EXISTS chk_bloqueio_titulo;
ALTER TABLE public.agenda_bloqueios
  ADD CONSTRAINT chk_bloqueio_titulo CHECK (titulo IS NULL OR char_length(titulo) <= 120);

COMMENT ON TABLE public.agenda_bloqueios IS
  'Compromissos/indisponibilidades da agenda. inicio/fim em HORA DE PAREDE (14h = 14:00+00), igual agendamentos.data_hora. profissional_id NULL = clínica inteira. motivo = categoria. Recorrência materializada em linhas agrupadas por recorrencia_id.';
COMMENT ON COLUMN public.agenda_bloqueios.privado IS
  'Título e observação visíveis só para admin, o profissional dono e quem criou. Os demais veem "Indisponível".';
COMMENT ON COLUMN public.agenda_bloqueios.impede_agendamento IS
  'false = compromisso informativo: aparece na agenda mas não ocupa o horário.';
COMMENT ON COLUMN public.agenda_bloqueios.conflito_aceito_em IS
  'Preenchido quando admin/secretária/Ju registrou o compromisso por cima de consulta marcada.';

-- Slot público fechado por um bloqueio guarda o id (sem FK: precisa sobreviver ao
-- DELETE do bloqueio até o gatilho reabrir o slot).
ALTER TABLE public.agenda_slots
  ADD COLUMN IF NOT EXISTS fechado_por_bloqueio uuid;
CREATE INDEX IF NOT EXISTS idx_agenda_slots_fechado_por_bloqueio
  ON public.agenda_slots (fechado_por_bloqueio) WHERE fechado_por_bloqueio IS NOT NULL;

-- ------------------------------------------------------------------
-- 2. Disponibilidade: só bloqueios que impedem agendamento
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_horario_disponivel(
  p_profissional_id uuid,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_ignorar_agendamento_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT (
    EXISTS (
      SELECT 1
      FROM public.agendamentos a
      JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
      WHERE a.profissional_id = p_profissional_id
        AND a.ativo = true
        AND cs.codigo IN ('agendado','confirmado')
        AND tstzrange(a.data_hora, a.data_hora + interval '20 minutes')
            && tstzrange(p_inicio, p_inicio + interval '20 minutes')
        AND (p_ignorar_agendamento_id IS NULL OR a.id <> p_ignorar_agendamento_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.agenda_bloqueios b
      WHERE b.ativo = true
        AND b.deleted_at IS NULL
        AND b.impede_agendamento
        AND (b.profissional_id IS NULL OR b.profissional_id = p_profissional_id)
        AND b.periodo && tstzrange(p_inicio, p_fim)
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.fn_valida_bloqueio_agendamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ocupante boolean;
  v_fim timestamptz;
BEGIN
  SELECT (NEW.ativo AND cs.codigo IN ('agendado','confirmado'))
    INTO v_ocupante
  FROM consulta_status cs WHERE cs.id = NEW.status_consulta_id;

  IF NOT COALESCE(v_ocupante, false) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.data_hora        IS NOT DISTINCT FROM OLD.data_hora
     AND NEW.profissional_id  IS NOT DISTINCT FROM OLD.profissional_id
     AND NEW.tipo_servico_id  IS NOT DISTINCT FROM OLD.tipo_servico_id THEN
    RETURN NEW;
  END IF;

  SELECT NEW.data_hora + make_interval(mins => greatest(coalesce(ts.duracao_minutos, 0), 20))
    INTO v_fim
  FROM tipo_servicos ts WHERE ts.id = NEW.tipo_servico_id;
  v_fim := coalesce(v_fim, NEW.data_hora + interval '20 minutes');

  PERFORM 1
  FROM agenda_bloqueios b
  WHERE b.ativo = true
    AND b.deleted_at IS NULL
    AND b.impede_agendamento
    AND (b.profissional_id IS NULL OR b.profissional_id = NEW.profissional_id)
    AND b.periodo && tstzrange(NEW.data_hora, v_fim)
  LIMIT 1;

  IF FOUND THEN
    -- Mensagem genérica de propósito: pode chegar ao link público e o título pode ser privado.
    RAISE EXCEPTION 'Horário indisponível: bloqueio de agenda (compromisso) nesse período.'
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------
-- 3. Compromisso por cima de consulta marcada
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_valida_conflito_compromisso()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eu        uuid := public.get_current_pessoa_id();
  v_n         integer;
  v_primeira  text;
  v_aceito    boolean;
BEGIN
  IF TG_OP = 'INSERT' AND v_eu IS NOT NULL THEN
    NEW.criado_por := v_eu;
  END IF;

  IF NOT (NEW.ativo AND NEW.deleted_at IS NULL AND NEW.impede_agendamento) THEN
    RETURN NEW;
  END IF;

  -- Update que não muda a ocupação (título, observação, privado...) não reavalia.
  IF TG_OP = 'UPDATE'
     AND OLD.ativo AND OLD.deleted_at IS NULL AND OLD.impede_agendamento
     AND NEW.inicio = OLD.inicio AND NEW.fim = OLD.fim
     AND NEW.profissional_id IS NOT DISTINCT FROM OLD.profissional_id THEN
    RETURN NEW;
  END IF;

  SELECT count(*), min(to_char(a.data_hora AT TIME ZONE 'UTC', 'DD/MM HH24:MI'))
    INTO v_n, v_primeira
  FROM public.agendamentos a
  JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
  WHERE a.ativo
    AND cs.codigo IN ('agendado', 'confirmado')
    AND (NEW.profissional_id IS NULL OR a.profissional_id = NEW.profissional_id)
    AND tstzrange(a.data_hora, a.data_hora + make_interval(mins => greatest(coalesce(a.duracao_minutos, 0), 20)))
        && tstzrange(NEW.inicio, NEW.fim);

  IF v_n = 0 THEN
    NEW.conflito_aceito_em := NULL;
    NEW.conflito_aceito_por := NULL;
    RETURN NEW;
  END IF;

  -- No UPDATE o aceite precisa ser renovado (mover um compromisso exige novo aceite).
  v_aceito := NEW.conflito_aceito_em IS NOT NULL
              AND (TG_OP = 'INSERT' OR NEW.conflito_aceito_em IS DISTINCT FROM OLD.conflito_aceito_em);

  IF NOT v_aceito THEN
    RAISE EXCEPTION 'Conflito: % consulta(s) marcada(s) nesse horário (a primeira em %).', v_n, v_primeira
      USING ERRCODE = 'P0001', HINT = 'compromisso_conflito';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT (public.is_admin() OR public.is_secretaria()) THEN
    RAISE EXCEPTION 'Só admin ou secretária podem registrar um compromisso por cima de consulta marcada.'
      USING ERRCODE = 'P0001', HINT = 'compromisso_conflito_sem_permissao';
  END IF;

  IF v_eu IS NOT NULL THEN
    NEW.conflito_aceito_por := v_eu;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_valida_conflito_compromisso ON public.agenda_bloqueios;
CREATE TRIGGER trg_valida_conflito_compromisso
  BEFORE INSERT OR UPDATE ON public.agenda_bloqueios
  FOR EACH ROW EXECUTE FUNCTION public.fn_valida_conflito_compromisso();

-- ------------------------------------------------------------------
-- 4. Slots públicos: fechar, reabrir e nascer fechado
-- ------------------------------------------------------------------
-- Reavalia os slots que o bloqueio p_id fechou: passa para outro bloqueio que ainda cubra,
-- continua fechado se houver consulta, ou reabre (só futuro).
CREATE OR REPLACE FUNCTION public.fn_recalcula_slots_fechados_por(p_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH alvo AS (
    SELECT s.id, s.data_hora, a.profissional_id
    FROM public.agenda_slots s
    JOIN public.agendas_compartilhadas a ON a.id = s.agenda_id
    WHERE s.fechado_por_bloqueio = p_id
      AND s.deleted_at IS NULL
  ), calc AS (
    SELECT t.id, t.data_hora,
      (SELECT b.id FROM public.agenda_bloqueios b
        WHERE b.ativo AND b.deleted_at IS NULL AND b.impede_agendamento
          AND (b.profissional_id IS NULL OR b.profissional_id = t.profissional_id)
          AND t.data_hora >= b.inicio AND t.data_hora < b.fim
        ORDER BY (b.id = p_id) DESC
        LIMIT 1) AS cobre,
      EXISTS (SELECT 1 FROM public.agendamentos ag
        JOIN public.consulta_status cs ON cs.id = ag.status_consulta_id
        WHERE ag.ativo AND ag.profissional_id = t.profissional_id
          AND cs.codigo IN ('agendado', 'confirmado')
          AND ag.janela_reserva && tstzrange(t.data_hora, t.data_hora + interval '20 minutes')) AS ocupado
    FROM alvo t
  )
  UPDATE public.agenda_slots s
  SET fechado_por_bloqueio = c.cobre,
      disponivel = (c.cobre IS NULL AND NOT c.ocupado
                    AND c.data_hora > ((now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC')),
      updated_at = now()
  FROM calc c
  WHERE s.id = c.id;
$$;

CREATE OR REPLACE FUNCTION public.fn_bloqueio_sincroniza_slots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'DELETE' AND NEW.ativo AND NEW.deleted_at IS NULL AND NEW.impede_agendamento THEN
    UPDATE agenda_slots s
    SET disponivel = false, fechado_por_bloqueio = NEW.id, updated_at = now()
    FROM agendas_compartilhadas a
    WHERE s.agenda_id = a.id
      AND a.ativo = true
      AND s.disponivel = true
      AND s.deleted_at IS NULL
      AND (NEW.profissional_id IS NULL OR a.profissional_id = NEW.profissional_id)
      AND s.data_hora >= NEW.inicio
      AND s.data_hora <  NEW.fim;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.fn_recalcula_slots_fechados_por(OLD.id);
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloqueio_sincroniza_slots ON public.agenda_bloqueios;
CREATE TRIGGER trg_bloqueio_sincroniza_slots
  AFTER INSERT OR UPDATE OF inicio, fim, profissional_id, ativo, deleted_at, impede_agendamento OR DELETE
  ON public.agenda_bloqueios
  FOR EACH ROW EXECUTE FUNCTION public.fn_bloqueio_sincroniza_slots();

-- Slot criado dentro de um bloqueio já nasce fechado.
CREATE OR REPLACE FUNCTION public.fn_slot_respeita_bloqueio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bloq uuid;
BEGIN
  IF NOT NEW.disponivel THEN
    RETURN NEW;
  END IF;
  SELECT b.id INTO v_bloq
  FROM agendas_compartilhadas a
  JOIN agenda_bloqueios b
    ON b.ativo AND b.deleted_at IS NULL AND b.impede_agendamento
   AND (b.profissional_id IS NULL OR b.profissional_id = a.profissional_id)
  WHERE a.id = NEW.agenda_id
    AND NEW.data_hora >= b.inicio AND NEW.data_hora < b.fim
  LIMIT 1;
  IF v_bloq IS NOT NULL THEN
    NEW.disponivel := false;
    NEW.fechado_por_bloqueio := v_bloq;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_slot_respeita_bloqueio ON public.agenda_slots;
CREATE TRIGGER trg_slot_respeita_bloqueio
  BEFORE INSERT ON public.agenda_slots
  FOR EACH ROW EXECUTE FUNCTION public.fn_slot_respeita_bloqueio();

-- ------------------------------------------------------------------
-- 5. RLS: privado só para admin, dono e quem criou
-- ------------------------------------------------------------------
DROP POLICY IF EXISTS bloqueios_staff_select ON public.agenda_bloqueios;
CREATE POLICY bloqueios_staff_select ON public.agenda_bloqueios
  FOR SELECT TO authenticated
  USING (
    is_authorized_staff() AND (
      NOT privado
      OR profissional_id = (SELECT get_current_pessoa_id())
      OR criado_por = (SELECT get_current_pessoa_id())
    )
  );

DROP POLICY IF EXISTS bloqueios_secretaria_modify ON public.agenda_bloqueios;
CREATE POLICY bloqueios_secretaria_modify ON public.agenda_bloqueios
  FOR ALL TO authenticated
  USING (
    is_secretaria()
    AND (NOT privado OR criado_por = (SELECT get_current_pessoa_id()))
    AND (
      profissional_id IS NULL
      OR profissional_id IN (
        SELECT pa.id_profissional FROM public.permissoes_agendamento pa
        WHERE pa.id_secretaria = (SELECT get_current_pessoa_id()) AND pa.ativo = true
      )
    )
  )
  WITH CHECK (
    is_secretaria() AND (
      profissional_id IS NULL
      OR profissional_id IN (
        SELECT pa.id_profissional FROM public.permissoes_agendamento pa
        WHERE pa.id_secretaria = (SELECT get_current_pessoa_id()) AND pa.ativo = true
      )
    )
  );

-- ------------------------------------------------------------------
-- 6. Leitura para o calendário (mascara privados, diz quem pode editar)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_agenda_compromissos(
  p_inicio timestamptz,
  p_fim timestamptz,
  p_profissional_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  profissional_id uuid,
  profissional_nome text,
  inicio timestamptz,
  fim timestamptz,
  dia_inteiro boolean,
  categoria text,
  titulo text,
  observacao text,
  privado boolean,
  mascarado boolean,
  impede_agendamento boolean,
  recorrencia_id uuid,
  criado_por uuid,
  pode_editar boolean,
  conflitos integer,
  conflito_aceito_em timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eu    uuid    := public.get_current_pessoa_id();
  v_admin boolean := public.is_admin();
  v_sec   boolean := public.is_secretaria();
  v_prof  boolean := public.is_profissional();
BEGIN
  IF NOT (v_admin OR v_sec OR v_prof) THEN
    RAISE EXCEPTION 'Sem permissão para ver compromissos' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH escopo AS (
    SELECT b.*
    FROM public.agenda_bloqueios b
    WHERE b.ativo AND b.deleted_at IS NULL
      AND b.fim > p_inicio AND b.inicio < p_fim
      AND (p_profissional_id IS NULL OR b.profissional_id IS NULL OR b.profissional_id = p_profissional_id)
      AND (
        v_admin
        OR b.profissional_id IS NULL
        OR b.profissional_id = v_eu
        OR b.criado_por = v_eu
        OR (v_sec AND b.profissional_id IN (
              SELECT pa.id_profissional FROM public.permissoes_agendamento pa
              WHERE pa.id_secretaria = v_eu AND pa.ativo))
      )
  )
  SELECT e.id, e.profissional_id, p.nome::text, e.inicio, e.fim, e.dia_inteiro,
         CASE WHEN m.mask THEN NULL ELSE e.motivo END,
         CASE WHEN m.mask THEN NULL ELSE e.titulo END,
         CASE WHEN m.mask THEN NULL ELSE e.observacao END,
         e.privado, m.mask, e.impede_agendamento, e.recorrencia_id, e.criado_por,
         coalesce(v_admin OR e.profissional_id = v_eu OR e.criado_por = v_eu OR (v_sec AND NOT m.mask), false),
         CASE WHEN e.impede_agendamento THEN (
           SELECT count(*)::integer
           FROM public.agendamentos a
           JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
           WHERE a.ativo AND cs.codigo IN ('agendado', 'confirmado')
             AND (e.profissional_id IS NULL OR a.profissional_id = e.profissional_id)
             AND tstzrange(a.data_hora, a.data_hora + make_interval(mins => greatest(coalesce(a.duracao_minutos, 0), 20)))
                 && tstzrange(e.inicio, e.fim)
         ) ELSE 0 END,
         e.conflito_aceito_em
  FROM escopo e
  LEFT JOIN public.pessoas p ON p.id = e.profissional_id
  CROSS JOIN LATERAL (
    -- coalesce: criado_por/profissional_id nulos não podem "desmascarar" (NULL ≠ false)
    SELECT (e.privado AND NOT coalesce(v_admin OR e.profissional_id = v_eu OR e.criado_por = v_eu, false)) AS mask
  ) m
  ORDER BY e.inicio;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_agenda_compromissos(timestamptz, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_agenda_compromissos(timestamptz, timestamptz, uuid) TO authenticated;

-- Prévia de conflito antes de salvar: consultas agendadas/confirmadas que se sobrepõem
-- a qualquer ocorrência. p_intervalos = [{"inicio": "...+00", "fim": "...+00"}, ...]
CREATE OR REPLACE FUNCTION public.fn_compromisso_conflitos(
  p_profissional_id uuid,
  p_intervalos jsonb
)
RETURNS TABLE (
  agendamento_id uuid,
  data_hora timestamptz,
  fim timestamptz,
  paciente_nome text,
  profissional_nome text,
  servico_nome text,
  sobreposicao_inicio timestamptz,
  sobreposicao_fim timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_authorized_staff() THEN
    RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_intervalos) <> 'array' OR jsonb_array_length(p_intervalos) > 1000 THEN
    RAISE EXCEPTION 'Intervalos inválidos' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH i AS (
    SELECT (x ->> 'inicio')::timestamptz AS ini, (x ->> 'fim')::timestamptz AS fi
    FROM jsonb_array_elements(p_intervalos) x
  ), a AS (
    SELECT ag.id, ag.data_hora, ag.paciente_id, ag.profissional_id, ag.tipo_servico_id,
           ag.data_hora + make_interval(mins => greatest(coalesce(ag.duracao_minutos, 0), 20)) AS fim
    FROM public.agendamentos ag
    JOIN public.consulta_status cs ON cs.id = ag.status_consulta_id
    WHERE ag.ativo AND cs.codigo IN ('agendado', 'confirmado')
      AND (p_profissional_id IS NULL OR ag.profissional_id = p_profissional_id)
      AND ag.data_hora < (SELECT max(fi) FROM i)
      AND ag.data_hora > (SELECT min(ini) FROM i) - interval '1 day'
  )
  SELECT DISTINCT ON (a.id)
         a.id, a.data_hora, a.fim, pac.nome::text, prof.nome::text, ts.nome::text,
         greatest(a.data_hora, i.ini), least(a.fim, i.fi)
  FROM a
  JOIN i ON tstzrange(a.data_hora, a.fim) && tstzrange(i.ini, i.fi)
  LEFT JOIN public.pessoas pac ON pac.id = a.paciente_id
  LEFT JOIN public.pessoas prof ON prof.id = a.profissional_id
  LEFT JOIN public.tipo_servicos ts ON ts.id = a.tipo_servico_id
  ORDER BY a.id, a.data_hora;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_compromisso_conflitos(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_compromisso_conflitos(uuid, jsonb) TO authenticated;

-- ------------------------------------------------------------------
-- 7. Ju (grupo da agenda): hora de parede, sobreposição real, título
-- ------------------------------------------------------------------
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

  -- consultas já marcadas dentro do bloqueio (o bloqueio não desmarca ninguém; a Ju avisa)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'quando', to_char(a.data_hora AT TIME ZONE 'UTC', 'DD/MM HH24:MI'),
           'paciente', pac.nome, 'profissional', prof.nome, 'status', cs.codigo)
         ORDER BY a.data_hora), '[]'::jsonb)
  INTO v_conf
  FROM public.agendamentos a
  JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
  LEFT JOIN public.pessoas pac ON pac.id = a.paciente_id
  LEFT JOIN public.pessoas prof ON prof.id = a.profissional_id
  WHERE a.ativo AND cs.codigo IN ('agendado', 'confirmado')
    AND (v_prof_id IS NULL OR a.profissional_id = v_prof_id)
    AND EXISTS (SELECT 1 FROM unnest(v_janelas) j
                WHERE tsrange(a.data_hora AT TIME ZONE 'UTC',
                              (a.data_hora AT TIME ZONE 'UTC') + make_interval(mins => greatest(coalesce(a.duracao_minutos, 0), 20)))
                      && j);

  INSERT INTO public.agenda_bloqueios (profissional_id, inicio, fim, dia_inteiro, motivo, titulo, observacao,
                                       recorrencia_id, conflito_aceito_em)
  SELECT v_prof_id,
         lower(j) AT TIME ZONE 'UTC',
         upper(j) AT TIME ZONE 'UTC',
         v_inteiro,
         public.fn_ju_motivo_bloqueio(p_motivo),
         left(nullif(trim(coalesce(p_motivo, '')), ''), 120),
         '[@ju] pedido por ' || coalesce(nullif(p_solicitante, ''), '?'),
         v_rec,
         CASE WHEN jsonb_array_length(v_conf) > 0 THEN now() END
  FROM unnest(v_janelas) j;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'profissional', v_nome, 'blocos', v_n, 'dia_inteiro', v_inteiro,
    'de', to_char(p_data, 'DD/MM'), 'ate', to_char(v_fim_d, 'DD/MM'),
    'hora_inicio', CASE WHEN v_inteiro THEN NULL ELSE to_char(v_hi, 'HH24:MI') END,
    'hora_fim', CASE WHEN v_inteiro THEN NULL ELSE to_char(v_hf, 'HH24:MI') END,
    'motivo', public.fn_ju_motivo_bloqueio(p_motivo), 'conflitos', v_conf);
END;
$$;

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
      AND tsrange(b.inicio AT TIME ZONE 'UTC', b.fim AT TIME ZONE 'UTC') && v_jan
    RETURNING b.inicio, b.fim, b.dia_inteiro
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'de', to_char(inicio AT TIME ZONE 'UTC', 'DD/MM HH24:MI'),
           'ate', to_char(fim AT TIME ZONE 'UTC', 'DD/MM HH24:MI'),
           'dia_inteiro', dia_inteiro) ORDER BY inicio), '[]'::jsonb)
  INTO v_lista FROM alvo;

  IF jsonb_array_length(v_lista) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Não achei bloqueio de ' || v_nome || ' nesse período');
  END IF;
  RETURN jsonb_build_object('ok', true, 'profissional', v_nome, 'removidos', v_lista);
END;
$$;

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
    -- compromissos: privado aparece só como "Indisponível" (o grupo tem secretárias)
    'bloqueios', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'de', to_char(b.inicio AT TIME ZONE 'UTC', 'DD/MM HH24:MI'),
               'ate', to_char(b.fim AT TIME ZONE 'UTC', 'DD/MM HH24:MI'),
               'dia_inteiro', b.dia_inteiro,
               'motivo', CASE WHEN b.privado THEN NULL ELSE b.motivo END,
               'titulo', CASE WHEN b.privado THEN 'Indisponível' ELSE b.titulo END,
               'impede_agendamento', b.impede_agendamento,
               'quem', coalesce(split_part(p.nome, ' ', 1), 'Clínica inteira'))
             ORDER BY b.inicio)
      FROM public.agenda_bloqueios b
      LEFT JOIN public.pessoas p ON p.id = b.profissional_id
      WHERE b.ativo AND b.deleted_at IS NULL
        AND (v_prof_id IS NULL OR b.profissional_id IS NULL OR b.profissional_id = v_prof_id)
        AND tsrange(b.inicio AT TIME ZONE 'UTC', b.fim AT TIME ZONE 'UTC')
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
          WHERE b.ativo AND b.deleted_at IS NULL AND b.impede_agendamento
            AND (b.profissional_id IS NULL OR b.profissional_id = v_prof_id)
            AND tsrange(b.inicio AT TIME ZONE 'UTC', b.fim AT TIME ZONE 'UTC')
                && tsrange(s.ini, s.ini + interval '60 minutes'))
    ), '[]'::jsonb) END);
END;
$$;

-- ------------------------------------------------------------------
-- 8. Google: dispara também com título/privado/impede/dia inteiro.
--    A service key sai do corpo da função e vai para o Vault.
-- ------------------------------------------------------------------
DO $$
DECLARE
  v_key text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'google_sync_service_key') THEN
    SELECT substring(pg_get_functiondef('public.trigger_bloqueio_google_sync'::regproc)
                     FROM 'v_service_key\s+text\s*:=\s*''([^'']+)''')
      INTO v_key;
    IF v_key IS NULL OR v_key LIKE '<%' THEN
      RAISE EXCEPTION 'Não achei a service key atual do trigger do Google; cadastre o secret google_sync_service_key no Vault antes.';
    END IF;
    PERFORM vault.create_secret(v_key, 'google_sync_service_key', 'Service role key usada pelos gatilhos de sync com Google Calendar');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.trigger_bloqueio_google_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_function_url text := 'https://jqegoentcusnbcykgtxg.supabase.co/functions/v1';
  v_service_key  text;
  v_op text := NULL;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_op := 'INSERT';
  ELSIF TG_OP = 'UPDATE' THEN
    IF (NEW.inicio IS DISTINCT FROM OLD.inicio
        OR NEW.fim IS DISTINCT FROM OLD.fim
        OR NEW.profissional_id IS DISTINCT FROM OLD.profissional_id
        OR NEW.motivo IS DISTINCT FROM OLD.motivo
        OR NEW.titulo IS DISTINCT FROM OLD.titulo
        OR NEW.privado IS DISTINCT FROM OLD.privado
        OR NEW.impede_agendamento IS DISTINCT FROM OLD.impede_agendamento
        OR NEW.dia_inteiro IS DISTINCT FROM OLD.dia_inteiro
        OR NEW.observacao IS DISTINCT FROM OLD.observacao
        OR NEW.ativo IS DISTINCT FROM OLD.ativo
        OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at) THEN
      IF NEW.ativo = false OR NEW.deleted_at IS NOT NULL THEN
        v_op := 'DELETE';
      ELSE
        v_op := 'UPDATE';
      END IF;
    END IF;
  END IF;

  IF v_op IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO v_service_key FROM vault.decrypted_secrets WHERE name = 'google_sync_service_key';

  PERFORM net.http_post(
    url := v_function_url || '/sync-google-calendar-bloqueio',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object('operation', v_op, 'bloqueio_id', NEW.id)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Erro trigger bloqueio Google sync: % (%)', SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bloqueio_google_sync ON public.agenda_bloqueios;
CREATE TRIGGER bloqueio_google_sync
  AFTER INSERT OR UPDATE OF inicio, fim, profissional_id, motivo, titulo, privado, impede_agendamento,
                            dia_inteiro, observacao, ativo, deleted_at
  ON public.agenda_bloqueios
  FOR EACH ROW EXECUTE FUNCTION public.trigger_bloqueio_google_sync();
