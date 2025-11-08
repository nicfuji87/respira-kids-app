// AI dev note: Registry de Templates - Export organizado por categoria
// Mantém organização clara e facilita importações

// Auth Templates
export { SignUpTemplate } from './auth/SignUpTemplate';

// Dashboard Templates (Main)
export { AdminDashboardTemplate } from './dashboard/AdminDashboardTemplate';
export { ProfissionalDashboardTemplate } from './dashboard/ProfissionalDashboardTemplate';
export { SecretariaDashboardTemplate } from './dashboard/SecretariaDashboardTemplate';
export { ResponsiveLayout } from './dashboard/ResponsiveLayout';

// Calendar Templates (Fase 3 + Fase 4)
export { CalendarTemplate } from './dashboard/CalendarTemplate';
export { AdminCalendarTemplate } from './dashboard/AdminCalendarTemplate';
export { ProfissionalCalendarTemplate } from './dashboard/ProfissionalCalendarTemplate';
export { SecretariaCalendarTemplate } from './dashboard/SecretariaCalendarTemplate';
export { ResponsiveCalendarTemplate } from './dashboard/ResponsiveCalendarTemplate';
export {
  CalendarTemplateWithData,
  SimpleCalendarTemplate,
} from './dashboard/CalendarTemplateWithData';

// Financial Templates
export { FinancialTemplate } from './financial/FinancialTemplate';

// Types para Dashboard Templates
export type { AdminUser } from './dashboard/AdminDashboardTemplate';
export type { ProfissionalUser } from './dashboard/ProfissionalDashboardTemplate';

// Types para Calendar Templates (aliased para evitar conflitos)
export type { CalendarTemplateProps } from './dashboard/CalendarTemplate';
export type {
  AdminCalendarTemplateProps,
  AdminUser as AdminCalendarUser,
} from './dashboard/AdminCalendarTemplate';
export type {
  ProfissionalCalendarTemplateProps,
  ProfissionalUser as ProfissionalCalendarUser,
} from './dashboard/ProfissionalCalendarTemplate';
export type {
  SecretariaCalendarTemplateProps,
  SecretariaUser,
} from './dashboard/SecretariaCalendarTemplate';
export type {
  ResponsiveCalendarTemplateProps,
  ResponsiveCalendarUser,
} from './dashboard/ResponsiveCalendarTemplate';
export type {
  CalendarTemplateWithDataProps,
  SimpleCalendarTemplateProps,
} from './dashboard/CalendarTemplateWithData';
