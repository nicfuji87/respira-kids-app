-- AI dev note: Reabrir slot da agenda pública quando a consulta cai em "faltou".
--
-- Regra de negócio: "se o paciente faltou, o horário fica disponível novamente".
-- O agendamento manual (secretária/admin) já ignorava consultas 'faltou'/'cancelado'
-- ao checar conflito. Faltava apenas reabrir o slot na AGENDA PÚBLICA
-- (auto-agendamento pelo responsável), pois o trigger original NÃO reabria slots
-- em nenhum caso ("por segurança").
--
-- Decisão: reabrir SOMENTE em 'faltou' (não em 'cancelado', que continua fechado).
-- Trava de segurança: só reabre se NÃO houver outro agendamento ativo ocupando o
-- mesmo (profissional, data_hora) com status que ocupa o horário
-- (agendado/confirmado/em_atendimento).

CREATE OR REPLACE FUNCTION public.trg_sync_slots_after_agendamento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status_relevante BOOLEAN := FALSE;
  v_is_faltou BOOLEAN := FALSE;
  v_sync_result RECORD;
BEGIN
  -- Verificar se o status é relevante (agendado, confirmado, em_atendimento)
  -- Apenas sincroniza se o agendamento está em status que ocupa o horário
  IF NEW.ativo = TRUE AND NEW.status_consulta_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM consulta_status
      WHERE id = NEW.status_consulta_id
        AND codigo IN ('agendado', 'confirmado', 'em_atendimento')
    ) INTO v_status_relevante;
  END IF;

  -- Se INSERT ou UPDATE com status relevante, marcar slots como indisponíveis
  IF v_status_relevante THEN
    SELECT * INTO v_sync_result
    FROM fn_sync_agenda_slots_on_agendamento(
      NEW.profissional_id,
      NEW.data_hora,
      TRUE
    );

    -- Log apenas se houve slots afetados
    IF v_sync_result.slots_afetados > 0 THEN
      RAISE NOTICE 'Trigger sync_slots: % slot(s) sincronizado(s) após agendamento %',
        v_sync_result.slots_afetados, NEW.id;
    END IF;

    RETURN NEW;
  END IF;

  -- AI dev note: Reabertura de slot na FALTA (no-show).
  -- Cancelamento NÃO reabre slot (decisão de negócio mantida).
  IF NEW.status_consulta_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM consulta_status
      WHERE id = NEW.status_consulta_id
        AND codigo = 'faltou'
    ) INTO v_is_faltou;
  END IF;

  IF v_is_faltou THEN
    -- Só reabre se não houver OUTRO agendamento ativo ocupando o mesmo horário
    IF NOT EXISTS (
      SELECT 1
      FROM agendamentos ag
      JOIN consulta_status cs ON cs.id = ag.status_consulta_id
      WHERE ag.profissional_id = NEW.profissional_id
        AND ag.data_hora = NEW.data_hora
        AND ag.ativo = TRUE
        AND ag.id <> NEW.id
        AND cs.codigo IN ('agendado', 'confirmado', 'em_atendimento')
    ) THEN
      UPDATE agenda_slots AS s
      SET disponivel = TRUE,
          updated_at = NOW()
      FROM agendas_compartilhadas AS a
      WHERE s.agenda_id = a.id
        AND a.profissional_id = NEW.profissional_id
        AND s.data_hora = NEW.data_hora
        AND s.disponivel = FALSE
        AND a.ativo = TRUE;

      RAISE NOTICE 'Trigger sync_slots: slot(s) reaberto(s) por falta no agendamento %', NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
