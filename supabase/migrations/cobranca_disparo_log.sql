-- Log de disparo das cobranças (envio do link por WhatsApp) — visibilidade ponta a ponta
-- --------------------------------------------------------------------------
-- Motivação: no disparo em massa, o status 'processado' da webhook_queue só diz que o
-- Supabase ENTREGOU o evento ao n8n (na verdade, que o pg_net aceitou o POST) — NÃO que
-- o WhatsApp chegou ao cliente. O resultado real do envio só existia dentro do n8n.
-- Esta migration cria o registro do RESULTADO do envio, que o fluxo n8n grava de volta,
-- e uma view que consolida geração → fila → envio para a tela "Log de disparos".

-- ==========================================================================
-- 1. Tabela: 1 linha por TENTATIVA de envio (inicial do disparo OU lembrete)
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.cobranca_disparo_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pagamento_link_id uuid,
  token text,
  tipo text NOT NULL DEFAULT 'inicial',   -- 'inicial' (disparo) | 'lembrete' (inadimplência)
  canal text NOT NULL DEFAULT 'whatsapp', -- 'whatsapp' | 'email'
  status text NOT NULL,                    -- 'enviado' | 'falhou' | 'entregue' | 'lido'
  detalhe text,                            -- motivo do erro / info (ex.: "número inválido")
  telefone text,                           -- número usado no envio (auditoria)
  registrado_por text DEFAULT 'n8n',
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cdl_link
  ON public.cobranca_disparo_log(pagamento_link_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_cdl_status
  ON public.cobranca_disparo_log(status, criado_em DESC);

ALTER TABLE public.cobranca_disparo_log ENABLE ROW LEVEL SECURITY;

-- RLS espelha pagamento_link_geracao_log: admin + secretaria (leitura) + service_role (edge/n8n)
DROP POLICY IF EXISTS cdl_admin ON public.cobranca_disparo_log;
CREATE POLICY cdl_admin ON public.cobranca_disparo_log
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS cdl_secretaria ON public.cobranca_disparo_log;
CREATE POLICY cdl_secretaria ON public.cobranca_disparo_log
  FOR ALL USING (public.is_secretaria()) WITH CHECK (public.is_secretaria());

DROP POLICY IF EXISTS cdl_service ON public.cobranca_disparo_log;
CREATE POLICY cdl_service ON public.cobranca_disparo_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ==========================================================================
-- 2. RPC que o fluxo n8n chama ao ENVIAR ou FALHAR o WhatsApp da cobrança.
--    Identifica a cobrança por pagamento_link_id OU por token (o payload do
--    webhook traz os dois — usar o que for mais fácil no n8n).
--    Uso (nó Supabase -> RPC):
--      p_status  = 'enviado' (sucesso) | 'falhou' (erro)
--      p_pagamento_link_id = {{ $json.data.pagamento_link_id }}  (ou p_token)
--      p_tipo    = 'inicial' no disparo; 'lembrete' na régua de inadimplência
--      p_detalhe = motivo do erro quando falhou
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.fn_registrar_disparo_cobranca(
  p_status text,
  p_pagamento_link_id uuid DEFAULT NULL,
  p_token text DEFAULT NULL,
  p_tipo text DEFAULT 'inicial',
  p_canal text DEFAULT 'whatsapp',
  p_detalhe text DEFAULT NULL,
  p_telefone text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_link_id uuid := p_pagamento_link_id;
  v_id uuid;
BEGIN
  -- Resolve o link pelo token quando só ele foi informado
  IF v_link_id IS NULL AND p_token IS NOT NULL THEN
    SELECT id INTO v_link_id FROM public.pagamento_links WHERE token = p_token;
  END IF;

  INSERT INTO public.cobranca_disparo_log
    (pagamento_link_id, token, tipo, canal, status, detalhe, telefone)
  VALUES
    (v_link_id, p_token, COALESCE(p_tipo, 'inicial'), COALESCE(p_canal, 'whatsapp'),
     p_status, p_detalhe, p_telefone)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- ==========================================================================
-- 3. View consolidada por cobrança (base da tela "Log de disparos").
--    Junta: pagamento_links (a cobrança) + geração (lote) + fila (entrega ao n8n)
--    + último envio registrado (n8n). Deriva disparo_status ponta a ponta.
-- ==========================================================================
CREATE OR REPLACE VIEW public.vw_disparo_cobrancas AS
 SELECT pl.id AS pagamento_link_id,
    pl.token,
    pl.criado_em,
    pl.status AS link_status,
    pl.valor_base,
    pl.empresa_id,
    COALESCE(emp.nome_fantasia, emp.razao_social) AS empresa_nome,
    pl.responsavel_cobranca_id,
    r.nome AS responsavel_nome,
    r.telefone AS responsavel_telefone,
    pl.paciente_id,
    pac.nome AS paciente_nome,
    g.lote_id,
    g.status AS geracao_status,
    g.erro AS geracao_erro,
    g.criado_por,
    d.status AS envio_status,
    d.detalhe AS envio_detalhe,
    d.tipo AS envio_tipo,
    d.criado_em AS envio_em,
    wq.status AS fila_status,
    wq.processado_em AS fila_processado_em,
    wq.erro AS fila_erro,
    (wq.payload -> 'data' ->> 'pacing') AS pacing,
    CASE
      WHEN g.status = 'erro' THEN 'erro_geracao'
      WHEN d.status = 'falhou' THEN 'falhou'
      WHEN d.status IN ('enviado', 'entregue', 'lido') THEN 'enviado'
      WHEN wq.status = 'erro' THEN 'erro_entrega'
      WHEN wq.status = 'processado' THEN 'entregue_n8n'
      WHEN wq.id IS NOT NULL THEN 'na_fila'
      ELSE 'sem_disparo'
    END AS disparo_status
   FROM public.pagamento_links pl
     LEFT JOIN LATERAL (
       SELECT dl.status, dl.detalhe, dl.tipo, dl.criado_em
       FROM public.cobranca_disparo_log dl
       WHERE dl.pagamento_link_id = pl.id
       ORDER BY dl.criado_em DESC LIMIT 1
     ) d ON true
     LEFT JOIN public.pagamento_link_geracao_log g ON g.pagamento_link_id = pl.id
     LEFT JOIN LATERAL (
       SELECT w.id, w.status, w.processado_em, w.erro, w.payload
       FROM public.webhook_queue w
       WHERE w.evento = 'pagamento_link_criado'
         AND (w.payload -> 'data' ->> 'pagamento_link_id') = pl.id::text
       ORDER BY w.created_at DESC LIMIT 1
     ) wq ON true
     LEFT JOIN public.pessoas r ON r.id = pl.responsavel_cobranca_id
     LEFT JOIN public.pessoas pac ON pac.id = pl.paciente_id
     LEFT JOIN public.pessoa_empresas emp ON emp.id = pl.empresa_id;

GRANT SELECT ON public.vw_disparo_cobrancas TO authenticated;
