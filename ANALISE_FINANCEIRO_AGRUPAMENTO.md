# 📊 Análise do Financeiro - Agrupamento por Paciente

## ✅ Status: IMPLEMENTADO E AJUSTADO

### 🎯 O que foi solicitado

1. **Investigar erro**: "Consultas sem empresa de faturamento configurada" ao gerar cobrança em massa para:
   - Dauto Coellho Dos Santos Neto
   - Isabel Correa Nasser Nunes

2. **Agrupamento por paciente**: Trocar visualização para agrupar consultas do mesmo paciente, permitindo:
   - Selecionar o paciente inteiro (todas as consultas)
   - Selecionar consultas individuais do paciente
   - Similar ao agrupamento em "Financeiro > Profissionais"

---

## 🔍 O que foi encontrado

### Agrupamento por Paciente: ✅ **JÁ IMPLEMENTADO**

O componente `FinancialConsultationsList` **já possui** o agrupamento por paciente implementado:

**Localização**: `src/components/composed/FinancialConsultationsList.tsx`

**Funcionalidades existentes** (linhas 142-777):

- ✅ Toggle entre modo "List" e "Grouped" (linha 143)
- ✅ Agrupamento automático por `paciente_id` (linhas 688-733)
- ✅ Cards expansíveis por paciente (linhas 1327-1541)
- ✅ Checkbox para selecionar todas consultas do paciente (linhas 746-777)
- ✅ Checkbox individual por consulta dentro do grupo
- ✅ Total de valores e consultas por paciente
- ✅ Indicador de consultas não pagas por paciente
- ✅ Empresa de faturamento exibida no card do paciente

**Como usar**:

1. Acesse "Financeiro > Consultas"
2. Clique no botão de toggle no canto superior direito (ícone de "Users")
3. O modo "Agrupado" mostra os pacientes com suas consultas
4. Clique no nome do paciente para expandir/colapsar
5. No modo de seleção, há checkbox tanto para o paciente quanto para consultas individuais

---

## ❌ Problema do Erro de Empresa de Faturamento

### Causa Raiz

Algumas consultas dos pacientes **não têm o campo `empresa_fatura_id` preenchido** no banco de dados.

A view `vw_agendamentos_completos` retorna este campo, mas ele está vazio (null ou não definido) para algumas consultas antigas ou que foram criadas antes da empresa ser obrigatória.

### ✅ Correção Implementada

**Arquivo modificado**: `src/components/composed/FinancialConsultationsList.tsx` (linhas 832-860)

**O que foi melhorado**:

1. **Validação mais específica**:

   ```typescript
   const consultasSemEmpresa = patientConsultations.filter(
     (c) => !c.empresa_fatura_id
   );
   ```

2. **Mensagem de erro detalhada**:
   - Indica quantas consultas têm problema
   - Mostra o nome do paciente
   - Instrui o usuário a editar as consultas para adicionar a empresa
   - Faz log no console com detalhes (ID, data, serviço) das consultas problemáticas

3. **Mensagem para múltiplas empresas**:
   - Se as consultas do mesmo paciente tiverem empresas diferentes
   - Instrui o usuário a selecionar consultas da mesma empresa

**Exemplo de erro melhorado**:

```
"3 consulta(s) do paciente Dauto Coellho Dos Santos Neto não têm empresa de
faturamento configurada. Por favor, edite estas consultas para adicionar a
empresa de faturamento."
```

---

## 🛠️ Como Resolver os Erros

### Passo 1: Identificar consultas problemáticas

Ao tentar gerar cobrança e receber o erro, verifique o **console do navegador** (F12 > Console).

Você verá um log como:

```javascript
❌ Consultas sem empresa de faturamento:
[
  {
    id: "abc-123",
    data: "2025-01-15",
    servico: "Fisioterapia Respiratória",
    empresa_fatura_id: null
  },
  ...
]
```

### Passo 2: Editar as consultas

Para cada consulta identificada:

1. Acesse "Agenda" ou "Pacientes"
2. Localize o agendamento pela data e paciente
3. Clique para editar o agendamento
4. No campo "Empresa de Faturamento", selecione a empresa correta
5. Salve as alterações

### Passo 3: Gerar cobrança novamente

Após editar todas as consultas, tente gerar a cobrança novamente.

---

## 📋 Casos Especiais

### Consultas com Empresas Diferentes

Se o mesmo paciente tiver consultas faturadas em empresas diferentes, **isso é permitido**, mas:

- ⚠️ **NÃO é possível** gerar uma cobrança única para consultas de empresas diferentes
- ✅ **É possível** ter o paciente "duplicado" no agrupamento (uma vez para cada empresa)
- 💡 **Solução**: Gere cobranças separadas, uma para cada empresa

**Exemplo**:

```
João Silva
  ├─ Empresa A: 3 consultas (selecionar estas)
  └─ Empresa B: 2 consultas (gerar cobrança separada)
```

---

## 🔧 Verificação no Banco de Dados

Para verificar quais consultas não têm empresa configurada, execute no Supabase:

```sql
-- Consultas sem empresa de faturamento
SELECT
  a.id,
  a.data_hora,
  p.nome as paciente_nome,
  ts.nome as servico_nome,
  a.empresa_fatura_id
FROM agendamentos a
JOIN pessoas p ON p.id = a.paciente_id
JOIN tipos_servico ts ON ts.id = a.tipo_servico_id
WHERE a.empresa_fatura_id IS NULL
  AND a.ativo = true
  AND a.status_consulta_id != (SELECT id FROM consulta_status WHERE codigo = 'cancelado')
ORDER BY a.data_hora DESC;
```

Para corrigir em massa (se todas devem ter a mesma empresa):

```sql
-- CUIDADO: Execute apenas se tiver certeza da empresa ID correta
UPDATE agendamentos
SET empresa_fatura_id = 'ID_DA_EMPRESA_AQUI'
WHERE empresa_fatura_id IS NULL
  AND ativo = true;
```

---

## 📝 Resumo

| Item                            | Status          | Observações                                 |
| ------------------------------- | --------------- | ------------------------------------------- |
| Agrupamento por paciente        | ✅ Implementado | Já existe no código, usar toggle "Agrupado" |
| Seleção de paciente inteiro     | ✅ Implementado | Checkbox no card do paciente                |
| Seleção individual              | ✅ Implementado | Checkbox em cada consulta                   |
| Erro de empresa melhorado       | ✅ Corrigido    | Mensagens mais claras e detalhadas          |
| Log de debugging                | ✅ Adicionado   | Console mostra consultas problemáticas      |
| Validação de múltiplas empresas | ✅ Melhorado    | Mensagem específica para este caso          |

---

## 🎯 Próximos Passos

1. **Testar** a geração de cobrança em massa novamente
2. **Verificar** o console para identificar consultas sem empresa
3. **Editar** as consultas problemáticas adicionando a empresa
4. **Configurar** para que novas consultas sempre tenham empresa (já é obrigatório no formulário)

---

## 💡 Dica

Para evitar este problema no futuro, o campo "Empresa de Faturamento" **já é obrigatório** ao criar novos agendamentos (implementado em `AppointmentFormManager.tsx`, linhas 330-331).

As consultas antigas podem ter sido criadas antes desta validação ser adicionada.
