import React from 'react';
import { Badge } from '@/components/primitives/badge';
import { Button } from '@/components/primitives/button';

// AI dev note: StatusPaymentDisplay é um COMPOSED que combina Badge + Button
// para exibir status de pagamento com botões condicionais baseados no status e role

export interface StatusPaymentDisplayProps {
  status: string;
  statusColor: string;
  valor: string;
  userRole: 'admin' | 'profissional' | 'secretaria' | null;
  linkNfe?: string | null;
  onPaymentAction?: () => void;
  onNfeAction?: () => void;
  hideValue?: boolean;
  className?: string;
}

export const StatusPaymentDisplay = React.memo<StatusPaymentDisplayProps>(
  ({
    status,
    statusColor,
    valor,
    userRole,
    linkNfe,
    onPaymentAction,
    onNfeAction,
    hideValue = false,
    className,
  }) => {
    const canManagePayments = userRole === 'admin' || userRole === 'secretaria';

    // Mapear códigos de status para determinar ações disponíveis
    const getPaymentActions = () => {
      if (!canManagePayments) return null;

      const statusLower = status.toLowerCase();

      // Pagamento Pendente/Cobrança Gerada/Atrasado: "Receber pagamento manual"
      if (
        statusLower.includes('pendente') ||
        statusLower.includes('gerada') ||
        statusLower.includes('atrasado')
      ) {
        return (
          <Button
            variant="outline"
            size="sm"
            onClick={onPaymentAction}
            className="text-xs"
          >
            Receber pagamento manual
          </Button>
        );
      }

      // Pago + sem NFe: "Emitir NFe"
      if (statusLower.includes('pago') && !linkNfe) {
        return (
          <Button
            variant="default"
            size="sm"
            onClick={onNfeAction}
            className="text-xs"
          >
            Emitir NFe
          </Button>
        );
      }

      // Pago + com NFe: "Visualizar NFe"
      if (statusLower.includes('pago') && linkNfe) {
        return (
          <Button
            variant="outline"
            size="sm"
            onClick={onNfeAction}
            className="text-xs"
          >
            Visualizar NFe
          </Button>
        );
      }

      return null;
    };

    return (
      <div className={`space-y-2 ${className || ''}`}>
        <div className="flex items-center gap-2">
          <Badge
            style={{ backgroundColor: statusColor, color: 'white' }}
            className="text-xs"
          >
            {status}
          </Badge>
          {/* AI dev note: hideValue para role profissional - não mostrar valor do serviço */}
          {!hideValue && (
            <span className="font-medium text-sm">
              R${' '}
              {parseFloat(valor).toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
              })}
            </span>
          )}
        </div>

        {getPaymentActions()}
      </div>
    );
  }
);

StatusPaymentDisplay.displayName = 'StatusPaymentDisplay';
