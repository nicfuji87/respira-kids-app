import React, { useState } from 'react';
import { Button } from '@/components/primitives/button';
import { ScrollArea } from '@/components/primitives/scroll-area';

import { NavigationItem } from '@/components/composed/NavigationItem';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getNavigationForRole, type UserRole } from '@/lib/navigation';

// AI dev note: DashboardSidebar combina NavigationItem components
// Sidebar desktop com navegação role-based e collapse

export interface DashboardSidebarProps {
  userRole: UserRole;
  currentPath: string;
  onNavigate: (path: string) => void;
  isCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  className?: string;
}

export const DashboardSidebar = React.memo<DashboardSidebarProps>(
  ({
    userRole,
    currentPath,
    onNavigate,
    isCollapsed = false,
    onCollapsedChange,
    className,
  }) => {
    const [internalCollapsed, setInternalCollapsed] = useState(isCollapsed);
    const navigationItems = getNavigationForRole(userRole);

    const handleToggleCollapse = () => {
      const newCollapsed = !internalCollapsed;
      setInternalCollapsed(newCollapsed);
      onCollapsedChange?.(newCollapsed);
    };

    const sidebarWidth = internalCollapsed ? 'w-16' : 'w-60';

    return (
      <div
        className={cn(
          'relative flex flex-col bg-background border-r transition-all duration-300',
          sidebarWidth,
          className
        )}
      >
        {/* Header com toggle */}
        <div className="flex items-center justify-between h-16 px-4 border-b">
          {!internalCollapsed && (
            <div className="flex items-center space-x-2">
              <img
                src="/images/logos/icone-respira-kids.png"
                alt="Respira Kids"
                className="h-8 w-8"
              />
              <span className="font-semibold text-lg">Respira Kids</span>
            </div>
          )}

          {internalCollapsed && (
            <img
              src="/images/logos/icone-respira-kids.png"
              alt="Respira Kids"
              className="h-8 w-8 mx-auto"
            />
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleCollapse}
            className="h-8 w-8 p-0"
          >
            {internalCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Navegação */}
        <ScrollArea className="flex-1 px-3 py-4">
          <div className="space-y-1">
            {navigationItems.map((item) => (
              <NavigationItem
                key={item.href}
                icon={<item.icon className="h-4 w-4" />}
                label={internalCollapsed ? '' : item.label}
                isActive={currentPath === item.href}
                onClick={() => onNavigate(item.href)}
                badge={item.badge}
                variant="desktop"
                className={cn(internalCollapsed && 'justify-center px-2')}
              />
            ))}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="p-3 border-t">
          <div
            className={cn(
              'text-xs text-muted-foreground',
              internalCollapsed ? 'text-center' : 'text-left'
            )}
          >
            {internalCollapsed ? 'v1.0' : 'Respira Kids v1.0'}
          </div>
        </div>
      </div>
    );
  }
);

DashboardSidebar.displayName = 'DashboardSidebar';
