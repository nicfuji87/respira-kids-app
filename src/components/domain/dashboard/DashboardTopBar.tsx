import React from 'react';
import { Button } from '@/components/primitives/button';
import { type BreadcrumbItem } from '@/components/composed/BreadcrumbNav';
import { UserProfileDropdown } from '@/components/composed/UserProfileDropdown';
import { Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/lib/navigation';

// AI dev note: DashboardTopBar combina BreadcrumbNav e UserProfileDropdown
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

  // Mobile menu
  onMobileMenuClick?: () => void;
  showMobileMenu?: boolean;

  // Actions
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
    onMobileMenuClick,
    showMobileMenu = false,
    onSettingsClick,
    onLogout,
    className,
  }) => {
    // AI dev note: o "breadcrumb" sempre tem 1 item (a página atual — ver
    // useNavigation), então vira o título da página. Antes era um botão que
    // navegava para a própria página, e cada página repetia o mesmo nome num h1.
    const current = breadcrumbItems[breadcrumbItems.length - 1];

    return (
      <header
        className={cn(
          'flex h-14 shrink-0 items-center justify-between gap-4 border-b bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:px-6 lg:px-8',
          className
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          {showMobileMenu && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onMobileMenuClick}
              className="md:hidden"
              aria-label="Abrir menu"
            >
              <Menu className="h-4 w-4" />
            </Button>
          )}

          {current && (
            <h1 className="flex min-w-0 items-center gap-2.5 text-lg font-semibold tracking-tight text-roxo-titulo dark:text-foreground">
              {current.icon && (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary [&_svg]:h-4 [&_svg]:w-4">
                  {current.icon}
                </span>
              )}
              <span className="truncate">{current.label}</span>
            </h1>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <UserProfileDropdown
            name={userName}
            email={userEmail}
            role={userRole}
            avatar={userAvatar}
            onSettingsClick={onSettingsClick}
            onLogout={onLogout}
          />
        </div>
      </header>
    );
  }
);

DashboardTopBar.displayName = 'DashboardTopBar';
