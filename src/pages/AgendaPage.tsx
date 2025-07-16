import React, { Suspense } from 'react';
import { CalendarTemplateWithData } from '@/components/templates';
import { useAuth } from '@/hooks/useAuth';
import type { CalendarEvent } from '@/types/calendar';

// AI dev note: AgendaPage simplificada - apenas calendário sem headers ou estatísticas
export const AgendaPage: React.FC = () => {
  const { user } = useAuth();

  const handleEventClick = (event: CalendarEvent) => {
    console.log('Event clicked:', event);
  };

  const handleEventSave = (event: CalendarEvent) => {
    console.log('Event saved:', event);
  };

  const handleEventDelete = (eventId: string) => {
    console.log('Event deleted:', eventId);
  };

  // Error state
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <p className="text-muted-foreground">
            Não foi possível carregar a agenda.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Verifique sua conexão e tente novamente.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      {/* Calendário integrado com dados reais */}
      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-96">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        }
      >
        <CalendarTemplateWithData
          responsive={true}
          onEventClick={handleEventClick}
          onEventSave={handleEventSave}
          onEventDelete={handleEventDelete}
        />
      </Suspense>
    </div>
  );
};
