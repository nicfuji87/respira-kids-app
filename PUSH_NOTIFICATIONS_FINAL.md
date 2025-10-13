# 🔔 Sistema de Notificações Push - Configuração Final

## ✅ Status: Sistema Implantado e Ativo

### 📋 Resumo da Implementação

Sistema de notificações push implementado com Firebase Cloud Messaging (FCM) API V1, completamente separado do sistema de webhooks existente.

---

## 🎯 Regras de Notificação

### 1. **Novo Paciente Cadastrado**

- **Quem recebe**: Todos os **Admins** ativos
- **Conteúdo**:
  - Título: "🆕 Novo Paciente Cadastrado"
  - Corpo: "Paciente: [Nome] | Resp.: [Responsável Legal] | Pediatra: [Nome Pediatra]"
  - Link: `/pacientes/{id}`

### 2. **Novo Agendamento**

- **Quem recebe**: Apenas o **Profissional** que vai atender
- **Conteúdo**:
  - Título: "📅 Novo Agendamento"
  - Corpo: "Paciente: [Nome] | [Serviço] em [Data/Hora]"
  - Link: `/agenda`

### 3. **Pacientes e Responsáveis**

- ❌ **NÃO recebem** notificações push

---

## 🏗️ Arquitetura Implementada

### Frontend (React + TypeScript)

```
src/
├── lib/
│   └── firebase-config.ts          # Configuração Firebase
├── hooks/
│   └── usePushNotifications.ts     # Hook React para gerenciar push
└── components/
    └── domain/notifications/
        └── PushNotificationPrompt.tsx  # UI para solicitar permissão
```

### Backend (Supabase)

```
supabase/
├── migrations/
│   ├── create_push_notifications_system.sql      # Tabelas + Triggers
│   └── ajustar_triggers_push_notifications.sql   # Ajuste de regras
└── functions/
    └── send-push-notification/
        └── index.ts                    # Edge Function (FCM API V1)
```

### Service Worker

```
public/
├── firebase-messaging-sw.js        # Service Worker para background
└── manifest.json                   # PWA Manifest
```

---

## 📊 Estrutura do Banco de Dados

### 1. **user_push_tokens**

Armazena tokens FCM dos dispositivos dos usuários.

```sql
CREATE TABLE user_push_tokens (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  pessoa_id UUID REFERENCES pessoas(id),
  token TEXT UNIQUE,
  device_type TEXT DEFAULT 'web',
  active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2. **push_notification_queue**

Fila de notificações pendentes para envio.

```sql
CREATE TABLE push_notification_queue (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  token TEXT,
  title TEXT,
  body TEXT,
  data JSONB DEFAULT '{}',
  event_type TEXT,
  event_id UUID,
  status TEXT DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3. **user_notification_preferences**

Preferências de notificação por usuário e tipo de evento.

```sql
CREATE TABLE user_notification_preferences (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  pessoa_id UUID REFERENCES pessoas(id),
  event_type TEXT,
  enabled BOOLEAN DEFAULT true,
  push_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4. **push_notification_logs**

Log histórico de todas as notificações enviadas.

```sql
CREATE TABLE push_notification_logs (
  id UUID PRIMARY KEY,
  user_id UUID,
  token TEXT,
  title TEXT,
  body TEXT,
  data JSONB,
  event_type TEXT,
  event_id UUID,
  success BOOLEAN,
  response_data JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🔧 Configuração

### 1. Variáveis de Ambiente (.env)

```bash
# Firebase - Frontend
VITE_FIREBASE_API_KEY=AIzaSyDXwW6Id1CMaW-PeRY0cEz1bHehnDQ-IFQ
VITE_FIREBASE_AUTH_DOMAIN=respira-kids-app.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=respira-kids-app
VITE_FIREBASE_STORAGE_BUCKET=respira-kids-app.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=551722225681
VITE_FIREBASE_APP_ID=1:551722225681:web:f02f8bf486919dd1d321b0
VITE_FIREBASE_VAPID_KEY=BGspTEoU8P2K34YeSH1qtTvPEXk6qOdzAxU-B79Ny8HDzsVmSJd6eelLxTvnn4a0_rtg7nbIlv68iwcO3z2XMa8
```

### 2. Supabase Edge Function Secrets

No Supabase Dashboard:

- **FIREBASE_SERVICE_ACCOUNT**: JSON completo do Service Account (já configurado ✅)

### 3. Cron Job

```sql
-- Executa a cada 1 minuto
SELECT cron.schedule(
  'process-push-notifications',
  '* * * * *',
  $$SELECT invoke_send_push_notification()$$
);
```

---

## 🚀 Componentes Principais

### 1. Hook: `usePushNotifications`

```typescript
const {
  permission,
  isSupported,
  isLoading,
  token,
  requestPermission,
  disableNotifications,
} = usePushNotifications();
```

**Recursos:**

- ✅ Verifica suporte do navegador
- ✅ Solicita permissão ao usuário
- ✅ Registra token no Supabase
- ✅ Escuta notificações em foreground
- ✅ Exibe toast quando recebe notificação

### 2. Service Worker: `firebase-messaging-sw.js`

**Recursos:**

- ✅ Recebe notificações em background
- ✅ Exibe notificações nativas do navegador
- ✅ Deep linking (clique abre URL específica)
- ✅ Badge e ícones customizados

### 3. Edge Function: `send-push-notification`

**Recursos:**

- ✅ Processa fila a cada minuto (cron)
- ✅ Envia via Firebase Cloud Messaging API V1
- ✅ OAuth2 com Service Account
- ✅ Retry automático (até 3 tentativas)
- ✅ Logging completo de sucessos e falhas

---

## 📝 Triggers do Banco de Dados

### 1. `trigger_appointment_push`

```sql
-- Dispara após INSERT em agendamentos
-- Envia notificação para o profissional_id
CREATE TRIGGER trigger_appointment_push
AFTER INSERT ON public.agendamentos
FOR EACH ROW
EXECUTE FUNCTION dispatch_push_notification_on_appointment();
```

### 2. `trigger_patient_push`

```sql
-- Dispara após INSERT em pessoas (tipo = 'paciente')
-- Envia notificação para todos os admins
CREATE TRIGGER trigger_patient_push
AFTER INSERT ON public.pessoas
FOR EACH ROW
EXECUTE FUNCTION dispatch_push_notification_on_patient();
```

---

## 🧪 Como Testar

### 1. **Habilitar Notificações (Frontend)**

```typescript
import { usePushNotifications } from '@/hooks/usePushNotifications';

function App() {
  const { requestPermission, permission } = usePushNotifications();

  return (
    <button onClick={requestPermission}>
      Ativar Notificações
    </button>
  );
}
```

### 2. **Criar um Novo Paciente**

```sql
-- Simular criação de paciente
INSERT INTO pessoas (
  id_tipo_pessoa,
  nome,
  email,
  data_nascimento,
  auth_user_id
) VALUES (
  (SELECT id FROM pessoa_tipos WHERE codigo = 'paciente'),
  'Teste Push Notification',
  'teste@push.com',
  '2020-01-01',
  auth.uid()  -- ID do usuário logado
);
```

**Resultado esperado:**

- ✅ Todos os admins recebem notificação
- ✅ Título: "🆕 Novo Paciente Cadastrado"
- ✅ Corpo: "Paciente: Teste Push Notification | Resp.: ... | Pediatra: ..."

### 3. **Criar um Novo Agendamento**

```sql
-- Simular criação de agendamento
INSERT INTO agendamentos (
  data_hora,
  paciente_id,
  profissional_id,
  tipo_servico_id,
  status_consulta_id,
  status_pagamento_id,
  valor_servico,
  agendado_por,
  empresa_fatura
) VALUES (
  NOW() + INTERVAL '1 day',
  'id-do-paciente',
  'id-do-profissional',  -- Este profissional receberá a notificação
  'id-do-servico',
  'id-status-agendado',
  'id-status-pendente',
  200.00,
  auth.uid(),
  'id-da-empresa'
);
```

**Resultado esperado:**

- ✅ Apenas o profissional recebe notificação
- ✅ Título: "📅 Novo Agendamento"
- ✅ Corpo: "Paciente: [Nome] | [Serviço] em [Data]"

### 4. **Verificar Logs**

```sql
-- Ver notificações enviadas
SELECT * FROM push_notification_logs
ORDER BY created_at DESC
LIMIT 10;

-- Ver fila de notificações
SELECT * FROM push_notification_queue
WHERE status = 'pending'
ORDER BY created_at DESC;

-- Ver tokens registrados
SELECT
  upt.token,
  upt.device_type,
  upt.active,
  p.nome,
  p.role
FROM user_push_tokens upt
JOIN pessoas p ON p.auth_user_id = upt.user_id
WHERE upt.active = true;
```

---

## 🔍 Monitoramento

### Verificar Saúde do Sistema

```sql
-- Taxa de sucesso (últimas 24h)
SELECT
  COUNT(*) FILTER (WHERE success = true) as sucesso,
  COUNT(*) FILTER (WHERE success = false) as falha,
  ROUND(
    COUNT(*) FILTER (WHERE success = true)::NUMERIC /
    COUNT(*)::NUMERIC * 100,
    2
  ) as taxa_sucesso_percent
FROM push_notification_logs
WHERE created_at > NOW() - INTERVAL '24 hours';

-- Tokens expirados (não usados há mais de 30 dias)
SELECT COUNT(*)
FROM user_push_tokens
WHERE active = true
  AND last_used_at < NOW() - INTERVAL '30 days';

-- Notificações pendentes na fila
SELECT
  event_type,
  COUNT(*) as total,
  AVG(attempts) as tentativas_media
FROM push_notification_queue
WHERE status = 'pending'
GROUP BY event_type;
```

---

## ⚠️ Importante: Diferenças com Webhooks

| Recurso           | Webhooks                    | Push Notifications                            |
| ----------------- | --------------------------- | --------------------------------------------- |
| **Destino**       | URLs externas               | Dispositivos dos usuários                     |
| **Tecnologia**    | HTTP POST                   | Firebase Cloud Messaging                      |
| **Tabelas**       | `webhooks`, `webhook_queue` | `user_push_tokens`, `push_notification_queue` |
| **Edge Function** | `process-webhooks`          | `send-push-notification`                      |
| **Triggers**      | Compartilhados              | Próprias (separadas)                          |
| **Gerenciamento** | WebhooksPage.tsx            | usePushNotifications hook                     |

**🔒 Ambos os sistemas funcionam de forma INDEPENDENTE e NÃO se afetam.**

---

## 🎨 UI/UX

### Service Worker instalado automaticamente

- ✅ Registra em `src/main.tsx`
- ✅ Transparente para o usuário

### Prompt de Permissão

```typescript
<PushNotificationPrompt />
```

- Componente reutilizável
- Design moderno com shadcn/ui
- Mensagem clara para o usuário

### Foreground Notifications

- Toast automático quando app está aberto
- Click-to-action para navegar

### Background Notifications

- Notificação nativa do navegador
- Ícone e badge personalizados
- Deep linking funcional

---

## 📦 Dependências

```json
{
  "firebase": "^12.4.0"
}
```

---

## 🚧 Próximos Passos (Opcional)

1. **Dashboard de Métricas**
   - Taxa de entrega
   - Taxa de abertura (click-through rate)
   - Tokens ativos vs inativos

2. **Personalização por Usuário**
   - Painel de preferências
   - Ativar/desativar por tipo de evento
   - Horário de silêncio (DND)

3. **Suporte Mobile Nativo**
   - Android (FCM)
   - iOS (APNs via FCM)

4. **Notificações Agendadas**
   - Lembretes de consulta
   - Follow-ups automáticos

5. **Rich Notifications**
   - Imagens inline
   - Botões de ação (Aceitar/Rejeitar)
   - Progress indicators

---

## 📚 Documentação Adicional

- [Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging)
- [Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [Web Push Notifications](https://web.dev/push-notifications-overview/)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)

---

## ✅ Checklist Final

- [x] Firebase SDK instalado
- [x] Configuração Firebase criada
- [x] Service Worker implementado
- [x] PWA Manifest criado
- [x] Hook React criado
- [x] Tabelas do banco criadas
- [x] Triggers configuradas
- [x] Edge Function deployada
- [x] Cron Job configurado
- [x] Service Account configurado no Supabase
- [x] Regras de notificação ajustadas (apenas admins e profissionais)
- [x] Sistema testado e funcional

---

**🎉 Sistema 100% Operacional!**

Criado em: 13/10/2025
Última atualização: 13/10/2025
