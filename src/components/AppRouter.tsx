import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useNavigation } from '@/hooks/useNavigation';
import { ResponsiveLayout } from '@/components/templates/dashboard/ResponsiveLayout';
import { hasAccessToRoute, type UserRole } from '@/lib/navigation';
import { signOut } from '@/lib/auth';
import {
  DashboardPage,
  AgendaPage,
  PacientesPage,
  EstoquePage,
  FinanceiroPage,
  ConfiguracoesPage,
  UsuariosPage,
  RelatoriosPage,
  WebhooksPage,
} from '@/pages';

// AI dev note: AppRouter - Roteamento principal da aplicação
// Integra React Router com sistema de autenticação e permissões

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string;
  currentUserRole?: UserRole;
  path: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  currentUserRole,
  path,
}) => {
  // AI dev note: Simplificado - apenas verifica role, não canAccessDashboard (já verificado em App.tsx)
  if (!currentUserRole || !hasAccessToRoute(path, currentUserRole)) {
    console.log(
      '🚫 ProtectedRoute: Acesso negado para',
      path,
      'com role',
      currentUserRole
    );
    return <Navigate to="/dashboard" replace />;
  }

  console.log(
    '✅ ProtectedRoute: Acesso permitido para',
    path,
    'com role',
    currentUserRole
  );
  return <>{children}</>;
};

export const AppRouter: React.FC = () => {
  const { user, loading, canAccessDashboard } = useAuth();
  const userRole = user?.pessoa?.role as
    | 'admin'
    | 'profissional'
    | 'secretaria'
    | undefined;
  const userName = user?.pessoa?.nome || user?.email || 'Usuário';
  const userEmail = user?.email || '';

  // AI dev note: Verificação de tipo segura para UserRole
  const validUserRole =
    userRole && ['admin', 'profissional', 'secretaria'].includes(userRole)
      ? (userRole as UserRole)
      : undefined;

  const { currentPath, navigateTo, breadcrumbItems } =
    useNavigation(validUserRole);

  // AI dev note: Só mostrar loading se realmente estiver carregando pela primeira vez
  // Se user existe e canAccessDashboard=true, não precisamos aguardar userRole para navegação
  console.log(
    '🔄 AppRouter: Renderizando com userRole:',
    userRole,
    'currentPath:',
    currentPath
  );

  if (loading && !canAccessDashboard) {
    console.log('⏳ AppRouter: Carregando dados iniciais do usuário...');
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

  // AI dev note: Log adicional para debug de navegação
  console.log(
    '🎯 AppRouter: Estado final - validUserRole:',
    validUserRole,
    'loading:',
    loading
  );

  const handleLogout = async () => {
    try {
      // AI dev note: Logout real do Supabase + cleanup de cache local
      await signOut();

      // Cleanup adicional: limpar localStorage/sessionStorage
      localStorage.clear();
      sessionStorage.clear();

      // Redirecionar para home
      window.location.href = '/';
    } catch (error) {
      console.error('❌ Erro no logout:', error);
      // Redirecionar mesmo se logout falhar
      window.location.href = '/';
    }
  };

  return (
    <ResponsiveLayout
      userName={userName}
      userEmail={userEmail}
      userRole={validUserRole || 'admin'}
      userAvatar={user?.pessoa?.foto_perfil || undefined}
      currentPath={currentPath}
      onNavigate={navigateTo}
      breadcrumbItems={breadcrumbItems}
      notificationCount={3}
      onNotificationClick={() => console.log('Notificações')}
      onProfileClick={() => console.log('Perfil')}
      onSettingsClick={() => navigateTo('/configuracoes')}
      onLogout={handleLogout}
    >
      <Routes>
        {/* Dashboard - rota padrão */}
        <Route path="/dashboard" element={<DashboardPage />} />

        {/* Rotas comuns a todos os roles */}
        <Route
          path="/agenda"
          element={
            <ProtectedRoute path="/agenda" currentUserRole={validUserRole}>
              <AgendaPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/pacientes"
          element={
            <ProtectedRoute path="/pacientes" currentUserRole={validUserRole}>
              <PacientesPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/estoque"
          element={
            <ProtectedRoute path="/estoque" currentUserRole={validUserRole}>
              <EstoquePage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/financeiro"
          element={
            <ProtectedRoute path="/financeiro" currentUserRole={validUserRole}>
              <FinanceiroPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/configuracoes"
          element={
            <ProtectedRoute
              path="/configuracoes"
              currentUserRole={validUserRole}
            >
              <ConfiguracoesPage />
            </ProtectedRoute>
          }
        />

        {/* Rotas admin apenas */}
        <Route
          path="/usuarios"
          element={
            <ProtectedRoute path="/usuarios" currentUserRole={validUserRole}>
              <UsuariosPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/relatorios"
          element={
            <ProtectedRoute path="/relatorios" currentUserRole={validUserRole}>
              <RelatoriosPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/webhooks"
          element={
            <ProtectedRoute path="/webhooks" currentUserRole={validUserRole}>
              <WebhooksPage />
            </ProtectedRoute>
          }
        />

        {/* Redirecionamentos */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </ResponsiveLayout>
  );
};
