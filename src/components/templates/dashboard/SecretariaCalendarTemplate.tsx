import React, { useState } from 'react';
import { CalendarTemplate } from './CalendarTemplate';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { Users, Filter } from 'lucide-react';
import type { CalendarEvent, CalendarView } from '@/types/calendar';

// AI dev note: SecretariaCalendarTemplate combina CalendarTemplate
// Template para secretárias com permissões para visualizar profissionais autorizados

export interface SecretariaUser {
  id: string;
  name: string;
  email: string;
  role: 'secretaria';
  avatar?: string;
  authorizedProfessionals?: string[];
}

export interface SecretariaCalendarTemplateProps {
  // User info
  currentUser: SecretariaUser;

  // Events data
  events: CalendarEvent[];
  onEventSave: (event: Omit<CalendarEvent, 'id'> & { id?: string }) => void;

  // View configuration
  initialView?: CalendarView;
  initialDate?: Date;

  // Layout
  className?: string;

  // Secretaria features
  availableProfessionals?: {
    id: string;
    name: string;
    specialization?: string;
  }[];

  // Permissions - passed from parent to avoid hardcoded overrides
  canCreateEvents?: boolean;
  canEditEvents?: boolean;
  canDeleteEvents?: boolean;
  canViewAllEvents?: boolean;

  // Navigation handlers
  onPatientClick?: (patientId: string | null) => void;
  onProfessionalClick?: (professionalId: string) => void;
}

export const SecretariaCalendarTemplate =
  React.memo<SecretariaCalendarTemplateProps>(
    ({
      currentUser,
      events,
      onEventSave,
      initialView = 'week', // Secretaria typically prefers week view
      initialDate = new Date(),
      className,
      availableProfessionals = [],
      canCreateEvents = true,
      canEditEvents = true,
      canDeleteEvents = false, // Default for secretaria
      canViewAllEvents = false,
      onPatientClick,
      onProfessionalClick,
    }) => {
      // State for filters
      const [selectedProfessional, setSelectedProfessional] =
        useState<string>('all');
      const [showFilters, setShowFilters] = useState(false);

      // Get authorized professionals
      const getAuthorizedProfessionals = () => {
        if (!currentUser.authorizedProfessionals) {
          return availableProfessionals;
        }

        return availableProfessionals.filter((prof) =>
          currentUser.authorizedProfessionals?.includes(prof.id)
        );
      };

      // Filter events based on secretaria permissions
      const getFilteredEvents = () => {
        let filteredEvents = [...events];

        // Filter by authorized professionals
        const authorizedProfessionals = getAuthorizedProfessionals();
        const authorizedIds = authorizedProfessionals.map((prof) => prof.id);

        if (authorizedIds.length > 0) {
          filteredEvents = filteredEvents.filter(
            (event) =>
              event.attendees?.some((attendee) =>
                authorizedIds.includes(attendee)
              ) ||
              authorizedProfessionals.some((prof) =>
                event.title.includes(prof.name)
              )
          );
        }

        // Filter by selected professional
        if (selectedProfessional !== 'all') {
          const selectedProf = availableProfessionals.find(
            (prof) => prof.id === selectedProfessional
          );
          if (selectedProf) {
            filteredEvents = filteredEvents.filter(
              (event) =>
                event.attendees?.includes(selectedProf.id) ||
                event.title.includes(selectedProf.name)
            );
          }
        }

        return filteredEvents;
      };

      const handleEventSave = (
        event: Omit<CalendarEvent, 'id'> & { id?: string }
      ) => {
        // Secretaria can save events for authorized professionals
        const secretariaEvent = {
          ...event,
          attendees: event.attendees || [],
          // Add secretaria metadata
          scheduledBy: currentUser.id,
          scheduledAt: new Date(),
        };

        onEventSave(secretariaEvent);
      };

      // Get professional statistics
      const getProfessionalStats = () => {
        const authorizedProfessionals = getAuthorizedProfessionals();
        const filteredEvents = getFilteredEvents();

        return authorizedProfessionals.map((prof) => ({
          ...prof,
          eventCount: filteredEvents.filter(
            (event) =>
              event.attendees?.includes(prof.id) ||
              event.title.includes(prof.name)
          ).length,
          todayEvents: filteredEvents.filter(
            (event) =>
              (event.attendees?.includes(prof.id) ||
                event.title.includes(prof.name)) &&
              new Date(event.start).toDateString() === new Date().toDateString()
          ).length,
        }));
      };

      return (
        <div className="secretaria-calendar-template">
          {/* Secretaria Header */}
          <div className="mb-4 p-4 bg-muted/50 rounded-lg">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h3 className="font-semibold text-lg mb-2">
                  <Users className="inline h-5 w-5 mr-2" />
                  Agenda - {currentUser.name}
                </h3>
                <p className="text-sm text-muted-foreground">
                  Gerenciando {getAuthorizedProfessionals().length}{' '}
                  profissionais
                </p>
              </div>

              {/* Filters */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <Filter className="h-4 w-4 mr-2" />
                  Filtros
                </Button>

                {showFilters && (
                  <Select
                    value={selectedProfessional}
                    onValueChange={setSelectedProfessional}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Selecionar profissional" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        Todos os profissionais
                      </SelectItem>
                      {getAuthorizedProfessionals().map((prof) => (
                        <SelectItem key={prof.id} value={prof.id}>
                          {prof.name}{' '}
                          {prof.specialization && `(${prof.specialization})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </div>

          {/* Professional Stats */}
          <div className="mb-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {getProfessionalStats().map((prof) => (
              <div key={prof.id} className="p-3 bg-card rounded-lg border">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-medium text-sm">{prof.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {prof.specialization || 'Profissional'}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {prof.todayEvents} hoje
                  </Badge>
                </div>
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <span>Total: {prof.eventCount}</span>
                  <span>•</span>
                  <span
                    className={`cursor-pointer hover:text-primary ${
                      selectedProfessional === prof.id
                        ? 'text-primary font-medium'
                        : ''
                    }`}
                    onClick={() => setSelectedProfessional(prof.id)}
                  >
                    Ver agenda
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Quick Actions */}
          <div className="mb-4 flex gap-2 flex-wrap">
            <div className="text-sm text-muted-foreground">
              Vista recomendada: Semana | Mostrando {getFilteredEvents().length}{' '}
              evento(s)
              {selectedProfessional !== 'all' && (
                <span className="ml-1 text-primary">
                  para{' '}
                  {
                    availableProfessionals.find(
                      (p) => p.id === selectedProfessional
                    )?.name
                  }
                </span>
              )}
            </div>
          </div>

          {/* Main Calendar */}
          <CalendarTemplate
            events={getFilteredEvents()}
            onEventSave={handleEventSave}
            initialView={initialView}
            initialDate={initialDate}
            canCreateEvents={canCreateEvents}
            canEditEvents={canEditEvents}
            canDeleteEvents={canDeleteEvents}
            canViewAllEvents={canViewAllEvents}
            showEventManager={true}
            userRole={currentUser.role}
            onPatientClick={onPatientClick}
            onProfessionalClick={onProfessionalClick}
            className={className}
          />
        </div>
      );
    }
  );

SecretariaCalendarTemplate.displayName = 'SecretariaCalendarTemplate';
