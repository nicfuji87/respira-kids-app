// AI dev note: Registry de componentes Domain/Calendar
// Componentes que combinam Composed para funcionalidades completas de calendário

export { CalendarHeader } from './CalendarHeader';
export { MonthView } from './MonthView';
export { WeekView } from './WeekView';
export { DayView } from './DayView';
export { AgendaView } from './AgendaView';
export { EventListModal } from './EventListModal';
export { EventManager } from './EventManager';
export { AppointmentDetailsManager } from './AppointmentDetailsManager';
export { AppointmentFormManager } from './AppointmentFormManager';

// Shared Schedules
export { SharedScheduleCreatorWizard } from './SharedScheduleCreatorWizard';
export { SharedScheduleEditorDialog } from './SharedScheduleEditorDialog';
export { SharedScheduleSelectorWizard } from './SharedScheduleSelectorWizard';
export { SharedSchedulesList } from './SharedSchedulesList';

// Type exports
export type { MonthViewProps } from './MonthView';
export type { WeekViewProps } from './WeekView';
export type { DayViewProps } from './DayView';
export type { AgendaViewProps } from './AgendaView';
export type { EventManagerProps } from './EventManager';
export type {
  AppointmentDetailsManagerProps,
  AppointmentUpdateData,
} from './AppointmentDetailsManager';
export type { EventListModalProps } from './EventListModal';

// Shared Schedules Type exports
export type { SharedScheduleCreatorWizardProps } from './SharedScheduleCreatorWizard';
export type { SharedScheduleEditorDialogProps } from './SharedScheduleEditorDialog';
export type { SharedScheduleSelectorWizardProps } from './SharedScheduleSelectorWizard';
export type { SharedSchedulesListProps } from './SharedSchedulesList';

// Registry para uso em templates
export const CalendarComponents = {
  CalendarHeader: 'CalendarHeader',
  MonthView: 'MonthView',
  WeekView: 'WeekView',
  DayView: 'DayView',
  AgendaView: 'AgendaView',
  EventManager: 'EventManager',
  AppointmentDetailsManager: 'AppointmentDetailsManager',
  EventListModal: 'EventListModal',
} as const;

export type CalendarComponentName = keyof typeof CalendarComponents;
