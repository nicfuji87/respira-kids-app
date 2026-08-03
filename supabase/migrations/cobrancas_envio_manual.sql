-- ============================================================================
-- Cobranças: envio manual pelo WhatsApp (tela /cobrancas da secretaria)
-- ============================================================================
--
-- MOTIVAÇÃO
-- A API (não oficial) de WhatsApp usada pelo n8n parou, e com ela o disparo
-- automático das cobranças e da régua de inadimplência. Enquanto isso, ninguém
-- avisa o cliente que existe cobrança em aberto.
--
-- Esta migration cria a base do canal MANUAL: a secretária vê as cobranças em
-- aberto numa tela própria, clica em um botão que abre o WhatsApp Web já na
-- conversa do responsável com a mensagem escrita, e o clique fica registrado.
--
-- DECISÕES
-- 1. A tela precisa dos DOIS mundos numa lista só: pré-cobrança (pagamento_links
--    pendente, cliente ainda não escolheu forma de pagamento) e cobrança real
--    (faturas com status pendente/atrasado no Asaas). Daí a view ser um UNION.
-- 2. `security_invoker = true`: a view herda o RLS de faturas/pagamento_links,
--    que já restringe a admin + secretaria. Profissional consulta e vê zero
--    linhas, sem precisar de guarda extra aqui.
-- 3. O registro do clique reusa `cobranca_disparo_log` em vez de tabela nova —
--    assim o envio manual aparece no mesmo painel de disparos do automático.
--    O que separa os dois é `canal`: 'whatsapp' (n8n) x 'whatsapp_manual' (app).
-- 4. O status gravado é 'aberto', NÃO 'enviado'. Abrir o WhatsApp não prova que
--    a secretária apertou enter — gravar 'enviado' contaminaria a métrica de
--    entrega do n8n com um dado que ninguém confirmou.
--
-- Aditiva: não altera nem remove nada existente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. View: cobranças em aberto (pré-cobrança + fatura Asaas)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_cobrancas_pendentes
WITH (security_invoker = true) AS
WITH base AS (
  -- Ramo A: PRÉ-COBRANÇA — link gerado, cliente ainda não escolheu como pagar.
  -- Não existe no Asaas ainda, então não há status externo para conferir.
  SELECT
    'pre_cobranca'::text AS origem,
    pl.id                AS cobranca_id,
    pl.id                AS pagamento_link_id,
    NULL::uuid           AS fatura_id,
    pl.token             AS token,
    NULL::text           AS id_asaas,
    pl.paciente_id       AS paciente_id,
    pl.responsavel_cobranca_id AS responsavel_cobranca_id,
    pl.descricao         AS descricao,
    pl.valor_base        AS valor,
    pl.vencimento        AS vencimento,
    ('https://app.respirakidsbrasilia.com.br/#/pagamento/' || pl.token) AS link_pagamento,
    (pl.expira_em IS NOT NULL AND pl.expira_em < now()) AS link_expirado,
    COALESCE(pl.lembretes_enviados, 0) AS lembretes_enviados,
    pl.ultimo_lembrete_em AS ultimo_lembrete_em,
    pl.criado_em          AS criado_em
  FROM public.pagamento_links pl
  WHERE pl.ativo IS NOT FALSE
    AND pl.status = 'pendente'
    -- Se o link já virou fatura, quem manda é a fatura (ramo B). Evita a mesma
    -- cobrança aparecer duas vezes na lista.
    AND pl.fatura_id IS NULL

  UNION ALL

  -- Ramo B: COBRANÇA REAL no Asaas. Tem id_asaas, logo dá para conferir o
  -- status lá antes de cobrar de novo.
  SELECT
    'fatura'::text,
    f.id,
    pl2.id,
    f.id,
    pl2.token,
    f.id_asaas,
    f.paciente_id,
    f.responsavel_cobranca_id,
    f.descricao,
    f.valor_total,
    f.vencimento,
    f.dados_asaas->>'invoiceUrl',
    false,
    COALESCE(f.lembretes_enviados, 0),
    f.ultimo_lembrete_em,
    f.criado_em
  FROM public.faturas f
  -- LATERAL com LIMIT 1: uma fatura pode ter mais de um link apontando para ela
  -- (regeração). Um JOIN simples duplicaria a linha na lista.
  LEFT JOIN LATERAL (
    SELECT p.id, p.token
    FROM public.pagamento_links p
    WHERE p.fatura_id = f.id
      AND p.ativo IS NOT FALSE
    ORDER BY p.criado_em DESC
    LIMIT 1
  ) pl2 ON true
  WHERE f.ativo IS NOT FALSE
    AND f.status IN ('pendente', 'atrasado')
)
SELECT
  b.origem,
  b.cobranca_id,
  b.pagamento_link_id,
  b.fatura_id,
  b.token,
  b.id_asaas,
  b.paciente_id,
  pac.nome  AS paciente_nome,
  b.responsavel_cobranca_id,
  resp.nome AS responsavel_nome,
  resp.telefone AS responsavel_telefone,
  b.descricao,
  b.valor,
  b.vencimento,
  (CURRENT_DATE - b.vencimento) AS dias_atraso,
  -- Situação escolhe qual dos 3 textos a tela usa.
  CASE
    WHEN b.vencimento IS NULL             THEN 'pendente'
    WHEN CURRENT_DATE <= b.vencimento     THEN 'pendente'
    WHEN CURRENT_DATE - b.vencimento <= 7 THEN 'atrasada'
    ELSE 'muito_atrasada'
  END AS situacao,
  b.link_pagamento,
  b.link_expirado,
  b.lembretes_enviados,
  b.ultimo_lembrete_em,
  b.criado_em,
  COALESCE(m.envios_manuais, 0) AS envios_manuais,
  m.ultimo_envio_manual_em,
  m.ultimo_envio_manual_por
FROM base b
LEFT JOIN public.pessoas pac  ON pac.id  = b.paciente_id
LEFT JOIN public.pessoas resp ON resp.id = b.responsavel_cobranca_id
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)::int    AS envios_manuais,
    MAX(l.criado_em) AS ultimo_envio_manual_em,
    (ARRAY_AGG(l.registrado_por ORDER BY l.criado_em DESC))[1] AS ultimo_envio_manual_por
  FROM public.cobranca_disparo_log l
  WHERE l.canal = 'whatsapp_manual'
    AND (
      (b.pagamento_link_id IS NOT NULL AND l.pagamento_link_id = b.pagamento_link_id)
      OR
      (b.fatura_id IS NOT NULL AND l.fatura_id = b.fatura_id)
    )
) m ON true;

COMMENT ON VIEW public.vw_cobrancas_pendentes IS
  'Cobranças em aberto (pré-cobrança + fatura Asaas) para a tela /cobrancas. '
  'security_invoker: herda o RLS admin/secretaria de faturas e pagamento_links.';

GRANT SELECT ON public.vw_cobrancas_pendentes TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. RPC: registrar o clique do envio manual
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER só para carimbar `registrado_por` com o nome de quem clicou
-- (a secretária não escreve o campo à mão) — a permissão continua checada aqui
-- dentro via is_admin()/is_secretaria().
CREATE OR REPLACE FUNCTION public.fn_registrar_disparo_manual(
  p_pagamento_link_id uuid DEFAULT NULL,
  p_fatura_id         uuid DEFAULT NULL,
  p_telefone          text DEFAULT NULL,
  p_situacao          text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id   uuid;
  v_autor    text;
  v_token    text;
  v_id_asaas text;
BEGIN
  IF p_pagamento_link_id IS NULL AND p_fatura_id IS NULL THEN
    RAISE EXCEPTION 'Informe p_pagamento_link_id ou p_fatura_id';
  END IF;

  IF NOT (public.is_admin() OR public.is_secretaria()) THEN
    RAISE EXCEPTION 'Sem permissao para registrar disparo manual';
  END IF;

  SELECT p.nome INTO v_autor
  FROM public.pessoas p
  WHERE p.auth_user_id = auth.uid()
  LIMIT 1;

  v_autor := COALESCE(v_autor, 'app');

  IF p_pagamento_link_id IS NOT NULL THEN
    SELECT pl.token, pl.id_asaas INTO v_token, v_id_asaas
    FROM public.pagamento_links pl
    WHERE pl.id = p_pagamento_link_id;
  END IF;

  IF p_fatura_id IS NOT NULL AND v_id_asaas IS NULL THEN
    SELECT f.id_asaas INTO v_id_asaas
    FROM public.faturas f
    WHERE f.id = p_fatura_id;
  END IF;

  INSERT INTO public.cobranca_disparo_log (
    pagamento_link_id, fatura_id, token, id_asaas,
    tipo, canal, status, detalhe, telefone, registrado_por
  ) VALUES (
    p_pagamento_link_id, p_fatura_id, v_token, v_id_asaas,
    'manual', 'whatsapp_manual', 'aberto',
    CASE WHEN p_situacao IS NULL THEN NULL ELSE 'situacao=' || p_situacao END,
    p_telefone, v_autor
  )
  RETURNING id INTO v_log_id;

  -- Mantém um contador único de "quantas vezes já lembramos", somando manual e
  -- automático — é esse número que aparece no badge das telas de fatura.
  IF p_pagamento_link_id IS NOT NULL THEN
    UPDATE public.pagamento_links
       SET lembretes_enviados = COALESCE(lembretes_enviados, 0) + 1,
           ultimo_lembrete_em = now()
     WHERE id = p_pagamento_link_id;
  END IF;

  IF p_fatura_id IS NOT NULL THEN
    UPDATE public.faturas
       SET lembretes_enviados = COALESCE(lembretes_enviados, 0) + 1,
           ultimo_lembrete_em = now()
     WHERE id = p_fatura_id;
  END IF;

  RETURN v_log_id;
END;
$$;

COMMENT ON FUNCTION public.fn_registrar_disparo_manual IS
  'Registra o clique de "enviar cobranca pelo WhatsApp" na tela /cobrancas. '
  'Grava status=aberto (abrir a conversa nao prova envio) e canal=whatsapp_manual.';

REVOKE ALL ON FUNCTION public.fn_registrar_disparo_manual(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_registrar_disparo_manual(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_registrar_disparo_manual(uuid, uuid, text, text) TO service_role;

-- ----------------------------------------------------------------------------
-- 3. Índice de apoio ao contador de envios manuais
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cobranca_disparo_log_manual
  ON public.cobranca_disparo_log (canal, pagamento_link_id, fatura_id);
