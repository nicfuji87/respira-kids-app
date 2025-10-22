# Logging - Cadastro de Responsável Financeiro

## 📋 Resumo

Implementado sistema de logging completo para o processo de cadastro de responsável financeiro, **reutilizando as tabelas existentes** do cadastro de paciente público.

---

## ✅ Solução Implementada

### 1. **Reaproveitamento de Tabelas Existentes**

Ao invés de criar tabelas novas, adicionamos o campo `process_type` nas tabelas existentes:

```sql
-- Adicionar campo para identificar o tipo de processo
ALTER TABLE public_registration_logs
ADD COLUMN IF NOT EXISTS process_type TEXT DEFAULT 'patient_registration'
CHECK (process_type IN ('patient_registration', 'financial_responsible'));

ALTER TABLE public_registration_form_data
ADD COLUMN IF NOT EXISTS process_type TEXT DEFAULT 'patient_registration'
CHECK (process_type IN ('patient_registration', 'financial_responsible'));

ALTER TABLE public_registration_api_logs
ADD COLUMN IF NOT EXISTS process_type TEXT DEFAULT 'patient_registration'
CHECK (process_type IN ('patient_registration', 'financial_responsible'));

-- Campo adicional para array de IDs de pacientes (específico do processo financeiro)
ALTER TABLE public_registration_api_logs
ADD COLUMN IF NOT EXISTS patient_ids JSONB;
```

**Vantagens:**

- ✅ **Reutilização**: Aproveita estrutura existente e testada
- ✅ **Manutenção**: Um único ponto para gerenciar logs
- ✅ **Simplicidade**: Menos tabelas para administrar
- ✅ **Flexibilidade**: Fácil adicionar novos processos no futuro

---

## 📊 Tabelas Utilizadas

### 1. **`public_registration_logs`**

Log de eventos gerais (etapas, erros, eventos)

**Campos adicionados:**

- `process_type`: 'patient_registration' ou 'financial_responsible'

**Uso:**

```typescript
await supabase.from('public_registration_logs').insert({
  session_id: sessionId,
  process_type: 'financial_responsible',
  step_name: 'phone_validation',
  event_type: 'step_completed',
  // ... outros campos
});
```

### 2. **`public_registration_form_data`**

Snapshot dos dados do formulário em cada etapa (LGPD compliant)

**Campos adicionados:**

- `process_type`: 'patient_registration' ou 'financial_responsible'

**Uso:**

```typescript
await supabase.from('public_registration_form_data').insert({
  session_id: sessionId,
  process_type: 'financial_responsible',
  step_name: 'new_person_form',
  form_data: maskedData, // CPF/email mascarados
  is_valid: true,
});
```

### 3. **`public_registration_api_logs`**

Logs de chamadas à Edge Function

**Campos adicionados:**

- `process_type`: 'patient_registration' ou 'financial_responsible'
- `patient_ids`: Array de IDs de pacientes vinculados (JSONB)

**Uso na Edge Function:**

```typescript
// Sucesso
await supabase.from('public_registration_api_logs').insert({
  session_id: sessionId,
  process_type: 'financial_responsible',
  http_status: 200,
  duration_ms: duration,
  edge_function_version: 3,
  responsavel_legal_id: responsible.id,
  responsavel_financeiro_id: financialResponsibleId,
  patient_ids: body.patientIds,
  response_body: response,
});

// Erro
await supabase.from('public_registration_api_logs').insert({
  session_id: sessionId,
  process_type: 'financial_responsible',
  http_status: 400,
  duration_ms: duration,
  edge_function_version: 3,
  error_type: 'database_error',
  error_details: {
    message: error.message,
    stack: error.stack,
  },
});
```

---

## 🔧 Edge Function - Versão 3

**Deploy realizado:** ✅ add-financial-responsible v3

**Mudanças implementadas:**

1. ✅ Logging completo de sucesso e erro
2. ✅ Captura de sessionId do frontend
3. ✅ Captura de IP e User-Agent
4. ✅ Duração da requisição (duration_ms)
5. ✅ Versão da Edge Function (v3)
6. ✅ Webhook de erro para alertas
7. ✅ **CORREÇÃO**: Busca tipo 'responsavel' ao invés de 'paciente' ao criar nova pessoa

---

## 📈 Consultas Úteis

### Ver logs de erro do processo financeiro:

```sql
SELECT
  id,
  session_id,
  http_status,
  duration_ms,
  error_type,
  error_details,
  created_at
FROM public_registration_api_logs
WHERE process_type = 'financial_responsible'
  AND http_status >= 400
ORDER BY created_at DESC
LIMIT 20;
```

### Ver logs de sucesso:

```sql
SELECT
  session_id,
  http_status,
  duration_ms,
  responsavel_financeiro_id,
  patient_ids,
  created_at
FROM public_registration_api_logs
WHERE process_type = 'financial_responsible'
  AND http_status = 200
ORDER BY created_at DESC
LIMIT 20;
```

### Estatísticas por processo:

```sql
SELECT
  process_type,
  COUNT(*) as total_requests,
  COUNT(CASE WHEN http_status = 200 THEN 1 END) as success_count,
  COUNT(CASE WHEN http_status >= 400 THEN 1 END) as error_count,
  AVG(duration_ms) as avg_duration_ms
FROM public_registration_api_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY process_type;
```

---

## 🎯 Próximos Passos

1. **Frontend**: Adicionar geração de `sessionId` (UUID) e envio na requisição
2. **Frontend**: Implementar logging de eventos nas etapas (usando `public_registration_logs`)
3. **Frontend**: Implementar captura de erros e envio para logging
4. **Dashboard**: Criar visualização de logs para monitoramento
5. **Alertas**: Configurar n8n para processar eventos de erro via webhook_queue

---

## 📝 Exemplo de Integração Frontend

```typescript
import { v4 as uuidv4 } from 'uuid';

// Gerar sessionId no início do processo
const sessionId = uuidv4();

// Log de início de etapa
await supabase.from('public_registration_logs').insert({
  session_id: sessionId,
  process_type: 'financial_responsible',
  step_name: 'phone_validation',
  event_type: 'step_started',
  ip_address: await getClientIP(),
  user_agent: navigator.userAgent,
  browser_info: {
    browser: getBrowserInfo(),
    screen_resolution: `${window.screen.width}x${window.screen.height}`,
  },
});

// Chamada à Edge Function
const response = await fetch('/functions/v1/add-financial-responsible', {
  method: 'POST',
  body: JSON.stringify({
    sessionId, // Incluir sessionId
    responsiblePhone: phone,
    patientIds: selectedPatients,
    financialResponsible: data,
  }),
});
```

---

## 🐛 Erro Identificado e Corrigido

**Problema:**
A Edge Function estava buscando `tipo_pessoa` com código `'paciente'` ao invés de `'responsavel'` ao criar um novo responsável financeiro.

**Correção aplicada (linha 177-190):**

```typescript
// AI dev note: CORREÇÃO - Buscar tipo 'responsavel' ao invés de 'paciente'
const { data: tipoPessoa, error: errorTipoPessoa } = await supabase
  .from('pessoa_tipos')
  .select('id')
  .eq('codigo', 'responsavel') // ✅ CORRETO
  .single();

if (errorTipoPessoa || !tipoPessoa) {
  console.error(
    '❌ [add-financial-responsible] Tipo responsavel não encontrado:',
    errorTipoPessoa
  );
  throw new Error('Tipo de pessoa "responsavel" não encontrado');
}
```

**Status:** ✅ Corrigido e deployado na versão 3

---

## 📌 Arquivos Modificados

1. ✅ `supabase/functions/add-financial-responsible/index.ts` - Edge Function v3
2. ✅ Migration: `drop_financial_responsible_logging_tables` - Excluiu tabelas duplicadas
3. ✅ Migration: `add_process_type_to_logging_tables` - Adicionou campo process_type
4. ✅ Documentação: `LOGGING_RESPONSAVEL_FINANCEIRO.md`

---

**Versão Edge Function:** 3  
**Data:** 22/10/2025  
**Status:** ✅ Deployado e pronto para uso
