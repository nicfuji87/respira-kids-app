# ✅ Checklist Final: Google Calendar Funcionando

## 🎯 Tudo que foi configurado via MCP:

- [x] ✅ Migration: `enhance_appointment_webhook_with_ics_data`
- [x] ✅ Migration: `create_google_calendar_recipients_function`
- [x] ✅ Migration: `fix_google_calendar_trigger_with_hardcoded_url`
- [x] ✅ Migration: `fix_webhook_with_correct_view_fields`
- [x] ✅ Edge Function: `google-oauth-callback` (v2) DEPLOYED
- [x] ✅ Edge Function: `sync-google-calendar` (v2) DEPLOYED
- [x] ✅ Variáveis de ambiente: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_URL

---

## 🧪 TESTE AGORA: Conectar Bruna ao Google Calendar

### **Passo 1: Abrir Console do Navegador**

1. Pressione **F12** (ou Ctrl+Shift+I)
2. Vá na aba **Console**
3. **DEIXE ABERTO** durante todo o processo

---

### **Passo 2: Login como Bruna**

- Email: `brunacurylp@gmail.com`
- Senha: [sua senha]

---

### **Passo 3: Ir em Configurações**

1. Clicar em **Configurações** no menu
2. Ou acessar: `https://app.respirakidsbrasilia.com.br/configuracoes`

---

### **Passo 4: Ir na aba "Meu Perfil"**

Rolar até a seção **"Sincronização com Google Calendar"**

---

### **Passo 5: Clicar em "Conectar com Google"**

**NO CONSOLE DEVE APARECER:**
```
🔗 Redirecionando para OAuth com redirect_uri: https://app.respirakidsbrasilia.com.br/auth/google/callback
```

**Se NÃO aparecer:** Tem problema no frontend

---

### **Passo 6: Autorizar no Google**

1. Escolher conta: `brunacurylp@gmail.com`
2. Clicar em **"Permitir"**
3. Aguardar redirecionamento

---

### **Passo 7: Aguardar Callback**

Você será redirecionado para: `/auth/google/callback`

**Tela deve mostrar:**
```
┌─────────────────────────────┐
│  🔄 Conectando com Google... │
│                             │
│  Aguarde enquanto           │
│  configuramos sua integração│
└─────────────────────────────┘
```

**NO CONSOLE DEVE APARECER:**
```
📞 Processando callback do Google OAuth...
```

---

### **Passo 8: Verificar Resultado**

#### **✅ SUCESSO:**

**Tela mostra:**
```
┌─────────────────────────────┐
│  ✅ Conectado com Sucesso!  │
│                             │
│  Seus agendamentos serão    │
│  sincronizados              │
│  automaticamente            │
│                             │
│  Redirecionando...          │
└─────────────────────────────┘
```

**NO CONSOLE:**
```
✅ Google Calendar conectado com sucesso!
```

**Redireciona para:** Configurações (tab Integração)

**Deve mostrar:**
```
✅ Conectado ao Google Calendar

[x] Sincronização Automática
    Novos agendamentos serão adicionados automaticamente
```

---

#### **❌ ERRO:**

**Tela mostra:**
```
┌─────────────────────────────┐
│  ❌ Erro na Conexão         │
│                             │
│  [Mensagem de erro aqui]    │
│                             │
│  [ Voltar para Config ]     │
└─────────────────────────────┘
```

**NO CONSOLE:**
```
❌ Erro na Edge Function: [mensagem]
```

**SE DER ERRO:** Copie a mensagem completa do console e me envie!

---

## 🧪 TESTE 2: Criar Agendamento

### **Passo 1: Ir em Agenda**

Clicar em **Agenda** no menu

---

### **Passo 2: Criar Novo Agendamento**

1. Clicar em **Novo Agendamento**
2. Preencher:
   - **Data:** Amanhã (01/10/2025)
   - **Hora:** 14:00
   - **Paciente:** Henrique Kenzo (já cadastrado)
   - **Profissional:** Bruna Cury
   - **Tipo:** Consulta de Fisioterapia
   - **Local:** Sala 2 (Clínica)
   - **Status Consulta:** Agendado
   - **Status Pagamento:** Pendente
   - **Empresa:** Respira Kids

3. Clicar em **Salvar**

---

### **Passo 3: Verificar Console**

**NO CONSOLE DEVE APARECER:**
```
Agendamento criado com sucesso
```

---

### **Passo 4: Verificar Google Calendar**

1. Abrir **Google Calendar** em outra aba
2. Login como: `brunacurylp@gmail.com`
3. Ir no dia **01/10/2025**

**DEVE APARECER:**
```
14:00 - 15:00
Consulta de Fisioterapia - Henrique Kenzo Cury Peres Fujimoto

📍 [Endereço da Clínica]
👨‍⚕️ Profissional: Bruna Cury Lourenço Peres
🏥 Tipo: Consulta de Fisioterapia
⏱️ Duração: 60 minutos
```

---

### **Passo 5: Verificar Webhook n8n**

O webhook deve ter recebido:

```json
{
  "tipo": "appointment_created",
  "data": {
    "agendamento_id": "...",
    "paciente": { "nome": "Henrique Kenzo..." },
    "responsavel_legal": {
      "nome": "Nicolas Shuith Ramos Fujimoto",
      "email": "fujimoto.nicolas@gmail.com",  ← IMPORTANTE!
      "telefone": 556181446666
    },
    "profissional": {
      "nome": "Bruna Cury Lourenço Peres",
      "email": "brunacurylp@gmail.com"
    },
    "tipo_servico": {
      "nome": "Consulta de Fisioterapia",
      "duracao_minutos": 60
    },
    "local_atendimento": {
      "nome": "Sala 2",
      "tipo_local": "clinica"
    },
    "data_hora": "2025-10-01T14:00:00+00:00"
  }
}
```

---

## 📋 Checklist de Verificação:

### **Conexão Google Calendar:**
- [ ] Console aberto (F12)
- [ ] Login como Bruna
- [ ] Ir em Configurações → Meu Perfil
- [ ] Clicar em "Conectar com Google"
- [ ] Verificar log: "🔗 Redirecionando..."
- [ ] Autorizar no Google
- [ ] Verificar log: "📞 Processando callback..."
- [ ] Ver mensagem: "✅ Conectado com Sucesso!"
- [ ] Voltar para Configurações
- [ ] Verificar status: "✅ Conectado ao Google Calendar"
- [ ] Verificar checkbox: "[x] Sincronização Automática"

### **Verificação no Banco:**

Execute no SQL Editor:

```sql
SELECT 
  nome,
  email,
  google_calendar_enabled,
  google_refresh_token IS NOT NULL as has_token,
  google_calendar_id,
  DATE(updated_at) as data_atualizacao
FROM pessoas
WHERE email = 'brunacurylp@gmail.com';
```

**Deve retornar:**
```
nome: "Bruna Cury Lourenço Peres"
google_calendar_enabled: true      ✅
has_token: true                    ✅
google_calendar_id: "primary"      ✅
data_atualizacao: 2025-09-30       ✅ (HOJE)
```

### **Criar Agendamento:**
- [ ] Ir em Agenda
- [ ] Criar novo agendamento
- [ ] Salvar
- [ ] Ver mensagem de sucesso
- [ ] Verificar Google Calendar da Bruna
- [ ] Confirmar que evento foi criado
- [ ] Verificar webhook no n8n
- [ ] Confirmar dados do responsável legal

---

## 🎯 Resultado Final Esperado:

### **Google Calendar da Bruna:**
```
📅 01/10/2025
14:00 - 15:00
Consulta de Fisioterapia - Henrique Kenzo Cury Peres Fujimoto
```

### **Webhook n8n:**
```json
{
  "responsavel_legal": {
    "email": "fujimoto.nicolas@gmail.com"
  }
}
```

### **Email para Responsável (quando configurar n8n):**
```
De: Respira Kids <contato@respirakidsbrasilia.com.br>
Para: fujimoto.nicolas@gmail.com

✅ Consulta Agendada - Henrique Kenzo

[Email com .ics anexo]
```

---

## 🚨 Se der erro em qualquer etapa:

**COPIE:**
1. Mensagem de erro da tela
2. Logs do Console (F12)
3. Resultado da query SQL

**E ME ENVIE!**

---

**🚀 Pronto para testar! Siga o checklist e me avise os resultados!**
