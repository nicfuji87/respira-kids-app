import React from 'react';
import { DesktopLayout } from './DesktopLayout';
import { MobileLayout } from './MobileLayout';
import type { DesktopLayoutProps } from './DesktopLayout';

// AI dev note: ResponsiveLayout combina DesktopLayout e MobileLayout
// Layout responsivo que alterna entre desktop e mobile automaticamente
// AI dev note: CRÍTICO - montar APENAS o layout ativo (não usar só `hidden`/`md:hidden`).
// Antes, ambos os layouts eram montados simultaneamente, duplicando `children`
// (e os <input> de busca/estados/efeitos). Inputs controlados duplicados quebravam
// a digitação em mobile/tablet. O breakpoint JS deve espelhar o `md` do Tailwind (768px).

export interface ResponsiveLayoutProps {
  // User info
  userName: string;
  userEmail: string;
  userRole: DesktopLayoutProps['userRole'];
  userAvatar?: string;

  // Navigation
  currentPath: string;
  onNavigate: (path: string) => void;
  breadcrumbItems: DesktopLayoutProps['breadcrumbItems'];
  onBreadcrumbClick?: DesktopLayoutProps['onBreadcrumbClick'];

  // Actions
  onSettingsClick?: () => void;
  onLogout?: () => void;

  // Layout
  children: React.ReactNode;
  className?: string;
}

export const ResponsiveLayout = React.memo<ResponsiveLayoutProps>(
  ({
    userName,
    userEmail,
    userRole,
    userAvatar,
    currentPath,
    onNavigate,
    breadcrumbItems,
    onBreadcrumbClick,
    onSettingsClick,
    onLogout,
    children,
    className,
  }) => {
    const sharedProps = {
      userName,
      userEmail,
      userRole,
      userAvatar,
      currentPath,
      onNavigate,
      onSettingsClick,
      onLogout,
      children,
      className,
    };

    // AI dev note: detecta o breakpoint `md` (>=768px) via matchMedia para montar
    // somente um layout por vez. Mantém o mesmo limite visual de antes; apenas evita
    // a montagem dupla de `children`.
    const MD_QUERY = '(min-width: 768px)';
    const [isDesktop, setIsDesktop] = React.useState<boolean>(() =>
      typeof window !== 'undefined' ? window.matchMedia(MD_QUERY).matches : true
    );

    React.useEffect(() => {
      const mql = window.matchMedia(MD_QUERY);
      const handleChange = (event: MediaQueryListEvent) =>
        setIsDesktop(event.matches);
      setIsDesktop(mql.matches);
      mql.addEventListener('change', handleChange);
      return () => mql.removeEventListener('change', handleChange);
    }, []);

    return (
      <>
        {/* Desktop Layout */}
        <div className="hidden md:flex">
          {isDesktop && (
            <DesktopLayout
              {...sharedProps}
              breadcrumbItems={breadcrumbItems}
              onBreadcrumbClick={onBreadcrumbClick}
            />
          )}
        </div>

        {/* Mobile Layout */}
        <div className="md:hidden">
          {!isDesktop && <MobileLayout {...sharedProps} />}
        </div>
      </>
    );
  }
);

ResponsiveLayout.displayName = 'ResponsiveLayout';
