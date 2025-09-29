import React from 'react';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { PatientsList } from '@/components/composed/PatientsList';

// AI dev note: PacientesPage atualizada - usa PatientsList com paginação de 20 itens
// Lista completa de pacientes com busca integrada e navegação para detalhes

export const PacientesPage: React.FC = () => {
  const handleNewPatient = () => {
    // TODO: Implementar criação de novo paciente
    console.log('Criando novo paciente');
  };

  return (
    <div className="w-full max-w-none space-y-6">
      {/* Header com ações */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Pacientes</h1>
          <p className="text-muted-foreground">
            Gerencie seus pacientes e histórico de atendimentos
          </p>
        </div>
        <Button onClick={handleNewPatient}>
          <UserPlus className="h-4 w-4 mr-2" />
          Novo Paciente
        </Button>
      </div>

      {/* Lista paginada de pacientes */}
      <PatientsList className="w-full" />
    </div>
  );
};
