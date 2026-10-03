// AI dev note: Página /reativacao (admin + secretaria) — tirada do Dashboard
// porque lá ficava quatro rolagens abaixo no celular e passava despercebida.
// Junta as duas rotinas de contato da secretaria: trazer paciente parado de
// volta e convidar família para a pesquisa de experiência.

import React from 'react';
import { PhoneCall } from 'lucide-react';
import { InactivePatientsManager } from '@/components/domain/reativacao';
import { PesquisaConvitesManager } from '@/components/domain/pesquisa-experiencia/PesquisaConvitesManager';

export const ReativacaoPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <PhoneCall className="h-6 w-6 text-rosa-suave" />
          Reativação
        </h1>
        <p className="text-muted-foreground">
          Contato com famílias de pacientes parados e convites da pesquisa de
          experiência
        </p>
      </div>

      <InactivePatientsManager maxItems={25} />
      <PesquisaConvitesManager maxItems={20} />
    </div>
  );
};

ReativacaoPage.displayName = 'ReativacaoPage';
