// AI dev note: Tela inicial do processo seletivo de estagiários.
// Acolhedora + expectativa de tempo/etapas + botão "Começar".

import React from 'react';
import { Button } from '@/components/primitives/button';
import { Clock, ListChecks, PenLine } from 'lucide-react';

interface EstagioWelcomeScreenProps {
  onStart: () => void;
}

export const EstagioWelcomeScreen = React.memo<EstagioWelcomeScreenProps>(
  ({ onStart }) => {
    return (
      <div className="w-full max-w-xl mx-auto flex flex-col items-center text-center space-y-8 py-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
        {/* Logo */}
        <div className="relative">
          <div className="absolute inset-0 bg-azul-respira/30 blur-2xl rounded-full animate-respira-pulse" />
          <div className="relative bg-card rounded-full p-6 shadow-lg">
            <img
              src="/images/logos/icone-respira-kids.png"
              alt="Respira Kids"
              className="h-20 w-20 md:h-24 md:w-24"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground leading-tight">
            Processo seletivo de estágio
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground">
            Que bom ter você por aqui! Este teste nos ajuda a te conhecer
            melhor.
          </p>
        </div>

        {/* Etapas */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
          <div className="flex flex-col items-center gap-2 px-4 py-4 rounded-2xl bg-azul-respira/10">
            <ListChecks className="w-6 h-6 text-azul-respira" />
            <span className="text-sm font-medium text-foreground">
              Situações do dia a dia
            </span>
          </div>
          <div className="flex flex-col items-center gap-2 px-4 py-4 rounded-2xl bg-verde-pipa/15">
            <PenLine className="w-6 h-6 text-roxo-titulo" />
            <span className="text-sm font-medium text-foreground">
              Duas perguntas abertas
            </span>
          </div>
          <div className="flex flex-col items-center gap-2 px-4 py-4 rounded-2xl bg-amarelo-pipa/20">
            <Clock className="w-6 h-6 text-roxo-titulo" />
            <span className="text-sm font-medium text-foreground">
              Cerca de 10 minutos
            </span>
          </div>
        </div>

        <p className="text-sm text-muted-foreground/80 max-w-md leading-relaxed">
          Não existe resposta &quot;decorada&quot;: responda com sinceridade, do
          jeito que você realmente agiria. 💙
        </p>

        <Button
          size="lg"
          onClick={onStart}
          className="w-full sm:w-auto min-w-[220px] h-14 text-base rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02]"
        >
          Começar
        </Button>
      </div>
    );
  }
);

EstagioWelcomeScreen.displayName = 'EstagioWelcomeScreen';
