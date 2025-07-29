import React from 'react';
import { MobileHeader } from '@/components/domain/dashboard/MobileHeader';
import { MobileBottomTabs } from '@/components/domain/dashboard/MobileBottomTabs';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/lib/navigation';

// AI dev note: MobileLayout combina MobileHeader e MobileBottomTabs
// Layout mobile com header fixo e bottom tabs

export interface MobileLayoutProps {
  // User info
  userName: string;
  userEmail: string;
  userRole: UserRole;
  userAvatar?: string;

  // Navigation
  currentPath: string;
  onNavigate: (path: string) => void;

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

export const MobileLayout = React.memo<MobileLayoutProps>(
  ({
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
  }) => {
    return (
      <div
        className={cn(
          'flex flex-col h-screen bg-background md:hidden',
          className
        )}
      >
        {/* Header */}
        <MobileHeader
          userName={userName}
          userEmail={userEmail}
          userRole={userRole}
          userAvatar={userAvatar}
          currentPath={currentPath}
          onNavigate={onNavigate}
          notificationCount={notificationCount}
          onNotificationClick={onNotificationClick}
          onProfileClick={onProfileClick}
          onSettingsClick={onSettingsClick}
          onLogout={onLogout}
        />

        {/* Content area */}
        <main className="flex-1 overflow-auto pt-16 pb-16">
          <div className="px-2 py-3">{children}</div>
        </main>

        {/* Bottom tabs */}
        <MobileBottomTabs
          userRole={userRole}
          currentPath={currentPath}
          onNavigate={onNavigate}
        />
      </div>
    );
  }
);

MobileLayout.displayName = 'MobileLayout';
