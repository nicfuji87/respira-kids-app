import React from 'react';
import { DesktopLayout } from './DesktopLayout';
import { MobileLayout } from './MobileLayout';
import type { DesktopLayoutProps } from './DesktopLayout';

// AI dev note: ResponsiveLayout combina DesktopLayout e MobileLayout
// Layout responsivo que alterna entre desktop e mobile automaticamente

export interface ResponsiveLayoutProps {
  // User info
  userName: string;
  userEmail: string;
  userRole: DesktopLayoutProps['userRole'];
  userAvatar?: string;

  // Navigation
  currentPath: string;
  onNavigate: (path: string) => void;
  breadcrumbItems: DesktopLayoutProps['breadcrumbItems'];
  onBreadcrumbClick?: DesktopLayoutProps['onBreadcrumbClick'];

  // Notifications
  notificationCount?: number;
  onNotificationClick?: () => void;

  // Actions
  onProfileClick?: () => void;
  onSettingsClick?: () => void;
  onLogout?: () => void;

  // Layout
  children: React.ReactNode;
  className?: string;
}

export const ResponsiveLayout = React.memo<ResponsiveLayoutProps>(
  ({
    userName,
    userEmail,
    userRole,
    userAvatar,
    currentPath,
    onNavigate,
    breadcrumbItems,
    onBreadcrumbClick,
    notificationCount,
    onNotificationClick,
    onProfileClick,
    onSettingsClick,
    onLogout,
    children,
    className,
  }) => {
    const sharedProps = {
      userName,
      userEmail,
      userRole,
      userAvatar,
      currentPath,
      onNavigate,
      notificationCount,
      onNotificationClick,
      onProfileClick,
      onSettingsClick,
      onLogout,
      children,
      className,
    };

    return (
      <>
        {/* Desktop Layout */}
        <div className="hidden md:flex">
          <DesktopLayout
            {...sharedProps}
            breadcrumbItems={breadcrumbItems}
            onBreadcrumbClick={onBreadcrumbClick}
          />
        </div>

        {/* Mobile Layout */}
        <div className="md:hidden">
          <MobileLayout {...sharedProps} />
        </div>
      </>
    );
  }
);

ResponsiveLayout.displayName = 'ResponsiveLayout';
