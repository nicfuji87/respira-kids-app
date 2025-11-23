# ✅ Implementação: Reagendamento de Slots por Paciente

## 📋 Resumo

Sistema de reagendamento que permite que o responsável troque o horário de um paciente, sem cancelar, apenas editando o agendamento existente. **1 slot por paciente, não por responsável** - possibilitando múltiplos agendamentos para diferentes filhos.

---

## 🎯 Regras Implementadas

### ✅ 1. Um Agendamento por Paciente

- Cada **paciente** só pode ter **1 agendamento ativo** por agenda
- Responsável pode agendar **múltiplos filhos** na mesma agenda
- Ao tentar agendar novamente para o mesmo paciente, sistema detecta e oferece reagendamento

### ✅ 2. Reagendamento (Não Cancelamento)

- **NÃO cria novo agendamento** → Edita o existente
- Mantém mesmo `agendamento_id`
- Libera slot anterior automaticamente
- Reserva novo slot automaticamente
- Tudo em transação atômica

### ✅ 3. Paciente NÃO Cancela Sozinho

- Responsável pode apenas **trocar de horário**
- **Cancelamento** só pela secretaria
- Interface simplificada para usuário final

---

## 🏗️ Arquitetura

### **Backend**

#### 1. Nova Função: `checkExistingAppointment()`

**Arquivo:** `src/lib/shared-schedule-api.ts`

**O que faz:**

- Verifica se paciente já tem agendamento ativo naquela agenda
- Retorna dados do agendamento existente se houver
- Ignora agendamentos cancelados ou inativos

**Retorno:**

```typescript
{
  hasAppointment: boolean;
  existingAppointment?: {
    agendamento_id: string;
    slot_id: string;
    data_hora: string;
    tipo_servico_nome: string;
    local_nome: string | null;
  };
}
```

---

#### 2. Nova Função: `rescheduleAppointment()`

**Arquivo:** `src/lib/shared-schedule-api.ts`

**O que faz:**

- Reagenda agendamento através de RPC PostgreSQL
- Executa transação atômica:
  1. Libera slot antigo
  2. Atualiza agendamento com novo horário
  3. Atualiza seleção com novo slot
  4. Reserva novo slot
- Valida se novo slot está disponível

---

#### 3. Nova Function PostgreSQL: `fn_reagendar_slot()`

**Migration:** `add_fn_reagendar_slot`

**O que faz:**

- Função PL/pgSQL com transação atômica (tudo ou nada)
- Usa `SELECT FOR UPDATE` para lock do novo slot
- Garante que slot antigo é liberado e novo é reservado
- Retorna sucesso/erro

**Parâmetros:**

```sql
p_agenda_id UUID
p_agendamento_id UUID
p_old_slot_id UUID
p_new_slot_id UUID
p_new_data_hora TIMESTAMPTZ
```

---

### **Frontend**

#### 1. Dialog de Reagendamento

**Arquivo:** `src/components/domain/calendar/SharedScheduleSelectorWizard.tsx`

**Visual:**

```
┌──────────────────────────────────┐
│   ⚠️  Agendamento Existente       │
│                                   │
│  João já tem um horário agendado │
│  nesta agenda.                    │
│                                   │
│  ┌─────────────────────────────┐ │
│  │  Agendamento Atual          │ │
│  │  📅 Segunda, 15/12 às 14h   │ │
│  │  Serviço: Fisioterapia      │ │
│  │  📍 Clínica                 │ │
│  └─────────────────────────────┘ │
│                                   │
│  O que deseja fazer?              │
│                                   │
│  [Manter Este Horário]            │
│  [Trocar de Horário]              │
└──────────────────────────────────┘
```

**Comportamento:**

- Exibe ao tentar agendar paciente que já tem horário
- Opção "Manter" → Cancela e volta para seleção de paciente
- Opção "Trocar" → Ativa modo de reagendamento e continua wizard

---

#### 2. Estados de Reagendamento

**Arquivo:** `src/components/domain/calendar/SharedScheduleSelectorWizard.tsx`

**Novos estados:**

```typescript
const [isRescheduling, setIsRescheduling] = useState(false);
const [existingAppointmentId, setExistingAppointmentId] = useState<string | null>(null);
const [oldSlotId, setOldSlotId] = useState<string | null>(null);
const [showRescheduleDialog, setShowRescheduleDialog] = useState(false);
const [existingAppointmentData, setExistingAppointmentData] = useState<...>(null);
```

---

#### 3. Lógica de Validação

**Quando:** Ao clicar "Próximo" na seleção de paciente

**Fluxo:**

```typescript
1. Seleciona paciente
2. Clica "Próximo"
3. Sistema chama checkExistingAppointment()
4. Se hasAppointment === true:
   → Mostra Dialog de Reagendamento
   → Aguarda decisão do usuário
5. Se hasAppointment === false:
   → Continua wizard normalmente
```

---

#### 4. Lógica de Confirmação

**Arquivo:** `src/components/domain/calendar/SharedScheduleSelectorWizard.tsx`

**Fluxo bifurcado:**

```typescript
if (isRescheduling) {
  // REAGENDAMENTO - Edita agendamento existente
  await rescheduleAppointment(...);
} else {
  // NOVO AGENDAMENTO - Cria novo
  await selectSlotAndCreateAppointment(...);
}
```

---

## 🎨 Fluxo do Usuário

### **Caso 1: Novo Agendamento (Paciente sem agendamento)**

```
1. Responsável valida WhatsApp ✅
2. Seleciona paciente: João
3. Sistema verifica: João tem agendamento? NÃO
4. Continua wizard normalmente
5. Seleciona serviço, local, empresa, slot
6. Confirma agendamento ✅
```

---

### **Caso 2: Reagendamento (Paciente já tem agendamento)**

```
1. Responsável valida WhatsApp ✅
2. Seleciona paciente: João
3. Sistema verifica: João tem agendamento? SIM
4. Dialog aparece mostrando agendamento atual
5. Responsável escolhe: "Trocar de Horário"
6. Continua wizard (serviço, local, empresa)
7. Seleciona novo slot
8. Confirma reagendamento
9. Sistema:
   - Libera slot antigo (14h)
   - Atualiza agendamento
   - Reserva novo slot (16h)
10. Reagendamento confirmado ✅
```

---

### **Caso 3: Múltiplos Filhos (Pacientes diferentes)**

```
1. Responsável valida WhatsApp ✅
2. Agenda João às 14h ✅
3. Volta e agenda Maria às 15h ✅
4. Volta e agenda Pedro às 16h ✅
5. Tenta agendar João às 17h
6. Sistema: "João já tem horário às 14h"
   (Maria e Pedro não afetam João)
```

---

## 📊 Dados Modificados

### **Arquivos Alterados:**

1. ✅ `src/lib/shared-schedule-api.ts`
   - `checkExistingAppointment()` - Nova função
   - `rescheduleAppointment()` - Nova função

2. ✅ `src/components/domain/calendar/SharedScheduleSelectorWizard.tsx`
   - Estados de reagendamento
   - Dialog de reagendamento
   - Lógica de validação no `handleNext`
   - Lógica bifurcada no `handleConfirm`
   - Importações de ícones (`AlertCircle`)

3. ✅ `src/types/shared-schedule.ts`
   - `hasExistingAppointment?: boolean` em `ApiResponse`

4. ✅ **Migration:** `add_fn_reagendar_slot`
   - Função PostgreSQL `fn_reagendar_slot()`

---

## ✅ Validações

### Build:

```bash
npm run build
# ✅ Compilação bem-sucedida
# ✅ Sem erros TypeScript
# ✅ Sem erros de lint
```

---

## 🧪 Testes Sugeridos

### **Teste 1: Detectar Agendamento Existente**

1. Agendar João às 14h
2. Tentar agendar João às 16h
3. ✅ Dialog de reagendamento deve aparecer

### **Teste 2: Reagendamento**

1. Agendar João às 14h
2. Tentar agendar João às 16h
3. Escolher "Trocar de Horário"
4. Selecionar 16h
5. Confirmar
6. ✅ Agendamento editado (mesmo ID)
7. ✅ Slot 14h liberado
8. ✅ Slot 16h reservado

### **Teste 3: Múltiplos Filhos**

1. Agendar João às 14h
2. Agendar Maria às 15h
3. Agendar Pedro às 16h
4. ✅ Todos permitidos (pacientes diferentes)

### **Teste 4: Manter Horário Atual**

1. Agendar João às 14h
2. Tentar agendar João às 16h
3. Escolher "Manter Este Horário"
4. ✅ Volta para seleção de paciente
5. ✅ Pode escolher outro paciente

### **Teste 5: Slot Já Ocupado**

1. Agendar João às 14h
2. Outro usuário agenda às 16h
3. João tenta reagendar para 16h
4. ✅ Erro: "Este horário não está mais disponível"
5. ✅ Volta para seleção de slot

---

## 🎯 Vantagens da Solução

✅ **Previne duplicatas** - 1 agendamento por paciente  
✅ **Edição não cria novo** - Mantém histórico e ID  
✅ **Flexibilidade** - Responsável pode agendar múltiplos filhos  
✅ **Autonomia** - Responsável troca horário sozinho  
✅ **Transação atômica** - Tudo ou nada (sem inconsistências)  
✅ **Liberação imediata** - Slot anterior disponível instantaneamente  
✅ **Sem cancelamento público** - Apenas secretaria cancela  
✅ **Interface clara** - Dialog explicativo e intuitivo

---

## 📐 Diagrama de Fluxo

```
Seleciona paciente → handleNext()
         ↓
checkExistingAppointment()
         ↓
   Já tem agendamento?
    ↙          ↘
  SIM          NÃO
   ↓            ↓
Dialog         Continua
   ↓            wizard
[Manter] [Trocar]
   ↓        ↓
Cancela   isRescheduling=true
wizard    Continua wizard
            ↓
        Seleciona novo slot
            ↓
        handleConfirm()
            ↓
    rescheduleAppointment()
        Transação:
        - Libera slot antigo
        - Atualiza agendamento
        - Atualiza seleção
        - Reserva novo slot
            ↓
        ✅ Sucesso
```

---

## 🚀 Próximos Passos (Futuro)

- [ ] Dashboard para secretaria ver reagendamentos
- [ ] Histórico de reagendamentos do paciente
- [ ] Notificação ao profissional quando há reagendamento
- [ ] Limite de reagendamentos por período

---

**Status:** ✅ Concluído  
**Data:** 23 de Novembro de 2024  
**Tempo Estimado:** ~6-7h  
**Tempo Real:** ~1.5h
