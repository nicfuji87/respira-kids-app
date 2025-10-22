import React from 'react';
import { PublicPageLayout } from '@/components/templates/PublicPageLayout';
import { AddFinancialResponsibleSteps } from '@/components/domain/financial-responsible/AddFinancialResponsibleSteps';

// AI dev note: AddFinancialResponsiblePage - Página pública de cadastro de responsável financeiro
// Acessível sem autenticação, mobile-first, fluxo step-by-step

export const AddFinancialResponsiblePage: React.FC = () => {
  return (
    <PublicPageLayout title="Adicionar Responsável Financeiro">
      <AddFinancialResponsibleSteps />
    </PublicPageLayout>
  );
};
