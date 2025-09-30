# 📅 n8n: Configuração de Email/WhatsApp com Google Calendar (.ics)

## 🎯 Objetivo

Quando um agendamento é criado, o **webhook** envia todos os dados para o **n8n**, que:
1. ✅ Cria arquivo **.ics** (Google Calendar)
2. ✅ Envia **email** da empresa com .ics anexo
3. ✅ Envia **WhatsApp** com link para download do .ics

---

## 📊 Dados Recebidos do Webhook

### **Evento:** `appointment_created`

```json
{
  "id": "abc-123-def-456",
  "agendamento_id": "abc-123-def-456",
  "data_hora": "2025-01-15T14:30:00+00:00",
  "created_at": "2025-01-10T10:00:00+00:00",
  
  "paciente": {
    "id": "pac-123",
    "nome": "João Silva",
    "email": "joao@email.com",
    "telefone": "61999999999"
  },
  
  "responsavel_legal": {
    "id": "resp-456",
    "nome": "Maria Silva",
    "email": "maria@gmail.com",
    "telefone": "61988888888"
  },
  
  "profissional": {
    "id": "prof-789",
    "nome": "Dra. Bruna Cury",
    "email": "bruna@respirakids.com.br",
    "especialidade": "Fisioterapeuta",
    "telefone": "61977777777"
  },
  
  "tipo_servico": {
    "id": "serv-111",
    "nome": "Consulta de Fisioterapia",
    "duracao_minutos": 60,
    "valor": "250.00"
  },
  
  "local_atendimento": {
    "id": "local-222",
    "nome": "Clínica Lago Sul",
    "tipo_local": "clinica"
  },
  
  "status_consulta": {
    "id": "status-333",
    "codigo": "AGENDADO",
    "descricao": "Agendado"
  },
  
  "status_pagamento": {
    "id": "pag-444",
    "codigo": "PENDENTE",
    "descricao": "Pagamento Pendente"
  },
  
  "valor_servico": "250.00",
  "observacao": "Trazer exames anteriores",
  "ativo": true,
  
  "empresa_fatura": {
    "id": "emp-555",
    "razao_social": "Respira Kids Brasília LTDA",
    "nome_fantasia": "Respira Kids",
    "cnpj": "12.345.678/0001-90"
  }
}
```

---

## 📝 Formato do Arquivo .ics

### **Estrutura Básica:**

```ics
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Respira Kids Brasília//Agendamentos//PT-BR
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
UID:{{ agendamento_id }}@respirakidsbrasilia.com.br
DTSTAMP:{{ data_criacao_formatada }}
DTSTART:{{ data_hora_inicio_formatada }}
DTEND:{{ data_hora_fim_formatada }}
SUMMARY:{{ titulo_evento }}
LOCATION:{{ endereco_completo }}
DESCRIPTION:{{ descricao_completa }}
ORGANIZER;CN={{ nome_empresa }}:mailto:{{ email_empresa }}
STATUS:CONFIRMED
SEQUENCE:0
BEGIN:VALARM
TRIGGER:{{ tempo_lembrete }}
ACTION:DISPLAY
DESCRIPTION:{{ texto_lembrete }}
END:VALARM
END:VEVENT
END:VCALENDAR
```

---

## 🔧 Mapeamento de Campos

### **1. UID (Identificador Único)**
```
UID:{{ agendamento_id }}@respirakidsbrasilia.com.br
```
**Exemplo:**
```
UID:abc-123-def-456@respirakidsbrasilia.com.br
```

### **2. DTSTAMP (Data de Criação)**
```
DTSTAMP:{{ created_at | format: 'YYYYMMDDTHHmmss' }}Z
```
**Exemplo:**
```
DTSTAMP:20250110T100000Z
```

### **3. DTSTART (Início do Evento)**
```
DTSTART:{{ data_hora | format: 'YYYYMMDDTHHmmss' }}
```
**⚠️ IMPORTANTE:** NÃO use 'Z' no final (é horário local de Brasília)

**Exemplo:**
```
DTSTART:20250115T143000
```

### **4. DTEND (Fim do Evento)**
```typescript
// Calcular: data_hora + duracao_minutos
const inicio = new Date(data_hora);
const fim = new Date(inicio.getTime() + duracao_minutos * 60000);

DTEND:{{ fim | format: 'YYYYMMDDTHHmmss' }}
```
**Exemplo:**
```
DTEND:20250115T153000
```

### **5. SUMMARY (Título)**
```
SUMMARY:Consulta de Fisioterapia - {{ paciente.nome }}
```
**Exemplo:**
```
SUMMARY:Consulta de Fisioterapia - João Silva
```

### **6. LOCATION (Local)**

#### **Se `tipo_local === 'clinica'` ou `'externa'`:**
```javascript
// Buscar endereço do local de atendimento
const location = await buscarEnderecoLocal(local_atendimento.id);
```

#### **Se `tipo_local === 'domiciliar'`:**
```javascript
// Buscar endereço do paciente
const location = await buscarEnderecoPaciente(paciente.id);
```

**Formato:**
```
LOCATION:Logradouro\, Número\, Bairro\, Cidade\, Estado\, CEP
```
**⚠️ IMPORTANTE:** Escapar vírgulas com `\,`

**Exemplo:**
```
LOCATION:SHIS QI 11 Conj. 9 Casa 2\, Lago Sul\, Brasília\, DF\, 71625-290
```

### **7. DESCRIPTION (Descrição)**

```
DESCRIPTION:Olá\, {{ responsavel_legal.nome || paciente.nome }}!\n
\n
A sua próxima consulta foi marcada para {{ data_hora | format: 'DD/MM/YYYY' }} às {{ data_hora | format: 'HH:mm' }} e será realizada no endereço {{ location }}\n
\n
⚠ Instruções:\n
• Traga as medicações em uso\;\n
• Em caso de febre\, administrar a medicação orientada pelo médico 1 hora antes da consulta\;\n
• Evite desperdício e traga sua seringa do 1º atendimento\;\n
• Chegue no horário agendado\;\n
• Alimentar o bebê/criança 30 min antes.\n
\n
❌ Cancelamentos < 12h: cobrança de 50%% (Cláusula 4ª).\n
\n
---\n
👨‍⚕️ Profissional: {{ profissional.nome }}\n
🏥 Tipo de Serviço: {{ tipo_servico.nome }}\n
⏱️ Duração: {{ tipo_servico.duracao_minutos }} minutos
{{ observacao ? '\n📝 Observações: ' + observacao : '' }}
```

**⚠️ IMPORTANTE:** Escapar caracteres especiais:
- Vírgula: `\,`
- Ponto e vírgula: `\;`
- Quebra de linha: `\n`
- Porcentagem: `%%`

### **8. ORGANIZER (Organizador)**
```
ORGANIZER;CN=Respira Kids:mailto:contato@respirakidsbrasilia.com.br
```

### **9. VALARM (Lembrete)**

```javascript
// Calcular lembrete baseado no horário
const hora = new Date(data_hora).getHours();

let lembrete = '-PT3H'; // 3 horas antes (padrão)
if (hora === 7 || hora === 8) {
  lembrete = '-PT1H'; // 1 hora antes
} else if (hora === 9) {
  lembrete = '-PT2H'; // 2 horas antes
}
```

```ics
BEGIN:VALARM
TRIGGER:-PT1H
ACTION:DISPLAY
DESCRIPTION:Lembrete: Consulta em 1 hora
END:VALARM
```

---

## 📧 Template de Email

### **Assunto:**
```
✅ Consulta Agendada - {{ paciente.nome }}
```

### **Corpo HTML:**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .logo { max-width: 200px; margin-bottom: 20px; }
    .content { background: white; padding: 30px; border: 1px solid #e0e0e0; }
    .info-box { background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .info-row { margin: 10px 0; }
    .icon { margin-right: 10px; }
    .button { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: bold; }
    .instructions { background: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://app.respirakidsbrasilia.com.br/images/logos/logo-respira-kids.png" alt="Respira Kids" class="logo">
      <h1>Consulta Agendada</h1>
    </div>
    
    <div class="content">
      <p>Olá, <strong>{{ responsavel_legal.nome || paciente.nome }}</strong>! 👋</p>
      
      <p>A consulta do <strong>{{ paciente.nome }}</strong> foi agendada com sucesso:</p>
      
      <div class="info-box">
        <div class="info-row">
          <span class="icon">📅</span>
          <strong>Data:</strong> {{ data_hora | format: 'DD/MM/YYYY' }}
        </div>
        <div class="info-row">
          <span class="icon">🕐</span>
          <strong>Horário:</strong> {{ data_hora | format: 'HH:mm' }} às {{ data_hora_fim | format: 'HH:mm' }}
        </div>
        <div class="info-row">
          <span class="icon">📍</span>
          <strong>Local:</strong> {{ location }}
        </div>
        <div class="info-row">
          <span class="icon">👨‍⚕️</span>
          <strong>Profissional:</strong> {{ profissional.nome }}
        </div>
        <div class="info-row">
          <span class="icon">🏥</span>
          <strong>Tipo:</strong> {{ tipo_servico.nome }}
        </div>
        <div class="info-row">
          <span class="icon">⏱️</span>
          <strong>Duração:</strong> {{ tipo_servico.duracao_minutos }} minutos
        </div>
      </div>
      
      <div style="text-align: center;">
        <a href="#" class="button">📅 ADICIONAR AO MEU CALENDÁRIO</a>
        <p style="font-size: 12px; color: #666;">Ou clique no arquivo .ics anexo</p>
      </div>
      
      <div class="instructions">
        <h3>⚠️ Instruções Importantes:</h3>
        <ul>
          <li>🔹 Traga as medicações em uso;</li>
          <li>🔹 Em caso de febre, administrar a medicação orientada pelo médico 1 hora antes da consulta;</li>
          <li>🔹 Evite desperdício e traga sua seringa do 1º atendimento;</li>
          <li>🔹 Chegue no horário agendado;</li>
          <li>🔹 Alimentar o bebê/criança 30 min antes.</li>
        </ul>
        <p><strong>❌ Cancelamentos com menos de 12 horas:</strong> cobrança de 50% do valor (Cláusula 4ª do contrato).</p>
      </div>
      
      {{ observacao ? '<div class="info-box"><strong>📝 Observações:</strong><br>' + observacao + '</div>' : '' }}
    </div>
    
    <div class="footer">
      <p><strong>Respira Kids Brasília</strong></p>
      <p>📞 {{ profissional.telefone }} | 📧 contato@respirakidsbrasilia.com.br</p>
      <p>🌐 <a href="https://www.respirakidsbrasilia.com.br">www.respirakidsbrasilia.com.br</a></p>
    </div>
  </div>
</body>
</html>
```

---

## 📱 Template de WhatsApp

```
📅 *Consulta Agendada - {{ paciente.nome }}*

Olá, {{ responsavel_legal.nome || paciente.nome }}! 👋

A consulta do *{{ paciente.nome }}* foi agendada:

📅 *Data:* {{ data_hora | format: 'DD/MM/YYYY' }}
🕐 *Horário:* {{ data_hora | format: 'HH:mm' }} às {{ data_hora_fim | format: 'HH:mm' }}
📍 *Local:* {{ location }}
👨‍⚕️ *Profissional:* {{ profissional.nome }}
🏥 *Tipo:* {{ tipo_servico.nome }}

📅 *Adicionar ao calendário:*
https://app.respirakidsbrasilia.com.br/agenda/add/{{ agendamento_id }}

⚠️ *Instruções:*
• Traga as medicações em uso
• Chegue no horário agendado
• Alimentar criança 30min antes

❌ *Cancelamentos < 12h: cobrança de 50%*

{{ observacao ? '📝 *Obs:* ' + observacao + '\n\n' : '' }}Dúvidas? Responda esta mensagem! 😊

---
*Respira Kids Brasília*
📞 {{ profissional.telefone }}
🌐 www.respirakidsbrasilia.com.br
```

---

## 🔧 Workflow n8n (Exemplo)

### **Node 1: Webhook Trigger**
```javascript
// Recebe dados do Supabase
const webhook_data = $input.all();
```

### **Node 2: Buscar Endereço**
```javascript
// Se tipo_local === 'clinica' ou 'externa'
if (tipo_local === 'clinica' || tipo_local === 'externa') {
  // Buscar no Supabase: locais_atendimento + enderecos
  const location = await fetchLocalAddress(local_atendimento.id);
}
// Se tipo_local === 'domiciliar'
else if (tipo_local === 'domiciliar') {
  // Buscar no Supabase: pessoas + enderecos
  const location = await fetchPatientAddress(paciente.id);
}
```

### **Node 3: Gerar arquivo .ics**
```javascript
const inicio = new Date(data_hora);
const fim = new Date(inicio.getTime() + duracao_minutos * 60000);
const hora = inicio.getHours();

let lembrete = '-PT3H';
if (hora === 7 || hora === 8) lembrete = '-PT1H';
else if (hora === 9) lembrete = '-PT2H';

const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Respira Kids Brasília//PT-BR
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
UID:${agendamento_id}@respirakidsbrasilia.com.br
DTSTAMP:${formatDate(created_at, 'YYYYMMDDTHHmmss')}Z
DTSTART:${formatDate(inicio, 'YYYYMMDDTHHmmss')}
DTEND:${formatDate(fim, 'YYYYMMDDTHHmmss')}
SUMMARY:Consulta de Fisioterapia - ${paciente.nome}
LOCATION:${location.replace(/,/g, '\\,')}
DESCRIPTION:${description.replace(/\n/g, '\\n')}
ORGANIZER;CN=Respira Kids:mailto:contato@respirakidsbrasilia.com.br
STATUS:CONFIRMED
BEGIN:VALARM
TRIGGER:${lembrete}
ACTION:DISPLAY
DESCRIPTION:Lembrete: Consulta em ${lembrete.replace('-PT', '').replace('H', 'h')}
END:VALARM
END:VEVENT
END:VCALENDAR`;

return { ics: icsContent };
```

### **Node 4: Enviar Email**
```javascript
// Gmail / SMTP
{
  to: responsavel_legal.email || paciente.email,
  from: 'Respira Kids <contato@respirakidsbrasilia.com.br>',
  subject: `✅ Consulta Agendada - ${paciente.nome}`,
  html: emailTemplate,
  attachments: [
    {
      filename: `consulta_${paciente.nome.toLowerCase().replace(/ /g, '_')}.ics`,
      content: icsContent,
      contentType: 'text/calendar; charset=utf-8'
    }
  ]
}
```

### **Node 5: Enviar WhatsApp**
```javascript
// Evolution API / Baileys
{
  number: responsavel_legal.telefone || paciente.telefone,
  message: whatsappTemplate
}
```

---

## ✅ Checklist

### **Configuração:**
- [ ] Webhook `appointment_created` configurado
- [ ] n8n recebendo dados do webhook
- [ ] Queries para buscar endereço (clínica/domiciliar)
- [ ] Gerador de .ics funcionando
- [ ] Template de email criado
- [ ] Template de WhatsApp criado
- [ ] SMTP configurado
- [ ] WhatsApp API configurada

### **Testes:**
- [ ] Criar agendamento → webhook dispara
- [ ] .ics gerado corretamente
- [ ] Email enviado com .ics anexo
- [ ] WhatsApp enviado com link
- [ ] Arquivo .ics abre no Google Calendar
- [ ] Evento adicionado ao calendário
- [ ] Lembretes funcionando

---

## 📚 Referências

- [RFC 5545 - iCalendar](https://tools.ietf.org/html/rfc5545)
- [Google Calendar .ics Format](https://developers.google.com/calendar/ical)
- [n8n Documentation](https://docs.n8n.io/)

---

**🎉 Pronto para configurar no n8n!**
