# 🚀 Ação Imediata - Resolver Erro de Cobrança

## ⚡ TL;DR (Resumo Executivo)

**Problema**: Erro ao gerar cobrança em massa  
**Causa**: Consultas sem empresa de faturamento  
**Solução**: Executar SQL → Editar consultas → Tentar novamente  
**Tempo estimado**: 10-15 minutos

---

## 🎯 Passos Rápidos

### 1️⃣ Identificar o Problema (2 min)

Abra o **Supabase SQL Editor** e execute:

```sql
SELECT
  a.id as agendamento_id,
  a.data_hora::date as data,
  p.nome as paciente_nome,
  ts.nome as servico_nome,
  a.valor_servico,
  sp.descricao as status_pagamento,
  a.empresa_fatura_id,
  CASE
    WHEN a.empresa_fatura_id IS NULL THEN '❌ SEM EMPRESA'
    ELSE '✅ TEM EMPRESA'
  END as situacao
FROM agendamentos a
JOIN pessoas p ON p.id = a.paciente_id
JOIN tipos_servico ts ON ts.id = a.tipo_servico_id
JOIN pagamento_status sp ON sp.id = a.status_pagamento_id
JOIN consulta_status sc ON sc.id = a.status_consulta_id
WHERE
  (p.nome ILIKE '%Dauto Coellho%' OR p.nome ILIKE '%Isabel Correa%')
  AND a.ativo = true
  AND sc.codigo != 'cancelado'
  AND sp.codigo NOT IN ('pago', 'cancelado')
ORDER BY p.nome, a.data_hora;
```

**Resultado esperado**: Lista de consultas com status "❌ SEM EMPRESA"

---

### 2️⃣ Ver Empresas Disponíveis (1 min)

```sql
SELECT
  id as empresa_id,
  razao_social,
  nome_fantasia,
  ativo
FROM pessoa_empresas
WHERE ativo = true
ORDER BY razao_social;
```

**Ação**: Copie o `empresa_id` da empresa correta (provavelmente "Respira Kids")

---

### 3️⃣ Corrigir em Massa (2 min)

**⚠️ IMPORTANTE**: Substitua `'ID_DA_EMPRESA_AQUI'` pelo ID real copiado acima!

```sql
-- Corrigir consultas dos pacientes específicos
UPDATE agendamentos
SET
  empresa_fatura_id = 'ID_DA_EMPRESA_AQUI',  -- ← SUBSTITUIR!
  updated_at = NOW()
WHERE
  paciente_id IN (
    SELECT id FROM pessoas
    WHERE nome ILIKE '%Dauto Coellho%' OR nome ILIKE '%Isabel Correa%'
  )
  AND empresa_fatura_id IS NULL
  AND ativo = true
  AND status_consulta_id NOT IN (
    SELECT id FROM consulta_status WHERE codigo = 'cancelado'
  );
```

**Resultado esperado**: "UPDATE X" (onde X é o número de consultas corrigidas)

---

### 4️⃣ Verificar Correção (1 min)

Execute novamente o SQL do **Passo 1**. Agora todas devem mostrar "✅ TEM EMPRESA".

---

### 5️⃣ Testar Cobrança (2 min)

1. Abra a aplicação: **Financeiro → Consultas**
2. Filtre por "Mês atual" (ou período desejado)
3. Clique em **"Selecionar"**
4. Selecione os pacientes ou consultas
5. Clique em **"Gerar Cobranças"**

**Resultado esperado**:

```
✅ Cobranças processadas
2 paciente(s) com sucesso
```

---

## 🎨 Atalho Visual

### Antes da Correção ❌

```
Console do navegador:
❌ Erro ao processar Dauto: Consultas sem empresa de faturamento configurada

Banco de dados:
empresa_fatura_id: NULL
```

### Depois da Correção ✅

```
Console do navegador:
✅ Cobranças processadas - 2 paciente(s) com sucesso

Banco de dados:
empresa_fatura_id: "abc-123-xyz" (Respira Kids)
```

---

## 📋 Checklist Rápido

- [ ] Abri Supabase SQL Editor
- [ ] Executei consulta de verificação (Passo 1)
- [ ] Identifiquei consultas sem empresa
- [ ] Copiei ID da empresa correta (Passo 2)
- [ ] Executei UPDATE (Passo 3)
- [ ] Verifiquei que corrigiu (Passo 4)
- [ ] Testei cobrança na aplicação (Passo 5)
- [ ] ✅ Funcionou!

---

## ⚠️ Avisos Importantes

### Backup Recomendado

Antes do UPDATE, faça backup (opcional mas recomendado):

```sql
-- Criar backup
CREATE TABLE agendamentos_backup_20251008 AS
SELECT * FROM agendamentos
WHERE paciente_id IN (
  SELECT id FROM pessoas
  WHERE nome ILIKE '%Dauto Coellho%' OR nome ILIKE '%Isabel Correa%'
);
```

### Se der Erro no UPDATE

- Verifique se o `empresa_id` está correto
- Verifique se copiou o ID completo (UUID tem 36 caracteres)
- Execute o Passo 2 novamente para confirmar o ID

### Se Ainda não Funcionar

1. Abra o console do navegador (F12)
2. Tente gerar a cobrança novamente
3. Copie o erro completo do console
4. Verifique se há outras consultas sem empresa:
   ```sql
   SELECT COUNT(*)
   FROM agendamentos
   WHERE empresa_fatura_id IS NULL AND ativo = true;
   ```

---

## 🆘 Plano B - Correção Manual

Se preferir não usar SQL em massa:

1. Acesse **Pacientes** → Busque "Dauto Coellho"
2. Clique no paciente
3. Na lista de consultas, clique em cada consulta sem empresa
4. Edite: adicione "Empresa de Faturamento"
5. Salve
6. Repita para "Isabel Correa"

**Tempo estimado**: 5-10 min (depende do número de consultas)

---

## 📊 Status Esperado

### Antes

```
Total de consultas sem empresa: 15
Pacientes afetados: 2
```

### Depois

```
Total de consultas sem empresa: 0
Pacientes afetados: 0
✅ Todas as consultas têm empresa configurada
```

---

## 🎯 Resultado Final

Após seguir estes passos, você deve conseguir:

✅ Gerar cobranças para Dauto Coellho  
✅ Gerar cobranças para Isabel Correa  
✅ Ver agrupamento por paciente funcionando  
✅ Selecionar paciente inteiro ou consultas individuais

---

## 📞 Se Precisar de Ajuda

1. Veja erro detalhado no console (F12)
2. Execute `SQL_VERIFICAR_CONSULTAS_SEM_EMPRESA.sql` completo
3. Consulte `ANALISE_FINANCEIRO_AGRUPAMENTO.md`
4. Entre em contato com os detalhes

---

## ⏱️ Tempo Total: ~10 minutos

| Passo        | Tempo     |
| ------------ | --------- |
| Identificar  | 2 min     |
| Ver empresas | 1 min     |
| Corrigir     | 2 min     |
| Verificar    | 1 min     |
| Testar       | 2 min     |
| **Total**    | **8 min** |

---

**Data**: 08/10/2025  
**Prioridade**: 🔴 ALTA  
**Dificuldade**: 🟢 FÁCIL (apenas executar SQLs)
