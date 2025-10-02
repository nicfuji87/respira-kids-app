import React from 'react';
import { CalendarTemplate } from './CalendarTemplate';
import { cn } from '@/lib/utils';
import type { CalendarEvent, CalendarView } from '@/types/calendar';

// AI dev note: Template específico para profissionals - sem painéis de estatísticas
export interface ProfissionalUser {
  id: string;
  name: string;
  email: string;
  role: 'profissional';
  specialization?: string;
  registrationNumber?: string;
}

export interface ProfissionalCalendarTemplateProps {
  currentUser: ProfissionalUser;
  events: CalendarEvent[];
  onEventSave: (event: Omit<CalendarEvent, 'id'> & { id?: string }) => void;
  initialView?: 'month' | 'week' | 'day' | 'agenda';
  initialDate?: Date;
  className?: string;
  showOnlyMyEvents?: boolean;

  // AI dev note: External state control (repassado do CalendarTemplateWithData)
  externalCurrentDate?: Date;
  externalCurrentView?: CalendarView;
  onExternalDateChange?: (date: Date) => void;
  onExternalViewChange?: (view: CalendarView) => void;

  // Permissions - passed from parent to avoid hardcoded overrides
  canCreateEvents?: boolean;
  canEditEvents?: boolean;
  canDeleteEvents?: boolean;
  canViewAllEvents?: boolean;

  // Navigation handlers
  onPatientClick?: (patientId: string | null) => void;
  onProfessionalClick?: (professionalId: string) => void;
}

export const ProfissionalCalendarTemplate =
  React.memo<ProfissionalCalendarTemplateProps>(
    ({
      currentUser,
      events,
      onEventSave,
      initialView = 'day', // Profissional typically prefers day view
      initialDate = new Date(),
      className,
      showOnlyMyEvents = true,
      // AI dev note: External state control
      externalCurrentDate,
      externalCurrentView,
      onExternalDateChange,
      onExternalViewChange,
      canCreateEvents = false,
      canEditEvents = true,
      canDeleteEvents = true,
      canViewAllEvents = false,
      onPatientClick,
      onProfessionalClick,
    }) => {
      // AI dev note: Filtrar eventos se necessário
      const getFilteredEvents = () => {
        if (!showOnlyMyEvents) return events;

        return events.filter((event) => {
          const metadata = event.metadata as {
            profissionalId?: string;
            [key: string]: unknown;
          };
          return (
            metadata?.profissionalId === currentUser.id ||
            event.attendees?.includes(currentUser.email)
          );
        });
      };

      const handleEventSave = (
        event: Omit<CalendarEvent, 'id'> & { id?: string }
      ) => {
        // Add professional metadata
        const professionalEvent = {
          ...event,
          metadata: {
            ...event.metadata,
            profissionalId: currentUser.id,
            createdBy: currentUser.id,
            createdAt: new Date(),
          },
        };

        onEventSave(professionalEvent);
      };

      return (
        <div
          className={cn(
            'profissional-calendar-template w-full h-full',
            className
          )}
        >
          {/* Main Calendar */}
          <CalendarTemplate
            events={getFilteredEvents()}
            onEventSave={handleEventSave}
            initialView={initialView}
            initialDate={initialDate}
            externalCurrentDate={externalCurrentDate}
            externalCurrentView={externalCurrentView}
            onExternalDateChange={onExternalDateChange}
            onExternalViewChange={onExternalViewChange}
            className="w-full max-w-none"
            userRole={currentUser.role}
            onPatientClick={onPatientClick}
            onProfessionalClick={onProfessionalClick}
            canCreateEvents={canCreateEvents}
            canEditEvents={canEditEvents}
            canDeleteEvents={canDeleteEvents}
            canViewAllEvents={canViewAllEvents}
          />
        </div>
      );
    }
  );
