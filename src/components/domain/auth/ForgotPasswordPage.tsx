import React, { useState } from 'react';
import {
  AuthCard,
  ForgotPasswordForm,
  ResetPasswordForm,
} from '@/components/composed';
import { useToast } from '@/components/primitives/use-toast';
import { resetPasswordRequest, updatePassword } from '@/lib/auth';
import { CheckCircle } from 'lucide-react';

// AI dev note: ForgotPasswordPage gerencia fluxo completo de recuperação de senha
// Estados: request-email → email-sent → reset-password (via callback)
// Reutiliza AuthCard e componentes Composed já criados

type ForgotPasswordStep = 'request-email' | 'email-sent' | 'reset-password';

interface ForgotPasswordFormData {
  email: string;
}

interface ResetPasswordFormData {
  password: string;
  confirmPassword: string;
}

interface ForgotPasswordPageProps {
  onNavigateToLogin?: () => void;
  initialStep?: ForgotPasswordStep;
  className?: string;
}

export const ForgotPasswordPage = React.memo<ForgotPasswordPageProps>(
  ({ onNavigateToLogin, initialStep = 'request-email', className }) => {
    const [step, setStep] = useState<ForgotPasswordStep>(initialStep);
    const [isLoading, setIsLoading] = useState(false);
    const [emailUsed, setEmailUsed] = useState<string>('');
    const { toast } = useToast();

    const handleEmailSubmit = async (data: ForgotPasswordFormData) => {
      setIsLoading(true);

      try {
        await resetPasswordRequest(data.email);
        setEmailUsed(data.email);
        setStep('email-sent');

        toast({
          title: 'Email enviado!',
          description: 'Verifique sua caixa de entrada para continuar.',
          variant: 'default',
        });
      } catch (error) {
        console.error('Erro ao solicitar recuperação:', error);
        toast({
          title: 'Erro ao enviar email',
          description:
            error instanceof Error
              ? error.message
              : 'Não foi possível enviar o email. Tente novamente.',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    const handlePasswordReset = async (data: ResetPasswordFormData) => {
      setIsLoading(true);

      try {
        await updatePassword(data.password);

        toast({
          title: 'Senha redefinida com sucesso!',
          description: 'Você pode fazer login com sua nova senha.',
          variant: 'default',
        });

        // Redirecionar para login após sucesso
        if (onNavigateToLogin) {
          setTimeout(onNavigateToLogin, 1500);
        }
      } catch (error) {
        console.error('Erro ao redefinir senha:', error);
        toast({
          title: 'Erro ao redefinir senha',
          description:
            error instanceof Error
              ? error.message
              : 'Não foi possível redefinir a senha. Tente novamente.',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    const renderContent = () => {
      switch (step) {
        case 'request-email':
          return (
            <ForgotPasswordForm
              onSubmit={handleEmailSubmit}
              onBackToLogin={onNavigateToLogin}
              isLoading={isLoading}
            />
          );

        case 'email-sent':
          return (
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-foreground">
                  Email enviado!
                </h3>
                <p className="text-sm text-muted-foreground">
                  Enviamos um link de recuperação para{' '}
                  <strong>{emailUsed}</strong>. Verifique sua caixa de entrada e
                  clique no link para redefinir sua senha.
                </p>
              </div>
              {onNavigateToLogin && (
                <button
                  type="button"
                  onClick={onNavigateToLogin}
                  className="text-sm text-primary hover:underline"
                  aria-label="Voltar para o login"
                >
                  Voltar para o login
                </button>
              )}
            </div>
          );

        case 'reset-password':
          return (
            <ResetPasswordForm
              onSubmit={handlePasswordReset}
              isLoading={isLoading}
            />
          );

        default:
          return null;
      }
    };

    const getTitle = () => {
      switch (step) {
        case 'request-email':
          return 'Recuperar senha';
        case 'email-sent':
          return 'Verifique seu email';
        case 'reset-password':
          return 'Redefinir senha';
        default:
          return 'Recuperar senha';
      }
    };

    const getDescription = () => {
      switch (step) {
        case 'request-email':
          return 'Digite seu email para receber um link de recuperação';
        case 'email-sent':
          return '';
        case 'reset-password':
          return 'Digite sua nova senha';
        default:
          return '';
      }
    };

    return (
      <AuthCard
        title={getTitle()}
        description={getDescription()}
        className={className}
        showLogo={step !== 'email-sent'}
      >
        {renderContent()}
      </AuthCard>
    );
  }
);

ForgotPasswordPage.displayName = 'ForgotPasswordPage';
