import React from 'react';
import { NavigationItem } from '@/components/composed/NavigationItem';
import { cn } from '@/lib/utils';
import { getMobileNavigationForRole, type UserRole } from '@/lib/navigation';

// AI dev note: MobileBottomTabs combina NavigationItem components
// Bottom tabs mobile com navegação role-based, altura fixa 60px

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
      <div
        className={cn(
          'fixed bottom-0 left-0 right-0 z-50 bg-background border-t',
          'h-16 px-2 md:hidden',
          className
        )}
      >
        <div className="flex items-center justify-around h-full">
          {navigationItems.map((item) => (
            <NavigationItem
              key={item.href}
              icon={<item.icon className="h-5 w-5" />}
              label={item.label}
              isActive={currentPath === item.href}
              onClick={() => onNavigate(item.href)}
              badge={item.badge}
              variant="mobile"
              className="flex-1 max-w-20"
            />
          ))}
        </div>
      </div>
    );
  }
);

MobileBottomTabs.displayName = 'MobileBottomTabs';
