import React from 'react';
import { Users, UserCheck, UserX, Clock, Shield } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';
import type { UsuarioMetrics } from '@/types/usuarios';
import { cn } from '@/lib/utils';

// AI dev note: UserMetrics combina múltiplos Card primitives com ícones
// Exibe métricas específicas de usuários com layout responsivo

export interface UserMetricsProps {
  metrics: UsuarioMetrics | null;
  loading?: boolean;
  className?: string;
}

export const UserMetrics = React.memo<UserMetricsProps>(
  ({ metrics, loading = false, className }) => {
    if (loading) {
      return (
        <div
          className={cn(
            'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4',
            className
          )}
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-muted rounded w-3/4"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded w-1/2 mb-2"></div>
                <div className="h-3 bg-muted rounded w-full"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      );
    }

    if (!metrics) {
      return null;
    }

    const cards = [
      {
        title: 'Total de Usuários',
        value: metrics.total_usuarios,
        description: 'Usuários cadastrados',
        icon: Users,
        className: 'text-azul-respira border-azul-respira/20 bg-azul-respira/5',
      },
      {
        title: 'Pendentes',
        value: metrics.pendentes_aprovacao,
        description: 'Aguardando aprovação',
        icon: Clock,
        className: 'text-amber-600 border-amber-200 bg-amber-50',
      },
      {
        title: 'Ativos',
        value: metrics.usuarios_ativos,
        description: 'Usuários ativos',
        icon: UserCheck,
        className: 'text-verde-pipa border-verde-pipa/20 bg-verde-pipa/5',
      },
      {
        title: 'Bloqueados',
        value: metrics.usuarios_bloqueados,
        description: 'Usuários bloqueados',
        icon: UserX,
        className: 'text-red-600 border-red-200 bg-red-50',
      },
      {
        title: 'Novos (30d)',
        value: metrics.novos_ultimo_mes,
        description: 'Cadastros recentes',
        icon: Shield,
        className: 'text-purple-600 border-purple-200 bg-purple-50',
      },
    ];

    return (
      <div className={cn('space-y-6', className)}>
        {/* Cards principais */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Card
                key={card.title}
                className={cn('border-l-4', card.className)}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {card.title}
                  </CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{card.value}</div>
                  <CardDescription className="text-xs">
                    {card.description}
                  </CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Métricas por tipo e role */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Por tipo de pessoa */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Por Tipo de Pessoa</CardTitle>
              <CardDescription>
                Distribuição dos usuários por categoria
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {metrics.por_tipo.map((item) => (
                  <div
                    key={item.tipo}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm capitalize">{item.tipo}</span>
                    <Badge variant="outline" className="ml-auto">
                      {item.quantidade}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Por role */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Por Função no Sistema</CardTitle>
              <CardDescription>
                Distribuição dos usuários por role
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {metrics.por_role.map((item) => (
                  <div
                    key={item.role}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm capitalize">
                      {item.role === 'Sem role'
                        ? 'Sem função definida'
                        : item.role}
                    </span>
                    <Badge variant="outline" className="ml-auto">
                      {item.quantidade}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }
);

UserMetrics.displayName = 'UserMetrics';
