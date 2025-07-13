import React, { useState } from 'react';
import { Button } from '@/components/primitives/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Calendar, Users, FileText, Activity } from 'lucide-react';
import { ResponsiveLayout } from './ResponsiveLayout';

// AI dev note: ProfissionalDashboardTemplate - Dashboard responsivo para role profissional
// Usa ResponsiveLayout para alternar entre desktop e mobile

export interface ProfissionalUser {
  name: string;
  email: string;
  role: 'profissional';
  avatar?: string;
}

interface ProfissionalDashboardTemplateProps {
  currentUser: ProfissionalUser;
  onLogout: () => void;
  className?: string;
}

export const ProfissionalDashboardTemplate =
  React.memo<ProfissionalDashboardTemplateProps>(
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
          notificationCount={5}
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
                Acompanhe seus pacientes e sessões de fisioterapia.
              </p>
            </div>

            {/* Dashboard Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Sessões Hoje
                  </CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">8</div>
                  <p className="text-xs text-muted-foreground">
                    2 ainda por atender
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Meus Pacientes
                  </CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">24</div>
                  <p className="text-xs text-muted-foreground">
                    Em acompanhamento
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Prontuários
                  </CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">3</div>
                  <p className="text-xs text-muted-foreground">
                    Pendentes de revisão
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Avaliações
                  </CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">2</div>
                  <p className="text-xs text-muted-foreground">
                    Agendadas esta semana
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Ações Rápidas</CardTitle>
                <CardDescription>
                  Funcionalidades principais para profissionais
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Button
                    className="h-20 flex flex-col items-center justify-center space-y-2"
                    onClick={() => handleNavigation('/prontuarios/novo')}
                  >
                    <FileText className="h-6 w-6" />
                    <span>Novo Prontuário</span>
                  </Button>

                  <Button
                    variant="outline"
                    className="h-20 flex flex-col items-center justify-center space-y-2"
                    onClick={() => handleNavigation('/avaliacoes')}
                  >
                    <Activity className="h-6 w-6" />
                    <span>Avaliação</span>
                  </Button>

                  <Button
                    variant="outline"
                    className="h-20 flex flex-col items-center justify-center space-y-2"
                    onClick={() => handleNavigation('/pacientes')}
                  >
                    <Users className="h-6 w-6" />
                    <span>Meus Pacientes</span>
                  </Button>

                  <Button
                    variant="outline"
                    className="h-20 flex flex-col items-center justify-center space-y-2"
                    onClick={() => handleNavigation('/agenda')}
                  >
                    <Calendar className="h-6 w-6" />
                    <span>Agenda</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </ResponsiveLayout>
      );
    }
  );

ProfissionalDashboardTemplate.displayName = 'ProfissionalDashboardTemplate';
