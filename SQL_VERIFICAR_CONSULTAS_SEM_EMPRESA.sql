-- 🔍 SQL para verificar consultas sem empresa de faturamento
-- Execute este script no Supabase SQL Editor

-- ==========================================
-- 1️⃣ CONSULTAS DOS PACIENTES COM PROBLEMA
-- ==========================================
-- Verificar especificamente os pacientes mencionados no erro

SELECT 
  a.id as agendamento_id,
  a.data_hora,
  p.nome as paciente_nome,
  p.id as paciente_id,
  prof.nome as profissional_nome,
  ts.nome as servico_nome,
  a.valor_servico,
  sp.descricao as status_pagamento,
  sc.descricao as status_consulta,
  a.empresa_fatura_id,
  CASE 
    WHEN a.empresa_fatura_id IS NULL THEN '❌ SEM EMPRESA'
    ELSE '✅ TEM EMPRESA'
  END as situacao,
  -- Informações da empresa (se existir)
  pe.razao_social as empresa_razao_social,
  pe.nome_fantasia as empresa_nome_fantasia
FROM agendamentos a
JOIN pessoas p ON p.id = a.paciente_id
JOIN pessoas prof ON prof.id = a.profissional_id
JOIN tipos_servico ts ON ts.id = a.tipo_servico_id
JOIN pagamento_status sp ON sp.id = a.status_pagamento_id
JOIN consulta_status sc ON sc.id = a.status_consulta_id
LEFT JOIN pessoa_empresas pe ON pe.id = a.empresa_fatura_id
WHERE 
  -- Filtrar pelos pacientes específicos do erro
  p.nome ILIKE '%Dauto Coellho%' 
  OR p.nome ILIKE '%Isabel Correa%'
  -- Apenas consultas ativas e não canceladas
  AND a.ativo = true
  AND sc.codigo != 'cancelado'
ORDER BY 
  p.nome, 
  a.data_hora DESC;

-- ==========================================
-- 2️⃣ TODAS AS CONSULTAS SEM EMPRESA
-- ==========================================
-- Verificar TODAS as consultas sem empresa de faturamento

SELECT 
  COUNT(*) as total_consultas_sem_empresa,
  COUNT(DISTINCT a.paciente_id) as total_pacientes_afetados,
  MIN(a.data_hora) as consulta_mais_antiga,
  MAX(a.data_hora) as consulta_mais_recente
FROM agendamentos a
JOIN consulta_status sc ON sc.id = a.status_consulta_id
WHERE 
  a.empresa_fatura_id IS NULL
  AND a.ativo = true
  AND sc.codigo != 'cancelado';

-- ==========================================
-- 3️⃣ DETALHES POR PACIENTE
-- ==========================================
-- Lista de pacientes com consultas sem empresa

SELECT 
  p.id as paciente_id,
  p.nome as paciente_nome,
  COUNT(a.id) as total_consultas_sem_empresa,
  SUM(a.valor_servico::numeric) as valor_total,
  MIN(a.data_hora) as primeira_consulta,
  MAX(a.data_hora) as ultima_consulta,
  STRING_AGG(DISTINCT ts.nome, ', ') as tipos_servico
FROM agendamentos a
JOIN pessoas p ON p.id = a.paciente_id
JOIN tipos_servico ts ON ts.id = a.tipo_servico_id
JOIN consulta_status sc ON sc.id = a.status_consulta_id
WHERE 
  a.empresa_fatura_id IS NULL
  AND a.ativo = true
  AND sc.codigo != 'cancelado'
GROUP BY p.id, p.nome
ORDER BY total_consultas_sem_empresa DESC;

-- ==========================================
-- 4️⃣ CONSULTAS NÃO PAGAS SEM EMPRESA
-- ==========================================
-- Apenas consultas que precisam ser cobradas (não pagas)

SELECT 
  p.id as paciente_id,
  p.nome as paciente_nome,
  COUNT(a.id) as consultas_pendentes,
  SUM(a.valor_servico::numeric) as valor_pendente,
  STRING_AGG(
    a.data_hora::date::text || ' - ' || ts.nome, 
    E'\n'
    ORDER BY a.data_hora
  ) as lista_consultas
FROM agendamentos a
JOIN pessoas p ON p.id = a.paciente_id
JOIN tipos_servico ts ON ts.id = a.tipo_servico_id
JOIN pagamento_status sp ON sp.id = a.status_pagamento_id
JOIN consulta_status sc ON sc.id = a.status_consulta_id
WHERE 
  a.empresa_fatura_id IS NULL
  AND a.ativo = true
  AND sc.codigo != 'cancelado'
  -- Apenas não pagas
  AND sp.codigo NOT IN ('pago', 'cancelado')
  -- Sem fatura já gerada
  AND a.fatura_id IS NULL
GROUP BY p.id, p.nome
ORDER BY consultas_pendentes DESC;

-- ==========================================
-- 5️⃣ VERIFICAR EMPRESAS DISPONÍVEIS
-- ==========================================
-- Lista de empresas ativas para referência

SELECT 
  id as empresa_id,
  razao_social,
  nome_fantasia,
  cnpj,
  CASE 
    WHEN api_token_externo IS NOT NULL AND api_token_externo != '' 
    THEN '✅ TEM TOKEN ASAAS'
    ELSE '❌ SEM TOKEN ASAAS'
  END as situacao_token,
  ativo
FROM pessoa_empresas
WHERE ativo = true
ORDER BY razao_social;

-- ==========================================
-- 6️⃣ SCRIPT DE CORREÇÃO (EXECUTE COM CUIDADO!)
-- ==========================================
-- ⚠️ ATENÇÃO: Execute apenas se souber qual empresa usar!
-- Substitua 'ID_DA_EMPRESA_CORRETA' pelo ID real da empresa

/*
-- OPÇÃO A: Atualizar consultas de um paciente específico
UPDATE agendamentos 
SET 
  empresa_fatura_id = 'ID_DA_EMPRESA_CORRETA',
  updated_at = NOW()
WHERE 
  paciente_id IN (
    SELECT id FROM pessoas 
    WHERE nome ILIKE '%Dauto Coellho%' OR nome ILIKE '%Isabel Correa%'
  )
  AND empresa_fatura_id IS NULL
  AND ativo = true;

-- OPÇÃO B: Atualizar TODAS as consultas sem empresa
-- (use apenas se todas devem ter a mesma empresa)
UPDATE agendamentos 
SET 
  empresa_fatura_id = 'ID_DA_EMPRESA_CORRETA',
  updated_at = NOW()
WHERE 
  empresa_fatura_id IS NULL
  AND ativo = true
  AND status_consulta_id NOT IN (
    SELECT id FROM consulta_status WHERE codigo = 'cancelado'
  );

-- OPÇÃO C: Atualizar por profissional
-- (se cada profissional trabalha para uma empresa específica)
UPDATE agendamentos a
SET 
  empresa_fatura_id = (
    SELECT id_empresa 
    FROM pessoas 
    WHERE id = a.profissional_id
  ),
  updated_at = NOW()
WHERE 
  a.empresa_fatura_id IS NULL
  AND a.ativo = true
  AND EXISTS (
    SELECT 1 FROM pessoas p 
    WHERE p.id = a.profissional_id 
    AND p.id_empresa IS NOT NULL
  );
*/

-- ==========================================
-- 7️⃣ VERIFICAR APÓS CORREÇÃO
-- ==========================================
-- Execute após fazer as correções para confirmar

SELECT 
  'Consultas SEM empresa' as tipo,
  COUNT(*) as quantidade
FROM agendamentos a
JOIN consulta_status sc ON sc.id = a.status_consulta_id
WHERE 
  a.empresa_fatura_id IS NULL
  AND a.ativo = true
  AND sc.codigo != 'cancelado'

UNION ALL

SELECT 
  'Consultas COM empresa' as tipo,
  COUNT(*) as quantidade
FROM agendamentos a
JOIN consulta_status sc ON sc.id = a.status_consulta_id
WHERE 
  a.empresa_fatura_id IS NOT NULL
  AND a.ativo = true
  AND sc.codigo != 'cancelado';

