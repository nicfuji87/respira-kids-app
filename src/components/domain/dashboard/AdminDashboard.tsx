import React from 'react';
import {
  Users,
  Calendar,
  FileText,
  Package,
  DollarSign,
  Bell,
  Settings,
  Activity,
  TrendingUp,
  Clock,
} from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import { Progress } from '@/components/primitives/progress';
import { Separator } from '@/components/primitives/separator';
import { cn } from '@/lib/utils';

// AI dev note: AdminDashboard é específico para role admin da clínica Respira Kids
// Interface completa de gestão com métricas, notificações e ações rápidas

interface AdminDashboardProps {
  className?: string;
  onNavigateToModule?: (module: string) => void;
}

// AI dev note: Dados simulados - em produção virão do Supabase
const mockData = {
  stats: {
    totalPatients: 847,
    monthlyAppointments: 142,
    pendingApprovals: 8,
    monthlyRevenue: 89750.5,
    equipmentAlerts: 3,
    activeStaff: 12,
  },
  recentActivity: [
    {
      id: 1,
      type: 'appointment',
      message: 'Nova consulta agendada - João Silva',
      time: '5 min atrás',
    },
    {
      id: 2,
      type: 'approval',
      message: 'Solicitação de aprovação - Maria Santos',
      time: '12 min atrás',
    },
    {
      id: 3,
      type: 'payment',
      message: 'Pagamento recebido - R$ 350,00',
      time: '25 min atrás',
    },
    {
      id: 4,
      type: 'equipment',
      message: 'Manutenção programada - Nebulizador #003',
      time: '1h atrás',
    },
  ],
  monthlyGoal: {
    current: 142,
    target: 180,
    percentage: 78.9,
  },
};

export const AdminDashboard = React.memo<AdminDashboardProps>(
  ({ className, onNavigateToModule }) => {
    const handleModuleClick = (module: string) => {
      if (onNavigateToModule) {
        onNavigateToModule(module);
      }
    };

    const quickActions = [
      {
        id: 'agenda',
        title: 'Agenda',
        description: 'Gerenciar consultas',
        icon: Calendar,
        color: 'text-azul-respira',
        bgColor: 'bg-azul-respira/10',
        count: mockData.stats.monthlyAppointments,
      },
      {
        id: 'patients',
        title: 'Pacientes',
        description: 'Prontuários eletrônicos',
        icon: Users,
        color: 'text-verde-pipa',
        bgColor: 'bg-verde-pipa/10',
        count: mockData.stats.totalPatients,
      },
      {
        id: 'approvals',
        title: 'Aprovações',
        description: 'Pendentes de liberação',
        icon: FileText,
        color: 'text-amarelo-pipa',
        bgColor: 'bg-amarelo-pipa/10',
        count: mockData.stats.pendingApprovals,
        urgent: mockData.stats.pendingApprovals > 5,
      },
      {
        id: 'stock',
        title: 'Estoque',
        description: 'Equipamentos e suprimentos',
        icon: Package,
        color: 'text-vermelho-kids',
        bgColor: 'bg-vermelho-kids/10',
        count: mockData.stats.equipmentAlerts,
        urgent: mockData.stats.equipmentAlerts > 0,
      },
      {
        id: 'financial',
        title: 'Financeiro',
        description: 'Faturamento e pagamentos',
        icon: DollarSign,
        color: 'text-roxo-titulo',
        bgColor: 'bg-roxo-titulo/10',
        value: `R$ ${mockData.stats.monthlyRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      },
      {
        id: 'settings',
        title: 'Configurações',
        description: 'Sistema e usuários',
        icon: Settings,
        color: 'text-cinza-secundario',
        bgColor: 'bg-cinza-secundario/10',
        count: mockData.stats.activeStaff,
      },
    ];

    return (
      <div className={cn('space-y-6 p-6', className)}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-roxo-titulo respira-text-gradient">
              Dashboard Administrativo
            </h1>
            <p className="text-muted-foreground mt-1">
              Visão geral da Clínica Respira Kids
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" className="gap-2">
              <Bell className="h-4 w-4" />
              {mockData.stats.pendingApprovals +
                mockData.stats.equipmentAlerts}{' '}
              pendentes
            </Button>
            <Button size="sm" className="respira-gradient">
              <Activity className="h-4 w-4 mr-2" />
              Relatório Geral
            </Button>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Card
                key={action.id}
                className={cn(
                  'relative cursor-pointer border-border/20 hover:shadow-lg transition-all duration-200',
                  'hover:border-primary/20 hover:-translate-y-1'
                )}
                onClick={() => handleModuleClick(action.id)}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-foreground">
                    {action.title}
                  </CardTitle>
                  <div className={cn('p-2 rounded-lg', action.bgColor)}>
                    <Icon className={cn('h-4 w-4', action.color)} />
                  </div>
                </CardHeader>

                <CardContent>
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-2xl font-bold text-foreground">
                        {action.value || action.count}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {action.description}
                      </p>
                    </div>

                    {action.urgent && (
                      <Badge variant="destructive" className="text-xs">
                        Urgente
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Monthly Goal Progress */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-verde-pipa" />
                Meta Mensal de Consultas
              </CardTitle>
              <CardDescription>
                Progresso do mês atual - Meta: {mockData.monthlyGoal.target}{' '}
                consultas
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progresso</span>
                <span className="font-medium">
                  {mockData.monthlyGoal.current} / {mockData.monthlyGoal.target}
                </span>
              </div>

              <Progress
                value={mockData.monthlyGoal.percentage}
                className="h-3"
              />

              <div className="flex items-center justify-between text-sm">
                <span className="text-verde-pipa font-medium">
                  {mockData.monthlyGoal.percentage.toFixed(1)}% concluído
                </span>
                <span className="text-muted-foreground">
                  {mockData.monthlyGoal.target - mockData.monthlyGoal.current}{' '}
                  restantes
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-azul-respira" />
                Atividade Recente
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              {mockData.recentActivity.map((activity, index) => (
                <div key={activity.id}>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {activity.message}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {activity.time}
                    </p>
                  </div>
                  {index < mockData.recentActivity.length - 1 && (
                    <Separator className="mt-4" />
                  )}
                </div>
              ))}

              <Button
                variant="ghost"
                size="sm"
                className="w-full mt-4"
                onClick={() => handleModuleClick('activity')}
              >
                Ver todas as atividades
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions Footer */}
        <Card>
          <CardHeader>
            <CardTitle>Ações Rápidas</CardTitle>
            <CardDescription>
              Acesso direto às principais funcionalidades do sistema
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Button
                variant="outline"
                className="h-20 flex-col gap-2"
                onClick={() => handleModuleClick('new-patient')}
              >
                <Users className="h-5 w-5" />
                <span className="text-xs">Novo Paciente</span>
              </Button>

              <Button
                variant="outline"
                className="h-20 flex-col gap-2"
                onClick={() => handleModuleClick('schedule')}
              >
                <Calendar className="h-5 w-5" />
                <span className="text-xs">Agendar Consulta</span>
              </Button>

              <Button
                variant="outline"
                className="h-20 flex-col gap-2"
                onClick={() => handleModuleClick('reports')}
              >
                <FileText className="h-5 w-5" />
                <span className="text-xs">Relatórios</span>
              </Button>

              <Button
                variant="outline"
                className="h-20 flex-col gap-2"
                onClick={() => handleModuleClick('backup')}
              >
                <Package className="h-5 w-5" />
                <span className="text-xs">Backup</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
);

AdminDashboard.displayName = 'AdminDashboard';
