-- Baixa programada na parcela (22/10/2026): para pagamento já agendado fora do sistema
-- (Pix recorrente no app do Inter, débito automático combinado direto com o banco).
-- No dia marcado, fn_baixas_programadas_executar (pg_cron diário, 12h05 de Brasília) dá a
-- baixa na conta escolhida e anota de onde veio. Quem pega um pagamento que não saiu é a
-- conciliação com o extrato.
--
-- 1º uso: aluguel da sala 310 (Walter Antonio da Silva), Pix recorrente configurado no
-- Inter para todo dia 9, de 09/11/2026 a 09/01/2027 (3 pagamentos).

ALTER TABLE public.contas_pagar
  ADD COLUMN IF NOT EXISTS baixa_programada_em date,
  ADD COLUMN IF NOT EXISTS baixa_programada_conta_id uuid REFERENCES public.contas_bancarias(id),
  ADD COLUMN IF NOT EXISTS baixa_programada_obs text;

CREATE INDEX IF NOT EXISTS ix_contas_pagar_baixa_programada
  ON public.contas_pagar (baixa_programada_em)
  WHERE baixa_programada_em IS NOT NULL AND status_pagamento = 'pendente';

CREATE OR REPLACE FUNCTION public.fn_baixas_programadas_executar()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  n integer;
BEGIN
  WITH feitas AS (
    UPDATE public.contas_pagar cp
    SET status_pagamento = 'pago',
        data_pagamento = cp.baixa_programada_em,
        valor_pago = cp.valor_parcela,
        valor_final = cp.valor_parcela,
        conta_bancaria_id = coalesce(cp.baixa_programada_conta_id, cp.conta_bancaria_id),
        observacoes = concat_ws(' ', cp.observacoes,
          'Pago por: ' || coalesce(cp.baixa_programada_obs, 'pagamento programado') || ' em '
          || to_char(cp.baixa_programada_em, 'DD/MM/YYYY') || '. Baixa automática; confira no extrato.'),
        updated_at = now()
    WHERE cp.status_pagamento = 'pendente'
      AND cp.baixa_programada_em IS NOT NULL
      AND cp.baixa_programada_em <= (now() AT TIME ZONE 'America/Sao_Paulo')::date
    RETURNING 1
  )
  SELECT count(*) INTO n FROM feitas;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_baixas_programadas_executar() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('baixas-programadas') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'baixas-programadas');
SELECT cron.schedule('baixas-programadas', '5 15 * * *', 'SELECT public.fn_baixas_programadas_executar()');

-- aluguel sala 310: Pix recorrente no Inter, dia 9, nov/2026 a jan/2027
UPDATE public.contas_pagar cp
SET baixa_programada_em = l.data_vencimento,
    baixa_programada_conta_id = (SELECT id FROM public.contas_bancarias WHERE banco_codigo = '077' AND ativo LIMIT 1),
    baixa_programada_obs = 'Pix recorrente agendado no Inter (Walter Antonio da Silva, Bradesco)',
    observacoes = concat_ws(' ', cp.observacoes,
      'Pix recorrente agendado no Inter: todo dia 9, de 09/11/2026 a 09/01/2027 (3 pagamentos).')
FROM public.lancamentos_financeiros l
WHERE l.id = cp.lancamento_id
  AND l.lancamento_recorrente_id = '5722096c-3cb0-4c5d-beee-6fa6870c0d12'
  AND l.data_vencimento IN ('2026-11-09', '2026-12-09', '2027-01-09')
  AND cp.status_pagamento = 'pendente';
