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
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Integrações</h1>
        <p className="text-muted-foreground">
          Configure integrações externas e prompts de IA para melhorar a
          funcionalidade do sistema
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 gap-1 h-auto p-1">
          {tabsConfig.map((tab) => {
            const IconComponent = tab.icon;
            return (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex items-center gap-2 h-12 text-sm p-3"
              >
                <IconComponent className="h-4 w-4 flex-shrink-0" />
                <div className="flex flex-col items-start">
                  <span className="font-medium">{tab.label}</span>
                  <span className="text-xs text-muted-foreground hidden md:block">
                    {tab.description}
                  </span>
                </div>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {tabsConfig.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="mt-6">
            {tab.content}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

IntegrationsTemplate.displayName = 'IntegrationsTemplate';
