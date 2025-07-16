// AI dev note: Registry de componentes Domain do calendário
// Componentes que combinam Composed para criar funcionalidades específicas

// Calendar domain exports
export { CalendarHeader } from './CalendarHeader';
export { MonthView } from './MonthView';
export { WeekView } from './WeekView';
export { DayView } from './DayView';
export { AgendaView } from './AgendaView';
export { EventManager } from './EventManager';
export { EventListModal } from './EventListModal';

// Type exports
export type { MonthViewProps } from './MonthView';
export type { WeekViewProps } from './WeekView';
export type { DayViewProps } from './DayView';
export type { AgendaViewProps } from './AgendaView';
export type { EventManagerProps } from './EventManager';
export type { EventListModalProps } from './EventListModal';

// Registry para uso em templates
export const CalendarComponents = {
  CalendarHeader: 'CalendarHeader',
  MonthView: 'MonthView',
  WeekView: 'WeekView',
  DayView: 'DayView',
  AgendaView: 'AgendaView',
  EventManager: 'EventManager',
  EventListModal: 'EventListModal',
} as const;

export type CalendarComponentName = keyof typeof CalendarComponents;
