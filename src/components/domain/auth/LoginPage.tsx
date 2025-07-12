import React, { useState } from 'react';
import { AuthCard, LoginForm } from '@/components/composed';
import { useToast } from '@/components/primitives/use-toast';
import { signInWithEmail } from '@/lib/auth';

interface LoginFormData {
  email: string;
  password: string;
}

interface LoginPageProps {
  onNavigateToSignUp?: () => void;
  onForgotPassword?: () => void;
  className?: string;
}

export const LoginPage = React.memo<LoginPageProps>(
  ({ onNavigateToSignUp, onForgotPassword, className }) => {
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();

    const handleEmailLogin = async (data: LoginFormData) => {
      setIsLoading(true);

      try {
        await signInWithEmail(data);

        toast({
          title: 'Login realizado com sucesso!',
          description: 'Verificando seu perfil...',
          variant: 'default',
        });

        // useAuth hook irá detectar a mudança de sessão e redirecionar automaticamente
      } catch (error) {
        console.error('Erro no login:', error);
        toast({
          title: 'Erro no login',
          description:
            error instanceof Error
              ? error.message
              : 'Email ou senha incorretos. Tente novamente.',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    const handleForgotPassword = () => {
      if (onForgotPassword) {
        onForgotPassword();
      } else {
        // Fallback para toast informativo
        toast({
          title: 'Esqueceu sua senha?',
          description:
            'Entre em contato com o suporte: suporte@respirakids.com.br',
          variant: 'default',
        });
      }
    };

    return (
      <AuthCard
        title=""
        description="Faça login para acessar o sistema"
        className={className}
        showLogo={true}
      >
        <LoginForm
          onSubmit={handleEmailLogin}
          onForgotPassword={handleForgotPassword}
          isLoading={isLoading}
        />

        {/* Link para Cadastro */}
        <div className="text-center text-sm mt-4">
          <span className="text-muted-foreground">Não tem uma conta? </span>
          <button
            type="button"
            onClick={onNavigateToSignUp}
            disabled={isLoading}
            className="text-primary hover:underline font-medium disabled:opacity-50"
            aria-label="Ir para página de cadastro"
          >
            Faça seu cadastro
          </button>
        </div>
      </AuthCard>
    );
  }
);

LoginPage.displayName = 'LoginPage';
