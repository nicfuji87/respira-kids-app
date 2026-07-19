-- Ciclo de vida da cobrança (pré-cobrança -> cobrança no Asaas -> pago)
-- --------------------------------------------------------------------------
-- Motivação: dar visibilidade do FLUXO COMPLETO e permitir estatística de tempo
-- médio de pagamento. Os marcos já existem como timestamps canônicos — esta view
-- só os junta numa linha por cobrança, sem duplicar dado nem depender de novos
-- eventos do n8n:
--   pré-cobrança gerada = pagamento_links.criado_em
--   cobrança gerada no Asaas = faturas.criado_em (nova) / dados_asaas.dateCreated
--   pago = faturas.pago_em (preenchido pelo fluxo Asaas atual, ~99,9%)
--
-- ATENÇÃO: faturas.criado_em das ~3,4k faturas LEGADAS (importação) é a data de
-- importação, POSTERIOR ao pago_em — por isso `dias_cobranca_ate_pago` fica
-- negativo nelas. A métrica CONFIÁVEL é `dias_precobranca_ate_pago` (fluxo via
-- link, nascido do sistema novo). O card usa essa e descarta durações negativas.
CREATE OR REPLACE VIEW public.vw_ciclo_cobranca AS
 SELECT f.id AS fatura_id,
    pl.id AS pagamento_link_id,
    f.responsavel_cobranca_id,
    r.nome AS responsavel_nome,
    f.paciente_id,
    pac.nome AS paciente_nome,
    f.empresa_id,
    COALESCE(emp.nome_fantasia, emp.razao_social) AS empresa_nome,
    pl.criado_em AS pre_cobranca_em,
    f.criado_em AS cobranca_em,
    (f.dados_asaas ->> 'dateCreated') AS cobranca_data_asaas,
    f.pago_em,
    f.status,
    f.valor_total,
    f.valor_servico,
    (f.dados_asaas ->> 'forma_pagamento') AS forma_pagamento,
    (pl.id IS NOT NULL) AS via_link,
    -- Ciclo completo (só quando veio de link e foi pago) — métrica CONFIÁVEL
    CASE
      WHEN f.status = 'pago' AND f.pago_em IS NOT NULL AND pl.criado_em IS NOT NULL
      THEN round((EXTRACT(EPOCH FROM (f.pago_em - pl.criado_em)) / 86400)::numeric, 2)
    END AS dias_precobranca_ate_pago,
    -- Cobrança -> pago (via criado_em; não confiável no legado — filtrar >= 0)
    CASE
      WHEN f.status = 'pago' AND f.pago_em IS NOT NULL
      THEN round((EXTRACT(EPOCH FROM (f.pago_em - f.criado_em)) / 86400)::numeric, 2)
    END AS dias_cobranca_ate_pago
   FROM public.faturas f
     LEFT JOIN public.pagamento_links pl ON pl.fatura_id = f.id
     LEFT JOIN public.pessoas r ON r.id = f.responsavel_cobranca_id
     LEFT JOIN public.pessoas pac ON pac.id = f.paciente_id
     LEFT JOIN public.pessoa_empresas emp ON emp.id = f.empresa_id
  WHERE f.ativo = true;

GRANT SELECT ON public.vw_ciclo_cobranca TO authenticated;
