# 🏗️ Arquitetura de Componentes - Respira Kids

## Visão Geral

O **Respira Kids** é um sistema de gestão completa para clínicas de fisioterapia respiratória pediátrica, utilizando arquitetura hierárquica de 4 níveis baseada em **Atomic Design** e **Domain-Driven Design**.

## 🏥 Core Business

- **Domínio**: Fisioterapia respiratória pediátrica
- **Usuários**: Fisioterapeutas, secretárias, administradores
- **Objetivo**: Gestão completa de pacientes, prontuários e operações da clínica
- **Roles**: `admin`, `secretaria`, `profissional` (não há acesso para pacientes)

## 📁 Estrutura de Pastas

```
src/
├── components/
│   ├── primitives/     # Nível 1: Componentes básicos (shadcn/ui customizados)
│   ├── composed/       # Nível 2: Combinações funcionais
│   ├── domain/         # Nível 3: Componentes específicos dos módulos
│   ├── templates/      # Nível 4: Layouts por role e funcionalidade
│   └── _registry/      # Mapa de componentes e exports
├── pages/              # Páginas por módulo
├── hooks/              # Custom hooks por domínio
├── contexts/           # Context providers (auth, roles, etc.)
├── types/              # Definições TypeScript dos módulos
├── utils/              # Funções utilitárias específicas da clínica
├── services/           # APIs e integrações (Supabase, webhooks)
└── lib/                # Configurações e bibliotecas
```

## 🧱 Nível 1: Primitivos (src/components/primitives/)

**Propósito**: Componentes básicos reutilizáveis com tema RespiraKids

### Componentes Específicos para Clínica:

```
primitives/
├── Button/             # Botões com variantes médicas
├── Input/              # Inputs com validação médica
├── Card/               # Cards para informações clínicas
├── Badge/              # Status de pacientes/agendamentos
├── DatePicker/         # Seletor de datas para agenda
├── TimePicker/         # Seletor de horários
├── FileUpload/         # Upload de documentos médicos
├── DataTable/          # Tabelas para listagens
├── Form/               # Formulários médicos
└── Modal/              # Modais para ações importantes
```

### Características Específicas:

- ✅ Validações médicas (CPF, telefone, datas)
- ✅ Touch targets para tablets (uso clínico)
- ✅ Cores do tema RespiraKids
- ✅ Acessibilidade para ambiente médico

## 🔗 Nível 2: Compostos (src/components/composed/)

**Propósito**: Componentes funcionais específicos para operações da clínica

```
composed/
├── PatientSearchBar/   # Busca de pacientes com filtros
├── AppointmentSlots/   # Slots de horários disponíveis
├── MedicalForm/        # Formulários com validação médica
├── StatusIndicator/    # Indicadores de status (presente, faltou, etc.)
├── PaymentStatus/      # Status de pagamentos
├── StockAlert/         # Alertas de estoque baixo
├── NotificationBell/   # Sistema de notificações
├── RoleGuard/          # Proteção baseada em roles
└── DataExport/         # Exportação de relatórios
```

## 🏥 Nível 3: Domínio (src/components/domain/)

**Propósito**: Componentes específicos por módulo do sistema

### Organização por Módulos:

```
domain/
├── auth/               # Autenticação & Autorização
│   ├── LoginForm/      # Login com validação de roles
│   ├── RoleSelector/   # Seleção de perfil de acesso
│   ├── UserProfile/    # Perfil do usuário logado
│   └── PermissionGuard/ # Proteção por permissões
├── dashboard/          # Dashboard por Role
│   ├── AdminDashboard/ # Dashboard administrativo
│   ├── SecretaryDashboard/ # Dashboard da secretária
│   ├── TherapistDashboard/ # Dashboard do fisioterapeuta
│   ├── MetricsCard/    # Cards de métricas da clínica
│   ├── ActivityFeed/   # Feed de atividades recentes
│   └── QuickActions/   # Ações rápidas por role
├── agenda/             # Gestão de Agendamentos
│   ├── Calendar/       # Calendário multi-view
│   ├── AppointmentForm/ # Formulário de agendamento
│   ├── TimeSlotGrid/   # Grid de horários
│   ├── PatientCard/    # Card do paciente na agenda
│   ├── AppointmentList/ # Lista de agendamentos
│   └── ScheduleConfig/ # Configuração de horários
├── patients/           # Cadastro e Prontuários
│   ├── PatientForm/    # Cadastro de pacientes
│   ├── PatientList/    # Lista de pacientes
│   ├── PatientCard/    # Card resumo do paciente
│   ├── MedicalRecord/  # Prontuário eletrônico
│   ├── TreatmentPlan/  # Plano de tratamento
│   ├── VitalSigns/     # Sinais vitais
│   ├── EvolutionNotes/ # Notas de evolução
│   └── DocumentUpload/ # Upload de documentos
├── stock/              # Controle de Estoque
│   ├── InventoryList/  # Lista de inventário
│   ├── StockForm/      # Cadastro de itens
│   ├── LowStockAlert/  # Alertas de estoque baixo
│   ├── UsageTracking/  # Rastreamento de uso
│   ├── SupplierForm/   # Cadastro de fornecedores
│   └── StockReport/    # Relatórios de estoque
├── financial/          # Controle Financeiro
│   ├── PaymentForm/    # Formulário de pagamentos
│   ├── InvoiceList/    # Lista de faturas
│   ├── BillingReport/ # Relatórios de faturamento
│   ├── ExpenseTracker/ # Controle de despesas
│   ├── PaymentStatus/ # Status de pagamentos
│   └── FinancialChart/ # Gráficos financeiros
├── webhooks/           # Sistema de Notificações
│   ├── NotificationCenter/ # Central de notificações
│   ├── WebhookConfig/ # Configuração de webhooks
│   ├── EmailTemplate/ # Templates de email
│   ├── SMSNotification/ # Notificações SMS
│   └── IntegrationList/ # Lista de integrações
└── settings/           # Configurações do Sistema
    ├── ClinicSettings/ # Configurações da clínica
    ├── UserManagement/ # Gestão de usuários
    ├── RoleSettings/   # Configuração de roles
    ├── BackupConfig/   # Configurações de backup
    ├── SecuritySettings/ # Configurações de segurança
    └── SystemLogs/     # Logs do sistema
```

## 📄 Nível 4: Templates (src/components/templates/)

**Propósito**: Layouts específicos por role e funcionalidade

```
templates/
├── AdminLayout/        # Layout para administradores
├── SecretaryLayout/    # Layout para secretárias
├── TherapistLayout/    # Layout para fisioterapeutas
├── AuthLayout/         # Layout de autenticação
├── DashboardLayout/    # Layout genérico de dashboard
├── PatientLayout/      # Layout específico para pacientes
├── AgendaLayout/       # Layout da agenda/calendário
├── ReportLayout/       # Layout para relatórios
└── PrintLayout/        # Layout para impressão
```

### Características dos Layouts:

- ✅ **Navigation contextual** por role
- ✅ **Sidebar específica** para cada usuário
- ✅ **Breadcrumbs médicos** (Paciente > Consulta > Prontuário)
- ✅ **Quick actions** relevantes ao role
- ✅ **Notificações contextuais**

## 👥 Sistema de Roles e Permissões

### **Admin**

- Acesso total ao sistema
- Gestão de usuários e configurações
- Relatórios financeiros completos
- Configuração de webhooks e integrações

### **Secretária**

- Gestão de agendamentos
- Cadastro de pacientes
- Controle básico financeiro
- Relatórios operacionais

### **Profissional (Fisioterapeuta)**

- Agenda pessoal
- Prontuários eletrônicos
- Planos de tratamento
- Controle de estoque básico

## 🗺️ Registry e Exports

```tsx
// _registry/domain-map.ts
export const DOMAIN_MAP = {
  auth: ['LoginForm', 'RoleSelector', 'UserProfile'],
  dashboard: ['AdminDashboard', 'SecretaryDashboard', 'TherapistDashboard'],
  agenda: ['Calendar', 'AppointmentForm', 'TimeSlotGrid'],
  patients: ['PatientForm', 'MedicalRecord', 'TreatmentPlan'],
  stock: ['InventoryList', 'StockForm', 'LowStockAlert'],
  financial: ['PaymentForm', 'InvoiceList', 'BillingReport'],
  webhooks: ['NotificationCenter', 'WebhookConfig'],
  settings: ['ClinicSettings', 'UserManagement', 'RoleSettings'],
};

// _registry/role-components.ts
export const ROLE_COMPONENTS = {
  admin: ['AdminDashboard', 'UserManagement', 'SystemSettings'],
  secretaria: ['SecretaryDashboard', 'AgendaManager', 'PatientRegistry'],
  profissional: ['TherapistDashboard', 'MedicalRecords', 'TreatmentPlans'],
};
```

## 🎯 Fluxos Principais do Sistema

### **Fluxo de Agendamento:**

1. Secretária acessa `AgendaLayout`
2. Usa `AppointmentForm` para criar agendamento
3. `TimeSlotGrid` mostra disponibilidade
4. `NotificationCenter` envia confirmação

### **Fluxo de Atendimento:**

1. Fisioterapeuta acessa `TherapistLayout`
2. Visualiza agenda em `TherapistDashboard`
3. Abre `MedicalRecord` do paciente
4. Atualiza `EvolutionNotes` e `TreatmentPlan`

### **Fluxo Administrativo:**

1. Admin acessa `AdminLayout`
2. Monitora métricas em `AdminDashboard`
3. Gerencia usuários via `UserManagement`
4. Configura sistema em `ClinicSettings`

## 🔧 Integrações Específicas

### **Supabase:**

- Autenticação com roles
- Database para pacientes/agendamentos
- Real-time para notificações
- Storage para documentos médicos

### **APIs Externas:**

- Validação de CPF
- Envio de SMS/Email
- Backup em nuvem
- Relatórios PDF

## 📊 Métricas de Negócio

### **Operacionais:**

- Taxa de comparecimento às consultas
- Tempo médio de atendimento
- Utilização da agenda
- Satisfação dos pacientes

### **Financeiras:**

- Faturamento mensal
- Inadimplência
- Custo por paciente
- ROI dos tratamentos

---

**Esta arquitetura está 100% alinhada com as necessidades específicas de uma clínica de fisioterapia respiratória pediátrica, garantindo eficiência operacional e qualidade no atendimento.** 🏥
