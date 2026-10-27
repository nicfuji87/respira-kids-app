import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/primitives/tabs';
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
        // AI dev note: secretaria também é barrada pelo PIN em /financeiro
        // (ver FinanceiroPage), então precisa desta aba para criar/alterar o PIN.
        // Sem ela, uma secretaria sem PIN não tinha onde cadastrar.
        label: 'Segurança',
        roles: ['admin', 'secretaria'],
        icon: Shield,
        content: <PinConfiguration showCard={true} />,
      },
      {
        id: 'integrations',
        label: 'Integrações',
        // secretaria só enxerga a sub-aba WhatsApp (reconectar o celular da recepção)
        roles: ['admin', 'secretaria'],
        icon: Zap,
        content: <IntegrationsTemplate userRole={userRole} />,
      },
      {
        id: 'users',
        label: 'Usuários',
        roles: ['admin', 'secretaria'],
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
          {/* AI dev note: antes usava DevelopmentPlaceholder, que exibia
              "Em desenvolvimento" junto do aviso de acesso restrito */}
          <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-12 text-center">
            <Settings className="h-10 w-10 text-muted-foreground/60" />
            <p className="font-semibold">Acesso restrito</p>
            <p className="text-sm text-muted-foreground">
              Você não tem permissão para acessar nenhuma configuração.
            </p>
          </div>
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
          {/* Nível principal = abas sublinhadas; sub-abas internas ficam no
              controle segmentado. Rola na horizontal no celular. */}
          <TabsList variant="line">
            {allowedTabs.map((tab) => {
              const IconComponent = tab.icon;
              return (
                <TabsTrigger key={tab.id} value={tab.id}>
                  <IconComponent className="h-4 w-4 flex-shrink-0" />
                  <span>{tab.label}</span>
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
