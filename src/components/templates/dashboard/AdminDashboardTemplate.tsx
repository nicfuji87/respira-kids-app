import React, { useState } from 'react';
import { Button } from '@/components/primitives/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import {
  Calendar,
  Users,
  DollarSign,
  UserCheck,
  BarChart3,
} from 'lucide-react';
import { ResponsiveLayout } from './ResponsiveLayout';

// AI dev note: AdminDashboardTemplate - Dashboard responsivo para role admin
// Usa ResponsiveLayout para alternar entre desktop e mobile
// Baseado no ProfissionalDashboardTemplate mas com métricas administrativas

export interface AdminUser {
  name: string;
  email: string;
  role: 'admin';
  avatar?: string;
}

interface AdminDashboardTemplateProps {
  currentUser: AdminUser;
  onLogout: () => void;
  className?: string;
}

export const AdminDashboardTemplate = React.memo<AdminDashboardTemplateProps>(
  ({ currentUser, onLogout, className }) => {
    const [currentPath, setCurrentPath] = useState('/dashboard');

    const handleNavigation = (path: string) => {
      setCurrentPath(path);
      // Aqui você implementaria a navegação real
      console.log('Navegando para:', path);
    };

    const breadcrumbItems = [{ label: 'Dashboard', href: '/dashboard' }];

    return (
      <ResponsiveLayout
        userName={currentUser.name}
        userEmail={currentUser.email}
        userRole={currentUser.role}
        userAvatar={currentUser.avatar}
        currentPath={currentPath}
        onNavigate={handleNavigation}
        breadcrumbItems={breadcrumbItems}
        notificationCount={8} // Aprovações pendentes
        onNotificationClick={() => console.log('Notificações')}
        onProfileClick={() => console.log('Perfil')}
        onSettingsClick={() => console.log('Configurações')}
        onLogout={onLogout}
        className={className}
      >
        <div className="space-y-6">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Bem-vindo, {currentUser.name}!
            </h2>
            <p className="text-muted-foreground">
              Gerencie a clínica e acompanhe métricas administrativas.
            </p>
          </div>

          {/* Dashboard Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Agendamentos Hoje
                </CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">23</div>
                <p className="text-xs text-muted-foreground">
                  Todos os profissionais
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Pacientes
                </CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">847</div>
                <p className="text-xs text-muted-foreground">
                  Ativos no sistema
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Aprovações Pendentes
                </CardTitle>
                <UserCheck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">8</div>
                <p className="text-xs text-muted-foreground">
                  Usuários aguardando
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Receita Mensal
                </CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">R$ 89.750</div>
                <p className="text-xs text-muted-foreground">Meta: R$ 95.000</p>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Ações Rápidas</CardTitle>
              <CardDescription>
                Funcionalidades principais para administradores
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Button
                  className="h-20 flex flex-col items-center justify-center space-y-2"
                  onClick={() => handleNavigation('/usuarios')}
                >
                  <UserCheck className="h-6 w-6" />
                  <span>Aprovar Usuários</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-20 flex flex-col items-center justify-center space-y-2"
                  onClick={() => handleNavigation('/agenda')}
                >
                  <Calendar className="h-6 w-6" />
                  <span>Novo Agendamento</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-20 flex flex-col items-center justify-center space-y-2"
                  onClick={() => handleNavigation('/pacientes')}
                >
                  <Users className="h-6 w-6" />
                  <span>Gerenciar Pacientes</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-20 flex flex-col items-center justify-center space-y-2"
                  onClick={() => handleNavigation('/relatorios')}
                >
                  <BarChart3 className="h-6 w-6" />
                  <span>Relatórios</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </ResponsiveLayout>
    );
  }
);

AdminDashboardTemplate.displayName = 'AdminDashboardTemplate';
