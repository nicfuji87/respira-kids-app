import React, { useState } from 'react';
import {
  Calendar,
  CreditCard,
  ExternalLink,
  Clock,
  Receipt,
  ChevronRight,
  FileText,
  RefreshCw,
  DollarSign,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';
import { Button } from '@/components/primitives/button';
import { Skeleton } from '@/components/primitives/skeleton';
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
import { cn } from '@/lib/utils';
import type { FaturaComDetalhes } from '@/types/faturas';

// AI dev note: Função utilitária para gerar URL do ASAAS (reutilizada)
const getAsaasPaymentUrl = (paymentId: string): string | null => {
  if (!paymentId?.trim() || !paymentId.startsWith('pay_')) {
    return null;
  }
  return `https://www.asaas.com/i/${paymentId.replace('pay_', '')}`;
};

// Componente individual da fatura
const FaturaItem = React.memo<{
  fatura: FaturaComDetalhes;
  onClick?: (fatura: FaturaComDetalhes) => void;
  onEdit?: (fatura: FaturaComDetalhes) => void;
  onDelete?: (fatura: FaturaComDetalhes) => void;
  onEmitirNfe?: (fatura: FaturaComDetalhes) => void;
  onReceivePayment?: (fatura: FaturaComDetalhes) => void;
  userRole?: string | null;
  isEmitingNfe?: string | null;
  isReceivingPayment?: string | null;
}>(
  ({
    fatura,
    onClick,
    onEdit,
    onDelete,
    onEmitirNfe,
    onReceivePayment,
    userRole,
    isEmitingNfe,
    isReceivingPayment,
  }) => {
    const { toast } = useToast();
    // AI dev note: Controla o diálogo de confirmação de "cancelar e reemitir NFe"
    const [showCancelReissueDialog, setShowCancelReissueDialog] =
      useState(false);

    const formatCurrency = (value: number) => {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(value);
    };

    // AI dev note: Função para formatar data SEM conversão de timezone
    // Mantém exatamente como vem do Supabase
    const formatDate = (dateString: string) => {
      if (!dateString) return '--/--/----';
      // Extrair data diretamente da string sem criar objeto Date
      const [datePart] = dateString.split('T');
      const [year, month, day] = datePart.split('-');
      return `${day}/${month}/${year}`;
    };

    // AI dev note: Função para formatar data e hora convertendo de UTC para horário de Brasília (UTC-3)
    const formatDateTime = (dateString: string) => {
      if (!dateString) return '--/--/---- --:--';

      // Criar objeto Date a partir da string UTC
      const dateUTC = new Date(dateString);

      // Converter para horário de Brasília usando toLocaleString
      const dateBrasilia = dateUTC.toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      return dateBrasilia;
    };

    // AI dev note: Formatar datas das consultas SEM conversão de timezone
    // Mantém exatamente como vem do Supabase
    const formatConsultationDates = (datasConsultas: string[]) => {
      if (!datasConsultas || datasConsultas.length === 0) return '';

      return datasConsultas
        .map((dataHora) => {
          // Extrair data e hora diretamente da string
          const [datePart, timePart] = dataHora.split('T');
          const [year, month, day] = datePart.split('-');
          const [hour, minute] = timePart.split(':');

          const dateStr = `${day}/${month}/${year}`;
          const timeStr = `${hour}:${minute}`;

          return `${dateStr} ${timeStr}`;
        })
        .join(', ');
    };

    const getStatusBadge = (status: FaturaComDetalhes['status']) => {
      const variants = {
        pago: 'default',
        pendente: 'secondary',
        atrasado: 'destructive',
        cancelado: 'outline',
        estornado: 'outline',
      } as const;

      const colors = {
        pago: '#10B981',
        pendente: '#F59E0B',
        atrasado: '#EF4444',
        cancelado: '#6B7280',
        estornado: '#7C3AED',
      };

      return (
        <Badge
          variant={variants[status]}
          className="text-xs"
          style={{
            backgroundColor: `${colors[status]}15`,
            borderColor: colors[status],
            color: colors[status],
          }}
        >
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </Badge>
      );
    };

    // Função para obter cor do valor baseada no status
    const getValueColor = (status: FaturaComDetalhes['status']) => {
      const colors = {
        pago: 'text-green-600', // Verde para pago
        pendente: 'text-yellow-600', // Amarelo para pendente
        atrasado: 'text-red-600', // Vermelho para atrasado
        cancelado: 'text-gray-500', // Cinza para cancelado
        estornado: 'text-purple-600', // Roxo para estornado
      };

      return colors[status] || 'text-green-600'; // Default verde
    };

    const asaasUrl = getAsaasPaymentUrl(fatura.id_asaas);

    // Debug log para verificar campos NFe
    if (process.env.NODE_ENV === 'development' && fatura.status === 'pago') {
      console.log('🔍 Debug NFe fatura:', {
        id: fatura.id.substring(0, 8),
        status: fatura.status,
        link_nfe: fatura.link_nfe,
        status_nfe: fatura.status_nfe,
        valor_total: fatura.valor_total,
      });
    }

    // Função para lidar com ações de NFe
    const handleNfeAction = (e: React.MouseEvent) => {
      e.stopPropagation();

      const linkNfe = fatura.link_nfe;

      if (linkNfe === 'erro') {
        // AI dev note: Mostrar toast com o erro real do ASAAS e abrir confirmação
        // antes de cancelar+reemitir.
        toast({
          title: 'Erro na emissão da NFe',
          description:
            fatura.status_nfe ||
            'A emissão da nota fiscal falhou. Clique em confirmar para cancelar a NFe anterior e emitir novamente.',
          variant: 'destructive',
        });
        setShowCancelReissueDialog(true);
      } else if (linkNfe && linkNfe !== 'sincronizando' && linkNfe !== 'erro') {
        // Link válido - abrir/baixar NFe
        console.log('📄 Abrindo NFe:', linkNfe);

        // Criar elemento <a> temporário para forçar download
        const link = document.createElement('a');
        link.href = linkNfe;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';

        // Se for PDF, tentar forçar download
        if (
          linkNfe.toLowerCase().includes('.pdf') ||
          linkNfe.toLowerCase().includes('/pdf')
        ) {
          link.download = `nota-fiscal-${fatura.id.substring(0, 8)}.pdf`;
        }

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        // Emitir NFe
        if (onEmitirNfe) {
          onEmitirNfe(fatura);
        }
      }
    };

    // Função para determinar estado do botão NFe
    const getNfeButtonConfig = () => {
      if (fatura.status !== 'pago') {
        return null;
      }

      // Verificar se está sendo processada
      const isProcessing = isEmitingNfe === fatura.id;

      const linkNfe = fatura.link_nfe;

      if (isProcessing) {
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

    const nfeConfig = getNfeButtonConfig();

    // Debug adicional para verificar se nfeConfig está sendo gerado
    if (process.env.NODE_ENV === 'development' && fatura.status === 'pago') {
      console.log('🔍 NFe Config gerado:', nfeConfig);
    }

    const handleConfirmCancelReissue = () => {
      setShowCancelReissueDialog(false);
      if (onEmitirNfe) {
        onEmitirNfe(fatura);
      } else {
        toast({
          title: 'Ação indisponível',
          description: 'Não foi possível iniciar a reemissão da NFe.',
          variant: 'destructive',
        });
      }
    };

    return (
      <div
        className={cn(
          'flex items-center justify-between p-3 border rounded-lg transition-all duration-200',
          'hover:shadow-md hover:border-primary/20',
          onClick && 'cursor-pointer hover:bg-accent/50'
        )}
        onClick={() => onClick?.(fatura)}
      >
        <div className="flex-1 space-y-1.5">
          {/* Linha 1: Vencimento, Valor e Status */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              {fatura.vencimento && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Venc: {formatDate(fatura.vencimento)}
                  {fatura.pago_em && fatura.status !== 'atrasado' && (
                    <span className="text-green-600 font-medium ml-2">
                      | Pago: {formatDateTime(fatura.pago_em)}
                    </span>
                  )}
                </div>
              )}
              <div className={cn(getValueColor(fatura.status), 'font-medium')}>
                {formatCurrency(fatura.valor_total)}
              </div>
            </div>
            {getStatusBadge(fatura.status)}
          </div>

          {/* Linha 2: Quantidade de Consultas e Datas */}
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            <span>{fatura.qtd_consultas || 0} consulta(s)</span>

            {/* Datas das consultas */}
            {fatura.datas_consultas && fatura.datas_consultas.length > 0 && (
              <div className="flex items-start gap-1">
                <Calendar className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span className="leading-tight">
                  {formatConsultationDates(fatura.datas_consultas)}
                </span>
              </div>
            )}
          </div>

          {/* Linha 3: Ações */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-3 pt-2 mt-2 border-t border-border/50 sm:border-none sm:pt-0 sm:mt-0">
            {/* Links e ações principais */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Link ASAAS */}
              {asaasUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-1 text-xs text-blue-600 hover:text-blue-800"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(asaasUrl, '_blank');
                  }}
                  title="Ver fatura no ASAAS"
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Ver fatura
                </Button>
              )}

              {/* Botão Receber Pagamento Manual - apenas para faturas pendentes/atrasadas */}
              {(userRole === 'admin' || userRole === 'secretaria') &&
                ['pendente', 'atrasado'].includes(fatura.status) &&
                fatura.id_asaas &&
                onReceivePayment && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'h-auto p-1 text-xs',
                      isReceivingPayment === fatura.id
                        ? 'text-gray-500'
                        : 'text-green-600 hover:text-green-800'
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      onReceivePayment(fatura);
                    }}
                    disabled={isReceivingPayment === fatura.id}
                    title="Confirmar recebimento em dinheiro"
                  >
                    <DollarSign className="h-3 w-3 mr-1" />
                    {isReceivingPayment === fatura.id
                      ? 'Confirmando...'
                      : 'Receber pagamento'}
                  </Button>
                )}

              {/* Botão NFe - apenas para faturas pagas */}
              {nfeConfig && (
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn('h-auto p-1 text-xs', nfeConfig.className)}
                  onClick={handleNfeAction}
                  disabled={nfeConfig.disabled}
                  title={nfeConfig.text}
                >
                  <nfeConfig.icon className="h-3 w-3 mr-1" />
                  {nfeConfig.text}
                </Button>
              )}
            </div>

            {/* Botões de ação para admin e secretaria */}
            {(userRole === 'admin' || userRole === 'secretaria') &&
              fatura.status !== 'pago' && (
                <div className="flex flex-wrap items-center gap-2 mt-2 sm:mt-0">
                  {/* Botão Editar */}
                  {['pendente', 'atrasado'].includes(fatura.status) &&
                    onEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-1 text-xs text-orange-600 hover:text-orange-800"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(fatura);
                        }}
                        title="Editar fatura"
                      >
                        Editar
                      </Button>
                    )}

                  {/* Botão Excluir */}
                  {onDelete && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-1 text-xs text-red-600 hover:text-red-800"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(fatura);
                      }}
                      title="Excluir fatura"
                    >
                      Excluir
                    </Button>
                  )}
                </div>
              )}
          </div>
        </div>

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
                  {fatura.status_nfe ? (
                    <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
                      <strong>Erro anterior:</strong> {fatura.status_nfe}
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

FaturaItem.displayName = 'FaturaItem';

// Skeleton para loading
const FaturaSkeleton = React.memo(() => (
  <div className="flex items-center justify-between p-3 border rounded-lg">
    <div className="flex-1 space-y-1.5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-5 w-16" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-16" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  </div>
));

FaturaSkeleton.displayName = 'FaturaSkeleton';

// Props do componente principal
export interface FaturasListProps {
  faturas: FaturaComDetalhes[];
  loading?: boolean;
  error?: string | null;
  onFaturaClick?: (fatura: FaturaComDetalhes) => void;
  onFaturaEdit?: (fatura: FaturaComDetalhes) => void;
  onFaturaDelete?: (fatura: FaturaComDetalhes) => void;
  onEmitirNfe?: (fatura: FaturaComDetalhes) => void;
  onReceivePayment?: (fatura: FaturaComDetalhes) => void;
  onVerMais?: () => void;
  maxItems?: number;
  className?: string;
  title?: string;
  showVerMais?: boolean;
  showCard?: boolean; // Controla se mostra o Card wrapper ou apenas os items
  userRole?: string | null;
  isEmitingNfe?: string | null; // faturaId sendo processada
  isReceivingPayment?: string | null; // faturaId sendo processada
}

// Componente principal da lista de faturas
export const FaturasList = React.memo<FaturasListProps>(
  ({
    faturas,
    loading = false,
    error,
    onFaturaClick,
    onFaturaEdit,
    onFaturaDelete,
    onEmitirNfe,
    onReceivePayment,
    onVerMais,
    maxItems = 2,
    className,
    title = 'Últimas Faturas',
    showVerMais = true,
    showCard = true,
    userRole,
    isEmitingNfe,
    isReceivingPayment,
  }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const displayedFaturas = isExpanded ? faturas : faturas.slice(0, maxItems);
    const hasMore = faturas.length > maxItems;

    const handleVerMais = () => {
      if (onVerMais) {
        onVerMais();
      } else {
        setIsExpanded(!isExpanded);
      }
    };

    // Renderizar conteúdo da lista
    const renderContent = () => (
      <>
        {error ? (
          <div className="text-center py-8">
            <div className="text-destructive mb-2">
              Erro ao carregar faturas
            </div>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        ) : loading ? (
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => (
              <FaturaSkeleton key={i} />
            ))}
          </div>
        ) : faturas.length === 0 ? (
          <div className="text-center py-8">
            <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <div className="font-medium text-foreground mb-2">
              Nenhuma fatura encontrada
            </div>
            <p className="text-sm text-muted-foreground">
              Este paciente ainda não possui faturas geradas.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayedFaturas.map((fatura) => (
              <FaturaItem
                key={fatura.id}
                fatura={fatura}
                onClick={onFaturaClick}
                onEdit={onFaturaEdit}
                onDelete={onFaturaDelete}
                onEmitirNfe={onEmitirNfe}
                onReceivePayment={onReceivePayment}
                userRole={userRole}
                isEmitingNfe={isEmitingNfe}
                isReceivingPayment={isReceivingPayment}
              />
            ))}

            {hasMore && (
              <div className="text-center pt-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleVerMais();
                  }}
                >
                  {isExpanded ? (
                    <>
                      Ver menos
                      <ChevronRight className="h-4 w-4 ml-1 rotate-90" />
                    </>
                  ) : (
                    <>
                      Ver todas as {faturas.length} faturas
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </>
    );

    // Se não mostrar card, retorna apenas o conteúdo
    if (!showCard) {
      return <div className={cn('w-full', className)}>{renderContent()}</div>;
    }

    // Versão com Card completo
    return (
      <Card className={cn('w-full', className)}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-azul-respira" />
            {title}
          </CardTitle>
          {!loading && hasMore && showVerMais && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleVerMais}
              className="text-azul-respira hover:text-azul-respira/80"
            >
              {isExpanded ? 'Ver menos' : 'Ver todas as faturas'}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </CardHeader>

        <CardContent>{renderContent()}</CardContent>
      </Card>
    );
  }
);

FaturasList.displayName = 'FaturasList';
