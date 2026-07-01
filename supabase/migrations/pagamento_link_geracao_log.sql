-- Log de acompanhamento da geração EM MASSA de pré-cobranças (Fase 2, servidor).
-- A edge function generate-payment-links-bulk grava aqui o resultado por paciente
-- (processando -> sucesso/erro/simulado); a tela lê por lote_id p/ mostrar progresso.
CREATE TABLE IF NOT EXISTS public.pagamento_link_geracao_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id uuid NOT NULL,
  paciente_id uuid,
  paciente_nome text,
  status text NOT NULL DEFAULT 'processando', -- processando | sucesso | erro | simulado
  erro text,
  token text,
  pagamento_link_id uuid,
  valor_base numeric,
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plgl_lote
  ON public.pagamento_link_geracao_log(lote_id);
CREATE INDEX IF NOT EXISTS idx_plgl_criador
  ON public.pagamento_link_geracao_log(criado_por, criado_em DESC);

ALTER TABLE public.pagamento_link_geracao_log ENABLE ROW LEVEL SECURITY;

-- RLS espelha pagamento_links: admin + secretaria (leitura/escrita) + service_role (edge)
DROP POLICY IF EXISTS plgl_admin ON public.pagamento_link_geracao_log;
CREATE POLICY plgl_admin ON public.pagamento_link_geracao_log
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS plgl_secretaria ON public.pagamento_link_geracao_log;
CREATE POLICY plgl_secretaria ON public.pagamento_link_geracao_log
  FOR ALL USING (public.is_secretaria()) WITH CHECK (public.is_secretaria());

DROP POLICY IF EXISTS plgl_service ON public.pagamento_link_geracao_log;
CREATE POLICY plgl_service ON public.pagamento_link_geracao_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
