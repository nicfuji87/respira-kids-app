# 🔐 Conectar Google Calendar - Passo a Passo COMPLETO

## ✅ Sistema Funcionando Corretamente!

**Confirmado via logs:**
- ✅ Trigger dispara automaticamente ao criar agendamento
- ✅ Edge Function `sync-google-calendar` é chamada
- ✅ Webhook enviado para n8n

**Falta APENAS:**
- ⚠️ Bruna conectar Google Calendar via OAuth

---

## 📋 INSTRUÇÕES COMPLETAS

### **PARTE 1: Preparação**

1. **Abrir duas abas do navegador:**
   - Aba 1: Aplicação (https://app.respirakidsbrasilia.com.br)
   - Aba 2: Google Calendar (https://calendar.google.com)

2. **Fazer login em ambas:**
   - Ambas com: `brunacurylp@gmail.com`

3. **Na Aba 1 (Aplicação), abrir Console:**
   - Pressionar **F12**
   - Ir na aba **Console**
   - **DEIXAR ABERTO**

---

### **PARTE 2: Conectar Google Calendar**

#### **Passo 1: Ir em Configurações**

Na aplicação, clicar em **Configurações** (menu lateral)

#### **Passo 2: Ir em "Meu Perfil"**

Clicar na aba **"Meu Perfil"** (se não estiver já)

#### **Passo 3: Rolar até "Sincronização com Google Calendar"**

Você verá:
```
┌────────────────────────────────────────┐
│ 📅 Sincronização com Google Calendar  │
│                                        │
│ ⚠️ Não conectado                       │
│                                        │
│ [ Conectar com Google ]                │
└────────────────────────────────────────┘
```

#### **Passo 4: ANTES de clicar, verificar o Console**

No Console (F12) deve estar vazio ou com logs normais.

#### **Passo 5: Clicar em "Conectar com Google"**

**IMEDIATAMENTE verificar o Console!**

**Deve aparecer:**
```javascript
🔗 Redirecionando para OAuth com redirect_uri: https://app.respirakidsbrasilia.com.br/auth/google/callback
```

✅ **Se apareceu:** Frontend está OK
❌ **Se NÃO apareceu:** Tem problema no frontend

---

#### **Passo 6: Tela do Google OAuth**

Você será redirecionado para:
```
https://accounts.google.com/o/oauth2/v2/auth?...
```

**Tela do Google mostra:**
```
┌────────────────────────────────────┐
│ Fazer login com o Google           │
│                                    │
│ brunacurylp@gmail.com             │
│                                    │
│ Respira Kids quer acessar sua     │
│ Conta do Google                    │
│                                    │
│ Isso permitirá que Respira Kids:  │
│ ✓ Ver e editar eventos em todos   │
│   os seus calendários do Google   │
│                                    │
│ [ Cancelar ]  [ Permitir ]        │
└────────────────────────────────────┘
```

#### **Passo 7: Clicar em "Permitir"**

---

#### **Passo 8: Aguardar Redirecionamento**

Você será redirecionado para:
```
https://app.respirakidsbrasilia.com.br/auth/google/callback?code=...&state=...
```

**Tela deve mostrar:**
```
┌─────────────────────────────────┐
│  🔄 Conectando com Google...    │
│                                 │
│  Aguarde enquanto configuramos  │
│  sua integração                 │
└─────────────────────────────────┘
```

**NO CONSOLE DEVE APARECER:**
```javascript
📞 Processando callback do Google OAuth...
```

---

#### **Passo 9: Aguardar Processamento (5-10 segundos)**

**CENÁRIO 1: SUCESSO ✅**

**Tela muda para:**
```
┌─────────────────────────────────┐
│  ✅ Conectado com Sucesso!      │
│                                 │
│  Seus agendamentos serão        │
│  sincronizados automaticamente  │
│                                 │
│  Redirecionando...              │
└─────────────────────────────────┘
```

**NO CONSOLE:**
```javascript
✅ Google Calendar conectado com sucesso!
```

**Redireciona automaticamente para:** Configurações

---

**CENÁRIO 2: ERRO ❌**

**Tela mostra:**
```
┌─────────────────────────────────┐
│  ❌ Erro na Conexão             │
│                                 │
│  [Mensagem de erro aqui]        │
│                                 │
│  [ Voltar para Configurações ]  │
└─────────────────────────────────┘
```

**NO CONSOLE:**
```javascript
❌ Erro na Edge Function: [mensagem do erro]
```

**SE VIR ERRO:**
1. Tire um **screenshot** da tela
2. **Copie** a mensagem completa do Console
3. Me envie!

---

### **PARTE 3: Verificar se Conectou**

#### **Passo 1: Voltar para Configurações → Meu Perfil**

#### **Passo 2: Verificar status**

**Deve mostrar:**
```
✅ Conectado ao Google Calendar

[x] Sincronização Automática
    Novos agendamentos serão adicionados automaticamente
```

#### **Passo 3: Verificar no Banco (SQL Editor)**

Execute:
```sql
SELECT 
  nome,
  email,
  google_calendar_enabled,
  google_refresh_token IS NOT NULL as tem_token,
  google_calendar_id,
  google_token_expires_at > NOW() as token_valido,
  updated_at
FROM pessoas
WHERE email = 'brunacurylp@gmail.com';
```

**Deve retornar:**
```
nome: "Bruna Cury Lourenço Peres"
google_calendar_enabled: true      ✅
tem_token: true                    ✅
google_calendar_id: "primary"      ✅
token_valido: true                 ✅
updated_at: [DATA DE HOJE]         ✅
```

---

### **PARTE 4: Testar Criação de Evento**

#### **Passo 1: Ir em Agenda**

#### **Passo 2: Criar Novo Agendamento**

Preencher:
```
Data: 01/10/2025
Hora: 15:00
Paciente: Henrique Kenzo
Profissional: Bruna Cury
Tipo: Consulta de Fisioterapia
Local: Sala 2
```

#### **Passo 3: Salvar**

#### **Passo 4: Verificar Google Calendar (Aba 2)**

**Ir no dia 01/10/2025**

**Deve aparecer:**
```
15:00 - 16:00
Consulta de Fisioterapia - Henrique Kenzo Cury Peres Fujimoto

📍 [Endereço da Clínica Sala 2]
👨‍⚕️ Profissional: Bruna Cury Lourenço Peres (Fisioterapia Respiratória)
🏥 Tipo: Consulta de Fisioterapia
⏱️ Duração: 60 minutos
```

---

## 🔍 Troubleshooting

### **Se OAuth mostrar erro "redirect_uri_mismatch":**

Verifique no Google Cloud Console:

**URL:** https://console.cloud.google.com/apis/credentials

**OAuth 2.0 Client ID:** `786221998479-hiqj0ouahgi6mvg8snphsfkon8iu9ifn...`

**Authorized redirect URIs DEVE ter:**
```
https://app.respirakidsbrasilia.com.br/auth/google/callback
```

---

### **Se mostrar erro "invalid_client":**

As variáveis de ambiente podem estar erradas. Verifique no Supabase Dashboard:

**URL:** https://jqegoentcusnbcykgtxg.supabase.co/project/jqegoentcusnbcykgtxg/settings/functions

**Deve ter:**
```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
APP_URL
```

---

### **Se conectar mas não salvar (updated_at não muda):**

Tem erro na Edge Function `google-oauth-callback`. 

**Verificar logs:**
```sql
SELECT * FROM net._http_response
WHERE created > NOW() - INTERVAL '5 minutes'
ORDER BY created DESC;
```

---

## 📊 Status Atual do Sistema:

| Componente | Status |
|------------|--------|
| **Migrations SQL** | ✅ Aplicadas |
| **Edge Function sync-google-calendar** | ✅ Deployed (v2) |
| **Edge Function google-oauth-callback** | ✅ Deployed (v2) |
| **Trigger automático** | ✅ Funcionando |
| **Webhook para n8n** | ✅ Funcionando |
| **Variáveis de ambiente** | ✅ Configuradas |
| **Bruna conectada ao Google** | ❌ **FALTA FAZER** |

---

**🎯 PRÓXIMA AÇÃO: Bruna seguir este passo a passo COMPLETO!**
