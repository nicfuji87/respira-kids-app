// AI dev note: Registry de componentes Domain do calendário
// Componentes que combinam Composed para criar funcionalidades específicas

// Calendar domain exports
export { CalendarHeader } from './CalendarHeader';
export { MonthView } from './MonthView';
export { WeekView } from './WeekView';
export { DayView } from './DayView';
export { AgendaView } from './AgendaView';
export { EventManager } from './EventManager';

// Type exports
export type { MonthViewProps } from './MonthView';
export type { WeekViewProps } from './WeekView';
export type { DayViewProps } from './DayView';
export type { AgendaViewProps } from './AgendaView';
export type { EventManagerProps } from './EventManager';

// Registry para uso em templates
export const CalendarComponents = {
  CalendarHeader: 'CalendarHeader',
  MonthView: 'MonthView',
  WeekView: 'WeekView',
  DayView: 'DayView',
  AgendaView: 'AgendaView',
  EventManager: 'EventManager',
} as const;

export type CalendarComponentName = keyof typeof CalendarComponents;
