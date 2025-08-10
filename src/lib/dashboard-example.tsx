import React from 'react';
import { ResponsiveLayout } from '@/components/templates/dashboard/ResponsiveLayout';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Calendar, Users, FileText, Activity } from 'lucide-react';

// AI dev note: Exemplo de uso do ResponsiveLayout
// Este arquivo demonstra como usar a arquitetura de dashboard implementada

export interface DashboardExampleProps {
  userRole: 'admin' | 'profissional' | 'secretaria';
  userName: string;
  userEmail: string;
  userAvatar?: string;
  onLogout: () => void;
}

export const DashboardExample: React.FC<DashboardExampleProps> = ({
  userRole,
  userName,
  userEmail,
  userAvatar,
  onLogout,
}) => {
  const [currentPath, setCurrentPath] = React.useState('/dashboard');

  const handleNavigation = (path: string) => {
    setCurrentPath(path);
    
  };

  const breadcrumbItems = [{ label: 'Dashboard', href: '/dashboard' }];

  return (
    <ResponsiveLayout
      userName={userName}
      userEmail={userEmail}
      userRole={userRole}
      userAvatar={userAvatar}
      currentPath={currentPath}
      onNavigate={handleNavigation}
      breadcrumbItems={breadcrumbItems}
      notificationCount={3}
      onNotificationClick={() => {}}
      onProfileClick={() => {}}
      onSettingsClick={() => {}}
      onLogout={onLogout}
    >
      <div className="space-y-6">
        {/* Welcome Section */}
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Bem-vindo, {userName}!
          </h1>
          <p className="text-muted-foreground">
            Dashboard para{' '}
            {userRole === 'admin'
              ? 'administrador'
              : userRole === 'profissional'
                ? 'profissional'
                : 'secretária'}
          </p>
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Agendamentos Hoje
              </CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">8</div>
              <p className="text-xs text-muted-foreground">+2 desde ontem</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Pacientes Ativos
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">145</div>
              <p className="text-xs text-muted-foreground">+15 este mês</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Prontuários</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">27</div>
              <p className="text-xs text-muted-foreground">5 pendentes</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sessões</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">1,234</div>
              <p className="text-xs text-muted-foreground">
                +12% desde último mês
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Content based on role */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Módulos Disponíveis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span>Dashboard</span>
                  <span className="text-green-600">✓</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Agenda</span>
                  <span className="text-green-600">✓</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Pacientes</span>
                  <span className="text-green-600">✓</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Estoque</span>
                  <span className="text-green-600">✓</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Financeiro</span>
                  <span className="text-green-600">✓</span>
                </div>
                {userRole === 'admin' && (
                  <>
                    <div className="flex items-center justify-between">
                      <span>Usuários</span>
                      <span className="text-green-600">✓</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Relatórios</span>
                      <span className="text-green-600">✓</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Configurações</span>
                      <span className="text-green-600">✓</span>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Navegação Testada</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  ✓ Layout responsivo (Desktop + Mobile)
                </p>
                <p className="text-sm text-muted-foreground">
                  ✓ Sidebar colapsável
                </p>
                <p className="text-sm text-muted-foreground">
                  ✓ Bottom tabs mobile
                </p>
                <p className="text-sm text-muted-foreground">
                  ✓ Breadcrumb navigation
                </p>
                <p className="text-sm text-muted-foreground">
                  ✓ User profile dropdown
                </p>
                <p className="text-sm text-muted-foreground">
                  ✓ Notification badges
                </p>
                <p className="text-sm text-muted-foreground">
                  ✓ Role-based navigation
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </ResponsiveLayout>
  );
};
