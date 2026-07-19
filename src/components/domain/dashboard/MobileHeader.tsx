import React from 'react';
import { Button } from '@/components/primitives/button';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/primitives/sheet';
import { UserProfileDropdown } from '@/components/composed/UserProfileDropdown';
import { NavigationItem } from '@/components/composed/NavigationItem';
import { Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getNavigationForRole, type UserRole } from '@/lib/navigation';

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
    onSettingsClick,
    onLogout,
    className,
  }) => {
    const navigationItems = getNavigationForRole(userRole);

    // AI dev note: Sheet controlado para fechar o drawer ao navegar
    const [menuOpen, setMenuOpen] = React.useState(false);

    return (
      <header
        className={cn(
          'fixed top-0 left-0 right-0 z-50 bg-background border-b',
          'h-16 px-4 md:hidden',
          className
        )}
      >
        <div className="flex items-center justify-between h-full">
          {/* Left side - Menu + Logo */}
          <div className="flex items-center space-x-3">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                {/* AI dev note: h-10 w-10 (40px) para touch target adequado em tablet */}
                <Button variant="ghost" size="sm" className="h-10 w-10 p-0">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <div className="flex flex-col h-full">
                  {/* Header do menu */}
                  <div className="flex items-center space-x-2 px-4 py-6 border-b">
                    <img
                      src="/images/logos/icone-respira-kids.png"
                      alt="Respira Kids"
                      className="h-8 w-8"
                    />
                    <span className="font-semibold text-lg">Respira Kids</span>
                  </div>

                  {/* Navegação */}
                  <div className="flex-1 px-2 py-4">
                    <div className="space-y-1">
                      {navigationItems.map((item) => (
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
                        />
                      ))}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="p-4 border-t">
                    <div className="text-xs text-muted-foreground">
                      Respira Kids v1.0
                    </div>
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            <div className="flex items-center space-x-2">
              <img
                src="/images/logos/icone-respira-kids.png"
                alt="Respira Kids"
                className="h-6 w-6"
              />
              <span className="font-semibold text-base">Respira Kids</span>
            </div>
          </div>

          {/* Right side - Profile */}
          <div className="flex items-center space-x-2">
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
