import React, { useState } from 'react';
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
import {
  Users,
  CheckSquare,
  MapPin,
  CreditCard,
  Wrench,
  FileText,
  Home,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// AI dev note: SystemSettingsTemplate é o template principal para configurações do sistema
// Organiza todas as entidades em abas usando componentes Domain
// Integrações NÃO fica aqui: existe como aba de 1º nível em ConfigurationTabs

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
  ];

  const visibleTabs = tabsConfig;

  return (
    <div className={cn('w-full space-y-6', className)}>
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex w-full overflow-x-auto h-auto p-1 gap-1 md:grid md:grid-cols-7 md:overflow-visible no-scrollbar">
          {visibleTabs.map((tab) => {
            const IconComponent = tab.icon;
            return (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className={cn(
                  'flex flex-col items-center gap-1.5 h-14 text-xs p-2 min-w-[80px] md:min-w-0 flex-1 md:flex-auto',
                  !tab.implemented && 'opacity-70'
                )}
              >
                <IconComponent className="h-4 w-4 flex-shrink-0" />
                <span className="whitespace-nowrap md:whitespace-normal md:truncate text-center leading-tight">
                  {tab.label}
                </span>
                {!tab.implemented && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    Em breve
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {visibleTabs.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="mt-6 space-y-3">
            {/* Descrição da seção ativa */}
            <p className="text-sm text-muted-foreground">{tab.description}</p>
            {tab.content}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

SystemSettingsTemplate.displayName = 'SystemSettingsTemplate';
