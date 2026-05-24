import React, { useState, useEffect } from 'react';
import { UserApprovalCard } from '@/components/composed';
import type { ApprovalStatus } from '@/components/composed';
import { useToast } from '@/components/primitives/use-toast';
import {
  getUserApprovalData,
  resendNotificationEmail,
  getCurrentUser,
} from '@/lib/auth';

// AI dev note: PendingApprovalPage gerencia o fluxo de aprovação específico da clínica
// IMPORTANTE: usuário só chega aqui APÓS já ter completado seu perfil (profile_complete=true).
// O fluxo é: signup -> complete-profile -> pending-approval -> dashboard.
// Integra com UserApprovalCard + dados reais do Supabase.

interface UserInfo {
  email: string;
  name?: string;
  submittedAt: string;
}

interface PendingApprovalPageProps {
  userEmail: string;
  onBackToSignUp?: () => void;
  className?: string;
}

export const PendingApprovalPage = React.memo<PendingApprovalPageProps>(
  ({ userEmail, onBackToSignUp, className }) => {
    const [status, setStatus] = useState<ApprovalStatus>('pending');
    const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
    const [adminMessage, setAdminMessage] = useState<string>();
    const [isLoading, setIsLoading] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const { toast } = useToast();

    // AI dev note: Busca dados reais do usuário autenticado e pessoa associada
    useEffect(() => {
      const fetchUserStatus = async () => {
        try {
          // Tentar buscar usuário atual primeiro
          const currentUser = await getCurrentUser();

          if (currentUser) {
            setUserId(currentUser.id);

            // Buscar dados completos do usuário
            const userData = await getUserApprovalData(currentUser.id);

            // AI dev note: Como o usuário só chega aqui após profile_complete=true,
            // os estados possíveis são apenas 'pending' (aguardando admin) ou 'approved'
            // (caso o useAuth ainda não tenha redirecionado para o dashboard).
            let currentStatus: ApprovalStatus = 'pending';
            let message: string | undefined;

            if (userData.isApproved) {
              currentStatus = 'approved';
              message =
                'Sua conta foi aprovada! Você será redirecionado em instantes...';
            } else {
              currentStatus = 'pending';
              message =
                'Recebemos seus dados. Sua solicitação está sendo analisada pela equipe administrativa.';
            }

            setStatus(currentStatus);
            setAdminMessage(message);
            setUserInfo({
              email: userData.email,
              name: userData.name,
              submittedAt: userData.submittedAt,
            });
          } else {
            // Fallback: usar dados básicos com userEmail quando não há sessão
            if (userEmail) {
              setStatus('pending');
              setAdminMessage(
                'Recebemos seus dados. Sua solicitação está sendo analisada pela equipe administrativa.'
              );
              setUserInfo({
                email: userEmail,
                name: undefined,
                submittedAt: new Date().toISOString(),
              });
            } else {
              throw new Error('Usuário não identificado');
            }
          }
        } catch (error) {
          console.error('Erro ao buscar status:', error);

          // Fallback final com dados básicos
          if (userEmail) {
            setStatus('pending');
            setAdminMessage(
              'Recebemos seus dados. Sua solicitação está sendo analisada pela equipe administrativa.'
            );
            setUserInfo({
              email: userEmail,
              name: undefined,
              submittedAt: new Date().toISOString(),
            });
          } else {
            toast({
              title: 'Erro ao carregar status',
              description: 'Não foi possível verificar o status da sua conta.',
              variant: 'destructive',
            });
          }
        }
      };

      if (userEmail) {
        fetchUserStatus();
      }
    }, [userEmail, toast]);

    const handleResendEmail = async () => {
      if (!userId) {
        toast({
          title: 'Erro',
          description: 'Usuário não identificado.',
          variant: 'destructive',
        });
        return;
      }

      setIsLoading(true);

      try {
        await resendNotificationEmail(userId);

        toast({
          title: 'Notificação enviada!',
          description:
            'Você receberá atualizações sobre o status da sua conta.',
          variant: 'default',
        });
      } catch (error) {
        console.error('Erro ao reenviar notificação:', error);
        toast({
          title: 'Erro ao enviar',
          description:
            'Não foi possível enviar a notificação. Tente novamente.',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    const handleContactSupport = () => {
      // AI dev note: Abrir modal de contato ou redirecionar para suporte
      const subject = encodeURIComponent(
        `Dúvida sobre aprovação - ${userEmail}`
      );
      const body = encodeURIComponent(`
      Olá, tenho uma dúvida sobre o status da minha conta:
      
      Email: ${userEmail}
      Status atual: ${status}
      Data da solicitação: ${userInfo?.submittedAt}
      
      Aguardo retorno.
    `);

      window.open(
        `mailto:suporte@respirakids.com.br?subject=${subject}&body=${body}`
      );
    };

    // AI dev note: Não há mais "handleProceedToComplete" pois o perfil já foi completado
    // antes de chegar nessa tela. Quando is_approved=true, o useAuth redireciona direto pro dashboard.

    // Loading state
    if (!userInfo) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-bege-fundo to-background">
          <div className="text-center space-y-4">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-muted-foreground">Verificando status...</p>
          </div>
        </div>
      );
    }

    return (
      <div
        className={`min-h-screen flex flex-col items-center justify-center p-4 ${className || ''}`}
      >
        <UserApprovalCard
          status={status}
          userInfo={userInfo}
          adminMessage={adminMessage}
          onResendEmail={handleResendEmail}
          onContactSupport={handleContactSupport}
          isLoading={isLoading}
          className="mb-6"
        />

        {/* Navigation Actions */}
        <div className="w-full max-w-md space-y-3">
          {(status === 'rejected' || status === 'expired') && (
            <div className="text-center">
              <button
                type="button"
                onClick={onBackToSignUp}
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
                aria-label="Voltar para cadastro"
              >
                ← Voltar para o cadastro
              </button>
            </div>
          )}

          {status === 'pending' && (
            <div className="text-center text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
              <p>
                <strong>Tempo médio de aprovação:</strong> 1-2 dias úteis
                <br />
                <strong>Horário de funcionamento:</strong> Segunda a Sexta, 8h
                às 18h
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }
);

PendingApprovalPage.displayName = 'PendingApprovalPage';
