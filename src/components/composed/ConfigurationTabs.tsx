import React from 'react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/primitives/tabs';
import { DevelopmentPlaceholder } from './DevelopmentPlaceholder';
import { MyProfileSection } from '@/components/domain/profile';
import {
  User,
  Building,
  Settings,
  Zap,
  DollarSign,
  Package,
  Users,
} from 'lucide-react';
import type { UserRole } from '@/lib/navigation';

// AI dev note: ConfigurationTabs combina Tabs primitive com controle de acesso por role
// Gerencia as diferentes seções de configuração baseadas em permissões

interface TabConfig {
  id: string;
  label: string;
  roles: UserRole[];
  icon: React.ComponentType<{ className?: string }>;
  content: React.ReactNode;
}

export interface ConfigurationTabsProps {
  userRole: UserRole;
  className?: string;
}

export const ConfigurationTabs = React.memo<ConfigurationTabsProps>(
  ({ userRole, className }) => {
    const tabsConfig: TabConfig[] = [
      {
        id: 'profile',
        label: 'Meu Perfil',
        roles: ['admin', 'profissional', 'secretaria'],
        icon: User,
        content: (
          <MyProfileSection
            userRole={userRole}
            showAllFields={userRole === 'admin'}
          />
        ),
      },
      {
        id: 'company',
        label: 'Empresa',
        roles: ['admin', 'profissional'],
        icon: Building,
        content: (
          <DevelopmentPlaceholder
            title="Empresa"
            description="Configure informações da empresa, dados fiscais e configurações organizacionais."
            icon={<Building className="h-12 w-12 text-primary/50" />}
          />
        ),
      },
      {
        id: 'system',
        label: 'Sistema',
        roles: ['admin'],
        icon: Settings,
        content: (
          <DevelopmentPlaceholder
            title="Sistema"
            description="Configurações gerais do sistema, backup, logs e manutenção."
            icon={<Settings className="h-12 w-12 text-primary/50" />}
          />
        ),
      },
      {
        id: 'integrations',
        label: 'Integrações',
        roles: ['admin', 'profissional', 'secretaria'],
        icon: Zap,
        content: (
          <DevelopmentPlaceholder
            title="Integrações"
            description="Configure integrações com sistemas externos, APIs e webhooks."
            icon={<Zap className="h-12 w-12 text-primary/50" />}
          />
        ),
      },
      {
        id: 'financial',
        label: 'Financeiro',
        roles: ['admin'],
        icon: DollarSign,
        content: (
          <DevelopmentPlaceholder
            title="Financeiro"
            description="Configurações de pagamento, comissões, impostos e relatórios financeiros."
            icon={<DollarSign className="h-12 w-12 text-primary/50" />}
          />
        ),
      },
      {
        id: 'inventory',
        label: 'Estoque',
        roles: ['admin'],
        icon: Package,
        content: (
          <DevelopmentPlaceholder
            title="Estoque"
            description="Gerenciar materiais, fornecedores e controle de estoque."
            icon={<Package className="h-12 w-12 text-primary/50" />}
          />
        ),
      },
      {
        id: 'users',
        label: 'Usuários',
        roles: ['admin'],
        icon: Users,
        content: (
          <DevelopmentPlaceholder
            title="Usuários"
            description="Gerenciar usuários, permissões e controle de acesso ao sistema."
            icon={<Users className="h-12 w-12 text-primary/50" />}
          />
        ),
      },
    ];

    // Filtrar tabs baseadas no role do usuário
    const allowedTabs = tabsConfig.filter((tab) =>
      tab.roles.includes(userRole)
    );

    // Se não há tabs permitidas, mostrar fallback
    if (allowedTabs.length === 0) {
      return (
        <div className={className}>
          <DevelopmentPlaceholder
            title="Acesso Restrito"
            description="Você não tem permissão para acessar nenhuma configuração."
            icon={<Settings className="h-12 w-12 text-destructive/50" />}
          />
        </div>
      );
    }

    // Primeira tab como default
    const defaultTab = allowedTabs[0].id;

    return (
      <div className={className}>
        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList className="grid w-full grid-cols-1 md:grid-cols-7 gap-1 h-auto md:h-9 p-1">
            {allowedTabs.map((tab) => {
              const IconComponent = tab.icon;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="flex items-center gap-2 h-9 text-xs md:text-sm"
                >
                  <IconComponent className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {allowedTabs.map((tab) => (
            <TabsContent key={tab.id} value={tab.id} className="mt-6">
              {tab.content}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    );
  }
);

ConfigurationTabs.displayName = 'ConfigurationTabs';
