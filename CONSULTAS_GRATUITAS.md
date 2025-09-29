# Consultas Gratuitas (Valor Zero)

## Resumo

O sistema **PERMITE** consultas com valor zero (consultas gratuitas), mas existem regras específicas sobre como isso funciona com comissões e cobranças.

## Como Funciona

### 1. Cadastro de Consultas

- ✅ **Permitido**: Criar agendamentos com `valor_servico = 0`
- ✅ **Banco de Dados**: A coluna `agendamentos.valor_servico` aceita zero (default: 0)
- ✅ **Interface**: O formulário permite inserir R$ 0,00

### 2. Comissão de Profissionais

A comissão é calculada pela view `vw_agendamentos_completos` da seguinte forma:

#### Comissão **FIXA**

```sql
comissao_valor_calculado = valor_fixo
```

- ✅ O profissional **RECEBE** a comissão fixa mesmo que a consulta seja gratuita
- Exemplo: Consulta gratuita (R$ 0), comissão fixa de R$ 50 → Profissional recebe R$ 50

#### Comissão **PERCENTUAL**

```sql
comissao_valor_calculado = (valor_servico × valor_percentual) / 100
```

- ⚠️ O profissional **NÃO RECEBE** comissão se o valor da consulta for zero
- Exemplo: Consulta gratuita (R$ 0), comissão 30% → Profissional recebe R$ 0 (30% de 0 = 0)

#### Sem Comissão Configurada

```sql
comissao_valor_calculado = valor_servico
```

- O valor calculado será igual ao valor do serviço (R$ 0)

### 3. Geração de Cobranças (ASAAS)

⛔ **NÃO É POSSÍVEL** gerar cobrança para consultas gratuitas:

- A API do ASAAS requer `valor > 0`
- O sistema bloqueia a seleção de consultas gratuitas ao gerar cobranças
- **Mensagem**: "Não é possível gerar cobrança para X consulta(s) gratuita(s). Por favor, desmarque as consultas com valor R$ 0,00 antes de gerar a cobrança."

### 4. Emissão de Notas Fiscais

⛔ **NÃO É POSSÍVEL** emitir nota fiscal para consultas gratuitas:

- A API do ASAAS requer `valor > 0` para NFe
- **Mensagem**: "Valor deve ser maior que zero para emitir nota fiscal no ASAAS"

## Casos de Uso

### Caso 1: Consulta Cortesia (Comissão Fixa)

```
Valor da Consulta: R$ 0,00
Tipo Comissão: Fixo
Valor Comissão: R$ 50,00
---
✅ Consulta criada com sucesso
✅ Profissional recebe R$ 50,00 de comissão
⛔ Não pode gerar cobrança no ASAAS
⛔ Não pode emitir NFe
```

### Caso 2: Consulta Social (Comissão Percentual)

```
Valor da Consulta: R$ 0,00
Tipo Comissão: Percentual (30%)
---
✅ Consulta criada com sucesso
⚠️ Profissional recebe R$ 0,00 de comissão (30% de 0 = 0)
⛔ Não pode gerar cobrança no ASAAS
⛔ Não pode emitir NFe
```

### Caso 3: Consulta Paga Normalmente (para comparação)

```
Valor da Consulta: R$ 200,00
Tipo Comissão: Percentual (30%)
---
✅ Consulta criada com sucesso
✅ Profissional recebe R$ 60,00 de comissão (30% de 200)
✅ Pode gerar cobrança no ASAAS
✅ Pode emitir NFe
```

## Recomendações

### Para Consultas Gratuitas com Comissão

- Use **comissão fixa** se quiser remunerar o profissional mesmo em consultas gratuitas
- Use **comissão percentual** se a remuneração deve ser proporcional ao valor cobrado

### Para Relatórios e Métricas

- Consultas gratuitas aparecem normalmente nos relatórios
- O faturamento considera o valor zero corretamente
- A comissão é calculada conforme configuração (fixa ou percentual)

## Implementação Técnica

### Validações Mantidas (Corretas)

- ✅ `asaas-create-payment/index.ts`: Bloqueia cobrança com valor ≤ 0
- ✅ `asaas-schedule-invoice/index.ts`: Bloqueia NFe com valor ≤ 0
- ✅ `PatientMetricsWithConsultations.tsx`: Bloqueia seleção de consultas gratuitas para cobrança

### View de Comissão

```sql
-- Trecho da vw_agendamentos_completos
CASE
    WHEN (cp.tipo_recebimento = 'fixo'::text)
        THEN cp.valor_fixo
    WHEN (cp.tipo_recebimento = 'percentual'::text)
        THEN ((a.valor_servico * cp.valor_percentual) / 100)
    ELSE
        a.valor_servico
END AS comissao_valor_calculado
```

### Comentário no Banco de Dados

```sql
COMMENT ON COLUMN agendamentos.valor_servico IS
  'Valor do serviço prestado. Aceita valor zero para consultas gratuitas.
   Comissão: se fixo, profissional recebe valor fixo independente;
   se percentual, calcula sobre este valor (zero resulta em comissão zero)';
```

## Arquivos Modificados

1. `src/components/composed/PatientMetricsWithConsultations.tsx` - Validação de consultas gratuitas
2. `supabase/functions/asaas-create-payment/index.ts` - AI dev note sobre validação
3. `supabase/functions/asaas-schedule-invoice/index.ts` - AI dev note sobre validação
4. Banco de dados: Comentário na coluna `agendamentos.valor_servico`
