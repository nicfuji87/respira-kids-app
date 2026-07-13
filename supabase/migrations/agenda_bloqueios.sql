-- Feature "Bloquear agenda": indisponibilidade de profissional/clínica.
-- Aplicado em produção em 2026-07-13 (via MCP).
-- profissional_id NULL = clínica inteira. Recorrência materializada em linhas
-- concretas agrupadas por recorrencia_id.

CREATE TABLE public.agenda_bloqueios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profissional_id uuid REFERENCES public.pessoas(id),      -- NULL = clínica inteira
  inicio          timestamptz NOT NULL,
  fim             timestamptz NOT NULL,
  dia_inteiro     boolean NOT NULL DEFAULT false,
  motivo          text,
  observacao      text,
  recorrencia_id  uuid,
  periodo         tstzrange GENERATED ALWAYS AS (tstzrange(inicio, fim)) STORED,
  criado_por      uuid REFERENCES public.pessoas(id),
  ativo           boolean NOT NULL DEFAULT true,
  google_event_id text,
  google_synced_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CONSTRAINT chk_bloqueio_periodo CHECK (fim > inicio)
);

COMMENT ON TABLE public.agenda_bloqueios IS
  'Bloqueios de agenda (indisponibilidade). profissional_id NULL = clínica inteira. Recorrência agrupada por recorrencia_id.';

CREATE INDEX idx_agenda_bloqueios_periodo
  ON public.agenda_bloqueios USING gist (profissional_id, periodo)
  WHERE ativo AND deleted_at IS NULL;
CREATE INDEX idx_agenda_bloqueios_recorrencia
  ON public.agenda_bloqueios (recorrencia_id)
  WHERE recorrencia_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_agenda_bloqueios_updated_at ON public.agenda_bloqueios;
CREATE TRIGGER trg_agenda_bloqueios_updated_at
  BEFORE UPDATE ON public.agenda_bloqueios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS espelhando o padrão de agendamentos
ALTER TABLE public.agenda_bloqueios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role bypass" ON public.agenda_bloqueios
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY bloqueios_admin_full ON public.agenda_bloqueios
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY bloqueios_staff_select ON public.agenda_bloqueios
  FOR SELECT TO authenticated USING (is_authorized_staff());

CREATE POLICY bloqueios_prof_modify ON public.agenda_bloqueios
  FOR ALL TO authenticated
  USING (is_profissional() AND profissional_id = get_current_pessoa_id())
  WITH CHECK (is_profissional() AND profissional_id = get_current_pessoa_id());

CREATE POLICY bloqueios_secretaria_modify ON public.agenda_bloqueios
  FOR ALL TO authenticated
  USING (
    is_secretaria() AND (
      profissional_id IS NULL
      OR profissional_id IN (
        SELECT pa.id_profissional FROM public.permissoes_agendamento pa
        WHERE pa.id_secretaria = get_current_pessoa_id() AND pa.ativo = true
      )
    )
  )
  WITH CHECK (
    is_secretaria() AND (
      profissional_id IS NULL
      OR profissional_id IN (
        SELECT pa.id_profissional FROM public.permissoes_agendamento pa
        WHERE pa.id_secretaria = get_current_pessoa_id() AND pa.ativo = true
      )
    )
  );

-- ============================================================
-- Fonte única de disponibilidade (consultas ativas + bloqueios)
-- ============================================================
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
        AND a.periodo && tstzrange(p_inicio, p_fim)
        AND (p_ignorar_agendamento_id IS NULL OR a.id <> p_ignorar_agendamento_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.agenda_bloqueios b
      WHERE b.ativo = true
        AND b.deleted_at IS NULL
        AND (b.profissional_id IS NULL OR b.profissional_id = p_profissional_id)
        AND b.periodo && tstzrange(p_inicio, p_fim)
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.fn_horario_disponivel(uuid, timestamptz, timestamptz, uuid)
  TO authenticated;

-- ============================================================
-- agendamentos NÃO pode cair dentro de um bloqueio (appt×block).
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_valida_bloqueio_agendamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ocupante boolean;
  v_fim timestamptz;
  v_motivo text;
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

  SELECT NEW.data_hora + make_interval(mins => ts.duracao_minutos)
    INTO v_fim
  FROM tipo_servicos ts WHERE ts.id = NEW.tipo_servico_id;

  SELECT b.motivo INTO v_motivo
  FROM agenda_bloqueios b
  WHERE b.ativo = true
    AND b.deleted_at IS NULL
    AND (b.profissional_id IS NULL OR b.profissional_id = NEW.profissional_id)
    AND b.periodo && tstzrange(NEW.data_hora, v_fim)
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Horário indisponível: bloqueio de agenda nesse período (%).',
      COALESCE(v_motivo, 'bloqueio')
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_valida_bloqueio_agendamento ON public.agendamentos;
CREATE TRIGGER trg_valida_bloqueio_agendamento
  BEFORE INSERT OR UPDATE OF data_hora, profissional_id, tipo_servico_id, status_consulta_id, ativo
  ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_valida_bloqueio_agendamento();

-- ============================================================
-- Ao criar/ativar um bloqueio, some com os slots públicos sobrepostos.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_bloqueio_sincroniza_slots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.ativo AND NEW.deleted_at IS NULL THEN
    UPDATE agenda_slots s
    SET disponivel = false, updated_at = now()
    FROM agendas_compartilhadas a
    WHERE s.agenda_id = a.id
      AND a.ativo = true
      AND s.disponivel = true
      AND s.deleted_at IS NULL
      AND (NEW.profissional_id IS NULL OR a.profissional_id = NEW.profissional_id)
      AND s.data_hora >= NEW.inicio
      AND s.data_hora <  NEW.fim;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloqueio_sincroniza_slots ON public.agenda_bloqueios;
CREATE TRIGGER trg_bloqueio_sincroniza_slots
  AFTER INSERT OR UPDATE OF inicio, fim, profissional_id, ativo, deleted_at
  ON public.agenda_bloqueios
  FOR EACH ROW EXECUTE FUNCTION public.fn_bloqueio_sincroniza_slots();
