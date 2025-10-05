# 🔒 Sistema de Validação WhatsApp - Backend

Sistema completo de validação de WhatsApp com segurança enterprise-level implementado via Edge Function e banco de dados.

## 📋 Resumo Executivo

**Antes:** Validação no frontend com `sessionStorage` (insegura, facilmente contornável)  
**Depois:** Validação no backend com hash SHA-256, rate limiting por IP e telefone, e auditoria completa

---

## 🗄️ Estrutura de Banco de Dados

### Tabela: `whatsapp_validation_attempts`

```sql
CREATE TABLE whatsapp_validation_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Dados do telefone
  phone_number BIGINT NOT NULL,

  -- Segurança (código em hash SHA-256)
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,

  -- Rate limiting por telefone
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  blocked_until TIMESTAMPTZ,

  -- Status
  validated BOOLEAN DEFAULT FALSE,
  validated_at TIMESTAMPTZ,

  -- Auditoria e segurança (rate limiting por IP)
  ip_address TEXT,
  user_agent TEXT,

  -- Rastreamento de webhook
  webhook_sent BOOLEAN DEFAULT FALSE,
  webhook_id UUID,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Índices

- `idx_whatsapp_validation_phone` - Performance em consultas por telefone
- `idx_whatsapp_validation_expires` - Limpeza de códigos expirados
- `idx_whatsapp_validation_ip` - Rate limiting por IP
- `idx_whatsapp_validation_created` - Analytics e auditoria

### Row Level Security (RLS)

- ✅ **Leitura pública:** Permite analytics e dashboards públicos
- ✅ **Escrita restrita:** Apenas Edge Functions (service role) podem inserir/atualizar

---

## 🚀 Edge Function: `validate-whatsapp-code`

### Endpoint

```
POST https://[PROJECT_REF].supabase.co/functions/v1/validate-whatsapp-code
```

### Ações

#### 1. Enviar Código (`send_code`)

**Request:**

```json
{
  "action": "send_code",
  "phoneNumber": "61981446666"
}
```

**Response (Sucesso):**

```json
{
  "success": true,
  "action": "code_sent",
  "expiresAt": "2025-10-04T12:30:00.000Z",
  "debug_code": "123456" // REMOVER EM PRODUÇÃO
}
```

**Response (Bloqueado por IP):**

```json
{
  "success": false,
  "action": "blocked",
  "error": "Limite de tentativas por IP excedido. Aguarde 1 hora."
}
```

**Response (Bloqueado por telefone):**

```json
{
  "success": false,
  "action": "blocked",
  "blockedUntil": "2025-10-04T12:45:00.000Z",
  "error": "Número bloqueado por 15 minutos."
}
```

#### 2. Validar Código (`validate_code`)

**Request:**

```json
{
  "action": "validate_code",
  "phoneNumber": "61981446666",
  "code": "123456"
}
```

**Response (Sucesso):**

```json
{
  "success": true,
  "action": "code_validated"
}
```

**Response (Código incorreto - com tentativas restantes):**

```json
{
  "success": false,
  "attemptsRemaining": 2,
  "blocked": false,
  "error": "Código incorreto. 2 tentativas restantes."
}
```

**Response (Bloqueado por exceder tentativas):**

```json
{
  "success": false,
  "attemptsRemaining": 0,
  "blocked": true,
  "blockedUntil": "2025-10-04T12:45:00.000Z",
  "error": "Número bloqueado por 15 minutos devido a múltiplas tentativas incorretas."
}
```

---

## 🔐 Segurança Implementada

### 1. Hash SHA-256

- Códigos **nunca armazenados em texto puro**
- Apenas hash SHA-256 é salvo no banco
- Impossível recuperar código original

### 2. Rate Limiting por IP

- **Limite:** 10 tentativas por hora
- **Função:** `check_ip_rate_limit(p_ip_address, p_max_attempts)`
- **Ação:** Bloqueia IP e insere alerta na `webhook_queue`

### 3. Rate Limiting por Telefone

- **Limite:** 3 tentativas de validação
- **Bloqueio:** 15 minutos após exceder
- **Ação:** Bloqueia telefone e insere alerta na `webhook_queue`

### 4. Expiração de Código

- **Tempo:** 10 minutos
- **Verificação:** Server-side (não pode ser contornada)

### 5. Auditoria Completa

- IP, User Agent, timestamps
- Histórico de tentativas preservado
- Rastreamento de webhooks enviados

---

## 🔔 Sistema de Alertas

Quando um bloqueio ocorre, um alerta é automaticamente inserido na `webhook_queue`:

```json
{
  "tipo": "alerta_bloqueio_whatsapp",
  "timestamp": "2025-10-04T12:15:00.000Z",
  "data": {
    "phone_number": "61981446666",
    "ip_address": "192.168.1.1",
    "reason": "phone", // ou "ip"
    "blocked_until": "2025-10-04T12:30:00.000Z"
  },
  "webhook_id": "uuid-here"
}
```

---

## 🧹 Manutenção

### Função: `cleanup_expired_validation_codes()`

Remove códigos expirados há mais de 1 dia (não validados).

**Executar via cron:**

```sql
SELECT cleanup_expired_validation_codes();
-- Retorna: quantidade de registros deletados
```

**Sugestão:** Executar diariamente à meia-noite via Supabase Cron.

---

## 📊 Analytics

Com RLS permitindo leitura pública, você pode criar dashboards com:

```sql
-- Taxa de sucesso de validação
SELECT
  COUNT(*) as total_attempts,
  SUM(CASE WHEN validated = true THEN 1 ELSE 0 END) as successful,
  ROUND(SUM(CASE WHEN validated = true THEN 1 ELSE 0 END)::numeric / COUNT(*) * 100, 2) as success_rate
FROM whatsapp_validation_attempts;

-- Tentativas por hora
SELECT
  date_trunc('hour', created_at) as hour,
  COUNT(*) as attempts
FROM whatsapp_validation_attempts
GROUP BY hour
ORDER BY hour DESC;

-- IPs bloqueados
SELECT
  ip_address,
  COUNT(*) as attempts,
  MAX(created_at) as last_attempt
FROM whatsapp_validation_attempts
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY ip_address
HAVING COUNT(*) >= 10;
```

---

## 🧪 Testes

### Teste 1: Envio de Código

```javascript
const { data, error } = await supabase.functions.invoke(
  'validate-whatsapp-code',
  {
    body: { action: 'send_code', phoneNumber: '61981446666' },
  }
);

console.log('Código [DEBUG]:', data.debug_code);
```

### Teste 2: Validação Correta

```javascript
const { data, error } = await supabase.functions.invoke(
  'validate-whatsapp-code',
  {
    body: {
      action: 'validate_code',
      phoneNumber: '61981446666',
      code: '123456',
    },
  }
);

console.log('Validado:', data.success); // true
```

### Teste 3: Rate Limiting (Telefone)

```javascript
// Tente validar 4 vezes com código errado
for (let i = 0; i < 4; i++) {
  const { data } = await supabase.functions.invoke('validate-whatsapp-code', {
    body: {
      action: 'validate_code',
      phoneNumber: '61981446666',
      code: '000000',
    },
  });
  console.log(`Tentativa ${i + 1}:`, data);
}
// 4ª tentativa deve retornar bloqueio
```

### Teste 4: Rate Limiting (IP)

```javascript
// Envie código 11 vezes para testar limite de IP
for (let i = 0; i < 11; i++) {
  const { data } = await supabase.functions.invoke('validate-whatsapp-code', {
    body: { action: 'send_code', phoneNumber: `6198144666${i}` },
  });
  console.log(`Tentativa ${i + 1}:`, data);
}
// 11ª tentativa deve retornar bloqueio por IP
```

---

## 📝 Changelog

### v2.0.0 (2025-10-04) - Backend Completo

- ✅ Criada tabela `whatsapp_validation_attempts`
- ✅ Edge Function `validate-whatsapp-code`
- ✅ Hash SHA-256 para códigos
- ✅ Rate limiting por IP (10/hora)
- ✅ Rate limiting por telefone (3 tentativas)
- ✅ Sistema de alertas via `webhook_queue`
- ✅ Auditoria completa
- ✅ RLS para leitura pública (analytics)

### v1.0.0 (2025-10-03) - Validação Básica

- ✅ Validação via `sessionStorage` (frontend)
- ✅ Expiração de 10 minutos
- ✅ Máximo de 3 tentativas

---

## 🚨 TODO: Antes de Produção

- [ ] **REMOVER `debug_code`** da Edge Function
- [ ] Configurar Supabase Cron para `cleanup_expired_validation_codes()`
- [ ] Configurar alertas de bloqueio (email/Slack/Discord)
- [ ] Adicionar captcha se rate limit por IP for excedido muitas vezes
- [ ] Implementar dashboard de analytics
- [ ] Documentar recuperação de conta bloqueada (suporte)

---

## 👥 Suporte

Para desbloquear manualmente um número/IP:

```sql
-- Desbloquear telefone
UPDATE whatsapp_validation_attempts
SET blocked_until = NULL, attempts = 0
WHERE phone_number = 61981446666;

-- Ver tentativas de um IP
SELECT * FROM whatsapp_validation_attempts
WHERE ip_address = '192.168.1.1'
ORDER BY created_at DESC;
```

---

**Desenvolvido com ❤️ para Respira Kids**
