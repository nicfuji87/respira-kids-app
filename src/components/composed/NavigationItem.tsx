import React from 'react';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import { cn } from '@/lib/utils';

// AI dev note: NavigationItem combina Button primitive com lógica de navegação
// Usado tanto no sidebar desktop quanto no bottom tabs mobile
// IMPORTANTE: Não usar href/anchor tags para evitar page reload - usar apenas onClick

export interface NavigationItemProps {
  icon: React.ReactNode;
  label: string;
  href?: string; // Mantido para compatibilidade mas não usado internamente
  isActive?: boolean;
  onClick?: () => void;
  badge?: string | number;
  variant?: 'desktop' | 'mobile';
  className?: string;
}

export const NavigationItem = React.memo<NavigationItemProps>(
  ({
    icon,
    label,
    href: _href, // eslint-disable-line @typescript-eslint/no-unused-vars
    isActive = false,
    onClick,
    badge,
    variant = 'desktop',
    className,
  }) => {
    const baseClasses = cn(
      'relative flex items-center gap-2 transition-colors',
      variant === 'desktop' && 'justify-start w-full h-10 px-3',
      variant === 'mobile' && 'flex-col gap-1 p-2 min-w-0',
      className
    );

    const textClasses = cn(
      variant === 'desktop' && 'text-sm font-medium',
      variant === 'mobile' && 'text-xs font-medium truncate',
      isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
    );

    const iconClasses = cn(
      'flex-shrink-0',
      variant === 'desktop' && 'w-4 h-4',
      variant === 'mobile' && 'w-5 h-5',
      isActive
        ? 'text-primary'
        : 'text-muted-foreground group-hover:text-foreground'
    );

    return (
      <Button
        variant={isActive ? 'secondary' : 'ghost'}
        size="sm"
        className={baseClasses}
        onClick={onClick}
      >
        <div className={iconClasses}>{icon}</div>
        <span className={textClasses}>{label}</span>
        {badge && (
          <Badge variant="secondary" className="ml-auto text-xs">
            {badge}
          </Badge>
        )}
      </Button>
    );
  }
);

NavigationItem.displayName = 'NavigationItem';
