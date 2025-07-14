import React, { Suspense } from 'react';
import { CalendarTemplateWithData } from '@/components/templates/dashboard/CalendarTemplateWithData';
import type { CalendarEvent } from '@/types/calendar';
import { useAuth } from '@/hooks/useAuth';

// AI dev note: AgendaPage atualizada para usar CalendarTemplateWithData
// Integra com Supabase e usa dados reais do sistema

export const AgendaPage: React.FC = () => {
  const { user, loading } = useAuth();

  const handleEventClick = (event: CalendarEvent) => {
    console.log('Event clicked:', event);
    // Implementar lógica de visualização/edição do evento
  };

  const handleEventSave = (event: CalendarEvent) => {
    console.log('Event saved:', event);
    // Implementar feedback de sucesso
  };

  const handleEventDelete = (eventId: string) => {
    console.log('Event deleted:', eventId);
    // Implementar feedback de exclusão
  };

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Agenda</h1>
            <p className="text-muted-foreground">Carregando...</p>
          </div>
        </div>
        <div className="flex items-center justify-center min-h-96">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // Error state
  if (!user) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Agenda</h1>
            <p className="text-muted-foreground">
              Erro ao carregar dados do usuário
            </p>
          </div>
        </div>
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
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Agenda</h1>
          <p className="text-muted-foreground">
            Gerencie seus agendamentos e visualize sua agenda
          </p>
        </div>
      </div>

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
          className="min-h-screen"
        />
      </Suspense>
    </div>
  );
};
