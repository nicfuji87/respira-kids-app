import React from 'react';
import { Button } from '@/components/primitives/button';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/primitives/sheet';
import { UserProfileDropdown } from '@/components/composed/UserProfileDropdown';
import { NavigationItem } from '@/components/composed/NavigationItem';
import { Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getNavigationForRole,
  type NavigationConfig,
  type UserRole,
} from '@/lib/navigation';

type MenuSection = NonNullable<NavigationConfig['section']>;
const SECTION_ORDER: MenuSection[] = ['principal', 'gestao', 'sistema'];
const SECTION_LABELS: Record<MenuSection, string> = {
  principal: 'Principal',
  gestao: 'Gestão',
  sistema: 'Sistema',
};

// AI dev note: MobileHeader combina Sheet e UserProfileDropdown
// Header mobile com hamburger menu e navegação lateral

export interface MobileHeaderProps {
  // User info
  userName: string;
  userEmail: string;
  userRole: UserRole;
  userAvatar?: string;

  // Navigation
  currentPath: string;
  onNavigate: (path: string) => void;
  /** Título da página atual (mesmo rótulo do topo no desktop) */
  pageTitle?: string;

  // Actions
  onSettingsClick?: () => void;
  onLogout?: () => void;

  className?: string;
}

export const MobileHeader = React.memo<MobileHeaderProps>(
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
    className,
  }) => {
    const navigationItems = getNavigationForRole(userRole);

    // AI dev note: Sheet controlado para fechar o drawer ao navegar
    const [menuOpen, setMenuOpen] = React.useState(false);

    // Agrupa o menu nas mesmas seções do sidebar desktop
    const sections = SECTION_ORDER.map((section) => ({
      section,
      items: navigationItems.filter(
        (item) => (item.section ?? 'principal') === section
      ),
    })).filter((group) => group.items.length > 0);
    const showSections =
      sections.filter((group) => group.items.length >= 2).length >= 2;

    const renderItem = (item: (typeof navigationItems)[number]) => (
      <NavigationItem
        key={item.href}
        icon={<item.icon className="h-4 w-4" />}
        label={item.label}
        isActive={currentPath === item.href}
        onClick={() => {
          setMenuOpen(false);
          onNavigate(item.href);
        }}
        badge={item.badge}
        variant="desktop"
        className="h-11"
      />
    );

    return (
      <header
        className={cn(
          'fixed left-0 right-0 top-0 z-50 h-14 border-b bg-nav/95 px-2 backdrop-blur supports-[backdrop-filter]:bg-nav/85 md:hidden',
          className
        )}
      >
        <div className="flex h-full items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                {/* AI dev note: h-10 w-10 (40px) para touch target adequado em tablet */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10"
                  aria-label="Abrir menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="flex w-72 flex-col gap-0 bg-nav p-0"
              >
                <SheetTitle className="sr-only">Menu</SheetTitle>
                <div className="flex h-14 shrink-0 items-center gap-2.5 border-b px-5">
                  <img
                    src="/images/logos/icone-respira-kids.png"
                    alt=""
                    className="h-8 w-8"
                  />
                  <span className="text-[15px] font-bold tracking-tight text-roxo-titulo dark:text-foreground">
                    Respira Kids
                  </span>
                </div>

                <nav className="flex-1 overflow-y-auto px-3 py-4">
                  {showSections ? (
                    <div className="space-y-6">
                      {sections.map((group) => (
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
                  ) : (
                    <div className="space-y-0.5">
                      {navigationItems.map(renderItem)}
                    </div>
                  )}
                </nav>
              </SheetContent>
            </Sheet>

            <img
              src="/images/logos/icone-respira-kids.png"
              alt="Respira Kids"
              className="h-7 w-7 shrink-0"
            />
            <span className="truncate text-base font-semibold tracking-tight text-roxo-titulo dark:text-foreground">
              {pageTitle || 'Respira Kids'}
            </span>
          </div>

          <div className="flex shrink-0 items-center">
            <UserProfileDropdown
              name={userName}
              email={userEmail}
              role={userRole}
              avatar={userAvatar}
              onSettingsClick={onSettingsClick}
              onLogout={onLogout}
            />
          </div>
        </div>
      </header>
    );
  }
);

MobileHeader.displayName = 'MobileHeader';
