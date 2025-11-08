-- =====================================================
-- SETUP INICIAL - SISTEMA FINANCEIRO RESPIRA KIDS
-- =====================================================
-- Execute estas queries após as migrations para configurar
-- os dados iniciais do sistema financeiro

-- 1. FORMAS DE PAGAMENTO
-- =====================================================
INSERT INTO public.formas_pagamento (nome, codigo, ativo, requer_conta_bancaria) VALUES
  ('PIX', 'PIX', true, true),
  ('Cartão de Crédito', 'CARTAO_CREDITO', true, false),
  ('Cartão de Débito', 'CARTAO_DEBITO', true, false),
  ('Boleto Bancário', 'BOLETO', true, false),
  ('Transferência Bancária', 'TRANSFERENCIA', true, true),
  ('Dinheiro', 'DINHEIRO', true, false),
  ('Cheque', 'CHEQUE', true, true)
ON CONFLICT (codigo) DO NOTHING;

-- 2. CATEGORIAS CONTÁBEIS - NÍVEL 1 (GRUPOS)
-- =====================================================
INSERT INTO public.categorias_contabeis (
  nome, codigo, nivel, tipo_categoria, cor_hex, ativo
) VALUES
  -- DESPESAS
  ('Despesas Operacionais', '1', 1, 'despesa', '#EF4444', true),
  ('Materiais e Insumos', '2', 1, 'despesa', '#F59E0B', true),
  ('Despesas com Pessoal', '3', 1, 'despesa', '#8B5CF6', true),
  ('Despesas Tributárias', '4', 1, 'despesa', '#6366F1', true),
  ('Despesas Financeiras', '5', 1, 'despesa', '#EC4899', true),
  ('Marketing e Publicidade', '6', 1, 'despesa', '#14B8A6', true),
  ('Investimentos', '7', 1, 'despesa', '#84CC16', true),
  -- RECEITAS
  ('Receitas de Serviços', '8', 1, 'receita', '#10B981', true),
  ('Receitas Financeiras', '9', 1, 'receita', '#06B6D4', true),
  ('Outras Receitas', '10', 1, 'receita', '#0EA5E9', true)
ON CONFLICT (codigo) DO NOTHING;

-- 3. CATEGORIAS CONTÁBEIS - NÍVEL 2 (CLASSIFICAÇÕES)
-- =====================================================
-- Despesas Operacionais
INSERT INTO public.categorias_contabeis (
  nome, codigo, nivel, tipo_categoria, categoria_pai_id, ativo
) 
SELECT 
  nome, 
  codigo, 
  2, 
  'despesa',
  (SELECT id FROM categorias_contabeis WHERE codigo = '1' LIMIT 1),
  true
FROM (VALUES
  ('Aluguel e Condomínio', '1.1'),
  ('Energia Elétrica', '1.2'),
  ('Água e Esgoto', '1.3'),
  ('Internet e Telefone', '1.4'),
  ('Manutenção e Reparos', '1.5'),
  ('Segurança', '1.6'),
  ('Limpeza e Conservação', '1.7'),
  ('Seguros', '1.8')
) AS t(nome, codigo)
ON CONFLICT (codigo) DO NOTHING;

-- Materiais e Insumos
INSERT INTO public.categorias_contabeis (
  nome, codigo, nivel, tipo_categoria, categoria_pai_id, ativo
) 
SELECT 
  nome, 
  codigo, 
  2, 
  'despesa',
  (SELECT id FROM categorias_contabeis WHERE codigo = '2' LIMIT 1),
  true
FROM (VALUES
  ('Material Médico-Hospitalar', '2.1'),
  ('Medicamentos', '2.2'),
  ('Material de Escritório', '2.3'),
  ('Material de Limpeza', '2.4'),
  ('Material de Copa', '2.5'),
  ('Uniformes e EPIs', '2.6')
) AS t(nome, codigo)
ON CONFLICT (codigo) DO NOTHING;

-- Despesas com Pessoal
INSERT INTO public.categorias_contabeis (
  nome, codigo, nivel, tipo_categoria, categoria_pai_id, ativo
) 
SELECT 
  nome, 
  codigo, 
  2, 
  'despesa',
  (SELECT id FROM categorias_contabeis WHERE codigo = '3' LIMIT 1),
  true
FROM (VALUES
  ('Salários e Ordenados', '3.1'),
  ('Encargos Sociais', '3.2'),
  ('Benefícios', '3.3'),
  ('Vale Transporte', '3.4'),
  ('Vale Refeição', '3.5'),
  ('Treinamentos', '3.6'),
  ('Comissões', '3.7')
) AS t(nome, codigo)
ON CONFLICT (codigo) DO NOTHING;

-- Receitas de Serviços
INSERT INTO public.categorias_contabeis (
  nome, codigo, nivel, tipo_categoria, categoria_pai_id, ativo
) 
SELECT 
  nome, 
  codigo, 
  2, 
  'receita',
  (SELECT id FROM categorias_contabeis WHERE codigo = '8' LIMIT 1),
  true
FROM (VALUES
  ('Consultas', '8.1'),
  ('Exames', '8.2'),
  ('Procedimentos', '8.3'),
  ('Terapias', '8.4'),
  ('Avaliações', '8.5'),
  ('Pacotes e Programas', '8.6')
) AS t(nome, codigo)
ON CONFLICT (codigo) DO NOTHING;

-- 4. BANCOS BRASILEIROS PRINCIPAIS
-- =====================================================
-- Lista dos principais bancos para referência
-- Pode ser usada em um SELECT no formulário de conta bancária
/*
SELECT * FROM (VALUES
  ('001', 'Banco do Brasil'),
  ('033', 'Banco Santander'),
  ('104', 'Caixa Econômica Federal'),
  ('237', 'Bradesco'),
  ('341', 'Itaú Unibanco'),
  ('422', 'Banco Safra'),
  ('745', 'Citibank'),
  ('260', 'Nu Pagamentos (Nubank)'),
  ('077', 'Banco Inter'),
  ('212', 'Banco Original'),
  ('756', 'Bancoob'),
  ('748', 'Sicredi'),
  ('336', 'C6 Bank'),
  ('290', 'PagSeguro')
) AS bancos(codigo, nome)
ORDER BY nome;
*/

-- 5. CONFIGURAÇÃO INICIAL DE DIVISÃO ENTRE SÓCIOS
-- =====================================================
-- ATENÇÃO: Ajuste os UUIDs das pessoas conforme seu banco
-- Este é apenas um exemplo, você precisa buscar os IDs reais

/*
-- Primeiro, busque os IDs das pessoas que serão sócias:
SELECT id, nome, cpf_cnpj, role 
FROM public.pessoas 
WHERE role IN ('admin', 'profissional')
AND nome IN ('Bruna', 'Flavia', 'Flávia');

-- Depois, insira a configuração (exemplo 50/50):
INSERT INTO public.configuracao_divisao_socios (
  pessoa_id, 
  percentual_divisao, 
  data_inicio, 
  ativo
) VALUES
  ('uuid-da-bruna', 50.00, '2024-01-01', true),
  ('uuid-da-flavia', 50.00, '2024-01-01', true);
*/

-- 6. EXEMPLOS DE FORNECEDORES
-- =====================================================
-- Alguns fornecedores comuns para começar
INSERT INTO public.fornecedores (
  tipo_pessoa, nome_razao_social, nome_fantasia, cpf_cnpj, 
  inscricao_estadual, telefone, email, website, observacoes, ativo
) VALUES
  ('J', 'Companhia de Eletricidade Local', 'Energia Local', '11222333000144', 
   'ISENTO', '1133334444', 'contato@energialocal.com.br', NULL, 'Conta de energia mensal', true),
  ('J', 'Empresa de Água e Saneamento', 'Águas da Cidade', '22333444000155', 
   'ISENTO', '1144445555', 'sac@aguasdacidade.com.br', NULL, 'Conta de água mensal', true),
  ('J', 'Imobiliária Comercial Ltda', 'Imobiliária Centro', '33444555000166', 
   '123456789', '1155556666', 'financeiro@imobiliariacentro.com.br', NULL, 'Aluguel do imóvel', true),
  ('J', 'Distribuidora Médica Hospitalar', 'MedSupply', '44555666000177', 
   '987654321', '1166667777', 'vendas@medsupply.com.br', 'www.medsupply.com.br', 'Fornecedor principal de materiais', true)
ON CONFLICT (cpf_cnpj) DO NOTHING;

-- 7. EXEMPLO DE CONTA BANCÁRIA DA CLÍNICA
-- =====================================================
/*
INSERT INTO public.contas_bancarias (
  nome, banco_codigo, banco_nome, agencia, conta, 
  tipo_conta, tipo_titular, titular_id, saldo_inicial, ativo
) VALUES (
  'Conta Principal - Respira Kids',
  '341',
  'Itaú Unibanco',
  '1234',
  '56789-0',
  'corrente',
  'clinica',
  NULL,
  0.00,
  true
);
*/

-- 8. EXEMPLO DE LANÇAMENTO RECORRENTE
-- =====================================================
/*
-- Exemplo: Aluguel mensal de R$ 5.000
INSERT INTO public.lancamentos_recorrentes (
  tipo_lancamento, descricao, valor, dia_vencimento,
  frequencia_recorrencia, ajustar_fim_semana, 
  fornecedor_id, categoria_contabil_id,
  eh_divisao_socios, data_inicio, ativo, 
  data_proxima_recorrencia
) VALUES (
  'despesa',
  'Aluguel - Sala Comercial',
  5000.00,
  10,
  'mensal',
  true,
  (SELECT id FROM fornecedores WHERE nome_fantasia = 'Imobiliária Centro' LIMIT 1),
  (SELECT id FROM categorias_contabeis WHERE codigo = '1.1' LIMIT 1),
  true,
  '2024-01-01',
  true,
  '2024-01-10'
);
*/

-- 9. CONFIGURAR CRON JOB PARA LANÇAMENTOS RECORRENTES
-- =====================================================
-- Execute após habilitar a extensão pg_cron no Supabase

/*
-- Habilitar extensão (se ainda não estiver)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Criar job para rodar diariamente às 6h UTC (3h Brasília)
SELECT cron.schedule(
  'processar-lancamentos-recorrentes',
  '0 6 * * *',
  $$SELECT public.processar_lancamentos_recorrentes_manual();$$
);

-- Verificar jobs configurados
SELECT * FROM cron.job;
*/

-- 10. GRANTS E PERMISSÕES ADICIONAIS
-- =====================================================
-- Garantir que service_role possa executar funções necessárias
GRANT EXECUTE ON FUNCTION public.processar_lancamentos_recorrentes_manual TO service_role;
GRANT EXECUTE ON FUNCTION public.log_processamento_recorrencia TO service_role;

-- =====================================================
-- FIM DO SETUP INICIAL
-- =====================================================
-- Após executar este script:
-- 1. Configure as contas bancárias reais
-- 2. Cadastre os sócios com percentuais corretos
-- 3. Importe ou cadastre fornecedores adicionais
-- 4. Configure lançamentos recorrentes mensais
-- 5. Teste o sistema com alguns lançamentos manuais
