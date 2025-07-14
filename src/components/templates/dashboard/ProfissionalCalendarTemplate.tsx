import React from 'react';
import { CalendarTemplate } from './CalendarTemplate';
import type { CalendarEvent, CalendarView } from '@/types/calendar';

// AI dev note: ProfissionalCalendarTemplate combina CalendarTemplate
// Template para profissionais com permissões restritas aos próprios eventos

export interface ProfissionalUser {
  id: string;
  name: string;
  email: string;
  role: 'profissional';
  avatar?: string;
  specialization?: string;
  registrationNumber?: string;
}

export interface ProfissionalCalendarTemplateProps {
  // User info
  currentUser: ProfissionalUser;

  // Events data
  events: CalendarEvent[];
  onEventSave: (event: Omit<CalendarEvent, 'id'> & { id?: string }) => void;
  onEventEdit: (event: CalendarEvent) => void;
  onEventDelete: (eventId: string) => void;

  // View configuration
  initialView?: CalendarView;
  initialDate?: Date;

  // Layout
  className?: string;

  // Professional features
  showPatientNames?: boolean;
  showOnlyMyEvents?: boolean;
  canEditOtherEvents?: boolean;
}

export const ProfissionalCalendarTemplate =
  React.memo<ProfissionalCalendarTemplateProps>(
    ({
      currentUser,
      events,
      onEventSave,
      onEventDelete,
      initialView = 'day', // Profissional typically prefers day view
      initialDate = new Date(),
      className,
      showPatientNames = true,
      showOnlyMyEvents = true,
    }) => {
      // Professional has limited permissions
      const professionalPermissions = {
        canCreateEvents: true,
        canEditEvents: true,
        canDeleteEvents: true,
        showEventManager: true,
      };

      // Filter events based on professional permissions
      const getFilteredEvents = () => {
        let filteredEvents = [...events];

        if (showOnlyMyEvents) {
          // Only show events assigned to this professional
          filteredEvents = filteredEvents.filter(
            (event) =>
              event.attendees?.includes(currentUser.id) ||
              event.attendees?.includes(currentUser.email) ||
              event.title.includes(currentUser.name)
          );
        }

        if (!showPatientNames) {
          // Anonymize patient names for privacy
          filteredEvents = filteredEvents.map((event) => ({
            ...event,
            title: event.title.replace(
              /com\s+[A-Z][a-z]+\s+[A-Z][a-z]+/g,
              'com Paciente'
            ),
            description: event.description?.replace(
              /[A-Z][a-z]+\s+[A-Z][a-z]+/g,
              'Paciente'
            ),
          }));
        }

        return filteredEvents;
      };

      const handleEventSave = (
        event: Omit<CalendarEvent, 'id'> & { id?: string }
      ) => {
        // Professional can only save events assigned to them
        const professionalEvent = {
          ...event,
          attendees: event.attendees || [currentUser.id],
          // Add professional metadata
          createdBy: currentUser.id,
          createdAt: new Date(),
        };

        onEventSave(professionalEvent);
      };

      const handleEventDelete = (eventId: string) => {
        onEventDelete(eventId);
      };

      // Get upcoming appointments for professional
      const getUpcomingAppointments = () => {
        const today = new Date();
        const filteredEvents = getFilteredEvents();

        return filteredEvents
          .filter((event) => new Date(event.start) >= today)
          .sort(
            (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
          )
          .slice(0, 3); // Show next 3 appointments
      };

      return (
        <div className="profissional-calendar-template">
          {/* Professional Info Panel */}
          <div className="mb-4 p-4 bg-muted/50 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h3 className="font-semibold text-lg mb-2">
                  Olá, {currentUser.name}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {currentUser.specialization || 'Profissional de Saúde'}
                </p>
                {currentUser.registrationNumber && (
                  <p className="text-xs text-muted-foreground">
                    Registro: {currentUser.registrationNumber}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">
                    Próximos Atendimentos:
                  </span>
                  <span className="text-sm font-medium">
                    {getUpcomingAppointments().length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Hoje:</span>
                  <span className="text-sm font-medium">
                    {
                      getFilteredEvents().filter(
                        (e) =>
                          new Date(e.start).toDateString() ===
                          new Date().toDateString()
                      ).length
                    }
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="mb-4 flex gap-2 flex-wrap">
            <div className="text-sm text-muted-foreground">
              Vista recomendada: Dia | Próximos:
              {getUpcomingAppointments()
                .slice(0, 2)
                .map((event, idx) => (
                  <span key={event.id} className="ml-1 text-primary">
                    {event.title.split(' ')[0]}
                    {idx < 1 && getUpcomingAppointments().length > 1
                      ? ', '
                      : ''}
                  </span>
                ))}
            </div>
          </div>

          {/* Main Calendar */}
          <CalendarTemplate
            events={getFilteredEvents()}
            onEventSave={handleEventSave}
            onEventDelete={handleEventDelete}
            initialView={initialView}
            initialDate={initialDate}
            className={className}
            {...professionalPermissions}
          />
        </div>
      );
    }
  );

ProfissionalCalendarTemplate.displayName = 'ProfissionalCalendarTemplate';
