# 🏗️ Arquitetura de Componentes - Respira Kids

## Visão Geral

O Respira Kids utiliza uma arquitetura hierárquica de 4 níveis baseada em **Atomic Design** e **Domain-Driven Design**, promovendo máxima reutilização e manutenibilidade.

## 📁 Estrutura de Pastas

```
src/
├── components/
│   ├── primitives/     # Nível 1: Componentes básicos (shadcn/ui customizados)
│   ├── composed/       # Nível 2: Combinações funcionais
│   ├── domain/         # Nível 3: Componentes específicos do negócio
│   ├── templates/      # Nível 4: Layouts e estruturas de página
│   └── _registry/      # Mapa de componentes e exports
├── pages/              # Páginas principais
├── hooks/              # Custom hooks reutilizáveis
├── contexts/           # Context providers globais
├── types/              # Definições TypeScript
├── utils/              # Funções utilitárias
├── services/           # APIs e serviços externos
└── lib/                # Configurações e bibliotecas
```

## 🧱 Nível 1: Primitivos (src/components/primitives/)

**Propósito**: Componentes básicos reutilizáveis baseados em shadcn/ui

### Características:

- ✅ CSS variables personalizadas (--azul-respira, --roxo-titulo, etc.)
- ✅ Touch targets mínimos de 44px (mobile-friendly)
- ✅ Variantes adaptadas ao tema RespiraKids
- ✅ Transições suaves (theme-transition)
- ✅ Acessibilidade (ARIA labels, foco, contraste)

### Estrutura:

```
primitives/
├── Button/
│   ├── Button.tsx
│   ├── Button.stories.tsx
│   ├── Button.test.tsx
│   └── index.ts
├── Input/
├── Card/
├── Badge/
├── Dialog/
├── Form/
└── index.ts          # Export centralizado
```

### Exemplos:

```tsx
// Button customizado com tema RespiraKids
<Button variant="primary" size="lg" className="animate-respira-pulse">
  Acessar Sistema
</Button>

// Input com validação visual
<Input
  variant="medical"
  status="error"
  errorMessage="Campo obrigatório"
/>
```

## 🔗 Nível 2: Compostos (src/components/composed/)

**Propósito**: Componentes que combinam primitivos para funcionalidades específicas

### Características:

- ✅ Integração com react-hook-form
- ✅ Lógica de negócio genérica
- ✅ Estilização consistente
- ✅ Reutilizáveis em qualquer domínio
- ✅ Validação integrada

### Estrutura:

```
composed/
├── DataTable/         # Tabela com filtros e paginação
├── SearchField/       # Campo de busca avançada
├── FormField/         # Campo de formulário completo
├── Modal/             # Modal com header/footer
├── FileUpload/        # Upload com preview
├── DateRangePicker/   # Seletor de período
├── StatusBadge/       # Badge com estados
└── LoadingSpinner/    # Loading states
```

### Exemplos:

```tsx
// Campo de formulário completo
<FormField
  name="patientName"
  label="Nome do Paciente"
  type="text"
  validation={{ required: "Campo obrigatório" }}
  placeholder="Digite o nome completo"
/>

// Tabela com funcionalidades
<DataTable
  data={patients}
  columns={patientColumns}
  searchable
  filterable
  exportable
/>
```

## 🏥 Nível 3: Domínio (src/components/domain/)

**Propósito**: Componentes específicos do negócio organizados por área

### Organização por Domínio:

```
domain/
├── auth/              # Autenticação e autorização
│   ├── LoginForm/
│   ├── RegisterForm/
│   ├── PasswordReset/
│   └── UserProfile/
├── patient/           # Gestão de pacientes
│   ├── PatientCard/
│   ├── PatientForm/
│   ├── PatientHistory/
│   └── PatientStats/
├── appointment/       # Agendamentos
│   ├── Calendar/
│   ├── AppointmentForm/
│   ├── TimeSlots/
│   └── AppointmentCard/
├── financial/         # Gestão financeira
│   ├── InvoiceForm/
│   ├── PaymentStatus/
│   ├── FinancialChart/
│   └── BillingHistory/
├── medical/           # Prontuários médicos
│   ├── MedicalRecord/
│   ├── TreatmentPlan/
│   ├── VitalSigns/
│   └── MedicationList/
├── dashboard/         # Dashboard e métricas
│   ├── StatsCard/
│   ├── ActivityFeed/
│   ├── QuickActions/
│   └── MetricsChart/
└── config/            # Configurações
    ├── SettingsPanel/
    ├── NotificationSettings/
    ├── ThemeSettings/
    └── BackupSettings/
```

### Exemplos:

```tsx
// Componente específico de paciente
<PatientCard
  patient={patient}
  showActions
  onEdit={handleEdit}
  onViewHistory={handleHistory}
/>

// Calendário de agendamentos
<AppointmentCalendar
  appointments={appointments}
  onSlotSelect={handleSlotSelect}
  availableSlots={availableSlots}
/>
```

## 📄 Nível 4: Templates (src/components/templates/)

**Propósito**: Layouts e estruturas de página completas

### Características:

- ✅ Layout responsivo
- ✅ Estrutura de navegação
- ✅ Containers de conteúdo
- ✅ SEO otimizado
- ✅ Breadcrumbs automáticos

### Estrutura:

```
templates/
├── AppLayout/         # Layout principal da aplicação
├── AuthLayout/        # Layout para autenticação
├── DashboardLayout/   # Layout do dashboard
├── PatientLayout/     # Layout específico para pacientes
├── SettingsLayout/    # Layout de configurações
└── PrintLayout/       # Layout para impressão
```

### Exemplos:

```tsx
// Layout principal
<AppLayout
  user={currentUser}
  navigation={mainNavigation}
  breadcrumbs={breadcrumbs}
>
  <PatientManagement />
</AppLayout>

// Layout específico
<DashboardLayout
  widgets={dashboardWidgets}
  filters={dashboardFilters}
>
  <StatsOverview />
</DashboardLayout>
```

## 🗺️ Registry (\_registry/)

**Propósito**: Mapeamento e exports centralizados

```tsx
// _registry/index.ts
export * from '../primitives';
export * from '../composed';
export * from '../domain';
export * from '../templates';

// _registry/component-map.ts
export const COMPONENT_MAP = {
  primitives: ['Button', 'Input', 'Card'],
  composed: ['DataTable', 'FormField'],
  domain: ['PatientCard', 'AppointmentCalendar'],
  templates: ['AppLayout', 'DashboardLayout'],
};
```

## 🎯 Benefícios da Arquitetura

### 1. **Componentização Extrema**

- Mais componentes, menos código duplicado
- Reutilização máxima em todos os níveis
- Manutenção centralizada

### 2. **Desenvolvimento Escalável**

- Fácil adicionar novos domínios
- Padrões consistentes
- Onboarding rápido de desenvolvedores

### 3. **Testabilidade**

- Testes isolados por nível
- Mocks simplificados
- Cobertura completa

### 4. **Performance**

- Tree-shaking automático
- Lazy loading por domínio
- Bundle splitting otimizado

## 📋 Convenções de Nomenclatura

### Arquivos:

- **PascalCase**: `PatientCard.tsx`
- **kebab-case**: `patient-card.stories.tsx`
- **Index files**: `index.ts` para exports

### Componentes:

- **Primitivos**: `Button`, `Input`, `Card`
- **Compostos**: `DataTable`, `FormField`, `SearchInput`
- **Domínio**: `PatientCard`, `AppointmentCalendar`
- **Templates**: `AppLayout`, `DashboardLayout`

### Props:

- **Interfaces**: `ButtonProps`, `PatientCardProps`
- **Types**: `PatientStatus`, `AppointmentType`
- **Eventos**: `onSubmit`, `onCancel`, `onPatientSelect`

## 🚀 Migração Gradual

1. **Fase 1**: Criar estrutura de pastas
2. **Fase 2**: Migrar componentes shadcn/ui para primitives/
3. **Fase 3**: Criar componentes composed/
4. **Fase 4**: Desenvolver componentes domain/
5. **Fase 5**: Implementar templates/
