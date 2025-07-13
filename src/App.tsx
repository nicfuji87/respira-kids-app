import { useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { SignUpTemplate } from '@/components/templates';
import { LoginPage } from '@/components/domain';
import { AppRouter } from '@/components/AppRouter';
import { Toaster } from '@/components/primitives/toaster';

type AuthMode = 'login' | 'signup';
type AuthStep =
  | 'signup'
  | 'pending-approval'
  | 'email-confirmation'
  | 'complete-profile';

function App() {
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
        <BrowserRouter>
          <AppRouter />
          <Toaster />
        </BrowserRouter>
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
      <BrowserRouter>
        <AppRouter />
        <Toaster />
      </BrowserRouter>
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
            // Implementar lógica de esqueceu senha
            console.log('Esqueceu senha');
          }}
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
          // Implementar lógica de esqueceu senha
          console.log('Esqueceu senha');
        }}
      />
      <Toaster />
    </div>
  );
}

export default App;
