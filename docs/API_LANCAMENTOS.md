# API de Lançamentos Financeiros - Exemplos de Uso

## 📋 Informações da API

**URL Base:** `https://jqegoentcusnbcykgtxg.supabase.co`  
**API Key (anon):** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZWdvZW50Y3VzbmJjeWtndHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMTI5MTgsImV4cCI6MjA2NzU4ODkxOH0.Fm5yqwPUeGRPriONRXaOZ8T7tySeebfCIMYb9Hx_Y6I`

---

## 🚀 Criar Pré-Lançamento (Para IA/n8n)

### Lançamento Simples (1 item)

```bash
curl -X POST 'https://jqegoentcusnbcykgtxg.supabase.co/rest/v1/lancamentos_financeiros' \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZWdvZW50Y3VzbmJjeWtndHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMTI5MTgsImV4cCI6MjA2NzU4ODkxOH0.Fm5yqwPUeGRPriONRXaOZ8T7tySeebfCIMYb9Hx_Y6I" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZWdvZW50Y3VzbmJjeWtndHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMTI5MTgsImV4cCI6MjA2NzU4ODkxOH0.Fm5yqwPUeGRPriONRXaOZ8T7tySeebfCIMYb9Hx_Y6I" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "tipo_lancamento": "despesa",
    "numero_documento": "NF-12345",
    "data_emissao": "2024-11-09",
    "data_competencia": "2024-11-09",
    "categoria_contabil_id": "49149948-a1b7-4343-af47-dda7657384ab",
    "descricao": "Compra de materiais descartáveis",
    "valor_total": 150.50,
    "quantidade_parcelas": 1,
    "eh_divisao_socios": true,
    "status_lancamento": "pre_lancamento",
    "origem_lancamento": "api",
    "dados_ia": {
      "confidence": 0.95,
      "ocr_text": "Nota Fiscal 12345...",
      "provider": "OpenAI GPT-4"
    }
  }'
```

### Lançamento com Múltiplos Itens

**Passo 1:** Criar o lançamento principal

```bash
curl -X POST 'https://jqegoentcusnbcykgtxg.supabase.co/rest/v1/lancamentos_financeiros?select=id' \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZWdvZW50Y3VzbmJjeWtndHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMTI5MTgsImV4cCI6MjA2NzU4ODkxOH0.Fm5yqwPUeGRPriONRXaOZ8T7tySeebfCIMYb9Hx_Y6I" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZWdvZW50Y3VzbmJjeWtndHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMTI5MTgsImV4cCI6MjA2NzU4ODkxOH0.Fm5yqwPUeGRPriONRXaOZ8T7tySeebfCIMYb9Hx_Y6I" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "tipo_lancamento": "despesa",
    "numero_documento": "NF-98765",
    "data_emissao": "2024-11-09",
    "data_competencia": "2024-11-09",
    "categoria_contabil_id": "49149948-a1b7-4343-af47-dda7657384ab",
    "descricao": "Compra de produtos de limpeza",
    "observacoes": "Nota processada por IA",
    "valor_total": 350.00,
    "quantidade_parcelas": 3,
    "eh_divisao_socios": true,
    "status_lancamento": "pre_lancamento",
    "origem_lancamento": "api",
    "dados_ia": {
      "confidence": 0.92,
      "extracted_items": 5,
      "processing_time": "2.3s"
    }
  }'
```

**Passo 2:** Adicionar itens do lançamento (use o ID retornado)

```bash
# Substitua LANCAMENTO_ID_AQUI pelo ID retornado no passo 1
curl -X POST 'https://jqegoentcusnbcykgtxg.supabase.co/rest/v1/lancamento_itens' \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZWdvZW50Y3VzbmJjeWtndHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMTI5MTgsImV4cCI6MjA2NzU4ODkxOH0.Fm5yqwPUeGRPriONRXaOZ8T7tySeebfCIMYb9Hx_Y6I" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZWdvZW50Y3VzbmJjeWtndHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMTI5MTgsImV4cCI6MjA2NzU4ODkxOH0.Fm5yqwPUeGRPriONRXaOZ8T7tySeebfCIMYb9Hx_Y6I" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d '[
    {
      "lancamento_id": "LANCAMENTO_ID_AQUI",
      "item_numero": 1,
      "descricao": "Detergente neutro 5L",
      "quantidade": 10,
      "valor_unitario": 12.50,
      "valor_total": 125.00,
      "categoria_contabil_id": "a3609a1d-c3b3-4ae2-b32e-20b33ea1eedb"
    },
    {
      "lancamento_id": "LANCAMENTO_ID_AQUI",
      "item_numero": 2,
      "descricao": "Álcool gel 70% - 500ml",
      "quantidade": 20,
      "valor_unitario": 8.50,
      "valor_total": 170.00,
      "categoria_contabil_id": "49149948-a1b7-4343-af47-dda7657384ab"
    },
    {
      "lancamento_id": "LANCAMENTO_ID_AQUI",
      "item_numero": 3,
      "descricao": "Papel toalha - pacote com 4",
      "quantidade": 5,
      "valor_unitario": 11.00,
      "valor_total": 55.00,
      "categoria_contabil_id": "49149948-a1b7-4343-af47-dda7657384ab"
    }
  ]'
```

---

## 🔄 Fluxo Completo de Processamento IA

### Script n8n Completo (Python/JavaScript)

```javascript
// 1. Extrair dados da nota fiscal com IA
const notaFiscal = await processarNotaComIA(imagemOuPDF);

// 2. Criar lançamento
const lancamento = await fetch(
  'https://jqegoentcusnbcykgtxg.supabase.co/rest/v1/lancamentos_financeiros?select=id',
  {
    method: 'POST',
    headers: {
      apikey:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZWdvZW50Y3VzbmJjeWtndHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMTI5MTgsImV4cCI6MjA2NzU4ODkxOH0.Fm5yqwPUeGRPriONRXaOZ8T7tySeebfCIMYb9Hx_Y6I',
      Authorization:
        'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZWdvZW50Y3VzbmJjeWtndHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMTI5MTgsImV4cCI6MjA2NzU4ODkxOH0.Fm5yqwPUeGRPriONRXaOZ8T7tySeebfCIMYb9Hx_Y6I',
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      tipo_lancamento: notaFiscal.tipo,
      numero_documento: notaFiscal.numero,
      data_emissao: notaFiscal.dataEmissao,
      data_competencia: notaFiscal.dataCompetencia,
      categoria_contabil_id: notaFiscal.categoriaId,
      descricao: notaFiscal.descricao,
      valor_total: notaFiscal.valorTotal,
      quantidade_parcelas: notaFiscal.parcelas || 1,
      eh_divisao_socios: true,
      status_lancamento: 'pre_lancamento',
      origem_lancamento: 'api',
      dados_ia: {
        confidence: notaFiscal.confidence,
        model: 'gpt-4-vision',
        timestamp: new Date().toISOString(),
      },
    }),
  }
).then((r) => r.json());

const lancamentoId = lancamento[0].id;

// 3. Criar itens do lançamento
await fetch(
  'https://jqegoentcusnbcykgtxg.supabase.co/rest/v1/lancamento_itens',
  {
    method: 'POST',
    headers: {
      apikey:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZWdvZW50Y3VzbmJjeWtndHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMTI5MTgsImV4cCI6MjA2NzU4ODkxOH0.Fm5yqwPUeGRPriONRXaOZ8T7tySeebfCIMYb9Hx_Y6I',
      Authorization:
        'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZWdvZW50Y3VzbmJjeWtndHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMTI5MTgsImV4cCI6MjA2NzU4ODkxOH0.Fm5yqwPUeGRPriONRXaOZ8T7tySeebfCIMYb9Hx_Y6I',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(
      notaFiscal.itens.map((item, index) => ({
        lancamento_id: lancamentoId,
        item_numero: index + 1,
        descricao: item.descricao,
        quantidade: item.quantidade,
        valor_unitario: item.valorUnitario,
        valor_total: item.valorTotal,
        categoria_contabil_id: item.categoriaId || null,
      }))
    ),
  }
);
```

---

## 📝 Exemplos CURL Detalhados

### 1. Pré-Lançamento de Despesa (IA)

```bash
curl -X POST 'https://jqegoentcusnbcykgtxg.supabase.co/rest/v1/lancamentos_financeiros' \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZWdvZW50Y3VzbmJjeWtndHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMTI5MTgsImV4cCI6MjA2NzU4ODkxOH0.Fm5yqwPUeGRPriONRXaOZ8T7tySeebfCIMYb9Hx_Y6I" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZWdvZW50Y3VzbmJjeWtndHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMTI5MTgsImV4cCI6MjA2NzU4ODkxOH0.Fm5yqwPUeGRPriONRXaOZ8T7tySeebfCIMYb9Hx_Y6I" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "tipo_lancamento": "despesa",
    "numero_documento": "NF-2024-001234",
    "data_emissao": "2024-11-09",
    "data_competencia": "2024-11-01",
    "categoria_contabil_id": "49149948-a1b7-4343-af47-dda7657384ab",
    "descricao": "Materiais descartáveis - Novembro/2024",
    "observacoes": "Processado automaticamente via IA",
    "valor_total": 850.00,
    "quantidade_parcelas": 1,
    "eh_divisao_socios": true,
    "status_lancamento": "pre_lancamento",
    "origem_lancamento": "api",
    "dados_ia": {
      "model": "gpt-4-vision-preview",
      "confidence": 0.95,
      "extracted_at": "2024-11-09T10:30:00Z",
      "ocr_provider": "OpenAI"
    }
  }'
```

### 2. Pré-Lançamento Parcelado

```bash
curl -X POST 'https://jqegoentcusnbcykgtxg.supabase.co/rest/v1/lancamentos_financeiros' \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZWdvZW50Y3VzbmJjeWtndHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMTI5MTgsImV4cCI6MjA2NzU4ODkxOH0.Fm5yqwPUeGRPriONRXaOZ8T7tySeebfCIMYb9Hx_Y6I" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZWdvZW50Y3VzbmJjeWtndHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMTI5MTgsImV4cCI6MjA2NzU4ODkxOH0.Fm5yqwPUeGRPriONRXaOZ8T7tySeebfCIMYb9Hx_Y6I" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "tipo_lancamento": "despesa",
    "numero_documento": "BOLETO-2024-5678",
    "data_emissao": "2024-11-09",
    "data_competencia": "2024-11-01",
    "categoria_contabil_id": "754efc51-7a5a-41cb-afa7-23222ba97df8",
    "descricao": "Energia Elétrica - Novembro/2024",
    "valor_total": 1200.00,
    "quantidade_parcelas": 12,
    "eh_divisao_socios": true,
    "status_lancamento": "pre_lancamento",
    "origem_lancamento": "api"
  }'
```

### 3. Receita (Pagamento de Cliente)

```bash
curl -X POST 'https://jqegoentcusnbcykgtxg.supabase.co/rest/v1/lancamentos_financeiros' \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZWdvZW50Y3VzbmJjeWtndHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMTI5MTgsImV4cCI6MjA2NzU4ODkxOH0.Fm5yqwPUeGRPriONRXaOZ8T7tySeebfCIMYb9Hx_Y6I" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZWdvZW50Y3VzbmJjeWtndHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMTI5MTgsImV4cCI6MjA2NzU4ODkxOH0.Fm5yqwPUeGRPriONRXaOZ8T7tySeebfCIMYb9Hx_Y6I" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "tipo_lancamento": "receita",
    "numero_documento": "REC-2024-9999",
    "data_emissao": "2024-11-09",
    "data_competencia": "2024-11-01",
    "categoria_contabil_id": "1942118f-cb84-483b-baab-ccb7da488652",
    "descricao": "Receita de consultas - Novembro",
    "valor_total": 5000.00,
    "quantidade_parcelas": 1,
    "eh_divisao_socios": false,
    "status_lancamento": "pre_lancamento",
    "origem_lancamento": "api"
  }'
```

---

## 🎯 Campos Importantes

### Campos Obrigatórios:

- `tipo_lancamento`: "despesa" ou "receita"
- `data_emissao`: Data no formato "YYYY-MM-DD"
- `data_competencia`: Data no formato "YYYY-MM-DD"
- `categoria_contabil_id`: UUID da categoria (veja IDs abaixo)
- `descricao`: Texto descritivo
- `valor_total`: Número decimal

### Campos Recomendados para Pré-Lançamento:

- `status_lancamento`: **"pre_lancamento"** (para validação posterior)
- `origem_lancamento`: **"api"** (identifica origem)
- `dados_ia`: JSON com metadados da IA

### Campos de Divisão de Pagamento (escolha uma opção):

**Opção 1: Dividir entre sócios (conforme percentuais configurados)**

```json
{
  "eh_divisao_socios": true,
  "pessoa_responsavel_id": null
}
```

Sistema aplica automaticamente os percentuais da tabela `configuracao_divisao_socios`:

- Bruna: 50%
- Flavia: 50%

**Opção 2: Lançamento individual (100% para uma pessoa)**

```json
{
  "eh_divisao_socios": false,
  "pessoa_responsavel_id": "UUID_DA_PESSOA"
}
```

IDs das sócias:

- Bruna: `c4883f76-d010-4fb4-ac5b-248914e56e6e`
- Flavia: `5662baf5-6e2a-4643-98e5-395d69baef62`

### Campos Opcionais:

- `numero_documento`: Número da NF ou documento
- `observacoes`: Observações adicionais
- `fornecedor_id`: UUID do fornecedor (se cadastrado)
- `quantidade_parcelas`: Número de parcelas (padrão: 1)

---

## 📚 IDs de Categorias Principais

### Custos Fixos

- `754efc51-7a5a-41cb-afa7-23222ba97df8` - Energia Elétrica
- `1b04550a-c476-427f-bd10-d1771f0b092d` - Internet e Telefonia
- `d074ad03-e1b1-4df3-b10e-9985f816cda8` - Condomínio
- `64283f46-9048-4ba8-8a26-75ed79d38e14` - Aluguel

### Despesas Operacionais

- `49149948-a1b7-4343-af47-dda7657384ab` - Materiais descartáveis
- `70a4d7e0-92f7-4aea-b272-c6a60dd61e2f` - Material de Escritório
- `389c7182-c7a1-499d-8185-d9060b411c13` - Serviços de transporte

### Despesas Tributárias

- `a83dbe05-e098-49e2-a31a-704053e89a86` - (Grupo principal)

---

## 🧪 Exemplos Práticos

### Lançamento Dividido entre Sócios (50/50)

```bash
curl -X POST 'https://jqegoentcusnbcykgtxg.supabase.co/rest/v1/lancamentos_financeiros' \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZWdvZW50Y3VzbmJjeWtndHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMTI5MTgsImV4cCI6MjA2NzU4ODkxOH0.Fm5yqwPUeGRPriONRXaOZ8T7tySeebfCIMYb9Hx_Y6I" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZWdvZW50Y3VzbmJjeWtndHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMTI5MTgsImV4cCI6MjA2NzU4ODkxOH0.Fm5yqwPUeGRPriONRXaOZ8T7tySeebfCIMYb9Hx_Y6I" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "tipo_lancamento": "despesa",
    "data_emissao": "2024-11-09",
    "data_competencia": "2024-11-09",
    "categoria_contabil_id": "754efc51-7a5a-41cb-afa7-23222ba97df8",
    "descricao": "Energia Elétrica - Novembro/2024",
    "valor_total": 500.00,
    "eh_divisao_socios": true,
    "pessoa_responsavel_id": null,
    "status_lancamento": "pre_lancamento",
    "origem_lancamento": "api"
  }'
```

**Resultado:** Bruna paga R$ 250,00 (50%) + Flavia paga R$ 250,00 (50%)

---

### Lançamento Individual da Bruna

```bash
curl -X POST 'https://jqegoentcusnbcykgtxg.supabase.co/rest/v1/lancamentos_financeiros' \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZWdvZW50Y3VzbmJjeWtndHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMTI5MTgsImV4cCI6MjA2NzU4ODkxOH0.Fm5yqwPUeGRPriONRXaOZ8T7tySeebfCIMYb9Hx_Y6I" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZWdvZW50Y3VzbmJjeWtndHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMTI5MTgsImV4cCI6MjA2NzU4ODkxOH0.Fm5yqwPUeGRPriONRXaOZ8T7tySeebfCIMYb9Hx_Y6I" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "tipo_lancamento": "despesa",
    "data_emissao": "2024-11-09",
    "data_competencia": "2024-11-09",
    "categoria_contabil_id": "4b2122df-c0c8-42ea-a5c4-6fa8f757e183",
    "descricao": "Contabilidade Bruna - Novembro/2024",
    "valor_total": 300.00,
    "eh_divisao_socios": false,
    "pessoa_responsavel_id": "c4883f76-d010-4fb4-ac5b-248914e56e6e",
    "status_lancamento": "pre_lancamento",
    "origem_lancamento": "api"
  }'
```

**Resultado:** Somente Bruna paga R$ 300,00 (100%)

---

### Lançamento Individual da Flavia

```bash
curl -X POST 'https://jqegoentcusnbcykgtxg.supabase.co/rest/v1/lancamentos_financeiros' \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZWdvZW50Y3VzbmJjeWtndHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMTI5MTgsImV4cCI6MjA2NzU4ODkxOH0.Fm5yqwPUeGRPriONRXaOZ8T7tySeebfCIMYb9Hx_Y6I" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZWdvZW50Y3VzbmJjeWtndHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMTI5MTgsImV4cCI6MjA2NzU4ODkxOH0.Fm5yqwPUeGRPriONRXaOZ8T7tySeebfCIMYb9Hx_Y6I" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "tipo_lancamento": "despesa",
    "data_emissao": "2024-11-09",
    "data_competencia": "2024-11-09",
    "categoria_contabil_id": "4b2122df-c0c8-42ea-a5c4-6fa8f757e183",
    "descricao": "Contabilidade Flavia - Novembro/2024",
    "valor_total": 300.00,
    "eh_divisao_socios": false,
    "pessoa_responsavel_id": "5662baf5-6e2a-4643-98e5-395d69baef62",
    "status_lancamento": "pre_lancamento",
    "origem_lancamento": "api"
  }'
```

**Resultado:** Somente Flavia paga R$ 300,00 (100%)

---

## 🧪 Testar Lançamento

```bash
# Teste rápido - Criar pré-lançamento DIVIDIDO
curl -X POST 'https://jqegoentcusnbcykgtxg.supabase.co/rest/v1/lancamentos_financeiros' \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZWdvZW50Y3VzbmJjeWtndHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMTI5MTgsImV4cCI6MjA2NzU4ODkxOH0.Fm5yqwPUeGRPriONRXaOZ8T7tySeebfCIMYb9Hx_Y6I" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZWdvZW50Y3VzbmJjeWtndHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMTI5MTgsImV4cCI6MjA2NzU4ODkxOH0.Fm5yqwPUeGRPriONRXaOZ8T7tySeebfCIMYb9Hx_Y6I" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "tipo_lancamento": "despesa",
    "data_emissao": "2024-11-09",
    "data_competencia": "2024-11-09",
    "categoria_contabil_id": "49149948-a1b7-4343-af47-dda7657384ab",
    "descricao": "Teste de lançamento via API",
    "valor_total": 100.00,
    "status_lancamento": "pre_lancamento",
    "origem_lancamento": "api",
    "eh_divisao_socios": true
  }'
```

Depois, acesse: **Financeiro > Pré-Lançamentos** para validar!

---

## 🔍 Consultar Pré-Lançamentos

```bash
curl 'https://jqegoentcusnbcykgtxg.supabase.co/rest/v1/lancamentos_financeiros?status_lancamento=eq.pre_lancamento&select=*' \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZWdvZW50Y3VzbmJjeWtndHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMTI5MTgsImV4cCI6MjA2NzU4ODkxOH0.Fm5yqwPUeGRPriONRXaOZ8T7tySeebfCIMYb9Hx_Y6I" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZWdvZW50Y3VzbmJjeWtndHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMTI5MTgsImV4cCI6MjA2NzU4ODkxOH0.Fm5yqwPUeGRPriONRXaOZ8T7tySeebfCIMYb9Hx_Y6I"
```

---

## 🛡️ Segurança

**Atenção:** A API key `anon` exposta acima tem permissões limitadas definidas pelas políticas RLS (Row Level Security) do Supabase.

Para operações mais sensíveis, considere:

- Criar uma **service_role_key** (não expor em cliente)
- Usar **Edge Function** como proxy
- Implementar autenticação adicional

---

## 📖 Mais Informações

Consulte também:

- `SISTEMA_FINANCEIRO_COMPLETO.md` - Documentação completa
- `FINANCEIRO_SQL_QUERIES.md` - Queries úteis
- Supabase REST API: https://supabase.com/docs/guides/api
