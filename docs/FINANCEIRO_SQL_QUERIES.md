# Sistema Financeiro - Queries SQL Úteis

## 📊 Consultas de Dashboard

### Resumo Mensal

```sql
-- Receitas e Despesas do mês atual
SELECT
  tipo_lancamento,
  COUNT(*) as quantidade,
  SUM(valor_total) as total
FROM lancamentos_financeiros
WHERE status_lancamento = 'validado'
  AND data_competencia >= date_trunc('month', CURRENT_DATE)
  AND data_competencia < date_trunc('month', CURRENT_DATE) + interval '1 month'
GROUP BY tipo_lancamento;

-- Evolução mensal (últimos 6 meses)
SELECT
  date_trunc('month', data_competencia) as mes,
  tipo_lancamento,
  SUM(valor_total) as total
FROM lancamentos_financeiros
WHERE status_lancamento = 'validado'
  AND data_competencia >= date_trunc('month', CURRENT_DATE - interval '6 months')
GROUP BY 1, 2
ORDER BY 1, 2;
```

### Top 5 Despesas por Categoria

```sql
SELECT
  c.nome as categoria,
  c.codigo,
  COUNT(l.id) as qtd_lancamentos,
  SUM(l.valor_total) as total
FROM lancamentos_financeiros l
JOIN categorias_contabeis c ON l.categoria_contabil_id = c.id
WHERE l.tipo_lancamento = 'despesa'
  AND l.status_lancamento = 'validado'
  AND l.data_competencia >= date_trunc('month', CURRENT_DATE)
GROUP BY c.id, c.nome, c.codigo
ORDER BY total DESC
LIMIT 5;
```

## 💰 Contas a Pagar/Receber

### Contas Vencidas

```sql
-- Lista contas vencidas com detalhes
SELECT
  cp.id,
  cp.data_vencimento,
  cp.valor_parcela,
  cp.numero_parcela || '/' || cp.total_parcelas as parcela,
  l.descricao,
  f.nome_fantasia as fornecedor,
  DATE_PART('day', CURRENT_DATE - cp.data_vencimento) as dias_atraso
FROM contas_pagar cp
JOIN lancamentos_financeiros l ON cp.lancamento_id = l.id
LEFT JOIN fornecedores f ON l.fornecedor_id = f.id
WHERE cp.status_pagamento = 'pendente'
  AND cp.data_vencimento < CURRENT_DATE
ORDER BY cp.data_vencimento;

-- Resumo de vencimentos
SELECT
  CASE
    WHEN data_vencimento < CURRENT_DATE THEN 'Vencidas'
    WHEN data_vencimento = CURRENT_DATE THEN 'Vence Hoje'
    WHEN data_vencimento <= CURRENT_DATE + interval '7 days' THEN 'Próximos 7 dias'
    WHEN data_vencimento <= CURRENT_DATE + interval '30 days' THEN 'Próximos 30 dias'
    ELSE 'Após 30 dias'
  END as periodo,
  COUNT(*) as quantidade,
  SUM(valor_parcela) as total
FROM contas_pagar
WHERE status_pagamento = 'pendente'
GROUP BY 1
ORDER BY
  CASE periodo
    WHEN 'Vencidas' THEN 1
    WHEN 'Vence Hoje' THEN 2
    WHEN 'Próximos 7 dias' THEN 3
    WHEN 'Próximos 30 dias' THEN 4
    ELSE 5
  END;
```

### Fluxo de Caixa Projetado

```sql
-- Projeção próximos 30 dias
WITH datas AS (
  SELECT generate_series(
    CURRENT_DATE,
    CURRENT_DATE + interval '30 days',
    '1 day'::interval
  )::date AS dia
)
SELECT
  d.dia,
  COALESCE(SUM(CASE WHEN l.tipo_lancamento = 'receita' THEN cp.valor_parcela END), 0) as receitas,
  COALESCE(SUM(CASE WHEN l.tipo_lancamento = 'despesa' THEN cp.valor_parcela END), 0) as despesas,
  COALESCE(SUM(
    CASE
      WHEN l.tipo_lancamento = 'receita' THEN cp.valor_parcela
      WHEN l.tipo_lancamento = 'despesa' THEN -cp.valor_parcela
    END
  ), 0) as saldo_dia
FROM datas d
LEFT JOIN contas_pagar cp ON cp.data_vencimento = d.dia AND cp.status_pagamento = 'pendente'
LEFT JOIN lancamentos_financeiros l ON cp.lancamento_id = l.id
GROUP BY d.dia
ORDER BY d.dia;
```

## 👥 Divisão entre Sócios

### Resumo de Divisões do Mês

```sql
-- Total por sócio
SELECT
  p.nome as socio,
  COUNT(DISTINCT lds.lancamento_id) as qtd_lancamentos,
  SUM(lds.valor) as total_dividido,
  SUM(lds.valor * lds.percentual / 100) as valor_proporcional
FROM lancamento_divisao_socios lds
JOIN pessoas p ON lds.pessoa_id = p.id
JOIN lancamentos_financeiros l ON lds.lancamento_id = l.id
WHERE l.data_competencia >= date_trunc('month', CURRENT_DATE)
  AND l.status_lancamento = 'validado'
GROUP BY p.id, p.nome
ORDER BY p.nome;

-- Detalhamento por sócio
SELECT
  p.nome as socio,
  l.descricao,
  l.data_emissao,
  l.valor_total as valor_lancamento,
  lds.percentual || '%' as percentual,
  lds.valor as valor_dividido
FROM lancamento_divisao_socios lds
JOIN pessoas p ON lds.pessoa_id = p.id
JOIN lancamentos_financeiros l ON lds.lancamento_id = l.id
WHERE l.data_competencia >= date_trunc('month', CURRENT_DATE)
  AND l.status_lancamento = 'validado'
ORDER BY p.nome, l.data_emissao;
```

## 🔄 Lançamentos Recorrentes

### Status dos Recorrentes

```sql
-- Lista de recorrentes ativos
SELECT
  lr.descricao,
  lr.valor,
  lr.frequencia_recorrencia,
  lr.dia_vencimento,
  lr.data_proxima_recorrencia,
  lr.ativo,
  COUNT(l.id) as lancamentos_gerados,
  MAX(l.data_emissao) as ultimo_gerado
FROM lancamentos_recorrentes lr
LEFT JOIN lancamentos_financeiros l ON l.lancamento_recorrente_id = lr.id
GROUP BY lr.id
ORDER BY lr.ativo DESC, lr.descricao;

-- Próximas gerações (próximos 30 dias)
SELECT
  descricao,
  valor,
  frequencia_recorrencia,
  data_proxima_recorrencia,
  CASE
    WHEN ajustar_fim_semana AND EXTRACT(DOW FROM data_proxima_recorrencia) IN (0,6) THEN
      'Será ajustado para dia útil'
    ELSE ''
  END as observacao
FROM lancamentos_recorrentes
WHERE ativo = true
  AND data_proxima_recorrencia <= CURRENT_DATE + interval '30 days'
ORDER BY data_proxima_recorrencia;
```

### Logs de Processamento

```sql
-- Últimas execuções
SELECT
  executado_em,
  sucesso,
  lancamentos_criados,
  lancamentos_com_erro,
  mensagem
FROM lancamentos_recorrentes_log
ORDER BY executado_em DESC
LIMIT 10;

-- Estatísticas de processamento (último mês)
SELECT
  COUNT(*) as total_execucoes,
  SUM(lancamentos_criados) as total_criados,
  SUM(lancamentos_com_erro) as total_erros,
  ROUND(AVG(CASE WHEN sucesso THEN 100 ELSE 0 END), 2) as taxa_sucesso
FROM lancamentos_recorrentes_log
WHERE executado_em >= CURRENT_DATE - interval '30 days';
```

## 🤖 Pré-Lançamentos (IA)

### Fila de Validação

```sql
-- Pré-lançamentos pendentes
SELECT
  id,
  descricao,
  numero_documento,
  valor_total,
  data_emissao,
  criado_em,
  DATE_PART('day', CURRENT_TIMESTAMP - criado_em) as dias_aguardando
FROM lancamentos_financeiros
WHERE status_lancamento = 'pre_lancamento'
  AND origem_lancamento = 'api'
ORDER BY criado_em;

-- Estatísticas de validação
SELECT
  DATE_TRUNC('week', criado_em) as semana,
  COUNT(*) as total_recebidos,
  COUNT(CASE WHEN status_lancamento = 'validado' THEN 1 END) as validados,
  COUNT(CASE WHEN status_lancamento = 'cancelado' THEN 1 END) as rejeitados,
  COUNT(CASE WHEN status_lancamento = 'pre_lancamento' THEN 1 END) as pendentes
FROM lancamentos_financeiros
WHERE origem_lancamento = 'api'
  AND criado_em >= CURRENT_DATE - interval '30 days'
GROUP BY 1
ORDER BY 1 DESC;
```

## 📈 Relatórios Gerenciais

### DRE Simplificado

```sql
-- Demonstrativo de Resultados do mês
WITH receitas AS (
  SELECT
    c.nome as categoria,
    SUM(l.valor_total) as total
  FROM lancamentos_financeiros l
  JOIN categorias_contabeis c ON l.categoria_contabil_id = c.id
  WHERE l.tipo_lancamento = 'receita'
    AND l.status_lancamento = 'validado'
    AND l.data_competencia >= date_trunc('month', CURRENT_DATE)
    AND l.data_competencia < date_trunc('month', CURRENT_DATE) + interval '1 month'
  GROUP BY c.id, c.nome
),
despesas AS (
  SELECT
    c.nome as categoria,
    SUM(l.valor_total) as total
  FROM lancamentos_financeiros l
  JOIN categorias_contabeis c ON l.categoria_contabil_id = c.id
  WHERE l.tipo_lancamento = 'despesa'
    AND l.status_lancamento = 'validado'
    AND l.data_competencia >= date_trunc('month', CURRENT_DATE)
    AND l.data_competencia < date_trunc('month', CURRENT_DATE) + interval '1 month'
  GROUP BY c.id, c.nome
)
SELECT
  'RECEITAS' as tipo,
  categoria,
  total
FROM receitas
UNION ALL
SELECT
  'DESPESAS' as tipo,
  categoria,
  total
FROM despesas
UNION ALL
SELECT
  'RESULTADO' as tipo,
  'Lucro/Prejuízo' as categoria,
  (SELECT COALESCE(SUM(total), 0) FROM receitas) -
  (SELECT COALESCE(SUM(total), 0) FROM despesas) as total
ORDER BY
  CASE tipo
    WHEN 'RECEITAS' THEN 1
    WHEN 'DESPESAS' THEN 2
    ELSE 3
  END,
  categoria;
```

### Análise de Fornecedores

```sql
-- Top 10 fornecedores por volume
SELECT
  f.nome_fantasia as fornecedor,
  f.cpf_cnpj,
  COUNT(l.id) as qtd_lancamentos,
  SUM(l.valor_total) as total,
  ROUND(AVG(l.valor_total), 2) as ticket_medio,
  MAX(l.data_emissao) as ultima_compra
FROM lancamentos_financeiros l
JOIN fornecedores f ON l.fornecedor_id = f.id
WHERE l.tipo_lancamento = 'despesa'
  AND l.status_lancamento = 'validado'
  AND l.data_competencia >= CURRENT_DATE - interval '90 days'
GROUP BY f.id, f.nome_fantasia, f.cpf_cnpj
ORDER BY total DESC
LIMIT 10;
```

## 🔧 Manutenção e Troubleshooting

### Verificar Integridade

```sql
-- Lançamentos sem itens
SELECT l.*
FROM lancamentos_financeiros l
LEFT JOIN lancamento_itens i ON l.id = i.lancamento_id
WHERE i.id IS NULL;

-- Contas a pagar órfãs
SELECT cp.*
FROM contas_pagar cp
LEFT JOIN lancamentos_financeiros l ON cp.lancamento_id = l.id
WHERE l.id IS NULL;

-- Divisões com percentual incorreto
SELECT
  lancamento_id,
  SUM(percentual) as total_percentual,
  COUNT(*) as socios
FROM lancamento_divisao_socios
GROUP BY lancamento_id
HAVING SUM(percentual) <> 100;
```

### Limpeza e Otimização

```sql
-- Limpar logs antigos (manter últimos 90 dias)
DELETE FROM lancamentos_recorrentes_log
WHERE executado_em < CURRENT_DATE - interval '90 days';

-- Atualizar estatísticas
ANALYZE lancamentos_financeiros;
ANALYZE contas_pagar;
ANALYZE lancamento_itens;

-- Verificar índices
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan;
```

## 📊 Queries para Auditoria

### Rastro de Alterações

```sql
-- Últimas alterações em lançamentos
SELECT
  l.id,
  l.descricao,
  l.criado_por,
  l.criado_em,
  l.atualizado_por,
  l.atualizado_em,
  p1.nome as criado_por_nome,
  p2.nome as atualizado_por_nome
FROM lancamentos_financeiros l
LEFT JOIN pessoas p1 ON l.criado_por = p1.auth_user_id::text
LEFT JOIN pessoas p2 ON l.atualizado_por = p2.auth_user_id::text
WHERE l.atualizado_em > l.criado_em
ORDER BY l.atualizado_em DESC
LIMIT 20;

-- Pagamentos registrados por usuário
SELECT
  p.nome as usuario,
  COUNT(cp.id) as qtd_pagamentos,
  SUM(cp.valor_pago) as total_pago,
  MAX(cp.atualizado_em) as ultimo_pagamento
FROM contas_pagar cp
JOIN pessoas p ON cp.pago_por = p.auth_user_id::text
WHERE cp.status_pagamento = 'pago'
  AND cp.data_pagamento >= CURRENT_DATE - interval '30 days'
GROUP BY p.id, p.nome
ORDER BY qtd_pagamentos DESC;
```

---

**Dica**: Sempre teste queries em ambiente de desenvolvimento primeiro! 🔍
