import React from 'react';
import { Shield } from 'lucide-react';
import {
  SignUpPage,
  PendingApprovalPage,
  CompleteProfilePage,
} from '@/components/domain';
import { Button } from '@/components/primitives/button';
import { Toaster } from '@/components/primitives/toaster';
import { cn } from '@/lib/utils';

// AI dev note: SignUpTemplate integrado com useAuth hook do App.tsx
// Gerenciamento de estado agora é feito no App.tsx via useAuth

type AuthStep =
  | 'signup'
  | 'pending-approval'
  | 'email-confirmation'
  | 'complete-profile';

interface SignUpTemplateProps {
  currentStep: AuthStep;
  userEmail?: string;
  onStepChange?: (step: AuthStep) => void;
  onNavigateToLogin?: () => void;
  onUserEmailChange?: (email: string) => void;
  onRefreshUserStatus?: () => Promise<void>;
  className?: string;
}

export const SignUpTemplate = React.memo<SignUpTemplateProps>(
  ({
    currentStep,
    userEmail,
    onStepChange,
    onNavigateToLogin,
    onUserEmailChange,
    onRefreshUserStatus,
    className,
  }) => {
    const handleSignUpSuccess = (data: {
      email: string;
      needsEmailConfirmation: boolean;
    }) => {
      // Atualizar email real do usuário
      if (onUserEmailChange) {
        onUserEmailChange(data.email);
      }

      // useAuth hook irá detectar a mudança de sessão e redirecionar automaticamente
      // Mantendo callback para compatibilidade se necessário
      if (onStepChange) {
        if (data.needsEmailConfirmation) {
          onStepChange('email-confirmation');
        } else {
          onStepChange('pending-approval');
        }
      }
    };

    const handleApprovalComplete = () => {
      // useAuth hook irá detectar a mudança de status e redirecionar automaticamente
      if (onStepChange) {
        onStepChange('complete-profile');
      }
    };

    const handleProfileComplete = async () => {
      // Forçar re-verificação do status do usuário após completar perfil
      console.log('Perfil completado, forçando refresh do useAuth...');

      if (onRefreshUserStatus) {
        await onRefreshUserStatus();
      }
    };

    const handleBackToSignUp = () => {
      if (onStepChange) {
        onStepChange('signup');
      }
    };

    return (
      <div
        className={cn(
          'min-h-screen bg-gradient-to-br from-bege-fundo to-background',
          className
        )}
      >
        {/* Main Content */}
        <main
          className="flex-1 flex items-center justify-center p-4"
          role="main"
        >
          {currentStep === 'signup' && (
            <SignUpPage
              onSignUpSuccess={handleSignUpSuccess}
              onNavigateToLogin={onNavigateToLogin}
            />
          )}

          {currentStep === 'pending-approval' && userEmail && (
            <PendingApprovalPage
              userEmail={userEmail}
              onApprovalComplete={handleApprovalComplete}
              onBackToSignUp={handleBackToSignUp}
            />
          )}

          {currentStep === 'email-confirmation' && (
            <div className="text-center space-y-4 max-w-md mx-auto p-6">
              <div className="w-16 h-16 mx-auto bg-amarelo-pipa/10 rounded-full flex items-center justify-center">
                <Shield className="h-8 w-8 text-amarelo-pipa" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-roxo-titulo mb-2">
                  Confirme seu email
                </h3>
                <p className="text-muted-foreground">
                  Enviamos um link de confirmação para{' '}
                  <strong>{userEmail}</strong>
                </p>
              </div>
              <Button
                onClick={() => onStepChange?.('pending-approval')}
                className="w-full"
              >
                Já confirmei meu email
              </Button>
              <Button
                variant="outline"
                onClick={onNavigateToLogin}
                className="w-full"
              >
                Voltar para login
              </Button>
            </div>
          )}

          {currentStep === 'complete-profile' && (
            <CompleteProfilePage
              onProfileComplete={handleProfileComplete}
              onBackToLogin={onNavigateToLogin}
            />
          )}
        </main>

        {/* Toast Notifications */}
        <Toaster />
      </div>
    );
  }
);

SignUpTemplate.displayName = 'SignUpTemplate';
