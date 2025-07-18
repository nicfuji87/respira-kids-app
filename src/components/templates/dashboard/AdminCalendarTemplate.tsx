import React from 'react';
import { CalendarTemplate } from './CalendarTemplate';
import { cn } from '@/lib/utils';
import type { CalendarEvent } from '@/types/calendar';

// AI dev note: Template específico para admins - sem painéis de estatísticas
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'admin';
}

export interface AdminCalendarTemplateProps {
  currentUser: AdminUser;
  events: CalendarEvent[];
  onEventSave: (event: Omit<CalendarEvent, 'id'> & { id?: string }) => void;
  initialView?: 'month' | 'week' | 'day' | 'agenda';
  initialDate?: Date;
  className?: string;
  showAllProfessionals?: boolean;
  showSystemEvents?: boolean;

  // Permissions - passed from parent to avoid hardcoded overrides
  canCreateEvents?: boolean;
  canEditEvents?: boolean;
  canDeleteEvents?: boolean;
  canViewAllEvents?: boolean;
}

export const AdminCalendarTemplate = React.memo<AdminCalendarTemplateProps>(
  ({
    currentUser,
    events,
    onEventSave,
    initialView = 'month',
    initialDate = new Date(),
    className,
    showAllProfessionals = true,
    showSystemEvents = true,
    canCreateEvents = true,
    canEditEvents = true,
    canDeleteEvents = true,
    canViewAllEvents = true,
  }) => {
    const getFilteredEvents = () => {
      let filteredEvents = [...events];

      if (!showAllProfessionals) {
        // Filter to specific professionals if needed
        // Implementation would depend on specific requirements
      }

      if (!showSystemEvents) {
        // Filter out system events if needed
        filteredEvents = filteredEvents.filter(
          (event) => !event.metadata?.isSystemEvent
        );
      }

      return filteredEvents;
    };

    const handleEventSave = (
      event: Omit<CalendarEvent, 'id'> & { id?: string }
    ) => {
      const adminEvent = {
        ...event,
        metadata: {
          ...event.metadata,
          createdBy: currentUser.id,
          createdAt: new Date(),
        },
      };

      onEventSave(adminEvent);
    };

    return (
      <div className={cn('admin-calendar-template w-full h-full', className)}>
        {/* Main Calendar */}
        <CalendarTemplate
          events={getFilteredEvents()}
          onEventSave={handleEventSave}
          initialView={initialView}
          initialDate={initialDate}
          className="w-full h-full"
          userRole={currentUser.role}
          {...{
            canCreateEvents,
            canEditEvents,
            canDeleteEvents,
            canViewAllEvents,
          }}
        />
      </div>
    );
  }
);
