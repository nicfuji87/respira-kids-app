import React, { useState, useEffect, useMemo } from 'react';
import { AdminCalendarTemplate } from './AdminCalendarTemplate';
import { ProfissionalCalendarTemplate } from './ProfissionalCalendarTemplate';
import { SecretariaCalendarTemplate } from './SecretariaCalendarTemplate';
import { CalendarTemplate } from './CalendarTemplate';
import { cn } from '@/lib/utils';
import type { CalendarEvent, CalendarView } from '@/types/calendar';
import type { AdminUser } from './AdminCalendarTemplate';
import type { ProfissionalUser } from './ProfissionalCalendarTemplate';
import type { SecretariaUser } from './SecretariaCalendarTemplate';

// AI dev note: ResponsiveCalendarTemplate combina templates por role
// Template responsivo que adapta layouts mobile/desktop e integra com sistema de roles

export type ResponsiveCalendarUser =
  | AdminUser
  | ProfissionalUser
  | SecretariaUser;

export interface ResponsiveCalendarTemplateProps {
  // User info
  currentUser: ResponsiveCalendarUser;

  // Events data
  events: CalendarEvent[];
  onEventSave: (event: Omit<CalendarEvent, 'id'> & { id?: string }) => void;
  onEventEdit?: (event: CalendarEvent) => void;
  onEventDelete: (eventId: string) => void;

  // View configuration
  initialView?: CalendarView;
  initialDate?: Date;

  // Layout
  className?: string;

  // Responsive features
  breakpoint?: 'sm' | 'md' | 'lg';
  mobileView?: CalendarView;
  desktopView?: CalendarView;

  // Role-specific props
  availableProfessionals?: {
    id: string;
    name: string;
    specialization?: string;
  }[];
  showPatientNames?: boolean;
  canManageAllEvents?: boolean;

  // Navigation handlers
  onPatientClick?: (patientId: string | null) => void;
  onProfessionalClick?: (professionalId: string) => void;
}

export const ResponsiveCalendarTemplate =
  React.memo<ResponsiveCalendarTemplateProps>(
    ({
      currentUser,
      events,
      onEventSave,
      onEventEdit,
      onEventDelete,
      initialView,
      initialDate = new Date(),
      className,
      breakpoint = 'md',
      mobileView = 'day',
      desktopView = 'week',
      availableProfessionals = [],
      showPatientNames = true,
      canManageAllEvents = false,
      onPatientClick,
      onProfessionalClick,
    }) => {
      // AI dev note: Mark unused parameters as intentionally ignored for future use
      void showPatientNames;
      void canManageAllEvents;

      // State for responsive behavior
      const [isMobile, setIsMobile] = useState(false);

      // Responsive breakpoints using useMemo
      const breakpoints = useMemo(
        () => ({
          sm: 640,
          md: 768,
          lg: 1024,
        }),
        []
      );

      // Check if screen is mobile
      useEffect(() => {
        const checkMobile = () => {
          const width = window.innerWidth;
          setIsMobile(width < breakpoints[breakpoint]);
        };

        checkMobile();
        window.addEventListener('resize', checkMobile);

        return () => window.removeEventListener('resize', checkMobile);
      }, [breakpoint, breakpoints]);

      // Get appropriate initial view for role and device
      const getInitialViewForRole = () => {
        if (initialView) return initialView;

        if (isMobile) {
          // Mobile optimized views by role
          switch (currentUser.role) {
            case 'admin':
              return 'agenda';
            case 'profissional':
              return 'day';
            case 'secretaria':
              return 'day';
            default:
              return mobileView;
          }
        } else {
          // Desktop optimized views by role
          switch (currentUser.role) {
            case 'admin':
              return 'month';
            case 'profissional':
              return 'day';
            case 'secretaria':
              return 'week';
            default:
              return desktopView;
          }
        }
      };

      // Common responsive classes
      const getResponsiveClasses = () => {
        return cn(
          'responsive-calendar-template',
          'w-full h-full',
          {
            'mobile-layout': isMobile,
            'desktop-layout': !isMobile,
            'min-h-[400px]': isMobile,
            'min-h-[600px]': !isMobile,
          },
          className
        );
      };

      // Render appropriate template based on role
      const renderRoleTemplate = () => {
        const baseProps = {
          events,
          onEventSave,
          onEventEdit,
          onEventDelete,
          initialView: getInitialViewForRole(),
          initialDate,
          className: isMobile ? 'mobile-calendar' : 'desktop-calendar',
          onPatientClick,
          onProfessionalClick,
        };

        switch (currentUser.role) {
          case 'admin':
            return (
              <AdminCalendarTemplate
                {...baseProps}
                currentUser={currentUser as AdminUser}
              />
            );

          case 'profissional':
            return (
              <ProfissionalCalendarTemplate
                {...baseProps}
                currentUser={currentUser as ProfissionalUser}
                showOnlyMyEvents={true}
              />
            );

          case 'secretaria':
            return (
              <SecretariaCalendarTemplate
                {...baseProps}
                currentUser={currentUser as SecretariaUser}
                availableProfessionals={availableProfessionals}
              />
            );

          default:
            return (
              <CalendarTemplate
                {...baseProps}
                canCreateEvents={false}
                canEditEvents={false}
              />
            );
        }
      };

      return (
        <div className={getResponsiveClasses()}>
          {/* Responsive info banner */}
          {process.env.NODE_ENV === 'development' && (
            <div className="fixed top-4 right-4 bg-black/80 text-white px-2 py-1 rounded text-xs z-50">
              {isMobile ? 'Mobile' : 'Desktop'} • {currentUser.role} •{' '}
              {getInitialViewForRole()}
            </div>
          )}

          {/* Main template */}
          {renderRoleTemplate()}

          {/* Mobile swipe hints */}
          {isMobile && (
            <div className="swipe-hint text-muted-foreground">
              Deslize para navegar • Toque para detalhes
            </div>
          )}
        </div>
      );
    }
  );

ResponsiveCalendarTemplate.displayName = 'ResponsiveCalendarTemplate';
