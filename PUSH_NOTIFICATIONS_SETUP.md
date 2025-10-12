# 📱 Sistema de Notificações Push - Guia Completo

**Status:** ✅ Implementação Concluída  
**Data:** 12 de Outubro de 2025  
**Tecnologia:** Firebase Cloud Messaging (FCM)

---

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Arquitetura](#arquitetura)
3. [Configuração Inicial](#configuração-inicial)
4. [Variáveis de Ambiente](#variáveis-de-ambiente)
5. [Deploy e Ativação](#deploy-e-ativação)
6. [Como Usar](#como-usar)
7. [Testes](#testes)
8. [Troubleshooting](#troubleshooting)

---

## 🎯 Visão Geral

O sistema de notificações push foi implementado **paralelamente** ao sistema de webhooks existente, sem modificar nada dos webhooks.

### Componentes Criados

#### Frontend

- ✅ `src/lib/firebase-config.ts` - Configuração Firebase
- ✅ `src/hooks/usePushNotifications.ts` - Hook React para notificações
- ✅ `src/components/domain/notifications/PushNotificationPrompt.tsx` - UI de permissão
- ✅ `public/firebase-messaging-sw.js` - Service Worker
- ✅ `public/manifest.json` - PWA Manifest
- ✅ `index.html` - Atualizado com meta tags PWA

#### Backend

- ✅ `supabase/migrations/create_push_notifications_system.sql` - Schema completo
- ✅ `supabase/functions/send-push-notification/index.ts` - Edge Function

#### Database

- ✅ `user_push_tokens` - Tokens FCM dos dispositivos
- ✅ `user_notification_preferences` - Preferências de notificação
- ✅ `push_notification_queue` - Fila de envio
- ✅ `push_notification_logs` - Auditoria

---

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                    FLUXO DE NOTIFICAÇÕES                     │
└─────────────────────────────────────────────────────────────┘

1. EVENTO OCORRE
   └─> Novo agendamento criado na tabela `agendamentos`

2. TRIGGER DATABASE
   └─> trigger_push_notification_appointment_created()
       └─> Chama dispatch_push_notification()
           └─> Busca tokens FCM dos usuários relevantes
               └─> Insere em push_notification_queue

3. CRON JOB (a cada minuto)
   └─> Chama Edge Function send-push-notification
       └─> Processa fila (push_notification_queue)
           └─> Envia via Firebase Cloud Messaging
               └─> Atualiza status e logs

4. DISPOSITIVO
   └─> Service Worker recebe notificação
       └─> Exibe notificação nativa
           └─> Usuário clica → Abre app na página certa
```

### Eventos Suportados

| Evento                  | Descrição              | Destinatários              |
| ----------------------- | ---------------------- | -------------------------- |
| `appointment_created`   | Novo agendamento       | Fisioterapeuta responsável |
| `patient_created`       | Novo paciente          | Admin e Secretaria         |
| `evolution_created`     | Nova evolução          | Fisioterapeuta que criou   |
| `appointment_updated`   | Agendamento atualizado | Fisioterapeuta responsável |
| `appointment_cancelled` | Agendamento cancelado  | Fisioterapeuta responsável |
| `payment_received`      | Pagamento recebido     | Admin e Financeiro         |

---

## ⚙️ Configuração Inicial

### Passo 1: Obter Firebase Server Key

1. Acesse o [Firebase Console](https://console.firebase.google.com/)
2. Selecione seu projeto: **respira-kids-app**
3. Vá em **⚙️ Configurações do Projeto**
4. Aba **Cloud Messaging**
5. Role até **"Cloud Messaging API (Legacy)"**
6. Copie o **Server Key** (começa com `AAAAxxxx...`)

⚠️ **IMPORTANTE:** Este Server Key é diferente da VAPID Key! Você precisa de ambos:

- **VAPID Key** (já configurada): Para o frontend registrar tokens
- **Server Key**: Para o backend enviar notificações

---

## 🔐 Variáveis de Ambiente

### Frontend (.env no projeto)

Já configuradas automaticamente, mas você pode sobrescrever:

```bash
# Firebase Web (Frontend)
VITE_FIREBASE_API_KEY=AIzaSyDXwW6Id1CMaW-PeRY0cEz1bHehnDQ-IFQ
VITE_FIREBASE_AUTH_DOMAIN=respira-kids-app.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=respira-kids-app
VITE_FIREBASE_STORAGE_BUCKET=respira-kids-app.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=551722225681
VITE_FIREBASE_APP_ID=1:551722225681:web:f02f8bf486919dd1d321b0
VITE_FIREBASE_VAPID_KEY=BGspTEoU8P2K34YeSH1qtTvPEXk6qOdzAxU-B79Ny8HDzsVmSJd6eelLxTvnn4a0_rtg7nbIlv68iwcO3z2XMa8
```

### Vercel (Deploy de Produção)

No Vercel Dashboard:

1. Vá em **Settings > Environment Variables**
2. Adicione as mesmas variáveis acima (sem o prefixo `VITE_`)

### Supabase (Edge Function)

No Supabase Dashboard:

1. Vá em **Project Settings > Edge Functions**
2. Adicione a variável:

```
Name: FIREBASE_SERVER_KEY
Value: AAAAxxxxxxxxxxxxxxxxxxxxxxxxx (cole seu Server Key aqui)
```

---

## 🚀 Deploy e Ativação

### Passo 1: Executar SQL no Supabase

1. Acesse o **SQL Editor** do Supabase
2. Copie todo o conteúdo de `supabase/migrations/create_push_notifications_system.sql`
3. Cole e execute
4. Verifique se não há erros

Isso criará:

- 4 tabelas
- 3 triggers de eventos
- 2 funções auxiliares
- Todas as policies RLS

### Passo 2: Deploy da Edge Function

```bash
# Fazer login no Supabase CLI
supabase login

# Deploy da função
supabase functions deploy send-push-notification --project-ref <SEU_PROJECT_REF>

# Configurar variável de ambiente
supabase secrets set FIREBASE_SERVER_KEY=AAAAxxxxxxxxx --project-ref <SEU_PROJECT_REF>
```

Alternativamente, você pode fazer deploy manual:

1. Zippar a pasta `supabase/functions/send-push-notification`
2. Upload no Supabase Dashboard > Edge Functions

### Passo 3: Configurar Cron Job

No Supabase Dashboard:

1. Vá em **Database > Cron Jobs** (extensão pg_cron)
2. Execute este SQL:

```sql
-- Cron job para processar notificações push a cada minuto
SELECT cron.schedule(
  'process-push-notifications',
  '* * * * *', -- A cada minuto
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

⚠️ Substitua `[SEU-PROJECT-REF]` pelo ref do seu projeto!

### Passo 4: Deploy do Frontend

```bash
# Build e deploy (Vercel faz automaticamente no push)
npm run build

# Ou manualmente
vercel --prod
```

---

## 💻 Como Usar

### No Código React

#### 1. Solicitar Permissão (Automático)

O hook `usePushNotifications` inicializa automaticamente quando o usuário faz login.

#### 2. Mostrar Prompt para Usuário

```tsx
import { PushNotificationPrompt } from '@/components/domain/notifications/PushNotificationPrompt';

function MyPage() {
  return (
    <div>
      <PushNotificationPrompt />
      {/* resto do conteúdo */}
    </div>
  );
}
```

#### 3. Usar Hook Diretamente

```tsx
import { usePushNotifications } from '@/hooks/usePushNotifications';

function MyComponent() {
  const {
    permission,
    token,
    isSupported,
    requestPermission,
    disableNotifications,
  } = usePushNotifications();

  return (
    <div>
      <p>Status: {permission}</p>
      <p>Token: {token ? 'Registrado' : 'Não registrado'}</p>

      {permission === 'default' && (
        <button onClick={requestPermission}>Ativar Notificações</button>
      )}

      {permission === 'granted' && (
        <button onClick={disableNotifications}>Desativar Notificações</button>
      )}
    </div>
  );
}
```

### Enviar Notificação Manualmente (SQL)

```sql
-- Enviar para usuário específico
SELECT dispatch_push_notification(
  ARRAY['user-id-aqui']::UUID[],
  'Título da Notificação',
  'Corpo da mensagem',
  'custom_event',
  NULL, -- event_id opcional
  '{"chave": "valor"}'::jsonb -- dados customizados
);

-- Enviar para múltiplos usuários
SELECT dispatch_push_notification(
  ARRAY[
    'user-id-1'::UUID,
    'user-id-2'::UUID,
    'user-id-3'::UUID
  ],
  'Notificação em Massa',
  'Mensagem para vários usuários',
  'broadcast',
  NULL,
  '{}'::jsonb
);
```

---

## 🧪 Testes

### Teste 1: Registrar Token

1. Abra o app no navegador
2. Aceite a permissão de notificações quando solicitado
3. Verifique no console: `✅ Token FCM obtido`
4. Verifique no banco:

```sql
SELECT * FROM user_push_tokens WHERE active = TRUE;
```

### Teste 2: Criar Agendamento

1. Crie um novo agendamento pela interface
2. Verifique que foi adicionado à fila:

```sql
SELECT * FROM push_notification_queue ORDER BY created_at DESC LIMIT 5;
```

3. Aguarde até 1 minuto (cron job processa)
4. Verifique que foi enviado:

```sql
SELECT * FROM push_notification_logs ORDER BY created_at DESC LIMIT 5;
```

5. Deve aparecer notificação no dispositivo! 🔔

### Teste 3: Processar Fila Manualmente

```bash
# Via curl
curl -X POST \
  'https://[SEU-PROJECT-REF].supabase.co/functions/v1/send-push-notification' \
  -H 'Authorization: Bearer [SEU-ANON-KEY]' \
  -H 'Content-Type: application/json'
```

### Teste 4: Verificar Logs

```sql
-- Últimas notificações enviadas
SELECT
  event_type,
  title,
  success,
  error_message,
  created_at
FROM push_notification_logs
ORDER BY created_at DESC
LIMIT 20;

-- Taxa de sucesso
SELECT
  event_type,
  COUNT(*) as total,
  SUM(CASE WHEN success THEN 1 ELSE 0 END) as sucessos,
  ROUND(100.0 * SUM(CASE WHEN success THEN 1 ELSE 0 END) / COUNT(*), 2) as taxa_sucesso
FROM push_notification_logs
GROUP BY event_type;
```

---

## 🔧 Troubleshooting

### Problema: "Notificações não suportadas"

**Causa:** Navegador não suporta ou HTTPS não está ativo

**Solução:**

- Verifique se está em HTTPS (localhost é ok)
- Use Chrome, Firefox ou Edge (Safari 16.4+ no iOS)
- Verifique console do navegador

### Problema: Permissão sempre "default"

**Causa:** Usuário bloqueou notificações anteriormente

**Solução:**

1. Chrome: `chrome://settings/content/notifications`
2. Remover site da lista de bloqueados
3. Recarregar página

### Problema: Token não é salvo no banco

**Causa:** Usuário não está autenticado ou RLS bloqueando

**Solução:**

- Verifique se `auth.uid()` retorna valor
- Verifique policies RLS da tabela `user_push_tokens`
- Veja logs do console

### Problema: Notificações não chegam

**Causa:** Edge Function não configurada ou cron job não ativo

**Diagnóstico:**

```sql
-- Verificar se há notificações pendentes
SELECT COUNT(*) FROM push_notification_queue WHERE status = 'pending';

-- Verificar últimas tentativas
SELECT * FROM push_notification_logs ORDER BY created_at DESC LIMIT 10;

-- Processar manualmente
SELECT net.http_post(
  url := 'https://[PROJECT-REF].supabase.co/functions/v1/send-push-notification',
  headers := '{"Content-Type": "application/json"}'::jsonb
);
```

### Problema: "FIREBASE_SERVER_KEY não configurado"

**Solução:**

1. Obter Server Key do Firebase Console (veja Passo 1)
2. Configurar no Supabase:

```bash
supabase secrets set FIREBASE_SERVER_KEY=AAAAxxxx
```

### Problema: Service Worker não registra

**Causa:** Arquivo não encontrado ou erro de sintaxe

**Solução:**

- Verifique se `/firebase-messaging-sw.js` está acessível
- Abra: `https://seudominio.com/firebase-messaging-sw.js`
- Deve carregar sem erro 404
- Verifique console: `Application > Service Workers`

---

## 📊 Monitoramento

### Dashboard de Analytics

```sql
-- Estatísticas gerais
SELECT
  COUNT(*) as total_enviadas,
  SUM(CASE WHEN success THEN 1 ELSE 0 END) as sucessos,
  SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) as falhas,
  ROUND(100.0 * SUM(CASE WHEN success THEN 1 ELSE 0 END) / COUNT(*), 2) as taxa_sucesso_pct
FROM push_notification_logs
WHERE created_at > NOW() - INTERVAL '24 hours';

-- Por tipo de evento
SELECT
  event_type,
  COUNT(*) as total,
  SUM(CASE WHEN success THEN 1 ELSE 0 END) as sucessos
FROM push_notification_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY event_type
ORDER BY total DESC;

-- Tokens ativos
SELECT
  COUNT(*) as tokens_ativos,
  COUNT(DISTINCT user_id) as usuarios_unicos,
  COUNT(CASE WHEN device_type = 'web' THEN 1 END) as web,
  COUNT(CASE WHEN device_type = 'android' THEN 1 END) as android,
  COUNT(CASE WHEN device_type = 'ios' THEN 1 END) as ios
FROM user_push_tokens
WHERE active = TRUE;
```

### Limpeza de Tokens Expirados

Execute periodicamente (pode criar cron job):

```sql
SELECT clean_expired_push_tokens();
```

---

## 🎯 Próximos Passos

### Melhorias Futuras

1. **Preferências por Usuário**
   - Tela de configurações para ativar/desativar por tipo de evento
   - Interface em `/configuracoes > Notificações`

2. **Notificações Ricas**
   - Imagens
   - Botões de ação
   - Som customizado

3. **Analytics Avançado**
   - Taxa de cliques
   - Horários de maior engajamento
   - A/B testing de mensagens

4. **App Mobile Nativo**
   - React Native
   - Mesma infraestrutura de backend
   - Suporte a notificações iOS nativas

---

## ✅ Checklist de Implementação

- [x] Instalar Firebase SDK
- [x] Criar configuração Firebase
- [x] Criar Service Worker
- [x] Criar PWA Manifest
- [x] Atualizar index.html
- [x] Criar hook usePushNotifications
- [x] Criar componente PushNotificationPrompt
- [x] Criar schema SQL (tabelas + triggers)
- [x] Criar Edge Function
- [ ] **Executar SQL no Supabase**
- [ ] **Obter Firebase Server Key**
- [ ] **Configurar variável FIREBASE_SERVER_KEY no Supabase**
- [ ] **Deploy Edge Function**
- [ ] **Configurar Cron Job**
- [ ] **Testar notificação end-to-end**

---

## 📞 Suporte

Se encontrar problemas:

1. Verifique os logs do console do navegador
2. Verifique os logs da Edge Function no Supabase
3. Consulte a documentação do Firebase: https://firebase.google.com/docs/cloud-messaging

---

**Desenvolvido com ❤️ para Respira Kids**  
**Data:** 12/10/2025
