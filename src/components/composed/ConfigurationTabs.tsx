import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { RegistrationLogsManagement } from '@/components/domain/admin/RegistrationLogsManagement';
import {
  User,
  Building,
  Settings,
  Zap,
  DollarSign,
  Package,
  Users,
  Shield,
  ScrollText,
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
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState<string>('');

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
      {
        id: 'logs',
        label: 'Logs',
        roles: ['admin'],
        icon: ScrollText,
        content: <RegistrationLogsManagement />,
      },
    ];

    // Filtrar tabs baseadas no role do usuário
    const allowedTabs = tabsConfig.filter((tab) =>
      tab.roles.includes(userRole)
    );

    // Primeira tab como default
    const defaultTab = allowedTabs.length > 0 ? allowedTabs[0].id : '';

    // useEffect para detectar parâmetros da URL e mudar a aba
    // AI dev note: useEffect DEVE estar sempre antes de qualquer return condicional
    useEffect(() => {
      const tabParam = searchParams.get('tab');
      if (tabParam && allowedTabs.some((tab) => tab.id === tabParam)) {
        if (activeTab !== tabParam) {
          setActiveTab(tabParam);
        }
      } else if (!activeTab) {
        setActiveTab(defaultTab);
      }
    }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

    // Função para mudar a aba e atualizar a URL
    const handleTabChange = (value: string) => {
      setActiveTab(value);
      setSearchParams({ tab: value });
    };

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

    return (
      <div className={className}>
        <Tabs
          value={activeTab || defaultTab}
          onValueChange={handleTabChange}
          className="w-full"
        >
          <TabsList
            className="grid w-full gap-1 h-auto p-1"
            style={{
              gridTemplateColumns: `repeat(${allowedTabs.length}, minmax(0, 1fr))`,
            }}
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
