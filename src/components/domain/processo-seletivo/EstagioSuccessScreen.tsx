// AI dev note: Tela final do processo seletivo. Agradece + explica próximos passos.

import React from 'react';
import { CheckCircle2 } from 'lucide-react';

export const EstagioSuccessScreen = React.memo(() => {
  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center text-center space-y-8 py-6 animate-in fade-in slide-in-from-bottom-3 duration-700">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-verde-pipa/40 blur-3xl animate-respira-pulse" />
        <div className="relative bg-card rounded-full p-8 shadow-xl">
          <CheckCircle2
            className="w-20 h-20 md:w-24 md:h-24 text-verde-pipa"
            strokeWidth={1.5}
          />
        </div>
      </div>

      <div className="space-y-3 max-w-lg">
        <h1 className="text-3xl md:text-4xl font-bold text-foreground leading-tight">
          Recebemos sua candidatura!
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
          Obrigada por dedicar seu tempo. Nossa equipe vai analisar suas
          respostas com carinho e, se fizer sentido, entramos em contato pelo
          WhatsApp ou e-mail que você informou. 💙
        </p>
      </div>

      <p className="text-xs text-muted-foreground/70 max-w-sm">
        Você já pode fechar esta página.
      </p>
    </div>
  );
});

EstagioSuccessScreen.displayName = 'EstagioSuccessScreen';
