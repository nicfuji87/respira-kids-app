# ✅ Fix: Resolver Múltiplos Cadastros com Mesmo Telefone na Agenda Pública

## 📋 Problema

**Erro:** "Não foi possível verificar o WhatsApp" quando há múltiplos cadastros com mesmo telefone.

**Cenários identificados:**

1. ❌ **Dados incorretos** (sendo corrigidos): Pai e mãe com mesmo telefone
2. ✅ **Dados legítimos**: Paciente (filho) tem mesmo telefone do responsável (exigido pelo ASAAS para cobrança)

**Exemplo real:**

```
Telefone: 556199887766

Cadastros encontrados:
- Responsável X (mãe) - tipo: legal, do paciente Z
- Responsável Y (pai) - tipo: financeiro, do paciente Z
- Paciente Z - tipo: paciente, tem telefone da mãe

Query antiga: .maybeSingle() → ❌ ERRO (múltiplos registros)
```

---

## 💡 Solução Implementada

### **Filtrar apenas Responsáveis Legais/Ambos com Dependentes**

**Lógica:**

1. ✅ Buscar apenas pessoas que **SÃO responsáveis** de outros
2. ✅ Filtrar por `tipo_responsabilidade = 'legal'` OU `'ambos'`
3. ✅ Ignorar `tipo_responsabilidade = 'financeiro'`
4. ✅ Garantir que têm pelo menos 1 dependente ativo

**Resultado com o exemplo:**

```
Telefone: 556199887766

Busca responsáveis legais/ambos com dependentes:
- Responsável X (legal) ✅ RETORNA
- Responsável Y (financeiro) ❌ IGNORA
- Paciente Z (não é responsável) ❌ IGNORA

→ Retorna Responsável X
```

---

## 🏗️ Implementação

### **Arquivo:** `src/lib/patient-registration-api.ts`

### **Função:** `findExistingUserByPhone()`

**Antes:**

```typescript
// Buscar qualquer pessoa com o telefone
const { data: pessoa } = await supabase
  .from('vw_usuarios_admin')
  .select('*')
  .eq('telefone', phoneNumberBigInt.toString())
  .eq('ativo', true)
  .maybeSingle(); // ❌ Falha se houver mais de 1
```

**Depois:**

```typescript
// PASSO 1: Buscar responsáveis legais/ambos com dependentes
const { data: responsaveis } = await supabase
  .from('pessoas')
  .select(
    `
    id,
    pessoa_responsaveis!pessoa_responsaveis_id_responsavel_fkey(
      id,
      tipo_responsabilidade,
      ativo
    )
  `
  )
  .eq('telefone', phoneNumberBigInt)
  .eq('ativo', true)
  .not('pessoa_responsaveis', 'is', null); // Deve ter dependentes

// Filtrar apenas legal ou ambos
const responsaveisLegais = responsaveis.filter((resp) => {
  const responsabilidadesAtivas = resp.pessoa_responsaveis.filter(
    (r) => r.ativo
  );
  return responsabilidadesAtivas.some(
    (r) =>
      r.tipo_responsabilidade === 'legal' || r.tipo_responsabilidade === 'ambos'
  );
});

// Se não encontrou, retorna não existe
if (responsaveisLegais.length === 0) {
  return { exists: false };
}

// Pegar o primeiro (caso raro de múltiplos legais)
const responsavelId = responsaveisLegais[0].id;

// PASSO 2: Buscar dados completos na view
const { data: pessoa } = await supabase
  .from('vw_usuarios_admin')
  .select('*')
  .eq('id', responsavelId)
  .maybeSingle();
```

---

## 🎯 Casos de Uso

### **Caso 1: Responsável Legal + Paciente (mesmo telefone)**

```
Telefone: 61981446666

Cadastros:
- Mãe (responsável legal do João) ✅
- João (paciente, telefone da mãe) ❌

→ Retorna: Mãe
```

### **Caso 2: Responsável Legal + Financeiro (mesmo telefone)**

```
Telefone: 61999887766

Cadastros:
- Mãe (responsável legal do João) ✅
- Pai (responsável financeiro do João) ❌

→ Retorna: Mãe (ignora Pai)
```

### **Caso 3: Múltiplos Responsáveis Legais (erro de dados)**

```
Telefone: 61998887766

Cadastros:
- Mãe (responsável legal da Maria) ✅
- Pai (responsável legal do Pedro) ✅

→ Retorna: Primeiro encontrado (Mãe)
→ Log de warning registrado
```

### **Caso 4: Responsável sem Dependentes**

```
Telefone: 61997776666

Cadastros:
- Pessoa X (responsável, mas sem dependentes) ❌

→ Retorna: Não existe (ignora)
```

### **Caso 5: Apenas Paciente**

```
Telefone: 61996665555

Cadastros:
- João (paciente, sem ser responsável) ❌

→ Retorna: Não existe
```

---

## ✅ Vantagens da Solução

✅ **Resolve casos legítimos** - Paciente com telefone do responsável  
✅ **Ignora financeiros** - Só busca responsáveis legais/ambos  
✅ **Ignora pacientes** - Só busca quem é responsável de alguém  
✅ **Previne erros** - Não falha mais com `.maybeSingle()`  
✅ **Logs detalhados** - Console.log para debug  
✅ **Compatível** - Mantém estrutura existente  
✅ **Performance** - Query otimizada com filtros

---

## 🧪 Testes Realizados

### Build:

```bash
npm run build
# ✅ Compilação bem-sucedida
# ✅ Sem erros TypeScript
# ✅ Sem erros de lint
```

---

## 🔍 Debugging

**Logs adicionados:**

```typescript
console.log('🔍 [findExistingUserByPhone] Responsáveis legais encontrados:', {
  telefone: phoneNumber,
  total: responsaveisLegais.length,
});

console.log('✅ [findExistingUserByPhone] Responsável legal encontrado:', {
  id: pessoa.id,
  nome: pessoa.nome,
});
```

**Para acompanhar no Console:**

- 🔍 = Busca iniciada
- ✅ = Sucesso
- ❌ = Não encontrado
- ⚠️ = Warning (múltiplos legais)

---

## 📊 Estrutura de Dados

### **Tabela:** `pessoa_responsaveis`

```sql
id_responsavel UUID    -- Quem é o responsável
id_pessoa UUID          -- De quem é responsável (dependente)
tipo_responsabilidade  -- 'legal', 'financeiro', 'ambos'
ativo BOOLEAN
```

**Exemplo:**

```
| id_responsavel | id_pessoa | tipo_responsabilidade | ativo |
|---------------|-----------|----------------------|-------|
| mãe_id        | joão_id   | 'legal'              | true  |
| pai_id        | joão_id   | 'financeiro'         | true  |
```

**Query filtra:**

- ✅ `mãe_id` (legal)
- ❌ `pai_id` (financeiro)

---

## 🎯 Impacto

**Componentes afetados:**

- ✅ `SharedScheduleWhatsAppValidationStep` - Validação de WhatsApp na agenda pública
- ✅ Cadastro público de paciente (usa mesma função)
- ✅ Cadastro de responsável financeiro (usa mesma função)

**Comportamento mantido:**

- ✅ Responsáveis legais conseguem acessar normalmente
- ✅ Pacientes com telefone duplicado não causam mais erro
- ✅ Responsáveis financeiros são ignorados (correto)

---

## 📝 Notas Técnicas

### **Por que não usar apenas `tipo_pessoa = 'responsavel'`?**

Porque `tipo_pessoa` é do cadastro da pessoa, não indica se ela é responsável de alguém.

**Problemas:**

- Paciente pode ter `tipo_pessoa = 'responsavel'` (erro de dados)
- Responsável sem dependentes seria incluído (incorreto)
- Não filtra por tipo de responsabilidade (legal vs financeiro)

### **Por que filtrar `tipo_responsabilidade`?**

Na tabela `pessoa_responsaveis`, uma pessoa pode ser:

- **legal** = Responsável legal (pode agendar)
- **financeiro** = Responsável financeiro (só para cobrança)
- **ambos** = Ambos

**Agenda pública precisa de responsável LEGAL** (quem pode decidir por procedimentos).

---

## 🚀 Próximos Passos (Futuro)

- [ ] Dashboard para admin identificar telefones duplicados
- [ ] Script de limpeza de dados incorretos
- [ ] Validação no cadastro: avisar se telefone já existe

---

**Status:** ✅ Concluído  
**Data:** 24 de Novembro de 2024  
**Issue:** Múltiplos cadastros com mesmo telefone  
**Solução:** Filtrar responsáveis legais/ambos com dependentes
