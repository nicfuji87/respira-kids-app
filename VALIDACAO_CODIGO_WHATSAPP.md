# Validação de Código WhatsApp - Atualização

## 📋 Mudanças Implementadas

### **Novo Fluxo de Validação**

1. ✅ Botão "Continuar" substituído por **"Verificar número"**
2. ✅ Adicionada observação sobre envio de código
3. ✅ Implementado envio de código via webhook
4. ✅ Campo de validação de código de 6 dígitos
5. ✅ Botão "Reenviar código" caso não receba

---

## 🔄 Fluxo Atualizado

### **Etapa 1: Validação do WhatsApp**

1. Usuário digita número
2. Sistema valida se WhatsApp existe
3. Se válido, exibe botão "Verificar número"

### **Etapa 2: Envio do Código**

1. Usuário clica em "Verificar número"
2. Sistema:
   - Gera código aleatório de 6 dígitos
   - Registra na `webhook_queue` do Supabase
   - Envia webhook para endpoint externo
   - Exibe campo para digitar código

### **Etapa 3: Validação do Código**

1. Usuário recebe código no WhatsApp
2. Digita código no campo (6 dígitos)
3. Clica em "Validar código"
4. Sistema valida (comparação local)
5. Se correto, prossegue para próxima etapa

---

## 📡 Webhook Enviado

### **Endpoint**

```
POST https://webhooks-i.infusecomunicacao.online/webhook/webhookRK2
```

### **Payload**

```json
{
  "tipo": "validar_whatsapp",
  "timestamp": "2025-10-03T01:59:16.901267+00:00",
  "data": {
    "whatsapp": "556181446666",
    "codigo": "347256",
    "created_at": "2025-10-03T01:59:16.901267+00:00"
  },
  "webhook_id": "838ca758-3482-4cac-aa88-e119a1a4e61b"
}
```

### **Registro na webhook_queue**

```sql
INSERT INTO webhook_queue (
  evento,
  payload,
  status,
  tentativas,
  max_tentativas,
  proximo_retry
) VALUES (
  'validar_whatsapp',
  '{ "tipo": "validar_whatsapp", ... }',
  'pendente',
  0,
  3,
  NOW()
);
```

---

## 🎨 Interface Atualizada

### **Tela 1: Input de WhatsApp**

```
┌─────────────────────────────────────┐
│  Validação de WhatsApp              │
│  Para começar, precisamos validar   │
│  seu número de WhatsApp             │
│                                     │
│  Número do WhatsApp *               │
│  📱 (61) 98144-6666       ✓         │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ ✅ WhatsApp válido!           │ │
│  │                               │ │
│  │ Clique no botão abaixo para   │ │
│  │ receber um código de          │ │
│  │ validação no seu WhatsApp.    │ │
│  └───────────────────────────────┘ │
│                                     │
│  [ Verificar número ]               │
│                                     │
│  Seus dados são protegidos         │
│  conforme a LGPD                   │
└─────────────────────────────────────┘
```

### **Tela 2: Validação de Código**

```
┌─────────────────────────────────────┐
│  Validação de WhatsApp              │
│  Digite o código que enviamos       │
│  para seu WhatsApp                  │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 📱 Enviamos um código de 6    │ │
│  │ dígitos para seu WhatsApp     │ │
│  │ (61) 98144-6666               │ │
│  └───────────────────────────────┘ │
│                                     │
│  Código de validação *             │
│  ┌────────────┐                    │
│  │  3 4 7 2 5 6                   │
│  └────────────┘                    │
│                                     │
│  [ Validar código ]                 │
│                                     │
│  Não recebeu? Reenviar código      │
│                                     │
│  Seus dados são protegidos         │
│  conforme a LGPD                   │
└─────────────────────────────────────┘
```

---

## 🧪 Como Testar

### **1. Testar Envio de Código**

```bash
# Abrir console do navegador
# Acessar: http://localhost:5173/#/cadastro-paciente
# Digitar número válido
# Clicar em "Verificar número"
# Verificar logs no console:
# - "✅ Código de validação enviado: { phoneNumber, webhookId }"
# - Código gerado será exibido (remover em produção)
```

### **2. Verificar Registro na Queue**

```sql
-- No Supabase Dashboard
SELECT * FROM webhook_queue
WHERE evento = 'validar_whatsapp'
ORDER BY created_at DESC
LIMIT 5;
```

### **3. Testar Validação de Código**

```bash
# Após enviar código
# Digitar código exibido no console
# Clicar em "Validar código"
# Verificar toast de sucesso
```

### **4. Testar Código Incorreto**

```bash
# Digitar código errado (ex: 123456)
# Clicar em "Validar código"
# Verificar mensagem de erro:
# "Código incorreto. Verifique e tente novamente."
```

### **5. Testar Reenvio**

```bash
# Clicar em "Não recebeu? Reenviar código"
# Verificar novo código gerado
# Validar novo código
```

---

## 🔒 Segurança

### **Geração de Código**

- Código aleatório de 6 dígitos (100000-999999)
- Gerado no cliente (por enquanto)
- **TODO**: Mover geração para backend

### **Validação**

- Comparação local (por enquanto)
- **TODO**: Implementar validação no backend com expiração

### **Rate Limiting**

- **TODO**: Implementar limite de tentativas (3-5 por número)
- **TODO**: Bloqueio temporário após múltiplas falhas

---

## 📝 Próximas Melhorias

1. **Expiração de Código**
   - Código válido por 5-10 minutos
   - Armazenar timestamp no backend

2. **Validação no Backend**
   - Edge Function para validar código
   - Prevenir manipulação no frontend

3. **Rate Limiting**
   - Máximo 3 tentativas por número
   - Bloqueio temporário após falhas

4. **Tracking Avançado**
   - Registrar tentativas de validação
   - Analytics de taxa de sucesso

5. **Melhoria de UX**
   - Timer visual de expiração
   - Auto-validação ao digitar 6 dígitos
   - Feedback sonoro/visual ao receber código

---

## 🐛 Troubleshooting

### **Código não foi enviado**

- Verificar console para erros
- Verificar `webhook_queue` no Supabase
- Verificar endpoint do webhook está online

### **Código não valida**

- Verificar código digitado (6 dígitos)
- Verificar código exibido no console
- Verificar se não há espaços extras

### **Webhook não processa**

- Verificar tabela `webhook_queue`
- Verificar campo `status` (pendente/processado/erro)
- Verificar logs de erro na coluna `erro`

---

**Documentação atualizada em**: 04/10/2025  
**Versão**: 1.1.0 (Etapa 1 completa - WhatsApp + Código)
