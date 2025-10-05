# 📄 Plano de Implementação: Geração de PDF do Contrato

## ✅ Implementado

### 1. Página de Sucesso

- ✅ **PatientRegistrationSuccessPage** criada
- ✅ Mensagem de sucesso com ícone animado
- ✅ Informações sobre próximos passos
- ✅ Botão para baixar PDF do contrato
- ✅ Botão para voltar à página inicial
- ✅ Rota configurada: `/cadastro-paciente/sucesso`

### 2. Edge Function `generate-contract-pdf`

- ✅ Busca dados do contrato no Supabase
- ✅ Gera PDF usando jsPDF
- ✅ **Cabeçalho**: Logo `nome-logo-respira-kids.png`
- ✅ **Marca d'água**: Logo `logo-respira-kids.png` com opacidade 0.1
- ✅ **Rodapé**: Texto formatado com nome do contratante e data (dd/mm/aaaa)
- ✅ Numeração de páginas
- ✅ Quebra automática de páginas
- ✅ Remove formatação Markdown do conteúdo

### 3. Fluxo de Redirecionamento

- ✅ Após aceite do contrato, redireciona para página de sucesso
- ✅ Passa parâmetros via URL: `patient_name`, `patient_id`, `contract_id`

### 4. Storage de Logos

- ✅ Bucket `public-assets` criado no Supabase
- ⚠️ **AÇÃO MANUAL**: Upload das logos necessário (ver `UPLOAD_LOGOS.md`)

## 📋 Estrutura do PDF

### Cabeçalho (em todas as páginas)

```
┌─────────────────────────────────────┐
│  [Logo Nome Respira Kids]           │
│                                     │
└─────────────────────────────────────┘
```

### Marca d'água (centralizada)

```
        [Logo Respira Kids]
         (opacidade 10%)
```

### Rodapé (em todas as páginas)

```
┌─────────────────────────────────────┐
│ Página integrante do Contrato de   │
│ Prestação de Serviços de            │
│ Fisioterapia que entre si celebram  │
│ {{contratante}} e BC FISIO KIDS     │
│ LTDA. {{hoje}}                      │
│                                     │
│             [Número Página]         │
└─────────────────────────────────────┘
```

## 🎨 Especificações Técnicas

### Dimensões do PDF

- **Formato**: A4 (210mm x 297mm)
- **Orientação**: Retrato
- **Margens**: 15mm em todos os lados

### Logos

- **Cabeçalho**: 60mm x 15mm (posição: 15mm, 10mm)
- **Marca d'água**: 80mm x 80mm (centralizada)

### Tipografia

- **Conteúdo**: 10pt, cor preta
- **Rodapé**: 8pt, cor cinza (#646464)
- **Espaçamento entre linhas**: 5mm
- **Espaçamento entre parágrafos**: 7mm

## 🔗 URLs Utilizadas

### Supabase Edge Function

```
POST {SUPABASE_URL}/functions/v1/generate-contract-pdf
```

**Payload:**

```json
{
  "contractId": "uuid-do-contrato",
  "patientName": "Nome do Paciente"
}
```

**Response:**

- **Content-Type**: `application/pdf`
- **Content-Disposition**: `attachment; filename="Contrato_Nome_Paciente_DD-MM-AAAA.pdf"`

### Storage URLs

```
{SUPABASE_URL}/storage/v1/object/public/public-assets/nome-logo-respira-kids.png
{SUPABASE_URL}/storage/v1/object/public/public-assets/logo-respira-kids.png
```

## 🚀 Próximos Passos

### FASE 4: Envio Automático do PDF

- [ ] Webhook para enviar PDF via WhatsApp
- [ ] Email com PDF anexado
- [ ] Atualizar `arquivo_url` na tabela `user_contracts`

### FASE 5: Assinatura Digital

- [ ] Implementar assinatura digital no PDF
- [ ] Timestamp de assinatura
- [ ] Validação de integridade

### Melhorias Futuras

- [ ] Cache de logos (evitar download repetido)
- [ ] Otimização de performance
- [ ] Suporte a diferentes templates de contrato
- [ ] Personalização de cores e fontes
- [ ] Preview do PDF antes do download

## 📝 Notas Importantes

1. **Upload Manual de Logos**: As logos precisam ser enviadas manualmente para o Supabase Storage. Ver instruções em `UPLOAD_LOGOS.md`.

2. **Formatação de Data**: A data é formatada automaticamente como `dd/mm/aaaa` no rodapé do PDF.

3. **Markdown**: O conteúdo do contrato é processado para remover formatação Markdown básica (headers, bold, italic) antes de ser renderizado no PDF.

4. **Quebra de Páginas**: O sistema detecta automaticamente quando o conteúdo ultrapassa o limite da página e cria uma nova página com cabeçalho, marca d'água e rodapé.

5. **Tamanho do Arquivo**: PDFs gerados têm tipicamente entre 100KB e 500KB, dependendo do tamanho do contrato.
