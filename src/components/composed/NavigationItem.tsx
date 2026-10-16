import React from 'react';
import { Badge } from '@/components/primitives/badge';
import { cn } from '@/lib/utils';

// AI dev note: NavigationItem — item de navegação (sidebar e bottom tabs)
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
    // AI dev note: item ativo usa fundo teal suave + texto roxo (WCAG AA);
    // teal nunca como cor de texto sobre fundo claro (contraste 1.66:1).
    // Desktop: linha inteira destacada. Mobile (bottom tabs): pílula atrás do
    // ícone, padrão Material 3 — a linha inteira colorida pesava na barra.
    // Touch target da variante mobile = altura do bottom bar (>= 44px).
    if (variant === 'mobile') {
      return (
        <button
          type="button"
          onClick={onClick}
          aria-current={isActive ? 'page' : undefined}
          className={cn(
            'group relative flex h-full min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
            className
          )}
        >
          <span
            className={cn(
              'flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-200 [&_svg]:h-5 [&_svg]:w-5',
              isActive
                ? 'bg-primary/25 text-roxo-titulo dark:text-foreground'
                : 'text-muted-foreground group-active:bg-muted'
            )}
          >
            {icon}
          </span>
          <span
            className={cn(
              'max-w-full truncate text-[11px] leading-none',
              isActive
                ? 'font-semibold text-roxo-titulo dark:text-foreground'
                : 'font-medium text-muted-foreground'
            )}
          >
            {label}
          </span>
          {badge && (
            <Badge
              variant="secondary"
              className="absolute right-1 top-1 px-1.5 text-[10px]"
            >
              {badge}
            </Badge>
          )}
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={onClick}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'group relative flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-sm outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring',
          isActive
            ? 'bg-primary/15 font-semibold text-roxo-titulo dark:text-foreground'
            : 'font-medium text-muted-foreground hover:bg-muted hover:text-foreground',
          className
        )}
      >
        <span
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center [&_svg]:h-4 [&_svg]:w-4',
            isActive
              ? 'text-primary'
              : 'text-muted-foreground group-hover:text-foreground'
          )}
        >
          {icon}
        </span>
        {label && <span className="truncate">{label}</span>}
        {badge && (
          <Badge variant="secondary" className="ml-auto text-xs">
            {badge}
          </Badge>
        )}
      </button>
    );
  }
);

NavigationItem.displayName = 'NavigationItem';
