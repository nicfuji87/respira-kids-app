-- ============================================================================
-- Lembrete de consulta MANUAL pelo WhatsApp (botão na visão Agenda)
-- ============================================================================
--
-- MOTIVAÇÃO: mesma da tela /cobrancas — a API não oficial de WhatsApp usada
-- pelo n8n cai, e com ela o lembrete automático de consulta
-- (`lembretes_consulta`, cron `processar_lembretes_consulta` de 5 em 5 min).
-- Este é o canal manual: a secretária clica no card da agenda, abre o WhatsApp
-- Web já na conversa do responsável com a mensagem escrita, e aperta enter.
--
-- Não substitui a régua automática: quando o n8n voltar, os dois convivem —
-- por isso o log é separado por canal.
--
-- O QUE FALTA NA VIEW: `vw_agendamentos_completos` tem `responsavel_legal_id`
-- mas NÃO tem o telefone dele, e não tem endereço nenhum (só `local_nome`).
-- A mensagem precisa dos dois. Daí a RPC — que também evita fazer 3 queries
-- encadeadas no cliente a cada clique.
--
-- ENDEREÇO: sai de `locais_atendimento` (clínica/externa) ou do cadastro do
-- paciente (domiciliar). Ver nota sobre o complemento fixo em
-- src/lib/lembrete-mensagem.ts.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Log dos envios manuais
-- ----------------------------------------------------------------------------
-- Espelha `cobranca_disparo_log`: status 'aberto' (abrir a conversa não prova
-- que a mensagem foi enviada) e canal separado do automático.
CREATE TABLE IF NOT EXISTS public.lembrete_manual_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id uuid NOT NULL REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  canal          text NOT NULL DEFAULT 'whatsapp_manual',
  status         text NOT NULL DEFAULT 'aberto',
  telefone       text,
  registrado_por text,
  criado_em      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lembrete_manual_log_agendamento
  ON public.lembrete_manual_log (agendamento_id, criado_em DESC);

ALTER TABLE public.lembrete_manual_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lml_staff ON public.lembrete_manual_log;
CREATE POLICY lml_staff ON public.lembrete_manual_log
  FOR ALL USING (
    public.is_admin() OR public.is_secretaria() OR public.is_profissional()
  );

DROP POLICY IF EXISTS lml_service ON public.lembrete_manual_log;
CREATE POLICY lml_service ON public.lembrete_manual_log
  FOR ALL TO service_role USING (true);

COMMENT ON TABLE public.lembrete_manual_log IS
  'Cliques em "enviar lembrete pelo WhatsApp" na visao Agenda. canal=whatsapp_manual separa do lembrete automatico do n8n.';

-- ----------------------------------------------------------------------------
-- 2. Dados para montar a mensagem
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_dados_lembrete_agendamento(
  p_agendamento_id uuid
)
RETURNS TABLE (
  agendamento_id        uuid,
  data_hora             timestamptz,
  paciente_nome         text,
  profissional_nome     text,
  servico               text,
  tipo_local            text,
  local_nome            text,
  destinatario_id       uuid,
  destinatario_nome     text,
  destinatario_telefone bigint,
  endereco_logradouro   text,
  endereco_numero       text,
  endereco_complemento  text,
  endereco_bairro       text,
  endereco_cidade       text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profissional_id uuid;
BEGIN
  SELECT a.profissional_id INTO v_profissional_id
  FROM public.agendamentos a
  WHERE a.id = p_agendamento_id;

  IF v_profissional_id IS NULL THEN
    RAISE EXCEPTION 'Agendamento nao encontrado';
  END IF;

  -- Profissional só manda lembrete do próprio atendimento.
  IF NOT (
    public.is_admin()
    OR public.is_secretaria()
    OR (public.is_profissional() AND v_profissional_id = public.get_current_pessoa_id())
  ) THEN
    RAISE EXCEPTION 'Sem permissao para enviar lembrete deste agendamento';
  END IF;

  RETURN QUERY
  WITH ag AS (
    SELECT
      a.id, a.data_hora, a.paciente_id, a.local_id,
      pac.nome  AS paciente_nome,
      pac.telefone AS paciente_telefone,
      pac.id_endereco AS paciente_endereco_id,
      pac.numero_endereco AS paciente_numero,
      pac.complemento_endereco AS paciente_complemento,
      prof.nome AS profissional_nome,
      COALESCE(NULLIF(ts.descricao, ''), ts.nome) AS servico,
      l.tipo_local, l.nome AS local_nome,
      l.id_endereco AS local_endereco_id,
      l.numero_endereco AS local_numero,
      l.complemento_endereco AS local_complemento
    FROM public.agendamentos a
    JOIN public.pessoas pac  ON pac.id  = a.paciente_id
    JOIN public.pessoas prof ON prof.id = a.profissional_id
    LEFT JOIN public.tipo_servicos ts ON ts.id = a.tipo_servico_id
    LEFT JOIN public.locais_atendimento l ON l.id = a.local_id
    WHERE a.id = p_agendamento_id
  ),
  -- Destinatário = responsável legal; se o paciente não tem, é ele mesmo.
  resp AS (
    SELECT r.id, r.nome, r.telefone
    FROM public.pessoa_responsaveis pr
    JOIN public.pessoas r ON r.id = pr.id_responsavel
    WHERE pr.id_pessoa = (SELECT paciente_id FROM ag)
      AND pr.ativo IS NOT FALSE
      AND pr.tipo_responsabilidade IN ('legal', 'ambos')
      AND r.telefone IS NOT NULL
    ORDER BY CASE pr.tipo_responsabilidade WHEN 'legal' THEN 0 ELSE 1 END
    LIMIT 1
  )
  SELECT
    ag.id,
    ag.data_hora,
    ag.paciente_nome,
    ag.profissional_nome,
    ag.servico,
    ag.tipo_local,
    ag.local_nome,
    COALESCE(resp.id, ag.paciente_id),
    COALESCE(resp.nome, ag.paciente_nome),
    COALESCE(resp.telefone, ag.paciente_telefone),
    CASE WHEN ag.tipo_local = 'domiciliar' THEN end_pac.logradouro ELSE end_loc.logradouro END,
    CASE WHEN ag.tipo_local = 'domiciliar' THEN ag.paciente_numero ELSE ag.local_numero END,
    CASE WHEN ag.tipo_local = 'domiciliar' THEN ag.paciente_complemento ELSE ag.local_complemento END,
    CASE WHEN ag.tipo_local = 'domiciliar' THEN end_pac.bairro ELSE end_loc.bairro END,
    CASE WHEN ag.tipo_local = 'domiciliar' THEN end_pac.cidade ELSE end_loc.cidade END
  FROM ag
  LEFT JOIN resp ON true
  LEFT JOIN public.enderecos end_pac ON end_pac.id = ag.paciente_endereco_id
  LEFT JOIN public.enderecos end_loc ON end_loc.id = ag.local_endereco_id;
END;
$$;

COMMENT ON FUNCTION public.fn_dados_lembrete_agendamento IS
  'Dados para montar o lembrete manual de consulta: telefone do responsavel legal e endereco (local ou paciente), que a vw_agendamentos_completos nao expoe.';

-- ----------------------------------------------------------------------------
-- 3. Registrar o clique
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_registrar_lembrete_manual(
  p_agendamento_id uuid,
  p_telefone       text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id uuid;
  v_autor  text;
  v_profissional_id uuid;
BEGIN
  SELECT a.profissional_id INTO v_profissional_id
  FROM public.agendamentos a
  WHERE a.id = p_agendamento_id;

  IF v_profissional_id IS NULL THEN
    RAISE EXCEPTION 'Agendamento nao encontrado';
  END IF;

  IF NOT (
    public.is_admin()
    OR public.is_secretaria()
    OR (public.is_profissional() AND v_profissional_id = public.get_current_pessoa_id())
  ) THEN
    RAISE EXCEPTION 'Sem permissao para registrar lembrete deste agendamento';
  END IF;

  SELECT p.nome INTO v_autor
  FROM public.pessoas p
  WHERE p.auth_user_id = auth.uid()
  LIMIT 1;

  INSERT INTO public.lembrete_manual_log (
    agendamento_id, canal, status, telefone, registrado_por
  ) VALUES (
    p_agendamento_id, 'whatsapp_manual', 'aberto', p_telefone, COALESCE(v_autor, 'app')
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

COMMENT ON FUNCTION public.fn_registrar_lembrete_manual IS
  'Registra o clique de "enviar lembrete pelo WhatsApp" na visao Agenda (status=aberto).';

REVOKE ALL ON FUNCTION public.fn_dados_lembrete_agendamento(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_registrar_lembrete_manual(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_dados_lembrete_agendamento(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_registrar_lembrete_manual(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_dados_lembrete_agendamento(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_registrar_lembrete_manual(uuid, text) TO service_role;
