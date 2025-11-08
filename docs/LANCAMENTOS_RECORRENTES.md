# Sistema de Lançamentos Recorrentes

## Visão Geral

O sistema de lançamentos recorrentes permite automatizar a criação de despesas e receitas que se repetem periodicamente (mensalmente, bimestralmente, etc).

## Como Funciona

### 1. Cadastro de Lançamento Recorrente

- Acesse **Financeiro > Recorrentes**
- Clique em "Novo Recorrente"
- Configure:
  - **Descrição**: Nome do lançamento (ex: "Aluguel", "Energia")
  - **Valor**: Valor fixo mensal
  - **Frequência**: Mensal, bimestral, trimestral, semestral ou anual
  - **Dia de vencimento**: Dia do mês (1-31)
  - **Ajustar para dia útil**: Se cair no fim de semana, move para segunda-feira
  - **Período**: Data de início e fim (opcional)
  - **Divisão entre sócios**: Se o custo é dividido

### 2. Processamento Automático

O sistema processa automaticamente os lançamentos recorrentes:

- **Horário**: Diariamente às 3h da manhã (horário de Brasília)
- **Ação**: Cria lançamentos financeiros e contas a pagar para recorrências vencidas
- **Status**: Lançamentos são criados como "Validados"

### 3. Processamento Manual

Admin pode processar manualmente a qualquer momento:

- Acesse **Financeiro > Recorrentes > Histórico de Processamento**
- Clique em "Processar Agora"

### 4. Monitoramento

- **Histórico**: Visualize logs de todas as execuções
- **Estatísticas**: Acompanhe lançamentos criados e erros
- **Detalhes**: Veja quais lançamentos foram criados em cada execução

## Configuração do Cron Job no Supabase

### Opção 1: Via Dashboard do Supabase (Recomendado)

1. Acesse o [Supabase Dashboard](https://app.supabase.com)
2. Vá para **Database > Extensions**
3. Habilite a extensão `pg_cron`
4. Vá para **SQL Editor** e execute:

```sql
-- Criar o cron job
SELECT cron.schedule(
  'processar-lancamentos-recorrentes',
  '0 6 * * *', -- 6h UTC = 3h Brasília
  $$SELECT public.processar_lancamentos_recorrentes_manual();$$
);

-- Verificar jobs criados
SELECT * FROM cron.job;
```

### Opção 2: Via Edge Functions + Cron Trigger

1. No Supabase Dashboard, vá para **Edge Functions**
2. Crie um cron trigger que chame:
   - **Function**: `processar-lancamentos-recorrentes`
   - **Schedule**: `0 6 * * *`
   - **HTTP Method**: POST

## Tabela de Dados para Integração n8n

Para enviar dados de notas fiscais processadas via n8n, use a estrutura:

### Endpoint

`POST https://seu-projeto.supabase.co/rest/v1/lancamentos_financeiros`

### Headers

```json
{
  "apikey": "sua-api-key",
  "Authorization": "Bearer sua-api-key",
  "Content-Type": "application/json",
  "Prefer": "return=representation"
}
```

### Body (JSON)

```json
{
  "tipo_lancamento": "despesa",
  "numero_documento": "NF-123",
  "data_emissao": "2024-01-15",
  "data_competencia": "2024-01-15",
  "fornecedor_id": "uuid-do-fornecedor",
  "categoria_contabil_id": "uuid-da-categoria",
  "descricao": "Compra de materiais",
  "valor_total": 1500.0,
  "quantidade_parcelas": 1,
  "eh_divisao_socios": true,
  "status_lancamento": "pre_lancamento",
  "origem_lancamento": "api",
  "arquivo_url": "https://storage.url/documento.pdf"
}
```

### Inserir Itens (após criar o lançamento)

`POST https://seu-projeto.supabase.co/rest/v1/lancamento_itens`

```json
{
  "lancamento_id": "uuid-retornado",
  "item_numero": 1,
  "descricao": "Item 1",
  "quantidade": 10,
  "valor_unitario": 150.0,
  "valor_total": 1500.0,
  "categoria_contabil_id": "uuid-categoria-opcional"
}
```

## Principais Funcionalidades

### 1. Frequências Suportadas

- **Mensal**: Todo mês no mesmo dia
- **Bimestral**: A cada 2 meses
- **Trimestral**: A cada 3 meses
- **Semestral**: A cada 6 meses
- **Anual**: Uma vez por ano

### 2. Ajuste de Datas

- Se o dia não existir no mês (ex: 31 de fevereiro), usa o último dia do mês
- Opção de ajustar fins de semana para dia útil

### 3. Controles

- **Ativar/Desativar**: Pause lançamentos sem deletar
- **Data de término**: Define quando parar de gerar
- **Histórico**: Veja todos os lançamentos gerados

## Troubleshooting

### Lançamento não foi criado

1. Verifique se está ativo
2. Confirme se a data de próxima recorrência passou
3. Verifique se não tem data de término vencida
4. Consulte os logs de processamento

### Erro no processamento

1. Verifique logs em **Histórico de Processamento**
2. Confirme se fornecedor/categoria ainda existem
3. Execute processamento manual para testar

### Cron job não está executando

1. Verifique se `pg_cron` está habilitado
2. Confirme o job com: `SELECT * FROM cron.job;`
3. Verifique logs: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;`
