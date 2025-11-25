# 🔔 Sistema de Lembretes de Consulta - Respira Kids

## ✅ STATUS: IMPLEMENTADO E FUNCIONANDO

**Data de Implementação:** 20/11/2025  
**Desenvolvido por:** Sistema Automatizado via MCP Supabase

---

## 📋 Visão Geral

Sistema automatizado que envia **2 lembretes por consulta** via webhook:

1. **24 horas antes** da consulta
2. **4 horas antes** da consulta (com regras especiais para horários matinais)

### 🎯 Regras de Negócio

#### Lembrete 24h Antes

- Enviado exatamente **24 horas antes** do horário da consulta
- Se o agendamento for feito com menos de 24h de antecedência, **não é enviado**

#### Lembrete 4h Antes (Regras Especiais)

Para evitar envio de mensagens muito cedo:

| Horário da Consulta (SP) | Horário do Lembrete (SP) | Observação                        |
| ------------------------ | ------------------------ | --------------------------------- |
| 8h ou 9h                 | 7h do mesmo dia          | Evita mensagens às 4h-5h da manhã |
| 10h, 11h ou 12h          | 8h do mesmo dia          | Evita mensagens muito cedo        |
| Demais horários          | 4h antes                 | Regra padrão                      |

**Exemplo prático:**

- Consulta às 8h → Lembrete às 7h ✅
- Consulta às 10h → Lembrete às 8h ✅
- Consulta às 14h → Lembrete às 10h ✅
- Consulta às 18h → Lembrete às 14h ✅

---

## 🏗️ Arquitetura Implementada

### 1️⃣ Tabela: `lembretes_consulta`

```sql
Colunas principais:
- id: UUID (PK)
- agendamento_id: UUID (FK → agendamentos)
- tipo_lembrete: '24h_antes' | '4h_antes'
- data_hora_consulta: TIMESTAMPTZ
- data_hora_lembrete_calculada: TIMESTAMPTZ
- data_hora_lembrete_enviado: TIMESTAMPTZ
- status: 'pendente' | 'enviado' | 'erro' | 'cancelado' | 'nao_criado'
- erro: TEXT (mensagem de erro se houver)

Constraint: UNIQUE(agendamento_id, tipo_lembrete)
```

**Status dos Lembretes:**

- `pendente`: Aguardando horário de envio
- `enviado`: Webhook disparado com sucesso
- `erro`: Falha no processamento (registra erro)
- `cancelado`: Consulta foi cancelada
- `nao_criado`: Agendamento feito após horário do lembrete (não será enviado)

### 2️⃣ Funções PostgreSQL

#### `calcular_horario_lembrete(data_hora_consulta, tipo_lembrete)`

Calcula o horário ideal para envio do lembrete aplicando as regras de negócio.

#### `popular_lembretes_consulta()`

- Varre agendamentos ativos sem lembretes
- Cria 2 registros por agendamento (24h e 4h)
- Se horário já passou, marca como `nao_criado`

#### `processar_lembretes_consulta()`

- Executada a cada 5 minutos via cron
- Popula lembretes novos
- Processa lembretes pendentes que chegaram no horário
- Dispara webhook via `dispatch_webhook()`
- Registra sucesso/erro

### 3️⃣ Cron Job

```sql
Job ID: 6
Nome: processar-lembretes-consulta
Schedule: */5 * * * * (a cada 5 minutos)
Status: ✅ ATIVO
```

### 4️⃣ Webhook Event

**Evento:** `appointment_reminder`

**URL Destino:** `https://webhooks-i.infusecomunicacao.online/webhook/webhookRK2`

**Payload JSON:**

```json
{
  "tipo": "appointment_reminder",
  "timestamp": "2025-11-20T22:51:20Z",
  "webhook_id": "uuid",
  "data": {
    "lembrete_id": "uuid",
    "tipo_lembrete": "4h_antes",
    "agendamento_id": "uuid",
    "paciente": {
      "id": "uuid",
      "nome": "Nome do Paciente",
      "telefone": 5511999999999,
      "email": "email@example.com"
    },
    "profissional": {
      "id": "uuid",
      "nome": "Nome do Profissional"
    },
    "consulta": {
      "data_hora": "2025-11-21T11:00:00Z",
      "tipo_servico": "Fisioterapia Respiratória",
      "duracao_minutos": 60,
      "valor": 300,
      "observacao": "Observação da consulta"
    },
    "local": {
      "nome": "Clínica XYZ",
      "endereco_completo": "Rua ABC, 123 - Bairro - Cidade/UF",
      "cep": "00000-000"
    },
    "lembrete": {
      "horario_calculado": "2025-11-21T07:00:00Z",
      "horario_enviado": "2025-11-21T07:00:30Z",
      "atraso_minutos": 0.5
    }
  }
}
```

### 5️⃣ Triggers

**Trigger:** `trg_cancelar_lembrete_ao_cancelar_consulta`

- Dispara quando `agendamentos.ativo` muda de `true` para `false`
- Cancela automaticamente todos os lembretes pendentes daquela consulta

**Trigger:** `trg_lembretes_updated_at`

- Atualiza `updated_at` automaticamente em qualquer update

### 6️⃣ Row Level Security (RLS)

**Políticas:**

1. Staff autorizado pode ver todos os lembretes
2. Pacientes só veem seus próprios lembretes
3. Sistema (postgres) tem acesso total

---

## 🔄 Fluxo Completo

### Cenário 1: Agendamento Normal (com antecedência)

```
1. [10h] Usuário agenda consulta para daqui 3 dias às 14h
2. [10h05] Cron roda, cria 2 lembretes:
   - Lembrete 24h: será enviado daqui 2 dias às 14h ✅
   - Lembrete 4h: será enviado daqui 3 dias às 10h ✅
3. [Dia -1, 14h] Webhook disparado (lembrete 24h)
4. [Dia 0, 10h] Webhook disparado (lembrete 4h)
5. [Dia 0, 14h] Consulta acontece
```

### Cenário 2: Agendamento de Última Hora

```
1. [16h] Usuário agenda consulta para hoje às 18h
2. [16h05] Cron roda:
   - Lembrete 24h: horário já passou → status: nao_criado ❌
   - Lembrete 4h: será enviado às 14h → já passou → status: nao_criado ❌
3. Nenhum lembrete é enviado (consulta muito em cima da hora)
```

### Cenário 3: Cancelamento

```
1. Consulta agendada, 2 lembretes pendentes
2. Usuário cancela consulta (ativo = false)
3. Trigger dispara
4. Ambos lembretes: status → cancelado
5. Não serão mais processados
```

---

## 📊 Queries de Monitoramento

### Ver Próximos Lembretes

```sql
SELECT
    lc.tipo_lembrete,
    lc.data_hora_lembrete_calculada,
    lc.data_hora_consulta,
    p.nome as paciente_nome,
    prof.nome as profissional_nome,
    EXTRACT(EPOCH FROM (lc.data_hora_lembrete_calculada - now())) / 3600 as horas_ate_envio
FROM lembretes_consulta lc
JOIN agendamentos a ON a.id = lc.agendamento_id
JOIN pessoas p ON p.id = a.paciente_id
JOIN pessoas prof ON prof.id = a.profissional_id
WHERE lc.status = 'pendente'
ORDER BY lc.data_hora_lembrete_calculada
LIMIT 20;
```

### Estatísticas de Lembretes

```sql
SELECT
    status,
    tipo_lembrete,
    COUNT(*) as total,
    MIN(data_hora_lembrete_calculada) as primeiro,
    MAX(data_hora_lembrete_calculada) as ultimo
FROM lembretes_consulta
WHERE created_at > now() - INTERVAL '30 days'
GROUP BY status, tipo_lembrete
ORDER BY status, tipo_lembrete;
```

### Lembretes com Erro

```sql
SELECT
    lc.id,
    lc.tipo_lembrete,
    lc.erro,
    lc.updated_at,
    p.nome as paciente_nome,
    lc.data_hora_consulta
FROM lembretes_consulta lc
JOIN agendamentos a ON a.id = lc.agendamento_id
JOIN pessoas p ON p.id = a.paciente_id
WHERE lc.status = 'erro'
ORDER BY lc.updated_at DESC;
```

### Webhooks de Lembretes Enviados

```sql
SELECT
    wq.status,
    wq.tentativas,
    wq.payload->'data'->>'tipo_lembrete' as tipo,
    wq.payload->'data'->'paciente'->>'nome' as paciente,
    wq.created_at,
    wq.processado_em
FROM webhook_queue wq
WHERE wq.evento = 'appointment_reminder'
ORDER BY wq.created_at DESC
LIMIT 20;
```

### Performance do Cron

```sql
-- Ver atraso no processamento
SELECT
    lc.tipo_lembrete,
    lc.data_hora_lembrete_calculada,
    lc.data_hora_lembrete_enviado,
    EXTRACT(EPOCH FROM (lc.data_hora_lembrete_enviado - lc.data_hora_lembrete_calculada)) / 60 as atraso_minutos,
    p.nome as paciente_nome
FROM lembretes_consulta lc
JOIN agendamentos a ON a.id = lc.agendamento_id
JOIN pessoas p ON p.id = a.paciente_id
WHERE lc.status = 'enviado'
AND lc.data_hora_lembrete_enviado > now() - INTERVAL '24 hours'
ORDER BY atraso_minutos DESC
LIMIT 10;
```

---

## 🛠️ Manutenção

### Reprocessar Lembrete com Erro

```sql
-- Marcar lembrete como pendente novamente
UPDATE lembretes_consulta
SET
    status = 'pendente',
    erro = NULL,
    updated_at = now()
WHERE id = 'UUID_DO_LEMBRETE';

-- Processar manualmente
SELECT * FROM processar_lembretes_consulta();
```

### Popular Lembretes para Agendamentos Existentes

```sql
SELECT * FROM popular_lembretes_consulta();
```

### Verificar Status do Cron

```sql
SELECT * FROM cron.job WHERE jobname = 'processar-lembretes-consulta';
```

### Pausar Temporariamente

```sql
-- Desativar cron
SELECT cron.unschedule('processar-lembretes-consulta');

-- Reativar cron
SELECT cron.schedule(
    'processar-lembretes-consulta',
    '*/5 * * * *',
    $$SELECT processar_lembretes_consulta();$$
);
```

---

## 🧪 Testes Realizados

### ✅ Teste 1: Cálculo de Horários

- Consulta 8h → Lembrete 7h ✅
- Consulta 10h → Lembrete 8h ✅
- Consulta 14h → Lembrete 10h (4h antes) ✅

### ✅ Teste 2: Criação de Lembretes

- 13 agendamentos processados
- 13 lembretes 24h marcados como `nao_criado` (consultas de amanhã)
- 13 lembretes 4h criados como `pendente`

### ✅ Teste 3: Envio de Webhook

- Lembrete alterado para horário atual
- Webhook disparado com sucesso
- Status atualizado para `enviado`
- Payload completo criado na `webhook_queue`

### ✅ Teste 4: Tratamento de Erro

- Erro simulado (campo inexistente)
- Status atualizado para `erro`
- Mensagem de erro registrada
- Correção aplicada e reprocessamento com sucesso

---

## 📈 Estatísticas Atuais

**Lembretes por Status:**

- ✅ Enviados (4h): 1
- ⏳ Pendentes (4h): 12
- ❌ Não Criados (24h): 13

**Cron Jobs Ativos:**

- Job #6: `processar-lembretes-consulta` - Executa a cada 5 minutos ✅

**Webhook Configurado:**

- Evento: `appointment_reminder` adicionado à lista de eventos ✅
- URL: `https://webhooks-i.infusecomunicacao.online/webhook/webhookRK2` ✅

---

## 🎓 Notas Técnicas

### Timezone

- Todas as datas são armazenadas em **UTC** (`TIMESTAMPTZ`)
- Conversão para `America/Sao_Paulo` apenas para aplicar regras de horário
- Retorno sempre em UTC para consistência

### Performance

- Índices otimizados para queries frequentes
- Limite de 100 lembretes por execução do cron
- Processamento assíncrono via webhook queue

### Segurança

- RLS ativado na tabela `lembretes_consulta`
- Apenas staff e pacientes donos podem visualizar
- Funções com `SECURITY DEFINER` para execução controlada

### Resiliência

- Tratamento de erros com registro detalhado
- Evita duplicação de webhooks
- Trigger automático para cancelamento

---

## ⚠️ **IMPORTANTE: Peculiaridade de Timezone**

### AI dev note: Regra Interna de Horários

**CRÍTICO:** O campo `data_hora` nos agendamentos está salvo como **UTC+0, mas representa horário de Brasília**.

**Exemplo:**

- Valor salvo: `2025-11-21 16:00:00+00`
- **Significa:** 16:00 horário de Brasília (NÃO é UTC real)
- **NÃO converter:** timezone, pois já está "correto" para o sistema

Esta é uma convenção interna necessária pois o Supabase não permite alterar o UTC padrão. Portanto:

- ✅ Extrair hora diretamente: `EXTRACT(HOUR FROM data_hora)`
- ❌ NÃO converter: `data_hora AT TIME ZONE 'America/Sao_Paulo'`

---

## 📞 Integração com Sistema Externo

O webhook `appointment_reminder` deve ser tratado no sistema de mensagens (WhatsApp/SMS) para:

1. **Identificar o destinatário:** Usar `responsavel_legal.telefone` (não `paciente.telefone`)
2. **Identificar o `tipo_lembrete`** (24h_antes ou 4h_antes)
3. **Personalizar a mensagem** baseado no tipo
4. **Incluir informações da consulta** (data/hora, profissional, local)

### Estrutura do Payload (Padrão do Sistema)

```json
{
  "tipo": "appointment_reminder",
  "timestamp": "2025-11-20T22:51:20Z",
  "webhook_id": "uuid",
  "data": {
    "lembrete_id": "uuid",
    "tipo_lembrete": "4h_antes",
    "lembrete_info": {
      "horario_calculado": "2025-11-21T07:00:00+00:00",
      "horario_enviado": "2025-11-21T07:00:30+00:00"
    },
    "id": "uuid",
    "agendamento_id": "uuid",
    "data_hora": "2025-11-21T11:00:00+00:00",
    "paciente": {
      "id": "uuid",
      "nome": "Nome do Paciente",
      "email": "email@example.com",
      "telefone": 5511999999999,
      "ativo": true
    },
    "responsavel_legal": {
      "id": "uuid",
      "nome": "Nome do Responsável",
      "email": "responsavel@example.com",
      "telefone": 5511988888888
    },
    "profissional": {
      "id": "uuid",
      "nome": "Nome do Profissional",
      "email": "profissional@example.com",
      "especialidade": "Fisioterapia Respiratória",
      "telefone": 5511977777777,
      "role": "profissional",
      "ativo": true
    },
    "tipo_servico": {
      "id": "uuid",
      "nome": "Fisioterapia Respiratória",
      "descricao": "Sessão de fisioterapia",
      "duracao_minutos": 60,
      "valor": 300,
      "cor": "blue"
    },
    "local_atendimento": {
      "id": "uuid",
      "nome": "Clínica XYZ",
      "tipo_local": "clinica"
    },
    "status_consulta": {
      "id": "uuid",
      "codigo": "agendado",
      "descricao": "Agendado",
      "cor": "#3B82F6"
    },
    "status_pagamento": {
      "id": "uuid",
      "codigo": "pendente",
      "descricao": "Pendente",
      "cor": "#F59E0B"
    },
    "valor_servico": 300,
    "observacao": null,
    "empresa_fatura": {
      "id": "uuid",
      "razao_social": "EMPRESA LTDA",
      "nome_fantasia": "EMPRESA",
      "cnpj": "00000000000000",
      "ativo": true
    },
    "comissao": {
      "tipo_recebimento": "fixo",
      "valor_fixo": 100,
      "valor_percentual": null,
      "valor_calculado": 100
    }
  }
}
```

### Exemplo de Mensagem WhatsApp:

```
🔔 LEMBRETE - Respira Kids

Olá [responsavel_legal.nome]!

[paciente.nome] tem uma consulta agendada para:
📅 [data_hora formatada]
👨‍⚕️ Com [profissional.nome]
🏥 [local_atendimento.nome]
⏱️ Duração: [tipo_servico.duracao_minutos] minutos

Em caso de dúvidas ou necessidade de reagendamento, entre em contato conosco.

Nos vemos em breve! 👋
```

**Atenção:** Enviar para `responsavel_legal.telefone` (não `paciente.telefone`)

---

## ✨ Conclusão

Sistema **100% funcional** e testado, pronto para uso em produção.

- ✅ Tabelas e funções criadas
- ✅ Cron job ativo
- ✅ Webhook configurado
- ✅ Triggers implementados
- ✅ RLS aplicado
- ✅ Testes realizados com sucesso

**Próximas consultas já terão lembretes automáticos!** 🎉
