# Validação de Expiração de Agendas Públicas

## 📋 Resumo

Sistema de validação em tempo real que verifica se uma agenda pública expirou (`data_fim < data_atual`) e impede o acesso ao link.

---

## 🎯 Funcionalidades Implementadas

### 1. **Backend - Validação no Fetch**

- **Arquivo:** `src/lib/shared-schedule-api.ts`
- **Função:** `fetchSharedScheduleByToken`

**O que foi feito:**

```typescript
// Valida se data_fim < data_atual
const today = new Date();
today.setHours(0, 0, 0, 0);
const dataFim = new Date(agendaStats.data_fim);
dataFim.setHours(0, 0, 0, 0);

if (dataFim < today) {
  return {
    data: null,
    error: 'Esta agenda expirou e não está mais disponível',
    success: false,
    isExpired: true, // Flag específica de expiração
  };
}
```

---

### 2. **Frontend Público - Mensagem de Expiração**

- **Arquivo:** `src/pages/SharedSchedulePage.tsx`

**O que foi feito:**

- Detecta flag `isExpired` na resposta da API
- Exibe Card especial com ícone de calendário cortado
- Mensagem clara: "Esta agenda estava disponível até [data]"
- Sugestão: "Entre em contato para obter um novo link"

**Visual:**

```
┌─────────────────────────────────────┐
│  📅  Agenda Expirada                 │
│                                      │
│  Esta agenda estava disponível até   │
│  15/11/2024                          │
│                                      │
│  Entre em contato para obter um      │
│  novo link de agendamento.           │
│                                      │
│  [Voltar]                            │
└─────────────────────────────────────┘
```

---

### 3. **Frontend Lista - Badge de Status**

- **Arquivo:** `src/components/composed/ScheduleCard.tsx`

**O que foi feito:**

- Calcula se agenda expirou em tempo real
- Exibe badge "Expirada" em cor amber quando `data_fim < hoje`
- Badge adicional (não substitui o "Ativa/Inativa")

**Lógica:**

```typescript
const today = new Date();
today.setHours(0, 0, 0, 0);
const dataFimCheck = new Date(agenda.data_fim + 'T00:00:00');
dataFimCheck.setHours(0, 0, 0, 0);
const isExpired = dataFimCheck < today;
```

---

## 🗂️ Tipos TypeScript

**Atualizado:** `src/types/shared-schedule.ts`

```typescript
export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  success: boolean;
  isExpired?: boolean; // Nova propriedade
}
```

---

## 🎨 Comportamento Visual

### **Cenário 1: Agenda Ativa**

- ✅ Link funciona normalmente
- ✅ Usuário pode selecionar slots
- ✅ Badge "Ativa" na lista

### **Cenário 2: Agenda Expirada**

- ❌ Link mostra mensagem de expiração
- ⚠️ Badge "Expirada" na lista (cor amber)
- 🚫 Impossível acessar wizard de seleção

---

## 🔧 Testes Sugeridos

### Manual

1. **Criar agenda com `data_fim` = ontem**
   - Acessar link público → Deve mostrar "Agenda Expirada"
2. **Criar agenda com `data_fim` = amanhã**
   - Acessar link público → Deve funcionar normalmente
3. **Visualizar lista de agendas**
   - Agenda expirada deve ter badge "Expirada"
   - Agenda ativa não deve ter badge "Expirada"

### Automático (opcional futuro)

```typescript
describe('Agenda Expiration', () => {
  it('should block access to expired schedule', async () => {
    const expiredDate = new Date();
    expiredDate.setDate(expiredDate.getDate() - 1);

    const result = await fetchSharedScheduleByToken('token-expirado');

    expect(result.success).toBe(false);
    expect(result.isExpired).toBe(true);
  });
});
```

---

## 📊 Diagrama de Fluxo

```
Usuário acessa link → fetchSharedScheduleByToken()
                              ↓
                    Buscar agenda no banco
                              ↓
                    data_fim < hoje?
                    ↙          ↘
                 SIM           NÃO
                  ↓             ↓
        Retornar erro     Retornar agenda
        isExpired=true         ↓
                  ↓        Renderizar wizard
         Mostrar Card
         "Agenda Expirada"
```

---

## 🚀 Melhorias Futuras (Opcional)

1. **Notificação pré-expiração:** Avisar profissional 3 dias antes
2. **Renovação rápida:** Botão "Duplicar agenda" para criar nova com mesmas configurações
3. **Analytics:** Dashboard mostrando taxa de expiração vs. taxa de ocupação

---

## 📝 Notas Técnicas

- **Timezone:** Validação usa `setHours(0, 0, 0, 0)` para comparar apenas datas (ignora hora)
- **Performance:** Cálculo de expiração em tempo real (sem necessidade de jobs/cron)
- **Histórico:** Agendas expiradas continuam no banco (não são deletadas)
- **Integridade:** Agendamentos já criados são preservados mesmo após expiração

---

**Implementado em:** Novembro 2024
**Versão:** 1.0
