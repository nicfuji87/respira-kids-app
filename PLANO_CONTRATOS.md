# 📋 Plano de Implementação - Sistema de Contratos

## 🎯 Objetivo

Implementar sistema completo de contratos com:

- Template editável armazenado no Supabase
- Geração de contrato com dados do paciente/responsável
- Visualização na aplicação após confirmação dos dados
- Aceite digital via WhatsApp
- Exportação para PDF
- Bloqueio de consultas sem aceite de contrato

---

## 📊 Estrutura do Banco de Dados (Já Existente)

### Tabelas Principais:

#### 1. `contract_templates`

```sql
- id (uuid)
- nome (text) - Nome identificador do template
- descricao (text)
- conteudo_template (text) - Conteúdo com placeholders {{variavel}}
- variaveis_disponiveis (jsonb) - Array de variáveis disponíveis
- versao (integer) - Versionamento
- ativo (boolean)
- template_principal_id (uuid) - Para versionamento
- criado_por, atualizado_por
- created_at, updated_at
```

#### 2. `user_contracts`

```sql
- id (uuid)
- contract_template_id (uuid) - Template usado
- pessoa_id (uuid) - Pessoa/paciente
- agendamento_id (uuid) - Agendamento relacionado (opcional)
- nome_contrato (text)
- conteudo_final (text) - Com variáveis substituídas
- variaveis_utilizadas (jsonb) - Variáveis e valores usados
- arquivo_url (text) - URL do PDF no bucket
- status_contrato (text) - 'rascunho', 'gerado', 'assinado', 'cancelado'
- data_geracao, data_assinatura
- assinatura_digital_id (text)
- observacoes, ativo
- criado_por, atualizado_por
```

#### 3. `document_storage`

```sql
- bucket: 'respira-contracts'
- Tracking completo de PDFs gerados
```

---

## 🔧 Etapas de Implementação

### **FASE 1: Criar Template do Contrato no Banco**

#### 1.1 - Migration para Inserir Template

```sql
-- Criar migration: insert_contract_template
INSERT INTO contract_templates (
  nome,
  descricao,
  conteudo_template,
  variaveis_disponiveis,
  versao,
  ativo,
  created_at,
  updated_at
) VALUES (
  'Contrato Fisioterapia Padrão',
  'Contrato de Prestação de Serviços de Fisioterapia - BC Fisio Kids',
  '...', -- Conteúdo completo do contrato
  '[
    {"nome": "contratante", "descricao": "Nome completo do responsável"},
    {"nome": "cpf", "descricao": "CPF do responsável"},
    {"nome": "telefone", "descricao": "Telefone/WhatsApp"},
    {"nome": "email", "descricao": "Email do responsável"},
    {"nome": "logradouro", "descricao": "Endereço - Logradouro"},
    {"nome": "numero", "descricao": "Endereço - Número"},
    {"nome": "complemento", "descricao": "Endereço - Complemento"},
    {"nome": "bairro", "descricao": "Endereço - Bairro"},
    {"nome": "cidade", "descricao": "Endereço - Cidade"},
    {"nome": "uf", "descricao": "Endereço - UF"},
    {"nome": "cep", "descricao": "Endereço - CEP"},
    {"nome": "paciente", "descricao": "Nome completo do paciente"},
    {"nome": "dnPac", "descricao": "Data de nascimento do paciente"},
    {"nome": "cpfPac", "descricao": "CPF do paciente (se tiver)"},
    {"nome": "hoje", "descricao": "Data de hoje"},
    {"nome": "autorizo", "descricao": "autorizo/não autorizo"},
    {"nome": "fimTerapeutico", "descricao": "fins terapêuticos/uso em redes sociais"},
    {"nome": "vinculoNome", "descricao": "poderão/não poderão"}
  ]'::jsonb,
  1,
  true,
  now(),
  now()
);
```

---

### **FASE 2: API para Geração de Contratos**

#### 2.1 - Criar `src/lib/contract-api.ts`

```typescript
interface ContractVariables {
  contratante: string;
  cpf: string;
  telefone: string;
  email: string;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  paciente: string;
  dnPac: string; // dd/mm/aaaa
  cpfPac?: string;
  hoje: string; // dd/mm/aaaa
  autorizo: 'autorizo' | 'não autorizo';
  fimTerapeutico: string;
  vinculoNome: 'poderão' | 'não poderão';
}

// Buscar template ativo
export async function fetchContractTemplate(): Promise<ContractTemplate>;

// Substituir variáveis no template
export function replaceVariables(
  template: string,
  variables: ContractVariables
): string;

// Gerar contrato (criar registro em user_contracts)
export async function generateContract(
  pessoaId: string,
  variables: ContractVariables
): Promise<UserContract>;

// Buscar contrato gerado
export async function fetchUserContract(
  pessoaId: string
): Promise<UserContract | null>;

// Registrar aceite do contrato
export async function acceptContract(
  contractId: string,
  assinaturaDigitalId: string
): Promise<void>;
```

---

### **FASE 3: Edge Function para Gerar PDF**

#### 3.1 - Criar `supabase/functions/generate-contract-pdf/index.ts`

```typescript
// Recebe: contractId
// 1. Busca user_contract no banco
// 2. Gera PDF usando biblioteca (puppeteer ou jsPDF)
// 3. Faz upload para bucket 'respira-contracts'
// 4. Atualiza user_contracts.arquivo_url
// 5. Cria registro em document_storage
// 6. Retorna URL do PDF
```

#### 3.2 - Criar bucket no Supabase Storage

- Nome: `respira-contracts`
- Política: Privado (apenas authenticated)
- Caminho: `{pessoa_id}/{contract_id}.pdf`

---

### **FASE 4: Componente de Visualização do Contrato**

#### 4.1 - Criar `src/components/composed/ContractReviewStep.tsx`

```typescript
interface ContractReviewStepProps {
  contractContent: string; // HTML do contrato
  onAccept: () => void;
  onReject: () => void;
  onExportPDF: () => void;
  loading?: boolean;
}

// Componente exibe:
// - Título "Contrato de Prestação de Serviços"
// - Aviso: "⚠️ Leia atentamente o contrato antes de aceitar"
// - Conteúdo do contrato em área scrollável
// - Botão "📄 Exportar PDF"
// - Checkbox "□ Li e aceito os termos do contrato"
// - Botão "✅ Aceitar e Assinar Contrato" (desabilitado se não marcar)
// - Botão "❌ Rejeitar"
```

---

### **FASE 5: Integração no Fluxo de Cadastro**

#### 5.1 - Adicionar Etapa 10 ao `PatientRegistrationSteps`

```typescript
// Após Etapa 9 (Review), adicionar:
case 'contract':
  return (
    <ContractReviewStep
      contractContent={contractContent}
      onAccept={handleContractAccept}
      onReject={handleContractReject}
      onExportPDF={handleExportPDF}
      loading={isGeneratingContract}
    />
  );
```

#### 5.2 - Fluxo de Geração do Contrato

```typescript
// Após confirmar dados na ReviewStep:
1. Chamar generateContract() com todos os dados
2. Aguardar criação do registro em user_contracts
3. Chamar Edge Function para gerar PDF
4. Navegar para etapa 'contract'
5. Exibir contrato para leitura e aceite
```

---

### **FASE 6: Sistema de Aceite Digital**

#### 6.1 - Fluxo de Aceite

```typescript
// Quando usuário clica "Aceitar e Assinar Contrato":
1. Atualizar user_contracts:
   - status_contrato = 'assinado'
   - data_assinatura = now()
   - assinatura_digital_id = `whatsapp_${phoneNumber}_${timestamp}`

2. Enviar webhook confirmando aceite

3. Atualizar pessoas:
   - link_contrato = arquivo_url

4. Exibir mensagem de sucesso:
   "✅ Contrato assinado com sucesso!"
   "📱 Uma cópia foi enviada para seu WhatsApp"

5. Chamar onComplete() para finalizar cadastro
```

---

### **FASE 7: Validação de Contrato nos Agendamentos**

#### 7.1 - Adicionar Verificação

```typescript
// Antes de permitir criar agendamento:
const hasActiveContract = await checkActiveContract(pessoaId);

if (!hasActiveContract) {
  showError('É necessário aceitar o contrato antes de realizar agendamentos');
  redirectToContract();
}
```

---

## 🎨 Interface do Usuário

### Fluxo Visual:

```
Etapa 9: Revisão
     ↓
[Confirmar Dados]
     ↓
[Gerando contrato...]
     ↓
Etapa 10: Contrato
┌──────────────────────────────────┐
│ CONTRATO DE PRESTAÇÃO DE         │
│ SERVIÇOS DE FISIOTERAPIA         │
├──────────────────────────────────┤
│ ⚠️ Leia atentamente             │
│                                  │
│ [Conteúdo scrollável]            │
│ Lorem ipsum dolor sit amet...    │
│ ...                              │
│                                  │
├──────────────────────────────────┤
│ [📄 Exportar PDF]               │
│                                  │
│ ☐ Li e aceito os termos         │
│                                  │
│ [✅ Aceitar e Assinar]          │
│ [❌ Rejeitar]                   │
└──────────────────────────────────┘
```

---

## 📱 Estrutura de Variáveis do Contrato

### Mapeamento de Dados:

```typescript
const contractVariables: ContractVariables = {
  // Responsável (Legal ou Financeiro - quem paga)
  contratante:
    registrationData.responsavelFinanceiro?.nome ||
    registrationData.responsavel.nome,
  cpf:
    registrationData.responsavelFinanceiro?.cpf ||
    registrationData.responsavel.cpf,
  telefone: registrationData.phoneNumber,
  email:
    registrationData.responsavelFinanceiro?.email ||
    registrationData.responsavel.email,

  // Endereço
  logradouro: registrationData.endereco.logradouro,
  numero: registrationData.endereco.numero,
  complemento: registrationData.endereco.complemento,
  bairro: registrationData.endereco.bairro,
  cidade: registrationData.endereco.localidade,
  uf: registrationData.endereco.uf,
  cep: registrationData.endereco.cep,

  // Paciente
  paciente: registrationData.paciente.nome,
  dnPac: registrationData.paciente.dataNascimento, // Já formatado em dd/mm/aaaa
  cpfPac: registrationData.paciente.cpf,

  // Data
  hoje: new Date().toLocaleDateString('pt-BR'),

  // Autorizações
  autorizo: registrationData.autorizacoes.usoCientifico
    ? 'autorizo'
    : 'não autorizo',
  fimTerapeutico: registrationData.autorizacoes.usoCientifico
    ? 'fins terapêuticos e de pesquisa'
    : 'fins exclusivamente terapêuticos',
  vinculoNome: registrationData.autorizacoes.usoNome
    ? 'poderão'
    : 'não poderão',
};
```

---

## 🔒 Políticas RLS

### contract_templates

```sql
-- Leitura pública para buscar template ativo
CREATE POLICY "public_read_active_templates"
ON contract_templates FOR SELECT
TO anon
USING (ativo = true);
```

### user_contracts

```sql
-- Inserção pública (cadastro)
CREATE POLICY "public_create_contracts"
ON user_contracts FOR INSERT
TO anon
WITH CHECK (true);

-- Leitura: usuário vê apenas seus contratos
CREATE POLICY "users_read_own_contracts"
ON user_contracts FOR SELECT
TO authenticated
USING (pessoa_id = auth.uid() OR pessoa_id IN (
  SELECT id FROM pessoas WHERE auth_user_id = auth.uid()
));

-- Atualização: apenas para aceitar/assinar
CREATE POLICY "users_update_own_contracts"
ON user_contracts FOR UPDATE
TO authenticated
USING (pessoa_id IN (
  SELECT id FROM pessoas WHERE auth_user_id = auth.uid()
));
```

---

## 📦 Bibliotecas Necessárias

### Frontend:

```json
{
  "react-to-print": "^2.15.1", // Para imprimir contrato
  "html2canvas": "^1.4.1", // Para screenshot
  "jspdf": "^2.5.1" // Para gerar PDF no cliente
}
```

### Edge Function:

```json
{
  "@supabase/supabase-js": "^2.39.0",
  "puppeteer-core": "^21.0.0", // Para gerar PDF
  "chrome-aws-lambda": "^10.1.0" // Chrome headless
}
```

---

## 🧪 Testes

### Checklist de Testes:

- [ ] Template carrega corretamente do banco
- [ ] Todas as variáveis são substituídas
- [ ] Dados do responsável corretos
- [ ] Dados do paciente corretos
- [ ] Endereço completo
- [ ] Autorizações refletidas corretamente
- [ ] Formato de data dd/mm/aaaa
- [ ] Exportação PDF funciona
- [ ] Aceite registra corretamente
- [ ] Status do contrato atualiza
- [ ] Webhook enviado após aceite
- [ ] Bloqueio de agendamento sem contrato
- [ ] Contrato aparece no perfil do usuário

---

## 📅 Cronograma Estimado

1. **FASE 1** - Template no banco: 30min
2. **FASE 2** - API de contratos: 2h
3. **FASE 3** - Edge Function PDF: 3h
4. **FASE 4** - Componente visual: 2h
5. **FASE 5** - Integração no fluxo: 1h
6. **FASE 6** - Sistema de aceite: 1h
7. **FASE 7** - Validação em agendamentos: 1h
8. **Testes e ajustes**: 2h

**Total estimado: 12-14 horas**

---

## 🎯 Próximos Passos

1. ✅ Corrigir formato de data (dd/mm/aaaa) - **CONCLUÍDO**
2. ⏳ Criar migration com template do contrato
3. ⏳ Implementar API de contratos
4. ⏳ Desenvolver componente de visualização
5. ⏳ Integrar no fluxo de cadastro
6. ⏳ Implementar geração de PDF
7. ⏳ Testar fluxo completo

---

## 💡 Observações Importantes

- **Versionamento**: Sempre que o contrato mudar, criar nova versão mantendo o `template_principal_id`
- **Auditoria**: Manter registro de quem gerou e quando foi assinado
- **Backup**: PDFs ficam armazenados permanentemente no bucket
- **LGPD**: Contrato inclui cláusulas de proteção de dados
- **Aceite Digital**: Válido conforme legislação brasileira (Lei 14.063/2020)
- **Reemissão**: Permitir reenvio do contrato se necessário
