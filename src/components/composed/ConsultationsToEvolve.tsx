import React, { useState } from 'react';
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
  FileText,
  User,
  Calendar,
  Clock,
  AlertTriangle,
  ArrowRight,
  DollarSign,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConsultationToEvolve } from '@/lib/professional-dashboard-api';

// AI dev note: ConsultationsToEvolve - Lista de consultas que precisam de evolução
// Combina primitives com destaque para urgência e cores da Respira Kids

interface ConsultationsToEvolveProps {
  consultations: ConsultationToEvolve[];
  loading?: boolean;
  error?: string | null;
  onConsultationClick?: (consultation: ConsultationToEvolve) => void;
  onCreateEvolutionClick?: (consultationId: string) => void;
  maxItems?: number;
  className?: string;
}

const ConsultationItem = React.memo<{
  consultation: ConsultationToEvolve;
  onClick?: (consultation: ConsultationToEvolve) => void;
  onCreateEvolution?: (consultationId: string) => void;
}>(({ consultation, onClick, onCreateEvolution }) => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const getUrgencyBadge = (
    diasPendente: number,
    prioridade: 'normal' | 'atencao' | 'urgente'
  ) => {
    // Nova lógica: até 2 dias = amarelo, acima de 2 dias = vermelho
    if (prioridade === 'urgente' || diasPendente > 2) {
      return (
        <Badge variant="destructive" className="text-xs">
          <AlertTriangle className="h-3 w-3 mr-1" />
          {diasPendente} dias pendente
        </Badge>
      );
    }

    if (prioridade === 'atencao' || diasPendente <= 2) {
      return (
        <Badge
          variant="secondary"
          className="text-xs bg-amarelo-pipa/10 text-amarelo-pipa border-amarelo-pipa/20"
        >
          <Clock className="h-3 w-3 mr-1" />
          {diasPendente} dias
        </Badge>
      );
    }

    return (
      <Badge variant="outline" className="text-xs">
        {diasPendente} dias
      </Badge>
    );
  };

  return (
    <div
      className={cn(
        'flex items-center justify-between p-4 border rounded-lg transition-all duration-200',
        'hover:shadow-md hover:border-primary/20',
        (consultation.prioridade === 'urgente' ||
          consultation.diasPendente > 2) &&
          'border-destructive/30 bg-destructive/5',
        onClick && 'cursor-pointer hover:bg-accent/50'
      )}
      onClick={() => onClick?.(consultation)}
    >
      <div className="flex-1 space-y-2">
        {/* Linha 1: Paciente e Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-foreground">
              {consultation.pacienteNome}
            </span>
          </div>
          {getUrgencyBadge(consultation.diasPendente, consultation.prioridade)}
        </div>

        {/* Linha 2: Serviço e Data */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {consultation.tipoServico}
          </span>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {formatDate(consultation.dataHora)}
          </div>
        </div>

        {/* Linha 3: Valor e Ação */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-sm font-medium text-verde-pipa">
            <DollarSign className="h-3 w-3" />
            {formatCurrency(consultation.valor)}
          </div>

          {onCreateEvolution && (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onCreateEvolution(consultation.id);
              }}
              className="text-xs"
            >
              <FileText className="h-3 w-3 mr-1" />
              Criar Evolução
            </Button>
          )}
        </div>
      </div>

      {onClick && <ArrowRight className="h-4 w-4 text-muted-foreground ml-3" />}
    </div>
  );
});

ConsultationItem.displayName = 'ConsultationItem';

const ConsultationSkeleton = React.memo(() => (
  <div className="flex items-center justify-between p-4 border rounded-lg">
    <div className="flex-1 space-y-2">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-5 w-20" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-16" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-8 w-24" />
      </div>
    </div>
  </div>
));

ConsultationSkeleton.displayName = 'ConsultationSkeleton';

export const ConsultationsToEvolve = React.memo<ConsultationsToEvolveProps>(
  ({
    consultations,
    loading = false,
    error,
    onConsultationClick,
    onCreateEvolutionClick,
    maxItems = 3,
    className,
  }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const displayedConsultations = isExpanded
      ? consultations
      : consultations.slice(0, maxItems);
    const hasMore = consultations.length > maxItems;
    const urgentCount = consultations.filter((c) => c.urgente).length;

    return (
      <Card className={cn('w-full', className)}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-vermelho-kids" />
            Consultas a Evoluir
            {urgentCount > 0 && (
              <Badge variant="destructive" className="ml-2">
                {urgentCount} urgentes
              </Badge>
            )}
          </CardTitle>
          {!loading && hasMore && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-vermelho-kids hover:text-vermelho-kids/80"
            >
              {isExpanded ? 'Ver menos' : 'Ver mais pendentes'}
            </Button>
          )}
        </CardHeader>

        <CardContent>
          {error ? (
            <div className="text-center py-8">
              <div className="text-destructive mb-2">
                Erro ao carregar consultas
              </div>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          ) : loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <ConsultationSkeleton key={i} />
              ))}
            </div>
          ) : consultations.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <div className="font-medium text-foreground mb-2">
                Todas as evoluções em dia!
              </div>
              <p className="text-sm text-muted-foreground">
                Não há consultas finalizadas pendentes de evolução.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayedConsultations.map((consultation) => (
                <ConsultationItem
                  key={consultation.id}
                  consultation={consultation}
                  onClick={onConsultationClick}
                  onCreateEvolution={onCreateEvolutionClick}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
);

ConsultationsToEvolve.displayName = 'ConsultationsToEvolve';
