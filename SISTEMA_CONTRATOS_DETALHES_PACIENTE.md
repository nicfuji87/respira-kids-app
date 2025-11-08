# Sistema de Contratos nos Detalhes do Paciente

## ✅ Status: IMPLEMENTADO

Sistema de visualização e geração de contratos integrado à página de detalhes do paciente.

## 📋 Funcionalidades Implementadas

### 1. **Seção de Contrato**

- **Localização**: Abaixo das informações completas do paciente
- **Componente**: `PatientContractSection`
- **Visível apenas para**: Pacientes (não aparece para outros tipos de pessoa)

### 2. **Estados do Contrato**

#### 🚫 **Sem Contrato**

- Exibe alerta: "Este paciente não possui contrato"
- Botão "Gerar Contrato" (apenas admin/secretaria)
- Validação de campos obrigatórios:
  - ✅ Autorizações preenchidas
  - ✅ Responsável legal cadastrado
  - ✅ Responsável financeiro definido
  - ✅ Endereço cadastrado
  - ✅ Dados do paciente completos

#### ⏳ **Aguardando Assinatura**

- Badge amarelo com ícone de relógio
- Status quando `arquivo_url = 'Aguardando'` ou `null`
- Botão "Ver Contrato" para visualizar conteúdo
- Data de geração exibida

#### ✅ **Contrato Assinado**

- Badge verde com check
- Status quando `arquivo_url` contém link válido
- Botão "Ver Contrato" para visualizar
- Data de assinatura exibida

### 3. **Modal de Visualização**

- **Componente**: `ContractViewModal`
- Renderização do conteúdo com ReactMarkdown
- Formatação idêntica ao fluxo de cadastro público
- Botão "Baixar PDF":
  - Se tem URL: abre em nova aba
  - Se não tem: gera via Edge Function

### 4. **Geração de Contrato**

#### Permissões

- ✅ Apenas `admin` e `secretaria` podem gerar
- ❌ `profissional` pode apenas visualizar

#### Validações

- Verifica todos os campos obrigatórios
- Exibe lista de erros se houver dados faltando
- Não permite gerar se já existe contrato

#### Processo

1. Valida dados obrigatórios
2. Busca todos os dados necessários
3. Monta variáveis do contrato
4. Gera contrato via `generateContract()`
5. Atualiza `arquivo_url = 'Aguardando'`
6. Envia webhook para notificação
7. Exibe toast de sucesso

### 5. **Webhook de Notificação**

Quando contrato é gerado, envia para `webhook_queue`:

```json
{
  "evento": "contrato_gerado",
  "payload": {
    "contrato_id": "uuid",
    "paciente_id": "uuid",
    "paciente_nome": "string",
    "responsavel_nome": "string",
    "responsavel_telefone": "bigint",
    "responsavel_email": "string"
  }
}
```

## 🔧 Componentes Criados

### `PatientContractSection.tsx`

- Gerencia estado do contrato
- Validação de dados
- Geração de novo contrato
- Integração com webhook

### `ContractViewModal.tsx`

- Visualização do conteúdo
- Download de PDF
- Reutiliza estilos do `ContractReviewStep`

## 📊 Estrutura do Banco

### Tabela `user_contracts`

- `pessoa_id`: ID do paciente
- `arquivo_url`:
  - `null` ou `'Aguardando'`: Pendente de assinatura
  - URL válida: Contrato assinado
- `status_contrato`: `'pendente'` ou `'assinado'`
- `conteudo_final`: Texto completo do contrato
- `data_geracao`: Quando foi criado
- `data_assinatura`: Quando foi assinado

## 🔄 Fluxo de Assinatura

1. **Admin/Secretaria** gera contrato
2. **Webhook** envia link para responsável via WhatsApp
3. **Responsável** acessa link e assina digitalmente
4. **n8n** atualiza `arquivo_url` com link do PDF assinado
5. **Sistema** detecta mudança e exibe como "Assinado"

## ⚠️ Regras de Negócio

1. **Regeneração**: Não permite gerar novo contrato se já existe
2. **Permissões**: Apenas admin/secretaria podem gerar
3. **Validação**: Todos os campos obrigatórios devem estar preenchidos
4. **Webhook**: Sempre enviado após geração bem-sucedida
5. **Status**: Fica "Aguardando" até assinatura externa

## 🚀 Próximas Melhorias (Futuras)

- [ ] Histórico de contratos (versões anteriores)
- [ ] Reenvio de notificação para responsável
- [ ] Template de contrato customizável por empresa
- [ ] Assinatura digital integrada no sistema
- [ ] Dashboard de contratos pendentes

## 📝 Como Testar

1. Acesse detalhes de um paciente sem contrato
2. Verifique se aparece aviso "Este paciente não possui contrato"
3. Complete todos os dados obrigatórios do paciente
4. Clique em "Gerar Contrato" (como admin/secretaria)
5. Verifique se status muda para "Aguardando Assinatura"
6. Clique em "Ver Contrato" para visualizar conteúdo
7. Teste download de PDF

## 🐛 Troubleshooting

### "Dados incompletos" ao gerar

- Verifique autorizações em "Configurações" do paciente
- Confirme se tem responsável legal vinculado
- Verifique se responsável financeiro está definido
- Confirme se endereço está cadastrado

### PDF não baixa

- Verifique console para erros de CORS
- Confirme se Edge Function está deployada
- Verifique logs da Edge Function no Supabase

### Webhook não enviado

- Verifique tabela `webhook_queue`
- Confirme se worker de processamento está ativo
- Verifique logs do n8n
