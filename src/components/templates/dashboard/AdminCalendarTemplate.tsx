import React from 'react';
import { CalendarTemplate } from './CalendarTemplate';
import type { CalendarEvent, CalendarView } from '@/types/calendar';

// AI dev note: AdminCalendarTemplate combina CalendarTemplate
// Template para administradores com permissões completas

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'admin';
  avatar?: string;
}

export interface AdminCalendarTemplateProps {
  // User info
  currentUser: AdminUser;

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

  // Additional admin features
  showAllProfessionals?: boolean;
  showSystemEvents?: boolean;
  showStatistics?: boolean;
}

export const AdminCalendarTemplate = React.memo<AdminCalendarTemplateProps>(
  ({
    currentUser,
    events,
    onEventSave,
    onEventDelete,
    initialView = 'month',
    initialDate = new Date(),
    className,
    showAllProfessionals = true,
    showSystemEvents = true,
    showStatistics = true,
  }) => {
    // Admin has all permissions
    const adminPermissions = {
      canCreateEvents: true,
      canEditEvents: true,
      canDeleteEvents: true,
      showEventManager: true,
    };

    // Filter events based on admin preferences
    const getFilteredEvents = () => {
      let filteredEvents = [...events];

      // Admin can see all events by default
      if (!showAllProfessionals) {
        // If disabled, only show events assigned to current admin
        filteredEvents = filteredEvents.filter(
          (event) =>
            event.attendees?.includes(currentUser.id) ||
            event.attendees?.includes(currentUser.email)
        );
      }

      if (!showSystemEvents) {
        // Filter out system-generated events (e.g., maintenance, backups)
        filteredEvents = filteredEvents.filter(
          (event) =>
            !event.title.startsWith('[Sistema]') &&
            !event.title.startsWith('[Automático]')
        );
      }

      return filteredEvents;
    };

    const handleEventSave = (
      event: Omit<CalendarEvent, 'id'> & { id?: string }
    ) => {
      // Admin can save events with additional metadata
      const adminEvent = {
        ...event,
        attendees: event.attendees || [],
        // Add admin metadata if needed
        createdBy: currentUser.id,
        createdAt: new Date(),
      };

      onEventSave(adminEvent);
    };

    const handleEventDelete = (eventId: string) => {
      onEventDelete(eventId);
    };

    return (
      <div className="admin-calendar-template">
        {/* Admin Statistics Panel */}
        {showStatistics && (
          <div className="mb-4 p-4 bg-muted/50 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">
                  {events.length}
                </div>
                <div className="text-sm text-muted-foreground">
                  Total de Eventos
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {events.filter((e) => new Date(e.start) >= new Date()).length}
                </div>
                <div className="text-sm text-muted-foreground">
                  Próximos Eventos
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {new Set(events.flatMap((e) => e.attendees || [])).size}
                </div>
                <div className="text-sm text-muted-foreground">
                  Participantes Únicos
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Calendar */}
        <CalendarTemplate
          events={getFilteredEvents()}
          onEventSave={handleEventSave}
          onEventDelete={handleEventDelete}
          initialView={initialView}
          initialDate={initialDate}
          className={className}
          {...adminPermissions}
        />
      </div>
    );
  }
);

AdminCalendarTemplate.displayName = 'AdminCalendarTemplate';
