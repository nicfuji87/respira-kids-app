import React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';
import { Button } from '@/components/primitives/button';
import { Skeleton } from '@/components/primitives/skeleton';
import {
  Package,
  Plus,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MaterialRequest } from '@/lib/professional-dashboard-api';

// AI dev note: MaterialRequestCard - Card para solicitação de material
// Placeholder até tabela material_requests ser criada no Supabase

interface MaterialRequestCardProps {
  requests: MaterialRequest[];
  loading?: boolean;
  error?: string | null;
  onCreateRequest?: () => void;
  onRequestClick?: (request: MaterialRequest) => void;
  className?: string;
}

const RequestItem = React.memo<{
  request: MaterialRequest;
  onClick?: (request: MaterialRequest) => void;
}>(({ request, onClick }) => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'short',
    }).format(date);
  };

  const getPriorityBadge = (prioridade: string) => {
    switch (prioridade) {
      case 'urgente':
        return (
          <Badge variant="destructive" className="text-xs">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Urgente
          </Badge>
        );
      case 'alta':
        return (
          <Badge
            variant="secondary"
            className="text-xs bg-amarelo-pipa/10 text-amarelo-pipa border-amarelo-pipa/20"
          >
            Alta
          </Badge>
        );
      case 'media':
        return (
          <Badge variant="outline" className="text-xs">
            Média
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            Baixa
          </Badge>
        );
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'aprovado':
        return <CheckCircle className="h-3 w-3 text-green-500" />;
      case 'rejeitado':
        return <XCircle className="h-3 w-3 text-red-500" />;
      default:
        return <Clock className="h-3 w-3 text-yellow-500" />;
    }
  };

  return (
    <div
      className={cn(
        'flex items-center justify-between p-3 border rounded-lg transition-all duration-200',
        'hover:shadow-sm hover:border-primary/20',
        onClick && 'cursor-pointer hover:bg-accent/50'
      )}
      onClick={() => onClick?.(request)}
    >
      <div className="flex-1 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground truncate">
            {request.descricao}
          </span>
          {getPriorityBadge(request.prioridade)}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatDate(request.dataSolicitacao)}</span>
          <div className="flex items-center gap-1">
            {getStatusIcon(request.status)}
            <span className="capitalize">{request.status}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

RequestItem.displayName = 'RequestItem';

const RequestSkeleton = React.memo(() => (
  <div className="flex items-center justify-between p-3 border rounded-lg">
    <div className="flex-1 space-y-1">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-5 w-16" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  </div>
));

RequestSkeleton.displayName = 'RequestSkeleton';

export const MaterialRequestCard = React.memo<MaterialRequestCardProps>(
  ({
    requests,
    loading = false,
    error,
    onCreateRequest,
    onRequestClick,
    className,
  }) => {
    const pendingCount = requests.filter((r) => r.status === 'pendente').length;
    const maxItems = 3;
    const displayedRequests = requests.slice(0, maxItems);

    // Estado de desenvolvimento - tabela não criada ainda
    const isPlaceholder = requests.length === 0 && !loading && !error;

    return (
      <Card className={cn('w-full', className)}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-roxo-titulo" />
            Solicitação de Material
            {pendingCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {pendingCount} pendentes
              </Badge>
            )}
          </CardTitle>

          {onCreateRequest && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCreateRequest}
              className="text-roxo-titulo hover:text-roxo-titulo/80"
            >
              <Plus className="h-4 w-4 mr-1" />
              Solicitar
            </Button>
          )}
        </CardHeader>

        <CardContent>
          {error ? (
            <div className="text-center py-6">
              <div className="text-destructive mb-2">
                Erro ao carregar solicitações
              </div>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          ) : loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <RequestSkeleton key={i} />
              ))}
            </div>
          ) : isPlaceholder ? (
            <div className="text-center py-6">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <div className="font-medium text-foreground mb-2">
                Funcionalidade em Desenvolvimento
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Sistema de solicitação de material será implementado em breve.
              </p>
              {onCreateRequest && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onCreateRequest}
                  disabled
                  className="text-muted-foreground"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Em breve
                </Button>
              )}
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-6">
              <Package className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <div className="font-medium text-foreground mb-2">
                Nenhuma solicitação
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                Você não tem solicitações de material no momento.
              </p>
              {onCreateRequest && (
                <Button variant="outline" size="sm" onClick={onCreateRequest}>
                  <Plus className="h-4 w-4 mr-1" />
                  Nova Solicitação
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {displayedRequests.map((request) => (
                <RequestItem
                  key={request.id}
                  request={request}
                  onClick={onRequestClick}
                />
              ))}

              {requests.length > maxItems && (
                <div className="pt-2 border-t">
                  <div className="text-center text-xs text-muted-foreground">
                    Mais {requests.length - maxItems} solicitações
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
);

MaterialRequestCard.displayName = 'MaterialRequestCard';
