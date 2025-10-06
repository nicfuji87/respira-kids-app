# 📋 Documentação de Logs: Cadastro de Paciente

## 🎯 Objetivo

Este documento descreve todos os logs implementados no fluxo de cadastro público de paciente, desde o frontend até o backend (Edge Function).

---

## 📊 Fluxo de Logs

### 1️⃣ **Frontend: PatientRegistrationSteps.tsx**

#### **Ao aceitar o contrato (handleContractAccept)**

```
🎯 [PatientRegistrationSteps] ====== INICIANDO FINALIZAÇÃO DE CADASTRO ======
📋 [PatientRegistrationSteps] Estado atual do registrationData: {...}
📋 [PatientRegistrationSteps] Preparando dados para Edge Function...
📋 [PatientRegistrationSteps] Dados preparados: {...}
📤 [PatientRegistrationSteps] Enviando dados para Edge Function...
⏱️ [PatientRegistrationSteps] Timestamp: 2024-12-XX...
```

**Dados logados:**

- `hasWhatsappJid`, `hasPhoneNumber`, `hasExistingPersonId`
- `hasExistingUserData`, `hasResponsavelLegal`, `hasEndereco`
- `responsavelFinanceiroMesmoQueLegal`
- `hasResponsavelFinanceiro`, `hasPaciente`, `hasPediatra`
- `hasAutorizacoes`, `hasContrato`

#### **Ao receber resposta**

```
📥 [PatientRegistrationSteps] Resposta recebida da Edge Function
📋 [PatientRegistrationSteps] Success: true
🎉 [PatientRegistrationSteps] ====== CADASTRO COMPLETO COM SUCESSO! ======
✅ [PatientRegistrationSteps] Paciente criado: UUID
✅ [PatientRegistrationSteps] Responsável legal: UUID
✅ [PatientRegistrationSteps] Responsável financeiro: UUID
✅ [PatientRegistrationSteps] Contrato assinado: UUID
```

#### **Em caso de erro**

```
❌ [PatientRegistrationSteps] Erro na finalização: mensagem do erro
```

---

### 2️⃣ **Frontend: registration-finalization-api.ts**

#### **Ao iniciar chamada**

```
🚀 [FRONTEND] Iniciando finalização de cadastro...
📋 [FRONTEND] Resumo dos dados: {...}
📤 [FRONTEND] Enviando dados para Edge Function...
```

**Dados logados:**

- `hasExistingUser`, `phoneNumber`
- `responsavelLegalNome`, `responsavelFinanceiroMesmoQueLegal`
- `responsavelFinanceiroNome`, `pacienteNome`
- `pacienteSexo`, `pacienteCpf`
- `pediatraId`, `pediatraNome`, `pediatraCrm`
- `contratoId`, `enderecoCep`, `autorizacoes`

#### **Ao receber resposta**

```
⏱️ [FRONTEND] Edge Function respondeu em XXXms
✅ [FRONTEND] Cadastro finalizado com sucesso!
📋 [FRONTEND] IDs retornados: {...}
```

#### **Em caso de erro**

```
❌ [FRONTEND] Erro retornado pela Edge Function: {...}
❌ [FRONTEND] Detalhes do erro: {message, details, hint, code}
❌ [FRONTEND] Erro na chamada da Edge Function: erro
❌ [FRONTEND] Stack trace: ...
```

---

### 3️⃣ **Backend: Edge Function `public-patient-registration`**

#### **STEP 0: Início**

```
🚀 [PUBLIC-PATIENT-REGISTRATION] Iniciando cadastro público
📋 [STEP 0] Ação: finalize_registration
📋 [STEP 0] Dados recebidos: {...}
```

**Dados logados:**

- `hasExistingUser`, `hasResponsavelLegal`
- `responsavelFinanceiroMesmoQueLegal`
- `pacienteNome`, `pediatraId`, `contratoId`

---

#### **STEP 1: Buscar Tipos de Pessoa**

```
📋 [STEP 1] Buscando tipos de pessoa...
✅ [STEP 1] Tipo responsavel: UUID
✅ [STEP 1] Tipo paciente: UUID
```

**Em caso de erro:**

```
❌ [STEP 1] Erro ao buscar tipo responsavel: erro
```

---

#### **STEP 2: Buscar ou Criar Endereço**

```
📋 [STEP 2] Buscando ou criando endereço...
📋 [STEP 2] CEP: 00000-000
✅ [STEP 2] Endereço já existe: UUID
```

**OU**

```
📋 [STEP 2] Criando novo endereço...
✅ [STEP 2] Novo endereço criado: UUID
```

**Em caso de erro:**

```
❌ [STEP 2] Erro ao buscar endereço: erro
❌ [STEP 2] Erro ao criar endereço: erro
```

---

#### **STEP 3: Criar ou Usar Responsável Legal**

**Se usuário existente:**

```
✅ [STEP 3] Usando pessoa existente como responsável legal: UUID
📋 [STEP 3] Atualizando endereço do responsável existente...
✅ [STEP 3] Endereço atualizado para responsável existente
```

**Se novo usuário:**

```
📋 [STEP 3] Criando novo responsável legal...
📋 [STEP 3] Dados: {nome, cpf, email, telefone}
✅ [STEP 3] Responsável legal criado: UUID
📋 [STEP 3.1] Atualizando auto-referência...
✅ [STEP 3.1] Auto-referência atualizada
```

**Em caso de erro:**

```
❌ [STEP 3] Erro ao atualizar endereço: erro
❌ [STEP 3] Erro ao criar responsável legal: erro
❌ [STEP 3.1] Erro ao atualizar auto-referência: erro
```

---

#### **STEP 4: Criar ou Usar Responsável Financeiro**

**Se mesmo que legal:**

```
✅ [STEP 4] Responsável financeiro = legal: UUID
```

**Se diferente:**

```
📋 [STEP 4] Criando responsável financeiro diferente...
📋 [STEP 4] Buscando endereço do responsável financeiro...
✅ [STEP 4] Endereço financeiro já existe: UUID
📋 [STEP 4] Inserindo responsável financeiro...
✅ [STEP 4] Responsável financeiro criado: UUID
📋 [STEP 4.1] Atualizando auto-referência do responsável financeiro...
✅ [STEP 4.1] Auto-referência financeiro atualizada
```

**Em caso de erro:**

```
❌ [STEP 4] Erro ao buscar endereço financeiro: erro
❌ [STEP 4] Erro ao criar endereço financeiro: erro
❌ [STEP 4] Erro ao criar responsável financeiro: erro
❌ [STEP 4.1] Erro ao atualizar auto-referência financeiro: erro
```

---

#### **STEP 5: Buscar ou Criar Pediatra**

**Se pediatra existente:**

```
📋 [STEP 5] Processando pediatra...
✅ [STEP 5] Usando pediatra existente: UUID
```

**Se novo pediatra:**

```
📋 [STEP 5] Criando novo pediatra...
📋 [STEP 5] Nome: Dr. Fulano
📋 [STEP 5] CRM: 12345 (ou "não fornecido")
✅ [STEP 5] Pessoa pediatra criada: UUID
📋 [STEP 5] Criando registro pessoa_pediatra...
✅ [STEP 5] Registro pessoa_pediatra criado: UUID
```

**Em caso de erro:**

```
❌ [STEP 5] Erro ao buscar tipo pediatra: erro
❌ [STEP 5] Erro ao criar pessoa pediatra: erro
❌ [STEP 5] Erro ao criar pessoa_pediatra: erro
```

---

#### **STEP 6: Criar Paciente**

```
📋 [STEP 6] Criando paciente...
📋 [STEP 6] Dados: {nome, dataNascimento, sexo, cpf}
✅ [STEP 6] Paciente criado: UUID
```

**Em caso de erro:**

```
❌ [STEP 6] Erro ao criar paciente: erro
```

---

#### **STEP 7: Relacionamento Paciente ↔ Responsável Legal**

```
📋 [STEP 7] Criando relacionamento paciente ↔ responsável legal...
✅ [STEP 7] Relacionamento legal criado
```

**Em caso de erro:**

```
❌ [STEP 7] Erro ao criar relacionamento legal: erro
```

---

#### **STEP 8: Relacionamento Paciente ↔ Responsável Financeiro**

**Se diferente do legal:**

```
📋 [STEP 8] Criando relacionamento paciente ↔ responsável financeiro...
✅ [STEP 8] Relacionamento financeiro criado
```

**Se mesmo que legal:**

```
⏭️ [STEP 8] Pulando (responsável financeiro = legal)
```

**Em caso de erro:**

```
❌ [STEP 8] Erro ao criar relacionamento financeiro: erro
```

---

#### **STEP 9: Relacionamento Paciente ↔ Pediatra**

```
📋 [STEP 9] Criando relacionamento paciente ↔ pediatra...
✅ [STEP 9] Relacionamento pediatra criado
```

**Em caso de erro:**

```
❌ [STEP 9] Erro ao criar relacionamento pediatra: erro
```

---

#### **STEP 10: Atualizar Contrato**

```
📋 [STEP 10] Atualizando contrato...
📋 [STEP 10] Contrato ID: UUID
📋 [STEP 10] Paciente ID: UUID
✅ [STEP 10] Contrato atualizado e assinado
```

**Em caso de erro:**

```
❌ [STEP 10] Erro ao atualizar contrato: erro
```

---

#### **STEP 11: Webhook (opcional)**

```
📋 [STEP 11] Enviando webhook de confirmação...
✅ [STEP 11] Webhook enviado com sucesso
```

**OU**

```
⏭️ [STEP 11] Webhook não configurado
⚠️ [STEP 11] Webhook retornou erro: status
⚠️ [STEP 11] Erro ao enviar webhook: erro
```

---

#### **FINALIZAÇÃO**

```
🎉 [FINALIZAÇÃO] Cadastro concluído com sucesso!
📋 [FINALIZAÇÃO] IDs criados: {pacienteId, responsavelLegalId, responsavelFinanceiroId, contratoId}
```

---

#### **Erro Fatal**

```
❌ [ERROR] Erro fatal no cadastro: erro
```

---

## 🔍 Como Usar os Logs para Debug

### 1. **Abrir Console do Navegador**

- Pressione `F12` no navegador
- Vá para a aba **Console**
- Os logs do frontend aparecerão aqui

### 2. **Ver Logs da Edge Function**

- Acesse o painel do **Supabase**
- Vá em **Edge Functions** → **public-patient-registration**
- Clique em **Logs**
- Filtre por timestamp do cadastro

### 3. **Identificar Problemas**

#### **Se o erro for no FRONTEND:**

- Busque por `❌ [FRONTEND]`
- Verifique os dados que foram enviados
- Confira o stack trace se houver

#### **Se o erro for na EDGE FUNCTION:**

- Busque por `❌ [STEP X]` onde X é o número da etapa
- Identifique qual tabela/relacionamento falhou
- Verifique os detalhes do erro do Supabase

#### **Etapas mais propensas a erros:**

| Etapa    | Possível Erro                      | Solução                                         |
| -------- | ---------------------------------- | ----------------------------------------------- |
| STEP 1   | Tipo de pessoa não encontrado      | Executar migration de seed de tipos             |
| STEP 2   | CEP duplicado com dados diferentes | Verificar constraint UNIQUE em `enderecos`      |
| STEP 3   | Erro ao criar responsável          | Verificar se CPF já existe                      |
| STEP 4   | Erro ao criar resp. financeiro     | Verificar se CPF/telefone duplicado             |
| STEP 5   | Erro ao criar pediatra             | Verificar RLS em `pessoa_pediatra`              |
| STEP 6   | Erro ao criar paciente             | `responsavel_cobranca_id` deve estar preenchido |
| STEP 7-9 | Erro de relacionamento             | Foreign keys não satisfeitas                    |
| STEP 10  | Erro ao atualizar contrato         | Contrato não existe ou já foi assinado          |

---

## 📊 Exemplo de Fluxo Completo (Sucesso)

```
🚀 [FRONTEND] Iniciando finalização de cadastro...
📋 [FRONTEND] Resumo dos dados: {pacienteNome: "João Silva", ...}
📤 [FRONTEND] Enviando dados para Edge Function...

🚀 [PUBLIC-PATIENT-REGISTRATION] Iniciando cadastro público
📋 [STEP 0] Ação: finalize_registration
📋 [STEP 1] Buscando tipos de pessoa...
✅ [STEP 1] Tipo responsavel: abc-123
✅ [STEP 1] Tipo paciente: def-456
📋 [STEP 2] Buscando ou criando endereço...
✅ [STEP 2] Novo endereço criado: ghi-789
📋 [STEP 3] Criando novo responsável legal...
✅ [STEP 3] Responsável legal criado: jkl-012
✅ [STEP 3.1] Auto-referência atualizada
✅ [STEP 4] Responsável financeiro = legal: jkl-012
✅ [STEP 5] Usando pediatra existente: mno-345
📋 [STEP 6] Criando paciente...
✅ [STEP 6] Paciente criado: pqr-678
✅ [STEP 7] Relacionamento legal criado
⏭️ [STEP 8] Pulando (responsável financeiro = legal)
✅ [STEP 9] Relacionamento pediatra criado
✅ [STEP 10] Contrato atualizado e assinado
⏭️ [STEP 11] Webhook não configurado
🎉 [FINALIZAÇÃO] Cadastro concluído com sucesso!

⏱️ [FRONTEND] Edge Function respondeu em 1234ms
✅ [FRONTEND] Cadastro finalizado com sucesso!
🎉 [PatientRegistrationSteps] ====== CADASTRO COMPLETO COM SUCESSO! ======
```

---

## 🛠️ Dicas de Debugging

1. **Use o filtro do console:** Digite `[STEP` para ver só as etapas
2. **Copie os UUIDs:** Útil para consultar diretamente no banco
3. **Compare timestamps:** Ajuda a identificar gargalos de performance
4. **Busque por "Erro ao":** Filtra rapidamente os problemas
5. **Verifique a ordem:** Se uma etapa foi pulada, algo pode estar errado

---

**Desenvolvido com ❤️ para Respira Kids**
