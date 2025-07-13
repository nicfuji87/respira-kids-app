import React from 'react';
import { ChevronRight, Home } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { cn } from '@/lib/utils';

// AI dev note: BreadcrumbNav combina Button primitives para navegação hierárquica
// Usado no header desktop para mostrar caminho atual

export interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: React.ReactNode;
}

export interface BreadcrumbNavProps {
  items: BreadcrumbItem[];
  onItemClick?: (item: BreadcrumbItem, index: number) => void;
  className?: string;
}

export const BreadcrumbNav = React.memo<BreadcrumbNavProps>(
  ({ items, onItemClick, className }) => {
    if (items.length === 0) return null;

    return (
      <nav className={cn('flex items-center space-x-1', className)}>
        {items.map((item, index) => (
          <React.Fragment key={index}>
            {index > 0 && (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}

            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-8 px-2 text-sm',
                index === items.length - 1
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => onItemClick?.(item, index)}
              disabled={!item.href && index === items.length - 1}
            >
              {index === 0 && <Home className="h-4 w-4 mr-1" />}
              {item.icon && index > 0 && (
                <div className="mr-1">{item.icon}</div>
              )}
              {item.label}
            </Button>
          </React.Fragment>
        ))}
      </nav>
    );
  }
);

BreadcrumbNav.displayName = 'BreadcrumbNav';
