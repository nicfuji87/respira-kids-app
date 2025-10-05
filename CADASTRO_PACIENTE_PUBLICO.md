# Cadastro Público de Paciente - Documentação Técnica

## 📋 Visão Geral

Implementação da **Etapa 1** do cadastro público de pacientes: **Validação de WhatsApp**.

Esta funcionalidade permite que pacientes/responsáveis iniciem o cadastro sem necessidade de autenticação, validando primeiro o número de WhatsApp e verificando se já existe cadastro prévio no sistema.

---

## 🏗️ Arquitetura

### Hierarquia de Componentes

```
PatientPublicRegistrationPage (Page)
└── PublicPageLayout (Template)
    └── PatientRegistrationSteps (Domain)
        └── WhatsAppValidationStep (Composed)
            └── PhoneInput (Primitive)
```

### Arquivos Criados

#### **1. Primitives**

- `src/components/primitives/PhoneInput.tsx`
  - Input mobile-first com máscara `(XX) XXXXX-XXXX`
  - Touch-friendly (height: 56px)
  - Estados visuais: validando, válido, inválido
  - Teclado numérico automático

#### **2. Composed**

- `src/components/composed/WhatsAppValidationStep.tsx`
  - Etapa 1 do cadastro
  - Debounce de 800ms para validação
  - Tratamento de pessoa nova vs. pessoa existente
  - Mensagens contextuais

#### **3. Templates**

- `src/components/templates/PublicPageLayout.tsx`
  - Layout para páginas públicas
  - Logo + gradiente + footer
  - Responsivo e consistente

#### **4. Domain**

- `src/components/domain/patient/PatientRegistrationSteps.tsx`
  - Gerenciador de etapas (stepper)
  - Atualmente apenas etapa 1 (WhatsApp)
  - Preparado para etapas futuras

#### **5. Pages**

- `src/pages/PatientPublicRegistrationPage.tsx`
  - Container principal
  - Callbacks de conclusão

#### **6. Routing**

- `src/components/PublicRouter.tsx`
  - Roteamento público isolado
  - Rota: `/cadastro-paciente`

#### **7. API**

- `src/lib/patient-registration-api.ts`
  - `validateWhatsAppAndCheckRegistration()`: Valida WhatsApp + verifica cadastro prévio
  - `trackRegistrationAttempt()`: Analytics (preparado para implementação futura)

#### **8. Integration**

- `src/App.tsx`
  - Integração de rota pública ANTES da autenticação
  - Verificação via `window.location.hash`

---

## 🔄 Fluxo de Validação

### 1. Usuário digita telefone

```
(61) 98144-6666
```

### 2. Limpeza e formatação

```javascript
cleanPhone = '61981446666'; // Remove formatação
```

### 3. Webhook de validação

```http
POST https://webhooks-i.infusecomunicacao.online/webhook/verificaWhatsApp
Content-Type: application/json

{
  "whatsapp": "61981446666"
}
```

### 4. Resposta do webhook

```json
[
  {
    "jid": "556181446666@s.whatsapp.net",
    "exists": true,
    "number": "5561981446666",
    "name": ""
  }
]
```

### 5. Extração do número limpo

```javascript
// Remove código do país (55)
phoneNumberForDB = '61981446666';
```

### 6. Consulta no Supabase

```sql
SELECT id, nome
FROM pessoas
WHERE telefone = 61981446666
  AND ativo = true
```

### 7. Envio do código de validação

Ao clicar em "Verificar número":

- Gera código aleatório de 6 dígitos
- Registra na `webhook_queue`
- Envia webhook para `https://webhooks-i.infusecomunicacao.online/webhook/webhookRK`

```json
{
  "tipo": "validar_whatsapp",
  "timestamp": "2025-10-03T01:59:16.901267+00:00",
  "data": {
    "whatsapp": "556181446666",
    "codigo": "347256",
    "created_at": "2025-10-03T01:59:16.901267+00:00"
  },
  "webhook_id": "838ca758-3482-4cac-aa88-e119a1a4e61b"
}
```

### 8. Validação do código

- Usuário recebe código no WhatsApp
- Digita código na interface
- Sistema valida código (comparação local por enquanto)
- Se correto, prossegue para próxima etapa

### 9. Resposta baseada no resultado

#### **Caso A: WhatsApp inválido**

```json
{
  "isValid": false,
  "personExists": false,
  "errorMessage": "Insira um número válido no WhatsApp"
}
```

#### **Caso B: WhatsApp válido + Pessoa NÃO cadastrada**

```json
{
  "isValid": true,
  "personExists": false,
  "phoneNumber": "61981446666"
}
```

#### **Caso C: WhatsApp válido + Pessoa JÁ cadastrada**

```json
{
  "isValid": true,
  "personExists": true,
  "personId": "uuid-da-pessoa",
  "personFirstName": "João",
  "relatedPatients": [
    { "id": "uuid-paciente-1", "nome": "Maria Silva" },
    { "id": "uuid-paciente-2", "nome": "Pedro Silva" }
  ],
  "phoneNumber": "61981446666"
}
```

---

## 🎨 UI/UX

### Estados Visuais

#### **1. Estado Inicial**

- Input vazio
- Placeholder: "(00) 00000-0000"
- Ícone de telefone à esquerda

#### **2. Digitando**

- Máscara aplicada automaticamente
- Sem validação até completar 11 dígitos

#### **3. Validando (após 800ms)**

- Spinner à direita do input
- Input desabilitado
- Mensagem: "Verificando WhatsApp..."

#### **4. WhatsApp Inválido**

- Borda vermelha
- Ícone de erro (X) à direita
- Mensagem: "Insira um número válido no WhatsApp"
- Botão "Continuar" desabilitado

#### **5. WhatsApp Válido - Pessoa Nova**

- Borda verde
- Ícone de sucesso (✓) à direita
- Card verde: "✅ WhatsApp válido!"
- Observação: "Clique no botão abaixo para receber um código de validação no seu WhatsApp."
- Botão "Verificar número" habilitado

#### **6. WhatsApp Válido - Pessoa Existente**

- Borda verde
- Ícone de sucesso (✓) à direita
- Card azul com:
  - Título: "Seja bem-vindo novamente, [Nome]! 👋"
  - Subtítulo: "Encontramos seu cadastro em nosso sistema."
  - Lista de pacientes relacionados (se houver)
  - Pergunta: "Gostaria de cadastrar um novo paciente?"
  - Botão: "Sim, cadastrar novo paciente"

---

## 🧪 Como Testar

### **Pré-requisitos**

1. Servidor de desenvolvimento rodando: `npm run dev`
2. Supabase configurado e populado com dados de teste

### **Teste 1: WhatsApp Inválido**

1. Acesse: `http://localhost:5173/#/cadastro-paciente`
2. Digite: `(61) 99999-9999` (número inexistente)
3. Aguarde 800ms (debounce)
4. **Resultado esperado**: Mensagem de erro "Insira um número válido no WhatsApp"

### **Teste 2: WhatsApp Válido - Pessoa Nova com Código**

1. Acesse: `http://localhost:5173/#/cadastro-paciente`
2. Digite um número válido no WhatsApp que NÃO está no banco
3. Aguarde validação
4. **Resultado esperado**:
   - Borda verde
   - Card de sucesso
   - Botão "Verificar número" habilitado
5. Clique em "Verificar número"
6. **Resultado esperado**:
   - Código enviado para WhatsApp (verificar console)
   - Interface muda para campo de código
7. Digite o código recebido (6 dígitos)
8. Clique em "Validar código"
9. **Resultado esperado**:
   - Código validado
   - Toast de sucesso

### **Teste 3: WhatsApp Válido - Pessoa Existente**

1. Acesse: `http://localhost:5173/#/cadastro-paciente`
2. Digite um número válido que JÁ está cadastrado no banco
3. Aguarde validação
4. **Resultado esperado**:
   - Borda verde
   - Card azul com boas-vindas
   - Lista de pacientes relacionados
   - Botão "Sim, cadastrar novo paciente"

### **Teste 4: Responsividade Mobile**

1. Abra Chrome DevTools (F12)
2. Ative modo mobile (Toggle device toolbar)
3. Selecione iPhone 12 Pro ou similar
4. Repita testes 1-3
5. **Verificar**:
   - Touch targets ≥ 44x44px
   - Texto legível sem zoom
   - Teclado numérico aparece automaticamente
   - Layout sem scroll horizontal

### **Teste 5: Analytics**

1. Abra console do navegador
2. Digite um número e aguarde validação
3. **Resultado esperado**: Log no console com dados da tentativa:
   ```javascript
   📊 Analytics - Tentativa de cadastro: {
     phone_number: "61981446666",
     validation_success: true,
     person_exists: false
   }
   ```

---

## 🔐 Segurança

### **Dados Sensíveis**

- ✅ Telefone é validado via webhook seguro (HTTPS)
- ✅ Apenas número é armazenado (sem nomes ou emails nesta etapa)
- ✅ RLS (Row Level Security) no Supabase protege dados de `pessoas`

### **Validação**

- ✅ Timeout de 8 segundos para evitar travamento
- ✅ Abort controller para cancelar requisições pendentes
- ✅ Formato de telefone brasileiro validado (11 dígitos)

### **LGPD**

- ✅ Mensagem de conformidade exibida na tela
- ✅ Analytics (quando implementado) deve ser opt-in

---

## 🚀 Próximos Passos (Etapas Futuras)

### **Etapa 2: Dados do Paciente**

- Nome completo
- Data de nascimento
- CPF (opcional para menores)
- Responsável legal (se menor de idade)

### **Etapa 3: Dados do Responsável Financeiro**

- Nome completo
- CPF
- Email
- Endereço (CEP + número)

### **Etapa 4: Fonte de Indicação**

- Como conheceu a clínica?
- Indicação de outro paciente?

### **Etapa 5: Confirmação e Termos**

- Revisão dos dados
- Aceite de LGPD
- Autorização de uso científico/redes sociais
- Geração de contrato

### **Implementações Técnicas Pendentes**

1. **Tabela de Analytics**

   ```sql
   CREATE TABLE patient_registration_tracking (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     phone_number TEXT NOT NULL,
     validation_success BOOLEAN NOT NULL,
     person_exists BOOLEAN NOT NULL,
     error_message TEXT,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```

2. **Stepper Visual**
   - Indicador de progresso (1/5, 2/5, etc.)
   - Navegação entre etapas

3. **Persistência de Estado**
   - LocalStorage ou SessionStorage
   - Recuperar cadastro incompleto

4. **Notificações**
   - Email de confirmação após conclusão
   - WhatsApp com link de acompanhamento

---

## 📝 Notas Técnicas

### **Por que HashRouter e não BrowserRouter?**

O sistema usa `HashRouter` para compatibilidade com Vercel e GitHub Pages (SPAs sem SSR).

### **Por que debounce de 800ms?**

Balance entre UX (não validar a cada tecla) e responsividade (não esperar demais).

### **Por que separar PublicRouter de AppRouter?**

- Isolamento de rotas públicas vs. autenticadas
- Facilita testes e manutenção
- Evita poluir lógica de autenticação

### **Por que BigInt no banco?**

Campo `telefone` em `pessoas` é `BIGINT` para otimização de índices e queries numéricas.

---

## 🐛 Troubleshooting

### **Problema: Webhook não responde**

- **Causa**: Timeout ou instabilidade do serviço externo
- **Solução**: Mensagem amigável "Tente novamente" é exibida

### **Problema: Pessoa não encontrada mesmo com telefone correto**

- **Causa**: Formato do número pode estar diferente
- **Debug**:
  ```sql
  SELECT id, nome, telefone
  FROM pessoas
  WHERE telefone::text LIKE '%61981446666%';
  ```
- **Solução**: Verificar se número no banco tem mesmo formato (sem código do país)

### **Problema: Página pública redireciona para login**

- **Causa**: Verificação `isPublicRoute` pode estar falhando
- **Debug**: Console.log em `App.tsx` linha 20
- **Solução**: Limpar cache e cookies do navegador

---

## 📊 Métricas de Sucesso (KPIs)

- **Taxa de validação bem-sucedida**: > 90%
- **Tempo médio de validação**: < 3 segundos
- **Taxa de conclusão da etapa 1**: > 80%
- **Erros de webhook**: < 5%

---

**Documentação atualizada em**: 04/10/2025  
**Versão**: 1.0.0 (Etapa 1 - WhatsApp Validation)
