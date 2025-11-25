# 📊 Resumo Executivo - Cadastro Público de Paciente

## ✅ Status Atual

### **Implementado (v1.0)**

- ✅ **Validação de WhatsApp** completa com segurança backend
  - Hash SHA-256 para códigos
  - Rate limiting por IP (10/hora) e telefone (3 tentativas)
  - Expiração de código (10 minutos)
  - Sistema de alertas via webhook_queue
  - Auditoria completa no banco
- ✅ **Infraestrutura**
  - Tabela `whatsapp_validation_attempts`
  - Edge Function `validate-whatsapp-code`
  - Roteamento público (`/cadastro-paciente`)
  - Layout público mobile-first
  - Componentes primitivos (PhoneInput)

### **Logs Removidos** ✅

- ✅ `patient-registration-api.ts` - Console logs de debug
- ✅ `WhatsAppValidationStep.tsx` - Logs de validação
- ⚠️ **Mantido:** Debug code na tela (remover antes de produção)

---

## 🎯 Próximas Etapas

### **Implementação Imediata**

#### 1. Buscar Usuário Existente (via telefone)

**Objetivo:** Após validar WhatsApp, verificar se já existe cadastro

**Query:**

```sql
SELECT * FROM vw_usuarios_admin
WHERE telefone = ?
AND ativo = true
LIMIT 1;
```

**Fluxo:**

- Se existe: Exibir boas-vindas + pacientes relacionados
- Se não existe: Iniciar cadastro completo

---

#### 2. Sequência de Cadastro (9 Etapas)

```
✅ Etapa 1: Validação WhatsApp (CONCLUÍDA)
⬜ Etapa 2: Identificação do Responsável
⬜ Etapa 3: Dados do Responsável Legal
⬜ Etapa 4: Endereço (CEP + ViaCEP)
⬜ Etapa 5: Responsável Financeiro
⬜ Etapa 6: Dados do Paciente
⬜ Etapa 7: Pediatra (Autocomplete)
⬜ Etapa 8: Autorizações
⬜ Etapa 9: Revisão e Confirmação
🚧 Etapa 10: Contrato (Futuro)
```

---

## 🔑 Pontos Críticos Identificados

### 1. **`responsavel_cobranca_id` é OBRIGATÓRIO**

**Problema:** Campo NOT NULL em `pessoas`
**Solução:**

- Criar responsável financeiro ANTES do paciente
- Ou usar auto-referência (responsável por si mesmo)

### 2. **Duplicação de Pediatras**

**Problema:** "Dr. Zaconeta", "Carlos Zaconeta", "Carlos Alberto Zaconeta"
**Solução:**

- Autocomplete inteligente
- Remover prefixos "Dr.", "Dra."
- Buscar por similaridade (ILIKE)
- RLS público para leitura de pediatras

### 3. **CEP com UNIQUE Constraint**

**Problema:** Erro ao inserir CEP duplicado
**Solução:**

- Verificar se CEP existe ANTES de inserir
- Se existe: reutilizar `id_endereco`
- Se não: criar novo em `enderecos`

### 4. **Ordem de Inserção no Banco**

**Sequência correta:**

```
1. Endereço (buscar ou criar)
2. Responsável Legal (pode ser auto-referência)
3. Responsável Financeiro (se diferente)
4. Pediatra (buscar ou criar)
5. Paciente (com responsavel_cobranca_id definido)
6. Relacionamentos:
   - pessoa_responsaveis (paciente ↔ legal)
   - pessoa_responsaveis (paciente ↔ financeiro)
   - paciente_pediatra (paciente ↔ pediatra)
```

---

## 🏗️ Arquitetura Proposta

### **Componentes a Criar**

#### Primitivos (`src/components/primitives/`)

- [ ] `CPFInput.tsx` - Input com máscara e validação
- [ ] `DateInput.tsx` - Input de data com validação
- [ ] `CEPInput.tsx` - Input de CEP com busca ViaCEP
- [ ] `PediatricianAutocomplete.tsx` - Autocomplete para pediatras
- [ ] `ProgressBar.tsx` - Barra de progresso das etapas

#### Compostos (`src/components/composed/`)

- [x] `WhatsAppValidationStep.tsx` ✅
- [ ] `ResponsibleIdentificationStep.tsx`
- [ ] `ResponsibleDataStep.tsx`
- [ ] `AddressStep.tsx`
- [ ] `FinancialResponsibleStep.tsx`
- [ ] `PatientDataStep.tsx`
- [ ] `PediatricianStep.tsx`
- [ ] `AuthorizationsStep.tsx`
- [ ] `ReviewStep.tsx`

#### APIs (`src/lib/`)

- [x] `patient-registration-api.ts` (expandir)
- [ ] `viacep-api.ts`
- [ ] `pediatrician-api.ts`

#### Edge Functions

- [x] `validate-whatsapp-code` ✅
- [ ] `public-patient-registration` (criar)

---

## 📝 Estado Global

```typescript
interface PatientRegistrationData {
  // Etapa 1: WhatsApp ✅
  whatsappJid: string;
  whatsappValidated: boolean;

  // Etapa 2-5: Responsáveis
  responsavelLegal: ResponsibleData;
  responsavelFinanceiro: ResponsibleData | null;
  endereco: AddressData;

  // Etapa 6: Paciente
  paciente: PatientData;

  // Etapa 7: Pediatra
  pediatra: PediatricianData;

  // Etapa 8: Autorizações
  autorizacoes: AuthorizationsData;
}
```

---

## 🔐 RLS Necessário

```sql
-- Permitir leitura pública de pediatras (autocomplete)
CREATE POLICY "Public read pediatricians"
ON vw_usuarios_admin FOR SELECT
USING (is_pediatra = true);

-- Permitir leitura pública de endereços (busca por CEP)
CREATE POLICY "Public read addresses"
ON enderecos FOR SELECT
USING (true);
```

---

## 📱 Integrações Externas

### **ViaCEP**

- Endpoint: `https://viacep.com.br/ws/{cep}/json/`
- Usado para: Buscar endereço por CEP
- Fallback: Permitir preenchimento manual se API falhar

### **Webhook Evolution API**

- Endpoint atual: `https://webhooks-i.infusecomunicacao.online/webhook/webhookRK2`
- Usado para: Enviar código de validação WhatsApp

---

## 🧪 Cenários de Teste

### **Prioritários**

1. ✅ Validação WhatsApp com código
2. [ ] Buscar usuário existente por telefone
3. [ ] Cadastro completo (responsável = financeiro)
4. [ ] Cadastro completo (responsável ≠ financeiro)
5. [ ] Selecionar pediatra existente
6. [ ] Cadastrar novo pediatra
7. [ ] CEP existente (reutilizar)
8. [ ] CEP novo (criar)

### **Edge Cases**

9. [ ] CPF duplicado (erro)
10. [ ] WhatsApp duplicado (mostrar cadastro)
11. [ ] Paciente menor de idade (NF-e no responsável)
12. [ ] Paciente maior de idade (NF-e opcional no paciente)
13. [ ] Perda de conexão (recuperar estado)
14. [ ] Voltar e editar etapas anteriores

---

## 📅 Cronograma Sugerido

### **Sprint 1 (Atual - 3 dias)**

- [x] Etapa 1: WhatsApp ✅
- [ ] Buscar usuário existente
- [ ] Etapa 2: Identificação Responsável
- [ ] CPFInput, DateInput

**Objetivo:** Ter identificação básica funcionando

### **Sprint 2 (3 dias)**

- [ ] Etapa 3: Dados Responsável Legal
- [ ] Etapa 4: Endereço + ViaCEP
- [ ] CEPInput component

**Objetivo:** Cadastro de responsável completo

### **Sprint 3 (3 dias)**

- [ ] Etapa 5: Responsável Financeiro
- [ ] Etapa 6: Dados Paciente
- [ ] Lógica de NF-e

**Objetivo:** Dados principais coletados

### **Sprint 4 (3 dias)**

- [ ] Etapa 7: Pediatra (Autocomplete)
- [ ] RLS policies
- [ ] PediatricianAutocomplete

**Objetivo:** Feature sensível de duplicação resolvida

### **Sprint 5 (2 dias)**

- [ ] Etapa 8: Autorizações
- [ ] Etapa 9: Revisão
- [ ] Validação final

**Objetivo:** Fluxo completo navegável

### **Sprint 6 (3 dias)**

- [ ] Edge Function: public-patient-registration
- [ ] Inserção no banco
- [ ] Relacionamentos
- [ ] Testes end-to-end

**Objetivo:** Funcionalidade completa

### **Sprint 7 (2 dias)**

- [ ] Testes de QA
- [ ] Ajustes de UX
- [ ] Performance
- [ ] Deploy

**Objetivo:** Produção ready

---

## 🎨 Princípios de UX

### **Mobile-First**

- Inputs grandes (min-height: 48px)
- Botões com espaçamento adequado
- Teclado otimizado (numeric, email, tel)
- Scroll suave entre etapas

### **Feedback Visual**

- ✅ Verde: Sucesso / Validado
- ⚠️ Amarelo: Atenção / Informação
- ❌ Vermelho: Erro / Bloqueio
- 🔵 Azul: Ação primária

### **Acessibilidade**

- Labels visíveis em todos os campos
- Aria-labels para screen readers
- Contraste adequado (WCAG AA)
- Navegação por teclado

---

## 📚 Documentação Criada

1. ✅ **`PLANO_CADASTRO_PACIENTE_PUBLICO.md`**
   - Documentação completa e detalhada
   - Wireframes, fluxos, constraints
   - Order of operations no banco
2. ✅ **`VALIDACAO_WHATSAPP_BACKEND.md`**
   - Sistema de validação atual
   - Edge Function, RLS, analytics
3. ✅ **`CADASTRO_PACIENTE_PUBLICO.md`**
   - Documentação inicial (v1.0)
4. ✅ **`RESUMO_IMPLEMENTACAO_CADASTRO.md`** (este arquivo)
   - Resumo executivo
   - Status, próximos passos, cronograma

---

## 🚨 Antes de Deploy

### **Remover em Produção**

- [ ] Campo DEBUG `debug_code` na Edge Function
- [ ] Exibição do código na tela (amarelo)
- [ ] Logs de console desnecessários

### **Configurar**

- [ ] Supabase Cron para limpeza de códigos expirados
- [ ] Webhook de alertas (email/Slack) para bloqueios
- [ ] Monitoramento de rate limiting
- [ ] Analytics de conversão

---

## 🎯 Métricas de Sucesso

### **KPIs**

- Taxa de conclusão do cadastro: > 70%
- Tempo médio de cadastro: < 5 minutos
- Taxa de erro: < 5%
- Taxa de abandono por etapa: < 10%

### **Analytics**

- Total de tentativas de cadastro
- Etapa de maior abandono
- Pediatras mais selecionados
- CEPs mais usados
- Taxa de usuários existentes vs novos

---

## 💡 Melhorias Futuras (Backlog)

- [ ] Validação de CPF na Receita Federal
- [ ] Integração Asaas (criar customer automaticamente)
- [ ] Email de confirmação após cadastro
- [ ] SMS de confirmação (além do WhatsApp)
- [ ] Dashboard para responsável (consultar agendamentos)
- [ ] App mobile nativo (React Native)
- [ ] Assinatura digital de contrato (integração DocuSign/ClickSign)
- [ ] Upload de documentos (RG, CPF, Carteirinha)
- [ ] Integração com planos de saúde

---

**Última atualização:** 2025-10-04  
**Status:** ✅ Etapa 1 concluída, Planejamento completo documentado  
**Próximo passo:** Implementar busca de usuário existente + Etapa 2
