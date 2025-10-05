# 📋 Plano de Implementação: Cadastro Público de Paciente

## 🎯 Objetivo

Criar um fluxo intuitivo e mobile-first para cadastro público de pacientes, onde o responsável preenche todas as informações necessárias sem precisar de login.

---

## 📊 Análise do Banco de Dados

### Tabelas Principais

1. **`pessoas`** - Tabela central para todos os tipos de pessoa
2. **`pessoa_tipos`** - Tipos: paciente, responsavel, pediatra, etc
3. **`pessoa_responsaveis`** - Relacionamento paciente ↔ responsável
4. **`enderecos`** - Endereços por CEP (UNIQUE constraint)
5. **`pessoa_pediatra`** - Dados específicos de pediatras
6. **`paciente_pediatra`** - Relacionamento paciente ↔ pediatra
7. **`contract_templates`** / **`user_contracts`** - Contratos

### Campos Obrigatórios em `pessoas`

- ✅ `nome` (NOT NULL)
- ✅ `id_tipo_pessoa` (NOT NULL)
- ✅ `responsavel_cobranca_id` (NOT NULL) ⚠️ **CRÍTICO**
- ❌ `telefone` (nullable)
- ❌ `email` (nullable)
- ❌ `cpf_cnpj` (nullable)
- ❌ `id_endereco` (nullable)

### Tipos de Pessoa Disponíveis

- `admin` - Administrador
- `profissional` - Fisioterapeuta
- `secretaria` - Secretária
- **`paciente`** - Pessoa que recebe atendimento
- **`responsavel`** - Responsável legal/financeiro
- `empresa` - Pessoa jurídica
- `fornecedor` - Fornecedor

---

## 🔍 Fluxo Atual Implementado

### ✅ Etapa 1: Validação de WhatsApp (CONCLUÍDA)

1. Usuário digita número de WhatsApp
2. Sistema valida via webhook externo
3. Sistema envia código de 6 dígitos
4. Usuário valida código (com expiração e rate limiting)
5. Sistema busca na `vw_usuarios_admin` por telefone

**Resultado:**

- Se **existe**: Exibe boas-vindas e pacientes relacionados
- Se **não existe**: Prossegue para cadastro

---

## 📝 Fluxo Proposto para Cadastro Completo

### 🎨 Princípios de UX

- ✨ **Mobile-first** e responsivo
- 🎯 **Uma pergunta por vez** (wizard step-by-step)
- 📱 **Inputs otimizados** (teclado numérico, máscaras)
- ✅ **Validação em tempo real** (com feedback visual)
- 💾 **Progresso salvo** (sessionStorage para recuperação)
- 🔙 **Voltar permitido** (editar respostas anteriores)

---

## 🗺️ Sequência de Cadastro (Order of Operations)

### **ETAPA 1: Validação WhatsApp** ✅ IMPLEMENTADA

- [x] Validar número
- [x] Enviar código
- [x] Validar código
- [x] Buscar usuário existente

---

### **ETAPA 2: Identificação do Responsável Legal**

**Pergunta:** "Você é o responsável legal pelo paciente?"

- **Opções:**
  - ✅ Sim, sou eu (auto-responsável ou responsável por outro)
  - ❌ Não, estou cadastrando para outra pessoa

**Se SIM:**

- Usar WhatsApp validado como responsável
- Prosseguir para dados do responsável

**Se NÃO:**

- Solicitar WhatsApp do responsável legal
- Validar novo WhatsApp
- Prosseguir para dados do responsável

---

### **ETAPA 3: Dados do Responsável Legal**

**Campos:**

1. **Nome completo\*** (obrigatório)
   - Validação: mínimo 3 caracteres
2. **CPF\*** (obrigatório)
   - Validação: CPF válido
   - Validação: Verificar se já existe no sistema
   - Máscara: 000.000.000-00
   - **Explicação:** "O CPF é obrigatório para emissão de Nota Fiscal"

3. **Email\*** (obrigatório)
   - Validação: email válido
   - **Explicação:** "Avisos de agendamento, cobranças e NF-e serão enviados por email"
4. **Data de nascimento\***
   - Validação: maior de 18 anos (se auto-responsável)
   - Formato: DD/MM/AAAA

---

### **ETAPA 4: Endereço do Responsável**

**Campos:**

1. **CEP\*** (obrigatório)
   - Buscar via API ViaCEP
   - Se encontrado: preencher logradouro, bairro, cidade, estado
   - Se não encontrado: permitir preenchimento manual
   - Verificar se já existe em `enderecos` (UNIQUE constraint)

2. **Número\*** (obrigatório)
   - Validação: numérico ou "S/N"
3. **Complemento** (opcional)
   - Ex: Apto 101, Bloco A

**Fluxo:**

```
1. Digitar CEP
2. Buscar ViaCEP
3. Se existe no banco: reutilizar
4. Se não existe: inserir em `enderecos`
5. Salvar `id_endereco` + `numero_endereco` + `complemento_endereco` em `pessoas`
```

---

### **ETAPA 5: Responsável Financeiro**

**Pergunta:** "Quem será responsável pela parte financeira?"

- **Opções:**
  - ✅ Eu mesmo (responsável legal = financeiro)
  - ❌ Outra pessoa

**Se OUTRA PESSOA:**

- Repetir fluxo de cadastro (Nome, CPF, Email, WhatsApp, Endereço)
- Validar WhatsApp (diferente do responsável legal)
- **Validação:** WhatsApp não pode ser o mesmo do responsável legal

**Resultado:**

- `responsavel_legal_id`: UUID do responsável legal
- `responsavel_financeiro_id`: UUID do responsável financeiro (ou mesmo que legal)

---

### **ETAPA 6: Dados do Paciente**

**Campos:**

1. **Nome completo\*** (obrigatório)
   - Validação: mínimo 3 caracteres

2. **Data de nascimento\*** (obrigatório)
   - Validação: não pode ser futura
   - Validação: calcular idade automaticamente
3. **Sexo\*** (obrigatório)
   - Opções: Masculino (M) / Feminino (F)
4. **CPF** (condicional)
   - **Pergunta adicional:** "A Nota Fiscal será emitida no nome de quem?"
   - Opções:
     - Responsável Financeiro (usar CPF já cadastrado)
     - Paciente (solicitar CPF do paciente)
   - Se paciente: validar CPF

---

### **ETAPA 7: Pediatra do Paciente** ⚠️ ATENÇÃO ESPECIAL

**Problema:** Duplicação de pediatras (Dr. Zaconeta, Carlos Zaconeta, Carlos Alberto Zaconeta)

**Solução:** Autocomplete inteligente

**Campos:**

1. **Nome do Pediatra\*** (obrigatório)
   - Input com autocomplete
   - Buscar em `vw_usuarios_admin` filtrando por `is_pediatra = true`
   - Remover prefixos "Dr.", "Dra." antes de buscar
   - Buscar por similaridade (ILIKE)
2. **CRM** (opcional, mas recomendado)
   - Se novo pediatra: solicitar CRM
   - Se existente: exibir CRM cadastrado

**Fluxo:**

```typescript
// Usuário digita: "Dr. Carlos"
1. Remover "Dr.", "Dra."
2. Buscar: nome ILIKE '%Carlos%'
3. Exibir resultados:
   - Carlos Alberto Zaconeta (CRM: 12345)
   - Carlos Silva (CRM: 67890)

// Se usuário selecionar existente:
4. Usar pessoa_pediatra.id existente

// Se usuário continuar digitando (não selecionar):
5. Ao finalizar: "Não encontramos esse pediatra. Deseja cadastrar?"
6. Solicitar CRM (opcional)
7. Criar novo pediatra:
   - INSERT em `pessoas` (tipo: pediatra)
   - INSERT em `pessoa_pediatra`
```

**RLS:** ⚠️ Liberar leitura pública em `vw_usuarios_admin` WHERE `is_pediatra = true`

**Componente:**

- `<PediatricianAutocomplete />` - Primitivo reutilizável

---

### **ETAPA 8: Autorizações e Consentimentos**

**Campos (todos obrigatórios para prosseguir):**

1. ☑️ **Autorização uso científico**
   - "Autorizo o uso de informações para fins científicos (anonimizado)"
2. ☑️ **Autorização uso redes sociais**
   - "Autorizo o uso de imagens/vídeos em redes sociais"
3. ☑️ **Autorização uso do nome**
   - "Autorizo o uso do nome em publicações"

**Salvar em:**

- `pessoas.autorizacao_uso_cientifico`
- `pessoas.autorizacao_uso_redes_sociais`
- `pessoas.autorizacao_uso_do_nome`

---

### **ETAPA 9: Revisão e Confirmação**

**Exibir resumo:**

- ✅ Responsável Legal: Nome, CPF, WhatsApp
- ✅ Responsável Financeiro: Nome, CPF (se diferente)
- ✅ Endereço completo
- ✅ Paciente: Nome, Data Nascimento, Sexo
- ✅ Pediatra: Nome, CRM
- ✅ Autorizações: Sim/Não para cada
- ✅ NF-e: Emitida em nome de {Responsável/Paciente}

**Ações:**

- ✏️ Editar qualquer etapa
- ✅ Confirmar e enviar

---

### **ETAPA 10: Contrato (POSTERIOR)** 🚧

**Implementar depois:**

- Gerar contrato baseado em `contract_templates`
- Substituir variáveis dinâmicas
- Gerar PDF
- Solicitar assinatura digital (futura integração)
- Salvar em `user_contracts`

**Variáveis do contrato:**

```json
{
  "{{paciente_nome}}": "João Silva",
  "{{paciente_data_nascimento}}": "01/01/2020",
  "{{responsavel_nome}}": "Maria Silva",
  "{{responsavel_cpf}}": "000.000.000-00",
  "{{data_assinatura}}": "01/12/2024",
  "{{endereco_completo}}": "Rua X, 123 - Bairro Y, Cidade/UF"
}
```

---

## 🔄 Ordem de Inserção no Banco de Dados

### Sequência para evitar erros de Foreign Key:

```sql
-- 1. Buscar ou criar ENDEREÇO
SELECT id FROM enderecos WHERE cep = '70000-000';
-- Se não existir:
INSERT INTO enderecos (cep, logradouro, bairro, cidade, estado) VALUES (...);

-- 2. Buscar TIPOS DE PESSOA
SELECT id FROM pessoa_tipos WHERE codigo = 'responsavel'; -- responsavel_tipo_id
SELECT id FROM pessoa_tipos WHERE codigo = 'paciente'; -- paciente_tipo_id
SELECT id FROM pessoa_tipos WHERE codigo = 'pediatra'; -- pediatra_tipo_id (se novo)

-- 3. Criar RESPONSÁVEL LEGAL
INSERT INTO pessoas (
  nome, cpf_cnpj, telefone, email, data_nascimento,
  id_tipo_pessoa, id_endereco, numero_endereco, complemento_endereco,
  responsavel_cobranca_id, -- ⚠️ AUTO-REFERÊNCIA TEMPORÁRIA (NULL ou próprio ID)
  ativo
) VALUES (...) RETURNING id; -- responsavel_legal_id

-- 3.1. Atualizar AUTO-REFERÊNCIA
UPDATE pessoas
SET responsavel_cobranca_id = id
WHERE id = responsavel_legal_id
AND responsavel_cobranca_id IS NULL;

-- 4. Criar RESPONSÁVEL FINANCEIRO (se diferente)
-- Se for o mesmo: responsavel_financeiro_id = responsavel_legal_id
-- Se for diferente: repetir INSERT similar ao passo 3

-- 5. Criar/Buscar PEDIATRA
-- Se existente: usar pessoa_pediatra.id
-- Se novo:
INSERT INTO pessoas (
  nome, id_tipo_pessoa, responsavel_cobranca_id, ativo
) VALUES (...) RETURNING id; -- pediatra_pessoa_id

INSERT INTO pessoa_pediatra (
  pessoa_id, crm, especialidade, ativo
) VALUES (pediatra_pessoa_id, 'CRM123', 'Pediatria', true)
RETURNING id; -- pediatra_id

-- 6. Criar PACIENTE
INSERT INTO pessoas (
  nome, data_nascimento, sexo, cpf_cnpj,
  id_tipo_pessoa,
  responsavel_cobranca_id, -- ⚠️ OBRIGATÓRIO: responsavel_financeiro_id
  autorizacao_uso_cientifico,
  autorizacao_uso_redes_sociais,
  autorizacao_uso_do_nome,
  ativo
) VALUES (...) RETURNING id; -- paciente_id

-- 7. Criar RELACIONAMENTO paciente ↔ responsável legal
INSERT INTO pessoa_responsaveis (
  id_pessoa, id_responsavel, tipo_responsabilidade, ativo
) VALUES (paciente_id, responsavel_legal_id, 'legal', true);

-- 8. Criar RELACIONAMENTO paciente ↔ responsável financeiro (se diferente)
IF responsavel_financeiro_id != responsavel_legal_id THEN
  INSERT INTO pessoa_responsaveis (
    id_pessoa, id_responsavel, tipo_responsabilidade, ativo
  ) VALUES (paciente_id, responsavel_financeiro_id, 'financeiro', true);
END IF;

-- 9. Criar RELACIONAMENTO paciente ↔ pediatra
INSERT INTO paciente_pediatra (
  paciente_id, pediatra_id, ativo
) VALUES (paciente_id, pediatra_id, true);
```

---

## 🏗️ Arquitetura de Componentes

### Estrutura de Pastas

```
src/
├── components/
│   ├── primitives/
│   │   ├── PhoneInput.tsx ✅ (já existe)
│   │   ├── CPFInput.tsx
│   │   ├── DateInput.tsx
│   │   ├── CEPInput.tsx
│   │   ├── PediatricianAutocomplete.tsx
│   │   └── ProgressBar.tsx
│   │
│   ├── composed/
│   │   ├── WhatsAppValidationStep.tsx ✅ (já existe)
│   │   ├── ResponsibleIdentificationStep.tsx
│   │   ├── ResponsibleDataStep.tsx
│   │   ├── AddressStep.tsx
│   │   ├── FinancialResponsibleStep.tsx
│   │   ├── PatientDataStep.tsx
│   │   ├── PediatricianStep.tsx
│   │   ├── AuthorizationsStep.tsx
│   │   └── ReviewStep.tsx
│   │
│   ├── domain/
│   │   └── patient/
│   │       ├── PatientRegistrationSteps.tsx ✅ (já existe - expandir)
│   │       └── PatientRegistrationProgress.tsx
│   │
│   └── templates/
│       └── PublicPageLayout.tsx ✅ (já existe)
│
├── lib/
│   ├── patient-registration-api.ts ✅ (expandir)
│   ├── viacep-api.ts
│   └── pediatrician-api.ts
│
└── pages/
    └── PatientPublicRegistrationPage.tsx ✅ (já existe)
```

### Estado Global (PatientRegistrationSteps)

```typescript
interface PatientRegistrationData {
  // Etapa 1: WhatsApp (✅ implementado)
  whatsappJid: string;
  whatsappValidated: boolean;

  // Etapa 2: Identificação
  isSelfResponsible: boolean;

  // Etapa 3: Responsável Legal
  responsavelLegal: {
    nome: string;
    cpf: string;
    email: string;
    dataNascimento: string;
    telefone: string; // Se diferente do WhatsApp validado
  };

  // Etapa 4: Endereço
  endereco: {
    cep: string;
    logradouro: string;
    bairro: string;
    cidade: string;
    estado: string;
    numero: string;
    complemento?: string;
    enderecoId?: string; // Se já existe no banco
  };

  // Etapa 5: Responsável Financeiro
  responsavelFinanceiro: {
    mesmoQueLegal: boolean;
    nome?: string;
    cpf?: string;
    email?: string;
    telefone?: string;
    whatsappJid?: string;
    endereco?: typeof endereco;
  };

  // Etapa 6: Paciente
  paciente: {
    nome: string;
    dataNascimento: string;
    sexo: 'M' | 'F';
    cpf?: string; // Se NF-e em nome do paciente
    nfeEmNomeDe: 'responsavel' | 'paciente';
  };

  // Etapa 7: Pediatra
  pediatra: {
    id?: string; // Se existente
    nome: string;
    crm?: string;
    isNew: boolean;
  };

  // Etapa 8: Autorizações
  autorizacoes: {
    usoCientifico: boolean;
    usoRedesSociais: boolean;
    usoNome: boolean;
  };
}
```

---

## 🔐 RLS (Row Level Security)

### Políticas Necessárias:

```sql
-- Permitir leitura pública de pediatras (autocomplete)
CREATE POLICY "Public read pediatricians"
ON vw_usuarios_admin
FOR SELECT
USING (is_pediatra = true);

-- Permitir leitura pública de endereços (busca por CEP)
CREATE POLICY "Public read addresses"
ON enderecos
FOR SELECT
USING (true);

-- Permitir inserção pública em pessoas (via Edge Function)
-- (Service Role na Edge Function já tem permissão)
```

---

## 📱 API/Edge Functions

### Edge Function: `public-patient-registration`

**Responsabilidades:**

1. Validar todos os dados recebidos
2. Verificar duplicações (CPF, telefone)
3. Buscar ou criar endereço
4. Criar responsáveis
5. Criar paciente
6. Criar relacionamentos
7. Retornar ID do paciente criado

**Request:**

```typescript
{
  action: 'register_patient',
  data: PatientRegistrationData
}
```

**Response:**

```typescript
{
  success: boolean,
  pacienteId?: string,
  error?: string
}
```

---

## 🧪 Plano de Testes

### Cenários de Teste:

1. **Responsável legal = financeiro (auto-responsável)**
   - Adulto cadastrando a si mesmo
2. **Responsável legal ≠ financeiro**
   - Mãe (legal) e pai (financeiro)
3. **Paciente menor de 18 anos**
   - NF-e em nome do responsável
4. **Paciente maior de 18 anos**
   - NF-e pode ser em nome do paciente
5. **Pediatra existente**
   - Selecionar do autocomplete
6. **Pediatra novo**
   - Cadastrar com CRM
7. **CEP existente no banco**
   - Reutilizar endereço
8. **CEP não existe**
   - Criar novo endereço
9. **CPF duplicado**
   - Exibir erro "CPF já cadastrado"
10. **WhatsApp duplicado**
    - Exibir "Você já possui cadastro"

---

## 📅 Cronograma de Implementação

### Sprint 1 (3-4 dias)

- [x] Etapa 1: Validação WhatsApp ✅ CONCLUÍDA
- [ ] Etapa 2: Identificação do Responsável
- [ ] Etapa 3: Dados do Responsável Legal
- [ ] Componentes primitivos (CPFInput, DateInput)

### Sprint 2 (3-4 dias)

- [ ] Etapa 4: Endereço (com ViaCEP)
- [ ] Etapa 5: Responsável Financeiro
- [ ] API ViaCEP integration
- [ ] CEPInput component

### Sprint 3 (3-4 dias)

- [ ] Etapa 6: Dados do Paciente
- [ ] Etapa 7: Pediatra (Autocomplete)
- [ ] PediatricianAutocomplete component
- [ ] RLS policies para pediatras

### Sprint 4 (2-3 dias)

- [ ] Etapa 8: Autorizações
- [ ] Etapa 9: Revisão
- [ ] Edge Function: public-patient-registration
- [ ] Integração completa end-to-end

### Sprint 5 (2-3 dias)

- [ ] Testes completos
- [ ] Ajustes de UX
- [ ] Performance optimization
- [ ] Deploy e monitoramento

### (Futuro) Sprint 6

- [ ] Etapa 10: Contrato
- [ ] Template engine para contratos
- [ ] Geração de PDF
- [ ] Assinatura digital

---

## 🎨 Wireframes (High-Level)

```
┌─────────────────────────────────────┐
│  [Logo Respira Kids]                │
│                                     │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━     │ <- Progress bar
│  Etapa 3 de 9                       │
│                                     │
│  Dados do Responsável Legal         │
│  ───────────────────────────────    │
│                                     │
│  Nome completo *                    │
│  ┌─────────────────────────────┐   │
│  │ Maria Silva                 │   │
│  └─────────────────────────────┘   │
│                                     │
│  CPF *                              │
│  ┌─────────────────────────────┐   │
│  │ 000.000.000-00              │   │
│  └─────────────────────────────┘   │
│  💡 Necessário para emissão de NF   │
│                                     │
│  Email *                            │
│  ┌─────────────────────────────┐   │
│  │ maria@email.com             │   │
│  └─────────────────────────────┘   │
│  💡 Avisos serão enviados por email │
│                                     │
│  [← Voltar]  [Continuar →]        │
│                                     │
│  🔒 Seus dados são protegidos       │
└─────────────────────────────────────┘
```

---

## 🚨 Pontos de Atenção

### ⚠️ CRÍTICOS

1. **`responsavel_cobranca_id` é obrigatório** - Sempre definir antes de criar paciente
2. **Evitar duplicação de pediatras** - Implementar autocomplete robusto
3. **Validar CPF duplicado** - Antes de inserir
4. **CEP único** - Constraint no banco, tratar erro se já existe
5. **WhatsApp único por responsável** - Não pode haver 2 responsáveis com mesmo WhatsApp

### 📝 Melhorias Futuras

- [ ] Validação de CPF na Receita Federal (API)
- [ ] Integração com Asaas para criar customer automaticamente
- [ ] Notificação por email após cadastro
- [ ] Dashboard para o responsável ver agendamentos (futuro)
- [ ] App mobile nativo

---

## 📚 Documentos Relacionados

- ✅ `VALIDACAO_WHATSAPP_BACKEND.md` - Sistema de validação atual
- ✅ `CADASTRO_PACIENTE_PUBLICO.md` - Documentação inicial
- 📝 `CONTRACT_TEMPLATE_GUIDE.md` - A criar (para contratos)

---

**Desenvolvido com ❤️ para Respira Kids**
