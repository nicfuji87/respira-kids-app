-- Agenda pública: horário volta quando a consulta é cancelada (02/11/2026)
--
-- Problema relatado pelo dono: "quando o paciente cancela, o horário não volta
-- para a agenda pública (dá erro)". Duas causas:
-- 1. O gatilho só reabria o horário na FALTA; no cancelamento ficava fechado
--    (decisão antiga). 8 consultas canceladas tinham o horário preso.
-- 2. agenda_selecoes tinha UNIQUE(slot_id): um horário reaberto não aceitava
--    a escolha de outra família (erro de chave duplicada na reserva). Isso já
--    acontecia com a falta.
--
-- Agora:
-- - Consulta cancelada/falta/reagendada/erro ou inativada reabre o horário
--   (mesmo profissional e hora), desde que esteja no futuro, sem compromisso
--   que impeça e sem outra consulta ocupando.
-- - Consulta remarcada (mudou hora/profissional) reabre o horário antigo.
-- - A escolha antiga fica guardada com liberada_em (histórico); a consulta
--   continua na agenda como cancelada. Só uma escolha ATIVA por horário.

ALTER TABLE public.agenda_selecoes
  ADD COLUMN IF NOT EXISTS liberada_em timestamptz;

COMMENT ON COLUMN public.agenda_selecoes.liberada_em IS
  'Quando o horário voltou para a agenda pública (consulta cancelada, falta ou remarcada). Escolha liberada fica só de histórico.';

ALTER TABLE public.agenda_selecoes DROP CONSTRAINT IF EXISTS uq_agenda_selecoes_slot;
CREATE UNIQUE INDEX IF NOT EXISTS uq_agenda_selecoes_slot_ativa
  ON public.agenda_selecoes (slot_id) WHERE liberada_em IS NULL;

-- Reabre os horários públicos de (profissional, hora) que não estão mais ocupados
CREATE OR REPLACE FUNCTION public.fn_reabrir_slots_publicos(
  p_profissional_id uuid,
  p_data_hora timestamptz,
  p_ignorar_agendamento_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  SELECT array_agg(s.id) INTO v_ids
    FROM public.agenda_slots s
    JOIN public.agendas_compartilhadas a ON a.id = s.agenda_id
   WHERE a.profissional_id = p_profissional_id
     AND a.ativo
     AND s.data_hora = p_data_hora
     AND s.deleted_at IS NULL
     AND NOT s.disponivel
     AND s.fechado_por_bloqueio IS NULL
     AND s.data_hora > ((now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC')
     AND NOT EXISTS (
       SELECT 1 FROM public.agendamentos ag
         JOIN public.consulta_status cs ON cs.id = ag.status_consulta_id
        WHERE ag.ativo
          AND ag.profissional_id = p_profissional_id
          AND ag.id IS DISTINCT FROM p_ignorar_agendamento_id
          AND cs.codigo IN ('agendado', 'confirmado', 'em_atendimento')
          AND (ag.data_hora = s.data_hora
               OR ag.janela_reserva && tstzrange(s.data_hora, s.data_hora + interval '20 minutes')))
     AND NOT EXISTS (
       SELECT 1 FROM public.agenda_bloqueios b
        WHERE b.ativo AND b.deleted_at IS NULL AND b.impede_agendamento
          AND (b.profissional_id IS NULL OR b.profissional_id = p_profissional_id)
          AND s.data_hora >= b.inicio AND s.data_hora < b.fim);

  IF v_ids IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.agenda_selecoes
     SET liberada_em = now(), updated_at = now()
   WHERE slot_id = ANY (v_ids) AND liberada_em IS NULL;

  UPDATE public.agenda_slots
     SET disponivel = true, updated_at = now()
   WHERE id = ANY (v_ids);

  RETURN array_length(v_ids, 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sync_slots_after_agendamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_codigo text;
BEGIN
  SELECT codigo INTO v_codigo FROM public.consulta_status WHERE id = NEW.status_consulta_id;

  -- Remarcada (mudou hora ou profissional): o horário antigo volta
  IF TG_OP = 'UPDATE'
     AND (NEW.data_hora IS DISTINCT FROM OLD.data_hora
          OR NEW.profissional_id IS DISTINCT FROM OLD.profissional_id) THEN
    PERFORM public.fn_reabrir_slots_publicos(OLD.profissional_id, OLD.data_hora, NEW.id);
  END IF;

  -- Ocupa o horário: fecha os horários públicos iguais
  IF NEW.ativo AND v_codigo IN ('agendado', 'confirmado', 'em_atendimento') THEN
    PERFORM public.fn_sync_agenda_slots_on_agendamento(NEW.profissional_id, NEW.data_hora, TRUE);
    RETURN NEW;
  END IF;

  -- Cancelada, falta, remarcada, erro ou inativada: o horário volta
  IF NOT NEW.ativo OR v_codigo IN ('cancelado', 'faltou', 'reagendado', 'erro') THEN
    PERFORM public.fn_reabrir_slots_publicos(NEW.profissional_id, NEW.data_hora, NEW.id);
  END IF;

  RETURN NEW;
END;
$function$;

-- Contagem de ocupados ignora escolhas liberadas
CREATE OR REPLACE VIEW public.vw_agendas_compartilhadas_stats AS
 SELECT ac.id,
    ac.profissional_id,
    ac.token,
    ac.titulo,
    ac.data_inicio,
    ac.data_fim,
    ac.ativo,
    ac.criado_por,
    ac.created_at,
    ac.updated_at,
    p.nome AS profissional_nome,
    p.email AS profissional_email,
    p.especialidade AS profissional_especialidade,
    p.foto_perfil AS profissional_foto,
    count(DISTINCT aslt.id) AS total_slots,
    count(DISTINCT aslt.id) FILTER (WHERE (aslt.disponivel = true)) AS slots_disponiveis,
    count(DISTINCT asel.id) AS slots_ocupados,
    count(DISTINCT asv.id) AS total_servicos,
    count(DISTINCT alc.id) AS total_locais,
    count(DISTINCT aemp.id) AS total_empresas
   FROM agendas_compartilhadas ac
     JOIN pessoas p ON p.id = ac.profissional_id
     LEFT JOIN agenda_slots aslt ON aslt.agenda_id = ac.id
     LEFT JOIN agenda_selecoes asel ON asel.agenda_id = ac.id AND asel.liberada_em IS NULL
     LEFT JOIN agenda_servicos asv ON asv.agenda_id = ac.id
     LEFT JOIN agenda_locais alc ON alc.agenda_id = ac.id
     LEFT JOIN agenda_empresas aemp ON aemp.agenda_id = ac.id
  GROUP BY ac.id, ac.profissional_id, ac.token, ac.titulo, ac.data_inicio, ac.data_fim, ac.ativo, ac.criado_por, ac.created_at, ac.updated_at, p.nome, p.email, p.especialidade, p.foto_perfil;

-- Retroativo: escolhas de horários que já tinham voltado (falta) ficam liberadas
UPDATE public.agenda_selecoes sel
   SET liberada_em = now()
  FROM public.agenda_slots s
 WHERE s.id = sel.slot_id AND s.disponivel AND sel.liberada_em IS NULL;

-- Retroativo: consultas canceladas/falta com horário futuro ainda preso
SELECT public.fn_reabrir_slots_publicos(a.profissional_id, a.data_hora, a.id)
  FROM public.agenda_selecoes sel
  JOIN public.agendamentos a ON a.id = sel.agendamento_id
  JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
 WHERE sel.liberada_em IS NULL
   AND (NOT a.ativo OR cs.codigo IN ('cancelado', 'faltou', 'reagendado', 'erro'));

REVOKE ALL ON FUNCTION public.fn_reabrir_slots_publicos(uuid, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_sync_slots_after_agendamento() FROM PUBLIC, anon;
