import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/primitives/alert-dialog';
import { buttonVariants } from '@/components/primitives/button';
import { cn } from '@/lib/utils';

// AI dev note: ConfirmActionDialog padroniza confirmações de ações (exclusões etc.)
// Substitui window.confirm/confirm() nativo por AlertDialog acessível.
// Uso controlado: open/onOpenChange + onConfirm.

export interface ConfirmActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'destructive' (padrão) estiliza o botão de confirmação em vermelho */
  variant?: 'default' | 'destructive';
  onConfirm: () => void;
}

export const ConfirmActionDialog: React.FC<ConfirmActionDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'destructive',
  onConfirm,
}) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            className={cn(
              variant === 'destructive' &&
                buttonVariants({ variant: 'destructive' })
            )}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

ConfirmActionDialog.displayName = 'ConfirmActionDialog';
