import React, { useState, useEffect } from 'react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/primitives/tabs';
import {
  PersonTypesManagement,
  ConsultaStatusManagement,
  PagamentoStatusManagement,
  ServicosManagement,
  LocaisAtendimentoManagement,
  EnderecoManagement,
  ContractTemplateManagement,
} from '@/components/domain/system';
import { IntegrationsTemplate } from '@/components/templates/integrations';
import {
  Users,
  CheckSquare,
  MapPin,
  CreditCard,
  Wrench,
  FileText,
  Home,
  Plug,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { checkAdminRole } from '@/lib/integrations-api';

// AI dev note: SystemSettingsTemplate é o template principal para configurações do sistema
// Organiza todas as entidades em abas usando componentes Domain

interface TabConfig {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  content: React.ReactNode;
  implemented: boolean;
}

export interface SystemSettingsTemplateProps {
  className?: string;
}

export const SystemSettingsTemplate: React.FC<SystemSettingsTemplateProps> = ({
  className,
}) => {
  const [activeTab, setActiveTab] = useState('pessoa-tipos');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkRole = async () => {
      const adminResult = await checkAdminRole();
      setIsAdmin(adminResult.success && adminResult.data === true);
    };
    checkRole();
  }, []);

  const tabsConfig: TabConfig[] = [
    {
      id: 'pessoa-tipos',
      label: 'Pessoas',
      icon: Users,
      description: 'Categorizar tipos de pessoas no sistema',
      content: <PersonTypesManagement />,
      implemented: true,
    },
    {
      id: 'locais',
      label: 'Locais',
      icon: MapPin,
      description: 'Gerenciar locais onde os atendimentos são realizados',
      content: <LocaisAtendimentoManagement />,
      implemented: true,
    },
    {
      id: 'enderecos',
      label: 'Endereços',
      icon: Home,
      description: 'Gerenciar endereços utilizados no sistema',
      content: <EnderecoManagement />,
      implemented: true,
    },
    {
      id: 'servicos',
      label: 'Serviços',
      icon: Wrench,
      description:
        'Configurar serviços oferecidos e comissões dos profissionais',
      content: <ServicosManagement />,
      implemented: true,
    },
    {
      id: 'status-consulta',
      label: 'Consultas',
      icon: CheckSquare,
      description: 'Definir status possíveis para consultas',
      content: <ConsultaStatusManagement />,
      implemented: true,
    },
    {
      id: 'status-pagamento',
      label: 'Pagamentos',
      icon: CreditCard,
      description: 'Definir status possíveis para pagamentos',
      content: <PagamentoStatusManagement />,
      implemented: true,
    },
    {
      id: 'contratos',
      label: 'Contratos',
      icon: FileText,
      description: 'Gerenciar modelos de contratos editáveis',
      content: <ContractTemplateManagement />,
      implemented: true,
    },
    ...(isAdmin
      ? [
          {
            id: 'integracoes',
            label: 'Integrações',
            icon: Plug,
            description: 'Configurar integrações com outros sistemas',
            content: <IntegrationsTemplate />,
            implemented: true,
          },
        ]
      : []),
  ];

  // Filtrar abas visíveis baseado no role
  const visibleTabs = tabsConfig.filter(
    (tab) => tab.id !== 'integracoes' || isAdmin
  );

  return (
    <div className={cn('w-full space-y-6', className)}>
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList
          className={`grid w-full gap-1 h-auto p-1`}
          style={{
            gridTemplateColumns: `repeat(${visibleTabs.length}, minmax(0, 1fr))`,
          }}
        >
          {visibleTabs.map((tab) => {
            const IconComponent = tab.icon;
            return (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className={cn(
                  'flex flex-col items-center gap-1.5 h-14 text-xs p-2',
                  !tab.implemented && 'opacity-70'
                )}
              >
                <IconComponent className="h-4 w-4 flex-shrink-0" />
                <span className="truncate text-center leading-tight">
                  {tab.label}
                </span>
                {!tab.implemented && (
                  <span className="text-xs text-muted-foreground">
                    Em breve
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {visibleTabs.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="mt-6">
            {/* Tab content */}
            {tab.content}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

SystemSettingsTemplate.displayName = 'SystemSettingsTemplate';
