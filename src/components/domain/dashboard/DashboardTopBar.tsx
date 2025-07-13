import React from 'react';
import { Button } from '@/components/primitives/button';
import {
  BreadcrumbNav,
  type BreadcrumbItem,
} from '@/components/composed/BreadcrumbNav';
import { UserProfileDropdown } from '@/components/composed/UserProfileDropdown';
import { NotificationBadge } from '@/components/composed/NotificationBadge';
import { Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/lib/navigation';

// AI dev note: DashboardTopBar combina BreadcrumbNav, UserProfileDropdown e NotificationBadge
// Header responsivo para desktop com navegação breadcrumb

export interface DashboardTopBarProps {
  // User info
  userName: string;
  userEmail: string;
  userRole: UserRole;
  userAvatar?: string;

  // Navigation
  breadcrumbItems: BreadcrumbItem[];
  onBreadcrumbClick?: (item: BreadcrumbItem, index: number) => void;

  // Notifications
  notificationCount?: number;
  onNotificationClick?: () => void;

  // Mobile menu
  onMobileMenuClick?: () => void;
  showMobileMenu?: boolean;

  // Actions
  onProfileClick?: () => void;
  onSettingsClick?: () => void;
  onLogout?: () => void;

  className?: string;
}

export const DashboardTopBar = React.memo<DashboardTopBarProps>(
  ({
    userName,
    userEmail,
    userRole,
    userAvatar,
    breadcrumbItems,
    onBreadcrumbClick,
    notificationCount,
    onNotificationClick,
    onMobileMenuClick,
    showMobileMenu = false,
    onProfileClick,
    onSettingsClick,
    onLogout,
    className,
  }) => {
    return (
      <header
        className={cn(
          'flex items-center justify-between h-16 px-4 bg-background border-b',
          className
        )}
      >
        {/* Left side - Mobile menu + Breadcrumb */}
        <div className="flex items-center space-x-4">
          {showMobileMenu && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onMobileMenuClick}
              className="h-8 w-8 p-0 md:hidden"
            >
              <Menu className="h-4 w-4" />
            </Button>
          )}

          <BreadcrumbNav
            items={breadcrumbItems}
            onItemClick={onBreadcrumbClick}
            className="hidden md:flex"
          />

          {/* Mobile: show only current page */}
          {breadcrumbItems.length > 0 && (
            <h1 className="text-lg font-semibold md:hidden">
              {breadcrumbItems[breadcrumbItems.length - 1].label}
            </h1>
          )}
        </div>

        {/* Right side - Notifications + Profile */}
        <div className="flex items-center space-x-2">
          <NotificationBadge
            count={notificationCount}
            onClick={onNotificationClick}
          />

          <UserProfileDropdown
            name={userName}
            email={userEmail}
            role={userRole}
            avatar={userAvatar}
            onProfileClick={onProfileClick}
            onSettingsClick={onSettingsClick}
            onLogout={onLogout}
          />
        </div>
      </header>
    );
  }
);

DashboardTopBar.displayName = 'DashboardTopBar';
