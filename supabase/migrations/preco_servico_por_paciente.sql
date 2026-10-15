-- =====================================================================
-- Preço especial por paciente
-- ---------------------------------------------------------------------
-- Paciente com acordo (parceria, desconto combinado, social) tem o preço
-- dele por serviço. Ordem da regra de preço, do mais específico ao geral:
--   paciente_precos  ->  profissional_servicos.valor  ->  tipo_servicos.valor
--
-- É só o valor sugerido ao agendar: quem agenda continua podendo mudar o
-- valor na hora (desconto avulso de uma sessão segue sendo digitado).
-- Valor fixo (não percentual) de propósito: reajuste geral não mexe em
-- acordo sem alguém decidir.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.paciente_precos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id uuid NOT NULL REFERENCES public.pessoas(id),
  tipo_servico_id uuid NOT NULL REFERENCES public.tipo_servicos(id),
  valor numeric(10,2) NOT NULL CHECK (valor >= 0),
  motivo text NOT NULL CHECK (btrim(motivo) <> ''),
  ativo boolean NOT NULL DEFAULT true,
  criado_por uuid REFERENCES public.pessoas(id),
  atualizado_por uuid REFERENCES public.pessoas(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.paciente_precos IS
  'Preço especial de um serviço para um paciente (acordo). Vence o preço da profissional e o padrão.';

-- Um preço vigente por paciente+serviço; os desativados ficam de histórico.
CREATE UNIQUE INDEX IF NOT EXISTS paciente_precos_vigente_uniq
  ON public.paciente_precos (paciente_id, tipo_servico_id) WHERE ativo;

ALTER TABLE public.paciente_precos ENABLE ROW LEVEL SECURITY;

-- Profissional também agenda, então lê; só admin/secretaria definem acordo.
CREATE POLICY paciente_precos_select_staff
  ON public.paciente_precos FOR SELECT TO authenticated
  USING ((SELECT public.fn_rls_staff_completo()));

CREATE POLICY paciente_precos_write_admin_secretaria
  ON public.paciente_precos FOR ALL TO authenticated
  USING ((SELECT public.fn_rls_admin_secretaria_ativo()))
  WITH CHECK ((SELECT public.fn_rls_admin_secretaria_ativo()));

CREATE POLICY paciente_precos_service_role_bypass
  ON public.paciente_precos FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.paciente_precos TO authenticated;


-- ---------------------------------------------------------------------
-- Regra única de preço, agora com o paciente (opcional)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_valor_servico(uuid, uuid);

CREATE OR REPLACE FUNCTION public.fn_valor_servico(
  p_tipo_servico_id uuid,
  p_profissional_id uuid,
  p_paciente_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    (SELECT pp.valor
       FROM public.paciente_precos pp
      WHERE pp.paciente_id = p_paciente_id
        AND pp.tipo_servico_id = p_tipo_servico_id
        AND pp.ativo),
    (SELECT ps.valor
       FROM public.profissional_servicos ps
      WHERE ps.id_tipo_servico = p_tipo_servico_id
        AND ps.id_profissional = p_profissional_id
        AND ps.ativo
        AND ps.valor IS NOT NULL),
    (SELECT ts.valor FROM public.tipo_servicos ts WHERE ts.id = p_tipo_servico_id)
  );
$$;

REVOKE ALL ON FUNCTION public.fn_valor_servico(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_valor_servico(uuid, uuid, uuid) TO authenticated, service_role;


-- ---------------------------------------------------------------------
-- Agenda compartilhada: passa o paciente para a regra de preço.
-- (Só o passo 4 muda; resto idêntico a preco_servico_por_profissional.sql.)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_criar_agendamento_agenda_compartilhada(p_slot_id uuid, p_paciente_id uuid, p_responsavel_id uuid, p_tipo_servico_id uuid, p_local_id uuid, p_empresa_id uuid, p_responsavel_whatsapp bigint, p_status_consulta_id uuid, p_status_pagamento_id uuid)
 RETURNS TABLE(sucesso boolean, mensagem text, agendamento_id uuid, selecao_id uuid, slot_data_hora timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_slot_agenda_id UUID;
  v_slot_data_hora TIMESTAMPTZ;
  v_slot_disponivel BOOLEAN;
  v_profissional_id UUID;
  v_conflito_count INTEGER;
  v_valor_servico NUMERIC;
  v_new_agendamento_id UUID;
  v_new_selecao_id UUID;
BEGIN
  SELECT s.agenda_id, s.data_hora, s.disponivel
  INTO v_slot_agenda_id, v_slot_data_hora, v_slot_disponivel
  FROM agenda_slots s
  WHERE s.id = p_slot_id
  FOR UPDATE NOWAIT;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Slot não encontrado'::TEXT, NULL::UUID, NULL::UUID, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  IF NOT v_slot_disponivel THEN
    RETURN QUERY SELECT FALSE,
      'Este horário já foi reservado por outro paciente. Por favor, escolha outro horário disponível.'::TEXT,
      NULL::UUID, NULL::UUID, v_slot_data_hora;
    RETURN;
  END IF;

  SELECT a.profissional_id INTO v_profissional_id
  FROM agendas_compartilhadas a WHERE a.id = v_slot_agenda_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Agenda não encontrada'::TEXT, NULL::UUID, NULL::UUID, v_slot_data_hora;
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_conflito_count
  FROM agendamentos ag
  WHERE ag.profissional_id = v_profissional_id
    AND ag.data_hora = v_slot_data_hora
    AND ag.ativo = TRUE
    AND ag.status_consulta_id IN (
      SELECT cs.id FROM consulta_status cs WHERE cs.codigo IN ('agendado', 'confirmado', 'em_atendimento')
    );

  IF v_conflito_count > 0 THEN
    UPDATE agenda_slots s SET disponivel = FALSE, updated_at = NOW() WHERE s.id = p_slot_id;
    RETURN QUERY SELECT FALSE,
      'Este horário já está ocupado. A agenda foi atualizada. Por favor, escolha outro horário disponível.'::TEXT,
      NULL::UUID, NULL::UUID, v_slot_data_hora;
    RETURN;
  END IF;

  -- 4. Buscar valor do serviço (paciente -> profissional -> padrão)
  IF NOT EXISTS (SELECT 1 FROM tipo_servicos ts WHERE ts.id = p_tipo_servico_id) THEN
    RETURN QUERY SELECT FALSE, 'Serviço não encontrado'::TEXT, NULL::UUID, NULL::UUID, v_slot_data_hora;
    RETURN;
  END IF;

  v_valor_servico := public.fn_valor_servico(p_tipo_servico_id, v_profissional_id, p_paciente_id);

  UPDATE agenda_slots s SET disponivel = FALSE, updated_at = NOW() WHERE s.id = p_slot_id;

  INSERT INTO agendamentos (
    data_hora, paciente_id, profissional_id, tipo_servico_id, local_id,
    status_consulta_id, status_pagamento_id, valor_servico, observacao,
    agendado_por, empresa_fatura, agenda_compartilhada_id
  ) VALUES (
    v_slot_data_hora, p_paciente_id, v_profissional_id, p_tipo_servico_id, p_local_id,
    p_status_consulta_id, p_status_pagamento_id, v_valor_servico,
    'Agendamento via agenda compartilhada', p_responsavel_id, p_empresa_id, v_slot_agenda_id
  )
  RETURNING id INTO v_new_agendamento_id;

  INSERT INTO agenda_selecoes (
    agenda_id, slot_id, paciente_id, responsavel_id, responsavel_whatsapp,
    tipo_servico_id, local_id, empresa_id, agendamento_id, responsavel_whatsapp_validado_em
  ) VALUES (
    v_slot_agenda_id, p_slot_id, p_paciente_id, p_responsavel_id, p_responsavel_whatsapp,
    p_tipo_servico_id, p_local_id, p_empresa_id, v_new_agendamento_id, NOW()
  )
  RETURNING id INTO v_new_selecao_id;

  RETURN QUERY SELECT TRUE, 'Agendamento criado com sucesso'::TEXT,
    v_new_agendamento_id, v_new_selecao_id, v_slot_data_hora;

EXCEPTION
  WHEN lock_not_available THEN
    RETURN QUERY SELECT FALSE,
      'Este horário está sendo reservado por outro paciente neste momento. Por favor, escolha outro horário.'::TEXT,
      NULL::UUID, NULL::UUID, NULL::TIMESTAMPTZ;
  WHEN OTHERS THEN
    RETURN QUERY SELECT FALSE, ('Erro ao criar agendamento: ' || SQLERRM)::TEXT,
      NULL::UUID, NULL::UUID, NULL::TIMESTAMPTZ;
END;
$function$;
