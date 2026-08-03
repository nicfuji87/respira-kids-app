// AI dev note: Página Cobranças (admin + secretaria) — canal MANUAL de cobrança
// pelo WhatsApp. Nasceu porque a API (não oficial) de WhatsApp usada pelo n8n
// cai, e com ela param os avisos automáticos de cobrança e inadimplência.
//
// É deliberadamente SEPARADA do /financeiro: aquela tela pede PIN e mostra
// receita, comissão e totais que não são da secretaria. Aqui só aparece o
// necessário para cobrar — paciente, responsável, valor, vencimento e o botão.
// Por isso esta rota não tem PIN.

import React from 'react';
import { MessageCircle } from 'lucide-react';
import { CobrancasPendentesList } from '@/components/composed/CobrancasPendentesList';

export const CobrancasPage: React.FC = () => {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <MessageCircle className="h-6 w-6 text-rosa-suave" />
          Cobranças
        </h1>
        <p className="text-sm text-muted-foreground">
          Cobranças em aberto para enviar pelo WhatsApp. O botão abre a conversa
          do responsável com a mensagem pronta — é só conferir e enviar.
        </p>
      </div>

      <CobrancasPendentesList />
    </div>
  );
};

CobrancasPage.displayName = 'CobrancasPage';
