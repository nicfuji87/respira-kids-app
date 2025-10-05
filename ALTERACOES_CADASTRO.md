# 📝 Alterações no Cadastro de Paciente

## ✅ Alterações Implementadas

### 1. CPF do Paciente

- ✅ **Campo CPF**: Mantido sem indicação "(opcional)" na UI
- ✅ **Validação**: CPF aceita NULL no backend
- ✅ **Lógica**: CPF só é obrigatório se emitir nota fiscal no nome do paciente
- ✅ **Backend**: Aceita `cpf_cnpj = NULL` na tabela `pessoas`

**Implementação atual em `PatientDataStep.tsx`:**

```typescript
// CPF do paciente (se emitir nota no nome dele)
{emitirNotaNomePaciente && (
  <div className="space-y-2">
    <Label htmlFor="cpf" className="text-base">
      CPF do paciente <span className="text-destructive">*</span>
    </Label>
    <CPFInput
      id="cpf"
      value={cpf}
      onChange={(value) => {
        setCpf(value);
        if (errors.cpf) setErrors((prev) => ({ ...prev, cpf: '' }));
      }}
      placeholder="000.000.000-00"
      className={cn('h-12 text-base', errors.cpf && 'border-destructive')}
    />
  </div>
)}
```

**Validação:**

```typescript
// CPF obrigatório se emitir nota no nome do paciente
if (emitirNotaNomePaciente && !cpf) {
  newErrors.cpf =
    'CPF é obrigatório para emissão de nota fiscal no nome do paciente';
}
```

### 2. Endereço do Paciente

⚠️ **CRÍTICO**: Paciente agora usa o **MESMO ENDEREÇO** do Responsável Legal

**Antes:**

- Paciente NÃO tinha endereço vinculado
- `id_endereco = NULL`

**Depois:**

- ✅ Paciente usa `id_endereco` do responsável legal
- ✅ Paciente usa `numero_endereco` do responsável legal
- ✅ Paciente usa `complemento_endereco` do responsável legal

**SQL de Inserção:**

```sql
INSERT INTO pessoas (
  nome,
  data_nascimento,
  sexo,
  cpf_cnpj,                      -- NULL se não informado
  id_tipo_pessoa,
  id_endereco,                   -- ✅ MESMO do responsável legal
  numero_endereco,               -- ✅ MESMO do responsável legal
  complemento_endereco,          -- ✅ MESMO do responsável legal
  responsavel_cobranca_id,
  autorizacao_uso_cientifico,
  autorizacao_uso_redes_sociais,
  autorizacao_uso_do_nome,
  ativo
) VALUES (
  'Gabriel Shinji',
  '2025-10-04',
  'M',
  NULL,                          -- Aceita NULL
  '77e2969e-80a4-496a-a858-11f6ee565df8',
  'uuid-endereco-responsavel',   -- ✅ NOVO: mesmo endereço
  '123',                         -- ✅ NOVO: mesmo número
  'Apto 101',                    -- ✅ NOVO: mesmo complemento
  'uuid-responsavel-financeiro',
  true,
  false,
  true,
  true
);
```

---

## 📋 Fluxo de Dados Atualizado

### Cenário 1: Nota Fiscal no Nome do Responsável

```typescript
{
  paciente: {
    nome: "Gabriel Shinji",
    dataNascimento: "04/10/2025",
    sexo: "M",
    cpf: null,                    // ✅ NULL (não obrigatório)
    emitirNotaNomePaciente: false // Nota no nome do responsável
  }
}
```

**Inserção no banco:**

```sql
cpf_cnpj = NULL  -- ✅ Aceito
```

### Cenário 2: Nota Fiscal no Nome do Paciente

```typescript
{
  paciente: {
    nome: "Gabriel Shinji",
    dataNascimento: "04/10/2025",
    sexo: "M",
    cpf: "123.456.789-00",        // ✅ Obrigatório
    emitirNotaNomePaciente: true  // Nota no nome do paciente
  }
}
```

**Inserção no banco:**

```sql
cpf_cnpj = '12345678900'  -- ✅ CPF sem pontos
```

---

## 🎯 Impacto na Edge Function

A Edge Function `public-patient-registration` deve:

### 1. Processar CPF do Paciente

```typescript
// Se CPF informado, remover formatação
const cpfPaciente = registrationData.paciente.cpf
  ? registrationData.paciente.cpf.replace(/\D/g, '')
  : null;
```

### 2. Usar Mesmo Endereço do Responsável Legal

```typescript
// Reutilizar endereço do responsável legal
const pacienteData = {
  nome: registrationData.paciente.nome,
  data_nascimento: registrationData.paciente.dataNascimento,
  sexo: registrationData.paciente.sexo,
  cpf_cnpj: cpfPaciente, // ✅ Aceita NULL
  id_tipo_pessoa: tipoPacienteId,
  id_endereco: endereco_id, // ✅ MESMO do responsável
  numero_endereco: registrationData.endereco.numero,
  complemento_endereco: registrationData.endereco.complemento || null,
  responsavel_cobranca_id: responsavelFinanceiroId,
  autorizacao_uso_cientifico: registrationData.autorizacoes.usoCientifico,
  autorizacao_uso_redes_sociais: registrationData.autorizacoes.usoRedesSociais,
  autorizacao_uso_do_nome: registrationData.autorizacoes.usoNome,
  ativo: true,
};
```

---

## ✅ Checklist de Implementação

- [x] CPF aceita NULL no frontend
- [x] CPF aceita NULL no backend (tabela `pessoas`)
- [x] Validação condicional (obrigatório só se NF no nome do paciente)
- [x] Paciente usa mesmo endereço do responsável legal
- [x] Documentação atualizada (`PLANO_INSERCAO_CADASTRO.md`)
- [ ] Edge Function implementada com nova lógica
- [ ] Testes end-to-end

---

## 📊 Tabela de Comparação

| Campo                  | Antes          | Depois                                        |
| ---------------------- | -------------- | --------------------------------------------- |
| `cpf_cnpj`             | Opcional na UI | Obrigatório apenas se NF no nome do paciente  |
| `id_endereco`          | NULL           | ✅ MESMO do responsável legal                 |
| `numero_endereco`      | NULL           | ✅ MESMO do responsável legal                 |
| `complemento_endereco` | NULL           | ✅ MESMO do responsável legal (pode ser NULL) |

---

**Status**: ✅ Alterações documentadas e validadas
**Próximo passo**: Implementar Edge Function `public-patient-registration`
