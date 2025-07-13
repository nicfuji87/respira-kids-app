import React from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import { cn } from '@/lib/utils';

// AI dev note: NotificationBadge combina Button e Badge primitives
// Usado no header para mostrar notificações

export interface NotificationBadgeProps {
  count?: number;
  onClick?: () => void;
  className?: string;
}

export const NotificationBadge = React.memo<NotificationBadgeProps>(
  ({ count = 0, onClick, className }) => {
    const hasNotifications = count > 0;

    return (
      <Button
        variant="ghost"
        size="sm"
        className={cn('relative h-8 w-8 p-0', className)}
        onClick={onClick}
      >
        <Bell
          className={cn(
            'h-4 w-4',
            hasNotifications ? 'text-primary' : 'text-muted-foreground'
          )}
        />

        {hasNotifications && (
          <Badge
            variant="destructive"
            className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
          >
            {count > 99 ? '99+' : count}
          </Badge>
        )}
      </Button>
    );
  }
);

NotificationBadge.displayName = 'NotificationBadge';
