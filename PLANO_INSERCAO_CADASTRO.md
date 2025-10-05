# 📋 Plano de Inserção: Cadastro de Paciente no Supabase

## 🎯 Objetivo

Documentar **EXATAMENTE** quais dados serão inseridos em cada tabela do Supabase quando o cliente aceitar o contrato no cadastro público.

---

## 📊 Dados Disponíveis em `registrationData`

Após o aceite do contrato, temos:

```typescript
{
  // Etapa 1: WhatsApp validado
  phoneNumber: "6181446666",
  whatsappJid: "556181446666",
  whatsappValidated: true,

  // Se usuário EXISTENTE
  existingPersonId: "uuid-da-pessoa",
  existingUserData: { ... },

  // Etapa 2: Identificação
  isSelfResponsible: true/false,

  // Etapa 3: Responsável Legal (se novo)
  responsavelLegal: {
    nome: "Maria Silva",
    cpf: "000.000.000-00",
    email: "maria@email.com",
    whatsapp: "(61) 98144-6666",
    dataNascimento: "01/01/1990",
    sexo: "F"
  },

  // Etapa 4: Endereço
  endereco: {
    cep: "70000-000",
    logradouro: "Rua X",
    bairro: "Centro",
    cidade: "Brasília",
    estado: "DF",
    numero: "123",
    complemento: "Apto 101"
  },

  // Etapa 5: Responsável Financeiro
  responsavelFinanceiroMesmoQueLegal: true/false,
  responsavelFinanceiro: { // se diferente
    nome: "João Silva",
    cpf: "111.111.111-11",
    email: "joao@email.com",
    telefone: "61987654321",
    whatsappJid: "556187654321",
    dataNascimento: "02/02/1985",
    endereco: { ... }
  },

  // Etapa 6: Paciente
  paciente: {
    nome: "Gabriel Shinji",
    dataNascimento: "04/10/2025",
    sexo: "M",
    cpf: "222.222.222-22" // opcional
  },

  // Etapa 7: Pediatra
  pediatra: {
    id: "uuid-pediatra", // se existente
    nome: "Carlos Alberto Zaconeta",
    crm: "12345", // opcional
    especialidade: "Pediatria"
  },

  // Etapa 8: Autorizações
  autorizacoes: {
    usoCientifico: true,
    usoRedesSociais: false,
    usoNome: true
  },

  // Etapa 10: Contrato
  contrato: {
    contractId: "uuid-contrato",
    contractContent: "...",
    contractData: { ... }
  }
}
```

---

## 🔄 ORDEM DE INSERÇÃO (Crítico para evitar FK errors)

### **Passo 0: Buscar IDs dos Tipos de Pessoa**

```sql
-- Buscar UUIDs necessários
SELECT id FROM pessoa_tipos WHERE codigo = 'responsavel'; -- tipo_responsavel_id
SELECT id FROM pessoa_tipos WHERE codigo = 'paciente';    -- tipo_paciente_id
SELECT id FROM pessoa_tipos WHERE codigo = 'pediatra';    -- tipo_pediatra_id (se novo)
```

---

### **Passo 1: ENDEREÇO (tabela `enderecos`)**

#### 1.1 - Buscar endereço existente por CEP

```sql
SELECT id, cep, logradouro, bairro, cidade, estado
FROM enderecos
WHERE cep = '70000-000';
```

#### 1.2 - Se NÃO existe, criar novo

```sql
INSERT INTO enderecos (
  cep,
  logradouro,
  bairro,
  cidade,
  estado,
  created_at,
  updated_at
) VALUES (
  '71515720',                    -- registrationData.endereco.cep (sem hífen)
  'Quadra SHIN QI 11 Conjunto 2', -- registrationData.endereco.logradouro
  'Setor de Habitações Individuais Norte', -- registrationData.endereco.bairro
  'Brasília',                    -- registrationData.endereco.cidade
  'DF',                          -- registrationData.endereco.estado
  now(),
  now()
)
ON CONFLICT (cep) DO UPDATE
SET updated_at = now()
RETURNING id; -- endereco_id
```

**Resultado:** `endereco_id` (UUID)

---

### **Passo 2: RESPONSÁVEL LEGAL (tabela `pessoas`)**

#### Cenário A: Usuário NOVO

```sql
INSERT INTO pessoas (
  nome,
  cpf_cnpj,
  telefone,
  email,
  data_nascimento,
  sexo,
  id_tipo_pessoa,
  id_endereco,
  numero_endereco,
  complemento_endereco,
  responsavel_cobranca_id,  -- ⚠️ TEMPORÁRIO: será atualizado depois
  ativo,
  profile_complete,
  created_at,
  updated_at
) VALUES (
  'Nicolas Shuith Ramos Fujimoto',  -- registrationData.responsavelLegal.nome
  '00484887122',                     -- registrationData.responsavelLegal.cpf (sem pontos)
  556181446666,                      -- registrationData.whatsappJid (BIGINT)
  'fujimoto.nicolas@gmail.com',      -- registrationData.responsavelLegal.email
  '1990-01-01',                      -- registrationData.responsavelLegal.dataNascimento (YYYY-MM-DD)
  'M',                               -- registrationData.responsavelLegal.sexo
  'uuid-tipo-responsavel',           -- tipo_responsavel_id
  'uuid-endereco',                   -- endereco_id (do Passo 1)
  '123',                             -- registrationData.endereco.numero
  'Apto 101',                        -- registrationData.endereco.complemento
  NULL,                              -- Será atualizado no Passo 2.1
  true,
  true,
  now(),
  now()
)
RETURNING id; -- responsavel_legal_id
```

#### Passo 2.1 - Atualizar auto-referência

```sql
UPDATE pessoas
SET responsavel_cobranca_id = id
WHERE id = 'responsavel_legal_id'
AND responsavel_cobranca_id IS NULL;
```

#### Cenário B: Usuário EXISTENTE

- **Pular inserção**, usar `existingPersonId` diretamente
- `responsavel_legal_id = existingPersonId`

**Resultado:** `responsavel_legal_id` (UUID)

---

### **Passo 3: RESPONSÁVEL FINANCEIRO (tabela `pessoas`)**

#### Cenário A: Mesmo que Legal

- `responsavel_financeiro_id = responsavel_legal_id`
- **NÃO** inserir novo registro

#### Cenário B: Diferente do Legal

##### 3.1 - Buscar/Criar endereço do financeiro (se tiver endereço diferente)

```sql
-- Similar ao Passo 1
INSERT INTO enderecos (...) VALUES (...) RETURNING id; -- endereco_financeiro_id
```

##### 3.2 - Criar Responsável Financeiro

```sql
INSERT INTO pessoas (
  nome,
  cpf_cnpj,
  telefone,
  email,
  data_nascimento,
  sexo,
  id_tipo_pessoa,
  id_endereco,
  numero_endereco,
  complemento_endereco,
  responsavel_cobranca_id,
  ativo,
  profile_complete,
  created_at,
  updated_at
) VALUES (
  'João Silva',                  -- registrationData.responsavelFinanceiro.nome
  '11111111111',                 -- registrationData.responsavelFinanceiro.cpf
  556187654321,                  -- registrationData.responsavelFinanceiro.whatsappJid (BIGINT)
  'joao@email.com',              -- registrationData.responsavelFinanceiro.email
  '1985-02-02',                  -- registrationData.responsavelFinanceiro.dataNascimento
  'M',
  'uuid-tipo-responsavel',
  'uuid-endereco-financeiro',
  '456',
  NULL,
  NULL,                          -- Será auto-referência
  true,
  true,
  now(),
  now()
)
RETURNING id; -- responsavel_financeiro_id

-- Atualizar auto-referência
UPDATE pessoas
SET responsavel_cobranca_id = id
WHERE id = 'responsavel_financeiro_id';
```

**Resultado:** `responsavel_financeiro_id` (UUID)

---

### **Passo 4: PEDIATRA (tabelas `pessoas` e `pessoa_pediatra`)**

#### Cenário A: Pediatra EXISTENTE

- `pediatra_id = registrationData.pediatra.id`
- **NÃO** inserir novo registro

#### Cenário B: Pediatra NOVO

##### 4.1 - Criar pessoa do tipo pediatra

```sql
INSERT INTO pessoas (
  nome,
  id_tipo_pessoa,
  responsavel_cobranca_id,  -- ⚠️ Pediatra referencia a si mesmo
  ativo,
  created_at,
  updated_at
) VALUES (
  'Carlos Alberto Zaconeta',     -- registrationData.pediatra.nome
  'uuid-tipo-pediatra',
  NULL,                          -- Será auto-referência
  true,
  now(),
  now()
)
RETURNING id; -- pediatra_pessoa_id

-- Atualizar auto-referência
UPDATE pessoas
SET responsavel_cobranca_id = id
WHERE id = 'pediatra_pessoa_id';
```

##### 4.2 - Criar registro em pessoa_pediatra

```sql
INSERT INTO pessoa_pediatra (
  pessoa_id,
  crm,
  especialidade,
  ativo,
  created_at,
  updated_at
) VALUES (
  'pediatra_pessoa_id',          -- do Passo 4.1
  '12345',                       -- registrationData.pediatra.crm (opcional)
  'Pediatria',                   -- registrationData.pediatra.especialidade
  true,
  now(),
  now()
)
RETURNING id; -- pediatra_id
```

#### Cenário C: "Não Informado"

- Se `registrationData.pediatra.nome === 'Não Informado'`
- `pediatra_id = NULL` (não criar relacionamento)

**Resultado:** `pediatra_id` (UUID) ou NULL

---

### **Passo 5: PACIENTE (tabela `pessoas`)**

⚠️ **IMPORTANTE**: Paciente usa o **MESMO ENDEREÇO** do Responsável Legal

```sql
INSERT INTO pessoas (
  nome,
  data_nascimento,
  sexo,
  cpf_cnpj,                      -- Opcional (aceita NULL)
  id_tipo_pessoa,
  id_endereco,                   -- ⚠️ MESMO do responsável legal
  numero_endereco,               -- ⚠️ MESMO do responsável legal
  complemento_endereco,          -- ⚠️ MESMO do responsável legal
  responsavel_cobranca_id,       -- ⚠️ OBRIGATÓRIO: responsavel_financeiro_id
  autorizacao_uso_cientifico,
  autorizacao_uso_redes_sociais,
  autorizacao_uso_do_nome,
  ativo,
  created_at,
  updated_at
) VALUES (
  'Gabriel Shinji',              -- registrationData.paciente.nome
  '2025-10-04',                  -- registrationData.paciente.dataNascimento (YYYY-MM-DD)
  'M',                           -- registrationData.paciente.sexo
  NULL,                          -- registrationData.paciente.cpf (NULL se vazio)
  'uuid-tipo-paciente',
  'uuid-endereco',               -- ✅ MESMO endereco_id do responsável legal
  '123',                         -- ✅ MESMO numero do responsável legal
  'Apto 101',                    -- ✅ MESMO complemento do responsável legal
  'uuid-responsavel-financeiro', -- responsavel_financeiro_id (do Passo 3)
  true,                          -- registrationData.autorizacoes.usoCientifico
  false,                         -- registrationData.autorizacoes.usoRedesSociais
  true,                          -- registrationData.autorizacoes.usoNome
  true,
  now(),
  now()
)
RETURNING id; -- paciente_id
```

**Resultado:** `paciente_id` (UUID)

---

### **Passo 6: RELACIONAMENTO Paciente ↔ Responsável Legal (tabela `pessoa_responsaveis`)**

```sql
INSERT INTO pessoa_responsaveis (
  id_pessoa,
  id_responsavel,
  tipo_responsabilidade,
  ativo,
  data_inicio,
  created_at,
  updated_at
) VALUES (
  'uuid-paciente',               -- paciente_id (do Passo 5)
  'uuid-responsavel-legal',      -- responsavel_legal_id (do Passo 2)
  'legal',                       -- Tipo: legal
  true,
  CURRENT_DATE,
  now(),
  now()
);
```

---

### **Passo 7: RELACIONAMENTO Paciente ↔ Responsável Financeiro (tabela `pessoa_responsaveis`)**

#### Cenário A: Financeiro = Legal (ambos)

```sql
-- Atualizar registro existente para 'ambos'
UPDATE pessoa_responsaveis
SET tipo_responsabilidade = 'ambos'
WHERE id_pessoa = 'uuid-paciente'
AND id_responsavel = 'uuid-responsavel-legal';
```

#### Cenário B: Financeiro ≠ Legal (criar novo registro)

```sql
INSERT INTO pessoa_responsaveis (
  id_pessoa,
  id_responsavel,
  tipo_responsabilidade,
  ativo,
  data_inicio,
  created_at,
  updated_at
) VALUES (
  'uuid-paciente',
  'uuid-responsavel-financeiro',  -- responsavel_financeiro_id (do Passo 3)
  'financeiro',                   -- Tipo: financeiro
  true,
  CURRENT_DATE,
  now(),
  now()
);
```

---

### **Passo 8: RELACIONAMENTO Paciente ↔ Pediatra (tabela `paciente_pediatra`)**

#### Se pediatra_id não é NULL:

```sql
INSERT INTO paciente_pediatra (
  paciente_id,
  pediatra_id,
  ativo,
  data_inicio,
  created_at,
  updated_at
) VALUES (
  'uuid-paciente',               -- paciente_id (do Passo 5)
  'uuid-pediatra',               -- pediatra_id (do Passo 4)
  true,
  CURRENT_DATE,
  now(),
  now()
);
```

#### Se "Não Informado":

- **PULAR** este passo

---

### **Passo 9: ATUALIZAR CONTRATO (tabela `user_contracts`)**

```sql
UPDATE user_contracts
SET
  pessoa_id = 'uuid-paciente',           -- Atualizar para o paciente criado
  status_contrato = 'assinado',
  data_assinatura = now(),
  assinatura_digital_id = 'whatsapp_556181446666_1733356800',
  updated_at = now()
WHERE id = 'uuid-contrato';              -- registrationData.contrato.contractId
```

---

### **Passo 10: ATUALIZAR LINK DO CONTRATO NA PESSOA (tabela `pessoas`)**

```sql
UPDATE pessoas
SET
  link_contrato = 'https://bucket.supabase.co/respira-contracts/...',
  updated_at = now()
WHERE id = 'uuid-paciente';
```

---

## 📋 RESUMO: Tabelas Afetadas

| #   | Tabela                | Operação      | Registros | Condição                                                                                                  |
| --- | --------------------- | ------------- | --------- | --------------------------------------------------------------------------------------------------------- |
| 1   | `enderecos`           | INSERT/SELECT | 1-2       | Sempre (1 para responsável legal, +1 se financeiro diferente)                                             |
| 2   | `pessoas`             | INSERT        | 2-4       | Responsável legal (se novo), Responsável financeiro (se diferente), Pediatra (se novo), Paciente (sempre) |
| 3   | `pessoa_pediatra`     | INSERT        | 0-1       | Só se pediatra novo                                                                                       |
| 4   | `pessoa_responsaveis` | INSERT        | 1-2       | 1 para legal, +1 para financeiro (se diferente)                                                           |
| 5   | `paciente_pediatra`   | INSERT        | 0-1       | Só se pediatra informado (não "Não Informado")                                                            |
| 6   | `user_contracts`      | UPDATE        | 1         | Sempre                                                                                                    |

---

## 🔐 Considerações de Segurança

### Edge Function necessária: `public-patient-registration`

**Por quê?**

- Cliente não tem acesso direto ao banco (anon role)
- Validações complexas precisam ser server-side
- Transações atômicas (tudo ou nada)

**Responsabilidades:**

1. ✅ Validar todos os dados
2. ✅ Verificar duplicações (CPF, telefone)
3. ✅ Executar INSERTs na ordem correta
4. ✅ Tratar erros de FK/constraint
5. ✅ Retornar ID do paciente ou erro

---

## 🧪 Exemplo Completo de Dados

### Request para Edge Function:

```json
{
  "action": "finalize_registration",
  "data": {
    "whatsappJid": "556181446666",
    "existingPersonId": null,
    "responsavelLegal": {
      "nome": "Nicolas Shuith Ramos Fujimoto",
      "cpf": "004.848.871-22",
      "email": "fujimoto.nicolas@gmail.com",
      "dataNascimento": "01/01/1990",
      "sexo": "M"
    },
    "endereco": {
      "cep": "71515-720",
      "logradouro": "Quadra SHIN QI 11 Conjunto 2",
      "bairro": "Setor de Habitações Individuais Norte",
      "cidade": "Brasília",
      "estado": "DF",
      "numero": "123",
      "complemento": null
    },
    "responsavelFinanceiroMesmoQueLegal": true,
    "paciente": {
      "nome": "Gabriel Shinji",
      "dataNascimento": "04/10/2025",
      "sexo": "M",
      "cpf": null
    },
    "pediatra": {
      "id": "existing-pediatra-uuid",
      "nome": "Carlos Alberto Zaconeta"
    },
    "autorizacoes": {
      "usoCientifico": true,
      "usoRedesSociais": false,
      "usoNome": true
    },
    "contratoId": "uuid-contrato"
  }
}
```

### Response:

```json
{
  "success": true,
  "pacienteId": "uuid-do-paciente-criado",
  "responsavelLegalId": "uuid-responsavel-legal",
  "contratoId": "uuid-contrato"
}
```

---

## ⚠️ Tratamento de Erros

| Erro                               | Causa                  | Solução                                |
| ---------------------------------- | ---------------------- | -------------------------------------- |
| Duplicate key violation (CPF)      | CPF já cadastrado      | Exibir: "CPF já cadastrado no sistema" |
| Duplicate key violation (telefone) | WhatsApp já usado      | Exibir: "WhatsApp já cadastrado"       |
| Foreign key violation              | Tipo pessoa não existe | Buscar IDs antes de inserir            |
| Check constraint violation         | Data inválida          | Validar formato de data                |
| Unique constraint (CEP)            | CEP já existe          | Usar UPSERT (ON CONFLICT)              |

---

## 📊 Diagrama de Fluxo

```
[Aceitar Contrato]
        ↓
[Buscar Tipos de Pessoa]
        ↓
[1. Inserir/Buscar Endereço]
        ↓
[2. Inserir Responsável Legal] (se novo)
        ↓
[3. Inserir Responsável Financeiro] (se diferente)
        ↓
[4. Inserir/Buscar Pediatra]
        ↓
[5. Inserir Paciente] ← CRITICAL (precisa responsavel_cobranca_id)
        ↓
[6. Relacionar Paciente → Responsável Legal]
        ↓
[7. Relacionar Paciente → Responsável Financeiro] (se diferente)
        ↓
[8. Relacionar Paciente → Pediatra] (se informado)
        ↓
[9. Atualizar Contrato (pessoa_id + assinado)]
        ↓
[10. Enviar Webhook de Confirmação]
        ↓
[✅ SUCESSO - Cadastro Completo]
```

---

**Pronto para implementação na FASE 6!** 🚀
