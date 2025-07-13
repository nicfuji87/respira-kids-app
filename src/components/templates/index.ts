// AI dev note: Registry de componentes TEMPLATES (Nível 4)
// Layouts completos e estruturas de página responsivas

// Auth Templates
export { SignUpTemplate } from './auth/SignUpTemplate';

// Dashboard Templates
export { AdminDashboardTemplate } from './dashboard/AdminDashboardTemplate';
export { SecretariaDashboardTemplate } from './dashboard/SecretariaDashboardTemplate';
export { ProfissionalDashboardTemplate } from './dashboard/ProfissionalDashboardTemplate';

// Layout Templates
export { DesktopLayout } from './dashboard/DesktopLayout';
export { MobileLayout } from './dashboard/MobileLayout';
export { ResponsiveLayout } from './dashboard/ResponsiveLayout';

// Type exports
export type { DesktopLayoutProps } from './dashboard/DesktopLayout';
export type { MobileLayoutProps } from './dashboard/MobileLayout';
export type { ResponsiveLayoutProps } from './dashboard/ResponsiveLayout';

// Registry para uso em roteamento e aplicação
export const TemplateComponents = {
  // Auth
  SignUpTemplate: 'SignUpTemplate',

  // Dashboard
  AdminDashboardTemplate: 'AdminDashboardTemplate',
  SecretariaDashboardTemplate: 'SecretariaDashboardTemplate',
  ProfissionalDashboardTemplate: 'ProfissionalDashboardTemplate',

  // Layouts
  DesktopLayout: 'DesktopLayout',
  MobileLayout: 'MobileLayout',
  ResponsiveLayout: 'ResponsiveLayout',
} as const;

export type TemplateComponentName = keyof typeof TemplateComponents;

// Registry por área de aplicação
export const AuthTemplates = {
  SignUpTemplate: 'SignUpTemplate',
} as const;

export const DashboardTemplates = {
  AdminDashboardTemplate: 'AdminDashboardTemplate',
  SecretariaDashboardTemplate: 'SecretariaDashboardTemplate',
  ProfissionalDashboardTemplate: 'ProfissionalDashboardTemplate',
} as const;

export const LayoutTemplates = {
  DesktopLayout: 'DesktopLayout',
  MobileLayout: 'MobileLayout',
  ResponsiveLayout: 'ResponsiveLayout',
} as const;

// Types para props dos templates
export type { AdminUser } from './dashboard/AdminDashboardTemplate';
export type { SecretariaUser } from './dashboard/SecretariaDashboardTemplate';
export type { ProfissionalUser } from './dashboard/ProfissionalDashboardTemplate';
