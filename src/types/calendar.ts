// AI dev note: Tipos básicos do sistema de calendário
// Definições centralizadas para manter consistência entre componentes

export type CalendarView = 'month' | 'week' | 'day' | 'agenda';

export type EventColor =
  | 'blue'
  | 'green'
  | 'orange'
  | 'red'
  | 'purple'
  | 'pink'
  | 'gray';

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  color?: EventColor;
  location?: string;
  attendees?: string[];
  metadata?: Record<string, unknown>; // Metadados específicos para integração com Supabase
}

export interface CalendarViewOption {
  value: CalendarView;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export interface TimeSlotProps {
  time: string;
  events?: CalendarEvent[];
  onSlotClick?: (time: string) => void;
  onEventClick?: (event: CalendarEvent) => void;
  className?: string;
}

export interface CalendarHeaderProps {
  currentDate: Date;
  currentView: CalendarView;
  onDateChange: (date: Date) => void;
  onViewChange: (view: CalendarView) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onNewEvent?: () => void;
}

// Mapeamento de cores para o tema do projeto
export const eventColorMap: Record<EventColor, string> = {
  blue: 'bg-blue-100 text-blue-900 border-blue-200',
  green: 'bg-green-100 text-green-900 border-green-200',
  orange: 'bg-orange-100 text-orange-900 border-orange-200',
  red: 'bg-red-100 text-red-900 border-red-200',
  purple: 'bg-purple-100 text-purple-900 border-purple-200',
  pink: 'bg-pink-100 text-pink-900 border-pink-200',
  gray: 'bg-gray-100 text-gray-900 border-gray-200',
};
