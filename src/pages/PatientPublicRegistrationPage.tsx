import React, { useCallback } from 'react';
import { PublicPageLayout } from '@/components/templates/PublicPageLayout';
import { PatientRegistrationSteps } from '@/components/domain/patient/PatientRegistrationSteps';
import { useToast } from '@/components/primitives/use-toast';

// AI dev note: PatientPublicRegistrationPage - Página pública de cadastro de paciente
// Acessível sem autenticação, mobile-first, fluxo step-by-step

export const PatientPublicRegistrationPage: React.FC = () => {
  const { toast } = useToast();

  const handleRegistrationComplete = useCallback(() => {
    // TODO: Implementar próximas etapas do cadastro

    toast({
      title: 'WhatsApp validado!',
      description: 'Primeira etapa concluída com sucesso.',
      variant: 'default',
    });

    // TODO: Redirecionar para próxima etapa quando implementada
  }, [toast]);

  // TODO: Implementar handleCancel quando houver navegação entre etapas

  return (
    <PublicPageLayout title="Cadastro de Paciente">
      <PatientRegistrationSteps onComplete={handleRegistrationComplete} />
    </PublicPageLayout>
  );
};
