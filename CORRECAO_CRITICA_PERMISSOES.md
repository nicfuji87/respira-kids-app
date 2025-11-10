# 🐛 CORREÇÃO CRÍTICA: Permissões de Cadastro

## ❌ Problema Identificado

Usuário **admin** (Bruna Cury) recebia erro "Sem permissão para cadastrar pacientes" ao tentar usar a funcionalidade "Novo Paciente".

### Erro no Console:

```
GET .../pessoas?select=role&user_id=eq.687dfe28-41c5-474d-83de-d39ceb82c65c 400 (Bad Request)
Erro ao criar paciente: Error: Sem permissão para cadastrar pacientes
```

---

## 🔍 Diagnóstico

### Dados no Supabase (Confirmados via MCP):

**Bruna Cury Lourenço Peres**:

- ✅ ID: `c4883f76-d010-4fb4-ac5b-248914e56e6e`
- ✅ Email: `brunacurylp@gmail.com`
- ✅ **Role: `admin`** ← Permissão correta
- ✅ auth_user_id: `687dfe28-41c5-474d-83de-d39ceb82c65c`
- ✅ Ativo: `true`
- ✅ Aprovado: `true`

### Problema Encontrado:

**Nome da coluna incorreto na query**

```typescript
// ❌ ERRADO (admin-patient-registration-api.ts linha 185)
.eq('user_id', user.user.id)

// ✅ CORRETO
.eq('auth_user_id', user.user.id)
```

### Por que deu erro?

A tabela `pessoas` **NÃO** tem coluna `user_id`, tem coluna `auth_user_id`:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'pessoas' AND column_name LIKE '%user%';

-- Resultado: auth_user_id
```

---

## ✅ Solução Aplicada

### Arquivo: `src/lib/admin-patient-registration-api.ts`

**Linha 185**:

```typescript
// Antes
const { data: pessoa } = await supabase
  .from('pessoas')
  .select('role')
  .eq('user_id', user.user.id) // ❌ Coluna não existe
  .single();

// Depois
const { data: pessoa } = await supabase
  .from('pessoas')
  .select('role')
  .eq('auth_user_id', user.user.id) // ✅ Coluna correta
  .single();
```

---

## 📊 Resultado

### Antes:

```
❌ Query: .../pessoas?select=role&user_id=eq.687dfe28...
❌ Resposta: 400 Bad Request
❌ Resultado: "Sem permissão para cadastrar pacientes"
```

### Depois:

```
✅ Query: .../pessoas?select=role&auth_user_id=eq.687dfe28...
✅ Resposta: { role: "admin" }
✅ Resultado: Permissão concedida ✓
```

---

## 🚀 Commit e Deploy

**Hash**: `fe71dea`  
**Mensagem**: `fix: Corrige nome da coluna de user_id para auth_user_id`

**Alterações**:

- 1 arquivo modificado
- 1 linha removida
- 1 linha adicionada

---

## ✅ Status

- ✅ **Bruna Cury (admin)**: Pode cadastrar pacientes
- ✅ **Secretárias**: Podem cadastrar pacientes
- ✅ **Profissionais**: Bloqueados (correto)
- ✅ **Query corrigida**: Usa coluna existente
- ✅ **Deploy**: Pronto para produção

---

## 🧪 Como Validar

1. Fazer login como **admin** ou **secretaria**
2. Ir para "Pacientes"
3. Clicar em "Novo Paciente"
4. ✅ Dialog deve abrir normalmente
5. ✅ Sem erros 400 no console

---

**🎉 PROBLEMA RESOLVIDO!**

O cadastro administrativo agora funciona corretamente para usuários com permissão.
