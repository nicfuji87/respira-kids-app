-- ============================================================================
-- Reconciliação diária das faturas em aberto contra o Asaas
-- ============================================================================
--
-- SINTOMA: a tela /cobrancas mostrava faturas que já estavam CANCELADAS no
-- Asaas — a secretária abria o link e via "Fatura cancelada".
--
-- CAUSA: a checagem contra o Asaas só acontecia no clique de "Enviar cobrança".
-- Enquanto ninguém clicasse, a linha continuava na lista com o status local
-- desatualizado. Medido em 03/08/2026: das 20 faturas "em aberto", 6 estavam
-- excluídas no Asaas e 3 já tinham sido pagas — 45% de lixo na lista.
--
-- Por que o dado local fica errado: o webhook de pagamento do Asaas já falhou
-- em silêncio antes, e exclusão de cobrança pelo painel do Asaas não gera
-- webhook nenhum aqui. Ou seja, o status local NÃO é confiável sozinho.
--
-- SOLUÇÃO: um cron diário confere as faturas em aberto direto na API do Asaas.
-- São ~20 cobranças, então é 20 chamadas/dia — barato e invisível para a
-- secretária. Não substitui a checagem no clique (que protege contra a janela
-- entre o cron e o envio); os dois se complementam.
--
-- Duas funções porque o pg_net é ASSÍNCRONO: a resposta não volta na mesma
-- transação. Uma dispara, a outra lê `net._http_response` e aplica.
--
-- ESCOPO: só mexe em faturas que estão `pendente`/`atrasado`. Nunca reabre uma
-- paga, nunca faz a cascata do "Ajuste manual" (ativo=false + desvincular
-- consultas) — essa continua sendo decisão de admin no Financeiro.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Fila de correlação (request_id do pg_net -> fatura)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.asaas_reconciliacao_fila (
  fatura_id       uuid PRIMARY KEY REFERENCES public.faturas(id) ON DELETE CASCADE,
  request_id      bigint      NOT NULL,
  status_anterior text,
  criado_em       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.asaas_reconciliacao_fila ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS arf_admin ON public.asaas_reconciliacao_fila;
CREATE POLICY arf_admin ON public.asaas_reconciliacao_fila
  FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS arf_service ON public.asaas_reconciliacao_fila;
CREATE POLICY arf_service ON public.asaas_reconciliacao_fila
  FOR ALL TO service_role USING (true);

COMMENT ON TABLE public.asaas_reconciliacao_fila IS
  'Correlaciona o request_id assincrono do pg_net com a fatura consultada no Asaas.';

-- ----------------------------------------------------------------------------
-- 2. Disparar as consultas
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_asaas_reconciliar_disparar()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  -- Restos de execuções antigas (resposta que nunca chegou / já expirou).
  DELETE FROM public.asaas_reconciliacao_fila
  WHERE criado_em < now() - interval '1 day';

  INSERT INTO public.asaas_reconciliacao_fila (fatura_id, request_id, status_anterior)
  SELECT
    f.id,
    net.http_get(
      url := 'https://api.asaas.com/v3/payments/' || f.id_asaas,
      headers := jsonb_build_object(
        'access_token', e.api_token_externo,
        'User-Agent', 'RespiraKids/1.0'
      )
    ),
    f.status
  FROM public.faturas f
  JOIN public.pessoa_empresas e
    ON e.id = f.empresa_id
   AND e.ativo = true
   AND e.api_token_externo IS NOT NULL
  WHERE f.ativo IS NOT FALSE
    AND f.status IN ('pendente', 'atrasado')
    AND f.id_asaas IS NOT NULL
  ON CONFLICT (fatura_id) DO UPDATE
    SET request_id = EXCLUDED.request_id,
        status_anterior = EXCLUDED.status_anterior,
        criado_em = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.fn_asaas_reconciliar_disparar IS
  'Dispara (pg_net, assincrono) a consulta das faturas em aberto no Asaas.';

-- ----------------------------------------------------------------------------
-- 3. Aplicar as respostas
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_asaas_reconciliar_aplicar()
RETURNS TABLE (fatura_id uuid, id_asaas text, status_anterior text, status_novo text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH respostas AS (
    SELECT
      q.fatura_id,
      q.status_anterior,
      r.status_code,
      CASE WHEN r.status_code = 200 THEN r.content::jsonb ELSE NULL END AS corpo
    FROM public.asaas_reconciliacao_fila q
    JOIN net._http_response r ON r.id = q.request_id
  ),
  mapeadas AS (
    SELECT
      resp.fatura_id,
      resp.status_anterior,
      -- Espelha mapAsaasStatusToFatura() de src/lib/faturas-api.ts
      CASE
        WHEN resp.status_code = 404                              THEN 'cancelado'
        WHEN COALESCE((resp.corpo->>'deleted')::boolean, false)  THEN 'cancelado'
        WHEN resp.corpo->>'status' IN ('RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH')
                                                                 THEN 'pago'
        WHEN resp.corpo->>'status' = 'OVERDUE'                   THEN 'atrasado'
        WHEN resp.corpo->>'status' IN ('REFUNDED', 'REFUND_REQUESTED',
             'REFUND_IN_PROGRESS', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE',
             'AWAITING_CHARGEBACK_REVERSAL')                     THEN 'estornado'
        ELSE 'pendente'
      END AS status_novo,
      COALESCE(
        resp.corpo->>'paymentDate',
        resp.corpo->>'clientPaymentDate',
        resp.corpo->>'confirmedDate'
      ) AS pago_em_asaas
    FROM respostas resp
    -- Sem resposta utilizável não se conclui nada: manter o status atual.
    WHERE resp.status_code IN (200, 404)
  ),
  aplicadas AS (
    UPDATE public.faturas f
       SET status  = m.status_novo,
           pago_em = CASE
                       WHEN m.status_novo = 'pago'
                       THEN COALESCE(f.pago_em, m.pago_em_asaas::timestamptz, now())
                       ELSE f.pago_em
                     END
      FROM mapeadas m
     WHERE f.id = m.fatura_id
       AND f.status IS DISTINCT FROM m.status_novo
       -- Trava de segurança: só mexe no que ainda está em aberto.
       AND f.status IN ('pendente', 'atrasado')
    RETURNING f.id, f.id_asaas, m.status_anterior, m.status_novo
  )
  SELECT a.id, a.id_asaas, a.status_anterior, a.status_novo FROM aplicadas a;

  -- Limpa o que já foi lido, com resposta aproveitada ou não.
  DELETE FROM public.asaas_reconciliacao_fila q
  WHERE EXISTS (SELECT 1 FROM net._http_response r WHERE r.id = q.request_id);
END;
$$;

COMMENT ON FUNCTION public.fn_asaas_reconciliar_aplicar IS
  'Le as respostas do Asaas e corrige o status das faturas em aberto (pago/cancelado/estornado).';

REVOKE ALL ON FUNCTION public.fn_asaas_reconciliar_disparar() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_asaas_reconciliar_aplicar() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_asaas_reconciliar_disparar() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_asaas_reconciliar_aplicar() TO service_role;

-- ----------------------------------------------------------------------------
-- 4. Cron: 05:50 dispara, 05:55 aplica (BRT = UTC-3, então 08:50/08:55 UTC).
--    Antes das 8h para a lista já estar limpa quando a secretária abrir.
-- ----------------------------------------------------------------------------
SELECT cron.unschedule('asaas-reconciliar-disparar')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'asaas-reconciliar-disparar');

SELECT cron.unschedule('asaas-reconciliar-aplicar')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'asaas-reconciliar-aplicar');

SELECT cron.schedule(
  'asaas-reconciliar-disparar',
  '50 8 * * *',
  $cron$SELECT public.fn_asaas_reconciliar_disparar();$cron$
);

SELECT cron.schedule(
  'asaas-reconciliar-aplicar',
  '55 8 * * *',
  $cron$SELECT public.fn_asaas_reconciliar_aplicar();$cron$
);
