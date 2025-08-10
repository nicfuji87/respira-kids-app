import React, { useState } from 'react';
import { DashboardSidebar } from '@/components/domain/dashboard/DashboardSidebar';
import { DashboardTopBar } from '@/components/domain/dashboard/DashboardTopBar';
import { cn } from '@/lib/utils';
import type { DashboardTopBarProps } from '@/components/domain';
import type { UserRole } from '@/lib/navigation';

// AI dev note: DesktopLayout combina DashboardSidebar e DashboardTopBar
// Layout desktop com sidebar colapsável e header fixo

export interface DesktopLayoutProps {
  // User info
  userName: string;
  userEmail: string;
  userRole: UserRole;
  userAvatar?: string;

  // Navigation
  currentPath: string;
  onNavigate: (path: string) => void;
  breadcrumbItems: DashboardTopBarProps['breadcrumbItems'];
  onBreadcrumbClick?: DashboardTopBarProps['onBreadcrumbClick'];

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

export const DesktopLayout = React.memo<DesktopLayoutProps>(
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
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    return (
      <div className={cn('flex h-screen bg-background', className)}>
        {/* Sidebar */}
        <DashboardSidebar
          userRole={userRole}
          currentPath={currentPath}
          onNavigate={onNavigate}
          isCollapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
          className="hidden md:flex"
        />

        {/* Main content */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Top bar */}
          <DashboardTopBar
            userName={userName}
            userEmail={userEmail}
            userRole={userRole}
            userAvatar={userAvatar}
            breadcrumbItems={breadcrumbItems}
            onBreadcrumbClick={onBreadcrumbClick}
            notificationCount={notificationCount}
            onNotificationClick={onNotificationClick}
            onProfileClick={onProfileClick}
            onSettingsClick={onSettingsClick}
            onLogout={onLogout}
            className="hidden md:flex"
          />

          {/* Content area */}
          <main className="flex-1 overflow-auto">
            <div className="container mx-auto px-4 py-6">
              {children}
            </div>
          </main>
        </div>
      </div>
    );
  }
);

DesktopLayout.displayName = 'DesktopLayout';
