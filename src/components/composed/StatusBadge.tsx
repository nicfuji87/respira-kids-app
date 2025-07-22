import React from 'react';
import { Badge } from '@/components/primitives/badge';
import { cn } from '@/lib/utils';

// AI dev note: StatusBadge reutilizável para entidades do sistema
// Mostra status ativo/inativo com cores padronizadas

export interface StatusBadgeProps {
  ativo: boolean;
  className?: string;
}

export const StatusBadge = React.memo<StatusBadgeProps>(
  ({ ativo, className }) => {
    return (
      <Badge
        variant={ativo ? 'default' : 'secondary'}
        className={cn(
          ativo 
            ? 'bg-verde-pipa/10 text-verde-pipa border-verde-pipa/20' 
            : 'bg-cinza-secundario/10 text-cinza-secundario border-cinza-secundario/20',
          className
        )}
      >
        {ativo ? 'Ativo' : 'Inativo'}
      </Badge>
    );
  }
);

StatusBadge.displayName = 'StatusBadge'; 