// Authentication
export { AuthCard } from './AuthCard';
export { LoginForm } from './LoginForm';
export { SignUpForm } from './SignUpForm';
export { CompleteProfileForm } from './CompleteProfileForm';
export { ForgotPasswordForm } from './ForgotPasswordForm';
export { ResetPasswordForm } from './ResetPasswordForm';

// User Management
export { UserApprovalCard } from './UserApprovalCard';
export { UserProfileDropdown } from './UserProfileDropdown';
export { VariableInserter } from './VariableInserter';
export { ContractTemplateEditor } from './ContractTemplateEditor';
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
export { PatientMetricsWithConsultations } from './PatientMetricsWithConsultations';
export { RecentConsultations } from './RecentConsultations';
export { PatientAnamnesis } from './PatientAnamnesis';
export { PatientHistory } from './PatientHistory';
export { MediaGallery } from './MediaGallery';
export { BillingResponsibleSelect } from './BillingResponsibleSelect';

// Financial Components
export { PinConfiguration } from './PinConfiguration';
export { PinValidationDialog } from './PinValidationDialog';
export { FinancialConsultationsList } from './FinancialConsultationsList';
export { FinancialFaturasList } from './FinancialFaturasList';
export { FaturasList } from './FaturasList';

// User Management Components
export { UserSearch } from './UserSearch';
export { UserFilters } from './UserFilters';
export { UserMetrics } from './UserMetrics';
export { TypePersonSelect } from './TypePersonSelect';
export { AddressSelect } from './AddressSelect';
export { ResponsibleSelect } from './ResponsibleSelect';
export { PediatraSelect } from './PediatraSelect';
export { PatientsList } from './PatientsList';

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
export type { PediatraSelectProps } from './PediatraSelect';
export type { PatientsListProps } from './PatientsList';
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
  ForgotPasswordForm: 'ForgotPasswordForm',
  ResetPasswordForm: 'ResetPasswordForm',
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

export { AIConfigurationCard } from './AIConfigurationCard';

// System Configuration Components
export { StatusBadge } from './StatusBadge';
export { CRUDActions } from './CRUDActions';
export { GenericTable } from './GenericTable';
export { GenericForm } from './GenericForm';

// Type exports for system components
export type { StatusBadgeProps } from './StatusBadge';
export type { CRUDActionsProps } from './CRUDActions';
export type { GenericTableProps, GenericTableColumn } from './GenericTable';
export type { GenericFormProps, FormField } from './GenericForm';

export { CepSearch } from './CepSearch';
export { ProfessionalFilter } from './ProfessionalFilter';

// Webhook Management Components
export { WebhooksList } from './WebhooksList';
export { WebhookForm } from './WebhookForm';
export { WebhookLogs } from './WebhookLogs';

// Webhook Type exports
export type { Webhook } from './WebhooksList';
export type { WebhookFormData } from './WebhookForm';
export type { WebhookLog } from './WebhookLogs';
