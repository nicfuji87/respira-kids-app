import React, { useState } from 'react';
import { CalendarTemplate } from './CalendarTemplate';
import { Button } from '@/components/primitives/button';
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

  // AI dev note: External state control (repassado do CalendarTemplateWithData)
  externalCurrentDate?: Date;
  externalCurrentView?: CalendarView;
  onExternalDateChange?: (date: Date) => void;
  onExternalViewChange?: (view: CalendarView) => void;

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
      availableProfessionals = [],
      // AI dev note: External state control
      externalCurrentDate,
      externalCurrentView,
      onExternalDateChange,
      onExternalViewChange,
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
        // A filtragem por profissionais autorizados já foi feita na query
        // Aqui só aplicamos filtro adicional por profissional selecionado se necessário
        let filteredEvents = [...events];

        // Filter by selected professional only
        if (selectedProfessional !== 'all') {
          const selectedProf = availableProfessionals.find(
            (prof) => prof.id === selectedProfessional
          );
          if (selectedProf) {
            filteredEvents = filteredEvents.filter(
              (event) =>
                event.title.includes(selectedProf.name) ||
                event.metadata?.professionalId === selectedProf.id
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

      return (
        <div className="secretaria-calendar-template w-full h-full flex flex-col -mx-4">
          {/* Header compacto e expandido */}
          <div className="flex-shrink-0 px-4 py-2 bg-muted/30 border-b flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h3 className="font-semibold text-sm">
                <Users className="inline h-4 w-4 mr-1" />
                {currentUser.name} | {getAuthorizedProfessionals().length}{' '}
                profissionais
              </h3>
              <div className="text-xs text-muted-foreground">
                {getFilteredEvents().length} evento(s)
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

            {/* Filtros compactos */}
            <div className="flex gap-2 items-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="text-xs"
              >
                <Filter className="h-3 w-3 mr-1" />
                Filtros
              </Button>

              {showFilters && (
                <Select
                  value={selectedProfessional}
                  onValueChange={setSelectedProfessional}
                >
                  <SelectTrigger className="w-40 h-7 text-xs">
                    <SelectValue placeholder="Profissional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {getAuthorizedProfessionals().map((prof) => (
                      <SelectItem key={prof.id} value={prof.id}>
                        {prof.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Calendário expandido para ocupar todo espaço restante */}
          <div className="flex-1 min-h-0">
            <CalendarTemplate
              events={getFilteredEvents()}
              onEventSave={handleEventSave}
              initialView={initialView}
              initialDate={initialDate}
              externalCurrentDate={externalCurrentDate}
              externalCurrentView={externalCurrentView}
              onExternalDateChange={onExternalDateChange}
              onExternalViewChange={onExternalViewChange}
              canCreateEvents={canCreateEvents}
              canEditEvents={canEditEvents}
              canDeleteEvents={canDeleteEvents}
              canViewAllEvents={canViewAllEvents}
              showEventManager={true}
              userRole={currentUser.role}
              onPatientClick={onPatientClick}
              onProfessionalClick={onProfessionalClick}
              className="w-full max-w-none"
            />
          </div>
        </div>
      );
    }
  );

SecretariaCalendarTemplate.displayName = 'SecretariaCalendarTemplate';
