-- ============================================
-- MIGRATION: Corrigir triggers de push notifications
-- Data: 2025-10-13
-- Descrição: Corrige triggers que estavam quebrando criação de agendamentos
--            - Usa auth_user_id em vez de pessoa_id diretamente
--            - Corrige ordem dos parâmetros
--            - Adiciona validações
-- ============================================

-- ============================================
-- DESABILITAR TRIGGERS PROBLEMÁTICAS TEMPORARIAMENTE
-- ============================================
DROP TRIGGER IF EXISTS trigger_appointment_push ON public.agendamentos;
DROP TRIGGER IF EXISTS trigger_patient_push ON public.pessoas;

-- ============================================
-- CORRIGIR FUNÇÃO: Notificar PROFISSIONAL sobre AGENDAMENTO
-- ============================================
CREATE OR REPLACE FUNCTION dispatch_push_notification_on_appointment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profissional_auth_user_id UUID;
  v_profissional_nome TEXT;
  v_paciente_nome TEXT;
  v_servico_nome TEXT;
  v_data_formatada TEXT;
BEGIN
  -- Buscar dados do agendamento E o auth_user_id do profissional
  SELECT 
    p_prof.auth_user_id,
    p_prof.nome,
    p_pac.nome,
    ts.nome,
    TO_CHAR(NEW.data_hora AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
  INTO 
    v_profissional_auth_user_id,
    v_profissional_nome,
    v_paciente_nome,
    v_servico_nome,
    v_data_formatada
  FROM pessoas p_prof
  CROSS JOIN pessoas p_pac
  CROSS JOIN tipo_servicos ts
  WHERE p_prof.id = NEW.profissional_id
    AND p_pac.id = NEW.paciente_id
    AND ts.id = NEW.tipo_servico_id;

  -- Verificar se profissional tem auth_user_id
  IF v_profissional_auth_user_id IS NULL THEN
    RAISE NOTICE 'Profissional % não tem auth_user_id, notificação não enviada', NEW.profissional_id;
    RETURN NEW;
  END IF;

  -- Enviar notificação para o PROFISSIONAL (ordem correta dos parâmetros)
  PERFORM dispatch_push_notification(
    ARRAY[v_profissional_auth_user_id],  -- p_user_ids (array de UUIDs)
    '📅 Novo Agendamento',                -- p_title
    format(                               -- p_body
      'Paciente: %s | %s em %s',
      v_paciente_nome,
      v_servico_nome,
      v_data_formatada
    ),
    'appointment_created',                -- p_event_type
    NEW.id,                               -- p_event_id
    jsonb_build_object(                   -- p_data
      'type', 'appointment',
      'appointment_id', NEW.id::TEXT,
      'patient_id', NEW.paciente_id::TEXT,
      'patient_name', v_paciente_nome,
      'service_name', v_servico_nome,
      'date_time', v_data_formatada,
      'url', '/agenda'
    )
  );

  RETURN NEW;
END;
$$;

-- ============================================
-- CORRIGIR FUNÇÃO: Notificar ADMINS sobre PACIENTE
-- ============================================
CREATE OR REPLACE FUNCTION dispatch_push_notification_on_patient()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_auth_user_ids UUID[];
  v_responsavel_nome TEXT;
  v_pediatra_nome TEXT;
  v_tipo_pessoa_codigo TEXT;
BEGIN
  -- Verificar se é um paciente
  SELECT codigo INTO v_tipo_pessoa_codigo
  FROM pessoa_tipos
  WHERE id = NEW.id_tipo_pessoa;

  -- Só notificar se for paciente
  IF v_tipo_pessoa_codigo != 'paciente' THEN
    RETURN NEW;
  END IF;

  -- Buscar responsável legal
  SELECT p.nome INTO v_responsavel_nome
  FROM pessoa_responsaveis pr
  JOIN pessoas p ON p.id = pr.id_responsavel
  WHERE pr.id_pessoa = NEW.id
    AND pr.ativo = true
    AND pr.tipo_responsabilidade IN ('legal', 'ambos')
    AND (pr.data_fim IS NULL OR pr.data_fim > CURRENT_DATE)
  ORDER BY pr.created_at DESC
  LIMIT 1;

  -- Buscar pediatra
  SELECT p.nome INTO v_pediatra_nome
  FROM paciente_pediatra pp
  JOIN pessoa_pediatra ped ON ped.id = pp.pediatra_id
  JOIN pessoas p ON p.id = ped.pessoa_id
  WHERE pp.paciente_id = NEW.id
    AND pp.ativo = true
    AND (pp.data_fim IS NULL OR pp.data_fim > CURRENT_DATE)
  ORDER BY pp.created_at DESC
  LIMIT 1;

  -- Buscar auth_user_ids de TODOS os ADMINS ativos
  SELECT ARRAY_AGG(p.auth_user_id)
  INTO v_admin_auth_user_ids
  FROM pessoas p
  WHERE p.role = 'admin'
    AND p.ativo = true
    AND p.bloqueado = false
    AND p.auth_user_id IS NOT NULL;

  -- Se não houver admins com auth_user_id, não enviar
  IF v_admin_auth_user_ids IS NULL OR array_length(v_admin_auth_user_ids, 1) = 0 THEN
    RAISE NOTICE 'Nenhum admin com auth_user_id encontrado';
    RETURN NEW;
  END IF;

  -- Enviar notificação para TODOS os ADMINS (ordem correta dos parâmetros)
  PERFORM dispatch_push_notification(
    v_admin_auth_user_ids,                -- p_user_ids (array)
    '🆕 Novo Paciente Cadastrado',        -- p_title
    format(                               -- p_body
      'Paciente: %s%s%s',
      NEW.nome,
      CASE WHEN v_responsavel_nome IS NOT NULL THEN ' | Resp.: ' || v_responsavel_nome ELSE '' END,
      CASE WHEN v_pediatra_nome IS NOT NULL THEN ' | Pediatra: ' || v_pediatra_nome ELSE '' END
    ),
    'patient_created',                    -- p_event_type
    NEW.id,                               -- p_event_id
    jsonb_build_object(                   -- p_data
      'type', 'patient',
      'patient_id', NEW.id::TEXT,
      'patient_name', NEW.nome,
      'responsavel_name', COALESCE(v_responsavel_nome, ''),
      'pediatra_name', COALESCE(v_pediatra_nome, ''),
      'url', '/pacientes/' || NEW.id::TEXT
    )
  );

  RETURN NEW;
END;
$$;

-- ============================================
-- RECRIAR TRIGGERS
-- ============================================

-- Trigger: Novo agendamento → Notificar PROFISSIONAL
CREATE TRIGGER trigger_appointment_push
AFTER INSERT ON public.agendamentos
FOR EACH ROW
EXECUTE FUNCTION dispatch_push_notification_on_appointment();

-- Trigger: Novo paciente → Notificar ADMINS
CREATE TRIGGER trigger_patient_push
AFTER INSERT ON public.pessoas
FOR EACH ROW
EXECUTE FUNCTION dispatch_push_notification_on_patient();

-- Comentários
COMMENT ON FUNCTION dispatch_push_notification_on_appointment() IS 
'CORRIGIDO: Envia notificação push para o PROFISSIONAL usando auth_user_id com parâmetros corretos';

COMMENT ON FUNCTION dispatch_push_notification_on_patient() IS 
'CORRIGIDO: Envia notificação push para ADMINS usando auth_user_id com parâmetros corretos';

