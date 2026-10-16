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
  pageTitle?: string;

  // Actions
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
    pageTitle,
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
          pageTitle={pageTitle}
          onSettingsClick={onSettingsClick}
          onLogout={onLogout}
        />

        {/* Content area - AI dev note: Padding otimizado para mobile */}
        <main className="flex-1 overflow-auto pt-14 pb-[calc(4rem+env(safe-area-inset-bottom))]">
          <div className="px-3 py-4 sm:px-4">{children}</div>
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
