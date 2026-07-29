// AI dev note: Manual de Boas Práticas — módulo de conformidade sanitária.
// NÃO é base de conhecimento: a vigilância cobra a cadeia
//   documento vigente -> equipe treinada naquela versão -> registro de execução.
//
// Etapa atual: Levantamento (coleta da rotina real) e Pendências (ações concretas
// de adequação — licenciamento, tributário, estrutural, POPs a escrever, treinamento)
// estão funcionais. Documentos / Cronograma / Registros entram depois — o schema
// delas já está proposto em supabase/migrations/qualidade_manual_pops.sql.

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/primitives/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/primitives/tabs';
import {
  BookOpen,
  CalendarClock,
  ClipboardCheck,
  FileText,
  ListTodo,
  Lock,
} from 'lucide-react';
import { LevantamentoTab, PendenciasTab } from '@/components/domain/qualidade';

type ManualTab =
  | 'levantamento'
  | 'pendencias'
  | 'documentos'
  | 'cronograma'
  | 'registros';

export const ManualPage: React.FC = () => {
  const [tab, setTab] = useState<ManualTab>('levantamento');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">
          Manual de Boas Práticas
        </h1>
        <p className="text-muted-foreground mt-1">
          Manual, POPs, cronograma de limpeza e os registros que comprovam a
          rotina.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ManualTab)}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="levantamento" className="gap-2">
            <ClipboardCheck className="w-4 h-4" />
            Levantamento
          </TabsTrigger>
          <TabsTrigger value="pendencias" className="gap-2">
            <ListTodo className="w-4 h-4" />
            Pendências
          </TabsTrigger>
          <TabsTrigger value="documentos" className="gap-2">
            <FileText className="w-4 h-4" />
            Documentos
          </TabsTrigger>
          <TabsTrigger value="cronograma" className="gap-2">
            <CalendarClock className="w-4 h-4" />
            Cronograma
          </TabsTrigger>
          <TabsTrigger value="registros" className="gap-2">
            <BookOpen className="w-4 h-4" />
            Registros
          </TabsTrigger>
        </TabsList>

        <TabsContent value="levantamento" className="mt-4">
          <LevantamentoTab />
        </TabsContent>

        <TabsContent value="pendencias" className="mt-4">
          <PendenciasTab />
        </TabsContent>

        <TabsContent value="documentos" className="mt-4">
          <EmBreve
            titulo="Manual e POPs versionados"
            descricao="Cada documento com código, versão vigente, RT que aprovou e data da próxima revisão — mais o PDF pra imprimir e deixar físico na clínica."
            desbloqueio="Entra quando o levantamento fechar: é ele que dá o conteúdo dos POPs."
          />
        </TabsContent>

        <TabsContent value="cronograma" className="mt-4">
          <EmBreve
            titulo="Cronograma de limpeza"
            descricao="As tarefas recorrentes (por sessão, diária, semanal, mensal) vinculadas ao POP que descreve como fazer."
            desbloqueio="Depende das respostas do bloco J — a sequência real da biossegurança pós-sessão."
          />
        </TabsContent>

        <TabsContent value="registros" className="mt-4">
          <EmBreve
            titulo="Registros de execução"
            descricao="O checklist que a estagiária preenche no tablet, gravado por data e por sessão. É o primeiro documento que a fiscalização pede."
            desbloqueio="Entra junto com o cronograma."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

interface EmBreveProps {
  titulo: string;
  descricao: string;
  desbloqueio: string;
}

const EmBreve: React.FC<EmBreveProps> = ({
  titulo,
  descricao,
  desbloqueio,
}) => (
  <Card className="bg-bege-fundo/30 border-azul-respira/20">
    <CardContent className="p-8 text-center space-y-3 max-w-xl mx-auto">
      <Lock className="w-10 h-10 text-azul-respira mx-auto" />
      <p className="text-base font-semibold text-foreground">{titulo}</p>
      <p className="text-sm text-muted-foreground leading-relaxed">
        {descricao}
      </p>
      <p className="text-xs text-muted-foreground/80 border-t border-border/60 pt-3">
        {desbloqueio}
      </p>
    </CardContent>
  </Card>
);

export default ManualPage;
