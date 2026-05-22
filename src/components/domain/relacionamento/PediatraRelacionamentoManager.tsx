// AI dev note: Manager domain de relacionamento com pediatras
// Combina card + dialogs para uso direto no AdminDashboard

import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PediatraRelacionamentoCard } from '@/components/composed/PediatraRelacionamentoCard';
import { RegisterPediatraContactDialog } from '@/components/composed/RegisterPediatraContactDialog';
import type {
  PediatraRelacionamento,
  TipoContatoPediatra,
} from '@/types/pediatra-relacionamento';

export interface PediatraRelacionamentoManagerProps {
  className?: string;
  maxItems?: number;
}

export const PediatraRelacionamentoManager: React.FC<
  PediatraRelacionamentoManagerProps
> = ({ className, maxItems }) => {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<PediatraRelacionamento | null>(null);
  const [tipo, setTipo] = useState<TipoContatoPediatra>('contato_pediatra');
  const [refreshKey, setRefreshKey] = useState(0);

  const handleContact = useCallback((p: PediatraRelacionamento) => {
    setTipo('contato_pediatra');
    setSelected(p);
  }, []);

  const handleSendEvolution = useCallback((p: PediatraRelacionamento) => {
    setTipo('envio_evolucao_pediatra');
    setSelected(p);
  }, []);

  const handlePediatraClick = useCallback(
    (p: PediatraRelacionamento) => {
      navigate(`/pessoa/${p.pediatra_id}`);
    },
    [navigate]
  );

  const handleSuccess = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <>
      <PediatraRelacionamentoCard
        key={refreshKey}
        className={className}
        maxItems={maxItems}
        onPediatraClick={handlePediatraClick}
        onContactPediatra={handleContact}
        onSendEvolution={handleSendEvolution}
      />

      <RegisterPediatraContactDialog
        isOpen={selected !== null}
        onClose={() => setSelected(null)}
        pediatra={selected}
        defaultTipo={tipo}
        onSuccess={handleSuccess}
      />
    </>
  );
};

PediatraRelacionamentoManager.displayName = 'PediatraRelacionamentoManager';
