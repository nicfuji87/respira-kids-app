import React from 'react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/primitives/tabs';
import { DevelopmentPlaceholder } from './DevelopmentPlaceholder';
import { MyProfileSection } from '@/components/domain/profile';
import { CompanyForm } from './CompanyForm';
import { UserManagement } from '@/components/domain/users';
import { IntegrationsTemplate } from '@/components/templates/integrations';
import { PinConfiguration } from './PinConfiguration';
import { SystemSettingsTemplate } from '@/components/templates/system/SystemSettingsTemplate';
import {
  User,
  Building,
  Settings,
  Zap,
  DollarSign,
  Package,
  Users,
  Shield,
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
        roles: ['admin', 'profissional', 'secretaria'],
        icon: Building,
        content: <CompanyForm />,
      },
      {
        id: 'system',
        label: 'Sistema',
        roles: ['admin'],
        icon: Settings,
        content: <SystemSettingsTemplate />,
      },
      {
        id: 'security',
        label: 'Segurança',
        roles: ['admin'],
        icon: Shield,
        content: <PinConfiguration showCard={true} />,
      },
      {
        id: 'integrations',
        label: 'Integrações',
        roles: ['admin'],
        icon: Zap,
        content: <IntegrationsTemplate />,
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
        content: <UserManagement />,
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

    // Grid dinâmico baseado no número de abas disponíveis
    const getGridCols = (tabCount: number) => {
      if (tabCount <= 3) return 'grid-cols-1 md:grid-cols-3';
      if (tabCount <= 4) return 'grid-cols-2 md:grid-cols-4';
      if (tabCount <= 5) return 'grid-cols-2 md:grid-cols-5';
      if (tabCount <= 6) return 'grid-cols-3 md:grid-cols-6';
      // Para 7 abas, usar um layout que funcione bem
      return 'grid-cols-3 md:grid-cols-4 lg:grid-cols-7';
    };

    return (
      <div className={className}>
        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList
            className={`grid w-full ${getGridCols(allowedTabs.length)} gap-1 h-auto md:h-9 p-1`}
          >
            {allowedTabs.map((tab) => {
              const IconComponent = tab.icon;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="flex items-center gap-1 h-9 text-xs md:text-sm px-2"
                >
                  <IconComponent className="h-3 w-3 md:h-4 md:w-4 flex-shrink-0" />
                  <span className="truncate max-w-[60px] md:max-w-[80px] lg:max-w-full">
                    {tab.label}
                  </span>
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
