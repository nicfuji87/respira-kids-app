import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { PatientSelect } from '@/components/composed/PatientSelect';

// AI dev note: PacientesPage simplificada - usa PatientSelect para busca e navegação
// Layout full-width sem métricas, focado na funcionalidade principal

export const PacientesPage: React.FC = () => {
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const navigate = useNavigate();

  const handlePatientSelect = (patientId: string) => {
    setSelectedPatientId(patientId);
    // Navegar para página de detalhes do paciente
    navigate(`/pacientes/${patientId}`);
  };

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

      {/* Busca de pacientes */}
      <div className="w-full">
        <PatientSelect
          value={selectedPatientId}
          onValueChange={handlePatientSelect}
          placeholder="Digite o nome do paciente para buscar..."
          className="w-full max-w-2xl"
        />
      </div>
    </div>
  );
};
