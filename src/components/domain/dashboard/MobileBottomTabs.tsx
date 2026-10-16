import React from 'react';
import { NavigationItem } from '@/components/composed/NavigationItem';
import { cn } from '@/lib/utils';
import { getMobileNavigationForRole, type UserRole } from '@/lib/navigation';

// AI dev note: MobileBottomTabs combina NavigationItem components
// Bottom tabs mobile com navegação role-based, altura 64px + área segura

export interface MobileBottomTabsProps {
  userRole: UserRole;
  currentPath: string;
  onNavigate: (path: string) => void;
  className?: string;
}

export const MobileBottomTabs = React.memo<MobileBottomTabsProps>(
  ({ userRole, currentPath, onNavigate, className }) => {
    const navigationItems = getMobileNavigationForRole(userRole);

    return (
      <nav
        aria-label="Navegação principal"
        className={cn(
          'fixed bottom-0 left-0 right-0 z-50 border-t bg-nav/95 backdrop-blur supports-[backdrop-filter]:bg-nav/85 pb-safe md:hidden',
          className
        )}
      >
        <div className="flex h-16 items-stretch justify-around px-1 py-1.5">
          {navigationItems.map((item) => (
            <NavigationItem
              key={item.href}
              icon={<item.icon className="h-5 w-5" />}
              label={item.label}
              isActive={currentPath === item.href}
              onClick={() => onNavigate(item.href)}
              badge={item.badge}
              variant="mobile"
              className="max-w-24 flex-1"
            />
          ))}
        </div>
      </nav>
    );
  }
);

MobileBottomTabs.displayName = 'MobileBottomTabs';
