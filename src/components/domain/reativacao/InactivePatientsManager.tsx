// AI dev note: Manager domain de pacientes inativos
// Combina worklist + dialogs (contato e gerenciamento) em um único bloco usável em dashboards

import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { InactivePatientsCard } from '@/components/composed/InactivePatientsCard';
import { ContactInactivePatientDialog } from '@/components/composed/ContactInactivePatientDialog';
import { ManageInactivePatientDialog } from '@/components/composed/ManageInactivePatientDialog';
import type { InactivePatient } from '@/types/inatividade';

export interface InactivePatientsManagerProps {
  className?: string;
  maxItems?: number;
}

export const InactivePatientsManager: React.FC<
  InactivePatientsManagerProps
> = ({ className, maxItems }) => {
  const navigate = useNavigate();
  const [contactPatient, setContactPatient] = useState<InactivePatient | null>(
    null
  );
  const [managePatient, setManagePatient] = useState<InactivePatient | null>(
    null
  );
  const [refreshKey, setRefreshKey] = useState(0);

  const handlePatientClick = useCallback(
    (p: InactivePatient) => {
      navigate(`/pacientes/${p.id}`);
    },
    [navigate]
  );

  const handleSuccess = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <>
      <InactivePatientsCard
        key={refreshKey}
        className={className}
        maxItems={maxItems}
        onPatientClick={handlePatientClick}
        onContactPatient={setContactPatient}
        onManagePatient={setManagePatient}
      />

      <ContactInactivePatientDialog
        isOpen={contactPatient !== null}
        onClose={() => setContactPatient(null)}
        patient={contactPatient}
        onSuccess={handleSuccess}
      />

      <ManageInactivePatientDialog
        isOpen={managePatient !== null}
        onClose={() => setManagePatient(null)}
        patient={managePatient}
        onSuccess={handleSuccess}
      />
    </>
  );
};

InactivePatientsManager.displayName = 'InactivePatientsManager';
