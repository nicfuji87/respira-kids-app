# 🐛 CORREÇÃO CRÍTICA: Erro de Estado (UF)

## ❌ Problema Reportado

**Usuário**: Cliente tentando cadastrar segundo filho  
**Erro**: `Erro ao finalizar cadastro: Erro: Estado (UF) deve ter exatamente 2 caracteres (ex: SP, RJ, MG)`

```
Stack: Error: Erro: Estado (UF) deve ter exatamente 2 caracteres (ex: SP, RJ, MG)
  at Object.handler (file:///var/tmp/sb-compile-edge-runtime/source/index.ts:163:15)
```

---

## 🔍 Diagnóstico via MCP Supabase

### Constraint do Banco:
```sql
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'enderecos'::regclass
  AND conname LIKE '%estado%';

-- Resultado:
CHECK ((length(estado) = 2))
```

**Conclusão**: O banco **exige** que o campo `estado` tenha exatamente **2 caracteres** (sigla UF como SP, RJ, MG, DF, etc).

---

## 🐛 Causa Raiz

O código tinha **3 problemas**:

### 1. **Estado Vazio Sendo Salvo**
```typescript
// ❌ PROBLEMA
const { data, error } = await supabase
  .from('enderecos')
  .insert({
    cep: '...',
    logradouro: '...',
    estado: addressData.estado || '',  // ← '' viola constraint!
  });
```

### 2. **Dados Incompletos do Frontend**
```typescript
// ❌ PROBLEMA
enderecoPacienteId = await getOrCreateAddress({
  cep: data.cepPaciente!,
  // ← Faltavam logradouro, bairro, cidade, estado!
});
```

### 3. **Frontend Não Passava Dados do ViaCEP**
```typescript
// ❌ PROBLEMA (AdminPatientDataStep)
onContinue({
  nome: formData.nome,
  cep: formData.cep,
  // ← Faltavam dados do addressData (ViaCEP)!
});
```

---

## ✅ Soluções Aplicadas

### **Solução 1: Validação Antes de Inserir**

**Arquivo**: `src/lib/admin-patient-registration-api.ts`

```typescript
// Criar novo endereço
// AI dev note: estado deve ter exatamente 2 caracteres (sigla UF)
if (!addressData.estado || addressData.estado.length !== 2) {
  throw new Error('Estado (UF) deve ter exatamente 2 caracteres (ex: SP, RJ, MG)');
}

const { data, error } = await supabase
  .from('enderecos')
  .insert({
    cep: addressData.cep.replace(/\D/g, ''),
    logradouro: addressData.logradouro || '',
    bairro: addressData.bairro || '',
    cidade: addressData.cidade || '',
    estado: addressData.estado,  // ✅ Garantido 2 caracteres
    ativo: true,
  });
```

---

### **Solução 2: Frontend Passa Dados Completos**

**Arquivo**: `src/components/composed/AdminPatientDataStep.tsx`

```typescript
const handleContinue = () => {
  if (validateForm()) {
    onContinue({
      ...formData,
      email: formData.usarEmailResponsavel ? responsavelData.email : formData.email,
      // ✅ Incluir dados completos do ViaCEP
      logradouro: !formData.usarEnderecoResponsavel ? addressData?.logradouro : undefined,
      bairro: !formData.usarEnderecoResponsavel ? addressData?.bairro : undefined,
      cidade: !formData.usarEnderecoResponsavel ? addressData?.cidade : undefined,
      estado: !formData.usarEnderecoResponsavel ? addressData?.estado : undefined,  // ✅ UF do ViaCEP
    });
  }
};
```

---

### **Solução 3: Backend Usa Dados do Frontend**

**Arquivo**: `src/lib/admin-patient-registration-api.ts`

```typescript
// 3. Determinar endereço do paciente
if (data.usarEnderecoResponsavel) {
  // Usar endereço do responsável
  enderecoPacienteId = responsavelData?.id_endereco;
} else {
  // ✅ Usar dados que vieram do frontend
  if (data.logradouro && data.bairro && data.cidade && data.estado) {
    enderecoPacienteId = await getOrCreateAddress({
      cep: data.cepPaciente!,
      logradouro: data.logradouro,     // ✅ Do ViaCEP
      bairro: data.bairro,             // ✅ Do ViaCEP
      cidade: data.cidade,             // ✅ Do ViaCEP
      estado: data.estado,             // ✅ Do ViaCEP (UF com 2 chars)
    });
  } else {
    // Fallback: buscar ViaCEP no backend
    const viaCepResponse = await fetch(`...`);
    const viaCepData = await viaCepResponse.json();
    
    enderecoPacienteId = await getOrCreateAddress({
      cep: data.cepPaciente!,
      logradouro: viaCepData.logradouro,
      bairro: viaCepData.bairro,
      cidade: viaCepData.localidade,
      estado: viaCepData.uf,  // ✅ UF sempre tem 2 chars
    });
  }
}
```

---

### **Solução 4: Dialog Salva Dados Completos**

**Arquivo**: `src/components/composed/AdminPatientRegistrationDialog.tsx`

```typescript
const handlePatientDataContinue = (data: {
  // ... outros campos
  logradouro?: string;   // ✅ Adicionado
  bairro?: string;       // ✅ Adicionado
  cidade?: string;       // ✅ Adicionado
  estado?: string;       // ✅ Adicionado
}) => {
  setFormData((prev) => ({
    ...prev,
    nomePaciente: data.nome,
    // ... outros campos
    // ✅ Salvar dados completos do endereço
    logradouro: data.usarEnderecoResponsavel ? prev.logradouro : data.logradouro,
    bairro: data.usarEnderecoResponsavel ? prev.bairro : data.bairro,
    cidade: data.usarEnderecoResponsavel ? prev.cidade : data.cidade,
    estado: data.usarEnderecoResponsavel ? prev.estado : data.estado,
  }));
};
```

---

## 📊 Fluxo Corrigido

### **Caso 1: Paciente USA Endereço do Responsável**
```
1. AdminPatientDataStep: Checkbox "Mesmo endereço" = SIM
2. onContinue: Não passa dados de endereço
3. Backend: Busca id_endereco do responsável
4. ✅ Usa endereço já existente (válido)
```

### **Caso 2: Paciente TEM Endereço Próprio**
```
1. AdminPatientDataStep: Checkbox "Mesmo endereço" = NÃO
2. Usuário digita CEP → ViaCEP busca automaticamente
3. addressData preenchido: { logradouro, bairro, cidade, estado: "DF" }
4. onContinue: Passa dados completos com estado="DF" (2 chars ✅)
5. Backend: Recebe dados completos e valida
6. ✅ Cria endereço com estado válido
```

---

## 🔐 Proteções Adicionadas

### **Proteção 1: Validação Explícita**
```typescript
if (!addressData.estado || addressData.estado.length !== 2) {
  throw new Error('Estado (UF) deve ter exatamente 2 caracteres (ex: SP, RJ, MG)');
}
```

### **Proteção 2: Fallback para ViaCEP**
Se dados não vieram do frontend, busca automaticamente no backend.

### **Proteção 3: Dados Completos do Frontend**
`AdminPatientDataStep` agora busca ViaCEP e passa todos os campos.

---

## ✅ Testes de Validação

### Teste 1: Paciente com Mesmo Endereço
- ✅ Usa id_endereco do responsável
- ✅ Não tenta criar novo endereço
- ✅ Sem erros

### Teste 2: Paciente com Endereço Diferente
- ✅ ViaCEP busca dados completos
- ✅ Estado vem como "SP" (2 chars)
- ✅ Validação passa
- ✅ Endereço criado com sucesso

### Teste 3: CEP Inválido
- ✅ Erro: "CEP não encontrado"
- ✅ Não tenta salvar
- ✅ Usuário pode corrigir

---

## 🚀 Commit

**Hash**: `9eac2b1`  
**Mudanças**:
- 3 arquivos modificados
- 57 linhas adicionadas
- 5 linhas removidas

---

## 📝 Como Testar

1. **Login como admin/secretaria**
2. Ir em "Pacientes" → "Novo Paciente"
3. **Caso A**: Checkbox "Mesmo endereço" = SIM
   - ✅ Deve funcionar sem erros
4. **Caso B**: Checkbox "Mesmo endereço" = NÃO
   - Digite CEP (ex: 70000-000)
   - Aguarde ViaCEP carregar
   - Digite número da residência
   - Continue o cadastro
   - ✅ Deve criar paciente sem erro de Estado

---

## ✅ Status: RESOLVIDO

O cliente agora pode cadastrar o segundo filho sem erros!

- ✅ Validação de estado (2 caracteres)
- ✅ Dados completos do ViaCEP
- ✅ Fallback robusto
- ✅ Mensagens de erro claras
