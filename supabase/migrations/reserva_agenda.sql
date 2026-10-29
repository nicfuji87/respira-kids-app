-- =====================================================================
-- RESERVA DE HORÁRIO NA AGENDA (29/10/2026)
-- =====================================================================
-- Reserva = compromisso com categoria (motivo) 'reserva'. Por ser uma linha de
-- agenda_bloqueios com impede_agendamento, herda todas as travas que já existem:
-- consulta não entra por cima (trg_valida_bloqueio_agendamento), Ju não oferece nem
-- agenda (fn_horario_disponivel / fn_ju_agenda_consultar), slots do link público
-- fecham e reabrem sozinhos, e vai para o Google do profissional.
--
-- Regras da reserva:
--   * observação obrigatória; paciente opcional (com ou sem cadastro);
--   * sempre de um profissional, nunca privada, nunca dia inteiro, sem recorrência;
--   * não pode ficar por cima de consulta marcada nem de outro compromisso que
--     impede agendamento (nem admin força);
--   * vence às 00:00 do dia da reserva (= fim do dia anterior). Reserva feita no
--     próprio dia não vence. Vencida sai da agenda (cron de hora em hora);
--   * confirmar = criar a consulta com agendamentos.reserva_id. Essa consulta
--     ignora a própria reserva na checagem e, ao entrar, encerra a reserva.
-- Horários em HORA DE PAREDE (igual agendamentos.data_hora).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Colunas
-- ---------------------------------------------------------------------
ALTER TABLE public.agenda_bloqueios
  ADD COLUMN IF NOT EXISTS paciente_id  uuid REFERENCES public.pessoas(id),
  ADD COLUMN IF NOT EXISTS expira_em    timestamptz,
  ADD COLUMN IF NOT EXISTS encerrada_em timestamptz,
  ADD COLUMN IF NOT EXISTS encerramento text;

ALTER TABLE public.agenda_bloqueios
  DROP CONSTRAINT IF EXISTS chk_reserva_encerramento,
  ADD CONSTRAINT chk_reserva_encerramento
    CHECK (encerramento IS NULL OR encerramento IN ('confirmada', 'vencida'));

ALTER TABLE public.agenda_bloqueios
  DROP CONSTRAINT IF EXISTS chk_reserva_regras,
  ADD CONSTRAINT chk_reserva_regras CHECK (
    motivo IS DISTINCT FROM 'reserva'
    OR (
      profissional_id IS NOT NULL
      AND NOT dia_inteiro
      AND impede_agendamento
      AND NOT privado
      AND recorrencia_id IS NULL
      AND nullif(btrim(observacao), '') IS NOT NULL
    )
  );

ALTER TABLE public.agenda_bloqueios
  DROP CONSTRAINT IF EXISTS chk_paciente_so_reserva,
  ADD CONSTRAINT chk_paciente_so_reserva
    CHECK (paciente_id IS NULL OR motivo = 'reserva');

CREATE INDEX IF NOT EXISTS idx_agenda_bloqueios_reserva_expira
  ON public.agenda_bloqueios (expira_em)
  WHERE motivo = 'reserva' AND ativo AND deleted_at IS NULL;

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS reserva_id uuid REFERENCES public.agenda_bloqueios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agendamentos_reserva_id
  ON public.agendamentos (reserva_id) WHERE reserva_id IS NOT NULL;

COMMENT ON COLUMN public.agenda_bloqueios.paciente_id IS
  'Reserva: paciente já cadastrado (opcional). Só vale para motivo = reserva.';
COMMENT ON COLUMN public.agenda_bloqueios.expira_em IS
  'Reserva: hora de parede em que vence (00:00 do dia da reserva). NULL = reserva feita no próprio dia, não vence.';
COMMENT ON COLUMN public.agenda_bloqueios.encerramento IS
  'Reserva: confirmada (virou consulta, ver agendamentos.reserva_id) ou vencida.';
COMMENT ON COLUMN public.agendamentos.reserva_id IS
  'Reserva de agenda que esta consulta confirmou. A consulta ignora essa reserva na checagem de bloqueio.';

-- ---------------------------------------------------------------------
-- 2. Regras da reserva (BEFORE, roda antes de trg_valida_conflito_compromisso)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reserva_regras()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje      date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_dia       date;
  v_nome      text;
  v_n         integer;
  v_primeira  text;
BEGIN
  IF NEW.motivo IS DISTINCT FROM 'reserva' THEN
    RETURN NEW;
  END IF;

  -- Reserva é sempre visível e sempre segura o horário
  NEW.privado := false;
  NEW.impede_agendamento := true;
  NEW.dia_inteiro := false;
  NEW.recorrencia_id := NULL;

  -- Título exibido na agenda, na Ju e no Google
  IF NEW.paciente_id IS NOT NULL THEN
    SELECT p.nome INTO v_nome FROM public.pessoas p WHERE p.id = NEW.paciente_id;
  END IF;
  NEW.titulo := left(
    'Reserva: ' || coalesce(
      nullif(btrim(v_nome), ''),
      nullif(btrim(regexp_replace(coalesce(NEW.observacao, ''), '\s+', ' ', 'g')), ''),
      'sem nome'),
    120);

  -- Vencimento: recalcula ao criar ou ao mudar o dia
  IF TG_OP = 'INSERT' OR NEW.inicio IS DISTINCT FROM OLD.inicio THEN
    v_dia := (NEW.inicio AT TIME ZONE 'UTC')::date;
    IF v_dia > v_hoje THEN
      NEW.expira_em := v_dia::timestamp AT TIME ZONE 'UTC';
    ELSE
      NEW.expira_em := NULL;
    END IF;
  END IF;

  -- Conflitos só importam para reserva ativa que está nascendo ou mudando de lugar
  IF NOT (NEW.ativo AND NEW.deleted_at IS NULL) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.ativo AND OLD.deleted_at IS NULL
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
    AND a.profissional_id = NEW.profissional_id
    AND tstzrange(a.data_hora, a.data_hora + make_interval(mins => greatest(coalesce(a.duracao_minutos, 0), 20)))
        && tstzrange(NEW.inicio, NEW.fim);

  IF v_n > 0 THEN
    RAISE EXCEPTION 'Já existe consulta marcada nesse horário (%). Escolha outro horário para a reserva.', v_primeira
      USING ERRCODE = 'P0001', HINT = 'reserva_conflito';
  END IF;

  SELECT min(coalesce(nullif(b.titulo, ''), b.motivo, 'compromisso') || ' ('
             || to_char(b.inicio AT TIME ZONE 'UTC', 'DD/MM HH24:MI') || ')')
    INTO v_primeira
  FROM public.agenda_bloqueios b
  WHERE b.ativo AND b.deleted_at IS NULL AND b.impede_agendamento
    AND b.id IS DISTINCT FROM NEW.id
    AND (b.profissional_id IS NULL OR b.profissional_id = NEW.profissional_id)
    AND b.periodo && tstzrange(NEW.inicio, NEW.fim);

  IF v_primeira IS NOT NULL THEN
    RAISE EXCEPTION 'O horário já está ocupado: %.', v_primeira
      USING ERRCODE = 'P0001', HINT = 'reserva_conflito';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_reserva_regras ON public.agenda_bloqueios;
CREATE TRIGGER trg_reserva_regras
  BEFORE INSERT OR UPDATE ON public.agenda_bloqueios
  FOR EACH ROW EXECUTE FUNCTION public.fn_reserva_regras();

-- ---------------------------------------------------------------------
-- 3. Consulta que confirma a reserva ignora a própria reserva
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_valida_bloqueio_agendamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    AND b.id IS DISTINCT FROM NEW.reserva_id
    AND (b.profissional_id IS NULL OR b.profissional_id = NEW.profissional_id)
    AND b.periodo && tstzrange(NEW.data_hora, v_fim)
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Horário indisponível: bloqueio de agenda (compromisso ou reserva) nesse período.'
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------
-- 4. Ao entrar a consulta, a reserva é encerrada como confirmada
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reserva_confirmar_ao_agendar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.reserva_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.reserva_id IS NOT DISTINCT FROM OLD.reserva_id THEN
    RETURN NULL;
  END IF;

  UPDATE public.agenda_bloqueios b
  SET ativo = false,
      deleted_at = now(),
      encerrada_em = now(),
      encerramento = 'confirmada'
  WHERE b.id = NEW.reserva_id
    AND b.motivo = 'reserva'
    AND b.ativo AND b.deleted_at IS NULL;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_reserva_confirmar ON public.agendamentos;
CREATE TRIGGER trg_reserva_confirmar
  AFTER INSERT OR UPDATE OF reserva_id ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_reserva_confirmar_ao_agendar();

-- ---------------------------------------------------------------------
-- 5. Disponibilidade: pode ignorar uma reserva (a que está sendo confirmada)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_horario_disponivel(uuid, timestamptz, timestamptz, uuid);

CREATE FUNCTION public.fn_horario_disponivel(
  p_profissional_id uuid,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_ignorar_agendamento_id uuid DEFAULT NULL,
  p_ignorar_bloqueio_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
        AND b.id IS DISTINCT FROM p_ignorar_bloqueio_id
        AND (b.profissional_id IS NULL OR b.profissional_id = p_profissional_id)
        AND b.periodo && tstzrange(p_inicio, p_fim)
    )
  );
$function$;

GRANT EXECUTE ON FUNCTION public.fn_horario_disponivel(uuid, timestamptz, timestamptz, uuid, uuid)
  TO PUBLIC, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6. Leitura do calendário: + paciente e vencimento; esconde reserva vencida
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_agenda_compromissos(timestamptz, timestamptz, uuid);

CREATE FUNCTION public.fn_agenda_compromissos(
  p_inicio timestamptz,
  p_fim timestamptz,
  p_profissional_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid, profissional_id uuid, profissional_nome text,
  inicio timestamptz, fim timestamptz, dia_inteiro boolean,
  categoria text, titulo text, observacao text,
  privado boolean, mascarado boolean, impede_agendamento boolean,
  recorrencia_id uuid, criado_por uuid, pode_editar boolean,
  conflitos integer, conflito_aceito_em timestamptz,
  paciente_id uuid, paciente_nome text, expira_em timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_eu    uuid    := public.get_current_pessoa_id();
  v_admin boolean := public.is_admin();
  v_sec   boolean := public.is_secretaria();
  v_prof  boolean := public.is_profissional();
  v_agora timestamptz := (now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC';
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
      AND (b.expira_em IS NULL OR b.expira_em > v_agora)
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
         e.conflito_aceito_em,
         CASE WHEN m.mask THEN NULL ELSE e.paciente_id END,
         CASE WHEN m.mask THEN NULL ELSE pac.nome::text END,
         e.expira_em
  FROM escopo e
  LEFT JOIN public.pessoas p ON p.id = e.profissional_id
  LEFT JOIN public.pessoas pac ON pac.id = e.paciente_id
  CROSS JOIN LATERAL (
    SELECT (e.privado AND NOT coalesce(v_admin OR e.profissional_id = v_eu OR e.criado_por = v_eu, false)) AS mask
  ) m
  ORDER BY e.inicio;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_agenda_compromissos(timestamptz, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_agenda_compromissos(timestamptz, timestamptz, uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 7. Vencimento automático (de hora em hora; vence à meia-noite)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reservas_vencer()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.agenda_bloqueios b
  SET ativo = false,
      deleted_at = now(),
      encerrada_em = now(),
      encerramento = 'vencida'
  WHERE b.motivo = 'reserva'
    AND b.ativo AND b.deleted_at IS NULL
    AND b.expira_em IS NOT NULL
    AND b.expira_em <= (now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_reservas_vencer() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('reservas-vencer')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reservas-vencer');
SELECT cron.schedule('reservas-vencer', '1 * * * *', 'SELECT public.fn_reservas_vencer()');

-- ---------------------------------------------------------------------
-- 8. "@ju desbloqueia a agenda" não apaga reserva sem querer
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ju_agenda_desbloquear(p_profissional text, p_data date, p_data_fim date DEFAULT NULL::date, p_hora_inicio time without time zone DEFAULT NULL::time without time zone, p_hora_fim time without time zone DEFAULT NULL::time without time zone, p_solicitante text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      AND b.motivo IS DISTINCT FROM 'reserva'
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
    RETURN jsonb_build_object('ok', false, 'erro', 'Não achei bloqueio de ' || v_nome || ' nesse período (reservas não são removidas por aqui)');
  END IF;
  RETURN jsonb_build_object('ok', true, 'profissional', v_nome, 'removidos', v_lista);
END;
$function$;
