-- ============================================================================
-- Enviar relatório clínico ao responsável — RPC no lugar do INSERT direto
-- ============================================================================
--
-- BUG: fisioterapeuta clicava "Enviar ao Responsável" e recebia
-- "Erro ao enviar para o responsável". O erro real (só no console) era
-- 42501 — new row violates row-level security policy for table "webhook_queue".
--
-- `webhook_queue` só aceita INSERT de admin (fn_rls_admin) e secretaria
-- (is_secretaria). O `role = 'profissional'` não tem policy nenhuma. Só que a
-- UI libera relatório clínico justamente para admin E profissional
-- (ClinicalReportGenerator: "Secretaria NÃO tem permissão", regra da clínica).
-- Ou seja: a tela oferecia um botão que o banco recusava.
--
-- COMO FUNCIONA: SECURITY DEFINER, dona = postgres (BYPASSRLS), então passa
-- pelo FORCE ROW LEVEL SECURITY da fila. O cliente só manda o id do relatório;
-- URL do PDF, paciente e telefone do responsável saem do banco.
--
-- POLICY DO PROFISSIONAL: liberada pelo dono da clínica — a mensagem sai do
-- WhatsApp da clínica, não do celular do fisioterapeuta, então o envio de
-- relatório é atribuição dele mesmo. Fica restrita ao evento
-- 'relatorio_clinico_gerado': o resto da fila (cobrança, contrato, nota, link
-- de pagamento) não entrou nessa decisão e continua fechado.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_enviar_relatorio_responsavel(
  p_relatorio_id  uuid,
  p_data_emissao  date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_solicitante  record;
  v_rel          record;
  v_pac          record;
  v_webhook_id   uuid := gen_random_uuid();
  v_data_emissao date;
BEGIN
  -- 1. Quem pode enviar: o mesmo staff que a UI deixa gerar/enviar relatório.
  --    Secretaria entra porque o botão "Enviar" da lista de relatórios salvos
  --    aparece para ela (só o "Gerar" é que é admin/profissional).
  SELECT p.id, p.nome, p.role
    INTO v_solicitante
  FROM public.pessoas p
  WHERE p.auth_user_id = auth.uid()
    AND p.role IN ('admin', 'profissional', 'secretaria')
    AND p.is_approved = true
    AND p.ativo = true
    AND p.bloqueado = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sem permissão para enviar relatório ao responsável'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Relatório (a URL do PDF vem daqui, nunca do cliente)
  SELECT r.id,
         r.id_pessoa,
         r.pdf_url,
         r.created_at,
         t.codigo AS tipo_codigo,
         COALESCE(a.nome, c.nome) AS profissional_nome
    INTO v_rel
  FROM public.relatorios_medicos r
  JOIN public.relatorios_tipo t ON t.id = r.tipo_relatorio_id
  LEFT JOIN public.pessoas c ON c.id = r.criado_por
  LEFT JOIN public.pessoas a ON a.id = r.atualizado_por
  WHERE r.id = p_relatorio_id
    AND COALESCE(r.ativo, true) = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Relatório não encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF v_rel.pdf_url IS NULL OR btrim(v_rel.pdf_url) = '' THEN
    RAISE EXCEPTION 'Relatório ainda não tem arquivo para enviar'
      USING ERRCODE = 'P0002';
  END IF;

  -- 3. Paciente + responsável legal (telefone vem do cadastro, não do cliente)
  SELECT v.id,
         v.nome,
         v.responsavel_legal_nome,
         v.responsavel_legal_email,
         v.responsavel_legal_telefone
    INTO v_pac
  FROM public.pacientes_com_responsaveis_view v
  WHERE v.id = v_rel.id_pessoa;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paciente do relatório não encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF v_pac.responsavel_legal_telefone IS NULL THEN
    RAISE EXCEPTION 'Responsável legal sem telefone cadastrado'
      USING ERRCODE = 'P0002';
  END IF;

  -- Data de emissão: o gerador manual deixa o profissional escolher; sem ela,
  -- cai na data em que o relatório foi criado (hora de parede de Brasília).
  v_data_emissao := COALESCE(
    p_data_emissao,
    (v_rel.created_at AT TIME ZONE 'America/Sao_Paulo')::date
  );

  -- 4. Enfileira. Mesmo formato que o n8n já consome desde o INSERT do cliente
  --    (data.relatorio.url, data.responsavel_legal.telefone, data.paciente.nome);
  --    'id' e 'origem' são novos e só somam.
  INSERT INTO public.webhook_queue (evento, payload)
  VALUES (
    'relatorio_clinico_gerado',
    jsonb_build_object(
      'tipo', 'relatorio_clinico_gerado',
      'timestamp', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'webhook_id', v_webhook_id,
      'data', jsonb_build_object(
        'paciente', jsonb_build_object(
          'id', v_pac.id,
          'nome', v_pac.nome
        ),
        'responsavel_legal', jsonb_build_object(
          'nome', v_pac.responsavel_legal_nome,
          'telefone', v_pac.responsavel_legal_telefone,
          'email', v_pac.responsavel_legal_email
        ),
        'relatorio', jsonb_build_object(
          'id', v_rel.id,
          'url', v_rel.pdf_url,
          'data_emissao', to_char(v_data_emissao, 'YYYY-MM-DD'),
          'profissional', COALESCE(v_rel.profissional_nome, 'Não informado'),
          'origem', CASE
                      WHEN v_rel.tipo_codigo = 'relatorio_medico_manual' THEN 'manual'
                      ELSE 'ia'
                    END
        ),
        'enviado_por', jsonb_build_object(
          'id', v_solicitante.id,
          'nome', v_solicitante.nome
        )
      )
    )
  );

  RETURN jsonb_build_object(
    'webhook_id', v_webhook_id,
    'responsavel_nome', v_pac.responsavel_legal_nome
  );
END;
$function$;

ALTER FUNCTION public.fn_enviar_relatorio_responsavel(uuid, date) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.fn_enviar_relatorio_responsavel(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_enviar_relatorio_responsavel(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_enviar_relatorio_responsavel(uuid, date) TO authenticated;

COMMENT ON FUNCTION public.fn_enviar_relatorio_responsavel(uuid, date) IS
  'Enfileira o webhook relatorio_clinico_gerado montando o payload no servidor. '
  'Caminho usado pela UI de relatório clínico (admin, profissional e secretaria).';

-- ----------------------------------------------------------------------------
-- Policy: profissional também pode enfileirar o relatório clínico
-- ----------------------------------------------------------------------------
-- Complementa a RPC. Com ela, `role = 'profissional'` deixa de bater em
-- 42501 na fila — mas só para este evento. O `(SELECT fn())` é o padrão do
-- projeto para o planner avaliar a função uma vez, e não por linha.
DROP POLICY IF EXISTS "Profissional pode enfileirar relatorio clinico"
  ON public.webhook_queue;

CREATE POLICY "Profissional pode enfileirar relatorio clinico"
  ON public.webhook_queue
  FOR INSERT
  TO authenticated
  WITH CHECK (
    evento = 'relatorio_clinico_gerado'
    AND (SELECT public.fn_rls_profissional())
  );
