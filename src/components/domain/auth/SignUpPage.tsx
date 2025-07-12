import React, { useState } from 'react';
import { AuthCard, SignUpForm } from '@/components/composed';
import { useToast } from '@/components/primitives/use-toast';
import { signUpWithEmail } from '@/lib/auth';

interface SignUpFormData {
  email: string;
  password: string;
  confirmPassword: string;
}

interface SignUpPageProps {
  onSignUpSuccess?: (data: {
    email: string;
    needsEmailConfirmation: boolean;
  }) => void;
  onNavigateToLogin?: () => void;
  className?: string;
}

export const SignUpPage = React.memo<SignUpPageProps>(
  ({ onSignUpSuccess, onNavigateToLogin, className }) => {
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();

    const handleEmailSignUp = async (data: SignUpFormData) => {
      setIsLoading(true);

      try {
        const result = await signUpWithEmail(data);

        const needsEmailConfirmation = !result.session;

        toast({
          title: 'Cadastro realizado!',
          description: needsEmailConfirmation
            ? 'Verifique seu email para confirmar sua conta.'
            : 'Sua conta foi criada e está aguardando aprovação.',
          variant: 'default',
        });

        // Callback para navegação
        if (onSignUpSuccess) {
          onSignUpSuccess({
            email: result.user?.email || data.email,
            needsEmailConfirmation,
          });
        }
      } catch (error) {
        console.error('Erro no cadastro:', error);

        toast({
          title: 'Erro no cadastro',
          description:
            error instanceof Error
              ? error.message
              : 'Não foi possível criar sua conta. Tente novamente.',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    return (
      <AuthCard
        title="Bem-vindo à Respira Kids"
        description="Crie sua conta para acessar o sistema de gestão da clínica"
        className={className}
        showLogo={true}
      >
        <SignUpForm onSubmit={handleEmailSignUp} isLoading={isLoading} />

        {/* Link para Login */}
        <div className="text-center text-sm mt-4">
          <span className="text-muted-foreground">Já tem uma conta? </span>
          <button
            type="button"
            onClick={onNavigateToLogin}
            disabled={isLoading}
            className="text-primary hover:underline font-medium disabled:opacity-50"
            aria-label="Ir para página de login"
          >
            Fazer login
          </button>
        </div>
      </AuthCard>
    );
  }
);

SignUpPage.displayName = 'SignUpPage';
