# 🚀 TESTE FINAL - Google Calendar (COM LOGS DETALHADOS)

## ✅ TUDO PRONTO:

- [x] Edge Function `google-oauth-callback` v4 - COM LOGS COMPLETOS
- [x] Edge Function `sync-google-calendar` v2
- [x] Migrations aplicadas
- [x] Trigger funcionando
- [x] Webhook funcionando
- [x] Bruna limpa (sem tokens temporários)

---

## 🎯 TESTE DEFINITIVO - 5 MINUTOS

### **1. ABRIR CONSOLE (F12)**

**ANTES de qualquer coisa:**
- Pressione **F12**
- Vá na aba **Console**
- **DEIXE ABERTO**

---

### **2. LOGIN**

- Login como: `brunacurylp@gmail.com`

---

### **3. IR EM CONFIGURAÇÕES → MEU PERFIL**

- URL: https://app.respirakidsbrasilia.com.br/configuracoes

---

### **4. CLICAR EM "CONECTAR COM GOOGLE"**

**NO CONSOLE DEVE APARECER:**
```
🔗 Redirecionando para OAuth com redirect_uri: https://app.respirakidsbrasilia.com.br/auth/google/callback
```

---

### **5. AUTORIZAR NO GOOGLE**

- Clicar em **"Permitir"**

---

### **6. AGUARDAR E OBSERVAR O CONSOLE**

**Você verá uma SEQUÊNCIA de logs:**

```javascript
⭐ ============ INICIO CALLBACK OAUTH ============
📦 1. Body recebido: {...}
👤 2. UserId: c4883f76-d010-4fb4-ac5b-248914e56e6e | autoEnable: false
🔑 3. Variáveis de ambiente: { hasClientId: true, hasClientSecret: true, hasAppUrl: true, appUrl: "https://app..." }
🔗 4. Redirect URI: https://app.respirakidsbrasilia.com.br/auth/google/callback
📤 5. Chamando Google Token API...
📊 6. Response do Google: { status: 200, statusText: "OK", ok: true }
✅ 8. Tokens obtidos: { hasAccessToken: true, hasRefreshToken: true, expiresIn: 3599 }
📅 9. Buscando calendário primário...
✅ 10. Calendário encontrado: primary
📦 11. Criando cliente Supabase...
💾 12. Salvando tokens no banco...
     UserId: c4883f76-d010-4fb4-ac5b-248914e56e6e
     CalendarId: primary
     ExpiresAt: 2025-09-30T16:05:00.000Z
✅ 14. Salvo com sucesso!
     Dados atualizados: [{ id: "...", nome: "Bruna Cury...", google_calendar_enabled: true }]
⭐ ============ FIM CALLBACK OAUTH - SUCESSO ============
```

**E na tela:**
```
✅ Conectado com Sucesso!
```

---

### **7. SE DER ERRO:**

**Você verá no console EXATAMENTE onde falhou:**

```javascript
📦 1. Body recebido: {...}
👤 2. UserId: ...
🔑 3. Variáveis de ambiente: { hasClientId: true, ... }
📤 5. Chamando Google Token API...
❌ 7. Erro do Google: { "error": "invalid_grant" }  ← AQUI!
⚠️ ============ FIM CALLBACK OAUTH - ERRO ============
```

**COPIE TODO O LOG DO CONSOLE e me envie!**

---

## 🧪 TESTE 2: Criar Agendamento

**Depois que aparecer "✅ Conectado com Sucesso":**

### **1. IR EM AGENDA**

### **2. CRIAR AGENDAMENTO:**
```
Data: 01/10/2025
Hora: 16:00
Paciente: Henrique Kenzo
Profissional: Bruna Cury
Tipo: Fisioterapia Motora
Local: Sala 2
```

### **3. SALVAR**

### **4. ABRIR GOOGLE CALENDAR**

- URL: https://calendar.google.com
- Login: `brunacurylp@gmail.com`
- Ir no dia **01/10/2025**

**DEVE APARECER:**
```
16:00 - 17:00
Consulta de Fisioterapia - Henrique Kenzo Cury Peres Fujimoto
```

---

## ✅ Verificação Final (SQL):

```sql
SELECT 
  nome,
  google_calendar_enabled,
  google_refresh_token IS NOT NULL as tem_token,
  updated_at
FROM pessoas
WHERE email = 'brunacurylp@gmail.com';
```

**Deve mostrar:**
```
google_calendar_enabled: true
tem_token: true
updated_at: [AGORA]
```

---

## 📋 O QUE FAZER:

1. ✅ Seguir passos acima
2. ✅ Observar TODOS os logs do Console
3. ✅ Se der erro, copiar TUDO e me enviar
4. ✅ Se funcionar, criar agendamento e verificar Google Calendar

---

**🎯 COM ESTES LOGS, VAMOS IDENTIFICAR E RESOLVER O PROBLEMA EM 5 MINUTOS!**
