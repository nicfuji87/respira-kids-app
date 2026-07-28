-- Encaixe: intervalo mínimo de 20 minutos entre consultas do mesmo profissional.
--
-- Contexto: a constraint agendamentos_sem_sobreposicao (13/07/2026) usava o
-- período real do serviço (quase sempre 60 min), então marcar um encaixe 30 min
-- depois de outra consulta virava sobreposição e era recusado. Dados de jan a
-- 12/07/2026 mostram ~120 encaixes reais (86 deles exatamente 30 min depois,
-- sempre com pacientes diferentes) — é rotina da clínica, não acidente.
--
-- Nova regra (decisão do dono, 27/07/2026): duas consultas do mesmo profissional
-- precisam começar com no MÍNIMO 20 minutos de diferença. Menos que isso continua
-- recusado — é o caso que a constraint existe para pegar (agendar em cima).
--
-- Implementação: janela de reserva fixa de 20 min a partir do início. Duas
-- janelas [início, início+20) se sobrepõem exatamente quando os inícios estão a
-- menos de 20 min. Coluna normal (não gerada) porque timestamptz + interval não
-- é IMMUTABLE — mesmo motivo da coluna `periodo`.

-- 1) Janela de reserva
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS janela_reserva tstzrange;

COMMENT ON COLUMN public.agendamentos.janela_reserva IS
  'Janela de 20 min a partir do início, usada pela constraint agendamentos_intervalo_minimo. Diferente de `periodo`, que é a duração real do serviço.';

-- 2) Trigger passa a manter as duas colunas
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
  -- Intervalo mínimo entre consultas do mesmo profissional
  NEW.janela_reserva := tstzrange(
    NEW.data_hora,
    NEW.data_hora + interval '20 minutes'
  );
  RETURN NEW;
END;
$$;

-- 3) Backfill com os triggers de efeito colateral desligados.
--    webhook_appointment_updated e trigger_google_calendar_sync têm guarda
--    interna por campo alterado e não disparariam, mas desligar é garantia — a
--    transação segura ACCESS EXCLUSIVE, ninguém escreve na janela.
--    Em bloco DO (uma única instrução) para que qualquer erro no meio faça
--    rollback junto do DISABLE — nunca deixar a tabela sem trigger.
DO $backfill$
BEGIN
  ALTER TABLE public.agendamentos DISABLE TRIGGER USER;

  UPDATE public.agendamentos
  SET janela_reserva = tstzrange(data_hora, data_hora + interval '20 minutes')
  WHERE janela_reserva IS DISTINCT FROM
        tstzrange(data_hora, data_hora + interval '20 minutes');

  ALTER TABLE public.agendamentos ENABLE TRIGGER USER;
END
$backfill$;

-- 4) Constraint passa a olhar a janela de 20 min
ALTER TABLE public.agendamentos
  DROP CONSTRAINT IF EXISTS agendamentos_sem_sobreposicao;

ALTER TABLE public.agendamentos
  ADD CONSTRAINT agendamentos_intervalo_minimo
  EXCLUDE USING gist (
    profissional_id WITH =,
    janela_reserva WITH &&
  )
  WHERE (
    ativo
    AND data_hora >= '2026-07-13 00:00:00-03'::timestamptz
    AND status_consulta_id IN (
      '26bd996d-657f-4dd0-ad71-f0f0c407fd1f',  -- agendado
      '6561a95b-b64e-487c-9d43-93985966602b'   -- confirmado
    )
  );

-- 5) Fonte única de verdade usada pelo app segue a mesma regra.
--    Consultas: intervalo mínimo de 20 min entre inícios.
--    Bloqueios de agenda: continuam absolutos, por sobreposição real do período.
CREATE OR REPLACE FUNCTION public.fn_horario_disponivel(
  p_profissional_id uuid,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_ignorar_agendamento_id uuid DEFAULT NULL::uuid
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
        AND (b.profissional_id IS NULL OR b.profissional_id = p_profissional_id)
        AND b.periodo && tstzrange(p_inicio, p_fim)
    )
  );
$function$;
