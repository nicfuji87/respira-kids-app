// AI dev note: Página /rotina (admin + secretaria). A secretária vê só "Hoje": o que fazer
// em cada parte do dia, a tarefa da semana, as do mês que estão vencendo e as metas dela
// com a cota de hoje. O admin vê também o acompanhamento e edita as tarefas.
// Nada daqui manda WhatsApp (decisão do dono, 09/11/2026).

import React from 'react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/primitives/tabs';
import { PageHeader } from '@/components/composed/PageHeader';
import { RotinaHoje } from '@/components/domain/rotina/RotinaHoje';
import { RotinaAcompanhamento } from '@/components/domain/rotina/RotinaAcompanhamento';
import { RotinaTarefasEditor } from '@/components/domain/rotina/RotinaTarefasEditor';
import { useAuth } from '@/hooks/useAuth';

export const RotinaPage: React.FC = () => {
  const { user } = useAuth();
  const ehAdmin = user?.pessoa?.role === 'admin';

  if (!ehAdmin) {
    return (
      <div className="space-y-4">
        <PageHeader description="O que fazer hoje na recepção, na ordem do dia." />
        <RotinaHoje />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader description="Rotina da recepção: o dia de hoje, o acompanhamento e as tarefas." />
      <Tabs defaultValue="hoje">
        <TabsList>
          <TabsTrigger value="hoje">Hoje</TabsTrigger>
          <TabsTrigger value="acompanhamento">Acompanhamento</TabsTrigger>
          <TabsTrigger value="tarefas">Tarefas</TabsTrigger>
        </TabsList>
        <TabsContent value="hoje" className="mt-4">
          <RotinaHoje />
        </TabsContent>
        <TabsContent value="acompanhamento" className="mt-4">
          <RotinaAcompanhamento />
        </TabsContent>
        <TabsContent value="tarefas" className="mt-4">
          <RotinaTarefasEditor />
        </TabsContent>
      </Tabs>
    </div>
  );
};

RotinaPage.displayName = 'RotinaPage';
