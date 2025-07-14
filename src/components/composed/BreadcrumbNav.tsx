import React from 'react';
import {
  ChevronRight,
  Home,
  Calendar,
  Users,
  Package,
  DollarSign,
  Settings,
  FileText,
  Webhook,
} from 'lucide-react';
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

// Helper function to get icon based on label
const getIconForLabel = (label: string) => {
  const iconMap: Record<string, React.ReactNode> = {
    Dashboard: <Home className="h-4 w-4" />,
    Agenda: <Calendar className="h-4 w-4" />,
    Pacientes: <Users className="h-4 w-4" />,
    Estoque: <Package className="h-4 w-4" />,
    Financeiro: <DollarSign className="h-4 w-4" />,
    Configurações: <Settings className="h-4 w-4" />,
    Usuários: <Users className="h-4 w-4" />,
    Relatórios: <FileText className="h-4 w-4" />,
    Webhooks: <Webhook className="h-4 w-4" />,
  };

  return iconMap[label] || <Home className="h-4 w-4" />;
};

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
              <div className="mr-1">{getIconForLabel(item.label)}</div>
              {item.label}
            </Button>
          </React.Fragment>
        ))}
      </nav>
    );
  }
);

BreadcrumbNav.displayName = 'BreadcrumbNav';
