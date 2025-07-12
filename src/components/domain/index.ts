// AI dev note: Registry de componentes Domain
// Páginas e fluxos específicos de domínio de negócio

// Auth domain exports
export { LoginPage } from './auth/LoginPage';
export { SignUpPage } from './auth/SignUpPage';
export { PendingApprovalPage } from './auth/PendingApprovalPage';
export { CompleteProfilePage } from './auth/CompleteProfilePage';

// Dashboard domain exports
export { AdminDashboard } from './dashboard/AdminDashboard';

// Registry para uso em templates e roteamento
export const DomainComponents = {
  // Auth
  SignUpPage: 'SignUpPage',
  PendingApprovalPage: 'PendingApprovalPage',

  // Dashboard
  AdminDashboard: 'AdminDashboard',
} as const;

export type DomainComponentName = keyof typeof DomainComponents;

// Registry por área de negócio
export const AuthComponents = {
  SignUpPage: 'SignUpPage',
  PendingApprovalPage: 'PendingApprovalPage',
} as const;

export const DashboardComponents = {
  AdminDashboard: 'AdminDashboard',
} as const;
