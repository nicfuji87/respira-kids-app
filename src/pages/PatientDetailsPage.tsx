import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PatientDetailsManager } from '@/components/domain/pacientes/PatientDetailsManager';

// AI dev note: PatientDetailsPage - Página de detalhes do paciente
// Usa useParams para pegar ID da URL e PatientDetailsManager para exibir dados

export const PatientDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const handleBack = () => {
    navigate('/pacientes');
  };

  if (!id) {
    return (
      <div className="w-full max-w-none py-8">
        <div className="text-center">
          <p className="text-destructive">ID do paciente não fornecido</p>
          <button
            onClick={handleBack}
            className="mt-4 text-primary hover:underline"
          >
            Voltar para lista de pacientes
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-none">
      <PatientDetailsManager
        patientId={id}
        onBack={handleBack}
        className="w-full"
      />
    </div>
  );
};
