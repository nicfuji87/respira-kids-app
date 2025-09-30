# 📧 Como Funciona: Convite por Email (Responsável Legal)

## 🎯 Resumo Executivo

**Responsável Legal NÃO precisa conectar Google Calendar!**

Ele apenas recebe um **convite por email** automático do Google, que permite:
- ✅ Aceitar/Recusar com 1 clique
- ✅ Adicionar ao calendário automaticamente
- ✅ Receber atualizações por email
- ✅ Funciona com qualquer calendário (Google, Outlook, Apple, etc)

---

## 🔄 Fluxo Completo

### **1. Profissional Conecta Google Calendar**

```
Profissional → Configurações → Meu Perfil → "Conectar com Google"
                                                    ↓
                                          OAuth 2.0 (uma vez)
                                                    ↓
                                    ✅ google_calendar_enabled = true
```

---

### **2. Cadastro do Paciente**

```
Secretária/Admin → Cadastra Paciente
                          ↓
            ┌─────────────┴─────────────┐
            │                           │
   Dados do Paciente          Responsável Legal
   - Nome: João Silva         - Nome: Maria Silva
   - Data Nasc: 10/05/2020    - Email: maria@gmail.com ← IMPORTANTE!
                               - Telefone: (61) 99999-9999
```

**Único requisito:** Email do responsável legal cadastrado.

---

### **3. Criar Agendamento**

```
Sistema → Cria Agendamento
              ↓
    ┌─────────┴─────────┐
    │   Agendamento     │
    ├───────────────────┤
    │ Paciente: João    │
    │ Data: 15/01 14:30 │
    │ Local: Clínica    │
    └─────────┬─────────┘
              ↓
    TRIGGER automático
              ↓
    Edge Function: sync-google-calendar
              ↓
    ┌─────────┴─────────────────────────┐
    │                                   │
    │  1. Buscar profissional OAuth     │
    │  2. Criar evento no Calendar      │
    │  3. Adicionar responsável         │
    │     como ATTENDEE                 │
    │                                   │
    └─────────┬─────────────────────────┘
              ↓
    Google Calendar API
              ↓
    POST /calendars/primary/events
    {
      "summary": "Consulta - João Silva",
      "start": "2025-01-15T14:30:00-03:00",
      "attendees": [
        {
          "email": "maria@gmail.com",    ← Email do responsável
          "displayName": "Maria Silva",
          "responseStatus": "needsAction"
        }
      ],
      "sendUpdates": "all"  ← Google ENVIA EMAIL automaticamente
    }
```

---

### **4. Email Automático do Google**

**Responsável Legal recebe este email:**

```
┌─────────────────────────────────────────────────────┐
│ De: calendar-notification@google.com                │
│ Para: maria@gmail.com                               │
│ Assunto: Convite: Consulta de Fisioterapia -       │
│          João Silva @ Qua 15 jan 2025 14:30 (BRT)  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  📅 Consulta de Fisioterapia - João Silva          │
│                                                     │
│  📆 Quarta-feira, 15 de janeiro de 2025             │
│  🕐 14:30 - 15:30 (Horário de Brasília)             │
│  📍 SHIS QI 11 Conj. 9 Casa 2, Lago Sul, Brasília   │
│                                                     │
│  ┌─────┐  ┌─────────┐  ┌─────┐                    │
│  │ SIM │  │ TALVEZ  │  │ NÃO │                    │
│  └─────┘  └─────────┘  └─────┘                    │
│                                                     │
│  📝 Detalhes:                                       │
│  Olá, Maria Silva                                   │
│                                                     │
│  A sua próxima consulta foi marcada para           │
│  15/01/2025 às 14:30 e será realizada no           │
│  endereço SHIS QI 11 Conj. 9 Casa 2...             │
│                                                     │
│  ⚠ Instruções:                                      │
│  🔹 Traga as medicações em uso;                     │
│  🔹 Em caso de febre, administrar medicação...      │
│  🔹 Chegue no horário agendado;                     │
│  ...                                                │
│                                                     │
│  ---                                                │
│  👨‍⚕️ Profissional: Dra. Bruna Cury                 │
│  🏥 Tipo: Consulta de Fisioterapia                  │
│                                                     │
│  📎 Anexo: convite.ics (para Outlook, Apple)        │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

### **5. Responsável Clica em "SIM"**

```
Maria clica no botão "SIM"
         ↓
Google Calendar automaticamente:
  ✅ Adiciona evento ao calendário dela
  ✅ Configura lembretes (1h, 2h ou 3h antes)
  ✅ Marca como "Aceito"
  ✅ Sincroniza com app mobile
         ↓
Maria recebe notificações:
  🔔 1 hora antes: "Consulta em 1 hora"
  📧 Email lembrete automático
```

---

### **6. Se Agendamento Mudar**

```
Secretária → Altera data/hora do agendamento
                        ↓
              TRIGGER automático
                        ↓
          Edge Function atualiza evento
                        ↓
            Google Calendar API (PUT)
                        ↓
     Maria recebe EMAIL de atualização:
     
┌──────────────────────────────────────────────┐
│ Assunto: Atualização: Consulta de...        │
├──────────────────────────────────────────────┤
│                                              │
│ 🔄 Este evento foi atualizado               │
│                                              │
│ ANTES: Qua 15 jan 14:30                     │
│ AGORA: Qui 16 jan 10:00  ← NOVA DATA        │
│                                              │
│ ┌─────┐  ┌─────────┐  ┌─────┐              │
│ │ SIM │  │ TALVEZ  │  │ NÃO │              │
│ └─────┘  └─────────┘  └─────┘              │
│                                              │
└──────────────────────────────────────────────┘
```

**Calendário de Maria é atualizado automaticamente!** ✨

---

### **7. Se Agendamento For Cancelado**

```
Secretária → Cancela/Desativa agendamento
                        ↓
              TRIGGER automático
                        ↓
       Edge Function deleta evento
                        ↓
         Google Calendar API (DELETE)
                        ↓
     Maria recebe EMAIL de cancelamento:
     
┌──────────────────────────────────────────────┐
│ Assunto: Cancelado: Consulta de...          │
├──────────────────────────────────────────────┤
│                                              │
│ ❌ Este evento foi cancelado                │
│                                              │
│ Consulta de Fisioterapia - João Silva       │
│ Qua 15 jan 2025 14:30 - 15:30               │
│                                              │
│ Organização: Dra. Bruna Cury                │
│                                              │
└──────────────────────────────────────────────┘
```

**Evento é removido automaticamente do calendário de Maria!** 🗑️

---

## 💡 Vantagens

### ✅ **Para o Responsável Legal:**
1. **Não precisa fazer login** em lugar nenhum
2. **Não precisa instalar** nenhum app
3. **Não precisa aceitar** nenhuma permissão OAuth
4. Apenas **abrir o email** e clicar em "SIM"
5. Funciona com **qualquer calendário** (Google, Outlook, Apple, Yahoo)

### ✅ **Para o Sistema:**
1. **Mais simples** de implementar
2. **Menos manutenção** (sem refresh de tokens para responsável)
3. **Menos erros** (OAuth pode falhar/expirar)
4. **Mais universal** (funciona mesmo se responsável usar Outlook)

### ✅ **Para a Clínica:**
1. **Menos suporte** (responsável não precisa de ajuda técnica)
2. **Maior adoção** (email é universal)
3. **Menos fricção** (não precisa explicar OAuth)

---

## 🔐 Segurança

**Pergunta:** "O Google vai enviar email em nome da clínica?"

**Resposta:** Sim! O email virá de `calendar-notification@google.com`, mas:

1. ✅ **Organização:** Mostra "Dra. Bruna Cury" (profissional)
2. ✅ **Reply-to:** Pode configurar email da clínica
3. ✅ **Confiável:** Google Calendar é reconhecido mundialmente
4. ✅ **Não é spam:** Emails do Google Calendar têm alta reputação
5. ✅ **Arquivo .ics:** Padrão universal (RFC 5545)

---

## 📊 Compatibilidade

| Calendário | Recebe Email | Aceitar/Recusar | Auto-Adiciona | Atualizações |
|------------|--------------|-----------------|---------------|--------------|
| **Google Calendar** | ✅ | ✅ | ✅ | ✅ |
| **Outlook** | ✅ | ✅ | ✅ (via .ics) | ✅ |
| **Apple iCloud** | ✅ | ✅ | ✅ (via .ics) | ✅ |
| **Yahoo Mail** | ✅ | ✅ | ✅ (via .ics) | ✅ |
| **Thunderbird** | ✅ | ✅ | ✅ (via .ics) | ✅ |

---

## 🧪 Como Testar

### **Teste 1: Criar Agendamento**

1. Login como secretária
2. Criar paciente com responsável legal (email válido)
3. Criar agendamento para esse paciente
4. Verificar:
   - ✅ Evento aparece no Calendar do profissional
   - ✅ Email enviado para responsável legal
   - ✅ Email tem botões "Sim/Talvez/Não"
   - ✅ Email tem arquivo .ics anexo

### **Teste 2: Aceitar Convite**

1. Responsável abre email
2. Clica em "SIM"
3. Verificar:
   - ✅ Evento aparece no calendário do responsável
   - ✅ Status muda para "Aceito"
   - ✅ Lembretes configurados

### **Teste 3: Atualizar Agendamento**

1. Secretária altera data/hora
2. Verificar:
   - ✅ Evento atualizado no Calendar do profissional
   - ✅ Email de atualização enviado para responsável
   - ✅ Evento atualizado no calendário do responsável

### **Teste 4: Cancelar Agendamento**

1. Secretária desativa agendamento
2. Verificar:
   - ✅ Evento removido do Calendar do profissional
   - ✅ Email de cancelamento enviado para responsável
   - ✅ Evento removido do calendário do responsável

---

## 📝 Código Relevante

### **buildAttendees() - Edge Function**

```typescript
function buildAttendees(agendamento: any): any[] {
  const attendees = [];

  // SEMPRE adicionar Responsável Legal (se tiver email)
  if (agendamento.responsavel_legal_email) {
    attendees.push({
      email: agendamento.responsavel_legal_email,
      displayName: agendamento.responsavel_legal_nome || 'Responsável',
      responseStatus: 'needsAction' // Google envia email
    });
  }
  // Se não tiver responsável, adicionar paciente
  else if (agendamento.paciente_email) {
    attendees.push({
      email: agendamento.paciente_email,
      displayName: agendamento.paciente_nome,
      responseStatus: 'needsAction'
    });
  }

  return attendees;
}
```

### **Criar Evento - Google Calendar API**

```typescript
const eventData = {
  summary: "Consulta de Fisioterapia - João Silva",
  start: { dateTime: "2025-01-15T14:30:00-03:00" },
  end: { dateTime: "2025-01-15T15:30:00-03:00" },
  location: "SHIS QI 11 Conj. 9 Casa 2, Lago Sul, Brasília",
  description: "Olá, Maria Silva...",
  attendees: [
    {
      email: "maria@gmail.com",
      displayName: "Maria Silva",
      responseStatus: "needsAction"
    }
  ],
  sendUpdates: "all" // ← CRÍTICO: envia emails automaticamente
};

await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${accessToken}` },
  body: JSON.stringify(eventData)
});
```

---

## ✅ Checklist Final

### **Implementação:**
- [ ] Função SQL `get_google_calendar_recipients` (só profissional)
- [ ] Edge Function `buildAttendees()` (adiciona responsável)
- [ ] `sendUpdates: 'all'` no eventData
- [ ] Deploy e testes

### **Dados Necessários:**
- [ ] Email do responsável legal cadastrado no banco
- [ ] Profissional conectou Google Calendar (OAuth)

### **Testes:**
- [ ] Criar agendamento → email enviado
- [ ] Aceitar convite → evento no calendário
- [ ] Atualizar agendamento → email de atualização
- [ ] Cancelar agendamento → email de cancelamento
- [ ] Testar com Outlook/Apple Calendar

---

**🎉 Muito mais simples e eficiente!**
