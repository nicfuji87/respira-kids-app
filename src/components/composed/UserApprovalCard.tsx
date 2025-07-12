import React from 'react';
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Mail,
  RefreshCw,
} from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { cn } from '@/lib/utils';

// AI dev note: UserApprovalCard mostra status de aprovação no fluxo único da clínica
// Estados: pending, approved, rejected, expired + ações específicas para cada

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

interface UserInfo {
  email: string;
  name?: string;
  submittedAt: string;
}

interface UserApprovalCardProps {
  status: ApprovalStatus;
  userInfo: UserInfo;
  onResendEmail?: () => Promise<void>;
  onContactSupport?: () => void;
  onProceedToComplete?: () => void;
  isLoading?: boolean;
  className?: string;
  adminMessage?: string;
}

const statusConfig = {
  pending: {
    icon: Clock,
    color: 'text-amarelo-pipa',
    bgColor: 'bg-amarelo-pipa/10',
    borderColor: 'border-amarelo-pipa/20',
    variant: 'secondary' as const,
    title: 'Aguardando Aprovação',
    description:
      'Sua solicitação está sendo analisada pela equipe administrativa.',
  },
  approved: {
    icon: CheckCircle,
    color: 'text-verde-pipa',
    bgColor: 'bg-verde-pipa/10',
    borderColor: 'border-verde-pipa/20',
    variant: 'default' as const,
    title: 'Aprovado!',
    description: 'Sua conta foi aprovada. Complete seu cadastro para começar.',
  },
  rejected: {
    icon: XCircle,
    color: 'text-destructive',
    bgColor: 'bg-destructive/10',
    borderColor: 'border-destructive/20',
    variant: 'destructive' as const,
    title: 'Solicitação Negada',
    description:
      'Sua solicitação não foi aprovada. Entre em contato para mais informações.',
  },
  expired: {
    icon: AlertCircle,
    color: 'text-vermelho-kids',
    bgColor: 'bg-vermelho-kids/10',
    borderColor: 'border-vermelho-kids/20',
    variant: 'secondary' as const,
    title: 'Aprovação Expirada',
    description:
      'O tempo limite para aprovação foi excedido. Solicite uma nova análise.',
  },
} as const;

export const UserApprovalCard = React.memo<UserApprovalCardProps>(
  ({
    status,
    userInfo,
    onResendEmail,
    onContactSupport,
    onProceedToComplete,
    isLoading = false,
    className,
    adminMessage,
  }) => {
    const config = statusConfig[status];
    const StatusIcon = config.icon;

    const formatDate = (dateString: string) => {
      try {
        return new Date(dateString).toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      } catch {
        return dateString;
      }
    };

    return (
      <Card
        className={cn(
          'w-full max-w-md mx-auto theme-transition respira-shadow',
          'border-border/20 bg-card/95 backdrop-blur-sm',
          className
        )}
        role="status"
        aria-label={`Status de aprovação: ${config.title}`}
      >
        <CardHeader className="text-center pb-4">
          {/* Status Icon */}
          <div
            className={cn(
              'mx-auto w-16 h-16 rounded-full flex items-center justify-center',
              config.bgColor,
              config.borderColor,
              'border-2'
            )}
            aria-hidden="true"
          >
            <StatusIcon className={cn('h-8 w-8', config.color)} />
          </div>

          {/* Title and Badge */}
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2">
              <CardTitle className="text-xl font-bold text-roxo-titulo">
                {config.title}
              </CardTitle>
              <Badge
                variant={config.variant}
                className={cn(
                  'text-xs font-medium',
                  config.color,
                  config.bgColor
                )}
              >
                {status.toUpperCase()}
              </Badge>
            </div>

            <CardDescription className="text-muted-foreground">
              {config.description}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* User Information */}
          <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2 text-sm">
              <Mail
                className="h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="font-medium text-foreground">
                {userInfo.email}
              </span>
            </div>

            {userInfo.name && (
              <div className="text-sm text-muted-foreground">
                <span className="font-medium">Nome:</span> {userInfo.name}
              </div>
            )}

            <div className="text-sm text-muted-foreground">
              <span className="font-medium">Solicitado em:</span>{' '}
              {formatDate(userInfo.submittedAt)}
            </div>
          </div>

          {/* Admin Message */}
          {adminMessage && (
            <Alert className="border-border/20">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                <span className="font-medium">Mensagem da administração:</span>
                <br />
                {adminMessage}
              </AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="space-y-3 pt-2">
            {status === 'pending' && (
              <div className="space-y-2">
                <p className="text-center text-sm text-muted-foreground">
                  Você receberá um email quando sua conta for aprovada.
                </p>

                {onResendEmail && (
                  <Button
                    variant="outline"
                    onClick={onResendEmail}
                    disabled={isLoading}
                    className="w-full theme-transition"
                    aria-label="Reenviar email de confirmação"
                  >
                    {isLoading ? (
                      <Loader2
                        className="mr-2 h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                    )}
                    Reenviar Email
                  </Button>
                )}
              </div>
            )}

            {status === 'approved' && onProceedToComplete && (
              <Button
                onClick={onProceedToComplete}
                disabled={isLoading}
                className="w-full respira-gradient hover:opacity-90 theme-transition font-medium"
                aria-label="Completar cadastro"
              >
                {isLoading ? (
                  <Loader2
                    className="mr-2 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <CheckCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                Completar Cadastro
              </Button>
            )}

            {(status === 'rejected' || status === 'expired') && (
              <div className="space-y-2">
                {onContactSupport && (
                  <Button
                    variant="outline"
                    onClick={onContactSupport}
                    disabled={isLoading}
                    className="w-full theme-transition"
                    aria-label="Entrar em contato com suporte"
                  >
                    <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
                    Contatar Suporte
                  </Button>
                )}

                {status === 'expired' && onResendEmail && (
                  <Button
                    onClick={onResendEmail}
                    disabled={isLoading}
                    className="w-full respira-gradient hover:opacity-90 theme-transition font-medium"
                    aria-label="Solicitar nova análise"
                  >
                    {isLoading ? (
                      <Loader2
                        className="mr-2 h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                    )}
                    Solicitar Nova Análise
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Help Text */}
          <div className="text-center pt-2">
            <p className="text-xs text-muted-foreground">
              Dúvidas? Entre em contato pelo{' '}
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={onContactSupport}
                aria-label="Abrir suporte via email"
              >
                suporte@respirakids.com.br
              </button>
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }
);

UserApprovalCard.displayName = 'UserApprovalCard';
