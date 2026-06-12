import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PatientDetailsManager } from '@/components/domain/pacientes/PatientDetailsManager';

// AI dev note: PersonDetailsPage - Página para visualização de qualquer pessoa
// Reutiliza PatientDetailsManager adaptado para diferentes tipos de pessoa
// Navegação via /pessoa/:id para pacientes, responsáveis e profissionais

export const PersonDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const handleBack = () => {
    navigate(-1); // Volta para página anterior
  };

  if (!id) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive mb-4">
            Pessoa não encontrada
          </h1>
          <p className="text-muted-foreground mb-4">
            ID da pessoa não foi fornecido.
          </p>
          <button
            onClick={handleBack}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  return (
    // AI dev note: usar largura total (igual a PatientDetailsPage). Antes usava
    // `container mx-auto`, que centralizava e estreitava o conteúdo, deixando a
    // tela "cortada" com muito espaço vazio nos lados em telas largas.
    <div className="w-full max-w-none">
      <PatientDetailsManager
        personId={id}
        onBack={handleBack}
        className="w-full"
      />
    </div>
  );
};

export default PersonDetailsPage;
