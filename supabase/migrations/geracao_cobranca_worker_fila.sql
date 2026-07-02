-- Fase 3b: worker de CRIAÇÃO em blocos (pra clicar 1x no mês inteiro, 300-400).
-- O log de geração vira a FILA: cada linha guarda o payload do item e é processada por
-- um worker (edge generate-payment-links-bulk mode:'worker') cutucado por cron. Aqui:
-- colunas de fila + claim atômico.

-- 1) payload do item (pro worker recriar o link) + flag dry_run por linha
ALTER TABLE public.pagamento_link_geracao_log
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS dry_run boolean NOT NULL DEFAULT false;

-- índice pra o claim varrer só o que falta (status='processando'), na ordem de chegada
CREATE INDEX IF NOT EXISTS idx_plgl_fila
  ON public.pagamento_link_geracao_log(status, criado_em)
  WHERE status IN ('processando', 'gerando');

-- 2) Claim atômico de um bloco: reseta 'gerando' preso (>5min, worker morreu) de volta
-- pra 'processando', então reivindica até p_limit itens 'processando' -> 'gerando'
-- (FOR UPDATE SKIP LOCKED = duas execuções nunca pegam o mesmo item). Retorna o que pegou.
CREATE OR REPLACE FUNCTION public.fn_claim_geracao_chunk(p_limit int DEFAULT 15)
RETURNS TABLE (
  id uuid,
  payload jsonb,
  criado_por uuid,
  dry_run boolean,
  pagamento_link_id uuid,
  paciente_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  -- recuperação de travados: worker que morreu no meio deixa 'gerando' órfão
  UPDATE public.pagamento_link_geracao_log
     SET status = 'processando', atualizado_em = now()
   WHERE status = 'gerando'
     AND atualizado_em < now() - interval '5 minutes';

  RETURN QUERY
  UPDATE public.pagamento_link_geracao_log l
     SET status = 'gerando', atualizado_em = now()
   WHERE l.id IN (
     SELECT c.id FROM public.pagamento_link_geracao_log c
      WHERE c.status = 'processando'
        AND c.payload IS NOT NULL   -- só itens da fila nova (têm payload)
      ORDER BY c.criado_em ASC
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
   )
  RETURNING l.id, l.payload, l.criado_por, l.dry_run, l.pagamento_link_id, l.paciente_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_claim_geracao_chunk(int) TO service_role;
