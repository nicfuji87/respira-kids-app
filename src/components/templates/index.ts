// AI dev note: Registry de Templates - Export organizado por categoria
// Mantém organização clara e facilita importações

// Auth Templates
export { SignUpTemplate } from './auth/SignUpTemplate';

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

// Types para Calendar Templates (aliased para evitar conflitos)
export type { CalendarTemplateProps } from './dashboard/CalendarTemplate';
export type {
  AdminCalendarTemplateProps,
  AdminUser,
} from './dashboard/AdminCalendarTemplate';
export type {
  ProfissionalCalendarTemplateProps,
  ProfissionalUser,
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
