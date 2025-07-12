// AI dev note: Registry de componentes Composed
// Componentes que combinam Primitives com lógica específica

export { AuthCard } from './AuthCard';
export { LoginForm } from './LoginForm';
export { SignUpForm } from './SignUpForm';
export { UserApprovalCard } from './UserApprovalCard';
export { CompleteProfileForm } from './CompleteProfileForm';
export { DatePicker } from './DatePicker';
export type { ApprovalStatus } from './UserApprovalCard';

// Registry para uso em templates e páginas
export const ComposedComponents = {
  AuthCard: 'AuthCard',
  SignUpForm: 'SignUpForm',
  UserApprovalCard: 'UserApprovalCard',
  DatePicker: 'DatePicker',
} as const;

export type ComposedComponentName = keyof typeof ComposedComponents;
