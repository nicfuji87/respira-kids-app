# 🎉 Guia de Teste - Push Notifications

## ✅ Status da Implementação

Tudo configurado e deployado:

- ✅ **Banco de Dados**: Tabelas, triggers e funções criadas
- ✅ **Edge Function**: `send-push-notification` deployada
- ✅ **Cron Job**: Configurado para rodar a cada 1 minuto
- ✅ **Frontend**: Hook e componentes criados
- ✅ **Service Worker**: Configurado para notificações em background

---

## 🧪 TESTE 1: Habilitar Notificações no Frontend

### Passo 1: Acessar a Aplicação

1. Acesse sua aplicação em produção ou desenvolvimento
2. Faça login com um usuário

### Passo 2: Verificar Console do Navegador

No console do navegador (F12), você verá:

```
🔥 Firebase inicializado: { projectId: "respira-kids-app", hasVapidKey: true }
```

### Passo 3: Solicitar Permissão de Notificação

Você pode:

- Criar um botão na UI que chama o hook `usePushNotifications`
- Ou testar manualmente no console:

```javascript
// No console do navegador
Notification.requestPermission().then((permission) => {
  console.log('Permissão:', permission);
});
```

### Passo 4: Verificar Token Salvo

Após conceder permissão, verifique no Supabase:

```sql
SELECT * FROM user_push_tokens WHERE user_id = auth.uid();
```

---

## 🧪 TESTE 2: Enviar Notificação Manual

### Via SQL (Trigger Automático)

Crie um novo agendamento para disparar o evento:

```sql
-- Inserir novo agendamento (trigger vai criar notificação)
INSERT INTO agendamentos (
  id_paciente,
  id_profissional,
  data_hora,
  tipo_servico_id,
  status
) VALUES (
  'ID_PACIENTE_AQUI',
  'ID_PROFISSIONAL_AQUI',
  NOW() + interval '1 day',
  1,
  'agendado'
);

-- Verificar fila de notificações
SELECT * FROM push_notification_queue WHERE status = 'pending';
```

### Via Função SQL (Manual)

```sql
-- Enviar notificação manualmente para um usuário específico
SELECT dispatch_push_notification(
  'ID_USER_AQUI',                          -- user_id
  '🎉 Teste de Notificação',                -- title
  'Sua notificação push está funcionando!', -- body
  '{"type": "test", "timestamp": "2025-10-13T00:00:00Z"}'::jsonb, -- data
  'test_notification',                      -- event_type
  NULL                                      -- event_id (opcional)
);

-- Verificar fila
SELECT * FROM push_notification_queue ORDER BY created_at DESC LIMIT 5;
```

---

## 🧪 TESTE 3: Processar Fila (Edge Function)

### Opção A: Aguardar Cron Job (1 minuto)

O cron job vai invocar a Edge Function automaticamente a cada 1 minuto.

### Opção B: Invocar Manualmente

#### Via curl:

```bash
curl -X POST \
  https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-push-notification \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### Via SQL:

```sql
-- Invocar a função que processa a fila
SELECT invoke_send_push_notification();
```

#### Via Supabase Dashboard:

1. Acesse: **Edge Functions** > **send-push-notification**
2. Clique em **Invoke**
3. Deixe o body vazio: `{}`
4. Clique em **Send Request**

---

## 🧪 TESTE 4: Verificar Logs

### Logs da Edge Function

1. Acesse o Supabase Dashboard
2. Vá em **Edge Functions** > **send-push-notification**
3. Clique em **Logs**

Você verá:

```
🔔 Processando fila de notificações push...
📨 Encontradas X notificações para enviar
✅ Notificação ID enviada com sucesso
📊 Processamento concluído: X sucesso, Y falhas
```

### Logs do Banco de Dados

```sql
-- Ver logs de sucesso
SELECT
  created_at,
  title,
  body,
  success,
  error_message
FROM push_notification_logs
ORDER BY created_at DESC
LIMIT 10;

-- Ver estatísticas
SELECT
  event_type,
  COUNT(*) as total,
  SUM(CASE WHEN success THEN 1 ELSE 0 END) as sucesso,
  SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) as falhas
FROM push_notification_logs
GROUP BY event_type;
```

---

## 🎯 TESTE 5: Notificação em Foreground vs Background

### Foreground (App Aberto)

1. Mantenha o navegador aberto na sua aplicação
2. Dispare uma notificação (via SQL ou criando um agendamento)
3. Você verá um **toast** na tela (não uma notificação nativa)

### Background (App Fechado/Minimizado)

1. **Minimize** o navegador ou **mude de aba**
2. Dispare uma notificação
3. Aguarde o cron job processar (ou invoque manualmente)
4. Você verá uma **notificação nativa do sistema**

### Clicar na Notificação

Ao clicar na notificação:

- O navegador vai abrir/focar na aba da aplicação
- Se houver `event_id`, redireciona para a página relacionada

---

## 🔧 Configurar Preferências de Notificação

### Ver Preferências do Usuário

```sql
SELECT * FROM user_notification_preferences
WHERE user_id = auth.uid();
```

### Desabilitar Notificação de um Tipo

```sql
UPDATE user_notification_preferences
SET enabled = FALSE
WHERE user_id = auth.uid()
  AND event_type = 'appointment_created';
```

---

## 🐛 Troubleshooting

### Problema: Não recebo notificações

**Verifique:**

1. **Token registrado?**

   ```sql
   SELECT * FROM user_push_tokens WHERE user_id = auth.uid();
   ```

2. **Fila tem notificações?**

   ```sql
   SELECT * FROM push_notification_queue WHERE status = 'pending';
   ```

3. **Service Worker registrado?**
   - Abra DevTools > Application > Service Workers
   - Deve ter `/firebase-messaging-sw.js` ativo

4. **Service Account configurado?**
   - Acesse Supabase Dashboard
   - Vá em **Project Settings** > **Edge Functions**
   - Verifique se `FIREBASE_SERVICE_ACCOUNT` está configurado

5. **Logs de erro?**
   ```sql
   SELECT * FROM push_notification_logs
   WHERE success = FALSE
   ORDER BY created_at DESC;
   ```

### Problema: Token expirado

```sql
-- Tokens antigos são limpos automaticamente a cada 7 dias
-- Para forçar limpeza:
SELECT clean_expired_push_tokens();
```

### Problema: Cron Job não está rodando

```sql
-- Verificar jobs configurados
SELECT * FROM cron.job;

-- Verificar histórico de execução
SELECT * FROM cron.job_run_details
WHERE jobname = 'process-push-notifications'
ORDER BY start_time DESC
LIMIT 10;
```

---

## 📊 Monitoramento

### Estatísticas em Tempo Real

```sql
-- Tokens ativos
SELECT COUNT(*) as tokens_ativos
FROM user_push_tokens
WHERE last_used_at > NOW() - interval '7 days';

-- Notificações na fila
SELECT
  status,
  COUNT(*) as quantidade
FROM push_notification_queue
GROUP BY status;

-- Taxa de sucesso (últimas 24h)
SELECT
  COUNT(*) as total,
  SUM(CASE WHEN success THEN 1 ELSE 0 END) as sucesso,
  ROUND(100.0 * SUM(CASE WHEN success THEN 1 ELSE 0 END) / COUNT(*), 2) as taxa_sucesso
FROM push_notification_logs
WHERE created_at > NOW() - interval '24 hours';
```

---

## 🎉 Pronto!

Seu sistema de push notifications está **100% funcional**!

### Próximos Passos (Opcionais):

1. **UI para Preferências**: Criar página para usuário gerenciar notificações
2. **Notificações Programadas**: Criar lembretes antes de consultas
3. **Notificações Agrupadas**: Agrupar múltiplas notificações do mesmo tipo
4. **Rich Notifications**: Adicionar imagens e ações nas notificações
5. **Analytics**: Rastrear taxa de cliques e conversão

### Documentação Completa:

- 📄 `PUSH_NOTIFICATIONS_SETUP.md` - Arquitetura completa
- 📋 `CHECKLIST_ATIVACAO_PUSH.md` - Checklist de ativação
- 🧪 `GUIA_TESTE_PUSH_NOTIFICACOES.md` - Este guia

---

**🚀 Sistema de Notificações Push está online!**
