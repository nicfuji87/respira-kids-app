-- =====================================================================
-- Imposto é custo individual da empresa, não custo compartilhado
--
-- Decisão do dono (31/08/2026): "BC FISIO tem imposto de acordo com as
-- suas vendas e FS o seu". As 8 regras de imposto são todas do regime
-- Lucro Presumido, que é o da BC — mas estavam apontando para a carteira
-- Clínica com natureza compartilhado, junto do condomínio e da internet.
-- Efeito: o imposto da BC estava sendo rateado como se fosse da casa.
--
-- A contabilidade NÃO entra aqui: decisão do dono é manter regra única e
-- compartilhada, para não criar valor diferente por empresa.
-- =====================================================================

UPDATE public.lancamentos_recorrentes
SET centro_financeiro_id = (SELECT id FROM public.centros_financeiros WHERE nome = 'BC FISIO'),
    natureza_custo       = 'individual',
    empresa_fatura_id    = (SELECT id FROM public.pessoa_empresas WHERE nome_fantasia = 'BC FISIO'),
    updated_at           = now()
WHERE ativo
  AND (descricao LIKE '%Lucro Presumido%' OR descricao LIKE '%Pró-labore%' OR descricao = 'INSS Empresa');

-- Só o que ainda não foi pago: reescrever lançamento quitado falsearia
-- histórico já conferido.
UPDATE public.lancamentos_financeiros l
SET centro_financeiro_id = (SELECT id FROM public.centros_financeiros WHERE nome = 'BC FISIO'),
    natureza_custo       = 'individual',
    empresa_fatura_id    = (SELECT id FROM public.pessoa_empresas WHERE nome_fantasia = 'BC FISIO'),
    updated_at           = now()
FROM public.lancamentos_recorrentes lr
WHERE lr.id = l.lancamento_recorrente_id
  AND l.pago = false
  AND l.status_lancamento <> 'cancelado'
  AND (lr.descricao LIKE '%Lucro Presumido%' OR lr.descricao LIKE '%Pró-labore%' OR lr.descricao = 'INSS Empresa');
