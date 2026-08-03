-- ============================================================================
-- Cobranças: filtros por empresa e profissional na tela /cobrancas
-- ============================================================================
--
-- Complementa `cobrancas_envio_manual.sql`. A tela precisou de filtro por
-- empresa emissora e por profissional que atendeu, além do de período — que sai
-- de graça do `vencimento` que a view já expunha.
--
-- O profissional NÃO está na cobrança: está nos agendamentos que ela cobre. Uma
-- cobrança pode juntar sessões de mais de um profissional (é o caso comum do
-- fechamento mensal), então agregamos em array em vez de uma coluna só.
--
-- DROP + CREATE em vez de CREATE OR REPLACE: o Postgres só deixa acrescentar
-- coluna no fim de uma view existente, e aqui o conjunto muda.
-- ============================================================================

DROP VIEW IF EXISTS public.vw_cobrancas_pendentes;

CREATE VIEW public.vw_cobrancas_pendentes
WITH (security_invoker = true) AS
WITH base AS (
  -- Ramo A: PRÉ-COBRANÇA — link gerado, cliente ainda não escolheu como pagar.
  SELECT
    'pre_cobranca'::text AS origem,
    pl.id                AS cobranca_id,
    pl.id                AS pagamento_link_id,
    NULL::uuid           AS fatura_id,
    pl.token             AS token,
    NULL::text           AS id_asaas,
    pl.paciente_id       AS paciente_id,
    pl.responsavel_cobranca_id AS responsavel_cobranca_id,
    pl.empresa_id        AS empresa_id,
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
    AND pl.fatura_id IS NULL

  UNION ALL

  -- Ramo B: COBRANÇA REAL no Asaas.
  SELECT
    'fatura'::text,
    f.id,
    pl2.id,
    f.id,
    pl2.token,
    f.id_asaas,
    f.paciente_id,
    f.responsavel_cobranca_id,
    f.empresa_id,
    f.descricao,
    f.valor_total,
    f.vencimento,
    f.dados_asaas->>'invoiceUrl',
    false,
    COALESCE(f.lembretes_enviados, 0),
    f.ultimo_lembrete_em,
    f.criado_em
  FROM public.faturas f
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
  b.empresa_id,
  COALESCE(emp.nome_fantasia, emp.razao_social) AS empresa_nome,
  b.descricao,
  b.valor,
  b.vencimento,
  (CURRENT_DATE - b.vencimento) AS dias_atraso,
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
  m.ultimo_envio_manual_por,
  COALESCE(ag.profissional_ids, ARRAY[]::uuid[]) AS profissional_ids,
  COALESCE(ag.profissionais, ARRAY[]::text[])    AS profissionais
FROM base b
LEFT JOIN public.pessoas pac  ON pac.id  = b.paciente_id
LEFT JOIN public.pessoas resp ON resp.id = b.responsavel_cobranca_id
LEFT JOIN public.pessoa_empresas emp ON emp.id = b.empresa_id
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
) m ON true
-- Profissionais vêm dos agendamentos cobertos pela cobrança. Uma cobrança de
-- fechamento mensal costuma ter mais de um, daí o array.
LEFT JOIN LATERAL (
  SELECT
    ARRAY_AGG(DISTINCT a.profissional_id) AS profissional_ids,
    ARRAY_AGG(DISTINCT prof.nome ORDER BY prof.nome) AS profissionais
  FROM public.agendamentos a
  JOIN public.pessoas prof ON prof.id = a.profissional_id
  WHERE (b.fatura_id IS NOT NULL AND a.fatura_id = b.fatura_id)
     OR (b.pagamento_link_id IS NOT NULL AND a.pagamento_link_id = b.pagamento_link_id)
) ag ON true;

COMMENT ON VIEW public.vw_cobrancas_pendentes IS
  'Cobrancas em aberto (pre-cobranca + fatura Asaas) para a tela /cobrancas. '
  'security_invoker: herda o RLS admin/secretaria de faturas e pagamento_links.';

GRANT SELECT ON public.vw_cobrancas_pendentes TO authenticated;
