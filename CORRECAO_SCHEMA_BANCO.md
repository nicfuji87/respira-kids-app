# 🐛 CORREÇÃO CRÍTICA: Schema do Banco de Dados

## ❌ Erro Original

```
POST .../pessoas?select=id 400 (Bad Request)
Could not find the 'tipo_pessoa' column of 'pessoas' in the schema cache
```

---

## 🔍 Problemas Identificados

O código estava usando **nomes incorretos** de colunas e tabelas que não existem no Supabase.

### 1. **Campo `tipo_pessoa` não existe**

**❌ Código Errado**:

```typescript
await supabase.from('pessoas').insert({
  nome: '...',
  tipo_pessoa: 'responsavel', // ❌ Coluna não existe
  id_tipo_pessoa: uuid,
});
```

**✅ Correção**:

```typescript
await supabase.from('pessoas').insert({
  nome: '...',
  // tipo_pessoa removido
  id_tipo_pessoa: uuid, // ✅ Somente esta coluna existe
});
```

**Validação no Supabase**:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'pessoas' AND column_name LIKE '%tipo%';
-- Resultado: id_tipo_pessoa (UUID)
```

---

### 2. **Tabela `paciente_responsavel` não existe**

**❌ Código Errado**:

```typescript
await supabase.from('paciente_responsavel').insert({
  id_paciente: uuid,
  id_responsavel: uuid,
  tipo_responsavel: 'legal', // ❌ Tabela e colunas erradas
});
```

**✅ Correção**:

```typescript
await supabase.from('pessoa_responsaveis').insert({
  id_pessoa: uuid, // ✅ id_pessoa
  id_responsavel: uuid,
  tipo_responsabilidade: 'legal', // ✅ tipo_responsabilidade
});
```

**Validação no Supabase**:

- ✅ Tabela: `pessoa_responsaveis`
- ✅ Colunas: `id_pessoa`, `id_responsavel`, `tipo_responsabilidade`

---

### 3. **Tabela `paciente_profissional` não existe**

**❌ Código Errado**:

```typescript
await supabase.from('paciente_profissional').insert({
  id_paciente: uuid,
  id_profissional: pediatraId,
});
```

**✅ Correção**:

```typescript
await supabase.from('paciente_pediatra').insert({
  paciente_id: uuid, // ✅ paciente_id
  pediatra_id: pediatraId, // ✅ pediatra_id
});
```

**Validação no Supabase**:

- ✅ Tabela: `paciente_pediatra`
- ✅ Colunas: `paciente_id`, `pediatra_id`

---

### 4. **Tabela `pessoa_autorizacoes` não existe**

**❌ Código Errado**:

```typescript
await supabase.from('pessoa_autorizacoes').insert({
  pessoa_id: uuid,
  tipo_autorizacao: 'uso_cientifico',
  concedida: true,
});
```

**✅ Correção**:

```typescript
// Autorizações ficam DIRETO na tabela pessoas
await supabase.from('pessoas').insert({
  nome: '...',
  autorizacao_uso_cientifico: true,
  autorizacao_uso_redes_sociais: false,
  autorizacao_uso_do_nome: false,
});
```

**Validação no Supabase**:

- ✅ Campos na tabela `pessoas`:
  - `autorizacao_uso_cientifico`
  - `autorizacao_uso_redes_sociais`
  - `autorizacao_uso_do_nome`

---

### 5. **Campo `responsavel_cobranca_id` obrigatório**

**❌ Código Errado**:

```typescript
await supabase.from('pessoas').insert({
  nome: '...',
  // responsavel_cobranca_id faltando
});
```

**✅ Correção**:

```typescript
await supabase.from('pessoas').insert({
  nome: '...',
  responsavel_cobranca_id: responsavelFinanceiroId, // ✅ Adicionado
});
```

---

### 6. **ID do Pediatra Incorreto**

**❌ Código Errado**:

```typescript
const handlePediatricianContinue = (data) => {
  pediatraId: data.pediatraId || data.pessoaId; // ❌ Campos errados
};
```

**✅ Correção**:

```typescript
const handlePediatricianContinue = (data: PediatricianData) => {
  pediatraId: data.id; // ✅ ID da pessoa_pediatra
};
```

---

## 📊 Resumo das Mudanças

| Item                | Antes                   | Depois                    |
| ------------------- | ----------------------- | ------------------------- |
| Coluna tipo         | `tipo_pessoa`           | Removido                  |
| Tabela responsável  | `paciente_responsavel`  | `pessoa_responsaveis`     |
| Coluna pessoa       | `id_paciente`           | `id_pessoa`               |
| Coluna tipo resp.   | `tipo_responsavel`      | `tipo_responsabilidade`   |
| Tabela pediatra     | `paciente_profissional` | `paciente_pediatra`       |
| Coluna pediatra     | `id_profissional`       | `pediatra_id`             |
| Tabela autorizações | `pessoa_autorizacoes`   | Campos em `pessoas`       |
| Campo cobrança      | Faltando                | `responsavel_cobranca_id` |
| ID pediatra handler | `pediatraId/pessoaId`   | `id`                      |

---

## ✅ Arquivos Corrigidos

1. **`src/lib/admin-patient-registration-api.ts`**:
   - Removido campo `tipo_pessoa`
   - Corrigido nome de tabelas e colunas
   - Adicionado `responsavel_cobranca_id`
   - Autorizações salvas direto no INSERT

2. **`src/components/composed/AdminPatientRegistrationDialog.tsx`**:
   - Corrigido handler do pediatra para usar campo `id`
   - Corrigido initialData do PediatricianStep

---

## 🚀 Commit

**Hash**: `63883e3`  
**Mudanças**:

- 2 arquivos modificados
- 20 linhas adicionadas
- 25 linhas removidas

---

## 🧪 Validação

Todos os nomes de tabelas e colunas foram validados via **MCP Supabase**:

```sql
✅ Tabela pessoas: id_tipo_pessoa (UUID)
✅ Tabela pessoa_responsaveis: id_pessoa, id_responsavel, tipo_responsabilidade
✅ Tabela paciente_pediatra: paciente_id, pediatra_id
✅ Campos autorizações em pessoas: autorizacao_uso_*
```

---

## 🎯 Próximo Teste

Agora o cadastro deve funcionar completamente:

1. Validação de WhatsApp ✅
2. Detecção de responsável ✅
3. Dados do paciente ✅
4. Resp. financeiro ✅
5. Pediatra ✅
6. Autorizações ✅
7. **Criação no banco** ✅ (agora corrigido)
8. Geração de contrato ✅

---

**🎉 TESTE NOVAMENTE!**

Todas as queries agora usam tabelas e colunas que realmente existem no banco.
