# Rate Limiting e Expiração de Código - Implementação

## 📋 Funcionalidades Implementadas

### ✅ **1. Expiração de Código (10 minutos)**

- Código válido por **10 minutos** após envio
- Timer visual em tempo real mostrando minutos restantes
- Validação automática ao expirar
- Mensagem clara: "Código expirado. Solicite um novo código."

### ✅ **2. Rate Limiting (3 tentativas)**

- Máximo de **3 tentativas** de validação por código
- Contador visual de tentativas restantes
- Bloqueio automático após 3 tentativas incorretas
- Tempo de bloqueio: **15 minutos**

---

## 🔄 Fluxo Completo

```
1. Usuário solicita código
   ↓
2. Sistema gera código e define expiração (10 min)
   ↓
3. Salva no sessionStorage:
   - código
   - expiresAt (timestamp)
   - attempts = 0
   - phoneNumber
   ↓
4. Usuário digita código
   ↓
5. Sistema valida:
   - Está bloqueado? → Erro
   - Expirou? → Erro
   - Tentativas > 3? → Bloqueia por 15 min
   - Código correto? → Sucesso
   ↓
6. A cada tentativa incorreta:
   - attempts++
   - Mostra tentativas restantes
   - Se attempts > 3 → Bloqueia
```

---

## 🗄️ Armazenamento (sessionStorage)

### **Estrutura de Dados**

```typescript
interface ValidationData {
  code: string; // Código de 6 dígitos
  expiresAt: number; // Timestamp de expiração
  attempts: number; // Tentativas realizadas
  phoneNumber: string; // Número do telefone
  blockedUntil?: number; // Timestamp de desbloqueio
}
```

### **Chave no sessionStorage**

```
whatsapp_validation_data_61981446666
```

### **Exemplo de Dados Armazenados**

```json
{
  "code": "347256",
  "expiresAt": 1696299556901,
  "attempts": 2,
  "phoneNumber": "61981446666",
  "blockedUntil": 1696300456901
}
```

---

## 🎯 Constantes Configuráveis

```typescript
// Expiração do código
const CODE_EXPIRATION_MS = 10 * 60 * 1000; // 10 minutos

// Máximo de tentativas
const MAX_ATTEMPTS = 3;

// Tempo de bloqueio
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutos
```

---

## 🎨 Interface Visual

### **Timer de Expiração**

```
┌─────────────────────────────────┐
│  🕐 Código expira em 8 minutos  │
└─────────────────────────────────┘
```

### **Contador de Tentativas**

```
┌─────────────────────────────────┐
│  ⚠️ 2 tentativas restantes      │
└─────────────────────────────────┘
```

### **Bloqueio Ativo**

```
┌─────────────────────────────────────────────┐
│  ❌ Número bloqueado por 12 minutos devido │
│     a múltiplas tentativas incorretas.     │
└─────────────────────────────────────────────┘
```

---

## 📝 Funções da API

### **1. `sendValidationCode(phoneNumber)`**

Envia código de validação.

**Retorno:**

```typescript
{
  success: boolean;
  code?: string;
  expiresAt?: number;
  error?: string;
}
```

**Verificações:**

- ✅ Número está bloqueado?
- ✅ Gera código de 6 dígitos
- ✅ Define timestamp de expiração
- ✅ Salva no sessionStorage
- ✅ Registra na webhook_queue
- ✅ Envia webhook

---

### **2. `validateCode(phoneNumber, userCode)`**

Valida código inserido pelo usuário.

**Retorno:**

```typescript
{
  valid: boolean;
  error?: string;
  attemptsRemaining?: number;
  blocked?: boolean;
}
```

**Verificações:**

- ✅ Código existe?
- ✅ Número está bloqueado?
- ✅ Código expirou?
- ✅ Incrementa tentativas
- ✅ Excedeu limite? → Bloqueia
- ✅ Código correto? → Limpa dados

---

### **3. `isPhoneBlocked(phoneNumber)`**

Verifica se número está bloqueado.

**Retorno:**

```typescript
{
  blocked: boolean;
  remainingTime?: number; // minutos
}
```

---

### **4. `isCodeExpired(phoneNumber)`**

Verifica se código expirou.

**Retorno:**

```typescript
{
  expired: boolean;
  remainingTime?: number; // minutos
}
```

---

### **5. `getRemainingAttempts(phoneNumber)`**

Retorna tentativas restantes.

**Retorno:** `number` (0-3)

---

## 🧪 Cenários de Teste

### **Teste 1: Código válido na 1ª tentativa**

```bash
1. Solicitar código
2. Aguardar recebimento
3. Digitar código correto
4. ✅ Validação bem-sucedida
```

### **Teste 2: Código incorreto - 2 tentativas**

```bash
1. Solicitar código
2. Digitar código errado (1ª vez)
   → "Código incorreto. 2 tentativas restantes."
3. Digitar código errado (2ª vez)
   → "Código incorreto. 1 tentativa restante."
4. Digitar código correto (3ª vez)
   → ✅ Validação bem-sucedida
```

### **Teste 3: Bloqueio por tentativas**

```bash
1. Solicitar código
2. Digitar código errado (1ª vez)
3. Digitar código errado (2ª vez)
4. Digitar código errado (3ª vez)
   → ❌ "Número bloqueado por 15 minutos"
5. Tentar validar novamente
   → ❌ Botão desabilitado
6. Tentar solicitar novo código
   → ❌ "Número bloqueado temporariamente"
```

### **Teste 4: Expiração de código**

```bash
1. Solicitar código
2. Aguardar 10 minutos (ou ajustar CODE_EXPIRATION_MS para teste)
3. Digitar código
   → ❌ "Código expirado. Solicite um novo código."
4. Timer mostra "0 minutos"
5. Input desabilitado
```

### **Teste 5: Reenvio de código**

```bash
1. Solicitar código
2. Clicar em "Não recebeu? Reenviar código"
3. ✅ Novo código gerado
4. Timer reinicia em 10 minutos
5. Tentativas resetam para 3
```

### **Teste 6: Bloqueio expira após 15 minutos**

```bash
1. Bloquear número (3 tentativas incorretas)
2. Aguardar 15 minutos
3. Tentar novamente
   → ✅ Bloqueio removido
   → ✅ Pode solicitar novo código
```

---

## 🔒 Segurança

### **Validação no Frontend**

- ✅ Armazenamento em `sessionStorage` (apaga ao fechar aba)
- ✅ Validação de expiração em tempo real
- ✅ Bloqueio temporário automático
- ✅ Limpeza de dados após validação

### **Limitações Atuais**

⚠️ **Validação ocorre no frontend** - Pode ser manipulada
⚠️ **sessionStorage pode ser editado** - Código pode ser visto

### **Melhorias Futuras (Backend)**

- [ ] Mover validação para Edge Function
- [ ] Armazenar tentativas no banco de dados
- [ ] Implementar IP-based rate limiting
- [ ] Hash de código antes de armazenar
- [ ] Logs de segurança (auditoria)

---

## 📊 Métricas de Segurança

### **KPIs Sugeridos**

- Taxa de bloqueio: % de números bloqueados
- Média de tentativas antes da validação
- Taxa de expiração: % de códigos expirados
- Tempo médio para validação
- Taxa de reenvio de código

### **Alertas Recomendados**

- 🚨 Bloqueios frequentes do mesmo número
- 🚨 Taxa de expiração > 30%
- 🚨 Múltiplos códigos para mesmo número em curto período

---

## 🐛 Troubleshooting

### **Problema: Timer não atualiza**

- **Causa**: useEffect não está rodando
- **Solução**: Verificar dependências `[validationState, codeExpiresAt]`

### **Problema: Código não expira**

- **Causa**: `expiresAt` não foi salvo corretamente
- **Solução**: Verificar console.log ao enviar código

### **Problema: Bloqueio não funciona**

- **Causa**: `sessionStorage` pode ter sido limpo
- **Solução**: Verificar console de erros

### **Problema: Tentativas não contam**

- **Causa**: Dados não são salvos após cada tentativa
- **Solução**: Verificar função `saveValidationData`

### **Debug no Console**

```javascript
// Ver dados armazenados
const data = sessionStorage.getItem('whatsapp_validation_data_61981446666');
console.log(JSON.parse(data));

// Limpar dados
sessionStorage.clear();
```

---

## 📱 Experiência Mobile

### **Otimizações**

- ✅ Timer grande e legível
- ✅ Ícones visuais (🕐 ⚠️)
- ✅ Cores diferenciadas (azul/laranja/vermelho)
- ✅ Input numérico para facilitar digitação
- ✅ Feedback imediato em cada tentativa

### **Estados Visuais**

1. **Normal**: Azul - Timer visível, tentativas 3/3
2. **Atenção**: Laranja - Timer < 3 min ou tentativas < 3
3. **Crítico**: Vermelho - Código expirado ou bloqueado

---

## 🚀 Próximos Passos

1. **Edge Function de Validação**
   - Criar função Supabase para validar código
   - Mover lógica de tentativas para backend
   - Retornar apenas success/error

2. **Tabela de Tracking**

   ```sql
   CREATE TABLE validation_attempts (
     id UUID PRIMARY KEY,
     phone_number TEXT NOT NULL,
     code_sent_at TIMESTAMPTZ,
     attempts INTEGER DEFAULT 0,
     validated_at TIMESTAMPTZ,
     blocked_until TIMESTAMPTZ,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```

3. **Rate Limiting por IP**
   - Limitar tentativas por IP
   - Prevenir ataques automatizados

4. **SMS Fallback**
   - Enviar código por SMS se WhatsApp falhar
   - Opção alternativa para usuário

---

**Documentação atualizada em**: 04/10/2025  
**Versão**: 2.0.0 (Rate Limiting + Expiração)
