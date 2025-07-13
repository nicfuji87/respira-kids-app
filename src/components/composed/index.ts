// AI dev note: Registry de componentes Composed
// Componentes que combinam Primitives com lógica específica

// Auth components
export { AuthCard } from './AuthCard';
export { LoginForm } from './LoginForm';
export { SignUpForm } from './SignUpForm';
export { UserApprovalCard } from './UserApprovalCard';
export { CompleteProfileForm } from './CompleteProfileForm';
export { DatePicker } from './DatePicker';
export type { ApprovalStatus } from './UserApprovalCard';

// Dashboard components
export { NavigationItem } from './NavigationItem';
export { UserProfileDropdown } from './UserProfileDropdown';
export { BreadcrumbNav } from './BreadcrumbNav';
export { NotificationBadge } from './NotificationBadge';

// Configuration components
export { DevelopmentPlaceholder } from './DevelopmentPlaceholder';
export { ConfigurationTabs } from './ConfigurationTabs';
export { AvatarUpload } from './AvatarUpload';
export { ProfileFormFields } from './ProfileFormFields';

// Type exports
export type { NavigationItemProps } from './NavigationItem';
export type { UserProfileProps } from './UserProfileDropdown';
export type { BreadcrumbNavProps, BreadcrumbItem } from './BreadcrumbNav';
export type { NotificationBadgeProps } from './NotificationBadge';
export type { DevelopmentPlaceholderProps } from './DevelopmentPlaceholder';
export type { ConfigurationTabsProps } from './ConfigurationTabs';
export type { AvatarUploadProps } from './AvatarUpload';
export type { ProfileFormFieldsProps } from './ProfileFormFields';

// Registry para uso em templates e páginas
export const ComposedComponents = {
  // Auth
  AuthCard: 'AuthCard',
  SignUpForm: 'SignUpForm',
  UserApprovalCard: 'UserApprovalCard',
  DatePicker: 'DatePicker',

  // Dashboard
  NavigationItem: 'NavigationItem',
  UserProfileDropdown: 'UserProfileDropdown',
  BreadcrumbNav: 'BreadcrumbNav',
  NotificationBadge: 'NotificationBadge',

  // Configuration
  DevelopmentPlaceholder: 'DevelopmentPlaceholder',
  ConfigurationTabs: 'ConfigurationTabs',
  AvatarUpload: 'AvatarUpload',
  ProfileFormFields: 'ProfileFormFields',
} as const;

export type ComposedComponentName = keyof typeof ComposedComponents;
