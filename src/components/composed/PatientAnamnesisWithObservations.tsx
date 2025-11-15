import React, { useState } from 'react';
import { FileText, Lightbulb } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/primitives/tabs';
import { PatientAnamnesis } from './PatientAnamnesis';
import { PatientObservations } from './PatientObservations';
import { cn } from '@/lib/utils';

// AI dev note: PatientAnamnesisWithObservations - Component Composed com abas
// Combina anamnese e observações em um único componente com navegação por abas
// Reutiliza PatientAnamnesis e PatientObservations existentes

export interface PatientAnamnesisWithObservationsProps {
  patientId?: string;
  personId?: string;
  initialAnamnese?: string;
  initialObservations?: string;
  onUpdateAnamnese: (anamnese: string) => Promise<void>;
  onUpdateObservations: (observacoes: string) => Promise<void>;
  className?: string;
}

export const PatientAnamnesisWithObservations =
  React.memo<PatientAnamnesisWithObservationsProps>(
    ({
      patientId,
      personId,
      initialAnamnese = '',
      initialObservations = '',
      onUpdateAnamnese,
      onUpdateObservations,
      className,
    }) => {
      const actualId = patientId || personId;
      const [activeTab, setActiveTab] = useState<'anamnese' | 'observacoes'>(
        'anamnese'
      );

      if (!actualId) {
        return null;
      }

      return (
        <Card className={cn('w-full', className)}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Informações Clínicas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs
              value={activeTab}
              onValueChange={(value) =>
                setActiveTab(value as 'anamnese' | 'observacoes')
              }
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="anamnese" className="gap-2">
                  <FileText className="h-4 w-4" />
                  <span className="hidden sm:inline">Anamnese</span>
                  <span className="sm:hidden">Anamnese</span>
                </TabsTrigger>
                <TabsTrigger value="observacoes" className="gap-2">
                  <Lightbulb className="h-4 w-4" />
                  <span className="hidden sm:inline">Observações</span>
                  <span className="sm:hidden">Observações</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="anamnese" className="mt-0">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Registre informações detalhadas sobre a história clínica,
                    queixas principais e dados relevantes do paciente.
                  </p>
                  <PatientAnamnesis
                    patientId={actualId}
                    initialValue={initialAnamnese}
                    onUpdate={onUpdateAnamnese}
                    className="border-0 shadow-none p-0"
                  />
                </div>
              </TabsContent>

              <TabsContent value="observacoes" className="mt-0">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Registre preferências, características e observações
                    importantes da pessoa (paciente ou responsável).
                  </p>
                  <PatientObservations
                    patientId={actualId}
                    initialValue={initialObservations}
                    onUpdate={onUpdateObservations}
                    className="border-0 shadow-none p-0"
                  />
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      );
    }
  );

PatientAnamnesisWithObservations.displayName =
  'PatientAnamnesisWithObservations';
