# 🔥 Como Ativar as Notificações Push - AGORA

## ⚠️ O Problema

O sistema de push notifications estava criado mas **NÃO estava integrado** no frontend. Agora está integrado! ✅

---

## 📝 Passos para Ativar

### 1️⃣ Criar arquivo `.env` (Se ainda não existir)

Na raiz do projeto, crie um arquivo `.env` com as credenciais do Firebase:

```env
# Supabase (você já tem)
VITE_SUPABASE_URL=https://jqegoentcusnbcykgtxg.supabase.co
VITE_SUPABASE_ANON_KEY=sua_anon_key_aqui

# Firebase - ADICIONE ESTAS LINHAS
VITE_FIREBASE_API_KEY=AIzaSyDXwW6Id1CMaW-PeRY0cEz1bHehnDQ-IFQ
VITE_FIREBASE_AUTH_DOMAIN=respira-kids-app.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=respira-kids-app
VITE_FIREBASE_STORAGE_BUCKET=respira-kids-app.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=551722225681
VITE_FIREBASE_APP_ID=1:551722225681:web:f02f8bf486919dd1d321b0
VITE_FIREBASE_VAPID_KEY=BGspTEoU8P2K34YeSH1qtTvPEXk6qOdzAxU-B79Ny8HDzsVmSJd6eelLxTvnn4a0_rtg7nbIlv68iwcO3z2XMa8
```

### 2️⃣ Reiniciar o Servidor de Desenvolvimento

```bash
# Parar o servidor atual (Ctrl+C)
# Iniciar novamente
npm run dev
```

### 3️⃣ Fazer Login na Aplicação

- Abra o navegador e faça login
- O sistema vai **automaticamente** pedir permissão para notificações

### 4️⃣ Permitir Notificações

Quando o navegador mostrar o popup:

- ✅ Clique em **"Permitir"** ou **"Allow"**
- ⚠️ Se clicar em "Bloquear", terá que habilitar manualmente nas configurações do navegador

### 5️⃣ Verificar se o Token foi Registrado

Abra o **Console do Navegador** (F12) e procure por:

```
🔥 Firebase inicializado
✅ Token FCM obtido e registrado
```

---

## 🧪 Testar

### Teste 1: Novo Paciente (Admin)

1. Faça login como **admin**
2. Vá em **Pacientes** → **Novo Paciente**
3. Cadastre um paciente completo
4. ✅ Em até **1 minuto**, você deve receber uma notificação

### Teste 2: Novo Agendamento (Profissional)

1. Faça login como **profissional**
2. Crie um agendamento para você mesmo
3. ✅ Em até **1 minuto**, você deve receber uma notificação

---

## 🔍 Solução de Problemas

### "Não recebi permissão do navegador"

**Causa**: Notificações podem estar bloqueadas no navegador

**Solução**:

1. Chrome/Edge: `chrome://settings/content/notifications`
2. Encontre seu site e mude para "Permitir"
3. Recarregue a página

### "Token não está sendo registrado"

**Verificar**:

1. Abra o Console (F12)
2. Procure por erros relacionados a Firebase
3. Verifique se o arquivo `.env` está correto
4. Reinicie o servidor dev (`npm run dev`)

### "Criei agendamento mas não recebi notificação"

**Verificar no banco**:

```sql
-- Ver se o token foi registrado
SELECT * FROM user_push_tokens WHERE active = true;

-- Ver se a notificação foi adicionada à fila
SELECT * FROM push_notification_queue
WHERE status = 'pending'
ORDER BY created_at DESC;

-- Ver logs de envio
SELECT * FROM push_notification_logs
ORDER BY created_at DESC
LIMIT 10;
```

### "Service Worker não está registrando"

**Causa**: Arquivo `firebase-messaging-sw.js` não está sendo servido

**Solução**:

1. Verifique se o arquivo existe em `public/firebase-messaging-sw.js`
2. Acesse diretamente: `http://localhost:5173/firebase-messaging-sw.js`
3. Deve mostrar o código JavaScript, não erro 404

---

## 📱 Android (PWA Instalado)

Se você instalou o app no Android:

1. **Reinstale o PWA**:
   - Desinstale o app atual
   - Abra no Chrome
   - Menu → "Adicionar à tela inicial"

2. **Permissões**:
   - Android pode pedir permissão separadamente
   - Vá em Configurações → Apps → Seu App → Notificações
   - Ative as notificações

---

## ✅ Checklist Rápido

- [ ] Arquivo `.env` criado com Firebase config
- [ ] Servidor dev reiniciado
- [ ] Login feito na aplicação
- [ ] Permissão de notificações concedida
- [ ] Console mostra "Token FCM obtido e registrado"
- [ ] Token aparece na tabela `user_push_tokens`
- [ ] Teste de criação de paciente/agendamento feito
- [ ] Notificação recebida em até 1 minuto

---

## 🎯 O Que Foi Corrigido

**ANTES**: Hook criado mas não usado → Nenhum token registrado → Notificações não funcionavam

**AGORA**: Hook integrado no AppRouter → Token registrado automaticamente no login → Notificações funcionam! ✅

---

**Qualquer problema, verifique o console do navegador primeiro!**
