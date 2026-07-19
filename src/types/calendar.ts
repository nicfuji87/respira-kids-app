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
  onBlockAgenda?: () => void;
}

// AI dev note: Mapeamento de cores para a paleta Respira Kids (design system).
// Fundos claros (tint dos tokens) + texto roxo-titulo (#47184E), que mantém
// contraste >= 4.5:1 sobre toda a paleta clara RK. Nunca usar cores Tailwind default.
export const eventColorMap: Record<EventColor, string> = {
  blue: 'bg-azul-respira/25 text-roxo-titulo border-azul-respira',
  green: 'bg-verde-pipa/30 text-roxo-titulo border-verde-pipa',
  orange: 'bg-amarelo-pipa/25 text-roxo-titulo border-amarelo-pipa',
  red: 'bg-vermelho-kids/30 text-roxo-titulo border-vermelho-kids',
  purple: 'bg-roxo-titulo/15 text-roxo-titulo border-roxo-titulo/40',
  pink: 'bg-vermelho-kids/15 text-roxo-titulo border-vermelho-kids/40',
  gray: 'bg-cinza-secundario/15 text-roxo-titulo border-cinza-secundario/40',
};

// AI dev note: Versão hex da paleta RK para uso em style inline (dots, fundos
// suavizados com alpha). Fonte única — substitui os colorToHex locais que usavam
// azul/rosa/roxo Tailwind default (#3B82F6 etc.), fora do design system.
export const eventColorHexMap: Record<EventColor, string> = {
  blue: '#7DCFC7', // azul-respira (teal primário)
  green: '#C3DFA0', // verde-pipa
  orange: '#FED920', // amarelo-pipa
  red: '#F4A28B', // vermelho-kids (salmão da marca)
  purple: '#47184E', // roxo-titulo
  pink: '#F9C7B9', // vermelho-kids clareado
  gray: '#737373', // cinza-secundario
};

// Fallback dentro do design system (antes era #3B82F6, azul Tailwind default)
export const EVENT_FALLBACK_HEX = '#7DCFC7';
