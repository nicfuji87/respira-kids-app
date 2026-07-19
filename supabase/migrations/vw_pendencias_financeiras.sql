-- Indicadores de pendência financeira para o banner da Lista de Consultas.
--
-- (1) NÃO COBRADAS: consultas de meses ANTERIORES ao corrente que nunca viraram
--     cobrança. O disparo mensal usa a janela "Mês Anterior"; o que entra atrasado
--     (consulta lançada/liberada depois do disparo daquele mês) nunca mais é visto,
--     porque no mês seguinte a janela já andou. Caso real que motivou: Pedro Caversan
--     com 10 sessões de mar/2026 (R$2.620) nunca cobradas, enquanto nov/jan/fev/abr/
--     mai/jun dele foram todos pagos. Levantamento inicial: 42 consultas / R$11.810,
--     a mais antiga de jul/2024.
--     OBS: o status da consulta NÃO entra no critério (só 'cancelado' é excluído) —
--     na operação da clínica é normal a sessão acontecer e ficar como "agendado"/
--     "confirmado" sem evolução; essas são cobradas normalmente.
--
-- (2) ATRASADAS: cobranças JÁ emitidas, vencidas e não pagas — pré-cobrança (link sem
--     Asaas) + fatura Asaas. Ou seja, inadimplência.
CREATE OR REPLACE VIEW public.vw_pendencias_financeiras AS
WITH nc AS (
  SELECT count(*) AS qtd,
         COALESCE(sum(v.valor_servico), 0) AS valor,
         min(v.data_hora)::date AS mais_antiga
  FROM public.vw_agendamentos_completos v
  JOIN public.agendamentos a ON a.id = v.id
  WHERE v.ativo = true
    AND v.fatura_id IS NULL
    AND a.pagamento_link_id IS NULL
    AND v.status_pagamento_codigo = 'pendente'
    AND v.status_consulta_codigo <> 'cancelado'
    AND v.data_hora < date_trunc('month', CURRENT_DATE)
),
atr AS (
  SELECT
    (SELECT count(*) FROM public.pagamento_links pl
      WHERE pl.ativo AND pl.status IN ('pendente','expirado')
        AND pl.id_asaas IS NULL AND pl.fatura_id IS NULL
        AND pl.vencimento < CURRENT_DATE)
    + (SELECT count(*) FROM public.faturas f
        WHERE f.ativo AND f.status IN ('pendente','atrasado')
          AND f.id_asaas IS NOT NULL AND f.vencimento < CURRENT_DATE) AS qtd,
    (SELECT COALESCE(sum(pl.valor_base), 0) FROM public.pagamento_links pl
      WHERE pl.ativo AND pl.status IN ('pendente','expirado')
        AND pl.id_asaas IS NULL AND pl.fatura_id IS NULL
        AND pl.vencimento < CURRENT_DATE)
    + (SELECT COALESCE(sum(f.valor_total), 0) FROM public.faturas f
        WHERE f.ativo AND f.status IN ('pendente','atrasado')
          AND f.id_asaas IS NOT NULL AND f.vencimento < CURRENT_DATE) AS valor
)
SELECT nc.qtd AS nao_cobradas_qtd,
       nc.valor AS nao_cobradas_valor,
       nc.mais_antiga AS nao_cobradas_desde,
       atr.qtd AS atrasadas_qtd,
       atr.valor AS atrasadas_valor
FROM nc, atr;

GRANT SELECT ON public.vw_pendencias_financeiras TO authenticated;
