# ✅ Checklist de Ativação - Notificações Push

## 📦 O que foi implementado (CONCLUÍDO)

- ✅ Firebase SDK instalado (`firebase@12.4.0`)
- ✅ Configuração Firebase (`src/lib/firebase-config.ts`)
- ✅ Service Worker (`public/firebase-messaging-sw.js`)
- ✅ PWA Manifest (`public/manifest.json`)
- ✅ Hook React (`src/hooks/usePushNotifications.ts`)
- ✅ Componente UI (`src/components/domain/notifications/PushNotificationPrompt.tsx`)
- ✅ SQL Schema (`supabase/migrations/create_push_notifications_system.sql`)
- ✅ Edge Function (`supabase/functions/send-push-notification/index.ts`)
- ✅ Documentação completa (`PUSH_NOTIFICATIONS_SETUP.md`)

---

## 🎯 O que VOCÊ precisa fazer para ativar

### ⚡ AÇÃO 1: Obter Firebase Server Key (5 minutos)

1. Acesse: https://console.firebase.google.com/project/respira-kids-app/settings/cloudmessaging
2. Role até **"Cloud Messaging API (Legacy)"**
3. **Copie o "Server Key"** (começa com `AAAAxxxx...`)
4. ⚠️ **NÃO confunda** com a VAPID Key (já configurada)

📸 **Onde encontrar:**

```
Firebase Console
  → respira-kids-app
    → ⚙️ Configurações do Projeto
      → ☁️ Cloud Messaging (aba)
        → 📱 Cloud Messaging API (Legacy)
          → 🔑 Server Key ← COPIE ESTE!
```

---

### ⚡ AÇÃO 2: Executar SQL no Supabase (2 minutos)

1. Acesse seu Supabase Dashboard
2. Vá em **SQL Editor**
3. Clique em **"New query"**
4. Abra o arquivo: `supabase/migrations/create_push_notifications_system.sql`
5. **Copie TODO o conteúdo** do arquivo
6. **Cole no SQL Editor**
7. Clique em **"Run"** (ou F5)
8. ✅ Deve aparecer: `✅ Sistema de notificações push criado com sucesso!`

**Isso cria:**

- 4 tabelas (user_push_tokens, user_notification_preferences, push_notification_queue, push_notification_logs)
- 3 triggers automáticos (appointment_created, patient_created, evolution_created)
- 2 funções auxiliares

---

### ⚡ AÇÃO 3: Configurar Firebase Server Key no Supabase (2 minutos)

#### Opção A: Via Dashboard (Recomendado)

1. Acesse seu Supabase Dashboard
2. Vá em **Project Settings → Edge Functions**
3. Em **"Environment Variables"**, clique em **"Add new variable"**
4. Name: `FIREBASE_SERVER_KEY`
5. Value: Cole o Server Key da AÇÃO 1
6. Clique em **"Save"**

#### Opção B: Via CLI

```bash
# Se você tem Supabase CLI instalado
supabase secrets set FIREBASE_SERVER_KEY=AAAAxxxxxxxxxxxxxxxxxxxxxxxxx --project-ref SEU_PROJECT_REF
```

---

### ⚡ AÇÃO 4: Deploy da Edge Function (3 minutos)

#### Opção A: Via Supabase CLI (Recomendado)

```bash
# 1. Login no Supabase CLI
supabase login

# 2. Link com seu projeto (se ainda não fez)
supabase link --project-ref SEU_PROJECT_REF

# 3. Deploy da função
cd D:\Cursor Projetos\respira-kids-app
supabase functions deploy send-push-notification
```

#### Opção B: Via Dashboard (Manual)

1. Acesse **Edge Functions** no Supabase Dashboard
2. Clique em **"Create function"**
3. Nome: `send-push-notification`
4. Copie o conteúdo de `supabase/functions/send-push-notification/index.ts`
5. Cole no editor
6. Clique em **"Deploy"**

---

### ⚡ AÇÃO 5: Configurar Cron Job (3 minutos)

1. No Supabase Dashboard, vá em **Database → SQL Editor**
2. Execute este SQL (substituindo `[SEU-PROJECT-REF]`):

```sql
-- Habilitar extensão pg_cron (se ainda não habilitada)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Criar cron job para processar notificações a cada minuto
SELECT cron.schedule(
  'process-push-notifications',
  '* * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://[SEU-PROJECT-REF].supabase.co/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body := '{}'::jsonb
    );
  $$
);
```

**⚠️ IMPORTANTE:** Substitua `[SEU-PROJECT-REF]` pelo ID do seu projeto!

Onde encontrar o Project Ref:

- Na URL do Supabase Dashboard: `https://supabase.com/dashboard/project/[SEU-PROJECT-REF]`
- Ou em **Project Settings → General → Reference ID**

**Verificar se foi criado:**

```sql
SELECT * FROM cron.job WHERE jobname = 'process-push-notifications';
```

---

### ⚡ AÇÃO 6: Deploy do Frontend (automático no Vercel)

Se você já usa deploy automático no Vercel, **não precisa fazer nada**!

O push no GitHub vai automaticamente:

- Fazer build do projeto
- Incluir os novos arquivos (`firebase-messaging-sw.js`, `manifest.json`, etc)
- Aplicar as variáveis de ambiente

**Verificar após deploy:**

1. Acesse: `https://seu-dominio.com/manifest.json`
2. Deve retornar o JSON do manifest
3. Acesse: `https://seu-dominio.com/firebase-messaging-sw.js`
4. Deve retornar o código do service worker (sem erro 404)

---

## 🧪 Teste End-to-End

### Teste 1: Registrar Token (3 minutos)

1. Abra o app no navegador: `https://seu-dominio.com`
2. Faça login
3. **Aceite** quando aparecer o popup de permissão de notificações
4. Abra o Console do navegador (F12)
5. Deve aparecer: `✅ Token FCM obtido: ...`
6. Verifique no banco:

```sql
SELECT * FROM user_push_tokens WHERE active = TRUE ORDER BY created_at DESC LIMIT 5;
```

✅ **Deve ter 1 registro** com seu user_id

---

### Teste 2: Criar Agendamento (2 minutos)

1. No app, crie um **novo agendamento**
2. Verifique que foi adicionado à fila:

```sql
SELECT * FROM push_notification_queue WHERE status = 'pending' ORDER BY created_at DESC LIMIT 5;
```

✅ **Deve ter 1 registro** com event_type = 'appointment_created'

3. **Aguarde até 60 segundos** (o cron job processa a cada minuto)

4. Verifique que foi processado:

```sql
SELECT * FROM push_notification_queue WHERE status = 'sent' ORDER BY created_at DESC LIMIT 5;
```

✅ **Status deve mudar para 'sent'**

5. **Você deve receber a notificação no navegador!** 🔔

---

### Teste 3: Verificar Logs (1 minuto)

```sql
SELECT
  event_type,
  title,
  body,
  success,
  error_message,
  created_at
FROM push_notification_logs
ORDER BY created_at DESC
LIMIT 10;
```

✅ **Deve ter 1 registro** com success = TRUE

---

## 🎉 Sistema Funcionando!

Se todos os testes passaram, seu sistema de notificações push está **100% operacional**!

### O que acontece agora automaticamente:

1. ✅ Quando um **novo agendamento** é criado → Fisioterapeuta recebe notificação
2. ✅ Quando um **novo paciente** é cadastrado → Admin/Secretaria recebem notificação
3. ✅ Quando uma **evolução** é criada → Fisioterapeuta recebe notificação

### Webhooks

Os webhooks continuam funcionando **normalmente**, sem qualquer alteração!

---

## 🚨 Troubleshooting

### Problema: "Token não registrado"

**Causa:** Permissão de notificações não foi concedida

**Solução:**

- Verifique se apareceu o popup de permissão
- Se negou, limpe as configurações: `chrome://settings/content/notifications`
- Remova o site e recarregue

---

### Problema: "Notificações não chegam"

**Diagnóstico:**

```sql
-- 1. Tem tokens registrados?
SELECT COUNT(*) FROM user_push_tokens WHERE active = TRUE;

-- 2. Tem notificações pendentes?
SELECT COUNT(*) FROM push_notification_queue WHERE status = 'pending';

-- 3. O cron job está rodando?
SELECT * FROM cron.job WHERE jobname = 'process-push-notifications';

-- 4. Tem erros nos logs?
SELECT * FROM push_notification_logs WHERE success = FALSE ORDER BY created_at DESC LIMIT 10;
```

**Forçar processamento manual:**

```bash
# Via curl
curl -X POST \
  'https://[SEU-PROJECT-REF].supabase.co/functions/v1/send-push-notification' \
  -H 'Authorization: Bearer [SEU-ANON-KEY]' \
  -H 'Content-Type: application/json'
```

---

### Problema: "FIREBASE_SERVER_KEY não configurado"

**Causa:** Esqueceu de configurar a variável de ambiente no Supabase

**Solução:** Volte para a **AÇÃO 3**

---

### Problema: "Service Worker não registra"

**Causa:** Arquivo `firebase-messaging-sw.js` não está acessível

**Diagnóstico:**

1. Abra no navegador: `https://seu-dominio.com/firebase-messaging-sw.js`
2. Deve carregar o código JavaScript (não erro 404)

**Solução:**

- Verifique se o arquivo está em `public/firebase-messaging-sw.js`
- Faça rebuild: `npm run build`
- Redeploy no Vercel

---

## 📞 Precisa de Ajuda?

Consulte a documentação completa em: `PUSH_NOTIFICATIONS_SETUP.md`

---

## 📊 Resumo Visual

```
┌─────────────────────────────────────────────┐
│  STATUS DO SISTEMA DE NOTIFICAÇÕES PUSH    │
├─────────────────────────────────────────────┤
│                                             │
│  ✅ Código Frontend      (implementado)    │
│  ✅ Código Backend       (implementado)    │
│  ✅ SQL Schema           (implementado)    │
│  ✅ Edge Function        (implementado)    │
│  ✅ Documentação         (implementado)    │
│                                             │
│  🔲 Firebase Server Key  (VOCÊ FAZ)        │
│  🔲 Executar SQL         (VOCÊ FAZ)        │
│  🔲 Deploy Edge Function (VOCÊ FAZ)        │
│  🔲 Configurar Cron Job  (VOCÊ FAZ)        │
│  🔲 Testar               (VOCÊ FAZ)        │
│                                             │
└─────────────────────────────────────────────┘

Tempo estimado: 15-20 minutos
```

---

**Boa sorte! 🚀**

Quando terminar, me avise e posso ajudar com qualquer problema! 💪
