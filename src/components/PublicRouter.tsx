import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PatientPublicRegistrationPage } from '@/pages/PatientPublicRegistrationPage';
import { PatientRegistrationSuccessPage } from '@/pages/public/PatientRegistrationSuccessPage';
import { Toaster } from '@/components/primitives/toaster';

// AI dev note: PublicRouter - Roteamento para páginas públicas (sem autenticação)
// Separado do AppRouter para manter rotas autenticadas isoladas

export const PublicRouter: React.FC = () => {
  return (
    <HashRouter>
      <Routes>
        {/* Rota de cadastro público de paciente */}
        <Route
          path="/cadastro-paciente"
          element={<PatientPublicRegistrationPage />}
        />

        {/* Rota de sucesso após cadastro */}
        <Route
          path="/cadastro-paciente/sucesso"
          element={<PatientRegistrationSuccessPage />}
        />

        {/* Redirect padrão */}
        <Route
          path="*"
          element={<Navigate to="/cadastro-paciente" replace />}
        />
      </Routes>

      {/* Toast notifications */}
      <Toaster />
    </HashRouter>
  );
};
