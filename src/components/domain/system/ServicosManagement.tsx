import React, { useState } from 'react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/primitives/tabs';
import { Settings, Percent } from 'lucide-react';
import { TipoServicosManagement } from './TipoServicosManagement';
import { ComissaoManagement } from './ComissaoManagement';

// AI dev note: ServicosManagement combina gerenciamento de tipos de serviços e comissões
// Substitui TipoServicosManagement para incluir configuração de comissões na mesma seção

export const ServicosManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState('tipos-servico');

  return (
    <div className="space-y-6">
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-6"
      >
        <TabsList>
          <TabsTrigger
            value="tipos-servico"
            className="flex items-center gap-2"
          >
            <Settings className="h-4 w-4" />
            Tipos de Serviço
          </TabsTrigger>
          <TabsTrigger value="comissoes" className="flex items-center gap-2">
            <Percent className="h-4 w-4" />
            Comissões
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tipos-servico" className="space-y-4">
          <TipoServicosManagement />
        </TabsContent>

        <TabsContent value="comissoes" className="space-y-4">
          <ComissaoManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
};
