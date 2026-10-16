import React, { useState } from 'react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/primitives/tabs';
import {
  ApiKeysManagement,
  PromptsManagement,
} from '@/components/domain/integrations';
import { Key, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

// AI dev note: IntegrationsTemplate é o template principal para integrações
// Organiza gestão de chaves de API e prompts em abas separadas

interface TabConfig {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  content: React.ReactNode;
}

export interface IntegrationsTemplateProps {
  className?: string;
}

export const IntegrationsTemplate: React.FC<IntegrationsTemplateProps> = ({
  className,
}) => {
  const [activeTab, setActiveTab] = useState('api-keys');

  const tabsConfig: TabConfig[] = [
    {
      id: 'api-keys',
      label: 'Chaves de API',
      icon: Key,
      description: 'Configure integrações com serviços externos',
      content: <ApiKeysManagement />,
    },
    {
      id: 'prompts',
      label: 'Prompts',
      icon: MessageSquare,
      description: 'Gerencie prompts para processamento de IA',
      content: <PromptsManagement />,
    },
  ];

  return (
    <div className={cn('w-full space-y-6', className)}>
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        {/* A descrição de cada aba já é o título/descrição do card de baixo */}
        <TabsList>
          {tabsConfig.map((tab) => {
            const IconComponent = tab.icon;
            return (
              <TabsTrigger key={tab.id} value={tab.id}>
                <IconComponent />
                {tab.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {tabsConfig.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="mt-4">
            {tab.content}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

IntegrationsTemplate.displayName = 'IntegrationsTemplate';
