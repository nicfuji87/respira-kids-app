import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/primitives/tabs';
import {
  ApiKeysManagement,
  BoletosEmailManagement,
  PromptsManagement,
  WhatsAppConexoesManagement,
} from '@/components/domain/integrations';
import { Key, Mail, MessageSquare, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/lib/navigation';

// AI dev note: IntegrationsTemplate é o template principal para integrações
// Organiza gestão de chaves de API e prompts em abas separadas.
// A secretaria só vê a sub-aba WhatsApp; o resto é do admin.

interface TabConfig {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  roles: UserRole[];
  content: React.ReactNode;
}

export interface IntegrationsTemplateProps {
  userRole?: UserRole;
  className?: string;
}

export const IntegrationsTemplate: React.FC<IntegrationsTemplateProps> = ({
  userRole = 'admin',
  className,
}) => {
  // ?secao=boletos: volta do login do Google ao conectar uma caixa de e-mail
  // ?secao=whatsapp: link direto para reconectar o WhatsApp
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => {
    const secao = searchParams.get('secao');
    if (userRole !== 'admin') return 'whatsapp';
    return secao === 'boletos' || secao === 'whatsapp' ? secao : 'api-keys';
  });

  const tabsConfig: TabConfig[] = [
    {
      id: 'api-keys',
      label: 'Chaves de API',
      icon: Key,
      description: 'Configure integrações com serviços externos',
      roles: ['admin'],
      content: <ApiKeysManagement />,
    },
    {
      id: 'prompts',
      label: 'Prompts',
      icon: MessageSquare,
      description: 'Gerencie prompts para processamento de IA',
      roles: ['admin'],
      content: <PromptsManagement />,
    },
    {
      id: 'boletos',
      label: 'Boletos por e-mail',
      icon: Mail,
      description: 'Boletos recebidos por e-mail viram contas a pagar',
      roles: ['admin'],
      content: <BoletosEmailManagement />,
    },
    {
      id: 'whatsapp',
      label: 'WhatsApp',
      icon: Smartphone,
      description: 'Status e QR code das conexões do WhatsApp da recepção',
      roles: ['admin', 'secretaria'],
      content: <WhatsAppConexoesManagement />,
    },
  ];
  const abasVisiveis = tabsConfig.filter((tab) => tab.roles.includes(userRole));

  return (
    <div className={cn('w-full space-y-6', className)}>
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        {/* A descrição de cada aba já é o título/descrição do card de baixo */}
        <TabsList>
          {abasVisiveis.map((tab) => {
            const IconComponent = tab.icon;
            return (
              <TabsTrigger key={tab.id} value={tab.id}>
                <IconComponent />
                {tab.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {abasVisiveis.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="mt-4">
            {tab.content}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

IntegrationsTemplate.displayName = 'IntegrationsTemplate';
