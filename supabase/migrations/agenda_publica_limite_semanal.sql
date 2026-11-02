-- Agenda pública: um agendamento por semana por paciente (02/11/2026)
--
-- Pedido do dono: famílias estavam pegando 2 horários na mesma semana (e
-- depois cancelando um). Regra: pela agenda pública, cada paciente marca UMA
-- sessão por semana; pode cancelar e marcar outra, mas uma de cada vez.
-- Exceção: quem vem 2x (ou 3x) na semana. O limite é o maior entre
--   - a frequência do cadastro de paciente fixo (2x/semana = 2, 3x = 3...);
--   - o histórico: k sessões REALIZADAS (já passadas, sem cancelamento nem
--     falta) na mesma semana em pelo menos 2 semanas dos últimos 120 dias.
--     Uma semana só não basta, para um engano antigo (justamente o problema)
--     não liberar para sempre. Em 02/11/2026: 5 de 119 pacientes motores com 2.
-- Conta toda consulta ativa da semana (seg-dom) do mesmo tipo (motora conta
-- com motora), venha de onde vier, exceto cancelada/erro/reagendada.
-- Só vale para a agenda pública; a equipe marca como quiser pela agenda.

CREATE OR REPLACE FUNCTION public.fn_paciente_limite_semanal(p_paciente_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH semanas AS (
    SELECT date_trunc('week', a.data_hora AT TIME ZONE 'UTC') AS w, count(*) AS n
      FROM public.agendamentos a
      JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
      JOIN public.tipo_servicos ts ON ts.id = a.tipo_servico_id
     WHERE a.paciente_id = p_paciente_id
       AND a.ativo
       -- Realizada = já passou e não foi cancelada nem falta. Sessão motora
       -- quase nunca fica "finalizado" (só finaliza com evolução, ~2%).
       AND cs.codigo IN ('finalizado', 'confirmado', 'agendado', 'em_atendimento')
       AND ts.nome ~* 'motor'
       AND a.data_hora > now() - interval '120 days'
       AND (a.data_hora AT TIME ZONE 'UTC') < (now() AT TIME ZONE 'America/Sao_Paulo')
     GROUP BY 1
  ), hist AS (
    SELECT max(k) AS k FROM generate_series(2, 5) k
     WHERE (SELECT count(*) FROM semanas WHERE n >= k) >= 2
  ), fixo AS (
    SELECT CASE WHEN r.semanas = 1 THEN r.sessoes ELSE 1 END AS k
      FROM public.pacientes_fixos f
      CROSS JOIN LATERAL public.fn_paciente_fixo_ritmo(f.frequencia) r
     WHERE f.paciente_id = p_paciente_id AND f.ativo
  )
  SELECT least(5, greatest(1, coalesce((SELECT k FROM hist), 1), coalesce((SELECT k FROM fixo), 1)))::int;
$$;

-- Consultas ativas do paciente na semana do horário (mesmo tipo de serviço)
CREATE OR REPLACE FUNCTION public.fn_paciente_marcadas_semana(
  p_paciente_id uuid,
  p_data_hora timestamptz,
  p_tipo_servico_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ref AS (
    SELECT date_trunc('week', p_data_hora AT TIME ZONE 'UTC') AS ini,
           coalesce((SELECT nome ~* 'motor' FROM public.tipo_servicos WHERE id = p_tipo_servico_id), false) AS motor
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'agendamento_id', a.id,
           'data_hora', to_char(a.data_hora AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI'),
           'profissional_nome', split_part(pr.nome, ' ', 1)) ORDER BY a.data_hora), '[]'::jsonb)
    FROM public.agendamentos a
    JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
    JOIN public.tipo_servicos ts ON ts.id = a.tipo_servico_id
    LEFT JOIN public.pessoas pr ON pr.id = a.profissional_id
    , ref
   WHERE a.paciente_id = p_paciente_id
     AND a.ativo
     AND cs.codigo NOT IN ('cancelado', 'erro', 'reagendado')
     AND (a.data_hora AT TIME ZONE 'UTC') >= ref.ini
     AND (a.data_hora AT TIME ZONE 'UTC') < ref.ini + interval '7 days'
     AND (CASE WHEN ref.motor THEN ts.nome ~* 'motor' ELSE a.tipo_servico_id = p_tipo_servico_id END);
$$;

-- Texto para a família quando o limite da semana já foi atingido
CREATE OR REPLACE FUNCTION public.fn_paciente_limite_semanal_msg(p_limite integer, p_marcadas jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN p_limite <= 1 THEN
           'Já existe um horário marcado nesta semana ('
           || to_char((p_marcadas->0->>'data_hora')::timestamp, 'DD/MM "às" HH24:MI')
           || '). Pela agenda online é um horário por semana. Para trocar, cancele o horário atual ou fale com a gente pelo WhatsApp.'
         ELSE
           'Já existem ' || p_limite || ' horários marcados nesta semana ('
           || (SELECT string_agg(to_char((x->>'data_hora')::timestamp, 'DD/MM "às" HH24:MI'), ' e ')
                 FROM jsonb_array_elements(p_marcadas) x)
           || '). Para trocar, cancele um deles ou fale com a gente pelo WhatsApp.'
         END;
$$;

-- Para a página pública: quantos pode marcar na semana desta agenda
CREATE OR REPLACE FUNCTION public.fn_public_agenda_semana_paciente(
  p_agenda_id uuid,
  p_paciente_id uuid,
  p_tipo_servico_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ini date;
  v_serv uuid;
  v_limite int;
  v_marcadas jsonb;
BEGIN
  SELECT ac.data_inicio INTO v_ini FROM public.agendas_compartilhadas ac WHERE ac.id = p_agenda_id AND ac.ativo;
  IF v_ini IS NULL THEN
    RETURN jsonb_build_object('pode_marcar', true);
  END IF;
  v_serv := coalesce(p_tipo_servico_id,
                     (SELECT s.tipo_servico_id FROM public.agenda_servicos s WHERE s.agenda_id = p_agenda_id LIMIT 1));
  v_limite := public.fn_paciente_limite_semanal(p_paciente_id);
  v_marcadas := public.fn_paciente_marcadas_semana(p_paciente_id, v_ini::timestamp AT TIME ZONE 'UTC', v_serv);
  RETURN jsonb_build_object(
    'limite', v_limite,
    'marcadas', v_marcadas,
    'pode_marcar', jsonb_array_length(v_marcadas) < v_limite,
    'mensagem', CASE WHEN jsonb_array_length(v_marcadas) >= v_limite
                     THEN public.fn_paciente_limite_semanal_msg(v_limite, v_marcadas) END);
END;
$$;

-- Criação pela agenda pública: mesma função de antes + trava da semana
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
  v_limite INTEGER;
  v_marcadas JSONB;
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

  -- Um agendamento por semana (ou o que o histórico/cadastro permitir).
  -- Trava por paciente para duas abas ao mesmo tempo não passarem juntas.
  PERFORM pg_advisory_xact_lock(hashtext('agenda_publica_paciente:' || p_paciente_id::text));
  v_limite := public.fn_paciente_limite_semanal(p_paciente_id);
  v_marcadas := public.fn_paciente_marcadas_semana(p_paciente_id, v_slot_data_hora, p_tipo_servico_id);
  IF jsonb_array_length(v_marcadas) >= v_limite THEN
    RETURN QUERY SELECT FALSE, public.fn_paciente_limite_semanal_msg(v_limite, v_marcadas),
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

REVOKE ALL ON FUNCTION public.fn_paciente_limite_semanal(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_paciente_marcadas_semana(uuid, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_paciente_limite_semanal_msg(integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_public_agenda_semana_paciente(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_public_agenda_semana_paciente(uuid, uuid, uuid) TO anon, authenticated;
