import { useState, useEffect } from 'react';
import { HashRouter } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { SignUpTemplate } from '@/components/templates';
import { LoginPage, ForgotPasswordPage } from '@/components/domain';
import { AppRouter } from '@/components/AppRouter';
import { PublicRouter } from '@/components/PublicRouter';
import { Toaster } from '@/components/primitives/toaster';

type AuthMode = 'login' | 'signup' | 'forgot-password';
type AuthStep =
  | 'signup'
  | 'pending-approval'
  | 'email-confirmation'
  | 'complete-profile';

function App() {
  // AI dev note: Verificar rota pública dinamicamente (reage a mudanças na URL)
  // Rotas públicas (ex: /cadastro-paciente, /adicionar-responsavel-financeiro, /agenda-publica/:token) não requerem autenticação
  const [isPublicRoute, setIsPublicRoute] = useState(() => {
    const hash = window.location.hash;
    return (
      hash.startsWith('#/cadastro-paciente') ||
      hash.startsWith('#/adicionar-responsavel-financeiro') ||
      hash.startsWith('#/agenda-publica/')
    );
  });

  // Monitorar mudanças no hash para atualizar isPublicRoute
  useEffect(() => {
    const checkPublicRoute = () => {
      const hash = window.location.hash;
      const isPublic =
        hash.startsWith('#/cadastro-paciente') ||
        hash.startsWith('#/adicionar-responsavel-financeiro') ||
        hash.startsWith('#/agenda-publica/');
      console.log('🔍 [App] Verificando rota pública:', hash, '→', isPublic);
      setIsPublicRoute(isPublic);
    };

    // Verificar imediatamente
    checkPublicRoute();

    // Escutar mudanças no hash
    window.addEventListener('hashchange', checkPublicRoute);
    return () => window.removeEventListener('hashchange', checkPublicRoute);
  }, []);

  const {
    loading,
    isAuthenticated,
    needsEmailConfirmation,
    needsApproval,
    needsProfileCompletion,
    canAccessDashboard,
    user,
    refreshUserStatus,
  } = useAuth();

  // Estados para controle de fluxo de autenticação
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [authStep, setAuthStep] = useState<AuthStep>('signup');
  const [userEmail, setUserEmail] = useState<string>('');
  const [resetPasswordStep, setResetPasswordStep] = useState<
    'request-email' | 'email-sent' | 'reset-password'
  >('request-email');

  // AI dev note: Detectar callback de reset de senha via URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const type = urlParams.get('type');

    if (type === 'recovery') {
      setAuthMode('forgot-password');
      setResetPasswordStep('reset-password');

      // Limpar URL após detectar callback
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // AI dev note: Renderizar rotas públicas SEM autenticação
  // Cadastro de paciente é público e não requer login
  if (isPublicRoute) {
    console.log(
      '✅ [App] Renderizando PublicRouter para rota:',
      window.location.hash
    );
    return <PublicRouter />;
  }

  console.log('🔒 [App] Rota privada detectada, verificando autenticação...');

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-bege-fundo to-background flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  // AI dev note: Verificação melhorada - garantir que pessoa e role estão disponíveis
  // Isso evita race condition onde AppRouter renderiza com userRole undefined
  if (
    isAuthenticated &&
    user &&
    !needsEmailConfirmation &&
    !needsApproval &&
    !needsProfileCompletion
  ) {
    if (canAccessDashboard && user?.pessoa?.role) {
      console.log('✅ App: Renderizando AppRouter com role:', user.pessoa.role);
      return (
        <HashRouter>
          <AppRouter />
          <Toaster />
        </HashRouter>
      );
    } else if (canAccessDashboard && user?.pessoa && !user?.pessoa?.role) {
      // Estado transitório: pessoa existe mas role ainda não
      console.log('⏳ App: Aguardando role estar disponível...');
      return (
        <div className="min-h-screen bg-gradient-to-br from-bege-fundo to-background flex items-center justify-center p-4">
          <div className="text-center space-y-4">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-muted-foreground">
              Carregando perfil do usuário...
            </p>
          </div>
        </div>
      );
    } else {
      // Usuário autenticado mas dados da pessoa não carregaram ainda
      return (
        <div className="min-h-screen bg-gradient-to-br from-bege-fundo to-background flex items-center justify-center p-4">
          <div className="text-center space-y-4">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-muted-foreground">
              Carregando dados do usuário...
            </p>
          </div>
        </div>
      );
    }
  }

  // Roteamento principal baseado no status real do usuário
  if (canAccessDashboard && user?.pessoa?.role) {
    console.log(
      '✅ App: Renderizando AppRouter com role (check 2):',
      user.pessoa.role
    );
    return (
      <HashRouter>
        <AppRouter />
        <Toaster />
      </HashRouter>
    );
  }

  // Usuário autenticado mas precisa de aprovação
  if (isAuthenticated && needsApproval) {
    return (
      <SignUpTemplate
        currentStep="pending-approval"
        userEmail={user?.email || userEmail}
        onStepChange={setAuthStep}
        onNavigateToLogin={() => setAuthMode('login')}
        onUserEmailChange={setUserEmail}
      />
    );
  }

  // Usuário autenticado mas precisa completar perfil
  if (isAuthenticated && needsProfileCompletion) {
    return (
      <SignUpTemplate
        currentStep="complete-profile"
        userEmail={user?.email || userEmail}
        onStepChange={setAuthStep}
        onNavigateToLogin={() => setAuthMode('login')}
        onUserEmailChange={setUserEmail}
        onRefreshUserStatus={refreshUserStatus}
      />
    );
  }

  // Usuário autenticado mas precisa confirmar email
  if (isAuthenticated && needsEmailConfirmation) {
    return (
      <SignUpTemplate
        currentStep="email-confirmation"
        userEmail={user?.email || userEmail}
        onStepChange={setAuthStep}
        onNavigateToLogin={() => setAuthMode('login')}
        onUserEmailChange={setUserEmail}
      />
    );
  }

  // Fluxo de autenticação (login/signup)
  if (authMode === 'login') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-bege-fundo to-background flex items-center justify-center p-4">
        <LoginPage
          onNavigateToSignUp={() => setAuthMode('signup')}
          onForgotPassword={() => {
            setAuthMode('forgot-password');
            setResetPasswordStep('request-email');
          }}
        />
        <Toaster />
      </div>
    );
  }

  // Fluxo de recuperação de senha
  if (authMode === 'forgot-password') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-bege-fundo to-background flex items-center justify-center p-4">
        <ForgotPasswordPage
          onNavigateToLogin={() => {
            setAuthMode('login');
            setResetPasswordStep('request-email');
          }}
          initialStep={resetPasswordStep}
        />
        <Toaster />
      </div>
    );
  }

  // Fluxo de cadastro
  if (authMode === 'signup') {
    return (
      <SignUpTemplate
        currentStep={authStep}
        userEmail={userEmail}
        onStepChange={setAuthStep}
        onNavigateToLogin={() => setAuthMode('login')}
        onUserEmailChange={setUserEmail}
      />
    );
  }

  // Fallback para tela de login
  return (
    <div className="min-h-screen bg-gradient-to-br from-bege-fundo to-background flex items-center justify-center p-4">
      <LoginPage
        onNavigateToSignUp={() => setAuthMode('signup')}
        onForgotPassword={() => {
          setAuthMode('forgot-password');
          setResetPasswordStep('request-email');
        }}
      />
      <Toaster />
    </div>
  );
}

export default App;
