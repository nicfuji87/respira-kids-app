import React from 'react';
import { Button } from '@/components/primitives/button';
import { 
  Edit, 
  Trash2, 
  ToggleLeft, 
  ToggleRight,
  MoreHorizontal 
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/primitives/dropdown-menu';
import { cn } from '@/lib/utils';

// AI dev note: CRUDActions reutilizável para operações padronizadas
// Botões de editar, excluir e ativar/desativar em dropdown

export interface CRUDActionsProps {
  onEdit?: () => void;
  onDelete?: () => void;
  onToggleStatus?: () => void;
  ativo?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canToggleStatus?: boolean;
  className?: string;
}

export const CRUDActions = React.memo<CRUDActionsProps>(
  ({ 
    onEdit, 
    onDelete, 
    onToggleStatus, 
    ativo = true,
    canEdit = true,
    canDelete = true,
    canToggleStatus = true,
    className 
  }) => {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            className={cn("h-8 w-8 p-0", className)}
          >
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Abrir menu de ações</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          {canEdit && onEdit && (
            <DropdownMenuItem onClick={onEdit}>
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </DropdownMenuItem>
          )}
          
          {canToggleStatus && onToggleStatus && (
            <DropdownMenuItem onClick={onToggleStatus}>
              {ativo ? (
                <ToggleLeft className="mr-2 h-4 w-4" />
              ) : (
                <ToggleRight className="mr-2 h-4 w-4" />
              )}
              {ativo ? 'Desativar' : 'Ativar'}
            </DropdownMenuItem>
          )}
          
          {(canEdit || canToggleStatus) && canDelete && (
            <DropdownMenuSeparator />
          )}
          
          {canDelete && onDelete && (
            <DropdownMenuItem 
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
);

CRUDActions.displayName = 'CRUDActions'; 