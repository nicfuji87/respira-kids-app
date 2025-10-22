# 📋 IMPLEMENTAÇÃO COMPLETA: Adicionar Responsável Financeiro

## ✅ Status: IMPLEMENTAÇÃO CONCLUÍDA

Data: 22/10/2025

---

## 🎯 Objetivo

Criar uma página pública para que um responsável possa adicionar um responsável financeiro (ele mesmo ou outra pessoa) a um ou mais pacientes já cadastrados.

---

## 📦 Arquivos Criados

### **1. Backend & API**

#### `src/lib/financial-responsible-api.ts`

Funções auxiliares para gerenciamento de responsáveis financeiros:

- `fetchPatientsByResponsible()` - Buscar pacientes vinculados ao responsável
- `searchPatientsByName()` - Busca por nome com autocomplete
- `validateWhatsAppOnly()` - Validar WhatsApp sem enviar código
- `findPersonByCpf()` - Buscar pessoa por CPF
- `findPersonByPhone()` - Buscar pessoa por telefone
- `validatePersonCompleteness()` - Validar dados obrigatórios

#### `supabase/functions/add-financial-responsible/index.ts`

Edge Function completa que processa:

1. Validação de dados de entrada
2. Busca/criação de endereço
3. Busca/criação de responsável financeiro
4. Criação de vínculos em `pessoa_responsaveis`
5. Atualização de `responsavel_cobranca_id`
6. Envio de evento para webhook (n8n)

---

### **2. Componentes Composed**

#### `src/components/composed/ResponsiblePhoneValidationStep.tsx`

Validação de telefone do responsável que está cadastrando:

- Validação WhatsApp via webhook
- Envio de código de verificação
- Validação do código
- Identificação da pessoa no sistema

#### `src/components/composed/PatientSelectionStep.tsx`

Seleção de pacientes para vincular:

- Lista de pacientes vinculados ao responsável
- Busca por nome com autocomplete (mínimo 3 caracteres)
- Seleção múltipla via checkboxes
- Mostra responsável legal atual

#### `src/components/composed/FinancialResponsibleTypeStep.tsx`

Escolha do tipo de responsável financeiro:

- Radio button: "Eu mesmo"
- Radio button: "Outra pessoa"

#### `src/components/composed/NewFinancialResponsibleFormStep.tsx`

Formulário completo do novo responsável financeiro:

- Validação de WhatsApp (sem enviar código)
- Busca automática por CPF/telefone
- Campos: telefone, nome, CPF, email
- Integração com ViaCEP
- Checkbox: "Usar mesmo endereço do paciente"

#### `src/components/composed/FinancialResponsibleReviewStep.tsx`

Revisão final dos dados:

- Quem está cadastrando
- Pacientes selecionados
- Dados do responsável financeiro
- Botão de confirmação

#### `src/components/composed/FinancialResponsibleSuccessStep.tsx`

Página de sucesso:

- Ícone de sucesso
- Nome do responsável financeiro
- Lista de pacientes vinculados
- Data do cadastro
- Botões: "Ir para home" e "Cadastrar outro"

---

### **3. Componente Domain**

#### `src/components/domain/financial-responsible/AddFinancialResponsibleSteps.tsx`

Gerenciador de state e fluxo completo:

- State management de todas as etapas
- Progress indicator
- Navegação entre etapas
- Chamada à Edge Function
- Tratamento de erros

---

### **4. Página**

#### `src/pages/AddFinancialResponsiblePage.tsx`

Página pública principal:

- Usa `PublicPageLayout`
- Integra `AddFinancialResponsibleSteps`
- Mobile-first

---

### **5. Roteamento**

#### `src/components/PublicRouter.tsx` (modificado)

Adicionada rota: `/adicionar-responsavel-financeiro`

#### `src/pages/index.ts` (modificado)

Export da nova página

---

## 🔄 Fluxo de Uso

### **Etapa 1: Validação de Telefone**

1. Usuário digita telefone
2. Sistema valida WhatsApp
3. Envia código de verificação
4. Valida código
5. Busca pessoa no banco

### **Etapa 2: Seleção de Pacientes**

- **Se responsável cadastrado**: Mostra lista de pacientes vinculados
- **Se não cadastrado** ou "Buscar por nome": Campo de busca com autocomplete
- Seleção múltipla de pacientes

### **Etapa 3: Tipo de Responsável**

- "Eu mesmo" → Pula para revisão
- "Outra pessoa" → Vai para formulário

### **Etapa 4: Formulário (se "Outra pessoa")**

1. Valida WhatsApp do novo responsável
2. Busca automática por CPF/telefone
3. Preenche dados pessoais
4. Opção de usar mesmo endereço do paciente
5. Se não, busca CEP via ViaCEP

### **Etapa 5: Revisão**

- Mostra todos os dados
- Botão "Confirmar Cadastro"
- Chama Edge Function

### **Etapa 6: Sucesso**

- Mostra confirmação
- Detalhes do cadastro
- Opções de ação

---

## 🗄️ Estrutura do Banco de Dados

### **Tabelas Modificadas**

#### `pessoa_responsaveis`

```sql
CREATE TABLE pessoa_responsaveis (
  id uuid PRIMARY KEY,
  id_pessoa uuid REFERENCES pessoas(id),
  id_responsavel uuid REFERENCES pessoas(id),
  tipo_responsabilidade text CHECK (tipo_responsabilidade IN ('legal', 'financeiro', 'ambos')),
  ativo boolean DEFAULT true,
  data_inicio date DEFAULT CURRENT_DATE,
  data_fim date NULL
);
```

**Lógica de vinculação:**

- Se responsável já é 'legal' → Atualiza para 'ambos'
- Se não tem vínculo → Cria como 'financeiro'
- Permite múltiplos responsáveis financeiros

#### `pessoas.responsavel_cobranca_id`

- **Sempre atualizado** para apontar para o novo responsável financeiro
- Usado como padrão na geração de faturas

---

## 📤 Webhook Event

```json
{
  "tipo": "novo_responsavel_financeiro",
  "timestamp": "2025-10-22T...",
  "data": {
    "responsavel_financeiro_id": "uuid",
    "responsavel_financeiro_nome": "Maria Silva",
    "responsavel_financeiro_whatsapp": "556181446666@s.whatsapp.net",
    "pacientes": [
      {
        "id": "uuid1",
        "nome": "João da Silva"
      }
    ]
  },
  "webhook_id": "uuid"
}
```

**Integração n8n:**

- Evento capturado pelo workflow existente
- Mensagem personalizada enviada ao WhatsApp do responsável financeiro

---

## 🔐 Regras de Negócio

### ✅ Validações

- Telefone deve ser WhatsApp válido
- E-mail formato válido
- CPF válido (11 dígitos)
- Endereço completo (CEP + Número)
- Pelo menos 1 paciente selecionado

### ✅ Responsabilidade Financeira

- **Pode ter múltiplos** responsáveis com `tipo_responsabilidade = 'ambos'`
- Admin/Secretaria escolhe qual usar na geração de fatura
- Não desativa responsáveis existentes

### ✅ Pessoa Existente

- Busca automática por CPF e telefone
- Se existe, apenas vincula (não cria duplicada)
- Atualiza endereço se necessário

---

## 🚀 Como Testar

### **1. Acesso à Página**

```
http://localhost:5173/#/adicionar-responsavel-financeiro
```

### **2. Cenários de Teste**

#### **Cenário A: Responsável cadastrado com pacientes**

1. Digitar telefone de responsável que já tem pacientes
2. Validar código
3. Ver lista de pacientes vinculados
4. Selecionar um ou mais
5. Escolher "Eu mesmo"
6. Revisar e confirmar

#### **Cenário B: Responsável sem pacientes**

1. Digitar telefone válido sem pacientes
2. Validar código
3. Buscar paciente por nome
4. Selecionar paciente(s)
5. Escolher "Outra pessoa"
6. Preencher dados do responsável financeiro
7. Revisar e confirmar

#### **Cenário C: Pessoa existente como responsável financeiro**

1. Seguir fluxo normal
2. Na etapa "Outra pessoa", digitar telefone/CPF já cadastrado
3. Sistema carrega dados automaticamente
4. Apenas vincular aos pacientes

---

## 📊 Views do Supabase Utilizadas

### `pacientes_com_responsaveis_view`

Retorna pacientes com dados consolidados:

- responsavel_legal_nome
- responsavel_financeiro_nome
- Endereço completo

### `vw_agendamentos_completos`

Inclui `responsavel_cobranca_id` e `responsavel_cobranca_nome`

---

## 🎨 UI/UX

- **Mobile-first**: Design responsivo
- **Progress Indicator**: Mostra progresso visual
- **Validações em tempo real**: Feedback imediato
- **Reutilização de componentes**: Mantém consistência visual
- **Tema Respira Kids**: CSS variables

---

## ✅ Checklist de Conclusão

- [x] API `financial-responsible-api.ts` criada
- [x] Edge Function `add-financial-responsible` criada
- [x] Componente `ResponsiblePhoneValidationStep` criado
- [x] Componente `PatientSelectionStep` criado
- [x] Componente `FinancialResponsibleTypeStep` criado
- [x] Componente `NewFinancialResponsibleFormStep` criado
- [x] Componente `FinancialResponsibleReviewStep` criado
- [x] Componente `FinancialResponsibleSuccessStep` criado
- [x] Componente Domain `AddFinancialResponsibleSteps` criado
- [x] Página `AddFinancialResponsiblePage` criada
- [x] Rota `/adicionar-responsavel-financeiro` adicionada
- [x] Sem erros de lint

---

## 📝 Próximos Passos

1. **Testar fluxo completo** em ambiente de desenvolvimento
2. **Validar webhook** com n8n
3. **Ajustar mensagens** se necessário
4. **Deploy** da Edge Function no Supabase
5. **Testar** em produção com dados reais

---

## 🔗 URLs de Acesso

- **Desenvolvimento**: `http://localhost:5173/#/adicionar-responsavel-financeiro`
- **Produção**: `https://seu-dominio.com/#/adicionar-responsavel-financeiro`

---

## 📞 Suporte

Em caso de dúvidas ou problemas, revisar:

- Logs da Edge Function no Supabase
- Console do navegador
- Tabela `webhook_queue` para eventos pendentes

---

**Implementação concluída com sucesso!** ✅
