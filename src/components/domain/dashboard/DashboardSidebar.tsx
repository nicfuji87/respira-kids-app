import React, { useState } from 'react';
import { ScrollArea } from '@/components/primitives/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/primitives/tooltip';

import { NavigationItem } from '@/components/composed/NavigationItem';
import { Separator } from '@/components/primitives/separator';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
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

    const sidebarWidth = internalCollapsed ? 'w-[68px]' : 'w-60';

    return (
      <aside
        className={cn(
          'relative flex flex-col border-r bg-nav transition-[width] duration-200 ease-out',
          sidebarWidth,
          className
        )}
      >
        {/* Marca */}
        <div
          className={cn(
            'flex h-14 shrink-0 items-center gap-2.5',
            internalCollapsed ? 'justify-center px-2' : 'px-5'
          )}
        >
          <img
            src="/images/logos/icone-respira-kids.png"
            alt="Respira Kids"
            className="h-8 w-8 shrink-0"
          />
          {!internalCollapsed && (
            <span className="truncate text-[15px] font-bold tracking-tight text-roxo-titulo dark:text-foreground">
              Respira Kids
            </span>
          )}
        </div>

        {/* Navegação */}
        {/* AI dev note: Colapsada, cada item ganha Tooltip com o label (só ícone visível) */}
        <ScrollArea className="flex-1 px-3 pb-4 pt-2">
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
                  <div className="space-y-0.5">
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
                <div className="space-y-6">
                  {sectionGroups.map((group) => (
                    <div key={group.section}>
                      <p className="px-3 pb-1.5 text-xs font-medium text-muted-foreground/80">
                        {SECTION_LABELS[group.section]}
                      </p>
                      <div className="space-y-0.5">
                        {group.items.map(renderItem)}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </TooltipProvider>
        </ScrollArea>

        {/* Rodapé: recolher/expandir (antes ficava no topo, ao lado da marca,
            e o rodapé só mostrava "Respira Kids v1.0") */}
        <div className="shrink-0 border-t p-3">
          <button
            type="button"
            onClick={handleToggleCollapse}
            aria-label={
              internalCollapsed
                ? 'Expandir menu lateral'
                : 'Recolher menu lateral'
            }
            className={cn(
              'flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
              internalCollapsed && 'justify-center px-2'
            )}
          >
            {internalCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4" />
                <span>Recolher menu</span>
              </>
            )}
          </button>
        </div>
      </aside>
    );
  }
);

DashboardSidebar.displayName = 'DashboardSidebar';
