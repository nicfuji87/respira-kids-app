import React, { useState, useCallback } from 'react';
import {
  addDays,
  startOfWeek,
  endOfWeek,
  addWeeks,
  addMonths,
  subMonths,
  subWeeks,
  subDays,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

import {
  CalendarHeader,
  MonthView,
  WeekView,
  DayView,
  AgendaView,
  EventManager,
} from '@/components/domain/calendar';

import type { CalendarEvent, CalendarView } from '@/types/calendar';

// AI dev note: CalendarTemplate combina componentes Domain do calendário
// Template base que gerencia estado e comunicação entre componentes

export interface CalendarTemplateProps {
  // Events data
  events: CalendarEvent[];
  onEventSave: (event: Omit<CalendarEvent, 'id'> & { id?: string }) => void;
  onEventDelete: (eventId: string) => void;

  // View configuration
  initialView?: CalendarView;
  initialDate?: Date;

  // Layout
  className?: string;

  // Permissions
  canCreateEvents?: boolean;
  canEditEvents?: boolean;
  canDeleteEvents?: boolean;

  // Features
  showDatePicker?: boolean;
  showViewToggle?: boolean;
  showCreateButton?: boolean;
  showEventManager?: boolean;
}

export const CalendarTemplate = React.memo<CalendarTemplateProps>(
  ({
    events,
    onEventSave,
    onEventDelete,
    initialView = 'month',
    initialDate = new Date(),
    canCreateEvents = true,
    canEditEvents = true,
    canDeleteEvents = true,
    className,
    showEventManager = true,
  }) => {
    // State management
    const [currentDate, setCurrentDate] = useState<Date>(initialDate);
    const [currentView, setCurrentView] = useState<CalendarView>(initialView);
    const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
      null
    );
    const [isEventManagerOpen, setIsEventManagerOpen] = useState(false);

    // Navigation handlers
    const handlePreviousClick = useCallback(() => {
      setCurrentDate((prevDate) => {
        switch (currentView) {
          case 'month':
            return subMonths(prevDate, 1);
          case 'week':
            return subWeeks(prevDate, 1);
          case 'day':
            return subDays(prevDate, 1);
          case 'agenda':
            return subWeeks(prevDate, 1);
          default:
            return prevDate;
        }
      });
    }, [currentView]);

    const handleNextClick = useCallback(() => {
      setCurrentDate((prevDate) => {
        switch (currentView) {
          case 'month':
            return addMonths(prevDate, 1);
          case 'week':
            return addWeeks(prevDate, 1);
          case 'day':
            return addDays(prevDate, 1);
          case 'agenda':
            return addWeeks(prevDate, 1);
          default:
            return prevDate;
        }
      });
    }, [currentView]);

    const handleTodayClick = useCallback(() => {
      setCurrentDate(new Date());
    }, []);

    const handleDateChange = useCallback((date: Date) => {
      setCurrentDate(date);
    }, []);

    const handleViewChange = useCallback((view: CalendarView) => {
      setCurrentView(view);
    }, []);

    // Event handlers
    const handleEventClick = useCallback(
      (event: CalendarEvent) => {
        if (canEditEvents) {
          setSelectedEvent(event);
          setIsEventManagerOpen(true);
        }
      },
      [canEditEvents]
    );

    const handleNewEventClick = useCallback(() => {
      if (canCreateEvents) {
        setSelectedEvent(null);
        setIsEventManagerOpen(true);
      }
    }, [canCreateEvents]);

    const handleTimeSlotClick = useCallback(
      (_time: string, date: Date) => {
        if (canCreateEvents) {
          setSelectedEvent(null);
          // Set initial date/time based on clicked slot
          setCurrentDate(date);
          setIsEventManagerOpen(true);
        }
      },
      [canCreateEvents]
    );

    const handleEventSave = useCallback(
      (eventData: Omit<CalendarEvent, 'id'> & { id?: string }) => {
        onEventSave(eventData);
        setIsEventManagerOpen(false);
        setSelectedEvent(null);
      },
      [onEventSave]
    );

    const handleEventDelete = useCallback(
      (eventId: string) => {
        onEventDelete(eventId);
        setIsEventManagerOpen(false);
        setSelectedEvent(null);
      },
      [onEventDelete]
    );

    const handleEventManagerClose = useCallback(() => {
      setIsEventManagerOpen(false);
      setSelectedEvent(null);
    }, []);

    // Filter events based on current view and date
    const getFilteredEvents = useCallback(() => {
      if (!events || events.length === 0) return [];

      switch (currentView) {
        case 'month':
          return events.filter((event) => {
            const eventDate = new Date(event.start);
            return (
              eventDate.getMonth() === currentDate.getMonth() &&
              eventDate.getFullYear() === currentDate.getFullYear()
            );
          });
        case 'week': {
          const weekStart = startOfWeek(currentDate, { locale: ptBR });
          const weekEnd = endOfWeek(currentDate, { locale: ptBR });
          return events.filter((event) => {
            const eventDate = new Date(event.start);
            return eventDate >= weekStart && eventDate <= weekEnd;
          });
        }
        case 'day':
          return events.filter((event) => {
            const eventDate = new Date(event.start);
            return eventDate.toDateString() === currentDate.toDateString();
          });
        case 'agenda': {
          // Show upcoming events from current date
          return events
            .filter((event) => {
              const eventDate = new Date(event.start);
              return eventDate >= currentDate;
            })
            .sort(
              (a, b) =>
                new Date(a.start).getTime() - new Date(b.start).getTime()
            );
        }
        default:
          return events;
      }
    }, [events, currentView, currentDate]);

    // Render current view
    const renderCurrentView = () => {
      const filteredEvents = getFilteredEvents();

      switch (currentView) {
        case 'month':
          return (
            <MonthView
              currentDate={currentDate}
              events={filteredEvents}
              onEventClick={handleEventClick}
              onDateChange={handleDateChange}
            />
          );
        case 'week':
          return (
            <WeekView
              currentDate={currentDate}
              events={filteredEvents}
              onEventClick={handleEventClick}
              onDateClick={handleDateChange}
            />
          );
        case 'day':
          return (
            <DayView
              currentDate={currentDate}
              events={filteredEvents}
              onEventClick={handleEventClick}
              onTimeSlotClick={handleTimeSlotClick}
            />
          );
        case 'agenda':
          return (
            <AgendaView
              currentDate={currentDate}
              events={filteredEvents}
              onEventClick={handleEventClick}
            />
          );
        default:
          return null;
      }
    };

    return (
      <div className={cn('w-full h-full flex flex-col', className)}>
        {/* Calendar Header */}
        <div className="flex-shrink-0 mb-4">
          <CalendarHeader
            currentDate={currentDate}
            currentView={currentView}
            onPrevious={handlePreviousClick}
            onNext={handleNextClick}
            onToday={handleTodayClick}
            onDateChange={handleDateChange}
            onViewChange={handleViewChange}
            onNewEvent={canCreateEvents ? handleNewEventClick : undefined}
          />
        </div>

        {/* Calendar Content */}
        <div className="flex-1 min-h-0">{renderCurrentView()}</div>

        {/* Event Manager Modal */}
        {showEventManager && (
          <EventManager
            isOpen={isEventManagerOpen}
            onClose={handleEventManagerClose}
            event={selectedEvent}
            onSave={handleEventSave}
            onDelete={canDeleteEvents ? handleEventDelete : undefined}
            initialDate={currentDate}
          />
        )}
      </div>
    );
  }
);

CalendarTemplate.displayName = 'CalendarTemplate';
