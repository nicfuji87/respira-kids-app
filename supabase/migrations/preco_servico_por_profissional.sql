-- =====================================================================
-- Preço de serviço por profissional
-- ---------------------------------------------------------------------
-- O serviço continua um só (tipo_servicos.valor = preço padrão). Quando
-- uma profissional cobra diferente, o preço dela fica em
-- profissional_servicos.valor. Regra única: fn_valor_servico(tipo, prof)
-- = preço da profissional se houver, senão o padrão do serviço.
--
-- O valor é gravado em agendamentos.valor_servico na criação, então
-- mudar preço aqui só afeta agendamentos novos (histórico intacto).
--
-- Out/2026: Flávia e Bruna passam a cobrar 280 (DU) e 300 (FDS) na
-- fisioterapia respiratória; Beatriz segue no padrão (260 / 280).
-- =====================================================================

ALTER TABLE public.profissional_servicos
  ADD COLUMN IF NOT EXISTS valor numeric(10,2)
    CHECK (valor IS NULL OR valor >= 0);

COMMENT ON COLUMN public.profissional_servicos.valor IS
  'Preço deste serviço para esta profissional. NULL = usa tipo_servicos.valor.';

-- Leitura para usuários logados (preço não é sensível); escrita só admin.
DROP POLICY IF EXISTS profissional_servicos_select_authenticated ON public.profissional_servicos;
CREATE POLICY profissional_servicos_select_authenticated
  ON public.profissional_servicos FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS profissional_servicos_admin_write ON public.profissional_servicos;
CREATE POLICY profissional_servicos_admin_write
  ON public.profissional_servicos FOR ALL TO authenticated
  USING ((SELECT public.fn_rls_admin_aprovado()))
  WITH CHECK ((SELECT public.fn_rls_admin_aprovado()));


-- ---------------------------------------------------------------------
-- Regra única de preço
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_valor_servico(
  p_tipo_servico_id uuid,
  p_profissional_id uuid
)
RETURNS numeric
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    (SELECT ps.valor
       FROM public.profissional_servicos ps
      WHERE ps.id_tipo_servico = p_tipo_servico_id
        AND ps.id_profissional = p_profissional_id
        AND ps.ativo
        AND ps.valor IS NOT NULL),
    (SELECT ts.valor FROM public.tipo_servicos ts WHERE ts.id = p_tipo_servico_id)
  );
$$;

REVOKE ALL ON FUNCTION public.fn_valor_servico(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_valor_servico(uuid, uuid) TO authenticated, service_role;


-- ---------------------------------------------------------------------
-- Agenda compartilhada (link público): usa o preço da profissional
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
  -- 1. LOCK do slot e extrair valores
  SELECT
    s.agenda_id,
    s.data_hora,
    s.disponivel
  INTO
    v_slot_agenda_id,
    v_slot_data_hora,
    v_slot_disponivel
  FROM agenda_slots s
  WHERE s.id = p_slot_id
  FOR UPDATE NOWAIT;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      FALSE,
      'Slot não encontrado'::TEXT,
      NULL::UUID,
      NULL::UUID,
      NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  IF NOT v_slot_disponivel THEN
    RETURN QUERY SELECT
      FALSE,
      'Este horário já foi reservado por outro paciente. Por favor, escolha outro horário disponível.'::TEXT,
      NULL::UUID,
      NULL::UUID,
      v_slot_data_hora;
    RETURN;
  END IF;

  -- 2. Buscar profissional da agenda
  SELECT a.profissional_id
  INTO v_profissional_id
  FROM agendas_compartilhadas a
  WHERE a.id = v_slot_agenda_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      FALSE,
      'Agenda não encontrada'::TEXT,
      NULL::UUID,
      NULL::UUID,
      v_slot_data_hora;
    RETURN;
  END IF;

  -- 3. Verificar conflito de horário do profissional
  SELECT COUNT(*)
  INTO v_conflito_count
  FROM agendamentos ag
  WHERE ag.profissional_id = v_profissional_id
    AND ag.data_hora = v_slot_data_hora
    AND ag.ativo = TRUE
    AND ag.status_consulta_id IN (
      SELECT cs.id FROM consulta_status cs WHERE cs.codigo IN ('agendado', 'confirmado', 'em_atendimento')
    );

  IF v_conflito_count > 0 THEN
    UPDATE agenda_slots s
    SET disponivel = FALSE, updated_at = NOW()
    WHERE s.id = p_slot_id;

    RETURN QUERY SELECT
      FALSE,
      'Este horário já está ocupado. A agenda foi atualizada. Por favor, escolha outro horário disponível.'::TEXT,
      NULL::UUID,
      NULL::UUID,
      v_slot_data_hora;
    RETURN;
  END IF;

  -- 4. Buscar valor do serviço (preço da profissional, se houver)
  IF NOT EXISTS (SELECT 1 FROM tipo_servicos ts WHERE ts.id = p_tipo_servico_id) THEN
    RETURN QUERY SELECT
      FALSE,
      'Serviço não encontrado'::TEXT,
      NULL::UUID,
      NULL::UUID,
      v_slot_data_hora;
    RETURN;
  END IF;

  v_valor_servico := public.fn_valor_servico(p_tipo_servico_id, v_profissional_id);

  -- 5. RESERVAR o slot
  UPDATE agenda_slots s
  SET disponivel = FALSE, updated_at = NOW()
  WHERE s.id = p_slot_id;

  -- 6. CRIAR O AGENDAMENTO (dentro da mesma transação, ignora RLS por ser SECURITY DEFINER)
  INSERT INTO agendamentos (
    data_hora,
    paciente_id,
    profissional_id,
    tipo_servico_id,
    local_id,
    status_consulta_id,
    status_pagamento_id,
    valor_servico,
    observacao,
    agendado_por,
    empresa_fatura,
    agenda_compartilhada_id
  ) VALUES (
    v_slot_data_hora,
    p_paciente_id,
    v_profissional_id,
    p_tipo_servico_id,
    p_local_id,
    p_status_consulta_id,
    p_status_pagamento_id,
    v_valor_servico,
    'Agendamento via agenda compartilhada',
    p_responsavel_id,
    p_empresa_id,
    v_slot_agenda_id
  )
  RETURNING id INTO v_new_agendamento_id;

  -- 7. Criar registro de seleção com o agendamento_id já preenchido
  INSERT INTO agenda_selecoes (
    agenda_id,
    slot_id,
    paciente_id,
    responsavel_id,
    responsavel_whatsapp,
    tipo_servico_id,
    local_id,
    empresa_id,
    agendamento_id,
    responsavel_whatsapp_validado_em
  ) VALUES (
    v_slot_agenda_id,
    p_slot_id,
    p_paciente_id,
    p_responsavel_id,
    p_responsavel_whatsapp,
    p_tipo_servico_id,
    p_local_id,
    p_empresa_id,
    v_new_agendamento_id,
    NOW()
  )
  RETURNING id INTO v_new_selecao_id;

  -- 8. Retornar sucesso
  RETURN QUERY SELECT
    TRUE,
    'Agendamento criado com sucesso'::TEXT,
    v_new_agendamento_id,
    v_new_selecao_id,
    v_slot_data_hora;

EXCEPTION
  WHEN lock_not_available THEN
    RETURN QUERY SELECT
      FALSE,
      'Este horário está sendo reservado por outro paciente neste momento. Por favor, escolha outro horário.'::TEXT,
      NULL::UUID,
      NULL::UUID,
      NULL::TIMESTAMPTZ;
  WHEN OTHERS THEN
    RETURN QUERY SELECT
      FALSE,
      ('Erro ao criar agendamento: ' || SQLERRM)::TEXT,
      NULL::UUID,
      NULL::UUID,
      NULL::TIMESTAMPTZ;
END;
$function$;


-- ---------------------------------------------------------------------
-- Tabela de preços da Ju: serviço com preço diferente por profissional
-- vira uma linha por faixa ("com Flávia ou Bruna" / "com as demais").
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ju_servicos()
RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH base AS (
    SELECT ts.id,
           regexp_replace(regexp_replace(
             btrim(regexp_replace(ts.nome, '\s+', ' ', 'g')),
             '\s*-\s*DU$', ' (dias úteis)'),
             '\s*-\s*FDS$', ' (fins de semana e feriados)') AS nome,
           ts.valor
    FROM public.tipo_servicos ts
    WHERE ts.ativo AND ts.valor > 0 AND ts.nome !~* 'social'
  ),
  excecoes AS (
    SELECT ps.id_tipo_servico AS id, ps.valor,
           string_agg(split_part(btrim(p.nome), ' ', 1), ' ou ' ORDER BY p.nome) AS profissionais
    FROM public.profissional_servicos ps
    JOIN public.pessoas p ON p.id = ps.id_profissional
    WHERE ps.ativo AND ps.valor IS NOT NULL
    GROUP BY ps.id_tipo_servico, ps.valor
  ),
  linhas AS (
    SELECT b.nome || CASE WHEN EXISTS (SELECT 1 FROM excecoes e WHERE e.id = b.id)
                          THEN ' - com as demais fisioterapeutas' ELSE '' END AS nome,
           b.valor
    FROM base b
    UNION ALL
    SELECT b.nome || ' - com ' || e.profissionais, e.valor
    FROM base b JOIN excecoes e ON e.id = b.id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('servico', l.nome, 'valor', l.valor) ORDER BY l.nome), '[]'::jsonb)
  FROM linhas l;
$$;


-- ---------------------------------------------------------------------
-- Preços de out/2026 (Flávia e Bruna, respiratória DU e FDS)
-- ---------------------------------------------------------------------
INSERT INTO public.profissional_servicos (id_profissional, id_tipo_servico, valor, ativo)
SELECT p.id, ts.id, v.valor, true
FROM (VALUES
  ('Flávia da Silva Pacheco',   'Fisioterapia Respiratória - DU',  280.00),
  ('Flávia da Silva Pacheco',   'Fisioterapia Respiratória - FDS', 300.00),
  ('Bruna Cury Lourenço Peres', 'Fisioterapia Respiratória - DU',  280.00),
  ('Bruna Cury Lourenço Peres', 'Fisioterapia Respiratória - FDS', 300.00)
) AS v(profissional, servico, valor)
JOIN public.pessoas p ON p.nome = v.profissional AND p.ativo
JOIN public.tipo_servicos ts
  ON regexp_replace(btrim(ts.nome), '\s+', ' ', 'g') = v.servico
ON CONFLICT (id_profissional, id_tipo_servico)
  DO UPDATE SET valor = EXCLUDED.valor, ativo = true, updated_at = now();
