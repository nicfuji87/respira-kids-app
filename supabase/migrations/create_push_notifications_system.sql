-- ============================================
-- SISTEMA DE NOTIFICAÇÕES PUSH
-- Criado em: 12/10/2025
-- Descrição: Estrutura completa para notificações push via Firebase
-- ============================================

-- ============================================
-- TABELA: user_push_tokens
-- Armazena tokens FCM dos dispositivos dos usuários
-- ============================================
CREATE TABLE IF NOT EXISTS user_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relacionamentos
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pessoa_id UUID REFERENCES pessoas(id) ON DELETE CASCADE,
  
  -- Token FCM
  token TEXT NOT NULL UNIQUE,
  
  -- Metadados do dispositivo
  device_type TEXT DEFAULT 'web' CHECK (device_type IN ('web', 'android', 'ios')),
  device_info JSONB DEFAULT '{}'::jsonb,
  user_agent TEXT,
  
  -- Status
  active BOOLEAN DEFAULT TRUE,
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON user_push_tokens(user_id) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_push_tokens_pessoa_id ON user_push_tokens(pessoa_id) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_push_tokens_token ON user_push_tokens(token) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_push_tokens_last_used ON user_push_tokens(last_used_at);

-- RLS (Row Level Security)
ALTER TABLE user_push_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Usuários podem ver apenas seus próprios tokens
DROP POLICY IF EXISTS "Users can view own tokens" ON user_push_tokens;
CREATE POLICY "Users can view own tokens"
  ON user_push_tokens FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Usuários podem inserir seus próprios tokens
DROP POLICY IF EXISTS "Users can insert own tokens" ON user_push_tokens;
CREATE POLICY "Users can insert own tokens"
  ON user_push_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Usuários podem atualizar seus próprios tokens
DROP POLICY IF EXISTS "Users can update own tokens" ON user_push_tokens;
CREATE POLICY "Users can update own tokens"
  ON user_push_tokens FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Usuários podem deletar seus próprios tokens
DROP POLICY IF EXISTS "Users can delete own tokens" ON user_push_tokens;
CREATE POLICY "Users can delete own tokens"
  ON user_push_tokens FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- TABELA: user_notification_preferences
-- Preferências de notificação por usuário e evento
-- ============================================
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relacionamentos
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pessoa_id UUID REFERENCES pessoas(id) ON DELETE CASCADE,
  
  -- Configuração
  event_type TEXT NOT NULL, -- 'appointment_created', 'patient_created', etc.
  enabled BOOLEAN DEFAULT TRUE,
  
  -- Tipos de notificação
  push_enabled BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, event_type)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_notification_prefs_user ON user_notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_prefs_event ON user_notification_preferences(event_type);
CREATE INDEX IF NOT EXISTS idx_notification_prefs_enabled ON user_notification_preferences(user_id, event_type) WHERE enabled = TRUE AND push_enabled = TRUE;

-- RLS
ALTER TABLE user_notification_preferences ENABLE ROW LEVEL SECURITY;

-- Policy: Usuários podem gerenciar suas próprias preferências
DROP POLICY IF EXISTS "Users can manage own preferences" ON user_notification_preferences;
CREATE POLICY "Users can manage own preferences"
  ON user_notification_preferences FOR ALL
  USING (auth.uid() = user_id);

-- ============================================
-- TABELA: push_notification_queue
-- Fila de notificações push a serem enviadas
-- Similar à webhook_queue, mas para push notifications
-- ============================================
CREATE TABLE IF NOT EXISTS push_notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Destinatário
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL, -- Token FCM do dispositivo
  
  -- Conteúdo da notificação
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB DEFAULT '{}'::jsonb,
  
  -- Evento relacionado
  event_type TEXT NOT NULL,
  event_id UUID, -- ID do registro que gerou a notificação (agendamento, paciente, etc)
  
  -- Status de processamento
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  error_message TEXT,
  
  -- Controle de retry
  next_retry_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_push_queue_status ON push_notification_queue(status, next_retry_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_push_queue_user ON push_notification_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_push_queue_created ON push_notification_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_push_queue_event ON push_notification_queue(event_type, event_id);

-- RLS: Apenas service role pode acessar
ALTER TABLE push_notification_queue ENABLE ROW LEVEL SECURITY;

-- ============================================
-- TABELA: push_notification_logs
-- Log de notificações enviadas (auditoria)
-- ============================================
CREATE TABLE IF NOT EXISTS push_notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Dados da notificação
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  token TEXT,
  title TEXT,
  body TEXT,
  data JSONB,
  event_type TEXT,
  event_id UUID,
  
  -- Resultado
  success BOOLEAN NOT NULL,
  response_data JSONB,
  error_message TEXT,
  
  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_push_logs_user ON push_notification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_push_logs_created ON push_notification_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_push_logs_event ON push_notification_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_push_logs_success ON push_notification_logs(success, created_at);

-- RLS: Apenas leitura pública para analytics
ALTER TABLE push_notification_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access for analytics" ON push_notification_logs;
CREATE POLICY "Public read access for analytics"
  ON push_notification_logs FOR SELECT
  USING (TRUE);

-- ============================================
-- FUNÇÃO: clean_expired_push_tokens
-- Remove tokens não utilizados há mais de 90 dias
-- ============================================
CREATE OR REPLACE FUNCTION clean_expired_push_tokens()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM user_push_tokens
  WHERE last_used_at < NOW() - INTERVAL '90 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RAISE NOTICE 'Removidos % tokens expirados', deleted_count;
  
  RETURN deleted_count;
END;
$$;

-- ============================================
-- FUNÇÃO: dispatch_push_notification
-- Adiciona notificação à fila para ser processada
-- Esta função é chamada pelos triggers de eventos
-- ============================================
CREATE OR REPLACE FUNCTION dispatch_push_notification(
  p_user_ids UUID[],
  p_title TEXT,
  p_body TEXT,
  p_event_type TEXT,
  p_event_id UUID DEFAULT NULL,
  p_data JSONB DEFAULT '{}'::jsonb
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  token_record RECORD;
  inserted_count INTEGER := 0;
BEGIN
  -- Para cada token ativo dos usuários especificados que têm preferência habilitada
  FOR token_record IN
    SELECT DISTINCT 
      upt.user_id,
      upt.token
    FROM user_push_tokens upt
    LEFT JOIN user_notification_preferences unp 
      ON unp.user_id = upt.user_id 
      AND unp.event_type = p_event_type
    WHERE upt.user_id = ANY(p_user_ids)
      AND upt.active = TRUE
      -- Se não tem preferência configurada, considera como habilitado (opt-in default)
      AND (unp.id IS NULL OR (unp.enabled = TRUE AND unp.push_enabled = TRUE))
  LOOP
    -- Inserir na fila
    INSERT INTO push_notification_queue (
      user_id,
      token,
      title,
      body,
      data,
      event_type,
      event_id,
      status,
      next_retry_at
    ) VALUES (
      token_record.user_id,
      token_record.token,
      p_title,
      p_body,
      p_data,
      p_event_type,
      p_event_id,
      'pending',
      NOW()
    );
    
    inserted_count := inserted_count + 1;
  END LOOP;
  
  RAISE NOTICE 'Adicionadas % notificações à fila', inserted_count;
  
  RETURN inserted_count;
END;
$$;

-- ============================================
-- FUNÇÃO: create_default_notification_preferences
-- Cria preferências padrão para novos usuários
-- ============================================
CREATE OR REPLACE FUNCTION create_default_notification_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  pessoa_id_var UUID;
BEGIN
  -- Buscar pessoa_id do usuário
  SELECT pessoa_id INTO pessoa_id_var
  FROM usuarios
  WHERE user_id = NEW.id
  LIMIT 1;
  
  -- Criar preferências padrão para cada tipo de evento (todas habilitadas por padrão)
  INSERT INTO user_notification_preferences (user_id, pessoa_id, event_type, enabled, push_enabled)
  VALUES
    (NEW.id, pessoa_id_var, 'appointment_created', TRUE, TRUE),
    (NEW.id, pessoa_id_var, 'appointment_updated', TRUE, TRUE),
    (NEW.id, pessoa_id_var, 'appointment_cancelled', TRUE, TRUE),
    (NEW.id, pessoa_id_var, 'patient_created', TRUE, TRUE),
    (NEW.id, pessoa_id_var, 'evolution_created', TRUE, TRUE),
    (NEW.id, pessoa_id_var, 'payment_received', TRUE, TRUE)
  ON CONFLICT (user_id, event_type) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Trigger para criar preferências automáticas para novos usuários
DROP TRIGGER IF EXISTS create_notification_preferences_on_signup ON auth.users;
CREATE TRIGGER create_notification_preferences_on_signup
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION create_default_notification_preferences();

-- ============================================
-- TRIGGERS DE EVENTOS
-- Disparam notificações push quando eventos ocorrem
-- ============================================

-- ============================================
-- TRIGGER: Notificar ao criar agendamento
-- ============================================
CREATE OR REPLACE FUNCTION trigger_push_notification_appointment_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  fisio_user_id UUID;
  fisio_nome TEXT;
  paciente_nome TEXT;
  formatted_date TEXT;
  formatted_time TEXT;
BEGIN
  -- Buscar dados necessários
  SELECT u.user_id, p.nome INTO fisio_user_id, fisio_nome
  FROM pessoas p
  INNER JOIN usuarios u ON u.pessoa_id = p.id
  WHERE p.id = NEW.id_fisioterapeuta;
  
  SELECT nome INTO paciente_nome
  FROM pessoas
  WHERE id = NEW.id_paciente;
  
  -- Formatar data e hora
  formatted_date := TO_CHAR(NEW.data, 'DD/MM/YYYY');
  formatted_time := NEW.horario;
  
  -- Enviar notificação push apenas para o fisioterapeuta responsável
  IF fisio_user_id IS NOT NULL THEN
    PERFORM dispatch_push_notification(
      ARRAY[fisio_user_id],
      'Novo Agendamento 📅',
      format('Paciente: %s - %s às %s', paciente_nome, formatted_date, formatted_time),
      'appointment_created',
      NEW.id,
      jsonb_build_object(
        'agendamento_id', NEW.id,
        'paciente_id', NEW.id_paciente,
        'paciente_nome', paciente_nome,
        'fisioterapeuta_nome', fisio_nome,
        'data', formatted_date,
        'horario', formatted_time,
        'tipo', 'appointment'
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS push_notification_appointment_created_trigger ON agendamentos;
CREATE TRIGGER push_notification_appointment_created_trigger
AFTER INSERT ON agendamentos
FOR EACH ROW
EXECUTE FUNCTION trigger_push_notification_appointment_created();

-- ============================================
-- TRIGGER: Notificar ao criar paciente
-- ============================================
CREATE OR REPLACE FUNCTION trigger_push_notification_patient_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_ids UUID[];
BEGIN
  -- Notificar apenas se for realmente um paciente (não profissional)
  IF NEW.tipo_pessoa_id IS NOT NULL AND NEW.tipo_pessoa_id IN (
    SELECT id FROM pessoa_tipos WHERE descricao IN ('Paciente', 'paciente')
  ) THEN
    -- Buscar todos os usuários admin e secretaria
    SELECT ARRAY_AGG(u.user_id)
    INTO user_ids
    FROM usuarios u
    INNER JOIN pessoas p ON p.id = u.pessoa_id
    WHERE p.role IN ('admin', 'secretaria');
    
    IF user_ids IS NOT NULL AND array_length(user_ids, 1) > 0 THEN
      PERFORM dispatch_push_notification(
        user_ids,
        'Novo Paciente Cadastrado 👤',
        format('Paciente: %s', NEW.nome),
        'patient_created',
        NEW.id,
        jsonb_build_object(
          'paciente_id', NEW.id,
          'paciente_nome', NEW.nome,
          'tipo', 'patient'
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS push_notification_patient_created_trigger ON pessoas;
CREATE TRIGGER push_notification_patient_created_trigger
AFTER INSERT ON pessoas
FOR EACH ROW
EXECUTE FUNCTION trigger_push_notification_patient_created();

-- ============================================
-- TRIGGER: Notificar ao criar evolução
-- ============================================
CREATE OR REPLACE FUNCTION trigger_push_notification_evolution_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  fisio_user_id UUID;
  fisio_nome TEXT;
  paciente_nome TEXT;
BEGIN
  -- Buscar dados necessários
  SELECT u.user_id, p.nome INTO fisio_user_id, fisio_nome
  FROM pessoas p
  INNER JOIN usuarios u ON u.pessoa_id = p.id
  WHERE p.id = NEW.id_pessoa_criador;
  
  SELECT nome INTO paciente_nome
  FROM pessoas
  WHERE id = NEW.id_paciente;
  
  -- Notificar o fisioterapeuta que criou a evolução
  IF fisio_user_id IS NOT NULL THEN
    PERFORM dispatch_push_notification(
      ARRAY[fisio_user_id],
      'Evolução Salva ✅',
      format('Evolução do paciente %s foi registrada', paciente_nome),
      'evolution_created',
      NEW.id,
      jsonb_build_object(
        'evolucao_id', NEW.id,
        'paciente_id', NEW.id_paciente,
        'paciente_nome', paciente_nome,
        'fisioterapeuta_nome', fisio_nome,
        'tipo', 'evolution'
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS push_notification_evolution_created_trigger ON relatorio_evolucao;
CREATE TRIGGER push_notification_evolution_created_trigger
AFTER INSERT ON relatorio_evolucao
FOR EACH ROW
EXECUTE FUNCTION trigger_push_notification_evolution_created();

-- ============================================
-- COMENTÁRIOS E DOCUMENTAÇÃO
-- ============================================

COMMENT ON TABLE user_push_tokens IS 'Armazena tokens FCM dos dispositivos dos usuários para notificações push';
COMMENT ON TABLE user_notification_preferences IS 'Preferências de notificação de cada usuário por tipo de evento';
COMMENT ON TABLE push_notification_queue IS 'Fila de notificações push pendentes para serem enviadas';
COMMENT ON TABLE push_notification_logs IS 'Log de auditoria de todas as notificações push enviadas';

COMMENT ON FUNCTION dispatch_push_notification IS 'Adiciona notificação push à fila para processamento';
COMMENT ON FUNCTION clean_expired_push_tokens IS 'Remove tokens FCM não utilizados há mais de 90 dias';

-- ============================================
-- FIM DA MIGRAÇÃO
-- ============================================

-- Log de sucesso
DO $$
BEGIN
  RAISE NOTICE '✅ Sistema de notificações push criado com sucesso!';
  RAISE NOTICE '📱 Tabelas criadas: user_push_tokens, user_notification_preferences, push_notification_queue, push_notification_logs';
  RAISE NOTICE '🔔 Triggers criados: appointment_created, patient_created, evolution_created';
  RAISE NOTICE '⚡ Próximo passo: Deploy da Edge Function send-push-notification';
END $$;

