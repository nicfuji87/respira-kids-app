import React, { useState } from 'react';
import { Button } from '@/components/primitives/button';
import { ScrollArea } from '@/components/primitives/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/primitives/tooltip';

import { NavigationItem } from '@/components/composed/NavigationItem';
import { Separator } from '@/components/primitives/separator';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getNavigationForRole,
  type NavigationConfig,
  type UserRole,
} from '@/lib/navigation';

// AI dev note: DashboardSidebar combina NavigationItem components
// Sidebar desktop com navegação role-based e collapse

// AI dev note: Seções do menu (headings discretos, sem uppercase/tracking).
// Itens sem section caem em 'principal'.
type SidebarSection = NonNullable<NavigationConfig['section']>;

const SECTION_ORDER: SidebarSection[] = ['principal', 'gestao', 'sistema'];

const SECTION_LABELS: Record<SidebarSection, string> = {
  principal: 'Principal',
  gestao: 'Gestão',
  sistema: 'Sistema',
};

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

    // Agrupa por seção preservando a ordem do navigationConfig
    const sectionGroups = SECTION_ORDER.map((section) => ({
      section,
      items: navigationItems.filter(
        (item) => (item.section ?? 'principal') === section
      ),
    })).filter((group) => group.items.length > 0);

    // AI dev note: Headings só quando ao menos 2 grupos têm 2+ itens.
    // Admin (4/7/2) e secretaria (4/5/1) ficam agrupados; profissional (3/1/1)
    // renderiza lista plana — heading sobre item único é ruído visual.
    const showSections =
      sectionGroups.filter((group) => group.items.length >= 2).length >= 2;

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
            aria-label={
              internalCollapsed
                ? 'Expandir menu lateral'
                : 'Recolher menu lateral'
            }
          >
            {internalCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Navegação */}
        {/* AI dev note: Colapsada, cada item ganha Tooltip com o label (só ícone visível) */}
        <ScrollArea className="flex-1 px-3 py-4">
          <TooltipProvider delayDuration={200}>
            {(() => {
              const renderItem = (item: NavigationConfig) => {
                const navItem = (
                  <NavigationItem
                    icon={<item.icon className="h-4 w-4" />}
                    label={internalCollapsed ? '' : item.label}
                    isActive={currentPath === item.href}
                    onClick={() => onNavigate(item.href)}
                    badge={item.badge}
                    variant="desktop"
                    className={cn(internalCollapsed && 'justify-center px-2')}
                  />
                );

                if (!internalCollapsed) {
                  return (
                    <React.Fragment key={item.href}>{navItem}</React.Fragment>
                  );
                }

                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>
                      <span className="block">{navItem}</span>
                    </TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                );
              };

              // Lista plana (roles com poucos itens, ex.: profissional)
              if (!showSections) {
                return (
                  <div className="space-y-1">
                    {navigationItems.map(renderItem)}
                  </div>
                );
              }

              // Colapsada: headings viram Separator fino entre grupos
              if (internalCollapsed) {
                return (
                  <div className="space-y-1">
                    {sectionGroups.map((group, index) => (
                      <React.Fragment key={group.section}>
                        {index > 0 && <Separator className="my-2" />}
                        {group.items.map(renderItem)}
                      </React.Fragment>
                    ))}
                  </div>
                );
              }

              // Expandida: heading discreto por seção
              return (
                <div className="space-y-5">
                  {sectionGroups.map((group) => (
                    <div key={group.section}>
                      <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">
                        {SECTION_LABELS[group.section]}
                      </p>
                      <div className="space-y-1">
                        {group.items.map(renderItem)}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </TooltipProvider>
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
