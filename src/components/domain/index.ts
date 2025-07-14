// AI dev note: Registry de componentes Domain
// Páginas e fluxos específicos de domínio de negócio

// Auth domain exports
export { LoginPage } from './auth/LoginPage';
export { SignUpPage } from './auth/SignUpPage';
export { PendingApprovalPage } from './auth/PendingApprovalPage';
export { CompleteProfilePage } from './auth/CompleteProfilePage';

// Dashboard domain exports
export { AdminDashboard } from './dashboard/AdminDashboard';
export { DashboardSidebar } from './dashboard/DashboardSidebar';
export { DashboardTopBar } from './dashboard/DashboardTopBar';
export { MobileBottomTabs } from './dashboard/MobileBottomTabs';
export { MobileHeader } from './dashboard/MobileHeader';

// Profile domain exports
export { EditProfileForm, MyProfileSection } from './profile';

// Calendar domain exports
export {
  CalendarHeader,
  MonthView,
  WeekView,
  DayView,
  AgendaView,
  EventManager,
} from './calendar';

// Type exports
export type { DashboardSidebarProps } from './dashboard/DashboardSidebar';
export type { DashboardTopBarProps } from './dashboard/DashboardTopBar';
export type { MobileBottomTabsProps } from './dashboard/MobileBottomTabs';
export type { MobileHeaderProps } from './dashboard/MobileHeader';
export type { EditProfileFormProps, MyProfileSectionProps } from './profile';
export type {
  MonthViewProps,
  WeekViewProps,
  DayViewProps,
  AgendaViewProps,
  EventManagerProps,
} from './calendar';

// Registry para uso em templates e roteamento
export const DomainComponents = {
  // Auth
  SignUpPage: 'SignUpPage',
  PendingApprovalPage: 'PendingApprovalPage',

  // Dashboard
  AdminDashboard: 'AdminDashboard',
  DashboardSidebar: 'DashboardSidebar',
  DashboardTopBar: 'DashboardTopBar',
  MobileBottomTabs: 'MobileBottomTabs',
  MobileHeader: 'MobileHeader',

  // Profile
  EditProfileForm: 'EditProfileForm',
  MyProfileSection: 'MyProfileSection',

  // Calendar
  CalendarHeader: 'CalendarHeader',
  MonthView: 'MonthView',
  WeekView: 'WeekView',
  DayView: 'DayView',
  AgendaView: 'AgendaView',
  EventManager: 'EventManager',
} as const;

export type DomainComponentName = keyof typeof DomainComponents;

// Registry por área de negócio
export const AuthComponents = {
  SignUpPage: 'SignUpPage',
  PendingApprovalPage: 'PendingApprovalPage',
} as const;

export const DashboardComponents = {
  AdminDashboard: 'AdminDashboard',
  DashboardSidebar: 'DashboardSidebar',
  DashboardTopBar: 'DashboardTopBar',
  MobileBottomTabs: 'MobileBottomTabs',
  MobileHeader: 'MobileHeader',
} as const;

export const ProfileComponents = {
  EditProfileForm: 'EditProfileForm',
  MyProfileSection: 'MyProfileSection',
} as const;

export const CalendarDomainComponents = {
  CalendarHeader: 'CalendarHeader',
  MonthView: 'MonthView',
  WeekView: 'WeekView',
  DayView: 'DayView',
  AgendaView: 'AgendaView',
  EventManager: 'EventManager',
} as const;
