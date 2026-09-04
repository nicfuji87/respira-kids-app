-- =====================================================================
-- DAS da F.S Pacheco + salário da secretaria
--
-- RBT12 da F.S apurado em 31/08/2026 sobre faturas pagas (out/2025 a
-- jul/2026): R$ 385.797,69 em 562 faturas. Isso cruzou os R$ 360.000 e
-- mudou a faixa do Anexo III — a alíquota efetiva subiu de ~8,5% para
-- 8,93%:
--
--   faixa 3 (360.000,01 a 720.000): nominal 13,50%, dedução R$ 17.640
--   efetiva = (385.797,69 × 0,135 − 17.640) / 385.797,69 = 8,9277%
--
-- ⚠️ DUAS RESSALVAS que só a contadora fecha:
--   1. Anexo III só vale se o fator R (folha ÷ receita nos 12 meses) for
--      >= 28%. Abaixo disso, fisioterapia cai no Anexo V, que começa em
--      15,5% — quase o dobro. Não dá para apurar isso aqui porque o
--      pró-labore não está registrado de forma confiável.
--   2. O RBT12 real é o que a contadora declara. Este veio das faturas
--      do ASAAS, que pode divergir por outras receitas e por competência.
-- =====================================================================

-- Preserva a alíquota antiga em vez de sobrescrever: as margens já
-- calculadas usaram 8,5% e o histórico precisa continuar explicável.
UPDATE public.tributos_empresa
SET vigencia_fim = CURRENT_DATE - 1, ativo = false
WHERE tipo_tributo = 'DAS' AND ativo
  AND empresa_id = (SELECT id FROM public.pessoa_empresas WHERE nome_fantasia = 'F.S PACHECO');

INSERT INTO public.tributos_empresa (empresa_id, tipo_tributo, aliquota_percent, base, vigencia_inicio, ativo, observacoes)
SELECT id, 'DAS', 8.9277, 'bruto', CURRENT_DATE, true,
       'Simples Anexo III faixa 3 (RBT12 R$ 385.797,69 apurado em 31/08/2026). Depende do fator R >= 28%; abaixo disso é Anexo V. Confirmar com a contadora.'
FROM public.pessoa_empresas WHERE nome_fantasia = 'F.S PACHECO';

-- Regra recorrente do DAS: valor variável, porque o guia muda todo mês
-- com o faturamento. Nasce como previsão esperando o valor real.
INSERT INTO public.lancamentos_recorrentes (
  tipo_lancamento, fornecedor_id, categoria_contabil_id, descricao,
  valor_variavel, periodicidade, dia_vencimento, gerar_conta_pagar,
  data_inicio, ativo, centro_financeiro_id, natureza_custo, empresa_fatura_id,
  observacoes
)
SELECT 'despesa',
       (SELECT id FROM public.fornecedores WHERE nome_fantasia = 'Receita Federal' OR nome_razao_social = 'Receita Federal' LIMIT 1),
       (SELECT id FROM public.categorias_contabeis WHERE codigo = 'SIMPLES'),
       'DAS - Simples Nacional (F.S Pacheco)',
       true, 'mensal', 20, true,
       date_trunc('month', CURRENT_DATE)::date, true,
       (SELECT id FROM public.centros_financeiros WHERE nome = 'F.S PACHECO'),
       'individual',
       (SELECT id FROM public.pessoa_empresas WHERE nome_fantasia = 'F.S PACHECO'),
       'Alíquota efetiva estimada 8,93% (Anexo III faixa 3). Preencher com o valor do guia.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.lancamentos_recorrentes WHERE descricao = 'DAS - Simples Nacional (F.S Pacheco)'
);

-- Salário da secretaria: R$ 3.000 fixos, lançamento único, sem separar
-- encargos — ela é PJ e emite nota. Custo compartilhado da Clínica, que
-- é quem ela atende.
INSERT INTO public.lancamentos_recorrentes (
  tipo_lancamento, categoria_contabil_id, descricao,
  valor_fixo, valor_variavel, periodicidade, dia_vencimento, gerar_conta_pagar,
  data_inicio, ativo, centro_financeiro_id, natureza_custo, observacoes
)
SELECT 'despesa',
       (SELECT id FROM public.categorias_contabeis WHERE codigo = 'DESP_FUNC'),
       'Salário secretaria',
       3000.00, false, 'mensal', 5, true,
       date_trunc('month', CURRENT_DATE)::date, true,
       (SELECT id FROM public.centros_financeiros WHERE tipo = 'comum'),
       'compartilhado',
       'Valor fixo, PJ, sem separar encargos. Falta vincular o CNPJ dela como fornecedor.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.lancamentos_recorrentes WHERE descricao = 'Salário secretaria'
);
