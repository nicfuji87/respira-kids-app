import React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Construction, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

// AI dev note: DevelopmentPlaceholder combina Card primitive com mensagem de desenvolvimento
// Componente reutilizável para seções em construção

export interface DevelopmentPlaceholderProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}

export const DevelopmentPlaceholder = React.memo<DevelopmentPlaceholderProps>(
  ({
    title,
    description = 'Esta seção está sendo desenvolvida e estará disponível em breve.',
    icon,
    className,
  }) => {
    const defaultIcon = (
      <Construction className="h-12 w-12 text-muted-foreground/50" />
    );

    return (
      <Card className={cn('w-full', className)}>
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-4">{icon || defaultIcon}</div>
          <CardTitle className="text-xl">{title}</CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-muted-foreground mb-4">{description}</p>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>Em desenvolvimento</span>
          </div>
        </CardContent>
      </Card>
    );
  }
);

DevelopmentPlaceholder.displayName = 'DevelopmentPlaceholder';
