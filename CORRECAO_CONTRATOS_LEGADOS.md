# ✅ Correção: Suporte a Contratos Legados

## 🐛 Problema Identificado

O paciente **Miguel Oliveira Lucas** (ID: `20aed013-0312-4ee6-b858-b12bb14636bf`) possui contrato armazenado no campo legado `link_contrato` da tabela `pessoas`, mas o sistema exibia "Gerar Contrato" como se não tivesse contrato.

### Diagnóstico

- ✅ Campo `link_contrato`: `https://drive.google.com/file/d/1D2TZMmgbtJC5qoRomqfqO64ufptmxxeQ/view?usp=drivesdk`
- ❌ Tabela `user_contracts`: Vazia
- ⚠️ Sistema só verificava `user_contracts`

---

## ✅ Solução Implementada

### 1. **Atualização da API** (`patient-api.ts`)

Função `fetchPatientContract()` agora implementa **fallback em duas etapas**:

```typescript
1. Buscar em user_contracts (sistema novo)
   ↓ Se não encontrar
2. Buscar em pessoas.link_contrato (sistema legado)
   ↓ Se encontrar
3. Retornar como contrato legado (is_legacy: true)
```

### 2. **Compatibilidade com Contratos Legados**

Quando `is_legacy = true`:

- ✅ Status exibido: "Contrato Assinado"
- ✅ Badge verde com check
- ✅ Botão "Abrir Contrato (PDF)" que abre link externo
- ✅ Alert informativo: "Este é um contrato do sistema anterior"
- ❌ Sem modal de visualização (conteúdo não armazenado)
- ❌ Sem geração de PDF via Edge Function
- ❌ Não permite regerar contrato

---

## 📊 Estrutura de Dados

### Contrato Novo (user_contracts)

```typescript
{
  id: "uuid",
  nome_contrato: "Contrato Fisioterapia - Paciente",
  conteudo_final: "texto completo markdown",
  arquivo_url: "https://..." | "Aguardando" | null,
  status_contrato: "pendente" | "assinado",
  data_geracao: "2025-11-08",
  data_assinatura: "2025-11-09",
  is_legacy: false
}
```

### Contrato Legado (pessoas.link_contrato)

```typescript
{
  id: "pessoa_id",
  nome_contrato: "Contrato - Nome do Paciente",
  conteudo_final: "", // Não armazenado
  arquivo_url: "https://drive.google.com/...",
  status_contrato: "assinado", // Assumido
  data_geracao: null,
  data_assinatura: null,
  is_legacy: true // Flag de identificação
}
```

---

## 🔄 Fluxo de Detecção

```
fetchPatientContract(patientId)
  ↓
┌─────────────────────────────┐
│ Buscar em user_contracts    │
│ WHERE pessoa_id = patientId │
│   AND ativo = true          │
└─────────────────────────────┘
  ↓
┌─────────────────┐
│ Encontrou?      │
├─────────────────┤
│ SIM → Retornar  │──────→ Contrato Novo
│                 │
│ NÃO → Fallback  │
└─────────────────┘
  ↓
┌─────────────────────────────┐
│ Buscar em pessoas           │
│ SELECT link_contrato        │
│ WHERE id = patientId        │
└─────────────────────────────┘
  ↓
┌─────────────────────────┐
│ link_contrato preenchido?│
├─────────────────────────┤
│ SIM → Retornar legado   │──→ Contrato Legado
│                         │
│ NÃO → Sem contrato      │──→ Exibir "Gerar Contrato"
└─────────────────────────┘
```

---

## 🎨 Interface Atualizada

### Contrato Legado (Miguel Oliveira Lucas)

```
┌──────────────────────────────────────┐
│ Contrato                             │
├──────────────────────────────────────┤
│ ✅ Contrato Assinado                 │
│                                      │
│ ⓘ Este é um contrato do sistema      │
│   anterior. Apenas visualização      │
│   do PDF está disponível.            │
│                                      │
│ [Abrir Contrato (PDF)]               │
└──────────────────────────────────────┘
```

### Contrato Novo

```
┌──────────────────────────────────────┐
│ Contrato                             │
├──────────────────────────────────────┤
│ ✅ Contrato Assinado                 │
│    Assinado em 08/11/2025            │
│                                      │
│ [Ver Contrato]                       │
└──────────────────────────────────────┘
```

---

## ✅ Testes de Validação

### Teste 1: Contrato Legado (Miguel Oliveira Lucas)

- ✅ Detecta `link_contrato` preenchido
- ✅ Exibe badge "Contrato Assinado"
- ✅ Exibe alerta informativo
- ✅ Botão abre link externo em nova aba
- ✅ Não permite gerar novo contrato

### Teste 2: Contrato Novo

- ✅ Busca primeiro em `user_contracts`
- ✅ Ignora campo `link_contrato` se já tem novo
- ✅ Permite visualizar conteúdo
- ✅ Permite baixar PDF via Edge Function

### Teste 3: Sem Contrato

- ✅ Verifica ambas as fontes
- ✅ Exibe "Este paciente não possui contrato"
- ✅ Permite gerar novo contrato

---

## 🚀 Migração Futura (Opcional)

Para consolidar todos os contratos legados em `user_contracts`:

```sql
-- Script de migração (NÃO EXECUTAR AINDA)
INSERT INTO user_contracts (
  pessoa_id,
  contract_template_id,
  nome_contrato,
  conteudo_final,
  arquivo_url,
  status_contrato,
  data_geracao,
  data_assinatura,
  ativo,
  variaveis_utilizadas
)
SELECT
  p.id as pessoa_id,
  (SELECT id FROM contract_templates WHERE ativo = true LIMIT 1) as contract_template_id,
  'Contrato - ' || p.nome as nome_contrato,
  '' as conteudo_final,
  p.link_contrato as arquivo_url,
  'assinado' as status_contrato,
  p.created_at as data_geracao,
  p.created_at as data_assinatura,
  true as ativo,
  '{}'::jsonb as variaveis_utilizadas
FROM pessoas p
WHERE p.link_contrato IS NOT NULL
  AND p.link_contrato != ''
  AND p.id_tipo_pessoa = (SELECT id FROM pessoa_tipos WHERE codigo = 'paciente')
  AND NOT EXISTS (
    SELECT 1 FROM user_contracts uc
    WHERE uc.pessoa_id = p.id AND uc.ativo = true
  );
```

**Benefícios**:

- Centraliza todos os contratos em uma tabela
- Permite análises e relatórios unificados
- Facilita manutenção futura

**Considerações**:

- Executar apenas após aprovação
- Fazer backup antes
- Testar em ambiente de staging

---

## 📝 Notas Importantes

1. **Prioridade**: `user_contracts` sempre tem prioridade sobre `link_contrato`
2. **Retrocompatibilidade**: Garantida para todos os contratos antigos
3. **Sem Breaking Changes**: Nenhuma funcionalidade existente foi quebrada
4. **Performance**: Adiciona apenas 1 query extra quando não há contrato novo

---

## ✅ Status: IMPLEMENTADO E TESTADO

Sistema agora suporta:

- ✅ Contratos novos (`user_contracts`)
- ✅ Contratos legados (`pessoas.link_contrato`)
- ✅ Detecção automática do tipo
- ✅ Interface adaptada para cada tipo
