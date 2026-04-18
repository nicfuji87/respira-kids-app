import React from 'react';
import { Badge } from '@/components/primitives/badge';
import { Button } from '@/components/primitives/button';
import { ExternalLink, FileText, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/primitives/use-toast';
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

// AI dev note: Função utilitária para gerar URL do ASAAS (igual ao FaturasList)
const getAsaasPaymentUrl = (paymentId: string): string | null => {
  if (!paymentId?.trim() || !paymentId.startsWith('pay_')) {
    return null;
  }
  return `https://www.asaas.com/i/${paymentId.replace('pay_', '')}`;
};

// AI dev note: StatusPaymentDisplay é um COMPOSED que combina Badge + Button
// para exibir status de pagamento com botões condicionais baseados no status e role

export interface StatusPaymentDisplayProps {
  status: string;
  statusColor: string;
  valor: string;
  userRole: 'admin' | 'profissional' | 'secretaria' | null;
  linkNfe?: string | null;
  statusNfe?: string | null; // AI dev note: Mensagem de erro do ASAAS (ex: erro de RPS)
  idAsaas?: string | null; // Para botão "Ver fatura"
  onNfeAction?: () => void;
  onVerFatura?: () => void; // Callback para "Ver fatura"
  hideValue?: boolean;
  inlineButtons?: boolean;
  className?: string;
  isEmitingNfe?: boolean; // Para mostrar estado de processamento
}

export const StatusPaymentDisplay = React.memo<StatusPaymentDisplayProps>(
  ({
    status,
    statusColor,
    valor,
    userRole,
    linkNfe,
    statusNfe,
    idAsaas,
    onNfeAction,
    onVerFatura,
    hideValue = false,
    inlineButtons = false,
    className,
    isEmitingNfe = false,
  }) => {
    const canManagePayments = userRole === 'admin' || userRole === 'secretaria';
    const { toast } = useToast();
    // AI dev note: Controla o diálogo de confirmação de "cancelar e reemitir NFe"
    const [showCancelReissueDialog, setShowCancelReissueDialog] =
      React.useState(false);

    // Função para determinar estado do botão NFe (baseado na lógica do FaturasList)
    const getNfeButtonConfig = () => {
      const statusLower = status.toLowerCase();

      // Só mostrar botões NFe para faturas pagas
      if (!statusLower.includes('pago')) {
        return null;
      }

      // Verificar se está sendo processada
      if (isEmitingNfe) {
        return {
          text: 'Emitindo NFe...',
          icon: FileText,
          className: 'text-gray-500',
          disabled: true,
        };
      }

      if (!linkNfe) {
        return {
          text: 'Emitir NFe',
          icon: FileText,
          className: 'text-blue-600 hover:text-blue-800',
          disabled: false,
        };
      }

      if (linkNfe === 'sincronizando') {
        return {
          text: 'Gerando NFe',
          icon: FileText,
          className: 'text-gray-500',
          disabled: true,
        };
      }

      if (linkNfe === 'erro') {
        // AI dev note: Em caso de erro (ex: erro de RPS), permitir cancelar a NFe
        // em erro no ASAAS e emitir uma nova. O clique mostra toast com o erro
        // real vindo do ASAAS e abre diálogo de confirmação.
        return {
          text: 'Erro. Cancelar e reemitir NFe',
          icon: RefreshCw,
          className: 'text-red-600 hover:text-red-800',
          disabled: false,
        };
      }

      // Link válido
      return {
        text: 'Ver NFe',
        icon: ExternalLink,
        className: 'text-green-600 hover:text-green-800',
        disabled: false,
      };
    };

    // Função para lidar com ações de NFe (igual ao FaturasList)
    const handleNfeAction = (e: React.MouseEvent) => {
      e.stopPropagation();

      if (linkNfe === 'erro') {
        // AI dev note: Mostrar toast com o erro real do ASAAS e abrir confirmação
        // antes de cancelar+reemitir.
        toast({
          title: 'Erro na emissão da NFe',
          description:
            statusNfe ||
            'A emissão da nota fiscal falhou. Clique em confirmar para cancelar a NFe anterior e emitir novamente.',
          variant: 'destructive',
        });
        setShowCancelReissueDialog(true);
      } else if (linkNfe && linkNfe !== 'sincronizando' && linkNfe !== 'erro') {
        // Link válido - abrir NFe
        window.open(linkNfe, '_blank');
      } else {
        // Emitir NFe - chamar callback
        if (onNfeAction) {
          onNfeAction();
        }
      }
    };

    const handleConfirmCancelReissue = () => {
      setShowCancelReissueDialog(false);
      if (onNfeAction) {
        onNfeAction();
      } else {
        toast({
          title: 'Ação indisponível',
          description: 'Não foi possível iniciar a reemissão da NFe.',
          variant: 'destructive',
        });
      }
    };

    // Mapear códigos de status para determinar ações disponíveis
    const getPaymentActions = () => {
      if (!canManagePayments) return null;

      const nfeConfig = getNfeButtonConfig();

      // Gerar URL do ASAAS usando a função correta
      const asaasUrl = getAsaasPaymentUrl(idAsaas || '');

      const buttons = [];

      // Botão "Ver fatura" - se existir id_asaas
      if (asaasUrl) {
        buttons.push(
          <Button
            key="ver-fatura"
            variant="ghost"
            size="sm"
            className="text-xs text-blue-600 hover:text-blue-800"
            onClick={(e) => {
              e.stopPropagation();
              if (onVerFatura) {
                onVerFatura();
              } else {
                window.open(asaasUrl, '_blank');
              }
            }}
            title="Ver fatura no ASAAS"
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            Ver fatura
          </Button>
        );
      }

      // Botão NFe - apenas para faturas pagas
      if (nfeConfig) {
        buttons.push(
          <Button
            key="nfe"
            variant="ghost"
            size="sm"
            className={cn('text-xs', nfeConfig.className)}
            onClick={handleNfeAction}
            disabled={nfeConfig.disabled}
            title={nfeConfig.text}
          >
            <nfeConfig.icon className="h-3 w-3 mr-1" />
            {nfeConfig.text}
          </Button>
        );
      }

      return buttons;
    };

    const paymentActions = getPaymentActions();

    return (
      <div
        className={`${inlineButtons ? 'flex items-center gap-2' : 'space-y-2'} ${className || ''}`}
      >
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

        {/* Renderizar botões de ação */}
        {paymentActions && paymentActions.length > 0 && (
          <div
            className={`flex items-center gap-2 ${inlineButtons ? '' : 'mt-2'}`}
          >
            {paymentActions}
          </div>
        )}

        {/* AI dev note: Confirmação antes de cancelar a NFe em erro e reemitir.
            Cancelar NFe tem efeito fiscal, por isso exigimos confirmação explícita. */}
        <AlertDialog
          open={showCancelReissueDialog}
          onOpenChange={setShowCancelReissueDialog}
        >
          <AlertDialogContent onClick={(e) => e.stopPropagation()}>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancelar e reemitir NFe?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <p>
                    A nota fiscal anterior está com erro e será{' '}
                    <strong>cancelada (ou excluída) no ASAAS</strong> antes de
                    emitir uma nova.
                  </p>
                  {statusNfe ? (
                    <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
                      <strong>Erro anterior:</strong> {statusNfe}
                    </p>
                  ) : null}
                  <p>
                    Essa ação tem efeito fiscal caso a nota já tenha sido
                    autorizada pela prefeitura. Deseja continuar?
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={(e) => e.stopPropagation()}>
                Voltar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.stopPropagation();
                  handleConfirmCancelReissue();
                }}
                className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              >
                Cancelar e reemitir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }
);

StatusPaymentDisplay.displayName = 'StatusPaymentDisplay';
