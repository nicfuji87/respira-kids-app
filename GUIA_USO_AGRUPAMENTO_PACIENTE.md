# 🎯 Guia de Uso: Agrupamento de Consultas por Paciente

## 📍 Localização

**Financeiro → Consultas**

---

## 🔄 Como Alternar entre Visualizações

### Botão de Toggle (Canto Superior Direito)

O botão muda entre dois modos:

| Modo         | Ícone    | Descrição                          |
| ------------ | -------- | ---------------------------------- |
| **Agrupado** | 👥 Users | Agrupa consultas por paciente      |
| **Lista**    | 📋 List  | Mostra todas as consultas em lista |

---

## 👥 Modo AGRUPADO (Recomendado)

### Visualização

```
┌─────────────────────────────────────────────────┐
│  👤 João Silva              3 consultas  2 não pagas  │
│  💰 Total: R$ 450,00                                 │
│  🏢 Empresa: Respira Kids                           │
│                                          [ ⌄ ]       │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  👤 Maria Santos            5 consultas  5 não pagas  │
│  💰 Total: R$ 750,00                                 │
│  🏢 Empresa: Respira Kids                           │
│                                          [ ⌄ ]       │
└─────────────────────────────────────────────────┘
```

### Funcionalidades

#### 1️⃣ Expandir/Colapsar Paciente

- **Clique no card do paciente** para ver/ocultar as consultas
- O ícone muda:
  - `[ ⌄ ]` = Expandir
  - `[ ⌃ ]` = Colapsar

#### 2️⃣ Ver Detalhes de Cada Consulta (Quando Expandido)

```
┌─────────────────────────────────────────────────┐
│  👤 João Silva              3 consultas  2 não pagas  │
│  💰 Total: R$ 450,00                                 │
│  🏢 Empresa: Respira Kids                           │
│                                          [ ⌃ ]       │
├─────────────────────────────────────────────────┤
│  📅 15/01/2025  14:00-15:00  Fisioterapia           │
│  👨‍⚕️ Dr. Carlos    📍 Clínica Central                │
│  💰 R$ 150,00  🟡 Pendente                    [ > ] │
├─────────────────────────────────────────────────┤
│  📅 18/01/2025  14:00-15:00  Fisioterapia           │
│  👨‍⚕️ Dr. Carlos    📍 Clínica Central                │
│  💰 R$ 150,00  🟡 Pendente                    [ > ] │
├─────────────────────────────────────────────────┤
│  📅 22/01/2025  14:00-15:00  Fisioterapia           │
│  👨‍⚕️ Dr. Carlos    📍 Clínica Central                │
│  💰 R$ 150,00  ✅ Pago                        [ > ] │
└─────────────────────────────────────────────────┘
```

---

## ✅ Modo de Seleção para Cobrança em Massa

### 1️⃣ Ativar Modo de Seleção

Clique no botão **"Selecionar"** (canto superior direito)

### 2️⃣ Três Formas de Selecionar

#### Opção A: Selecionar Paciente Inteiro

- **Checkbox ao lado do nome do paciente**
- ✅ Seleciona TODAS as consultas não pagas do paciente automaticamente
- ⚠️ Consultas pagas ou canceladas não são selecionadas

```
┌─────────────────────────────────────────────────┐
│  [✓] 👤 João Silva          2 consultas não pagas   │
│       💰 Total não pago: R$ 300,00                  │
│                                          [ ⌄ ]       │
└─────────────────────────────────────────────────┘
```

#### Opção B: Selecionar Consultas Individuais

1. Expanda o card do paciente
2. Marque o checkbox de cada consulta desejada

```
┌─────────────────────────────────────────────────┐
│  [ ] 👤 João Silva          3 consultas  2 não pagas  │
│                                          [ ⌃ ]       │
├─────────────────────────────────────────────────┤
│  [✓] 📅 15/01  14:00  Fisioterapia  R$ 150,00 🟡  │
│  [✓] 📅 18/01  14:00  Fisioterapia  R$ 150,00 🟡  │
│  [ ] 📅 22/01  14:00  Fisioterapia  R$ 150,00 ✅  │ ← Pago (não pode)
└─────────────────────────────────────────────────┘
```

#### Opção C: Selecionar Todos Não Pagos

- Use o botão **"Selecionar TODAS não pagas"**
- Seleciona TODAS as consultas não pagas de TODOS os pacientes
- ⚠️ Use com cuidado em períodos longos!

### 3️⃣ Gerar Cobrança

```
┌─────────────────────────────────────────────────┐
│  [ X Cancelar ]  [ 💳 Gerar Cobranças (5) ]        │
└─────────────────────────────────────────────────┘

         ⚠️ IMPORTANTE ⚠️
As consultas são agrupadas POR PACIENTE
Cada paciente terá UMA cobrança gerada
```

### 4️⃣ Resultado

```
✅ Cobranças processadas

3 paciente(s) com sucesso:
• João Silva: R$ 300,00
• Maria Santos: R$ 750,00
• Pedro Costa: R$ 200,00

❌ 1 com falha:
• Ana Oliveira: 2 consulta(s) não têm empresa de
  faturamento configurada
```

---

## 🔍 Filtros Disponíveis (Ambos os Modos)

### Filtros de Pesquisa

| Filtro                  | Descrição                                          | Exemplo        |
| ----------------------- | -------------------------------------------------- | -------------- |
| 🔍 **Busca**            | Nome do paciente ou responsáveis                   | "João Silva"   |
| 📅 **Período**          | Mês atual, anterior, últimos X dias, personalizado | "Mês atual"    |
| 👨‍⚕️ **Profissional**     | Filtrar por profissional específico                | "Dr. Carlos"   |
| 💼 **Tipo de Serviço**  | Filtrar por tipo de consulta                       | "Fisioterapia" |
| 💰 **Status Pagamento** | Pago, Pendente, Em aberto, Cancelado               | "Pendente"     |
| 🔄 **Ordenação**        | Data, Paciente, Valor                              | "Paciente A-Z" |

### Botão "Limpar"

- Remove todos os filtros aplicados
- Volta para visualização padrão (Mês atual)

---

## ⚠️ Regras e Restrições

### ❌ Consultas que NÃO podem ser selecionadas:

1. **Consultas Pagas** ✅ (já foram cobradas)
2. **Consultas Canceladas** ⛔
3. **Consultas com Fatura** 🧾 (já têm cobrança gerada)
4. **Consultas sem Empresa de Faturamento** 🏢❌

### ⚠️ Validações ao Gerar Cobrança:

1. **Empresa obrigatória**: Todas as consultas devem ter `empresa_fatura_id`
2. **Mesma empresa**: Consultas do mesmo paciente devem ter a mesma empresa
3. **CPF obrigatório**: Paciente/responsável deve ter CPF cadastrado
4. **Permissão**: Apenas usuários Admin podem gerar cobranças

---

## 💡 Casos Especiais

### Paciente com Consultas em Empresas Diferentes

```
Cenário:
• João Silva tem 3 consultas na "Respira Kids"
• João Silva tem 2 consultas na "Clínica ABC"
```

**Como aparecem**:

```
┌─────────────────────────────────────────────────┐
│  👤 João Silva              3 consultas           │
│  🏢 Empresa: Respira Kids                         │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  👤 João Silva              2 consultas           │
│  🏢 Empresa: Clínica ABC                          │
└─────────────────────────────────────────────────┘
```

**Ação necessária**:

- ✅ Selecione cada grupo separadamente
- ✅ Gere cobranças em lotes diferentes
- ❌ NÃO tente selecionar consultas de empresas diferentes juntas

---

## 🐛 Troubleshooting

### ❌ Erro: "Consultas sem empresa de faturamento configurada"

**Causa**: Consultas antigas ou criadas antes da validação

**Solução**:

1. Veja o console do navegador (F12 → Console)
2. Identifique os IDs das consultas problemáticas
3. Edite cada consulta (Agenda ou Pacientes)
4. Adicione a empresa de faturamento
5. Salve e tente novamente

**Ou use o SQL**:

- Execute `SQL_VERIFICAR_CONSULTAS_SEM_EMPRESA.sql`
- Identifique as consultas
- Use os scripts de correção se apropriado

### ⚠️ Checkbox do Paciente Desabilitado

**Causa**: Paciente não tem consultas elegíveis para cobrança

**Motivos possíveis**:

- Todas as consultas já foram pagas
- Todas têm fatura gerada
- Todas estão canceladas
- Nenhuma tem empresa configurada

**Solução**: Expanda o card e verifique o status individual de cada consulta

### 🔄 Seleções "Somem" ao Mudar de Página

**Isso é normal!** ✅

- Seleções são mantidas entre páginas
- O indicador mostra: "X consultas selecionadas"
- Volte à página anterior para ver as consultas selecionadas
- Use "Limpar tudo" para remover todas as seleções

---

## 📊 Resumo de Totais

Na parte inferior da lista, você sempre verá:

```
┌─────────────────────────────────────────────────┐
│  Total de consultas: 127                          │
│  Valor total: R$ 19.050,00                        │
│  Não pagas: 45                                    │
│  Pagas: 82                                        │
└─────────────────────────────────────────────────┘
```

**Nota**: Estes valores refletem TODAS as consultas do filtro atual, não apenas a página visível.

---

## 🎯 Workflow Recomendado

### Para Cobrança Mensal em Massa:

1. **Filtrar período**: "Mês anterior"
2. **Ativar modo**: "Agrupado" 👥
3. **Clicar em**: "Selecionar"
4. **Usar**: "Selecionar TODAS não pagas"
5. **Revisar**: Número de consultas selecionadas
6. **Gerar**: Cobranças em massa
7. **Verificar**: Relatório de sucessos/falhas
8. **Corrigir**: Erros se necessário
9. **Repetir**: Passo 6 para consultas corrigidas

### Para Cobrança de Paciente Específico:

1. **Buscar**: Nome do paciente
2. **Modo**: Agrupado ou Lista (tanto faz)
3. **Selecionar**: Checkbox do paciente (modo agrupado)
   - OU marcar consultas individuais (modo lista)
4. **Gerar**: Cobrança
5. **Confirmar**: Sucesso

---

## 📌 Atalhos e Dicas

- 🔍 Use **Ctrl+F** no navegador para buscar na página atual
- 📊 Ordene por "Paciente A-Z" para facilitar navegação
- 🔄 Use filtro de "Status: Pendente" + "Selecionar TODAS" para cobrança mensal
- 💡 Expanda apenas os pacientes necessários para performance
- 🎯 Use período curto primeiro para testar

---

## ✅ Checklist Antes de Gerar Cobranças

- [ ] Período correto selecionado
- [ ] Filtros aplicados conforme necessário
- [ ] Número de seleções revisado
- [ ] Modo de agrupamento adequado ao caso
- [ ] Sem erros visíveis de empresa de faturamento
- [ ] Pacientes com CPF cadastrado
- [ ] Token ASAAS configurado nas empresas

---

## 📞 Suporte

Se o problema persistir:

1. Verifique o console do navegador (F12)
2. Execute os SQLs de verificação
3. Documente o erro completo
4. Entre em contato com suporte técnico

---

**Última atualização**: 08/10/2025
