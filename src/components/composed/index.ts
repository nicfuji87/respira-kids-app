// Authentication
export { AuthCard } from './AuthCard';
export { LoginForm } from './LoginForm';
export { SignUpForm } from './SignUpForm';
export { CompleteProfileForm } from './CompleteProfileForm';

// User Management
export { UserApprovalCard } from './UserApprovalCard';
export { UserProfileDropdown } from './UserProfileDropdown';
export { ProfileFormFields } from './ProfileFormFields';

// Calendar and Date
export { CalendarGrid } from './CalendarGrid';
export { DatePicker } from './DatePicker';
export { TimeSlot } from './TimeSlot';
export { EventCard } from './EventCard';
export { WeekEventBlock } from './WeekEventBlock';
export { WeekTimeGrid } from './WeekTimeGrid';
export { CurrentTimeIndicator } from './CurrentTimeIndicator';

// Forms and Company
export { CompanyForm } from './CompanyForm';
export { ColorPicker } from './ColorPicker';
export { AvatarUpload } from './AvatarUpload';

// Navigation
export { BreadcrumbNav } from './BreadcrumbNav';
export { NavigationItem } from './NavigationItem';
export { NotificationBadge } from './NotificationBadge';
export { ViewToggle } from './ViewToggle';

// Contact and Status
export { ContactLink } from './ContactLink';
export { StatusPaymentDisplay } from './StatusPaymentDisplay';

// Configuration
export { ConfigurationTabs } from './ConfigurationTabs';

// Development
export { DevelopmentPlaceholder } from './DevelopmentPlaceholder';

// Evolution and Media
export { EvolutionEditor } from './EvolutionEditor';
export { SessionMediaManager } from './SessionMediaManager';

// Location
export { LocationSelect } from './LocationSelect';

// Medical Appointment Components
export { PatientSelect } from './PatientSelect';
export { ProfessionalSelect } from './ProfessionalSelect';
export { ServiceTypeSelect } from './ServiceTypeSelect';
export { ConsultaStatusSelect } from './ConsultaStatusSelect';
export { PagamentoStatusSelect } from './PagamentoStatusSelect';

// Professional Dashboard Components
export { ProfessionalMetrics } from './ProfessionalMetrics';
export { AppointmentsList } from './AppointmentsList';
export { ConsultationsToEvolve } from './ConsultationsToEvolve';
export { MaterialRequestCard } from './MaterialRequestCard';
export { FaturamentoChart } from './FaturamentoChart';

// Patient Management Components
export { PatientConsentForm } from './PatientConsentForm';
export { PatientPersonalInfo } from './PatientPersonalInfo';
export { PatientCompleteInfo } from './PatientCompleteInfo';
export { PatientMetrics } from './PatientMetrics';
export { RecentConsultations } from './RecentConsultations';
export { PatientAnamnesis } from './PatientAnamnesis';
export { PatientHistory } from './PatientHistory';
export { MediaGallery } from './MediaGallery';

// Type exports
export type { ApprovalStatus } from './UserApprovalCard';
export type { NavigationItemProps } from './NavigationItem';
export type { UserProfileProps } from './UserProfileDropdown';
export type { BreadcrumbNavProps, BreadcrumbItem } from './BreadcrumbNav';
export type { NotificationBadgeProps } from './NotificationBadge';
export type { DevelopmentPlaceholderProps } from './DevelopmentPlaceholder';
export type { ConfigurationTabsProps } from './ConfigurationTabs';
export type { AvatarUploadProps } from './AvatarUpload';
export type { ProfileFormFieldsProps } from './ProfileFormFields';
export type { CompanyFormProps } from './CompanyForm';
export type { EventCardProps } from './EventCard';
export type { ViewToggleProps } from './ViewToggle';
export type { ColorPickerProps } from './ColorPicker';
export type { CalendarGridProps } from './CalendarGrid';
export type { CurrentTimeIndicatorProps } from './CurrentTimeIndicator';
export type { WeekEventBlockProps } from './WeekEventBlock';
export type { WeekTimeGridProps } from './WeekTimeGrid';
export type { StatusPaymentDisplayProps } from './StatusPaymentDisplay';
export type { ContactLinkProps } from './ContactLink';
export type { LocationSelectProps, LocationOption } from './LocationSelect';
export type { SessionMediaManagerProps } from './SessionMediaManager';
export type { EvolutionEditorProps } from './EvolutionEditor';

// Patient Management Type exports
export type {
  PatientConsentFormProps,
  PatientPersonalInfoProps,
  PatientMetricsProps,
  RecentConsultationsProps,
  PatientAnamnesisProps,
  PatientHistoryProps,
} from '@/types/patient-details';
export type { MediaGalleryProps } from '@/types/session-media';

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
  CompanyForm: 'CompanyForm',

  // Calendar
  EventCard: 'EventCard',
  ViewToggle: 'ViewToggle',
  TimeSlot: 'TimeSlot',
  ColorPicker: 'ColorPicker',
  CalendarGrid: 'CalendarGrid',
  CurrentTimeIndicator: 'CurrentTimeIndicator',
  WeekEventBlock: 'WeekEventBlock',
  WeekTimeGrid: 'WeekTimeGrid',
  StatusPaymentDisplay: 'StatusPaymentDisplay',
  ContactLink: 'ContactLink',
  LocationSelect: 'LocationSelect',
  SessionMediaManager: 'SessionMediaManager',
  EvolutionEditor: 'EvolutionEditor',
} as const;

export type ComposedComponentName = keyof typeof ComposedComponents;
