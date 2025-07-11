# 📋 Plano de Implementação - Arquitetura Hierárquica

## 🎯 Objetivo

Migrar a aplicação Respira Kids para uma arquitetura hierárquica de 4 níveis, implementando componentização extrema com foco em reutilização e manutenibilidade.

## 📅 Cronograma de Implementação

### **Fase 1: Preparação e Estrutura Base** (1-2 dias)

#### 1.1 Criar Estrutura de Pastas

```bash
# Criar todas as pastas necessárias
mkdir -p src/components/{primitives,composed,domain,templates,_registry}
mkdir -p src/{pages,hooks,contexts,types,utils,services}

# Subpastas de domínio
mkdir -p src/components/domain/{auth,patient,appointment,financial,medical,dashboard,config}
```

#### 1.2 Configurar Exports Centralizados

- ✅ `src/components/_registry/index.ts`
- ✅ `src/components/_registry/component-map.ts`
- ✅ Configurar imports absolutos no tsconfig

#### 1.3 Definir Types Globais

- ✅ `src/types/globals.ts` - Types compartilhados
- ✅ `src/types/api.ts` - Types de API
- ✅ `src/types/components.ts` - Props de componentes

### **Fase 2: Migração dos Primitivos** (2-3 dias)

#### 2.1 Migrar Componentes Shadcn/UI Existentes

```
Mover de: src/components/ui/
Para: src/components/primitives/

Componentes a migrar:
✅ Button → primitives/Button/
✅ Card → primitives/Card/
✅ Input → primitives/Input/
✅ Badge → primitives/Badge/
✅ Dialog → primitives/Dialog/
```

#### 2.2 Customizar Primitivos com Tema RespiraKids

- ✅ Aplicar variáveis CSS personalizadas
- ✅ Adicionar variantes específicas (medical, pediatric, etc.)
- ✅ Touch targets mínimos de 44px
- ✅ Animações theme-transition

#### 2.3 Estrutura de Cada Primitivo

```
primitives/Button/
├── Button.tsx          # Componente principal
├── Button.types.ts     # Types e interfaces
├── Button.variants.ts  # Variantes do tema
├── Button.stories.tsx  # Storybook
├── Button.test.tsx     # Testes unitários
└── index.ts           # Export público
```

### **Fase 3: Desenvolvimento dos Compostos** (3-4 dias)

#### 3.1 Componentes Compostos Prioritários

```
1. FormField/           # Campo de formulário completo
2. DataTable/           # Tabela com funcionalidades
3. SearchField/         # Busca avançada
4. Modal/               # Modal estruturado
5. FileUpload/          # Upload com preview
6. StatusBadge/         # Badge com estados
7. LoadingSpinner/      # Loading states
8. DateRangePicker/     # Seletor de período
```

#### 3.2 Integração com React Hook Form

```tsx
// Exemplo: FormField
<FormField
  name="patientName"
  label="Nome do Paciente"
  type="text"
  validation={{
    required: 'Campo obrigatório',
    minLength: { value: 2, message: 'Mínimo 2 caracteres' },
  }}
  control={control}
/>
```

#### 3.3 Lógica de Negócio Genérica

- ✅ Validação de CPF/CNPJ
- ✅ Formatação de telefone
- ✅ Máscaras de input
- ✅ Estados de loading/error/success

### **Fase 4: Componentes de Domínio** (5-6 dias)

#### 4.1 Priorização por Domínio

**Alta Prioridade:**

1. **auth/** - Login, registro, perfil
2. **patient/** - Gestão de pacientes
3. **dashboard/** - Métricas e visão geral

**Média Prioridade:** 4. **appointment/** - Agendamentos 5. **medical/** - Prontuários

**Baixa Prioridade:** 6. **financial/** - Gestão financeira 7. **config/** - Configurações

#### 4.2 Desenvolvimento por Domínio

**Domain: Auth**

```
auth/
├── LoginForm/
│   ├── LoginForm.tsx
│   ├── LoginForm.types.ts
│   ├── LoginForm.hooks.ts
│   └── index.ts
├── RegisterForm/
├── PasswordReset/
└── UserProfile/
```

**Domain: Patient**

```
patient/
├── PatientCard/        # Card resumo do paciente
├── PatientForm/        # Formulário de cadastro
├── PatientHistory/     # Histórico médico
├── PatientStats/       # Estatísticas
├── PatientSearch/      # Busca de pacientes
└── PatientList/        # Lista paginada
```

**Domain: Dashboard**

```
dashboard/
├── StatsCard/          # Cards de métricas
├── ActivityFeed/       # Feed de atividades
├── QuickActions/       # Ações rápidas
├── MetricsChart/       # Gráficos
├── RecentPatients/     # Pacientes recentes
└── AppointmentsSummary/ # Resumo agendamentos
```

#### 4.3 Hooks Específicos por Domínio

```
hooks/
├── useAuth.ts          # Autenticação
├── usePatients.ts      # Gestão de pacientes
├── useAppointments.ts  # Agendamentos
├── useDashboard.ts     # Métricas dashboard
└── useNotifications.ts # Notificações
```

### **Fase 5: Templates e Layouts** (2-3 dias)

#### 5.1 Templates Principais

```
templates/
├── AppLayout/          # Layout principal
├── AuthLayout/         # Layout autenticação
├── DashboardLayout/    # Layout dashboard
├── PatientLayout/      # Layout específico
└── PrintLayout/        # Layout impressão
```

#### 5.2 Layout Responsivo

- ✅ Sidebar colapsável
- ✅ Navigation breadcrumbs
- ✅ Mobile-first design
- ✅ Dark mode support

#### 5.3 SEO e Acessibilidade

- ✅ Meta tags dinâmicas
- ✅ ARIA labels completos
- ✅ Focus management
- ✅ Keyboard navigation

### **Fase 6: Páginas e Integração** (3-4 dias)

#### 6.1 Refatorar Páginas Existentes

```
pages/
├── Dashboard/          # Dashboard principal
├── Patients/           # Gestão pacientes
├── Appointments/       # Agendamentos
├── Medical/            # Prontuários
├── Financial/          # Financeiro
├── Settings/           # Configurações
└── Auth/               # Autenticação
```

#### 6.2 Context Providers

```
contexts/
├── AuthContext.tsx     # Autenticação global
├── ThemeContext.tsx    # Tema e preferências
├── NotificationContext.tsx # Notificações
└── AppContext.tsx      # Estado global
```

#### 6.3 Services e APIs

```
services/
├── api/
│   ├── auth.ts
│   ├── patients.ts
│   ├── appointments.ts
│   └── medical.ts
├── storage/
│   ├── localStorage.ts
│   └── sessionStorage.ts
└── utils/
    ├── formatters.ts
    ├── validators.ts
    └── constants.ts
```

## 🔄 Estratégia de Migração

### Abordagem Incremental

1. **Não quebrar o existente** - Manter funcionalidades atuais
2. **Migração gradual** - Componente por componente
3. **Testes contínuos** - Cada migração testada
4. **Rollback possível** - Manter versões antigas temporariamente

### Ordem de Migração

```
1. App.tsx (atual) → templates/AppLayout/
2. Shadcn components → primitives/
3. Criar composed/ components
4. Desenvolver domain/ por prioridade
5. Refatorar pages/ para usar nova arquitetura
```

## 📊 Métricas de Sucesso

### Objetivos Quantitativos

- ✅ **Redução de código duplicado**: -40%
- ✅ **Aumento de reutilização**: +60%
- ✅ **Tempo de desenvolvimento**: -30%
- ✅ **Cobertura de testes**: >80%

### Objetivos Qualitativos

- ✅ **Manutenibilidade** melhorada
- ✅ **Onboarding** mais rápido
- ✅ **Consistência** visual
- ✅ **Performance** otimizada

## 🛠️ Ferramentas e Dependências

### Novas Dependências

```json
{
  "react-hook-form": "^7.45.0",
  "@hookform/resolvers": "^3.1.0",
  "zod": "^3.21.0",
  "date-fns": "^2.30.0",
  "react-query": "^3.39.0"
}
```

### Ferramentas de Desenvolvimento

```json
{
  "@storybook/react": "^7.0.0",
  "@testing-library/react": "^13.0.0",
  "chromatic": "^6.0.0",
  "plop": "^3.1.0"
}
```

## 🧪 Estratégia de Testes

### Pirâmide de Testes

1. **Unit Tests** - Cada primitivo e composto
2. **Integration Tests** - Componentes de domínio
3. **E2E Tests** - Fluxos principais
4. **Visual Tests** - Storybook + Chromatic

### Cobertura por Nível

- **Primitivos**: 100% unit tests
- **Compostos**: 90% unit + integration
- **Domínio**: 80% integration + e2e
- **Templates**: 70% e2e + visual

## 🚀 Entrega e Deploy

### Estratégia de Entrega

1. **Feature flags** para nova arquitetura
2. **A/B testing** entre versões
3. **Rollback automático** em caso de erro
4. **Monitoramento** de performance

### Checklist de Go-Live

- [ ] Todos os testes passando
- [ ] Performance mantida ou melhorada
- [ ] Acessibilidade validada
- [ ] Documentação completa
- [ ] Team training concluído

---

**Próximo Passo**: Aprovação do plano e início da Fase 1 🚀
