// AI dev note: Template de calendário integrado com dados reais do Supabase
// Combina CalendarTemplate com hooks de dados e integração completa

import React, { useCallback } from 'react';
import { CalendarTemplate } from './CalendarTemplate';
import { AdminCalendarTemplate } from './AdminCalendarTemplate';
import { ProfissionalCalendarTemplate } from './ProfissionalCalendarTemplate';
import { SecretariaCalendarTemplate } from './SecretariaCalendarTemplate';
import { ResponsiveCalendarTemplate } from './ResponsiveCalendarTemplate';
import type { CalendarView, CalendarEvent } from '@/types/calendar';
import {
  useCalendarData,
  useCalendarPermissions,
  useCalendarEvents,
  useCalendarFormData,
} from '@/hooks/useCalendarData';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

// AI dev note: Interface para template integrado com dados reais
export interface CalendarTemplateWithDataProps {
  initialView?: CalendarView;
  initialDate?: Date;
  className?: string;
  responsive?: boolean;
  onEventClick?: (event: CalendarEvent) => void;
  onEventSave?: (event: CalendarEvent) => void;
  onEventDelete?: (eventId: string) => void;
  onPatientClick?: (patientId: string | null) => void;
  onProfessionalClick?: (professionalId: string) => void;
}

export const CalendarTemplateWithData =
  React.memo<CalendarTemplateWithDataProps>(
    ({
      initialView = 'month',
      initialDate = new Date(), // AI dev note: Sempre abre na data atual
      className,
      responsive = true,
      onEventClick,
      onEventSave,
      onEventDelete,
      onPatientClick,
      onProfessionalClick,
    }) => {
      const { user } = useAuth();

      // Hooks para dados do calendário - todos sempre chamados
      const {
        currentView,
        currentDate,
        events,
        setCurrentDate,
        setCurrentView,
        refresh: refreshEvents,
      } = useCalendarData(initialView, initialDate);

      const { permissions } = useCalendarPermissions();
      const { createEvent, updateEvent, deleteEvent } = useCalendarEvents();
      const { formData } = useCalendarFormData();

      // AI dev note: Handlers para eventos do calendário - sempre declarados
      const handleEventSave = useCallback(
        async (event: Omit<CalendarEvent, 'id'> & { id?: string }) => {
          try {
            let savedEvent: CalendarEvent | null = null;

            if (event.id) {
              // Atualizar evento existente
              savedEvent = await updateEvent(event as CalendarEvent);
            } else {
              // Criar novo evento
              savedEvent = await createEvent(event);
            }

            if (savedEvent) {
              // Refresh dos eventos para refletir mudanças
              await refreshEvents();

              // Callback externo se fornecido
              onEventSave?.(savedEvent);
            }
          } catch (error) {
            console.error('Erro ao salvar evento:', error);
          }
        },
        [createEvent, updateEvent, refreshEvents, onEventSave]
      );

      const handleEventEdit = useCallback(() => {
        // Event editing logic can be implemented here
      }, []);

      const handleEventDelete = useCallback(
        async (eventId: string) => {
          try {
            const success = await deleteEvent(eventId);

            if (success) {
              await refreshEvents();
              onEventDelete?.(eventId);
            }
          } catch (error) {
            console.error('Erro ao deletar evento:', error);
          }
        },
        [deleteEvent, refreshEvents, onEventDelete]
      );

      const handleEventClick = useCallback(
        (event: CalendarEvent) => {
          onEventClick?.(event);
        },
        [onEventClick]
      );

      // AI dev note: Check if user data is available
      if (!user?.pessoa?.id) {
        return (
          <div className="flex items-center justify-center min-h-96">
            <div className="text-muted-foreground">
              Carregando informações do usuário...
            </div>
          </div>
        );
      }

      // AI dev note: Props comuns para todos os templates
      const commonTemplateProps = {
        events,
        onEventSave: handleEventSave,
        onEventEdit: handleEventEdit,
        onEventDelete: handleEventDelete,
        onEventClick: handleEventClick,
        onPatientClick,
        onProfessionalClick,
        initialView: currentView,
        initialDate: currentDate,
        // AI dev note: Forçar uso do estado do useCalendarData ao invés de estado local
        externalCurrentDate: currentDate,
        externalCurrentView: currentView,
        onExternalDateChange: setCurrentDate,
        onExternalViewChange: setCurrentView,
        className: cn('calendar-with-data', className),
        canCreateEvents: permissions.canCreateEvents,
        canEditEvents: permissions.canEditEvents,
        canDeleteEvents: permissions.canDeleteEvents,
        showEventManager: true,
      };

      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 DEBUG: CalendarTemplateWithData - COMMON PROPS', {
          currentDate: currentDate?.toISOString(),
          currentView: currentView,
          externalCurrentDate:
            commonTemplateProps.externalCurrentDate?.toISOString(),
          externalCurrentView: commonTemplateProps.externalCurrentView,
          'setCurrentDate existe': !!setCurrentDate,
          'setCurrentView existe': !!setCurrentView,
          'onExternalDateChange existe':
            !!commonTemplateProps.onExternalDateChange,
          'onExternalViewChange existe':
            !!commonTemplateProps.onExternalViewChange,
          userRole: user.pessoa.role,
        });
      }

      // AI dev note: Mock user data for templates (using user.pessoa directly)
      const userRole = user.pessoa.role as
        | 'admin'
        | 'profissional'
        | 'secretaria';

      const mockUserData = {
        id: user.pessoa.id,
        name: user.pessoa.nome || 'Usuário',
        email: user.email || '',
        role: userRole,
        isApproved: user.pessoa.is_approved,
        profileComplete: user.pessoa.profile_complete,
      };

      // AI dev note: Renderização responsiva baseada no role
      if (responsive) {
        if (process.env.NODE_ENV === 'development') {
          console.log(
            '🚨 DEBUG: CalendarTemplateWithData - USANDO MODO RESPONSIVO',
            {
              responsive,
              userRole,
              'vai renderizar': 'ResponsiveCalendarTemplate',
            }
          );
        }
        const userForResponsive =
          userRole === 'admin'
            ? { ...mockUserData, role: 'admin' as const }
            : userRole === 'profissional'
              ? {
                  ...mockUserData,
                  role: 'profissional' as const,
                  specialization: 'Fisioterapeuta',
                  registrationNumber: '',
                }
              : {
                  ...mockUserData,
                  role: 'secretaria' as const,
                  authorizedProfessionals: permissions.allowedProfessionals,
                };

        return (
          <ResponsiveCalendarTemplate
            {...commonTemplateProps}
            currentUser={userForResponsive}
            availableProfessionals={formData.profissionais.map((p) => ({
              id: p.id,
              name: p.nome,
              specialization: p.especialidade || undefined,
            }))}
            canManageAllEvents={permissions.canViewAllEvents}
          />
        );
      }

      // AI dev note: Renderização específica por role (não responsivo)
      switch (userRole) {
        case 'admin':
          if (process.env.NODE_ENV === 'development') {
            console.log(
              '🔍 DEBUG: CalendarTemplateWithData - PASSANDO PARA AdminCalendarTemplate',
              {
                'commonTemplateProps tem externalCurrentDate':
                  !!commonTemplateProps.externalCurrentDate,
                'externalCurrentDate valor':
                  commonTemplateProps.externalCurrentDate?.toISOString(),
                'todas as props': Object.keys(commonTemplateProps),
              }
            );
          }
          return (
            <AdminCalendarTemplate
              {...commonTemplateProps}
              currentUser={{ ...mockUserData, role: 'admin' as const }}
              showAllProfessionals={true}
              showSystemEvents={true}
            />
          );

        case 'profissional':
          return (
            <ProfissionalCalendarTemplate
              {...commonTemplateProps}
              currentUser={{
                ...mockUserData,
                role: 'profissional' as const,
                specialization: 'Fisioterapeuta',
                registrationNumber: '',
              }}
              showOnlyMyEvents={true}
            />
          );

        case 'secretaria':
          return (
            <SecretariaCalendarTemplate
              {...commonTemplateProps}
              currentUser={{
                ...mockUserData,
                role: 'secretaria' as const,
                authorizedProfessionals: permissions.allowedProfessionals,
              }}
              availableProfessionals={formData.profissionais
                .map((p) => ({
                  id: p.id,
                  name: p.nome,
                  specialization: p.especialidade || undefined,
                }))
                .filter((p) => permissions.allowedProfessionals.includes(p.id))}
            />
          );

        default:
          // Fallback para template base
          return <CalendarTemplate {...commonTemplateProps} />;
      }
    }
  );

CalendarTemplateWithData.displayName = 'CalendarTemplateWithData';

// AI dev note: Template simples para casos onde não se quer responsividade automática
export interface SimpleCalendarTemplateProps
  extends CalendarTemplateWithDataProps {
  userRole?: 'admin' | 'profissional' | 'secretaria';
  forceView?: boolean;
}

export const SimpleCalendarTemplate = React.memo<SimpleCalendarTemplateProps>(
  ({ forceView = false, ...props }) => {
    return <CalendarTemplateWithData {...props} responsive={!forceView} />;
  }
);

SimpleCalendarTemplate.displayName = 'SimpleCalendarTemplate';

// AI dev note: Export para facilitar importação
export { CalendarTemplateWithData as default };
