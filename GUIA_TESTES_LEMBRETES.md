# 🧪 Guia de Testes - Sistema de Lembretes

## ⚠️ Comportamento Esperado

### Regra Importante:

> **"Caso o agendamento seja feito após os lembretes o webhook não deve ser disparado"**

Isso significa que se você criar um agendamento **DEPOIS** do horário calculado do lembrete, ele será marcado como `nao_criado` e **NÃO** será enviado.

---

## 📋 Cenários de Teste

### ✅ Cenário 1: Agendamento com Antecedência (Normal)

```
Agora: 21/11 08:00
Criar consulta para: 22/11 14:00

Resultado:
- Lembrete 24h: 21/11 14:00 → ✅ Status: pendente (será enviado)
- Lembrete 4h: 22/11 10:00 → ✅ Status: pendente (será enviado)
```

### ❌ Cenário 2: Agendamento de Última Hora (Esperado não enviar)

```
Agora: 21/11 23:23
Criar consulta para: 21/11 00:30 (madrugada)

Resultado:
- Lembrete 24h: 20/11 00:30 → ❌ Status: nao_criado (JÁ PASSOU)
- Lembrete 4h: 20/11 20:30 → ❌ Status: nao_criado (JÁ PASSOU)

⚠️ ISSO É CORRETO! O sistema não deve enviar lembretes para agendamentos feitos após o horário.
```

---

## 🔧 Como Testar o Sistema

### Opção 1: Teste Real (Recomendado)

Crie um agendamento **com antecedência suficiente**:

```sql
-- Exemplo: Agendar para daqui 2 dias às 14h
INSERT INTO agendamentos (
    data_hora,
    paciente_id,
    profissional_id,
    tipo_servico_id,
    status_consulta_id,
    status_pagamento_id,
    agendado_por,
    empresa_fatura
) VALUES (
    (CURRENT_DATE + INTERVAL '2 days' + INTERVAL '14 hours')::timestamptz,
    'uuid_paciente',
    'uuid_profissional',
    'uuid_tipo_servico',
    'uuid_status_consulta',
    'uuid_status_pagamento',
    'uuid_agendador',
    'uuid_empresa'
);

-- ✅ Lembretes são criados AUTOMATICAMENTE pelo trigger!
-- Não precisa esperar o cron ou executar nada manualmente

-- Verificar lembretes criados (INSTANTANEAMENTE)
SELECT
    tipo_lembrete,
    status,
    data_hora_lembrete_calculada,
    data_hora_consulta,
    created_at,
    EXTRACT(EPOCH FROM (now() - created_at)) as segundos_apos_agendamento
FROM lembretes_consulta
WHERE agendamento_id = 'uuid_do_agendamento_criado'
ORDER BY tipo_lembrete;

-- Resultado esperado: lembretes criados em < 1 segundo!
```

### Opção 2: Teste Forçado (Para Debug)

Use a função auxiliar para forçar disparo imediato:

```sql
-- 1. Criar agendamento (qualquer horário)
-- (inserir agendamento normalmente)

-- 2. Forçar disparo dos lembretes
SELECT * FROM forcar_lembrete_para_teste('uuid_do_agendamento');

-- 3. Verificar webhook criado
SELECT
    evento,
    status,
    payload->'data'->>'tipo_lembrete' as tipo,
    payload->'data'->'responsavel_legal'->>'nome' as responsavel,
    payload->'data'->'responsavel_legal'->>'telefone' as telefone
FROM webhook_queue
WHERE evento = 'appointment_reminder'
ORDER BY created_at DESC
LIMIT 5;
```

---

## 📊 Queries Úteis para Debug

### Ver Status dos Lembretes de um Agendamento

```sql
SELECT
    lc.tipo_lembrete,
    lc.status,
    lc.data_hora_consulta,
    lc.data_hora_lembrete_calculada,
    lc.data_hora_lembrete_enviado,
    lc.erro,
    now() as horario_atual,
    CASE
        WHEN lc.data_hora_lembrete_calculada <= now() AND lc.status = 'pendente'
            THEN '⚠️ DEVERIA TER SIDO PROCESSADO'
        WHEN lc.data_hora_lembrete_calculada > now() AND lc.status = 'pendente'
            THEN '✅ AGUARDANDO HORÁRIO'
        WHEN lc.status = 'enviado'
            THEN '✅ ENVIADO COM SUCESSO'
        WHEN lc.status = 'nao_criado'
            THEN '❌ NÃO CRIADO (AGENDAMENTO TARDIO)'
        ELSE lc.status
    END as analise
FROM lembretes_consulta lc
WHERE lc.agendamento_id = 'UUID_DO_AGENDAMENTO'
ORDER BY lc.tipo_lembrete;
```

### Ver Últimos Webhooks de Lembrete Enviados

```sql
SELECT
    wq.evento,
    wq.status,
    wq.tentativas,
    wq.payload->'data'->>'tipo_lembrete' as tipo_lembrete,
    wq.payload->'data'->'paciente'->>'nome' as paciente,
    wq.payload->'data'->'responsavel_legal'->>'nome' as responsavel,
    wq.payload->'data'->'responsavel_legal'->>'telefone' as telefone,
    wq.payload->'data'->>'data_hora' as consulta_data_hora,
    wq.created_at as webhook_criado_em,
    wq.processado_em
FROM webhook_queue wq
WHERE wq.evento = 'appointment_reminder'
ORDER BY wq.created_at DESC
LIMIT 10;
```

### Verificar Status do Cron Job

```sql
SELECT
    jobid,
    jobname,
    schedule,
    active,
    CASE
        WHEN active THEN '✅ ATIVO'
        ELSE '❌ INATIVO'
    END as status
FROM cron.job
WHERE jobname = 'processar-lembretes-consulta';
```

### Ver Lembretes Pendentes nas Próximas Horas

```sql
SELECT
    lc.tipo_lembrete,
    lc.data_hora_lembrete_calculada,
    lc.data_hora_consulta,
    EXTRACT(EPOCH FROM (lc.data_hora_lembrete_calculada - now())) / 60 as minutos_ate_envio,
    p.nome as paciente_nome,
    resp.nome as responsavel_nome,
    resp.telefone as responsavel_telefone
FROM lembretes_consulta lc
JOIN agendamentos a ON a.id = lc.agendamento_id
JOIN pessoas p ON p.id = a.paciente_id
LEFT JOIN pessoas resp ON resp.id = (
    SELECT responsavel_legal_id
    FROM vw_agendamentos_completos
    WHERE id = a.id
)
WHERE lc.status = 'pendente'
AND lc.data_hora_lembrete_calculada BETWEEN now() AND now() + INTERVAL '24 hours'
ORDER BY lc.data_hora_lembrete_calculada;
```

---

## 🐛 Troubleshooting

### Problema: "Lembrete não foi enviado"

**Checklist:**

1. **Verificar se horário já passou:**

   ```sql
   SELECT
       status,
       data_hora_lembrete_calculada,
       now() as horario_atual,
       data_hora_lembrete_calculada > now() as ainda_nao_passou
   FROM lembretes_consulta
   WHERE agendamento_id = 'UUID';
   ```

2. **Verificar se está marcado como `nao_criado`:**
   - Isso é **esperado** se agendamento foi feito após horário do lembrete
   - Use função `forcar_lembrete_para_teste()` para testes

3. **Verificar se cron está ativo:**

   ```sql
   SELECT * FROM cron.job WHERE jobname = 'processar-lembretes-consulta';
   ```

4. **Processar manualmente:**

   ```sql
   SELECT * FROM processar_lembretes_consulta();
   ```

5. **Ver erros:**
   ```sql
   SELECT erro FROM lembretes_consulta
   WHERE status = 'erro'
   ORDER BY updated_at DESC
   LIMIT 5;
   ```

---

## ⏰ Tabela de Horários (Referência Rápida)

| Horário Consulta | Lembrete 24h | Lembrete 4h     | Regra Aplicada     |
| ---------------- | ------------ | --------------- | ------------------ |
| 00:30            | -1 dia 00:30 | -1 dia 20:30    | 4h padrão          |
| 08:00            | -1 dia 08:00 | 07:00 mesmo dia | **Regra especial** |
| 09:00            | -1 dia 09:00 | 07:00 mesmo dia | **Regra especial** |
| 10:00            | -1 dia 10:00 | 08:00 mesmo dia | **Regra especial** |
| 11:00            | -1 dia 11:00 | 08:00 mesmo dia | **Regra especial** |
| 12:00            | -1 dia 12:00 | 08:00 mesmo dia | **Regra especial** |
| 13:00            | -1 dia 13:00 | 09:00 mesmo dia | 4h padrão          |
| 14:00            | -1 dia 14:00 | 10:00 mesmo dia | 4h padrão          |
| 16:00            | -1 dia 16:00 | 12:00 mesmo dia | 4h padrão          |

---

## 📞 Payload do Webhook

O webhook enviado contém:

```json
{
  "tipo": "appointment_reminder",
  "data": {
    "lembrete_id": "uuid",
    "tipo_lembrete": "4h_antes" | "24h_antes",
    "agendamento_id": "uuid",
    "data_hora": "2025-11-21T00:30:00+00:00",
    "responsavel_legal": {
      "nome": "Nome do Responsável",
      "telefone": 556181446666,
      "email": "email@example.com"
    },
    "paciente": { ... },
    "profissional": { ... },
    "tipo_servico": { ... },
    "local_atendimento": { ... }
  }
}
```

**⚠️ IMPORTANTE:**

- Enviar mensagem para `responsavel_legal.telefone` (NÃO `paciente.telefone`)
- Horário em `data_hora` está em formato "Brasília mascarado como UTC+0"

---

## ✅ Checklist de Teste Completo

- [ ] Criar agendamento com 2+ dias de antecedência
- [ ] Verificar se 2 lembretes foram criados com status `pendente`
- [ ] Aguardar cron processar (máx 5 min) OU processar manualmente
- [ ] Verificar webhook na `webhook_queue` com status `pendente`
- [ ] Confirmar que lembrete mudou para status `enviado`
- [ ] Validar payload contém todos os campos necessários
- [ ] Confirmar que `responsavel_legal.telefone` está presente

---

**Última atualização:** 20/11/2025
