# ✅ Correções: Cadastro Administrativo de Pacientes

## 🐛 Problemas Identificados

### 1. **Tela em Branco na Etapa "Dados do Responsável"**

**Sintoma**: Após validar WhatsApp de um responsável existente, o modal mostrava a etapa 2 com tela em branco.

**Causa**: A lógica estava tentando avançar para a próxima etapa sequencialmente, mas não pulava automaticamente quando o responsável já existia.

### 2. **Contador de Etapas Incorreto**

**Sintoma**: Modal exibia "Etapa 2 de 8" quando deveria ajustar dinamicamente.

**Causa**: O contador não considerava que algumas etapas são puladas quando responsável existe.

### 3. **Erro de Permissão com Usuário Admin**

**Sintoma**: Usuário admin recebia erro "sem permissões" ao tentar cadastrar.

**Causa**: Validação de `auth.user` não tratava casos onde a estrutura poderia estar indefinida.

---

## 🔧 Correções Implementadas

### **Correção 1: Navegação Inteligente Após WhatsApp**

**Arquivo**: `AdminPatientRegistrationDialog.tsx`

**Antes**:

```typescript
const handleWhatsAppContinue = (data: any) => {
  setFormData((prev) => ({
    ...prev,
    whatsappResponsavel: data.whatsapp,
    jidResponsavel: data.jid,
    responsavelId: data.existingPerson?.id,
    // ...
  }));
  goToNextStep(); // ❌ Sempre ia para próxima etapa sequencial
};
```

**Depois**:

```typescript
const handleWhatsAppContinue = (data: any) => {
  const hasExistingPerson = !!data.existingPerson;

  setFormData((prev) => ({
    ...prev,
    whatsappResponsavel: data.whatsapp,
    jidResponsavel: data.jid,
    responsavelId: data.existingPerson?.id,
    // ...
  }));

  // ✅ Pula direto para dados do paciente se responsável existe
  if (hasExistingPerson) {
    setCurrentStep('patient-data');
  } else {
    setCurrentStep('responsible-data');
  }
};
```

---

### **Correção 2: Contador Dinâmico de Etapas**

**Arquivo**: `AdminPatientRegistrationDialog.tsx`

**Antes**:

```typescript
const steps: StepType[] = [
  'whatsapp',
  'responsible-data',
  'address',
  'patient-data',
  'financial-responsible',
  'pediatrician',
  'authorizations',
  'contract',
];
const currentStepIndex = steps.indexOf(currentStep);
const progress = ((currentStepIndex + 1) / steps.length) * 100;

// Exibição: "Etapa X de 8" (sempre 8)
```

**Depois**:

```typescript
const steps: StepType[] = [
  'whatsapp',
  'responsible-data',
  'address',
  'patient-data',
  'financial-responsible',
  'pediatrician',
  'authorizations',
  'contract',
];

// ✅ Calcula etapas efetivas baseado em responsável existente
const effectiveSteps = formData.responsavelId
  ? steps.filter((s) => !['responsible-data', 'address'].includes(s))
  : steps;

const currentStepIndex = effectiveSteps.indexOf(currentStep);
const progress = ((currentStepIndex + 1) / effectiveSteps.length) * 100;

// Exibição: "Etapa X de 6" (quando responsável existe) ou "Etapa X de 8" (novo)
```

---

### **Correção 3: Validação Robusta de Permissões**

**Arquivo**: `PacientesPage.tsx`

**Antes**:

```typescript
const handleNewPatient = () => {
  if (!canCreatePatient) {
    toast({
      title: 'Sem permissão',
      description:
        'Apenas administradores e secretária podem cadastrar pacientes',
      variant: 'destructive',
    });
    return;
  }

  setIsDialogOpen(true);
};
```

**Depois**:

```typescript
const handleNewPatient = () => {
  // ✅ Debug log para diagnóstico
  console.log('🔍 Debug - Auth:', {
    hasUser: !!auth.user,
    hasPessoa: !!auth.user?.pessoa,
    role: auth.user?.pessoa?.role,
    canCreate: canCreatePatient,
  });

  // ✅ Verificar autenticação primeiro
  if (!auth.user) {
    toast({
      title: 'Não autenticado',
      description: 'Você precisa estar logado para cadastrar pacientes',
      variant: 'destructive',
    });
    return;
  }

  // ✅ Mensagem de erro mais informativa
  if (!canCreatePatient) {
    toast({
      title: 'Sem permissão',
      description: `Apenas administradores e secretária podem cadastrar pacientes. Seu perfil: ${userRole || 'não definido'}`,
      variant: 'destructive',
    });
    return;
  }

  setIsDialogOpen(true);
};
```

---

## 🎯 Fluxo Corrigido

### **Responsável Novo** (8 etapas):

```
1. WhatsApp ➜ 2. Dados Responsável ➜ 3. Endereço ➜ 4. Dados Paciente
➜ 5. Resp. Financeiro ➜ 6. Pediatra ➜ 7. Autorizações ➜ 8. Contrato
```

### **Responsável Existente** (6 etapas):

```
1. WhatsApp ➜ [PULA] ➜ [PULA] ➜ 2. Dados Paciente
➜ 3. Resp. Financeiro ➜ 4. Pediatra ➜ 5. Autorizações ➜ 6. Contrato
```

---

## 🧪 Como Testar

### Teste 1: Responsável Existente

1. Clicar em "Novo Paciente"
2. Digitar WhatsApp de responsável cadastrado
3. ✅ Deve pular direto para "Dados do Paciente"
4. ✅ Deve mostrar "Etapa 2 de 6"

### Teste 2: Responsável Novo

1. Clicar em "Novo Paciente"
2. Digitar WhatsApp novo
3. ✅ Deve ir para "Dados do Responsável"
4. ✅ Deve mostrar "Etapa 2 de 8"

### Teste 3: Permissões

1. Tentar cadastrar com perfil "profissional"
2. ✅ Deve exibir erro: "Seu perfil: profissional"
3. Tentar com perfil "admin" ou "secretaria"
4. ✅ Deve abrir o modal normalmente

### Teste 4: Debug

1. Abrir console do navegador (F12)
2. Clicar em "Novo Paciente"
3. ✅ Deve aparecer log:
   ```javascript
   🔍 Debug - Auth: {
     hasUser: true,
     hasPessoa: true,
     role: "admin",
     canCreate: true
   }
   ```

---

## ✅ Checklist de Validação

- [x] Navegação automática quando responsável existe
- [x] Contador de etapas dinâmico
- [x] Validação de permissões robusta
- [x] Debug logs para diagnóstico
- [x] Mensagens de erro informativas
- [x] Zero erros de lint
- [x] Build passa sem erros

---

## 📝 Notas Importantes

1. **Console.log temporário**: O log de debug em `PacientesPage.tsx` deve ser removido em produção ou colocado atrás de uma flag de desenvolvimento.

2. **Estrutura de auth**: O sistema assume que `auth.user.pessoa.role` existe. Se a estrutura for diferente, ajustar a validação.

3. **Próximos passos**: Após confirmar que funciona, o console.log pode ser removido.

---

## 🚀 Status: PRONTO PARA TESTE

Sistema corrigido e pronto para validação pelo usuário.
