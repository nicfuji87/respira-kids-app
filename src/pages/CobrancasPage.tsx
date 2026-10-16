// AI dev note: Página Cobranças (admin + secretaria) — canal MANUAL de cobrança
// pelo WhatsApp. Nasceu porque a API (não oficial) de WhatsApp usada pelo n8n
// cai, e com ela param os avisos automáticos de cobrança e inadimplência.
//
// É deliberadamente SEPARADA do /financeiro: aquela tela pede PIN e mostra
// receita, comissão e totais que não são da secretaria. Aqui só aparece o
// necessário para cobrar — paciente, responsável, valor, vencimento e o botão.
// Por isso esta rota não tem PIN.

import React from 'react';
import { CobrancasPendentesList } from '@/components/composed/CobrancasPendentesList';
import { PageHeader } from '@/components/composed/PageHeader';

export const CobrancasPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <PageHeader description="Cobranças em aberto. O botão abre o WhatsApp do responsável com a mensagem pronta." />

      <CobrancasPendentesList />
    </div>
  );
};

CobrancasPage.displayName = 'CobrancasPage';
