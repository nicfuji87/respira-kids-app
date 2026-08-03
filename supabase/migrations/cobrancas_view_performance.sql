-- ============================================================================
-- Cobranças: performance da vw_cobrancas_pendentes (statement timeout)
-- ============================================================================
--
-- SINTOMA: a tela /cobrancas passou a estourar com
-- "canceling statement due to statement timeout" depois que a view ganhou os
-- profissionais.
--
-- CAUSA: o LATERAL dos profissionais filtrava com
--     (b.fatura_id IS NOT NULL AND a.fatura_id = b.fatura_id)
--     OR (b.pagamento_link_id IS NOT NULL AND a.pagamento_link_id = b.pagamento_link_id)
-- Um OR entre DUAS COLUNAS diferentes não é sargável: o planner não consegue
-- usar nem idx_agendamentos_fatura_id nem idx_agendamentos_pagamento_link e cai
-- em Seq Scan de ~11.800 agendamentos POR LINHA da lista (46 loops). Com o RLS
-- do agendamentos por cima — que para secretaria ainda roda subquery em
-- permissoes_agendamento — passava de 5s.
--
-- CORREÇÃO:
-- 1. A agregação dos profissionais desce para DENTRO de cada ramo do UNION,
--    onde a condição é uma igualdade simples e o índice é usado.
-- 2. O nome do profissional deixa de ser resolvido por JOIN dentro do LATERAL
--    (virava merge join varrendo ~1.600 pessoas por linha, por causa do RLS
--    pesado de `pessoas`) e passa a ser lookup por PK sobre o array de ids.
-- 3. Índices para os dois Seq Scans restantes: faturas em aberto e
--    pagamento_links por fatura_id.
--
-- Sem mudança de contrato: mesmas colunas, mesma semântica. A única diferença é
-- `a.ativo = true` no agendamento, que além de habilitar o índice parcial é mais
-- correto — sessão cancelada não deveria atribuir profissional à cobrança.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Índices de apoio
-- ----------------------------------------------------------------------------
-- Seq Scan em faturas: 3.706 linhas varridas para achar 20 em aberto.
CREATE INDEX IF NOT EXISTS idx_faturas_abertas
  ON public.faturas (vencimento)
  WHERE ativo IS NOT FALSE AND status IN ('pendente', 'atrasado');

-- Seq Scan em pagamento_links dentro do LATERAL que acha o link da fatura.
CREATE INDEX IF NOT EXISTS idx_pagamento_links_fatura_id
  ON public.pagamento_links (fatura_id)
  WHERE fatura_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. View reescrita
-- ----------------------------------------------------------------------------
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
    pl.criado_em          AS criado_em,
    -- Igualdade simples: usa idx_agendamentos_pagamento_link.
    (
      SELECT ARRAY_AGG(DISTINCT a.profissional_id)
      FROM public.agendamentos a
      WHERE a.pagamento_link_id = pl.id
        AND a.ativo = true
    ) AS profissional_ids
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
    f.criado_em,
    -- Igualdade simples: usa idx_agendamentos_fatura_id (parcial em ativo=true).
    (
      SELECT ARRAY_AGG(DISTINCT a.profissional_id)
      FROM public.agendamentos a
      WHERE a.fatura_id = f.id
        AND a.ativo = true
    )
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
  COALESCE(b.profissional_ids, ARRAY[]::uuid[]) AS profissional_ids,
  -- Nome por lookup de PK sobre 1-3 ids, não por JOIN dentro do agregado.
  COALESCE(
    (
      SELECT ARRAY_AGG(p.nome ORDER BY p.nome)
      FROM public.pessoas p
      WHERE p.id = ANY (b.profissional_ids)
    ),
    ARRAY[]::text[]
  ) AS profissionais
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
) m ON true;

COMMENT ON VIEW public.vw_cobrancas_pendentes IS
  'Cobrancas em aberto (pre-cobranca + fatura Asaas) para a tela /cobrancas. '
  'security_invoker: herda o RLS admin/secretaria de faturas e pagamento_links.';

GRANT SELECT ON public.vw_cobrancas_pendentes TO authenticated;
