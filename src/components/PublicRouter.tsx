import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PatientPublicRegistrationPage } from '@/pages/PatientPublicRegistrationPage';
import { PatientRegistrationSuccessPage } from '@/pages/public/PatientRegistrationSuccessPage';
import { AddFinancialResponsiblePage } from '@/pages/AddFinancialResponsiblePage';
import { SharedSchedulePage } from '@/pages/SharedSchedulePage';
import { PagamentoPublicoPage } from '@/pages/PagamentoPublicoPage';
import { PesquisaExperienciaPage } from '@/pages/PesquisaExperienciaPage';
import { ProcessoSeletivoPage } from '@/pages/ProcessoSeletivoPage';
import { Toaster } from '@/components/primitives/toaster';

// AI dev note: PublicRouter - Roteamento para páginas públicas (sem autenticação)
// Separado do AppRouter para manter rotas autenticadas isoladas
// Inclui rota de agenda compartilhada via token

export const PublicRouter: React.FC = () => {
  console.log(
    '🌐 [PublicRouter] Inicializado. Hash atual:',
    window.location.hash
  );

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

        {/* Rota de adicionar responsável financeiro */}
        <Route
          path="/adicionar-responsavel-financeiro"
          element={<AddFinancialResponsiblePage />}
        />

        {/* Rota de agenda compartilhada (pública via token) */}
        <Route path="/agenda-publica/:token" element={<SharedSchedulePage />} />

        {/* Rota pública de pagamento (PIX x Cartão via token) */}
        <Route path="/pagamento/:token" element={<PagamentoPublicoPage />} />

        {/* Pesquisa de Experiência pública e anônima */}
        <Route path="/experiencia" element={<PesquisaExperienciaPage />} />

        {/* Processo seletivo de estagiários (teste público) */}
        <Route path="/vaga-estagio" element={<ProcessoSeletivoPage />} />

        {/* Redirect padrão APENAS para root */}
        <Route
          path="/"
          element={<Navigate to="/cadastro-paciente" replace />}
        />
      </Routes>

      {/* Toast notifications */}
      <Toaster />
    </HashRouter>
  );
};
