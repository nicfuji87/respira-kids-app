-- Endurecimento anti duplo-agendamento (à prova de bala) via EXCLUDE gist.
-- Aplicado em produção em 2026-07-13 (via MCP). Recorte por data isenta
-- sobreposições PASSADAS já existentes; futuro é hard-block.

-- 1) Extensão que permite '=' de uuid dentro de índice gist
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2) Duração denormalizada + período (início→fim). 'periodo' é coluna normal
--    mantida por trigger porque (timestamptz + interval) não é IMMUTABLE.
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS duracao_minutos integer;
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS periodo tstzrange;

CREATE OR REPLACE FUNCTION public.fn_set_agendamento_periodo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.duracao_minutos IS NULL
     OR TG_OP = 'INSERT'
     OR NEW.tipo_servico_id IS DISTINCT FROM OLD.tipo_servico_id THEN
    SELECT ts.duracao_minutos INTO NEW.duracao_minutos
    FROM public.tipo_servicos ts
    WHERE ts.id = NEW.tipo_servico_id;
  END IF;
  NEW.duracao_minutos := COALESCE(NEW.duracao_minutos, 0);
  NEW.periodo := tstzrange(
    NEW.data_hora,
    NEW.data_hora + make_interval(mins => NEW.duracao_minutos)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_agendamento_periodo ON public.agendamentos;
CREATE TRIGGER trg_set_agendamento_periodo
  BEFORE INSERT OR UPDATE OF data_hora, tipo_servico_id, duracao_minutos
  ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_agendamento_periodo();

UPDATE public.agendamentos a
SET duracao_minutos = ts.duracao_minutos,
    periodo = tstzrange(
      a.data_hora,
      a.data_hora + make_interval(mins => ts.duracao_minutos)
    )
FROM public.tipo_servicos ts
WHERE ts.id = a.tipo_servico_id;

-- 3) Constraint de exclusão: impede duas consultas ativas do mesmo profissional
--    se sobreporem. Só status ocupantes (agendado/confirmado), a partir do corte.
ALTER TABLE public.agendamentos
  ADD CONSTRAINT agendamentos_sem_sobreposicao
  EXCLUDE USING gist (
    profissional_id WITH =,
    periodo WITH &&
  )
  WHERE (
    ativo
    AND data_hora >= '2026-07-13 00:00:00-03'::timestamptz
    AND status_consulta_id IN (
      '26bd996d-657f-4dd0-ad71-f0f0c407fd1f',  -- agendado
      '6561a95b-b64e-487c-9d43-93985966602b'   -- confirmado
    )
  );
