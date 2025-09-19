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
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Gerenciamento de Serviços
        </h2>
        <p className="text-muted-foreground">
          Configure os tipos de serviços oferecidos e as comissões dos
          profissionais
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-6"
      >
        <TabsList className="grid w-full max-w-md grid-cols-2">
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
