// AI dev note: Template de calendário integrado com dados reais do Supabase
// Combina CalendarTemplate com hooks de dados e integração completa

import React, { useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import { CalendarTemplate } from './CalendarTemplate';
import { AdminCalendarTemplate } from './AdminCalendarTemplate';
import { ProfissionalCalendarTemplate } from './ProfissionalCalendarTemplate';
import { SecretariaCalendarTemplate } from './SecretariaCalendarTemplate';
import { ResponsiveCalendarTemplate } from './ResponsiveCalendarTemplate';
import { Skeleton } from '@/components/primitives/skeleton';
import {
  Alert,
  AlertTitle,
  AlertDescription,
} from '@/components/primitives/alert';
import { Button } from '@/components/primitives/button';
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
        loading,
        error,
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

      // AI dev note: [P0] Skeleton do grid no carregamento inicial (ainda sem
      // eventos em memória). Em refreshes com dados já na tela, o calendário
      // continua visível para evitar flicker.
      if (loading && events.length === 0 && !error) {
        return (
          <div className={cn('calendar-with-data w-full space-y-4', className)}>
            <div className="flex items-center justify-between gap-4">
              <Skeleton className="h-9 w-56" />
              <Skeleton className="h-9 w-40" />
            </div>
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 7 }, (_, i) => (
                <Skeleton key={`dia-${i}`} className="h-5 w-full" />
              ))}
              {Array.from({ length: 35 }, (_, i) => (
                <Skeleton key={`celula-${i}`} className="h-20 w-full" />
              ))}
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
        // AI dev note: [P0] Refresh pós-salvar — propagado até CalendarTemplate,
        // que chama após criar/editar/mudar status de consulta.
        onRefreshNeeded: refreshEvents,
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

      // AI dev note: Mock user data for templates (using user.pessoa directly)
      // Captura em const para o narrowing valer dentro de renderTemplate()
      const pessoa = user.pessoa;
      const userRole = pessoa.role as 'admin' | 'profissional' | 'secretaria';

      const mockUserData = {
        id: user.pessoa.id,
        name: user.pessoa.nome || 'Usuário',
        email: user.email || '',
        role: userRole,
        isApproved: user.pessoa.is_approved,
        profileComplete: user.pessoa.profile_complete,
        podeAtender: user.pessoa.pode_atender === true, // AI dev note: Comparação estrita
      };

      // AI dev note: [P0] Banner de erro com botão de retry — antes o `error`
      // do hook era ignorado e o usuário via apenas um grid vazio sem aviso.
      const errorBanner = error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Erro ao carregar a agenda</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={refreshEvents}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : null;

      // AI dev note: Renderização responsiva baseada no role
      // (embrulhada em função para o errorBanner aparecer acima de qualquer template)
      const renderTemplate = () => {
        if (responsive) {
          const userForResponsive =
            userRole === 'admin'
              ? {
                  ...mockUserData,
                  role: 'admin' as const,
                  podeAtender: pessoa.pode_atender === true,
                }
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
            return (
              <AdminCalendarTemplate
                {...commonTemplateProps}
                currentUser={{
                  ...mockUserData,
                  role: 'admin' as const,
                  podeAtender: pessoa.pode_atender === true,
                }}
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
                  .filter((p) =>
                    permissions.allowedProfessionals.includes(p.id)
                  )}
                showSharedSchedulesTab={true}
              />
            );

          default:
            // Fallback para template base
            return <CalendarTemplate {...commonTemplateProps} />;
        }
      };

      return (
        <>
          {errorBanner}
          {renderTemplate()}
        </>
      );
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
