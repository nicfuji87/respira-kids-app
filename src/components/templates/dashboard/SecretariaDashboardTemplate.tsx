import React from 'react';
import { Button } from '@/components/primitives/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { LogOut, Calendar, Users, FileText } from 'lucide-react';

// AI dev note: SecretariaDashboardTemplate - Dashboard simples para role secretaria

export interface SecretariaUser {
  name: string;
  email: string;
  role: 'secretaria';
  avatar?: string;
}

interface SecretariaDashboardTemplateProps {
  currentUser: SecretariaUser;
  onLogout: () => void;
  className?: string;
}

export const SecretariaDashboardTemplate =
  React.memo<SecretariaDashboardTemplateProps>(
    ({ currentUser, onLogout, className }) => {
      return (
        <div
          className={`min-h-screen bg-gradient-to-br from-bege-fundo to-background ${className || ''}`}
        >
          {/* Header */}
          <header className="bg-white border-b shadow-sm">
            <div className="w-full px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center h-16">
                <div className="flex items-center space-x-4">
                  <img
                    src="/public/images/logos/logo-respira-kids.png"
                    alt="Respira Kids"
                    className="h-8 w-auto"
                  />
                  <h1 className="text-xl font-semibold text-roxo-titulo">
                    Dashboard - Secretaria
                  </h1>
                </div>

                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">
                      {currentUser.name}
                    </p>
                    <p className="text-xs text-gray-500">{currentUser.email}</p>
                  </div>

                  <Button
                    onClick={onLogout}
                    variant="outline"
                    size="sm"
                    className="flex items-center space-x-2"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Sair</span>
                  </Button>
                </div>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="w-full py-6 px-4 sm:px-6 lg:px-8">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-roxo-titulo mb-2">
                Bem-vinda, {currentUser.name}!
              </h2>
              <p className="text-muted-foreground">
                Gerencie agendamentos e atendimentos da clínica.
              </p>
            </div>

            {/* Dashboard Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Agendamentos Hoje
                  </CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">12</div>
                  <p className="text-xs text-muted-foreground">
                    +3 desde ontem
                  </p>
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
                  <div className="text-2xl font-bold">89</div>
                  <p className="text-xs text-muted-foreground">
                    +2 novos pacientes
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Documentos Pendentes
                  </CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">5</div>
                  <p className="text-xs text-muted-foreground">
                    Requer atenção
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Ações Rápidas</CardTitle>
                <CardDescription>
                  Funcionalidades principais para secretaria
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Button className="h-20 flex flex-col items-center justify-center space-y-2">
                    <Calendar className="h-6 w-6" />
                    <span>Agendar Consulta</span>
                  </Button>

                  <Button
                    variant="outline"
                    className="h-20 flex flex-col items-center justify-center space-y-2"
                  >
                    <Users className="h-6 w-6" />
                    <span>Cadastrar Paciente</span>
                  </Button>

                  <Button
                    variant="outline"
                    className="h-20 flex flex-col items-center justify-center space-y-2"
                  >
                    <FileText className="h-6 w-6" />
                    <span>Relatórios</span>
                  </Button>

                  <Button
                    variant="outline"
                    className="h-20 flex flex-col items-center justify-center space-y-2"
                  >
                    <LogOut className="h-6 w-6" />
                    <span>Configurações</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </main>
        </div>
      );
    }
  );

SecretariaDashboardTemplate.displayName = 'SecretariaDashboardTemplate';
