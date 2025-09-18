import React, { Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarTemplateWithData } from '@/components/templates';
import { useAuth } from '@/hooks/useAuth';

// AI dev note: AgendaPage simplificada - apenas calendário sem headers ou estatísticas
export const AgendaPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleEventClick = () => {};

  const handleEventSave = () => {};

  const handleEventDelete = () => {};

  // Handlers para navegação para detalhes de pessoas
  const handlePatientClick = (patientId: string | null) => {
    if (patientId) {
      navigate(`/pessoa/${patientId}`);
    }
  };

  const handleProfessionalClick = (professionalId: string) => {
    navigate(`/pessoa/${professionalId}`);
  };

  // Error state
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <p className="text-muted-foreground">
            Não foi possível carregar a agenda.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Verifique sua conexão e tente novamente.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-hidden">
      {/* Calendário integrado com dados reais - expandido para toda largura e altura */}
      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-96">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        }
      >
        <CalendarTemplateWithData
          responsive={true}
          onEventClick={handleEventClick}
          onEventSave={handleEventSave}
          onEventDelete={handleEventDelete}
          onPatientClick={handlePatientClick}
          onProfessionalClick={handleProfessionalClick}
          className="w-full max-w-none h-full"
        />
      </Suspense>
    </div>
  );
};
