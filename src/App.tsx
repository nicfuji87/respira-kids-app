import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  SignUpTemplate,
  AdminDashboardTemplate,
  SecretariaDashboardTemplate,
  ProfissionalDashboardTemplate,
} from '@/components/templates';
import { LoginPage } from '@/components/domain';
import { Toaster } from '@/components/primitives/toaster';
import { signOut } from '@/lib/auth';
import type {
  AdminUser,
  SecretariaUser,
  ProfissionalUser,
} from '@/components/templates';

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

  const handleLogout = async () => {
    try {
      await signOut();
      // Reset estados após logout
      setAuthMode('login');
      setAuthStep('signup');
      setUserEmail('');
    } catch (error) {
      console.error('Erro no logout:', error);
      // Fallback: forçar reload da página
      window.location.reload();
    }
  };

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

  // Roteamento principal baseado no status real do usuário
  if (canAccessDashboard && user?.pessoa) {
    const userRole = user?.pessoa?.role;
    const userName = user?.pessoa?.nome || user?.email || 'Usuário';
    const userEmail = user?.email || '';

    // Direcionar para dashboard baseado no role
    if (userRole === 'admin') {
      const adminUser: AdminUser = {
        name: userName,
        email: userEmail,
        role: 'admin',
        avatar: undefined,
      };
      return (
        <AdminDashboardTemplate
          currentUser={adminUser}
          currentModule="dashboard"
          onModuleChange={() => {}}
          onLogout={handleLogout}
        />
      );
    }

    if (userRole === 'secretaria') {
      const secretariaUser: SecretariaUser = {
        name: userName,
        email: userEmail,
        role: 'secretaria',
        avatar: undefined,
      };
      return (
        <SecretariaDashboardTemplate
          currentUser={secretariaUser}
          onLogout={handleLogout}
        />
      );
    }

    if (userRole === 'profissional') {
      const profissionalUser: ProfissionalUser = {
        name: userName,
        email: userEmail,
        role: 'profissional',
        avatar: undefined,
      };
      return (
        <ProfissionalDashboardTemplate
          currentUser={profissionalUser}
          onLogout={handleLogout}
        />
      );
    }

    // Fallback para admin se role não identificado
    const fallbackUser: AdminUser = {
      name: userName,
      email: userEmail,
      role: 'admin',
      avatar: undefined,
    };
    return (
      <AdminDashboardTemplate
        currentUser={fallbackUser}
        currentModule="dashboard"
        onModuleChange={() => {}}
        onLogout={handleLogout}
      />
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
